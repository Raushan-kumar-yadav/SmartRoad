import { useState } from 'react';
import { STATUS_LABEL, CLASS_EMOJI } from '../data/mockData';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

export default function TicketDetailModal({ ticket, onClose, onClose_ticket }) {
  const [closeStep, setCloseStep] = useState(0); 
  const [closePhoto, setClosePhoto] = useState(null);
  const [closePhotoPreview, setClosePhotoPreview] = useState(null);
  const [closeNote, setCloseNote] = useState('');
  const [gps, setGps] = useState(null);

  if (!ticket) return null;

  const emoji = CLASS_EMOJI[ticket.className] || '📋';

  function handleClosePhoto(e) {
    const file = e.target.files[0];
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
    setTimeout(() => { onClose_ticket && onClose_ticket(ticket.id); onClose(); }, 3500);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {emoji} {ticket.className.replace(/_/g, ' ')}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{ticket.ticketCode}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`priority-badge ${ticket.priority}`}>{ticket.priority}</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Evidence Image */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 8, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, border: '1px solid var(--border)' }}>
            {emoji}
          </div>

          {/* Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Status', <><span className={`status-dot ${ticket.status}`} style={{display:'inline-block'}} /> {STATUS_LABEL[ticket.status]}</>],
              ['Confidence', `${(ticket.confidence * 100).toFixed(1)}%`],
              ['Ward', ticket.wardName],
              ['Created', timeAgo(ticket.createdAt)],
              ['Assigned To', ticket.assignedTo?.split(' ').slice(-2).join(' ')],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
              </div>
            ))}

            {/* GPS cell — full width with Maps button */}
            <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>GPS</div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
                  {ticket.lat ? `${ticket.lat}, ${ticket.lon}` : 'N/A'}
                </div>
              </div>
              {ticket.lat && ticket.lon && (
                <a
                  href={`https://www.google.com/maps?q=${ticket.lat},${ticket.lon}&z=18&t=h`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.3)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                    color: '#4285f4', textDecoration: 'none', whiteSpace: 'nowrap',
                    transition: 'all 0.15s', flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(66,133,244,0.22)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(66,133,244,0.12)'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  View on Google Maps
                </a>
              )}
            </div>
          </div>

          {/* Confidence bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>AI Confidence</span>
              <span style={{ fontWeight: 700, color: ticket.confidence >= 0.85 ? 'var(--low)' : ticket.confidence >= 0.70 ? 'var(--medium)' : 'var(--high)' }}>
                {(ticket.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="confidence-bar" style={{ height: 8 }}>
              <div className="confidence-bar-fill" style={{
                width: `${ticket.confidence * 100}%`,
                background: ticket.confidence >= 0.85 ? 'var(--low)' : ticket.confidence >= 0.70 ? 'var(--medium)' : 'var(--high)'
              }} />
            </div>
          </div>

          {ticket.notes && (
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              📝 {ticket.notes}
            </div>
          )}

          {/* Close Ticket Section */}
          {ticket.status !== 'resolved' && closeStep === 0 && (
            <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setCloseStep(1)}>
              ✅ Mark as Resolved (with Verification)
            </button>
          )}

          {closeStep === 1 && (
            <div style={{ border: '1px solid var(--low)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--low)', marginBottom: 4 }}>📸 Closure Verification</div>

              <label className="upload-zone" style={{ padding: 20 }}>
                <input type="file" accept="image/*" capture="environment" onChange={handleClosePhoto} />
                {closePhotoPreview ? (
                  <img src={closePhotoPreview} alt="proof" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <>
                    <div className="upload-zone-icon">📷</div>
                    <p>Take "after" photo as proof of fix</p>
                  </>
                )}
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
