 
import base64
import cv2
import requests


SERVER_URL = "http://localhost:8000"


def upload_report(
    class_id: int,
    class_name: str,
    confidence: float,
    lat: float = None,
    lon: float = None,
    frame=None,           
    image_b64: str = None,   
    bbox: tuple = None,
    source: str = "edge",
):
    """
    Send a detection report to the SmartRoad server.
    Pass either:
      - frame (numpy array) → encoded to JPEG here
      - image_b64 (str)     → already encoded, sent as-is (faster)
    """
    payload = {
        "class_id":   class_id,
        "class_name": class_name,
        "confidence": round(float(confidence), 4),
        "lat":        lat,
        "lon":        lon,
        "source":     source,
    }

    if bbox:
        payload["bbox_x1"] = float(bbox[0])
        payload["bbox_y1"] = float(bbox[1])
        payload["bbox_x2"] = float(bbox[2])
        payload["bbox_y2"] = float(bbox[3])

    # Image — prefer pre-encoded b64
    if image_b64:
        payload["image_b64"] = image_b64
    elif frame is not None:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
        payload["image_b64"] = base64.b64encode(buf).decode("utf-8")

    try:
        resp = requests.post(
            f"{SERVER_URL}/api/report",
            json=payload,
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
        print(f"[Upload] ✅ Report #{data.get('id','?')} — {class_name} ({confidence:.2f})")
        return data
    except requests.exceptions.ConnectionError:
        print(f"[Upload] ❌ Server offline — {class_name} dropped")
    except requests.exceptions.Timeout:
        print(f"[Upload] ❌ Timeout — {class_name} dropped")
    except Exception as e:
        print(f"[Upload] ❌ Error: {e}")
    return None
