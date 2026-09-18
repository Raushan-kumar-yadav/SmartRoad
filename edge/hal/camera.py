"""
SmartRoad — Camera HAL
Supports:
  - Webcam (USB)        : source=0
  - Video file          : source="path/to/video.mp4"
  - Phone via IP Webcam : source="http://192.168.1.x:8080/video"
  - Phone via DroidCam  : source="http://192.168.1.x:4747/video"
"""
import cv2


class Camera:
    def __init__(self, source=0, width=1280, height=720):
        """
        Args:
            source: int (webcam index), str (video file or RTSP/HTTP URL)
            width, height: capture resolution
        """
        self.source = source
        self.width  = width
        self.height = height
        self.cap    = None

    def open(self):
        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open camera source: {self.source}")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        print(f"[Camera] Opened: {self.source} "
              f"({int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
              f"{int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))})")

    def read(self):
        """Returns (success: bool, frame: np.ndarray)"""
        if self.cap is None:
            self.open()
        return self.cap.read()

    def release(self):
        if self.cap:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.release()
