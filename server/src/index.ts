/**
 * SmartRoad — Express + Socket.IO Server (TypeScript)
 *
 * Start:  npm run dev
 * API:    http://localhost:8000
 * WS:     ws://localhost:8000  (Socket.IO)
 */

import "dotenv/config";
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import detectionsRouter from "./routes/detections";
import ticketsRouter    from "./routes/tickets";
import dashboardRouter  from "./routes/dashboard";
import liveRouter       from "./routes/live";
import configRouter     from "./routes/config";

const PORT = parseInt(process.env["PORT"] ?? "8000", 10);

//   App  
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PATCH", "DELETE"] },
});

app.set("io", io);

//   Middleware  
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve evidence images
const imgDir = path.join(__dirname, "../evidence_images");
app.use("/images", express.static(imgDir));

// ── Routes ─────────────────────────────────────────────────────
app.use("/api", detectionsRouter);
app.use("/api", ticketsRouter);
app.use("/api", dashboardRouter);
app.use("/api", liveRouter);
app.use("/api", configRouter);

app.get("/", (_req, res) => {
  res.json({
    service: "SmartRoad API",
    version: "2.0.0 (Node.js + TypeScript)",
    endpoints: {
      "POST   /api/report":      "Submit detection (auto-raises ticket + notifies ward)",
      "GET    /api/reports":     "List all reports",
      "GET    /api/reports/:id": "Single report",
      "DELETE /api/reports/:id": "Delete report",
      "GET    /api/stats":       "Summary stats",
      "GET    /api/tickets":     "List all tickets",
      "GET    /api/tickets/:id": "Single ticket",
      "PATCH  /api/tickets/:id": "Update ticket status",
      "WS     /":                "Socket.IO: new_detection | ticket_raised | ticket_updated",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Socket.IO ──────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`[WS] Disconnected: ${socket.id}`));
});

// ── Start ──────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log("============================================");
  console.log("  SmartRoad Server v2.0  (TypeScript)");
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Socket.IO ready`);
  console.log("============================================");
});
