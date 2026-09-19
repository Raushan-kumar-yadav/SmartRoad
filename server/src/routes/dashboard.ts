 
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

 
router.get("/dashboard/tickets", async (req: Request, res: Response) => {
  try {
    const { status, priority, zone, limit = "200", offset = "0" } = req.query as Record<string, string>;

    const tickets = await prisma.ticket.findMany({
      where: {
        ...(status   ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(zone     ? { wardZone: zone } : {}),
      },
      include: {
        report: {
          select: {
            className: true,
            confidence: true,
            lat: true,
            lon: true,
            imagePath:  true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit), 1000),
      skip: parseInt(offset),
    });

    // Flatten report fields to top-level
    const flat = tickets.map((t) => ({
      id: t.id,
      ticketCode:  t.ticketCode,
      status: t.status,
      priority: t.priority,
      wardName: t.wardName,
      wardZone: t.wardZone,
      assignedTo:  t.assignedTo,
      notes: t.notes,
      createdAt:   t.createdAt,
      resolvedAt:  t.resolvedAt,
      // From report:
      className: t.report?.className  ?? "unknown",
      confidence: t.report?.confidence ?? 0,
      lat: t.report?.lat ?? null,
      lon: t.report?.lon ?? null,
      imagePath:   t.report?.imagePath  ?? null,
      // Merge count not tracked yet  
      reportCount: 1,
    }));

    res.json(flat);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

 
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const total = await prisma.detectionReport.count();
    const openTickets = await prisma.ticket.count({ where: { status: "open" } });
    const resolved = await prisma.ticket.count({ where: { status: "resolved" } });
    const inProgress  = await prisma.ticket.count({ where: { status: "in_progress" } });
    const assigned = await prisma.ticket.count({ where: { status: "assigned" } });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = await prisma.detectionReport.count({ where: { createdAt: { gte: cutoff } } });

    const byClassRaw = await prisma.detectionReport.groupBy({ by: ["className"], _count: { id: true } });
    const byPriorityRaw = await prisma.ticket.groupBy({ by: ["priority"], _count: { id: true } });
    const byStatusRaw   = await prisma.ticket.groupBy({ by: ["status"], _count: { id: true } });
    const byWardRaw = await prisma.ticket.groupBy({ by: ["wardZone"], _count: { id: true }, where: { status: { not: "resolved" } } });

    res.json({
      total,
      openTickets,
      resolvedTickets: resolved,
      inProgress,
      assigned,
      last24h,
      byClass: Object.fromEntries(byClassRaw.map(r    => [r.className, r._count.id])),
      byPriority: Object.fromEntries(byPriorityRaw.map(r => [r.priority,  r._count.id])),
      byStatus: Object.fromEntries(byStatusRaw.map(r   => [r.status,    r._count.id])),
      byWard: Object.fromEntries(byWardRaw.map(r     => [r.wardZone,  r._count.id])),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
