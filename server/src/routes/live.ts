import { Router, Request, Response } from "express";
import http  from "http";
import https from "https";

const router = Router();

const PI_HOST    = process.env["PI_HOST"]              ?? "localhost";
const PI_PORT    = parseInt(process.env["PI_STREAM_PORT"] ?? "8080", 10);
const PI_TIMEOUT = 3000;

// self-signed cert - disable verification for local-network edge device
const TLS_OPTS = { rejectUnauthorized: false };

/** GET via https (self-signed OK) */
function piGet(opts: http.RequestOptions, cb: (res: http.IncomingMessage) => void) {
  return https.get({ ...opts, ...TLS_OPTS } as https.RequestOptions, cb);
}

// Check if edge stream server is reachable
function checkPiAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = piGet(
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
    res.json({ online: false, streamUrl: null, infoUrl: null,
               message: `Edge device not reachable at ${PI_HOST}:${PI_PORT}` });
    return;
  }
  let info: Record<string, unknown> = {};
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      piGet({ hostname: PI_HOST, port: PI_PORT, path: "/info", timeout: 2000 }, (r) => {
        let data = "";
        r.on("data", (c: string) => (data += c));
        r.on("end",  ()          => resolve(data));
      }).on("error", reject);
    });
    info = JSON.parse(raw) as Record<string, unknown>;
  } catch { /* info stays empty */ }

  res.json({ online: true, streamUrl: `/api/live/stream`, infoUrl: `/api/live/info`,
             piHost: PI_HOST, piPort: PI_PORT, ...info });
});

// GET /api/live/info  — proxies edge /info JSON
router.get("/live/info", async (_req: Request, res: Response) => {
  const alive = await checkPiAlive();
  if (!alive) { res.status(503).json({ online: false }); return; }
  piGet({ hostname: PI_HOST, port: PI_PORT, path: "/info", timeout: 2000 }, (piRes) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    piRes.pipe(res);
  }).on("error", () => res.status(503).json({ online: false }));
});

// GET /api/live/stream — MJPEG proxy (infinite stream, no timeout)
router.get("/live/stream", (req: Request, res: Response) => {
  const piReq = piGet(
    { hostname: PI_HOST, port: PI_PORT, path: "/stream" },
    (piRes) => {
      piRes.socket?.setKeepAlive(true);
      res.setHeader("Content-Type",  piRes.headers["content-type"] ?? "multipart/x-mixed-replace; boundary=frame");
      res.setHeader("Cache-Control", "no-cache, no-store");
      res.setHeader("Connection",    "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      piRes.pipe(res);
      piRes.on("error", () => res.destroy());
    }
  );
  piReq.on("error", () => {
    if (!res.headersSent) res.status(503).json({ error: "Edge device not reachable" });
  });
  req.on("close", () => { piReq.destroy(); });
});

export default router;
