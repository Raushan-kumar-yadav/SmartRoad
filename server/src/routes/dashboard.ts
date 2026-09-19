import { Router, Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

 type TicketRow = Prisma.TicketGetPayload<{
  include: {
    report: {
      select: {
        className:  true;
        confidence: true;
        lat: true;
        lon: true;
        imagePath:  true;
      };
    };
  };
}>;

// GET /api/dashboard/tickets
router.get("/dashboard/tickets", async (req: Request, res: Response) => {
  try {
    const { status, priority, zone, limit = "200", offset = "0" } =
      req.query as Record<string, string>;

    const where: Prisma.TicketWhereInput = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(zone ? { wardZone: zone } : {}),
    };

    const tickets: TicketRow[] = await prisma.ticket.findMany({
      where,
      include: {
        report: {
          select: {
            className:  true,
            confidence: true,
            lat: true,
            lon: true,
            imagePath:  true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit, 10), 1000),
      skip: parseInt(offset, 10),
    });

    const flat = tickets.map((t: TicketRow) => ({
      id: t.id,
      ticketCode:  t.ticketCode,
      status: t.status,
      priority: t.priority,
      wardName: t.wardName,
      wardZone: t.wardZone,
      assignedTo:  t.assignedTo,
      notes: t.notes,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      className: t.report?.className  ?? "unknown",
      confidence: t.report?.confidence ?? 0,
      lat: t.report?.lat ?? null,
      lon: t.report?.lon ?? null,
      imagePath: t.report?.imagePath  ?? null,
      reportCount: 1,
    }));

    res.json(flat);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Explicit types for groupBy results
type GroupByCount = { _count: { id: number } };
type ClassGroup = GroupByCount & { className: string };
type PriorityGroup = GroupByCount & { priority: string };
type StatusGroup   = GroupByCount & { status: string };
type WardGroup = GroupByCount & { wardZone: string };

// GET /api/dashboard/stats
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, openTickets, resolved, inProgress, assigned, last24h] =
      await Promise.all([
        prisma.detectionReport.count(),
        prisma.ticket.count({ where: { status: "open" } }),
        prisma.ticket.count({ where: { status: "resolved" } }),
        prisma.ticket.count({ where: { status: "in_progress" } }),
        prisma.ticket.count({ where: { status: "assigned" } }),
        prisma.detectionReport.count({ where: { createdAt: { gte: cutoff } } }),
      ]);

    const [byClassRaw, byPriorityRaw, byStatusRaw, byWardRaw] =
      (await Promise.all([
        prisma.detectionReport.groupBy({ by: ["className"], _count: { id: true } }),
        prisma.ticket.groupBy({ by: ["priority"], _count: { id: true } }),
        prisma.ticket.groupBy({ by: ["status"], _count: { id: true } }),
        prisma.ticket.groupBy({ 
          by:    ["wardZone"],
          _count: { id: true },
          where: { status: { not: "resolved" } },
        }),
      ])) as [ClassGroup[], PriorityGroup[], StatusGroup[], WardGroup[]];


    res.json({
      total,
      openTickets,
      resolvedTickets: resolved,
      inProgress,
      assigned,
      last24h,
      byClass: Object.fromEntries(byClassRaw.map( (r: ClassGroup) => [r.className, r._count.id])),
      byPriority: Object.fromEntries(byPriorityRaw.map((r: PriorityGroup) => [r.priority,  r._count.id])),
      byStatus: Object.fromEntries(byStatusRaw.map( (r: StatusGroup) => [r.status, r._count.id])),
      byWard: Object.fromEntries(byWardRaw.map( (r: WardGroup) => [r.wardZone, r._count.id])),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
