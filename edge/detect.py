"""
SmartRoad — Edge Detection Engine
===================================
Pipeline:
  Camera (phone/Pi/webcam/RTSP/video file)
    └─► Frame buffer (thread-safe)
          ├─► YOLO inference thread  ──► upload_report → server → DB → notify
          └─► MJPEG stream thread    ──► /stream endpoint → dashboard Live tab

Camera sources:
  0           = local webcam
  1,2,...     = USB camera index
  "http://..."  = IP Webcam (Android) or DroidCam
  "rtsp://..."  = RTSP stream (any IP camera)
  "video.mp4"   = video file (for testing)

Usage:
  # Webcam
  python -m edge.detect

  # Android phone via IP Webcam app (free on Play Store)
  python -m edge.detect --source "http://192.168.1.42:8080/video"

  # DroidCam
  python -m edge.detect --source "http://192.168.1.42:4747/video"

  # RTSP
  python -m edge.detect --source "rtsp://user:pass@192.168.1.42/stream"

  # Custom model + server
  python -m edge.detect --model path/to/best.pt --server http://my-server.com
"""

import argparse
import base64
import queue
import sys
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import json
import socket
import urllib.request

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTPServer that handles each request in its own thread."""
    daemon_threads = True

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ultralytics import YOLO
from edge.hal.gps import GPS
import edge.uploader as uploader


#   Config  
DEFAULT_MODEL   = r"e:\Pothole\pretrained\rdd\best.pt"
CONFIDENCE = 0.35
INFER_EVERY_N = 5        # run YOLO every N frames (saves CPU on Pi)
COOLDOWN_SEC = 3.0      # min seconds between uploads of same defect class
STREAM_PORT = 8080
STREAM_FPS = 15       # max MJPEG stream fps
STREAM_WIDTH     = 640
STREAM_HEIGHT   = 360
STREAM_QUALITY  = 72       # JPEG quality for stream (0–100)
UPLOAD_QUALITY  = 82       # JPEG quality for server upload

# SmartRoad class map
SMARTROAD_CLASSES = {
    0: "pothole", 1: "road_crack", 2: "broken_footpath",
    3: "broken_pole", 4: "garbage_dump", 5: "waterlogging",
}

MODEL_CLASS_REMAP = {
    # RDD2022 labels
    "Pothole": "pothole", "pothole": "pothole",
    "alligator crack": "road_crack", "transverse crack": "road_crack",
    "longitudinal crack": "road_crack", "other corruption": "road_crack",
    # Generic index fallback
    "0": "pothole", "1": "road_crack", "2": "broken_footpath",
    "3": "broken_pole", "4": "garbage_dump", "5": "waterlogging",
}

CLASS_COLORS = {
    "pothole": (0, 0, 255), "road_crack": (0, 165, 255),
    "broken_footpath": (0, 255, 255), "broken_pole": (255, 0, 0),
    "garbage_dump": (0, 128, 0), "waterlogging": (255, 255, 0),
}

#   Shared state (thread-safe)  
_frame_lock = threading.Lock()
_latest_jpeg      = None          # bytes — latest JPEG for MJPEG stream
_model            = None          # loaded YOLO model (set after run() loads it)
_stream_meta     = {
    "active": False, "fps": 0.0, "lat": None, "lon": None,
    "reports_sent": 0, "detections": [],
    "frame_count": 0, "start_time": time.time(),
    "lan_ip": None, "port": None, "gui_url": None, "stream_url": None,
    "server_url": None,          # so mobile UI knows where to upload reports
}
_upload_queue    = queue.Queue(maxsize=20)   # (payload_dict) — async uploads


#   Frame drawing  
def draw_detections(frame, boxes_info, fps=0.0, lat=None, lon=None):
    """Overlay bounding boxes + HUD on frame."""
    out = frame.copy()
    for (x1, y1, x2, y2), name, conf in boxes_info:
        color = CLASS_COLORS.get(name, (180, 180, 180))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        label = f"{name.replace('_', ' ')} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
        cv2.rectangle(out, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(out, label, (x1 + 2, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)

    # HUD: timestamp + fps + gps
    ts = time.strftime("%H:%M:%S")
    gps_str = f" | {lat:.5f},{lon:.5f}" if lat and lon else ""
    hud = f"SmartRoad | {ts} | {fps:.1f}fps{gps_str}"
    cv2.putText(out, hud, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return out


#   MJPEG stream  
def _push_frame(frame, detections=None, lat=None, lon=None, fps=0.0, reports=0):
    """Encode frame → JPEG and update shared buffer. Called from detection thread."""
    global _latest_jpeg
    small = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
    ok, buf = cv2.imencode(
        ".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, STREAM_QUALITY]
    )
    if not ok:
        return
    with _frame_lock:
        _latest_jpeg = buf.tobytes()
        _stream_meta.update({
            "active": True,
            "fps": round(fps, 1),
            "lat": lat, "lon": lon,
            "reports_sent": reports,
            "detections": detections or [],
        })


class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # silence access log

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self._cors()
            self.end_headers()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def do_GET(self):
        try:
            if self.path in ("/", "/index.html"):
                self._serve_index()
            elif self.path == "/stream":
                self._serve_stream()
            elif self.path == "/info":
                self._serve_info()
            elif self.path == "/health":
                self.send_response(200); self._cors(); self.end_headers()
                self.wfile.write(b"ok")
            elif self.path == "/snapshot":
                self._serve_snapshot()
            else:
                self.send_response(404); self.end_headers()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def do_POST(self):
        """POST /analyze  — run YOLO on a submitted JPEG frame."""
        try:
            if self.path != "/analyze":
                self.send_response(404); self.end_headers(); return

            global _model
            if _model is None:
                self._json_response({"error": "Model not loaded yet"}, 503); return

            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length).decode())

            # Decode image
            img_b64 = body.get("image_b64", "")
            img_bytes = base64.b64decode(img_b64)
            arr = np.frombuffer(img_bytes, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                self._json_response({"error": "Invalid image"}, 400); return

            lat = body.get("lat")
            lon = body.get("lon")
            conf_thresh = float(body.get("conf", CONFIDENCE))

            # Run YOLO
            results   = _model(frame, verbose=False, conf=conf_thresh)
            boxes     = results[0].boxes
            detections = []
            boxes_info = []

            for box in boxes:
                cls_id = int(box.cls[0])
                name   = _model.names.get(cls_id, str(cls_id))
                conf_v = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                detections.append({
                    "class":      name,
                    "confidence": round(conf_v, 3),
                    "bbox":       [x1, y1, x2, y2],
                })
                boxes_info.append(((x1, y1, x2, y2), name, conf_v))

            # Draw + return annotated image
            annotated = draw_detections(frame, boxes_info, lat=lat, lon=lon)
            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
            annotated_b64 = base64.b64encode(buf).decode()

            self._json_response({
                "detections":     detections,
                "annotated_b64":  annotated_b64,
                "lat": lat, "lon": lon,
            })

        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                self._json_response({"error": str(e)}, 500)
            except Exception:
                pass

    def _json_response(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _serve_index(self):
        """Serve the mobile camera control UI from edge/mobile_ui.html."""
        html_path = os.path.join(os.path.dirname(__file__), "mobile_ui.html")
        try:
            with open(html_path, "rb") as f:
                html = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self._cors()
            self.end_headers()
            self.wfile.write(html)
        except FileNotFoundError:
            self.send_response(404); self.end_headers()
            self.wfile.write(b"mobile_ui.html not found")
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _serve_stream(self):
        try:
            self.send_response(200)
            self.send_header("Content-Type",
                             "multipart/x-mixed-replace; boundary=frame")
            self._cors()
            self.end_headers()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            return
        interval = 1.0 / STREAM_FPS
        while True:
            try:
                with _frame_lock:
                    frame = _latest_jpeg
                if frame:
                    self.wfile.write(
                        b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                        + frame + b"\r\n"
                    )
                    self.wfile.flush()
                time.sleep(interval)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
                break  # client disconnected — exit cleanly

    def _serve_info(self):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            with _frame_lock:
                data = dict(_stream_meta)
            self.wfile.write(json.dumps(data).encode())
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _serve_snapshot(self):
        """Return a single JPEG snapshot."""
        try:
            with _frame_lock:
                frame = _latest_jpeg
            if not frame:
                self.send_response(503); self.end_headers(); return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self._cors()
            self.end_headers()
            self.wfile.write(frame)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass


def _get_local_ip() -> str:
    """Return the machine's LAN IP (the one phones on same WiFi can reach)."""
    try:
        # Trick: connect UDP to 8.8.8.8 — no data sent, but OS picks the right interface
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def _start_stream_server(port: int):
    """Start threaded MJPEG HTTP server — each client gets its own thread."""
    srv = ThreadingHTTPServer(("0.0.0.0", port), MJPEGHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True,
                         name="mjpeg-server")
    t.start()
    lan_ip = _get_local_ip()
    # Store in shared meta so /info returns it (Settings page reads this)
    with _frame_lock:
        _stream_meta["lan_ip"]     = lan_ip
        _stream_meta["port"]       = port
        _stream_meta["gui_url"]    = f"http://{lan_ip}:{port}/"
        _stream_meta["stream_url"] = f"http://{lan_ip}:{port}/stream"
    print(f"[Stream] ─────────────────────────────────────")
    print(f"[Stream] 📱 Open on phone  → http://{lan_ip}:{port}/")
    print(f"[Stream] 💻 Local browser  → http://localhost:{port}/")
    print(f"[Stream] 🎥 MJPEG stream   → http://{lan_ip}:{port}/stream")
    print(f"[Stream] ─────────────────────────────────────")

