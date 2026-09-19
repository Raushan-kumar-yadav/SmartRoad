 
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { mapToWard } from "../services/wardMapper";
import { notify } from "../services/notifier";

const router = Router();
const prisma = new PrismaClient();

const CLASS_PRIORITY: Record<string, string> = {
  broken_pole: "critical",
  pothole: "high",
  waterlogging: "high",
  road_crack: "medium",
  broken_footpath: "low",
  garbage_dump: "low",
};

let ticketCounter = 0;

function generateTicketCode(): string {
  ticketCounter++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `TKT-${date}-${String(ticketCounter).padStart(4, "0")}`;
}

// POST /api/report
router.post("/report", async (req: Request, res: Response) => {
  try {
    const {
      class_id, class_name, confidence, lat, lon,
      source, bbox_x1, bbox_y1, bbox_x2, bbox_y2,
      image_b64, notes,
    } = req.body as Record<string, unknown>;

    if (!class_name || confidence === undefined) {
      res.status(400).json({ error: "class_name and confidence are required" });
      return;
    }

    // Save base64 image if provided
    let imagePath: string | null = null;
    if (typeof image_b64 === "string") {
      const imgDir = path.join(__dirname, "../../evidence_images");
      fs.mkdirSync(imgDir, { recursive: true });
      const fname = `${class_name}_${Date.now()}.jpg`;
      imagePath   = path.join(imgDir, fname);
      fs.writeFileSync(imagePath, Buffer.from(image_b64, "base64"));
    }

    const report = await prisma.detectionReport.create({
      data: {
        classId: typeof class_id === "number"    ? class_id : 0,
        className:  String(class_name),
        confidence: parseFloat(String(confidence)),
        lat: lat !== undefined ? parseFloat(String(lat)) : null,
        lon: lon !== undefined ? parseFloat(String(lon)) : null,
        source: typeof source === "string" ? source : "edge",
        imagePath,
        bboxX1: bbox_x1 !== undefined ? parseFloat(String(bbox_x1)) : null,
        bboxY1: bbox_y1 !== undefined ? parseFloat(String(bbox_y1)) : null,
        bboxX2: bbox_x2 !== undefined ? parseFloat(String(bbox_x2)) : null,
        bboxY2: bbox_y2 !== undefined ? parseFloat(String(bbox_y2)) : null,
        notes: typeof notes === "string" ? notes : null,
      },
    });

    const latNum = report.lat ?? undefined;
    const lonNum = report.lon ?? undefined;
    const { wardName, wardZone, contact: wardContact } = mapToWard(latNum, lonNum);

    const ticket = await prisma.ticket.create({
      data: {
        ticketCode: generateTicketCode(),
        status:     "open",
        priority:   CLASS_PRIORITY[report.className] ?? "medium",
        wardName,
        wardZone,
        assignedTo: wardContact.officer,
        reportId:   report.id,
      },
    });

    // Notify asynchronously  
    void notify({ ticket, report, wardContact }).then(async (results) => {
      for (const n of results) {
        await prisma.notification.create({
          data: {
            type: n.type,
            status: n.status,
            recipient: n.recipient ?? "",
            body: `Ticket ${ticket.ticketCode} notification`,
            ticketId:  ticket.id,
          },
        }).catch(() => {});
      }
    });

    // Real-time push
    const io = req.app.get("io") as import("socket.io").Server | undefined;
    io?.emit("new_detection", { report, ticket });
    io?.emit("ticket_raised", { ticket, wardName, priority: ticket.priority });

    console.log(
      `[Detection] ${report.className} (${(report.confidence * 100).toFixed(1)}%) ` +
      `→ ${ticket.ticketCode} [${ticket.priority.toUpperCase()}] — ${wardName}`
    );

    res.status(201).json({ report, ticket });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Detection] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/reports
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const { class_name, min_confidence = "0", limit = "200", offset = "0" } = req.query as Record<string, string>;
    const reports = await prisma.detectionReport.findMany({
      where: {
        ...(class_name ? { className: class_name } : {}),
        confidence: { gte: parseFloat(min_confidence) },
      },
      include: { ticket: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit), 1000),
      skip: parseInt(offset),
    });
    res.json(reports);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/reports/:id
router.get("/reports/:id", async (req: Request, res: Response) => {
  try {
    const report = await prisma.detectionReport.findUnique({
      where: { id: parseInt(String(req.params["id"])) },
      include: { ticket: { include: { notifications: true } } },
    });
    if (!report) { res.status(404).json({ error: "Report not found" }); return; }
    res.json(report);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/reports/:id
router.delete("/reports/:id", async (req: Request, res: Response) => {
  try {
    await prisma.detectionReport.delete({ where: { id: parseInt(String(req.params["id"])) } });
    res.json({ message: `Report ${req.params["id"]} deleted` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/stats
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const total      = await prisma.detectionReport.count();
    const byClassRaw = await prisma.detectionReport.groupBy({
      by: ["className"],
      _count: { id: true },
    });
    const byClass = Object.fromEntries(byClassRaw.map(r => [r.className, r._count.id]));
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = await prisma.detectionReport.count({ where: { createdAt: { gte: cutoff } } });
    const openTickets = await prisma.ticket.count({ where: { status: "open" } });
    const resolvedTickets = await prisma.ticket.count({ where: { status: "resolved" } });

    res.json({ total, byClass, last24h, openTickets, resolvedTickets });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/mock-mcd  
router.post("/mock-mcd", (req: Request, res: Response) => {
  const body = req.body as { ticketId?: string; defectType?: string; ward?: string };
  console.log(`[MCD System] Received: ${body.ticketId} — ${body.defectType} in ${body.ward}`);
  res.json({ status: "received", message: "MCD ticket logged" });
});

export default router;
