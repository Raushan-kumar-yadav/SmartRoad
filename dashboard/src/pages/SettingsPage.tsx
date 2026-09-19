import { useState, useEffect, useRef } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface EdgeConfig {
  cameraSource:  string;
  cameraLabel:   string;
  modelPath:     string;
  confidence:    number;
  inferEvery:    number;
  streamPort:    number;
  uploadEnabled: boolean;
  updatedAt?:    string;
}

interface TestResult {
  reachable: boolean | null;
  statusCode?: number;
  contentType?: string;
  error?: string;
  note?: string;
}

interface EdgeStatus {
  active: boolean;
  fps: number;
  lan_ip:         string | null;
  port: number | null;
  gui_url: string | null;
  stream_url: string | null;
  phone_active: boolean;
  phone_source:   string | null;
  current_source: string | null;
  model_ready: boolean;
}

// Camera presets
const PRESETS = [
  { label: 'USB Webcam (0)', source: '0', icon: '📷', hint: 'Built-in or first USB camera' },
  { label: 'USB Webcam (1)',    source: '1', icon: '📷', hint: 'Second USB camera' },
  { label: 'IP Webcam (Phone)', source: 'http://192.168.1.x:8080/video', icon: '📱', hint: 'Android: install IP Webcam app' },
  { label: 'DroidCam', source: 'http://192.168.1.x:4747/video', icon: '📱', hint: 'Android: install DroidCam app' },
  { label: 'RTSP Camera', source: 'rtsp://user:pass@192.168.1.x/stream', icon: '🎥', hint: 'IP camera / NVR RTSP stream' },
  { label: 'Video File', source: 'road_clip.mp4', icon: '📂', hint: 'For testing — loops the file' },
];

interface DetectedCamera {
  index:  number;
  source: string;
  label:  string;
  width:  number;
  height: number;
  fps:    number;
}

