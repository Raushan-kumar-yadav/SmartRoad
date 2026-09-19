 
import argparse
import time
import threading
import cv2
import sys
import os

 
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ultralytics import YOLO
from edge.hal.camera import Camera
from edge.hal.gps import GPS
from edge.uploader import upload_report


# Config
DEFAULT_MODEL  = r"e:\Pothole\pretrained\rdd\best.pt"
CONFIDENCE = 0.35
INFER_EVERY_N  = 5
SHOW_PREVIEW   = False          # headless on Pi — use dashboard Live tab instead
UPLOAD_ENABLED = True
STREAM_PORT    = 8080           # MJPEG stream port
STREAM_QUALITY = 70             # JPEG quality (0-100)
STREAM_WIDTH   = 640            # resize before streaming (saves CPU on encoding)
STREAM_HEIGHT  = 360

# Map RDD2022 class names -> SmartRoad class names
MODEL_CLASS_REMAP = {
    "Pothole":            "pothole",
    "pothole":            "pothole",
    "alligator crack":    "road_crack",
    "transverse crack":   "road_crack",
    "longitudinal crack": "road_crack",
    "other corruption":   "road_crack",
    "0": "pothole",
    "1": "road_crack",
    "2": "broken_footpath",
    "3": "broken_pole",
    "4": "garbage_dump",
    "5": "waterlogging",
}

SMARTROAD_CLASSES = {
    0: "pothole", 1: "road_crack", 2: "broken_footpath",
    3: "broken_pole", 4: "garbage_dump", 5: "waterlogging",
}

CLASS_COLORS = {
    "pothole":         (0, 0, 255),
    "road_crack":      (0, 165, 255),
    "broken_footpath": (0, 255, 255),
    "broken_pole":     (255, 0, 0),
    "garbage_dump":    (0, 128, 0),
    "waterlogging":    (255, 255, 0),
}

# ── Shared state for MJPEG server ───────────────────────────────────────────
_lock        = threading.Lock()
_latest_jpeg = None          # bytes — latest encoded JPEG frame
_stream_info = {             # metadata sent alongside the stream
    "active":      False,
    "fps":         0.0,
    "detections":  [],
    "lat":         None,
    "lon":         None,
    "reports_sent": 0,
}


def _encode_frame(frame):
    """Encode a frame to JPEG bytes for streaming."""
    small = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, STREAM_QUALITY])
    return buf.tobytes() if ok else None


def _update_stream(frame, detections=None, lat=None, lon=None, fps=0.0, reports=0):
    """Called from detection loop — thread-safe frame push."""
    global _latest_jpeg
    jpeg = _encode_frame(frame)
    if jpeg is None:
        return
    with _lock:
        _latest_jpeg = jpeg
        _stream_info["active"]      = True
        _stream_info["fps"]         = round(fps, 1)
        _stream_info["lat"]         = lat
        _stream_info["lon"]         = lon
        _stream_info["reports_sent"] = reports
        if detections is not None:
            _stream_info["detections"] = detections


# ── MJPEG HTTP handler ───────────────────────────────────────────────────────
class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # suppress access logs

    def do_GET(self):
        if self.path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    with _lock:
                        frame = _latest_jpeg
                    if frame:
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                    time.sleep(1 / 15)   # cap at 15fps
            except (BrokenPipeError, ConnectionResetError):
                pass

        elif self.path == "/info":
            import json
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with _lock:
                data = dict(_stream_info)
            self.wfile.write(json.dumps(data).encode())

        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")

        else:
            self.send_response(404)
            self.end_headers()


