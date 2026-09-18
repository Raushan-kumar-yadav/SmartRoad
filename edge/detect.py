 
import argparse
import time
import cv2
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ultralytics import YOLO
from edge.hal.camera import Camera
from edge.hal.gps import GPS
from edge.uploader import upload_report

#   Config  
DEFAULT_MODEL  = "yolo11m.pt"     # swap to best.pt after training
CONFIDENCE     = 0.40 # minimum confidence to report
INFER_EVERY_N  = 5 # run inference every N frames (saves CPU)
SHOW_PREVIEW   = True # show annotated frame window
UPLOAD_ENABLED = True # send reports to server

# SmartRoad class names  
SMARTROAD_CLASSES = {
    0: "pothole",
    1: "road_crack",
    2: "broken_footpath",
    3: "broken_pole",
    4: "garbage_dump",
    5: "waterlogging",
}

# Color per class (BGR)
CLASS_COLORS = {
    "pothole": (0, 0, 255),    # red
    "road_crack": (0, 165, 255),  # orange
    "broken_footpath":(0, 255, 255),  # yellow
    "broken_pole": (255, 0, 0),    # blue
    "garbage_dump": (0, 128, 0),    # green
    "waterlogging": (255, 255, 0),  # cyan
}


def draw_detections(frame, results, model_names):
    """Draw bounding boxes and labels on frame."""
    annotated = frame.copy()
    for box in results[0].boxes:
        cls_id  = int(box.cls[0])
        conf    = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        # Use SmartRoad class name if custom model, else COCO name
        name  = SMARTROAD_CLASSES.get(cls_id, model_names[cls_id])
        color = CLASS_COLORS.get(name, (200, 200, 200))

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{name} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Status bar
    ts = time.strftime("%H:%M:%S")
    cv2.putText(annotated, f"SmartRoad | {ts}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return annotated


def run(args):
    import edge.uploader as uploader
    uploader.SERVER_URL = args.server

    # Load model
    print(f"[Detect] Loading model: {args.model}")
    model = YOLO(args.model)
    print(f"[Detect] Model loaded — {len(model.names)} classes")

    # Init GPS
    gps = GPS(mock_coords=(28.6139, 77.2090))  
    gps.start()

    # Open camera
    cam = Camera(source=args.source)
    cam.open()

    frame_count    = 0
    report_count   = 0
    last_report_ts = {}  

    print(f"[Detect] Starting — source: {args.source}")
    print(f"[Detect] Inference every {INFER_EVERY_N} frames | conf >= {CONFIDENCE}")
    print("[Detect] Press Q to quit")

    try:
        while True:
            ret, frame = cam.read()
            if not ret:
                print("[Detect] Frame grab failed — end of stream or camera error")
                break

            frame_count += 1
            annotated = frame.copy()

            # Run inference every N frames
            if frame_count % INFER_EVERY_N == 0:
                results = model(frame, verbose=False, conf=CONFIDENCE)
                annotated = draw_detections(frame, results, model.names)

                for box in results[0].boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()

                    name = SMARTROAD_CLASSES.get(cls_id, model.names[cls_id])
                    lat, lon = gps.location()

                     
                    now = time.time()
                    if now - last_report_ts.get(name, 0) < 3.0:
                        continue
                    last_report_ts[name] = now

                    print(f"[Detect] {name} ({conf:.2f}) @ ({lat:.5f}, {lon:.5f})")

                    if UPLOAD_ENABLED and args.upload:
                        upload_report(
                            class_id   = cls_id,
                            class_name = name,
                            confidence = conf,
                            lat = lat,
                            lon = lon,
                            frame = annotated,
                            bbox = (x1, y1, x2, y2),
                            source = "edge",
                        )
                        report_count += 1

            # Show preview window
            if SHOW_PREVIEW and args.preview:
                cv2.imshow("SmartRoad — Live Detection", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("[Detect] Quit by user")
                    break

    finally:
        cam.release()
        gps.stop()
        cv2.destroyAllWindows()
        print(f"[Detect] Done — {frame_count} frames, {report_count} reports uploaded")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SmartRoad Edge Detection")
    parser.add_argument("--source",  default=0,
                        help="Camera source: 0=webcam, URL=phone/RTSP, path=video file")
    parser.add_argument("--model",   default=DEFAULT_MODEL,
                        help="Path to YOLO model .pt file")
    parser.add_argument("--server",  default="http://localhost:8000",
                        help="SmartRoad server URL")
    parser.add_argument("--preview", action="store_true", default=True,
                        help="Show live preview window")
    parser.add_argument("--no-preview", dest="preview", action="store_false")
    parser.add_argument("--upload",  action="store_true", default=True,
                        help="Upload detections to server")
    parser.add_argument("--no-upload", dest="upload", action="store_false")
    parser.add_argument("--conf",    type=float, default=CONFIDENCE,
                        help="Minimum confidence threshold")
    args = parser.parse_args()

    CONFIDENCE = args.conf
    run(args)
