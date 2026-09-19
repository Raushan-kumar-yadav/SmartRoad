import type { GpsConfig, GyroConfig } from './types';

export const API = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000';

export const CAM_PRESETS = [
  { label: 'USB Webcam (0)',     source: '0',                                    icon: '📷', hint: 'Built-in / first USB camera' },
  { label: 'USB Webcam (1)',     source: '1',                                    icon: '📷', hint: 'Second USB camera' },
  { label: 'IP Webcam (Phone)', source: 'http://192.168.1.x:8080/video',        icon: '📱', hint: 'Android: IP Webcam app' },
  { label: 'DroidCam',          source: 'http://192.168.1.x:4747/video',        icon: '📱', hint: 'Android: DroidCam app' },
  { label: 'RTSP Camera',       source: 'rtsp://user:pass@192.168.1.x/stream',  icon: '🎥', hint: 'IP camera / NVR' },
  { label: 'Video File',        source: 'road_clip.mp4',                         icon: '📂', hint: 'Loops a local video file' },
];

export const GPS_CITIES = [
  { city: 'New Delhi',  lat: 28.6139, lon: 77.2090 },
  { city: 'Mumbai',     lat: 19.0760, lon: 72.8777 },
  { city: 'Bangalore',  lat: 12.9716, lon: 77.5946 },
  { city: 'Chennai',    lat: 13.0827, lon: 80.2707 },
  { city: 'Hyderabad',  lat: 17.3850, lon: 78.4867 },
  { city: 'Kolkata',    lat: 22.5726, lon: 88.3639 },
];

export const DEF_GPS: GpsConfig = {
  mode: 'simulate',
  startLat: 28.6139,
  startLon: 77.2090,
  city: 'New Delhi',
  minSpeedKmh: 20,
  maxSpeedKmh: 50,
  serialPort: 'COM3',
  baudRate: 9600,
};

export const DEF_GYRO: GyroConfig = {
  mode: 'simulate',
  updateHz: 50,
  noiseLevel: 'medium',
  enableEvents: true,
  serialPort: 'COM4',
};

// ── Shared style tokens ──────────────────────────────────────────────────────

export const sInp: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 5,
  background: 'var(--bg-popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
};

export const sLbl: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 500,
  display: 'block',
};

export const sCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  marginBottom: 14,
};
