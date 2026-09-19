"""
GPS HAL — Real serial GPS or realistic road-walk simulation.

In simulation mode (no pyserial / no hardware):
  - Starts at `mock_coords` (default: Connaught Place, New Delhi)
  - Simulates a vehicle moving at 30–50 km/h along a road
  - Applies smooth Perlin-style noise to lat/lon so it looks like a real GPS trace
  - Speed and heading vary slightly to mimic real driving
"""

import math
import random
import threading
import time

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


# ── Lightweight smooth noise (no scipy needed) ─────────────────────────────
def _smooth(prev: float, target: float, alpha: float = 0.12) -> float:
    """Exponential moving average — smoothly converge prev toward target."""
    return prev + alpha * (target - prev)


class GPS:
    def __init__(self, port: str = "/dev/ttyUSB0", baud: int = 9600,
                 mock_coords: tuple = None,
                 min_speed: float = 20.0, max_speed: float = 50.0):
        self.port         = port
        self.baud         = baud
        self.mock_coords  = mock_coords or (28.6139, 77.2090)  # Connaught Place, Delhi
        self.min_speed    = min_speed   # km/h
        self.max_speed    = max_speed   # km/h

        self._lat     = None
        self._lon     = None
        self._lock    = threading.Lock()
        self._running = False
        self._thread  = None

        # Simulation state — convert km/h → m/s
        _min_mps = min_speed / 3.6
        _max_mps = max_speed / 3.6
        self._sim_lat     = float(self.mock_coords[0])
        self._sim_lon     = float(self.mock_coords[1])
        self._heading_deg = random.uniform(0, 360)   # degrees clockwise from North
        self._speed_mps   = random.uniform(_min_mps, _max_mps)
        # Target values for smooth interpolation
        self._t_heading   = self._heading_deg
        self._t_speed     = self._speed_mps
        self._min_mps     = _min_mps
        self._max_mps     = _max_mps

    # ── Start ────────────────────────────────────────────────────────────────
    def start(self):
        if not SERIAL_AVAILABLE:
            print("[GPS] pyserial not installed — using realistic road simulation")
            self._running = True
            self._thread  = threading.Thread(target=self._sim_loop, daemon=True,
                                             name="gps-sim")
            self._thread.start()
            return
        try:
            self._running = True
            self._thread  = threading.Thread(target=self._read_loop, daemon=True,
                                             name="gps-serial")
            self._thread.start()
            print(f"[GPS] Started on {self.port} @ {self.baud} baud")
        except Exception as e:
            print(f"[GPS] Failed to start serial: {e} — falling back to simulation")
            self._thread = threading.Thread(target=self._sim_loop, daemon=True,
                                            name="gps-sim")
            self._thread.start()

    # ── Realistic road-walk simulation ──────────────────────────────────────
    def _sim_loop(self):
        """
        Simulate a vehicle driving on roads:
        - Updates position every ~1 s (GPS fix rate)
        - Speed: 20–55 km/h with smooth variation
        - Heading: drifts ±15° per second (urban grid turns)
        - Adds micro-noise for GPS multipath effect
        """
        EARTH_R = 6_371_000.0          # metres
        UPDATE_HZ = 1.0                # 1 Hz GPS fix rate
        interval   = 1.0 / UPDATE_HZ

        # Occasionally make a "turn" (simulate intersections)
        turn_countdown = random.randint(8, 25)   # seconds until next turn

        while self._running:
            t0 = time.time()

            # ── Speed variation (smooth) ─────────────────────────────────
            if random.random() < 0.3:
                self._t_speed = random.uniform(self._min_mps, self._max_mps)
            self._speed_mps = _smooth(self._speed_mps, self._t_speed, alpha=0.08)

            # ── Heading variation (smooth + occasional turn) ─────────────
            turn_countdown -= 1
            if turn_countdown <= 0:
                # Make a ±45–135° turn (urban intersection)
                delta = random.choice([-1, 1]) * random.uniform(45, 135)
                self._t_heading = (self._heading_deg + delta) % 360
                turn_countdown = random.randint(8, 25)
            else:
                # Gentle steering drift
                self._t_heading += random.gauss(0, 0.8)

            self._heading_deg = _smooth(self._heading_deg, self._t_heading, alpha=0.15)
            self._heading_deg %= 360

            # ── Move position ────────────────────────────────────────────
            dist_m   = self._speed_mps * interval
            rad      = math.radians(self._heading_deg)
            dlat_deg = (dist_m * math.cos(rad)) / EARTH_R * (180 / math.pi)
            dlon_deg = (dist_m * math.sin(rad)) / (
                EARTH_R * math.cos(math.radians(self._sim_lat))
            ) * (180 / math.pi)

            # GPS multipath noise (realistic scatter ≈ 2–5 m)
            noise_m  = random.gauss(0, 2.5)
            noise_lat = noise_m / EARTH_R * (180 / math.pi)
            noise_lon = noise_m / (EARTH_R * math.cos(math.radians(self._sim_lat))) * (180 / math.pi)

            self._sim_lat += dlat_deg + noise_lat
            self._sim_lon += dlon_deg + noise_lon

            # Write to shared state
            with self._lock:
                self._lat = round(self._sim_lat, 6)
                self._lon = round(self._sim_lon, 6)

            # Sleep for remainder of interval
            elapsed = time.time() - t0
            time.sleep(max(0.0, interval - elapsed))

    # ── Real serial NMEA reader ──────────────────────────────────────────────
    def _read_loop(self):
        try:
            with serial.Serial(self.port, self.baud, timeout=1) as ser:
                while self._running:
                    line = ser.readline().decode("ascii", errors="replace").strip()
                    if line.startswith(("$GPGGA", "$GPRMC", "$GNGGA", "$GNRMC")):
                        lat, lon = self._parse_nmea(line)
                        if lat and lon:
                            with self._lock:
                                self._lat, self._lon = lat, lon
        except Exception as e:
            print(f"[GPS] Serial error: {e} — switching to simulation")
            self._sim_loop()

    def _parse_nmea(self, sentence: str):
        try:
            parts = sentence.split(",")
            if parts[0] in ("$GPGGA", "$GNGGA"):
                return self._nmea_to_dd(parts[2], parts[3]), self._nmea_to_dd(parts[4], parts[5])
            elif parts[0] in ("$GPRMC", "$GNRMC") and parts[2] == "A":
                return self._nmea_to_dd(parts[3], parts[4]), self._nmea_to_dd(parts[5], parts[6])
        except Exception:
            pass
        return None, None

    def _nmea_to_dd(self, value: str, direction: str):
        if not value:
            return None
        dot = value.index(".")
        deg  = float(value[:dot - 2])
        mins = float(value[dot - 2:]) / 60
        dd   = deg + mins
        if direction in ("S", "W"):
            dd = -dd
        return dd

    # ── Public API ────────────────────────────────────────────────────────────
    def location(self) -> tuple:
        """Returns (lat, lon). Returns mock_coords if no fix yet."""
        with self._lock:
            if self._lat is not None and self._lon is not None:
                return (self._lat, self._lon)
        return self.mock_coords

    def stop(self):
        self._running = False
