import { useState } from 'react';

interface Props {
  onClose: () => void;
  onSubmit?: (data: { category: string; description: string; location: string; photo: File | null; gps: { lat: string; lon: string } | null }) => void;
}

export default function RaiseComplaintModal({ onClose, onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ description: '', category: 'pothole', location: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: string; lon: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function getGPS() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) });
        setGpsLoading(false);
      },
      () => {
        setGps({ lat: '28.6139', lon: '77.2090' }); // demo fallback
        setGpsLoading(false);
      },
      { timeout: 8000 }
    );
  }

  function handleSubmit() {
    setStep(3);
    setTimeout(() => {
      onSubmit?.({ ...form, photo, gps });
    }, 1500);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>🚨 Raise Complaint</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {step === 1 && (
          <>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Issue Type</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="pothole">🕳️ Pothole</option>
                  <option value="road_crack">🔩 Road Crack</option>
                  <option value="broken_pole">⚡ Broken Pole</option>
                  <option value="waterlogging">💧 Waterlogging</option>
                  <option value="garbage_dump">🗑️ Garbage Dump</option>
                  <option value="broken_footpath">🚶 Broken Footpath</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea className="form-textarea" placeholder="Describe the issue…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Location Name (optional)</label>
                <input className="form-input" placeholder="e.g. Near Connaught Place" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setStep(2)}>Next → Add Photo</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="modal-body">
              <label className="upload-zone">
                <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }} />
                ) : (
                  <>
                    <div className="upload-zone-icon">📷</div>
                    <p><strong>Tap to capture photo</strong></p>
                    <p style={{ marginTop: 4 }}>or upload from gallery</p>
                  </>
                )}
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={getGPS} disabled={gpsLoading}>
                  {gpsLoading ? <><div className="spinner" />Getting GPS…</> : '📍 Get GPS Location'}
                </button>
                {gps && <span style={{ fontSize: 12, color: 'var(--low)', fontWeight: 600 }}>✅ {gps.lat}, {gps.lon}</span>}
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                ℹ️ In Step 2, AI analysis will run on server before raising the ticket.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!photo}>Submit Complaint</button>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="modal-body" style={{ alignItems: 'center', padding: '48px 24px', gap: 16 }}>
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Analyzing photo…</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Running AI detection on server</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