export default function SettingsPage() {
  const [config, setConfig]   = useState<EdgeConfig | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<EdgeStatus | null>(null);
  const [copied, setCopied]   = useState(false);
  const [cameras, setCameras]  = useState<DetectedCamera[]>([]);
  const [scanning, setScanning] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [videoFiles, setVideoFiles] = useState<Array<{path:string;name:string;sizeKb:number;dir:string}>>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Local editable fields
  const [source, setSource] = useState('0');
  const [label, setLabel]     = useState('USB Webcam (index 0)');
  const [modelPath, setModelPath] = useState('');
  const [conf, setConf] = useState(0.35);
  const [every, setEvery] = useState(5);
  const [port,      setPort]      = useState(8080);
  const [upload, setUpload]    = useState(true);

  useEffect(() => {
    void fetchConfig();
    void fetchEdgeStatus();
    pollRef.current = setInterval(() => void fetchEdgeStatus(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  
  }, []);

  async function fetchEdgeStatus() {
    try {
      const res  = await fetch(`${API}/api/live/status`);
      const data = await res.json() as EdgeStatus;
      setEdgeStatus(data);
    } catch { /* edge offline */ }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function fetchConfig() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/config`);
      const data = await res.json() as EdgeConfig;
      setConfig(data);
      setSource(data.cameraSource);
      setLabel(data.cameraLabel);
      setModelPath(data.modelPath);
      setConf(data.confidence);
      setEvery(data.inferEvery);
      setPort(data.streamPort);
      setUpload(data.uploadEnabled);
    } catch { /* server may be offline */ }
    setLoading(false);
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    setSource(preset.source);
    setLabel(preset.label);
    setTestResult(null);
  }

  async function fetchCameras() {
    setScanning(true);
    setCameras([]);
    try {
      const res  = await fetch(`${API}/api/live/cameras`);
      const data = await res.json() as { cameras: DetectedCamera[] };
      setCameras(data.cameras ?? []);
    } catch { /* edge offline */ }
    setScanning(false);
  }

  async function switchCamera(newSource: string, newLabel: string) {
    
    try {
      await fetch(`${API}/api/live/switch-camera`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: newSource }),
      });
    } catch {   }
 
    setSource(newSource);
    setLabel(newLabel);
    setTestResult(null);
 
    try {
      await fetch(`${API}/api/config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cameraSource: newSource, cameraLabel: newLabel }),
      });
    } catch { /**/ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function fetchVideos() {
    setBrowseLoading(true);
    setVideoFiles([]);
    try {
      const res  = await fetch(`${API}/api/config/browse-videos`);
      const data = await res.json() as { videos: Array<{path:string;name:string;sizeKb:number;dir:string}> };
      setVideoFiles(data.videos ?? []);
    } catch { /* server offline */ }
    setBrowseLoading(false);
  }

  async function selectVideo(v: { path: string; name: string }) {
    const newSource = v.path;
    const newLabel  = `📂 ${v.name}`;
    setSource(newSource);
    setLabel(newLabel);
    setTestResult(null);
    setBrowseOpen(false);
  }

  async function testCamera() {
    setTesting(true);
    setTestResult(null);
    try {
      const url = `${API}/api/config/test?url=${encodeURIComponent(source)}`;
      const res = await fetch(url);
      const data = await res.json() as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ reachable: false, error: 'Server unreachable' });
    }
    setTesting(false);
  }


  async function saveConfig() {
    setSaving(true);
    setSaved(false);
    try {
      const payload: Partial<EdgeConfig> = {
        cameraSource: source,
        cameraLabel: label,
        modelPath,
        confidence: conf,
        inferEvery: every,
        streamPort: port,
        uploadEnabled: upload,
      };
      const res = await fetch(`${API}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { config: EdgeConfig };
      setConfig(data.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* offline */ }
    setSaving(false);
  }

  const isHttpSource = source.startsWith('http://') || source.startsWith('https://');

  // Computed: merged camera list  
  const allCams: Array<{ source: string; label: string; icon: string; hint: string; live?: boolean }> = [];
  if (edgeStatus?.phone_active && edgeStatus.phone_source) {
    allCams.push({ source: edgeStatus.phone_source, label: 'Phone Camera', icon: '📱', hint: '● Connected now', live: true });
  }
  cameras.forEach(cam => {
    allCams.push({ source: cam.source, label: `Camera ${cam.index}`, icon: '📷', hint: `${cam.width}×${cam.height} @ ${cam.fps}fps` });
  });
  const activeSrc = edgeStatus?.current_source ?? source;

  return (
    <>
    <div>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Configure edge device camera source and detection parameters</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <div className="spinner" /> Loading config…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Camera Source */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Camera Source</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Select a preset or enter a custom URL</div>
              </div>

              {/* ── Select Main Camera ── */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>📸 Select Main Camera</span>
                  {edgeStatus?.current_source && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                      active: <code style={{ color: 'var(--green)', fontSize: 10 }}>{edgeStatus.current_source}</code>
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', fontSize: 11 }}
                    onClick={() => void fetchCameras()}
                    disabled={scanning || !edgeStatus?.gui_url}
                    title={!edgeStatus?.gui_url ? 'Edge must be running to scan' : 'Scan USB cameras'}
                  >
                    {scanning
                      ? <><span className="spinner" style={{ width: 10, height: 10 }} /> Scanning…</>
                      : '🔍 Scan USB'}
                  </button>
                </div>

                {!edgeStatus?.gui_url && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 8px', background: 'var(--bg-popover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    ⚠ Start <code>npm run dev:full</code> first, then scan.
                  </div>
                )}

                {/* Merged camera list: phone + USB */}
                {edgeStatus?.gui_url && (
                  allCams.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>
                      {scanning ? 'Scanning…' : 'No cameras detected — tap Scan USB or connect phone'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {allCams.map(cam => {
                        const isActive = activeSrc === cam.source || source === cam.source;
                        return (
                          <div key={cam.source} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background:   isActive ? 'rgba(34,197,94,0.07)' : 'var(--bg-popover)',
                            border:       `1px solid ${isActive ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)', padding: '9px 12px',
                            transition:   'all 0.15s',
                          }}>
                            <span style={{ fontSize: 18 }}>{cam.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--green)' : 'var(--text)' }}>
                                {cam.label}
                                {cam.live && (
                                  <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 999,
                                    background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: 700 }}>LIVE</span>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{cam.hint}</div>
                            </div>
                            {cam.live ? (
                              <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, flexShrink: 0, padding: '2px 7px', borderRadius: 999, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>● Streaming</span>
                            ) : isActive ? (
                              <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓ Active</span>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 10, flexShrink: 0 }}
                                onClick={() => void switchCamera(cam.source, cam.label)}
                              >
                                Switch →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              {/* Presets */}
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PRESETS.map(p => (
                  <button
                    key={p.source}
                    onClick={() => applyPreset(p)}
                    style={{
                      background:   source === p.source ? 'var(--bg-popover)' : 'transparent',
                      border:       `1px solid ${source === p.source ? 'var(--accent-blue)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding:      '8px 10px',
                      cursor:       'pointer',
                      textAlign:    'left',
                      transition:   'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 16, marginBottom: 3 }}>{p.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: source === p.source ? 'var(--accent-blue)' : 'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{p.hint}</div>
                  </button>
                ))}
              </div>

              {/* Custom source input */}
              <div style={{ padding: '0 14px 14px' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Custom URL / Index</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                  <input
                    value={source}
                    onChange={e => { setSource(e.target.value); setTestResult(null); }}
                    placeholder="0 | http://192.168.1.x:8080/video | rtsp://..."
                    style={{
                      flex: 1, background: 'var(--bg-popover)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 12,
                      color: 'var(--text)', fontFamily: 'monospace', outline: 'none',
                    }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ whiteSpace: 'nowrap', fontSize: 11 }}
                    onClick={() => { setBrowseOpen(true); void fetchVideos(); }}
                    title="Browse local video files"
                  >
                    📂 Browse
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void testCamera()}
                    disabled={testing || !isHttpSource}
                    title={!isHttpSource ? 'HTTP sources only — USB/RTSP must be tested locally' : 'Test connection'}
                  >
                    {testing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⚡ Test'}
                  </button>
                </div>

                {/* GPS sim notice when video file selected */}
                {/\.(mp4|avi|mov|mkv|webm|ts|mts|m4v|wmv)$/i.test(source) && (
                  <div style={{
                    marginTop: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                    background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)',
                    color: '#ca8a04', display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <span style={{ flexShrink: 0 }}>🛰</span>
                    <span>
                      <strong>Video file mode:</strong> GPS will simulate realistic road movement
                      (starting at Connaught Place, Delhi) and gyro will generate vehicle IMU data automatically.
                      Detections will be uploaded to the server with simulated coordinates.
                    </span>
                  </div>
                )}

                {/* Label */}
                <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginTop: 10 }}>Display Label</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Phone Camera (bedroom)"
                  style={{
                    width: '100%', boxSizing: 'border-box', marginTop: 5,
                    background: 'var(--bg-popover)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 12,
                    color: 'var(--text)', outline: 'none',
                  }}
                />

                {/* Test result */}
                {testResult && (
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                    background: testResult.reachable ? 'rgba(34,197,94,0.08)' : testResult.reachable === null ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)',
                    border:     `1px solid ${testResult.reachable ? 'rgba(34,197,94,0.2)' : testResult.reachable === null ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    color:      testResult.reachable ? 'var(--green)' : testResult.reachable === null ? 'var(--accent-blue)' : 'var(--red)',
                  }}>
                    {testResult.reachable === true  && `✅ Reachable — ${testResult.contentType ?? ''}`}
                    {testResult.reachable === false  && `❌ ${testResult.error ?? 'Unreachable'}`}
                    {testResult.reachable === null   && `ℹ️ ${testResult.note}`}
                  </div>
                )}
              </div>
            </div>


            {/* Detection Parameters */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Detection Parameters</div>
              </div>
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* Confidence */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Confidence Threshold — <strong style={{ color: 'var(--text)' }}>{(conf * 100).toFixed(0)}%</strong>
                  </label>
                  <input type="range" min={0.1} max={0.9} step={0.05} value={conf}
                    onChange={e => setConf(parseFloat(e.target.value))}
                    style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-blue)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                    <span>10% (sensitive)</span><span>90% (strict)</span>
                  </div>
                </div>

                {/* Infer every N */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Run YOLO every — <strong style={{ color: 'var(--text)' }}>{every} frames</strong>
                  </label>
                  <input type="range" min={1} max={30} step={1} value={every}
                    onChange={e => setEvery(parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-blue)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                    <span>1 (max accuracy)</span><span>30 (saves CPU)</span>
                  </div>
                </div>

                {/* Stream port */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>MJPEG Stream Port</label>
                  <input type="number" value={port} onChange={e => setPort(parseInt(e.target.value))}
                    style={{ width: '100%', boxSizing: 'border-box', marginTop: 5, background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }} />
                </div>

                {/* Upload toggle */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block' }}>Auto Upload Detections</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={() => setUpload(v)}
                        className={`btn btn-sm ${upload === v ? 'btn-primary' : 'btn-ghost'}`}>
                        {v ? '✅ Enabled' : '⛔ Disabled'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model path */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>YOLO Model Path</label>
                  <input value={modelPath} onChange={e => setModelPath(e.target.value)}
                    placeholder="e.g. e:\Pothole\pretrained\rdd\best.pt"
                    style={{ width: '100%', boxSizing: 'border-box', marginTop: 5, background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 11, color: 'var(--text)', fontFamily: 'monospace', outline: 'none' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column — Summary + Save ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Phone URL card (live from edge) ── */}
            <div style={{
              background:    edgeStatus?.gui_url ? 'rgba(34,197,94,0.06)' : 'var(--bg-card)',
              border:        `1px solid ${edgeStatus?.gui_url ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
              borderRadius:  'var(--radius-lg)', padding: 14, transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>📱</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Open on Phone</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 9, fontWeight: 600, padding: '2px 6px',
                  borderRadius: 999, background: edgeStatus?.gui_url ? 'rgba(34,197,94,0.15)' : 'rgba(63,63,70,0.4)',
                  color: edgeStatus?.gui_url ? 'var(--green)' : 'var(--text-dim)',
                  border: `1px solid ${edgeStatus?.gui_url ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                }}>
                  {edgeStatus?.gui_url ? '● LIVE' : '○ OFFLINE'}
                </span>
              </div>

              {edgeStatus?.gui_url ? (
                <div>
                  {/* Clickable URL */}
                  <a href={edgeStatus.gui_url} target="_blank" rel="noreferrer" style={{
                    display: 'block', background: 'var(--bg-popover)', border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 12,
                    fontFamily: 'monospace', color: 'var(--green)', textDecoration: 'none',
                    wordBreak: 'break-all', marginBottom: 8,
                  }}>
                    {edgeStatus.gui_url}
                  </a>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => copyUrl(edgeStatus.gui_url!)}
                      style={{
                        flex: 1, background: 'transparent', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 11,
                        color: copied ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer',
                      }}>
                      {copied ? '✅ Copied!' : '📋 Copy URL'}
                    </button>
                    <a href={edgeStatus.gui_url} target="_blank" rel="noreferrer" style={{
                      flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                      borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 11,
                      color: 'var(--green)', cursor: 'pointer', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}>
                      🔗 Open
                    </a>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                    Same WiFi required · {edgeStatus.fps} fps · IP: {edgeStatus.lan_ip}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Edge not running. Start with:<br/>
                  <code style={{ display: 'block', marginTop: 6, background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)' }}>
                    npm run dev:full
                  </code>
                </div>
              )}
            </div>

            {/* Current config summary */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Active Config</div>
              {config ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Camera',    config.cameraLabel],
                    ['Source',    config.cameraSource],
                    ['Conf',      `${(config.confidence * 100).toFixed(0)}%`],
                    ['Infer',     `every ${config.inferEvery}f`],
                    ['Port',      String(config.streamPort)],
                    ['Upload',    config.uploadEnabled ? 'Yes' : 'No'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                    </div>
                  ))}
                  {config.updatedAt && (
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      Saved {new Date(config.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Server offline</div>
              )}
            </div>

            {/* Save button */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: 13 }}
              onClick={() => void saveConfig()}
              disabled={saving}
            >
              {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : '💾 Save Config'}
            </button>

            {saved && (
              <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)', textAlign: 'center' }}>
                ✅ Config saved — restart edge detect to apply
              </div>
            )}

            {/* Quick start command */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Start Edge Detection</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>Uses saved config automatically:</div>
              <code style={{ display: 'block', background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 10, color: 'var(--accent-blue)', wordBreak: 'break-all' }}>
                npm run dev:full
              </code>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>Or with custom source:</div>
              <code style={{ display: 'block', background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 4 }}>
                python -m edge.detect --source "{source}"
              </code>
            </div>

            {/* Tips */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>📱 Phone Camera Setup</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--text)' }}>IP Webcam</strong> (Android)<br />Install free app → Start Server → use <code style={{ background: 'var(--bg-popover)', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>:8080/video</code></div>
                <div><strong style={{ color: 'var(--text)' }}>DroidCam</strong> (Android/iOS)<br />Install app + PC client → use <code style={{ background: 'var(--bg-popover)', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>:4747/video</code></div>
                <div><strong style={{ color: 'var(--text)' }}>Tip:</strong> Set phone resolution to 640×480, 15fps for best performance</div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>

    {/* ── Video File Browser Modal ─────────────────────────────────────────── */}
    {browseOpen && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
        onClick={e => { if (e.target === e.currentTarget) setBrowseOpen(false); }}
      >
        <div style={{
          width: '100%', maxWidth: 560, maxHeight: '80vh',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>📂</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Browse Video Files</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                Scanned: Desktop · Downloads · Videos · Documents · Workspace
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => void fetchVideos()}
              disabled={browseLoading}
            >
              {browseLoading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '🔄 Refresh'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 16, padding: '2px 8px' }}
              onClick={() => setBrowseOpen(false)}
            >×</button>
          </div>

          {/* GPS sim notice */}
          <div style={{ padding: '8px 14px', background: 'rgba(234,179,8,0.05)', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#ca8a04', display: 'flex', gap: 6 }}>
            <span>🛰</span>
            <span>Selecting a video file activates <strong>realistic GPS road simulation</strong> (30–55 km/h, smooth turns) and vehicle IMU gyro data.</span>
          </div>

          {/* File list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {browseLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
                <span className="spinner" style={{ width: 20, height: 20, display: 'inline-block', marginBottom: 8 }} /><br />
                Scanning directories…
              </div>
            ) : videoFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎬</div>
                No video files found.<br />
                <span style={{ fontSize: 10 }}>Add .mp4/.avi/.mov/.mkv to Desktop or Videos folder.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {videoFiles.map(v => (
                  <button
                    key={v.path}
                    onClick={() => void selectVideo(v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: source === v.path ? 'rgba(34,197,94,0.08)' : 'transparent',
                      border: `1px solid ${source === v.path ? 'rgba(34,197,94,0.3)' : 'transparent'}`,
                      borderRadius: 8, padding: '9px 10px', cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.12s', width: '100%',
                    }}
                    onMouseEnter={e => { if (source !== v.path) (e.currentTarget as HTMLElement).style.background = 'var(--bg-popover)'; }}
                    onMouseLeave={e => { if (source !== v.path) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>🎬</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: source === v.path ? 'var(--green)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.dir}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {v.sizeKb >= 1024 ? `${(v.sizeKb / 1024).toFixed(1)} MB` : `${v.sizeKb} KB`}
                      </div>
                      {source === v.path && (
                        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>✓ Selected</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
