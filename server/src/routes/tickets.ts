 
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

const VALID_STATUSES = ["open", "assigned", "in_progress", "resolved"] as const;
type TicketStatus = typeof VALID_STATUSES[number];

// GET /api/tickets
router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const { status, priority, zone, limit = "100", offset = "0" } = req.query as Record<string, string>;
    const tickets = await prisma.ticket.findMany({
      where: {
        ...(status   ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(zone     ? { wardZone: zone } : {}),
      },
      include: {
        report: { select: { className: true, confidence: true, lat: true, lon: true, imagePath: true, createdAt: true } },
        notifications: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(parseInt(limit), 500),
      skip: parseInt(offset),
    });
    res.json(tickets);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/tickets/:id
router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(String(req.params["id"])) },
      include: { report: true, notifications: true },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(ticket);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/tickets/:id
router.patch("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params["id"]));
    const { status, assignedTo, notes } = req.body as { status?: string; assignedTo?: string; notes?: string };

    if (status && !VALID_STATUSES.includes(status as TicketStatus)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }

    const updateData: {
      status?: string;
      assignedTo?: string;
      notes?: string;
      resolvedAt?: Date;
    } = {};

    if (status) updateData.status     = status;
    if (assignedTo) updateData.assignedTo = assignedTo;
    if (notes) updateData.notes      = notes;
    if (status === "resolved") updateData.resolvedAt = new Date();

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: { report: true },
    });

    const io = req.app.get("io") as import("socket.io").Server | undefined;
    io?.emit("ticket_updated", { ticketId: id, status: ticket.status, ticketCode: ticket.ticketCode });

    console.log(`[Ticket] ${ticket.ticketCode} → ${ticket.status}`);
    res.json(ticket);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "P2025") { res.status(404).json({ error: "Ticket not found" }); return; }
    res.status(500).json({ error: e.message ?? String(err) });
  }
});

export default router;
