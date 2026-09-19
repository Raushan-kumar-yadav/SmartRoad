 

import { Router, Request, Response } from "express";
import http from "http";

const router = Router();

 
const PI_HOST = process.env["PI_HOST"] ?? "localhost";
const PI_PORT = parseInt(process.env["PI_STREAM_PORT"] ?? "8080", 10);
const PI_TIMEOUT = 3000; // ms to wait for Pi health check

//   Check if Pi stream is reachable  
function checkPiAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: PI_HOST, port: PI_PORT, path: "/health", timeout: PI_TIMEOUT },
      (res) => resolve(res.statusCode === 200)
    );
    req.on("error",   () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

// GET /api/live/status
router.get("/live/status", async (_req: Request, res: Response) => {
  const alive = await checkPiAlive();

  if (!alive) {
    res.json({
      online: false,
      streamUrl: null,
      infoUrl: null,
      message: `Edge device not reachable at ${PI_HOST}:${PI_PORT}`,
    });
    return;
  }

  // Fetch metadata from Pi /info endpoint
  let info: Record<string, unknown> = {};
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: PI_HOST, port: PI_PORT, path: "/info", timeout: 2000 }, (r) => {
        let data = "";
        r.on("data", (c: string) => (data += c));
        r.on("end",  ()          => resolve(data));
      }).on("error", reject);
    });
    info = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // info stays empty  
  }

  res.json({
    online: true,
    streamUrl: `/api/live/stream`,  // proxied through server
    infoUrl:   `/api/live/info`,
    piHost: PI_HOST,
    piPort: PI_PORT,
    ...info,
  });
});

// GET /api/live/info  — proxies Pi /info JSON
router.get("/live/info", async (_req: Request, res: Response) => {
  const alive = await checkPiAlive();
  if (!alive) { res.status(503).json({ online: false }); return; }

  http.get({ hostname: PI_HOST, port: PI_PORT, path: "/info", timeout: 2000 }, (piRes) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    piRes.pipe(res);
  }).on("error", () => res.status(503).json({ online: false }));
});

// GET /api/live/stream   
router.get("/live/stream", (req: Request, res: Response) => {
  const piReq = http.get(
    { hostname: PI_HOST, port: PI_PORT, path: "/stream", timeout: 5000 },
    (piRes) => {
      res.setHeader("Content-Type",  piRes.headers["content-type"] ?? "multipart/x-mixed-replace; boundary=frame");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");
      piRes.pipe(res);
    }
  );
  piReq.on("error", () => res.status(503).json({ error: "Edge device not reachable" }));
  req.on("close", () => piReq.destroy());   
});

export default router;
