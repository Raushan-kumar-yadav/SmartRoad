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

// Config file lives next to server (e:\Pothole\edge.config.json)
const CONFIG_PATH = path.resolve(__dirname, "../../../../edge.config.json");

interface EdgeConfig {
  cameraSource: string;        // "0" | "1" | "http://..." | "rtsp://..."
  cameraLabel:  string;        // human label for UI
  modelPath:    string;
  confidence:   number;
  inferEvery:   number;
  streamPort:   number;
  uploadEnabled: boolean;
  updatedAt:    string;
}

const DEFAULT_CONFIG: EdgeConfig = {
  cameraSource:  "0",
  cameraLabel:   "USB Webcam (index 0)",
  modelPath:     String.raw`e:\Pothole\pretrained\rdd\best.pt`,
  confidence:    0.35,
  inferEvery:    5,
  streamPort:    8080,
  uploadEnabled: true,
  updatedAt:     new Date().toISOString(),
};

function readConfig(): EdgeConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<EdgeConfig>) };
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

export default router;
