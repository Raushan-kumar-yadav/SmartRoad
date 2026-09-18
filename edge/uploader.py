 
import base64
import json
import requests
import cv2


SERVER_URL = "http://localhost:8000"   


def upload_report(
    class_id: int,
    class_name: str,
    confidence: float,
    lat: float = None,
    lon: float = None,
    frame=None,         
    bbox: tuple = None,   
    source: str = "edge",
):
    """
    Send a detection report to the server.
    Optionally includes the annotated frame as base64 JPEG.
    """
    payload = {
        "class_id": class_id,
        "class_name": class_name,
        "confidence": round(float(confidence), 4),
        "lat": lat,
        "lon": lon,
        "source": source,
    } 

    if bbox:
        payload["bbox_x1"] = float(bbox[0])
        payload["bbox_y1"] = float(bbox[1])
        payload["bbox_x2"] = float(bbox[2])
        payload["bbox_y2"] = float(bbox[3])

    # Encode frame as base64 JPEG
    if frame is not None:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        payload["image_b64"] = base64.b64encode(buf).decode("utf-8")

    try:
        resp = requests.post(
            f"{SERVER_URL}/api/report",
            json=payload,
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        print(f"[Upload] ✅ Report #{data['id']} — {class_name} ({confidence:.2f})")
        return data
    except requests.exceptions.ConnectionError:
        print(f"[Upload] ❌ Server offline — report dropped ({class_name})")
    except Exception as e:
        print(f"[Upload] ❌ Error: {e}")
    return None
