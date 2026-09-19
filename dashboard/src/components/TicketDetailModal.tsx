import { useState } from 'react';
import { CLASS_EMOJI, STATUS_LABEL, type Ticket } from '../data/mockData';

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onCloseTicket?: (id: number) => void;
}

export default function TicketDetailModal({ ticket, onClose, onCloseTicket }: Props) {
  const [closeStep, setCloseStep] = useState<0 | 1 | 2 | 3>(0);
  const [closePhoto, setClosePhoto] = useState<File | null>(null);
  const [closePhotoPreview, setClosePhotoPreview] = useState<string | null>(null);
  const [closeNote, setCloseNote] = useState('');
  const [gps, setGps] = useState<{ lat: string; lon: string } | null>(null);

  const emoji = CLASS_EMOJI[ticket.className] ?? '📋';
  const confColor = ticket.confidence >= 0.85 ? 'var(--low)' : ticket.confidence >= 0.70 ? 'var(--medium)' : 'var(--high)';

  function handleClosePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setClosePhoto(file);
    setClosePhotoPreview(URL.createObjectURL(file));
  }

  function getGPS() {
    navigator.geolocation.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude.toFixed(6), lon: p.coords.longitude.toFixed(6) }),
      () => setGps({ lat: '28.6139', lon: '77.2090' }),
      { timeout: 8000 }
    );
  }

  function submitClose() {
    setCloseStep(2);
    setTimeout(() => setCloseStep(3), 2000);
    setTimeout(() => { onCloseTicket?.(ticket.id); onClose(); }, 3500);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
          <div>
            <h3>{emoji} {ticket.className.replace(/_/g, ' ')}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{ticket.ticketCode}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`priority-badge ${ticket.priority}`}>{ticket.priority}</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Evidence image placeholder */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 8, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, border: '1px solid var(--border)' }}>
            {emoji}
          </div>

          {/* Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              ['Status',      <><span className={`status-dot ${ticket.status}`} style={{ display: 'inline-block' }} /> {STATUS_LABEL[ticket.status]}</>],
              ['Confidence',  `${(ticket.confidence * 100).toFixed(1)}%`],
              ['Ward',        ticket.wardName],
              ['Reported',    timeAgo(ticket.createdAt)],
              ['GPS',         `${ticket.lat.toFixed(4)}, ${ticket.lon.toFixed(4)}`],
              ['Assigned To', ticket.assignedTo.split(' ').slice(-2).join(' ')],
            ] as [string, React.ReactNode][]).map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Confidence bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>AI Confidence</span>
              <span style={{ fontWeight: 700, color: confColor }}>{(ticket.confidence * 100).toFixed(1)}%</span>
            </div>
            <div className="confidence-bar" style={{ height: 8 }}>
              <div className="confidence-bar-fill" style={{ width: `${ticket.confidence * 100}%`, background: confColor }} />
            </div>
          </div>

          {ticket.notes && (
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              📝 {ticket.notes}
            </div>
          )}

          {/* Close ticket flow */}
          {ticket.status !== 'resolved' && closeStep === 0 && (
            <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setCloseStep(1)}>
              ✅ Mark as Resolved (with Verification)
            </button>
          )}

          {closeStep === 1 && (
            <div style={{ border: '1px solid var(--low)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--low)' }}>📸 Closure Verification Required</div>

              <label className="upload-zone" style={{ padding: 20 }}>
                <input type="file" accept="image/*" capture="environment" onChange={handleClosePhoto} />
                {closePhotoPreview
                  ? <img src={closePhotoPreview} alt="proof" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8 }} />
                  : <><div className="upload-zone-icon">📷</div><p>Take "after" photo as proof of fix</p></>
                }
              </label>

              <button className="btn btn-ghost btn-sm" onClick={getGPS}>
                📍 {gps ? `GPS: ${gps.lat}, ${gps.lon} ✅` : 'Capture current GPS'}
              </button>

              <textarea className="form-textarea" placeholder="Resolution notes (e.g. 'Road patched by contractor')" value={closeNote} onChange={e => setCloseNote(e.target.value)} style={{ minHeight: 70 }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCloseStep(0)}>Cancel</button>
                <button className="btn btn-success" style={{ flex: 2, justifyContent: 'center' }} onClick={submitClose} disabled={!closePhoto}>
                  Submit & Close Ticket
                </button>
              </div>
            </div>
          )}

          {closeStep === 2 && (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
              <div style={{ fontWeight: 600 }}>Verifying closure photo with AI…</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Checking defect is no longer visible</div>
            </div>
          )}

          {closeStep === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontWeight: 700, color: 'var(--low)' }}>Ticket Closed Successfully!</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>AI verified the fix. Ward officer notified.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