def _start_mjpeg_server(port: int):
    """Start MJPEG HTTP server in a daemon thread."""
    server = HTTPServer(("0.0.0.0", port), MJPEGHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[Stream] MJPEG server → http://0.0.0.0:{port}/stream")
    print(f"[Stream] Info endpoint → http://0.0.0.0:{port}/info")


#   Detection helpers    
def draw_detections(frame, results, model_names):
    """Draw bounding boxes + HUD on frame."""
    annotated = frame.copy()
    for box in results[0].boxes:
        cls_id  = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        raw_name = model_names[cls_id]
        name = MODEL_CLASS_REMAP.get(raw_name, MODEL_CLASS_REMAP.get(str(cls_id), raw_name))
        color = CLASS_COLORS.get(name, (200, 200, 200))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{name} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 2, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

    # HUD overlay
    ts = time.strftime("%H:%M:%S")
    cv2.putText(annotated, f"SmartRoad | {ts}", (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return annotated


#   Main detection loop  
def run(args):
    import edge.uploader as uploader
    uploader.SERVER_URL = args.server

    # Start MJPEG stream server (non-blocking)
    _start_mjpeg_server(args.stream_port)

    print(f"[Detect] Loading model: {args.model}")
    model = YOLO(args.model)
    print(f"[Detect] Model loaded — {len(model.names)} classes")

    gps = GPS(mock_coords=(28.6139, 77.2090))
    gps.start()

    cam = Camera(source=args.source)
    cam.open()

    frame_count    = 0
    report_count   = 0
    last_report_ts = {}
    fps_ts         = time.time()
    fps            = 0.0

    print(f"[Detect] Running — source: {args.source}")
    print(f"[Detect] Stream at http://0.0.0.0:{args.stream_port}/stream")

    try:
        while True:
            ret, frame = cam.read()
            if not ret:
                print("[Detect] Frame grab failed — end of stream or camera error")
                break

            frame_count += 1
            annotated    = frame.copy()
            detections   = []

            # FPS calculation (rolling)
            elapsed = time.time() - fps_ts
            if elapsed >= 1.0:
                fps    = frame_count / elapsed
                fps_ts = time.time()

            # Run YOLO inference every N frames
            if frame_count % INFER_EVERY_N == 0:
                results   = model(frame, verbose=False, conf=CONFIDENCE)
                annotated = draw_detections(frame, results, model.names)

                for box in results[0].boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    name   = SMARTROAD_CLASSES.get(cls_id, model.names[cls_id])
                    lat, lon = gps.location()

                    detections.append({"class": name, "confidence": round(conf, 3)})

                    now = time.time()
                    if now - last_report_ts.get(name, 0) < 3.0:
                        continue
                    last_report_ts[name] = now

                    print(f"[Detect] {name} ({conf:.2f}) @ ({lat:.5f}, {lon:.5f})")

                    if UPLOAD_ENABLED and args.upload:
                        upload_report(
                            class_id=cls_id, class_name=name, confidence=conf,
                            lat=lat, lon=lon, frame=annotated,
                            bbox=(x1, y1, x2, y2), source="edge",
                        )
                        report_count += 1

            # Push annotated frame to MJPEG stream (separate thread-safe call)
            lat, lon = gps.location()
            _update_stream(
                frame=annotated,
                detections=detections,
                lat=lat, lon=lon,
                fps=fps,
                reports=report_count,
            )

            # Local preview (only if explicitly enabled)
            if SHOW_PREVIEW and args.preview:
                cv2.imshow("SmartRoad", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        with _lock:
            _stream_info["active"] = False
        cam.release()
        gps.stop()
        cv2.destroyAllWindows()
        print(f"[Detect] Done — {frame_count} frames, {report_count} reports uploaded")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SmartRoad Edge Detection")
    parser.add_argument("--source",      default=0)
    parser.add_argument("--model",       default=DEFAULT_MODEL)
    parser.add_argument("--server",      default="http://localhost:8000")
    parser.add_argument("--stream-port", type=int, default=STREAM_PORT,
                        help="MJPEG stream port (default 8080)")
    parser.add_argument("--preview",     action="store_true", default=False)
    parser.add_argument("--no-preview",  dest="preview", action="store_false")
    parser.add_argument("--upload",      action="store_true", default=True)
    parser.add_argument("--no-upload",   dest="upload", action="store_false")
    parser.add_argument("--conf",        type=float, default=CONFIDENCE)
    args = parser.parse_args()
    CONFIDENCE = args.conf
    run(args)
