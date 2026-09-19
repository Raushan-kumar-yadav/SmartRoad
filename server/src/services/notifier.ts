 

import nodemailer from "nodemailer";
import axios from "axios";
import path from "path";
import { PrismaClient } from "@prisma/client";
import type { WardInfo } from "./wardMapper";

// Derive model types from PrismaClient — IDE + tsc compatible
type Ticket          = Awaited<ReturnType<PrismaClient["ticket"]["findUniqueOrThrow"]>>;
type DetectionReport = Awaited<ReturnType<PrismaClient["detectionReport"]["findUniqueOrThrow"]>>;



const PRIORITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  high: "⚠️",
  medium: "🔶",
  low: "🔷",
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env["GMAIL_USER"],
    pass: process.env["GMAIL_APP_PASSWORD"],
  },
});

interface NotifyPayload {
  ticket: Ticket;
  report: DetectionReport;
  wardContact: WardInfo["contact"];
}

interface NotifResult {
  type: string;
  status: string;
  recipient?: string;
}

async function sendEmail({ ticket, report, wardContact }: NotifyPayload): Promise<NotifResult> {
  const gmailUser = process.env["GMAIL_USER"];
  const gmailPass = process.env["GMAIL_APP_PASSWORD"];
  const notConfigured = !gmailUser || gmailUser === "your_email@gmail.com" || !gmailPass;

  if (notConfigured) {
    console.log("[Notifier] EMAIL (mock) — Gmail not configured:");
    console.log(` To: ${wardContact.email}`);
    console.log(` Ticket: ${ticket.ticketCode} [${ticket.priority.toUpperCase()}]`);
    console.log(` Defect: ${report.className} @ (${report.lat}, ${report.lon})`);
    return { type: "email", status: "mock", recipient: wardContact.email };
  }

  const emoji = PRIORITY_EMOJI[ticket.priority] ?? "📋";
  const mapsUrl  = report.lat && report.lon
    ? `https://maps.google.com/?q=${report.lat},${report.lon}`
    : "GPS unavailable";
  const wardName = ticket.wardName ?? "Unknown Ward";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;border:2px solid #e74c3c;border-radius:8px;padding:20px;">
      <h2 style="color:#e74c3c;">${emoji} SmartRoad — New Defect Ticket</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Ticket ID</td>
            <td style="padding:8px;">${ticket.ticketCode}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Defect Type</td>
            <td style="padding:8px;text-transform:capitalize;">${report.className.replace(/_/g, " ")}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Priority</td>
            <td style="padding:8px;color:#e74c3c;font-weight:bold;text-transform:uppercase;">${ticket.priority}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Ward / Zone</td>
            <td style="padding:8px;">${wardName}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">GPS Location</td>
            <td style="padding:8px;"><a href="${mapsUrl}">${report.lat}, ${report.lon}</a></td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Confidence</td>
            <td style="padding:8px;">${(report.confidence * 100).toFixed(1)}%</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Detected At</td>
            <td style="padding:8px;">${new Date(report.createdAt).toLocaleString("en-IN")}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:bold;">Assigned To</td>
            <td style="padding:8px;">${wardContact.officer}</td></tr>
      </table>
      <p style="margin-top:16px;color:#666;">
        Please inspect and resolve this defect at the earliest.<br>
        <strong>SmartRoad Automated Alert System</strong>
      </p>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"SmartRoad System" <${gmailUser}>`,
      to:      wardContact.email,
      subject: `${emoji} [${ticket.ticketCode}] ${ticket.priority.toUpperCase()} — ${report.className.replace(/_/g, " ")} in ${wardName}`,
      html,
    });
    console.log(`[Notifier] Email sent → ${wardContact.email} for ${ticket.ticketCode}`);
    return { type: "email", status: "sent", recipient: wardContact.email };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifier] Email failed: ${msg}`);
    return { type: "email", status: "failed", recipient: wardContact.email };
  }
}

async function sendWebhook({ ticket, report, wardContact }: NotifyPayload): Promise<NotifResult> {
  const webhookUrl = process.env["WARD_WEBHOOK_URL"];
  if (!webhookUrl) return { type: "webhook", status: "skipped" };

  const imageName = report.imagePath ? path.basename(report.imagePath) : null;
  const payload = {
    ticketId:   ticket.ticketCode,
    defectType: report.className,
    priority:   ticket.priority,
    ward:       ticket.wardName,
    zone:       ticket.wardZone,
    gps:        { lat: report.lat, lon: report.lon },
    confidence: report.confidence,
    imageUrl:   imageName ? `http://localhost:${process.env["PORT"] ?? 8000}/images/${imageName}` : null,
    detectedAt: report.createdAt,
    assignedTo: wardContact.officer,
    phone:      wardContact.phone,
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 5000 });
    console.log(`[Notifier] Webhook sent → ${webhookUrl} for ${ticket.ticketCode}`);
    return { type: "webhook", status: "sent", recipient: webhookUrl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[Notifier] Webhook failed (${msg})`);
    return { type: "webhook", status: "failed", recipient: webhookUrl };
  }
}

export async function notify(payload: NotifyPayload): Promise<NotifResult[]> {
  if (process.env["NOTIFY_ENABLED"] !== "true") {
    console.log("[Notifier] Disabled via NOTIFY_ENABLED=false");
    return [];
  }

  const results = await Promise.allSettled([
    sendEmail(payload),
    sendWebhook(payload),
  ]);

  return results.map((r: PromiseSettledResult<NotifResult>) =>
    r.status === "fulfilled" ? r.value : { type: "unknown", status: "failed" }
  );
}
