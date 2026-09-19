/**
 * SmartRoad — Edge Config Routes
 *
 * Stores edge device configuration (camera source, model, confidence, etc.)
 * in a JSON file so the dashboard can read/write it and edge.detect can load it.
 *
 * GET  /api/config        — read current config
 * POST /api/config        — update config
 * GET  /api/config/test   — test if a camera URL is reachable (HTTP sources only)
 */

import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";

const router = Router();

// Config file lives at workspace root (e:\Pothole\edge.config.json)
// process.cwd() is always the directory where `npm run dev:server` was launched from
// (i.e. e:\Pothole\server), so go one level up to reach the workspace root.
const CONFIG_PATH = path.resolve(process.cwd(), "..", "edge.config.json");

interface EdgeConfig {
  cameraSource:  string;
  cameraLabel:   string;
  modelPath:     string;
  confidence:    number;
  inferEvery:    number;
  streamPort:    number;
  uploadEnabled: boolean;
  updatedAt:     string;
  gps: {
    mode:        "simulate" | "serial";
    startLat:    number;
    startLon:    number;
    city:        string;
    minSpeedKmh: number;
    maxSpeedKmh: number;
    serialPort:  string;
    baudRate:    number;
  };
  gyro: {
    mode:          "simulate" | "real";
    updateHz:      number;
    noiseLevel:    "low" | "medium" | "high";
    enableEvents:  boolean;
    serialPort:    string;
  };
}

const DEFAULT_GPS = {
  mode:        "simulate" as const,
  startLat:    28.6139,
  startLon:    77.2090,
  city:        "New Delhi",
  minSpeedKmh: 20,
  maxSpeedKmh: 50,
  serialPort:  "COM3",
  baudRate:    9600,
};

const DEFAULT_GYRO = {
  mode:         "simulate" as const,
  updateHz:     50,
  noiseLevel:   "medium" as const,
  enableEvents: true,
  serialPort:   "COM4",
};

const DEFAULT_CONFIG: EdgeConfig = {
  cameraSource:  "0",
  cameraLabel:   "USB Webcam (index 0)",
  modelPath:     String.raw`e:\Pothole\pretrained\rdd\best.pt`,
  confidence:    0.35,
  inferEvery:    5,
  streamPort:    8080,
  uploadEnabled: true,
  updatedAt:     new Date().toISOString(),
  gps:           { ...DEFAULT_GPS },
  gyro:          { ...DEFAULT_GYRO },
};

function readConfig(): EdgeConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw  = fs.readFileSync(CONFIG_PATH, "utf-8");
      const saved = JSON.parse(raw) as Partial<EdgeConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...saved,
        // Deep merge nested sections so new keys get defaults
        gps:  { ...DEFAULT_GPS,  ...(saved.gps  ?? {}) },
        gyro: { ...DEFAULT_GYRO, ...(saved.gyro ?? {}) },
      };
    }
  } catch {
    // fall through to default
  }
  return { ...DEFAULT_CONFIG };
}

function writeConfig(cfg: EdgeConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

// GET /api/config
router.get("/config", (_req: Request, res: Response) => {
  res.json(readConfig());
});

// POST /api/config
router.post("/config", (req: Request, res: Response) => {
  const current = readConfig();
  const updated: EdgeConfig = {
    ...current,
    ...(req.body as Partial<EdgeConfig>),
    updatedAt: new Date().toISOString(),
  };
  writeConfig(updated);
  res.json({ ok: true, config: updated });
});

// GET /api/config/test?url=http://... — ping a camera HTTP endpoint
router.get("/config/test", (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };

  if (!url) {
    res.json({ reachable: false, error: "No URL provided" });
    return;
  }

  // Only HTTP/HTTPS sources can be tested from server — RTSP/USB must be tested on edge
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    res.json({ reachable: null, note: "RTSP and USB sources can only be tested locally on the edge device" });
    return;
  }

  const client = url.startsWith("https://") ? https : http;
  const testReq = client.get(url, { timeout: 3000 }, (r) => {
    res.json({ reachable: true, statusCode: r.statusCode, contentType: r.headers["content-type"] });
    testReq.destroy();
  });
  testReq.on("error",   () => res.json({ reachable: false, error: "Connection refused" }));
  testReq.on("timeout", () => { testReq.destroy(); res.json({ reachable: false, error: "Timeout" }); });
});

// GET /api/config/browse-videos — scan local filesystem for video files
router.get("/config/browse-videos", (_req: Request, res: Response) => {
  const VIDEO_EXTS = new Set([".mp4", ".avi", ".mov", ".mkv", ".webm", ".ts", ".mts", ".m4v", ".wmv"]);
  const os = require("os") as typeof import("os");
  const home = os.homedir();

  const searchDirs: string[] = [
    path.join(home, "Desktop"),
    path.join(home, "Videos"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "Pictures"),
    // Workspace root
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", "simulation"),
  ];

  const videos: Array<{ path: string; name: string; sizeKb: number; dir: string }> = [];

  function scanDir(dir: string, depth = 0) {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory() && depth < 2) {
          scanDir(full, depth + 1);
        } else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase())) {
          try {
            const stat = fs.statSync(full);
            videos.push({
              path: full,
              name: e.name,
              sizeKb: Math.round(stat.size / 1024),
              dir: path.relative(home, dir) || dir,
            });
          } catch { /* skip */ }
        }
      }
    } catch { /* dir not accessible */ }
  }

  for (const d of searchDirs) scanDir(d);

  // Sort by name
  videos.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ videos });
});

export default router;
