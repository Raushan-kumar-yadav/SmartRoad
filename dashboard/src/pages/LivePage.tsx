import { useState, useEffect, useRef } from 'react';

interface LiveStatus {
  online: boolean;
  streamUrl?: string;
  fps?: number;
  lat?: number | null;
  lon?: number | null;
  reports_sent?: number;
  detections?: { class: string; confidence: number }[];
  message?: string;
}

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const CLASS_COLOR: Record<string, string> = {
  pothole: 'var(--red)',
  road_crack: 'var(--orange)',
  broken_footpath: 'var(--yellow)',
  broken_pole: 'var(--accent-blue)',
  garbage_dump: 'var(--green)',
  waterlogging: '#06b6d4',
};

export default function LivePage() {
  const [status,  setStatus]  = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/api/live/status`);
      const data = await res.json() as LiveStatus;
      setStatus(data);
    } catch {
      setStatus({ online: false, message: 'Server unreachable' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
    // Poll status  
    intervalRef.current = setInterval(() => void fetchStatus(), 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const streamSrc = status?.online ? `${API}/api/live/stream` : null;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Live Feed</h2>
            <p>Real-time camera stream from edge device</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? (
              <div className="spinner" />
            ) : status?.online ? (
              <div className="live-badge"><span className="live-dot" />Edge Online</div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 10, fontWeight: 500, color: 'var(--red)' }}>
                ● Edge Offline
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* ── Video Feed ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Camera Feed</span>
            {status?.fps != null && status.fps > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{status.fps.toFixed(1)} fps</span>
            )}
          </div>

          {streamSrc ? (
            <img
              src={streamSrc}
              alt="Live detection feed"
              style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'contain', background: '#000' }}
            />
          ) : (
            <div style={{
              height: 360, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              background: 'var(--bg-popover)', color: 'var(--text-muted)',
            }}>
              <div style={{ fontSize: 40 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Edge device offline</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', maxWidth: 260 }}>
                {status?.message ?? 'Start detect.py on the edge device to see live feed'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                python -m edge.detect --stream-port 8080
              </div>
            </div>
          )}
        </div>

        {/* ── Info Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* GPS */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>GPS Location</div>
            {status?.lat != null && status?.lon != null ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
                  {Number(status.lat).toFixed(5)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {Number(status.lon).toFixed(5)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Waiting for GPS…</div>
            )}
          </div>

          {/* Reports sent */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 500 }}>Reports Sent</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-blue)' }}>
              {status?.reports_sent ?? '—'}
            </div>
          </div>

          {/* Active detections */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>
              Current Frame Detections
            </div>
            {status?.online && status.detections && status.detections.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {status.detections.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: CLASS_COLOR[d.class] ?? 'var(--text)', textTransform: 'capitalize' }}>
                      {d.class.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {(d.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {status?.online ? 'No defects in current frame' : 'Offline'}
              </div>
            )}
          </div>

          {/* FPS + stream info */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>Stream Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['FPS',     status?.fps?.toFixed(1) ?? '—'],
                ['Quality', '640×360'],
                ['Format',  'MJPEG'],
                ['Port',    '8080'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Setup hint */}
          {!status?.online && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>To enable live feed:</strong>
                1. Set <code style={{ background: 'var(--bg-popover)', padding: '1px 4px', borderRadius: 3 }}>PI_HOST</code> in <code style={{ background: 'var(--bg-popover)', padding: '1px 4px', borderRadius: 3 }}>server/.env</code><br /><br />
                2. Run on Pi:<br />
                <code style={{ background: 'var(--bg-popover)', padding: '4px 6px', borderRadius: 3, display: 'block', marginTop: 4, fontSize: 10 }}>
                  python -m edge.detect
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
