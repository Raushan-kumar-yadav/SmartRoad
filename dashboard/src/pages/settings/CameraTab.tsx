import type { DetectedCamera, EdgeStatus, TestResult } from './types';
import { CAM_PRESETS, sCard, sInp, sLbl } from './constants';
import { CardHead } from './CardHead';

interface Props {
  source: string;
  camLabel: string;
  modelPath: string;
  conf: number;
  every: number;
  streamPort: number;
  upload: boolean;
  testing: boolean;
  testResult: TestResult | null;
  scanning: boolean;
  cameras: DetectedCamera[];
  edgeStatus: EdgeStatus | null;
  onSourceChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onModelPathChange: (v: string) => void;
  onConfChange: (v: number) => void;
  onEveryChange: (v: number) => void;
  onPortChange: (v: number) => void;
  onUploadChange: (v: boolean) => void;
  onTest: () => void;
  onScan: () => void;
  onSwitch: (src: string, lbl: string) => void;
  onBrowse: () => void;
}

export function CameraTab({
  source, camLabel, modelPath, conf, every, streamPort, upload,
  testing, testResult, scanning, cameras, edgeStatus,
  onSourceChange, onLabelChange, onModelPathChange,
  onConfChange, onEveryChange, onPortChange, onUploadChange,
  onTest, onScan, onSwitch, onBrowse,
}: Props) {
  const isHttp  = source.startsWith('http://') || source.startsWith('https://');
  const isVideo = /\.(mp4|avi|mov|mkv|webm|ts|mts|m4v|wmv)$/i.test(source);
  const activeSrc = edgeStatus?.current_source ?? source;

  // Build unified camera list (phone first, then USB-detected)
  const allCams: Array<{ source: string; label: string; icon: string; hint: string; live?: boolean }> = [];
  if (edgeStatus?.phone_active && edgeStatus.phone_source)
    allCams.push({ source: edgeStatus.phone_source, label: 'Phone Camera', icon: '📱', hint: '● Connected now', live: true });
  cameras.forEach(c => allCams.push({ source: c.source, label: `Camera ${c.index}`, icon: '📷', hint: `${c.width}x${c.height} @ ${c.fps}fps` }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Live camera picker ── */}
      <div style={sCard}>
        <CardHead title="📸 Select Camera" sub="Live-detected devices" />
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 }}>
            {edgeStatus?.current_source && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 'auto' }}>
                Active: <code style={{ color: 'var(--green)', fontSize: 10 }}>{edgeStatus.current_source}</code>
              </span>
            )}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
              onClick={onScan} disabled={scanning || !edgeStatus?.gui_url}>
              {scanning ? <><span className="spinner" style={{ width: 10, height: 10 }} /> Scanning…</> : '🔍 Scan USB'}
            </button>
          </div>

          {!edgeStatus?.gui_url && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 8px', background: 'var(--bg-popover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              Start <code>npm run dev:full</code> to enable live camera scanning.
            </div>
          )}

          {edgeStatus?.gui_url && (
            allCams.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>
                  {scanning ? 'Scanning…' : 'No cameras found — tap Scan USB or connect phone'}
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allCams.map(cam => {
                    const act = activeSrc === cam.source || source === cam.source;
                    return (
                      <div key={cam.source} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: act ? 'rgba(34,197,94,0.07)' : 'var(--bg-popover)',
                        border: `1px solid ${act ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)', padding: '9px 12px',
                      }}>
                        <span style={{ fontSize: 18 }}>{cam.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: act ? 'var(--green)' : 'var(--text)' }}>
                            {cam.label}
                            {cam.live && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: 700 }}>LIVE</span>}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{cam.hint}</div>
                        </div>
                        {cam.live
                          ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, flexShrink: 0, padding: '2px 7px', borderRadius: 999, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>● Streaming</span>
                          : act
                            ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓ Active</span>
                            : <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, flexShrink: 0 }} onClick={() => onSwitch(cam.source, cam.label)}>Switch →</button>
                        }
                      </div>
                    );
                  })}
                </div>
          )}
        </div>
      </div>

      {/* ── Quick presets ── */}
      <div style={sCard}>
        <CardHead title="Quick Presets" />
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {CAM_PRESETS.map(p => (
            <button key={p.source}
              onClick={() => { onSourceChange(p.source); onLabelChange(p.label); }}
              style={{
                background: source === p.source ? 'var(--bg-popover)' : 'transparent',
                border: `1px solid ${source === p.source ? 'var(--accent-blue)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
              }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{p.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: source === p.source ? 'var(--accent-blue)' : 'var(--text)' }}>{p.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Custom source ── */}
      <div style={sCard}>
        <CardHead title="Custom Source / Advanced" />
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={sLbl}>Camera URL / Device Index</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
              <input value={source}
                onChange={e => onSourceChange(e.target.value)}
                placeholder="0 | http://192.168.1.x:8080/video | rtsp://..."
                style={{ ...sInp, flex: 1, fontFamily: 'monospace' }} />
              <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', fontSize: 11 }} onClick={onBrowse}>
                📂 Browse
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onTest} disabled={testing || !isHttp}>
                {testing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⚡ Test'}
              </button>
            </div>

            {isVideo && (
              <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)', color: '#ca8a04', display: 'flex', gap: 6 }}>
                🛰️ <strong>Video file:</strong>&nbsp;GPS &amp; Gyro simulate from the GPS/Gyro tab settings.
              </div>
            )}

            {testResult && (
              <div style={{
                marginTop: 8, padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                background: testResult.reachable ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${testResult.reachable ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: testResult.reachable ? 'var(--green)' : 'var(--red)',
              }}>
                {testResult.reachable === true  && `✅ Reachable — ${testResult.contentType ?? ''}`}
                {testResult.reachable === false && `❌ ${testResult.error ?? 'Unreachable'}`}
                {testResult.reachable === null  && `ℹ️ ${testResult.note}`}
              </div>
            )}
          </div>

          <div>
            <label style={sLbl}>Display Label</label>
            <input value={camLabel} onChange={e => onLabelChange(e.target.value)} style={sInp} />
          </div>
          <div>
            <label style={sLbl}>YOLO Model Path</label>
            <input value={modelPath} onChange={e => onModelPathChange(e.target.value)}
              placeholder="e:\Pothole\pretrained\rdd\best.pt"
              style={{ ...sInp, fontFamily: 'monospace', fontSize: 11 }} />
          </div>
        </div>
      </div>

      {/* ── Detection parameters ── */}
      <div style={sCard}>
        <CardHead title="Detection Parameters" />
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={sLbl}>Confidence — <strong style={{ color: 'var(--text)' }}>{(conf * 100).toFixed(0)}%</strong></label>
            <input type="range" min={0.1} max={0.9} step={0.05} value={conf}
              onChange={e => onConfChange(parseFloat(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-blue)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>10%</span><span>90%</span>
            </div>
          </div>

          <div>
            <label style={sLbl}>YOLO every — <strong style={{ color: 'var(--text)' }}>{every} frames</strong></label>
            <input type="range" min={1} max={30} step={1} value={every}
              onChange={e => onEveryChange(parseInt(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-blue)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>1 (accurate)</span><span>30 (fast)</span>
            </div>
          </div>

          <div>
            <label style={sLbl}>MJPEG Stream Port</label>
            <input type="number" value={streamPort} onChange={e => onPortChange(parseInt(e.target.value))} style={sInp} />
          </div>

          <div>
            <label style={{ ...sLbl, marginBottom: 8 }}>Auto Upload Detections</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([true, false] as const).map(v => (
                <button key={String(v)} onClick={() => onUploadChange(v)}
                  className={`btn btn-sm ${upload === v ? 'btn-primary' : 'btn-ghost'}`}>
                  {v ? '✅ Enabled' : '⛔ Disabled'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
