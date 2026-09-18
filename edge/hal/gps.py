 
import threading
import time

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


class GPS:
    def __init__(self, port="/dev/ttyUSB0", baud=9600, mock_coords=None):
         
        self.port = port
        self.baud = baud
        self.mock_coords = mock_coords or (28.6139, 77.2090)   
        self._lat = None
        self._lon = None
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

    def start(self):
        """Start background GPS reading thread."""
        if not SERIAL_AVAILABLE:
            print("[GPS] pyserial not installed — using mock coordinates")
            return
        try:
            self._running = True
            self._thread  = threading.Thread(target=self._read_loop, daemon=True)
            self._thread.start()
            print(f"[GPS] Started on {self.port} @ {self.baud} baud")
        except Exception as e:
            print(f"[GPS] Failed to start serial: {e} — using mock coords")

    def _read_loop(self):
        try:
            with serial.Serial(self.port, self.baud, timeout=1) as ser:
                while self._running:
                    line = ser.readline().decode("ascii", errors="replace").strip()
                    if line.startswith("$GPGGA") or line.startswith("$GPRMC"):
                        lat, lon = self._parse_nmea(line)
                        if lat and lon:
                            with self._lock:
                                self._lat, self._lon = lat, lon
        except Exception as e:
            print(f"[GPS] Serial error: {e}")

    def _parse_nmea(self, sentence):
        """Basic NMEA GGA/RMC parser."""
        try:
            parts = sentence.split(",")
            if parts[0] in ("$GPGGA", "$GNGGA"):
                lat = self._nmea_to_dd(parts[2], parts[3])
                lon = self._nmea_to_dd(parts[4], parts[5])
                return lat, lon
            elif parts[0] in ("$GPRMC", "$GNRMC") and parts[2] == "A":
                lat = self._nmea_to_dd(parts[3], parts[4])
                lon = self._nmea_to_dd(parts[5], parts[6])
                return lat, lon
        except Exception:
            pass
        return None, None

    def _nmea_to_dd(self, value, direction):
        """NMEA ddmm.mmmm → decimal degrees."""
        if not value:
            return None
        dot = value.index(".")
        deg = float(value[:dot - 2])
        mins = float(value[dot - 2:]) / 60
        dd = deg + mins
        if direction in ("S", "W"):
            dd = -dd
        return dd

    def location(self):
        """Returns (lat, lon) — falls back to mock if no fix yet."""
        with self._lock:
            if self._lat and self._lon:
                return (self._lat, self._lon)
        return self.mock_coords

    def stop(self):
        self._running = False