# ── Async upload worker ───────────────────────────────────────────────────────
def _upload_worker():
    """Background thread — drains the upload queue without blocking detection."""
    while True:
        try:
            task = _upload_queue.get(timeout=5)
            if task is None:
                break  # poison pill — exit
            uploader.upload_report(**task)
        except queue.Empty:
            continue
        except Exception as e:
            print(f"[Upload] Worker error: {e}")


def _enqueue_upload(**kwargs):
    """Non-blocking: drop upload into queue. Skip if queue is full."""
    try:
        _upload_queue.put_nowait(kwargs)
    except queue.Full:
        print("[Upload] Queue full — report dropped (server too slow?)")


def _fetch_server_config(server_url: str) -> dict:
    """Fetch edge config from server. Returns {} on failure (use CLI defaults)."""
    try:
        req = urllib.request.Request(
            f"{server_url}/api/config",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            print(f"[Config] Loaded from server: source={data.get('cameraSource')} "
                  f"conf={data.get('confidence')} inferEvery={data.get('inferEvery')}")
            return data
    except Exception as e:
        print(f"[Config] Could not reach server ({e}) — using CLI defaults")
        return {}


#   Camera source helper  
def _open_camera(source):
    """Open any camera source. Returns cv2.VideoCapture."""
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera source: {source!r}")

    # For phone IP cameras  
    if isinstance(source, str) and source.startswith("http"):
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        print(f"[Camera] IP camera source: {source}")
        print("[Camera] Tip: Set IP Webcam app to 640x480, 15fps for best results")
    elif isinstance(source, int):
        print(f"[Camera] Local camera index: {source}")
    else:
        print(f"[Camera] Source: {source}")

    return cap


#   Main detection loop  
def run(args):
    uploader.SERVER_URL = args.server

    # Fetch config from server (overrides CLI defaults for camera/model/conf)
    srv_cfg = _fetch_server_config(args.server)
    # Apply server config — CLI flags still take priority if user set them
    if srv_cfg.get("cameraSource") and str(args.source) == "0":
        args.source = srv_cfg["cameraSource"]
        print(f"[Config] Using server camera source: {args.source}")
    if srv_cfg.get("confidence") and args.conf == CONFIDENCE:
        args.conf = float(srv_cfg["confidence"])
    if srv_cfg.get("inferEvery") and args.infer_every == INFER_EVERY_N:
        args.infer_every = int(srv_cfg["inferEvery"])
    if srv_cfg.get("uploadEnabled") is False:
        args.upload = False
    #  Start async upload worker
    upload_thread = threading.Thread(target=_upload_worker, daemon=True,
                                     name="upload-worker")
    upload_thread.start()

    #  Start MJPEG stream server
    _start_stream_server(args.stream_port)

    #  Load YOLO model
    print(f"[Detect] Loading model: {args.model}")
    _yolo = YOLO(args.model)
    global _model
    _model = _yolo          # expose to /analyze endpoint immediately after load
    print(f"[Detect] Model loaded ✔ — {len(_yolo.names)} classes: "
          f"{list(_yolo.names.values())}")

    # Store server URL in meta so mobile UI can upload reports directly
    with _frame_lock:
        _stream_meta["server_url"] = args.server

    #  Init GPS
    gps = GPS(mock_coords=(28.6139, 77.2090))
    gps.start()

    #  Open camera
    cap = _open_camera(args.source)

    # State
    frame_count = 0
    report_count   = 0
    last_report_ts = {}      
    fps = 0.0
    fps_frame_cnt  = 0
    fps_t0 = time.time()

    print(f"\n[Detect] Pipeline running")
    print(f"[Detect] Inference every {INFER_EVERY_N} frames | conf >= {args.conf}")
    print(f"[Detect] Upload: {'YES' if args.upload else 'NO'}")
    print(f"[Detect] Preview: {'YES' if args.preview else 'NO (headless)'}")
    print("[Detect] Press Ctrl+C or Q to stop\n")

    FAIL_LIMIT    = 30    # give up after N consecutive read failures
    fail_streak   = 0

    try:
        while True:
            ret, raw_frame = cap.read()
            if not ret:
                fail_streak += 1
                if fail_streak >= FAIL_LIMIT:
                    print(f"[Detect] ❌ Camera source unreachable after {FAIL_LIMIT} attempts.")
                    print(f"[Detect]    Source: {args.source!r}")
                    print(f"[Detect]    → Go to Settings tab and configure your camera source, then restart.")
                    break
                # For video files → loop back to start
                if isinstance(args.source, str) and not args.source.startswith("http"):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    fail_streak = 0
                    continue
                time.sleep(0.1)
                continue
            fail_streak = 0   # reset on success

            frame_count  += 1
            fps_frame_cnt += 1
            annotated     = raw_frame
            detections    = []

            # Rolling FPS (update every second)
            elapsed = time.time() - fps_t0
            if elapsed >= 1.0:
                fps           = fps_frame_cnt / elapsed
                fps_frame_cnt = 0
                fps_t0        = time.time()

            lat, lon = gps.location()

            #   YOLO inference           
            if frame_count % args.infer_every == 0:
                results = _model(raw_frame, verbose=False, conf=args.conf)
                boxes_info = []

                for box in results[0].boxes:
                    cls_id  = int(box.cls[0])
                    conf    = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])

                    raw_name = model.names[cls_id]
                    name     = MODEL_CLASS_REMAP.get(
                                   raw_name,
                                   MODEL_CLASS_REMAP.get(str(cls_id), raw_name)
                               )
                    boxes_info.append(((x1, y1, x2, y2), name, conf))
                    detections.append({"class": name, "confidence": round(conf, 3)})

                    # Cooldown 
                    now = time.time()
                    if now - last_report_ts.get(name, 0) < COOLDOWN_SEC:
                        continue
                    last_report_ts[name] = now

                    print(f"[Detect] {name} ({conf:.2f}) @ ({lat:.5f}, {lon:.5f})")

                    #   Async upload  
                    if args.upload:
                        # Encode frame for upload 
                        _, buf = cv2.imencode(
                            ".jpg", raw_frame,
                            [cv2.IMWRITE_JPEG_QUALITY, UPLOAD_QUALITY]
                        )
                        img_b64 = base64.b64encode(buf).decode("utf-8")

                        _enqueue_upload(
                            class_id   = cls_id,
                            class_name = name,
                            confidence = conf,
                            lat = lat,
                            lon = lon,
                            image_b64  = img_b64,
                            bbox       = (x1, y1, x2, y2),
                            source = "edge",
                        )
                        report_count += 1


                # Draw after all boxes collected
                annotated = draw_detections(
                    raw_frame, boxes_info, fps=fps, lat=lat, lon=lon
                )

            #   Push to MJPEG stream  
            _push_frame(
                frame  = annotated,
                detections = detections,
                lat = lat,
                lon = lon,
                fps = fps,
                reports    = report_count,
            )

            #   Optional local preview  
            if args.preview:
                cv2.imshow("SmartRoad — Live Detection", annotated)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    print("[Detect] Quit by user")
                    break

    except KeyboardInterrupt:
        print("\n[Detect] Interrupted by user")
    finally:
        # Stop stream
        with _frame_lock:
            _stream_meta["active"] = False
        # Drain upload queue
        _upload_queue.put(None)  # poison pill
        cap.release()
        gps.stop()
        cv2.destroyAllWindows()
        print(f"\n[Detect] Done — {frame_count} frames processed, "
              f"{report_count} reports uploaded")


