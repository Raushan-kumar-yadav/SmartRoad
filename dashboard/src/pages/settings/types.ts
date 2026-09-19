export interface GpsConfig {
  mode: 'simulate' | 'serial';
  startLat: number;
  startLon: number;
  city: string;
  minSpeedKmh: number;
  maxSpeedKmh: number;
  serialPort: string;
  baudRate: number;
}

export interface GyroConfig {
  mode: 'simulate' | 'real';
  updateHz: number;
  noiseLevel: 'low' | 'medium' | 'high';
  enableEvents: boolean;
  serialPort: string;
}

export interface EdgeConfig {
  cameraSource: string;
  cameraLabel: string;
  modelPath: string;
  confidence: number;
  inferEvery: number;
  streamPort: number;
  uploadEnabled: boolean;
  updatedAt?: string;
  gps: GpsConfig;
  gyro: GyroConfig;
}

export interface TestResult {
  reachable: boolean | null;
  statusCode?: number;
  contentType?: string;
  error?: string;
  note?: string;
}

export interface EdgeStatus {
  active: boolean;
  fps: number;
  lan_ip: string | null;
  port: number | null;
  gui_url: string | null;
  stream_url: string | null;
  phone_active: boolean;
  phone_source: string | null;
  current_source: string | null;
  model_ready: boolean;
}

export interface DetectedCamera {
  index: number;
  source: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export interface LiveCamera {
  source: string;
  label: string;
  icon: string;
  hint: string;
  live?: boolean;
}

export type Tab = 'camera' | 'gps' | 'gyro';
