import { CLASS_EMOJI, STATUS_LABEL, type Ticket } from '../data/mockData';

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function getConfidenceColor(c: number): string {
  if (c >= 0.85) return '#22c55e';
  if (c >= 0.70) return '#eab308';
  return '#f97316';
}

interface Props {
  ticket: Ticket;
  onClick?: (ticket: Ticket) => void;
}

export default function TicketCard({ ticket, onClick }: Props) {
  const emoji = CLASS_EMOJI[ticket.className] ?? '📋';
  const confColor = getConfidenceColor(ticket.confidence);

  return (
    <div className="ticket-card" onClick={() => onClick?.(ticket)}>
      <div className="ticket-card-image-placeholder">
        <span style={{ fontSize: 48 }}>{emoji}</span>
      </div>

      <div className="ticket-card-body">
        <div className="ticket-card-top">
          <div className="ticket-code">{ticket.ticketCode}</div>
          <span className={`priority-badge ${ticket.priority}`}>{ticket.priority}</span>
        </div>

        <div className="ticket-class">
          {ticket.className.replace(/_/g, ' ')}
          {ticket.reportCount > 1 && (
            <span style={{ fontSize: 11, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderRadius: 4, padding: '1px 6px', marginLeft: 8, fontWeight: 600 }}>
              ×{ticket.reportCount}
            </span>
          )}
        </div>

        <div className="ticket-meta">
          <div className="ticket-meta-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            {ticket.wardName}
          </div>
          <div className="ticket-meta-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {timeAgo(ticket.createdAt)}
          </div>
          <div className="ticket-meta-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
            {ticket.lat.toFixed(4)}, {ticket.lon.toFixed(4)}
          </div>
        </div>

        <div className="confidence-bar-wrap">
          <div className="confidence-bar-label">
            <span>Confidence</span>
            <span style={{ color: confColor, fontWeight: 600 }}>{(ticket.confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="confidence-bar">
            <div className="confidence-bar-fill" style={{ width: `${ticket.confidence * 100}%`, background: confColor }} />
          </div>
        </div>

        <div className="ticket-card-footer">
          <span className="status-label">
            <span className={`status-dot ${ticket.status}`} />
            {STATUS_LABEL[ticket.status] ?? ticket.status}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {ticket.assignedTo.split(' ').slice(-2).join(' ')}
          </span>
        </div>
      </div>
    </div>
  );
}