#   Entry point  
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="SmartRoad Edge Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Local webcam:
    python -m edge.detect

  Android phone (IP Webcam app):
    python -m edge.detect --source "http://192.168.1.42:8080/video"

  DroidCam:
    python -m edge.detect --source "http://192.168.1.42:4747/video"

  RTSP IP camera:
    python -m edge.detect --source "rtsp://admin:admin@192.168.1.42:554/stream"

  Video file (for testing):
    python -m edge.detect --source road_clip.mp4 --no-upload
        """
    )
    parser.add_argument("--source",      default=0,
                        help="Camera source (default: 0=webcam)")
    parser.add_argument("--model",       default=DEFAULT_MODEL,
                        help="YOLO .pt model path")
    parser.add_argument("--server",      default="http://localhost:8000",
                        help="SmartRoad server URL")
    parser.add_argument("--conf",        type=float, default=CONFIDENCE,
                        help=f"Confidence threshold (default: {CONFIDENCE})")
    parser.add_argument("--stream-port", type=int,   default=STREAM_PORT,
                        help=f"MJPEG stream port (default: {STREAM_PORT})")
    parser.add_argument("--infer-every", type=int,   default=INFER_EVERY_N,
                        help=f"Run YOLO every N frames (default: {INFER_EVERY_N})")
    parser.add_argument("--preview",     action="store_true", default=False,
                        help="Show local OpenCV window (disable on headless Pi)")
    parser.add_argument("--no-preview",  dest="preview", action="store_false")
    parser.add_argument("--upload",      action="store_true", default=True,
                        help="Upload detections to server")
    parser.add_argument("--no-upload",   dest="upload", action="store_false")

    args = parser.parse_args()
    INFER_EVERY_N = args.infer_every
    run(args)
