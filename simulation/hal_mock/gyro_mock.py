"""
Gyro/IMU HAL — realistic vehicle motion simulation.

Simulates a vehicle-mounted IMU:
  - Normal driving: low-frequency oscillations (road vibration)
  - Pothole event: large Z-axis spike (vertical impact), brief pitch/roll
  - Turn: sustained roll + yaw rate
  - Speed bumps: moderate Z-axis jolt

Units:
  - Accelerometer: m/s²  (X=lateral, Y=forward, Z=vertical)
  - Gyroscope:     °/s   (roll, pitch, yaw rates)
"""

import math
import random
import threading
import time


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))

def _smooth(prev, target, alpha=0.18):
    return prev + alpha * (target - prev)


class Gyro:
    """
    Thread-safe vehicle IMU simulator.
    Call `start()` to begin simulation, `reading()` to get current values.
    """

    def __init__(self):
        # Accelerometer (m/s²)
        self._ax = 0.0   # lateral (left/right)
        self._ay = 9.8   # forward (gravity component when tilted)
        self._az = 0.0   # vertical (impact/vibration)

        # Gyroscope (°/s)
        self._gr = 0.0   # roll rate
        self._gp = 0.0   # pitch rate
        self._gy = 0.0   # yaw rate

        # Target values for smooth interpolation
        self._t_ax = 0.0
        self._t_az = 0.0
        self._t_gr = 0.0
        self._t_gp = 0.0
        self._t_gy = 0.0

        self._lock    = threading.Lock()
        self._running = False
        self._thread  = None

        # State machine
        self._event_countdown  = random.randint(30, 80)   # frames until next event
        self._event_type       = None   # 'pothole' | 'turn' | 'brake' | None
        self._event_remaining  = 0

        # Road vibration phase (continuous)
        self._vib_phase = random.uniform(0, math.tau)
        self._t0 = time.time()

    def start(self):
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True,
                                         name="gyro-sim")
        self._thread.start()

    def stop(self):
        self._running = False

    # ── Simulation loop ──────────────────────────────────────────────────────
    def _loop(self):
        UPDATE_HZ = 50     # 50 Hz IMU
        interval  = 1.0 / UPDATE_HZ

        while self._running:
            t0 = time.time()
            t  = t0 - self._t0

            # ── Road vibration (always present) ─────────────────────────
            vib_z = (
                0.15 * math.sin(2 * math.pi * 12 * t + self._vib_phase) +   # 12 Hz engine
                0.08 * math.sin(2 * math.pi * 4  * t)  +                     # 4 Hz road
                random.gauss(0, 0.04)                                         # white noise
            )
            vib_r = 0.06 * math.sin(2 * math.pi * 1.5 * t) + random.gauss(0, 0.03)
            vib_p = 0.04 * math.sin(2 * math.pi * 0.8 * t) + random.gauss(0, 0.02)

            # ── Event scheduler ─────────────────────────────────────────
            if self._event_type is None:
                self._event_countdown -= 1
                if self._event_countdown <= 0:
                    self._trigger_event()

            # ── Event dynamics ──────────────────────────────────────────
            event_az = 0.0
            event_gr = 0.0
            event_gp = 0.0
            event_gy = 0.0
            event_ax = 0.0

            if self._event_type == 'pothole' and self._event_remaining > 0:
                # Sharp Z-spike on hit, then damped oscillation
                phase = 1.0 - self._event_remaining / 15.0
                event_az = 18.0 * math.exp(-5 * phase) * math.sin(20 * math.pi * phase)
                event_gp = 8.0  * math.exp(-4 * phase) * math.sin(15 * math.pi * phase)
                event_gr = 4.0  * math.exp(-4 * phase) * math.sin(12 * math.pi * phase)
                self._event_remaining -= 1
                if self._event_remaining <= 0:
                    self._event_type = None

            elif self._event_type == 'turn' and self._event_remaining > 0:
                direction = getattr(self, '_turn_dir', 1)
                event_gy = 22.0 * direction
                event_gr = 5.0  * direction
                event_ax = 3.5  * direction
                self._event_remaining -= 1
                if self._event_remaining <= 0:
                    self._event_type = None

            elif self._event_type == 'brake' and self._event_remaining > 0:
                event_gp = -6.0
                event_az = 2.5
                self._event_remaining -= 1
                if self._event_remaining <= 0:
                    self._event_type = None

            elif self._event_type == 'bump' and self._event_remaining > 0:
                phase = 1.0 - self._event_remaining / 8.0
                event_az = 8.0 * math.exp(-3 * phase) * math.sin(10 * math.pi * phase)
                event_gp = 3.0 * math.exp(-3 * phase)
                self._event_remaining -= 1
                if self._event_remaining <= 0:
                    self._event_type = None

            # ── Compose final values ─────────────────────────────────────
            raw_az = vib_z + event_az
            raw_gr = vib_r + event_gr
            raw_gp = vib_p + event_gp
            raw_gy = event_gy + random.gauss(0, 0.1)
            raw_ax = event_ax + random.gauss(0, 0.05)

            # Smooth transitions
            with self._lock:
                self._ax = _smooth(self._ax, raw_ax, 0.3)
                self._az = raw_az          # keep Z unsmoothed for impact feel
                self._gr = _smooth(self._gr, raw_gr, 0.25)
                self._gp = _smooth(self._gp, raw_gp, 0.25)
                self._gy = _smooth(self._gy, raw_gy, 0.35)

            elapsed = time.time() - t0
            time.sleep(max(0.0, interval - elapsed))

    def _trigger_event(self):
        event = random.choices(
            ['pothole', 'turn', 'brake', 'bump', None],
            weights=[15, 25, 20, 15, 25]
        )[0]
        if event == 'pothole':
            self._event_type      = 'pothole'
            self._event_remaining = random.randint(12, 18)   # ~0.25–0.35s
        elif event == 'turn':
            self._event_type      = 'turn'
            self._event_remaining = random.randint(20, 50)   # 0.4–1s turn
            self._turn_dir        = random.choice([-1, 1])
        elif event == 'brake':
            self._event_type      = 'brake'
            self._event_remaining = random.randint(15, 40)
        elif event == 'bump':
            self._event_type      = 'bump'
            self._event_remaining = random.randint(6, 10)
        else:
            self._event_type = None

        self._event_countdown = random.randint(25, 80)

    # ── Public API ────────────────────────────────────────────────────────────
    def reading(self) -> dict:
        """Returns {'ax','ay','az','gr','gp','gy'} in m/s² and °/s."""
        with self._lock:
            return {
                'ax': round(self._ax, 3),
                'ay': round(self._ay + random.gauss(0, 0.02), 3),
                'az': round(self._az, 3),
                'gr': round(self._gr, 3),
                'gp': round(self._gp, 3),
                'gy': round(self._gy, 3),
            }

    def orientation(self) -> dict:
        """Legacy interface: returns pitch/roll/yaw in degrees."""
        r = self.reading()
        return {
            'pitch': round(r['gp'] * 0.02, 2),   # integrate ~50Hz
            'roll':  round(r['gr'] * 0.02, 2),
            'yaw':   round(r['gy'] * 0.02, 2),
        }
