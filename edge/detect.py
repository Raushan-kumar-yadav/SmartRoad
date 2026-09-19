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
        """Serve the mobile camera control UI."""
        html = b'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>SmartRoad Edge</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#09090b;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:100dvh;display:flex;flex-direction:column;overscroll-behavior:none}
  header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #27272a;background:#09090b;position:sticky;top:0;z-index:10}
  .logo{font-size:15px;font-weight:700;letter-spacing:-.3px}
  .dot{width:8px;height:8px;border-radius:50%;background:#3f3f46;display:inline-block;margin-right:5px;transition:background .3s}
  .dot.live{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.25);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,.25)}50%{box-shadow:0 0 0 7px rgba(34,197,94,.05)}}
  .badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid #27272a;color:#71717a}
  .badge.live{border-color:rgba(34,197,94,.3);color:#22c55e;background:rgba(34,197,94,.08)}
  #preview-wrap{position:relative;width:100%;background:#000;aspect-ratio:16/9;overflow:hidden}
  canvas{width:100%;height:100%;display:block;object-fit:cover}
  video{display:none}
  #no-cam{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#52525b;font-size:13px}
  #no-cam svg{width:40px;height:40px;stroke:#3f3f46}
  .hud{position:absolute;font-size:10px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.7);font-family:monospace}
  #hud-fps{top:8px;right:8px;color:#a1a1aa}
  #hud-gps{bottom:8px;left:8px;color:#a1a1aa}
  #hud-dets{top:8px;left:8px;color:#22c55e}
  #spinner{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}
  #spinner::after{content:\'\';width:26px;height:26px;border:3px solid #27272a;border-top-color:#22c55e;border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .controls{display:flex;gap:8px;padding:12px 14px}
  .btn{flex:1;padding:12px;border-radius:10px;border:none;font-size:14px;font-weight:600;cursor:pointer;transition:all .12s;display:flex;align-items:center;justify-content:center;gap:6px}
  .btn-start{background:#22c55e;color:#000}
  .btn-start:active{background:#16a34a;transform:scale(.97)}
  .btn-stop{background:#27272a;color:#fafafa;border:1px solid #3f3f46}
  .btn-stop:active{background:#18181b;transform:scale(.97)}
  .btn:disabled{opacity:.35;cursor:not-allowed}
  .btn-flip{background:#18181b;border:1px solid #27272a;color:#a1a1aa;flex:0 0 48px;padding:0;font-size:20px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#27272a;border-top:1px solid #27272a;border-bottom:1px solid #27272a}
  .stat{background:#09090b;padding:10px 12px}
  .stat-label{font-size:9px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
  .stat-value{font-size:16px;font-weight:700;margin-top:2px;font-family:monospace}
  .stat-value.g{color:#22c55e}
  .detections{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:6px}
  .det-hdr{font-size:10px;color:#52525b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
  .det-item{display:flex;align-items:center;justify-content:space-between;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:9px 11px;animation:fadein .2s}
  @keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .det-name{font-size:13px;font-weight:600}
  .det-right{display:flex;align-items:center;gap:8px}
  .det-conf{font-size:12px;font-family:monospace;font-weight:600}
  .det-upload{font-size:10px;padding:2px 7px;border-radius:999px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);color:#22c55e;cursor:pointer}
  .empty{color:#3f3f46;font-size:13px;text-align:center;padding:16px}
  .conf-hi{color:#22c55e}.conf-med{color:#f59e0b}.conf-lo{color:#ef4444}
  .footer{padding:10px 14px;font-size:10px;color:#3f3f46;border-top:1px solid #18181b;display:flex;justify-content:space-between;align-items:center}
  #upload-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(60px);background:#22c55e;color:#000;font-size:12px;font-weight:600;padding:8px 18px;border-radius:999px;opacity:0;transition:all .3s;pointer-events:none;z-index:100}
  #upload-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<header>
  <div class="logo">&#x1F6E3; SmartRoad Edge</div>
  <div><span class="dot" id="dot"></span><span class="badge" id="badge">Offline</span></div>
</header>
<div id="preview-wrap">
  <canvas id="canvas"></canvas>
  <video id="video" autoplay playsinline muted></video>
  <div id="no-cam">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
    <span id="no-cam-msg">Press Start</span>
  </div>
  <div class="hud" id="hud-dets" style="display:none"></div>
  <div class="hud" id="hud-fps"  style="display:none">-- fps</div>
  <div class="hud" id="hud-gps"  style="display:none">GPS...</div>
  <div id="spinner"></div>
</div>
<div class="controls">
  <button class="btn btn-start" id="btn-start" onclick="startCam()">&#x25B6; Start</button>
  <button class="btn btn-flip"  onclick="flipCam()" title="Flip">&#x21C6;</button>
  <button class="btn btn-stop"  id="btn-stop"  onclick="stopCam()" disabled>&#x25A0; Stop</button>
</div>
<div class="stats">
  <div class="stat"><div class="stat-label">FPS</div><div class="stat-value" id="sv-fps">-</div></div>
  <div class="stat"><div class="stat-label">Detections</div><div class="stat-value g" id="sv-dets">0</div></div>
  <div class="stat"><div class="stat-label">Uploaded</div><div class="stat-value g" id="sv-sent">0</div></div>
  <div class="stat"><div class="stat-label">Model</div><div class="stat-value" id="sv-model" style="font-size:10px;margin-top:4px">loading</div></div>
</div>
<div class="detections">
  <div class="det-hdr">Live Detections</div>
  <div id="det-list"><div class="empty">No detections yet</div></div>
</div>
<div class="footer">
  <span id="gps-text">GPS: waiting...</span>
  <span id="server-text">Server: -</span>
</div>
<div id="upload-toast">&#x2714; Sent!</div>
<script>
  const ANALYZE_FPS = 3;
  const CONF = 0.35;
  const JPEG_Q = 0.82;
  let stream=null,loopId=null,facing=\'environment\',lastT=0,gpsPos=null,sentCount=0,busy=false,serverUrl=\'\';
  const video=document.getElementById(\'video\');
  const canvas=document.getElementById(\'canvas\');
  const ctx=canvas.getContext(\'2d\');

  // Get /info to learn server URL + model status
  async function refreshInfo(){
    try{
      const d=await fetch(\'/info\').then(r=>r.json());
      if(d.server_url){ serverUrl=d.server_url; document.getElementById(\'server-text\').textContent=\'Server: \'+serverUrl; }
      document.getElementById(\'sv-model\').textContent=d.gui_url?\'ready ✔\':\'loading\';
    }catch{document.getElementById(\'sv-model\').textContent=\'offline\';}
  }
  refreshInfo();
  setInterval(refreshInfo,4000);

  // GPS
  navigator.geolocation&&navigator.geolocation.watchPosition(
    p=>{gpsPos={lat:p.coords.latitude,lon:p.coords.longitude};
        document.getElementById(\'gps-text\').textContent=\'GPS: \'+gpsPos.lat.toFixed(5)+\', \'+gpsPos.lon.toFixed(5);
        document.getElementById(\'hud-gps\').textContent=gpsPos.lat.toFixed(4)+\',\'+gpsPos.lon.toFixed(4);},
    ()=>{document.getElementById(\'gps-text\').textContent=\'GPS: unavailable\';},
    {enableHighAccuracy:true,maximumAge:5000}
  );

  async function startCam(){
    document.getElementById(\'btn-start\').disabled=true;
    document.getElementById(\'no-cam-msg\').textContent=\'Opening camera...\';
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:640},height:{ideal:480}},audio:false});
      video.srcObject=stream;
      await video.play();
      canvas.width=video.videoWidth||640;
      canvas.height=video.videoHeight||480;
      document.getElementById(\'no-cam\').style.display=\'none\';
      [\'hud-fps\',\'hud-gps\',\'hud-dets\'].forEach(id=>document.getElementById(id).style.display=\'block\');
      document.getElementById(\'btn-stop\').disabled=false;
      document.getElementById(\'dot\').classList.add(\'live\');
      document.getElementById(\'badge\').textContent=\'Live\';
      document.getElementById(\'badge\').classList.add(\'live\');
      loopId=setInterval(captureAndAnalyze,1000/ANALYZE_FPS);
    }catch(e){
      document.getElementById(\'no-cam-msg\').textContent=\'Camera error: \'+e.message;
      document.getElementById(\'btn-start\').disabled=false;
    }
  }

  function stopCam(){
    if(loopId){clearInterval(loopId);loopId=null;}
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    document.getElementById(\'no-cam\').style.display=\'flex\';
    document.getElementById(\'no-cam-msg\').textContent=\'Stopped\';
    [\'hud-fps\',\'hud-gps\',\'hud-dets\'].forEach(id=>document.getElementById(id).style.display=\'none\');
    document.getElementById(\'btn-stop\').disabled=true;
    document.getElementById(\'btn-start\').disabled=false;
    document.getElementById(\'dot\').classList.remove(\'live\');
    document.getElementById(\'badge\').textContent=\'Offline\';
    document.getElementById(\'badge\').classList.remove(\'live\');
  }

  async function flipCam(){
    facing=facing===\'environment\'?\'user\':\'environment\';
    if(stream){stopCam();await startCam();}
  }

  async function captureAndAnalyze(){
    if(busy||!stream||video.readyState<2)return;
    busy=true;
    const now=Date.now();
    const fps=lastT?(1000/(now-lastT)).toFixed(1):\'-\';
    lastT=now;
    document.getElementById(\'hud-fps\').textContent=fps+\' fps\';
    document.getElementById(\'sv-fps\').textContent=fps;
    // Draw current video frame
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const b64=canvas.toDataURL(\'image/jpeg\',JPEG_Q).split(\',\')[1];
    try{
      document.getElementById(\'spinner\').style.display=\'flex\';
      const res=await fetch(\'/analyze\',{
        method:\'POST\',
        headers:{\'Content-Type\':\'application/json\'},
        body:JSON.stringify({image_b64:b64,conf:CONF,lat:gpsPos?.lat??null,lon:gpsPos?.lon??null})
      });
      const data=await res.json();
      if(data.error){busy=false;return;}
      // Draw annotated image from YOLO
      if(data.annotated_b64){
        const img=new Image();
        img.onload=()=>{ctx.drawImage(img,0,0,canvas.width,canvas.height);busy=false;};
        img.src=\'data:image/jpeg;base64,\'+data.annotated_b64;
      }else{busy=false;}
      const dets=data.detections||[];
      document.getElementById(\'sv-dets\').textContent=dets.length;
      document.getElementById(\'hud-dets\').textContent=dets.length?dets.length+\' det\':\'\'
      renderDets(dets,b64);
    }catch(e){busy=false;}
    finally{document.getElementById(\'spinner\').style.display=\'none\';}
  }

  function renderDets(dets,b64){
    const list=document.getElementById(\'det-list\');
    if(!dets.length){list.innerHTML=\'<div class="empty">No detections</div>\';return;}
    window._dets=dets;window._b64=b64;
    list.innerHTML=dets.map((d,i)=>{
      const c=d.confidence;
      const cls=c>=0.7?\'conf-hi\':c>=0.5?\'conf-med\':\'conf-lo\';
      return `<div class="det-item"><span class="det-name">&#x1F6A7; ${d.class}</span><div class="det-right"><span class="det-conf ${cls}">${(c*100).toFixed(0)}%</span><span class="det-upload" onclick="upload(${i})">&#x2B06; Send</span></div></div>`;
    }).join(\'\');
  }

  async function upload(idx){
    const det=(window._dets||[])[idx];
    if(!det||!serverUrl)return;
    try{
      await fetch(serverUrl.replace(/\\/$/,\'\')+\'/api/report\',{
        method:\'POST\',
        headers:{\'Content-Type\':\'application/json\'},
        body:JSON.stringify({class:det.class,confidence:det.confidence,bbox:det.bbox,lat:gpsPos?.lat??null,lon:gpsPos?.lon??null,source:\'mobile-cam\',image_b64:window._b64||null})
      });
      sentCount++;
      document.getElementById(\'sv-sent\').textContent=sentCount;
      toast(\'&#x2714; Uploaded!\');
    }catch{toast(\'&#x26A0; Upload failed\');}
  }

  function toast(msg){
    const t=document.getElementById(\'upload-toast\');
    t.innerHTML=msg;t.classList.add(\'show\');
    setTimeout(()=>t.classList.remove(\'show\'),2500);
  }
</script>
</body></html>'''
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self._cors()
            self.end_headers()
            self.wfile.write(html)
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
