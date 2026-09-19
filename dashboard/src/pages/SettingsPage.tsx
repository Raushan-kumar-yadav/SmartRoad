import { useState, useEffect, useRef } from 'react';
import type { EdgeConfig, EdgeStatus, DetectedCamera, Tab, TestResult } from './settings/types';
import { API, DEF_GPS, DEF_GYRO } from './settings/constants';
import { CameraTab } from './settings/CameraTab';
import { GpsTab } from './settings/GpsTab';
import { GyroTab } from './settings/GyroTab';
import { SettingsSidebar }  from './settings/SettingsSidebar';
import { VideoBrowserModal } from './settings/VideoBrowserModal';
import type { GpsConfig, GyroConfig } from './settings/types';

interface VideoFile { path: string; name: string; sizeKb: number; dir: string; }

const TAB_DEFS: { id: Tab; icon: string; label: string }[] = [
  { id: 'camera', icon: '📷', label: 'Camera' },
  { id: 'gps', icon: '🛰️',  label: 'GPS' },
  { id: 'gyro', icon: '📐', label: 'Gyro / IMU'  },
];

export default function SettingsPage() {
  /* ── Global state ── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab,  setActiveTab]  = useState<Tab>('camera');
  const [edgeStatus, setEdgeStatus] = useState<EdgeStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Camera state ── */
  const [source, setSource] = useState('0');
  const [camLabel, setCamLabel] = useState('USB Webcam (index 0)');
  const [modelPath,  setModelPath]  = useState('');
  const [conf, setConf] = useState(0.35);
  const [every, setEvery] = useState(5);
  const [streamPort, setStreamPort] = useState(8080);
  const [upload, setUpload] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [cameras, setCameras]    = useState<DetectedCamera[]>([]);
  const [scanning, setScanning]   = useState(false);

  /*   GPS / Gyro state   */
  const [gps,  setGps]  = useState<GpsConfig>({ ...DEF_GPS });
  const [gyro, setGyro] = useState<GyroConfig>({ ...DEF_GYRO });

  /*   Video browser state   */
  const [browseOpen, setBrowseOpen] = useState(false);
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
  const [browseLoad, setBrowseLoad] = useState(false);

  /*   Mount   */
  useEffect(() => {
    void loadConfig();
    void pollStatus();
    pollRef.current = setInterval(() => void pollStatus(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
   
  }, []);

 
  async function loadConfig() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/config`);
      const d = await r.json() as EdgeConfig;
      setSource(d.cameraSource);   setCamLabel(d.cameraLabel);
      setModelPath(d.modelPath);   setConf(d.confidence);
      setEvery(d.inferEvery);      setStreamPort(d.streamPort);
      setUpload(d.uploadEnabled);
      setGps({ ...DEF_GPS,  ...(d.gps  ?? {}) });
      setGyro({ ...DEF_GYRO, ...(d.gyro ?? {}) });
    } catch { /**/ }
    setLoading(false);
  }

  async function pollStatus() {
    try {
      const r = await fetch(`${API}/api/live/status`);
      setEdgeStatus(await r.json() as EdgeStatus);
    } catch { /**/ }
  }

  async function scanCameras() {
    setScanning(true); setCameras([]);
    try {
      const r = await fetch(`${API}/api/live/cameras`);
      const d = await r.json() as { cameras: DetectedCamera[] };
      setCameras(d.cameras ?? []);
    } catch { /**/ }
    setScanning(false);
  }

  async function loadVideos() {
    setBrowseLoad(true); setVideoFiles([]);
    try {
      const r = await fetch(`${API}/api/config/browse-videos`);
      const d = await r.json() as { videos: VideoFile[] };
      setVideoFiles(d.videos ?? []);
    } catch { /**/ }
    setBrowseLoad(false);
  }

  async function testCam() {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/config/test?url=${encodeURIComponent(source)}`);
      setTestResult(await r.json() as TestResult);
    } catch {
      setTestResult({ reachable: false, error: 'Server unreachable' });
    }
    setTesting(false);
  }

  async function switchCam(src: string, lbl: string) {
    try {
      await fetch(`${API}/api/live/switch-camera`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: src }),
      });
    } catch { /**/ }
    setSource(src); setCamLabel(lbl); setTestResult(null);
    try {
      await fetch(`${API}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraSource: src, cameraLabel: lbl }),
      });
    } catch { /**/ }
    flash();
  }

  async function saveAll() {
    setSaving(true);
    try {
      await fetch(`${API}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraSource: source, cameraLabel: camLabel, modelPath,
          confidence: conf, inferEvery: every, streamPort,
          uploadEnabled: upload, gps, gyro,
        }),
      });
      flash();
    } catch { /**/ }
    setSaving(false);
  }

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  function openBrowse() { setBrowseOpen(true); void loadVideos(); }

  function pickVideo(v: VideoFile) {
    setSource(v.path); setCamLabel(`📂 ${v.name}`);
    setTestResult(null); setBrowseOpen(false);
  }

  /* ── Tab bar style ── */
  function tabStyle(t: Tab): React.CSSProperties {
    return {
      padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      background: 'transparent', border: 'none',
      borderBottom: `2px solid ${activeTab === t ? 'var(--accent-blue)' : 'transparent'}`,
      color: activeTab === t ? 'var(--accent-blue)' : 'var(--text-muted)',
      transition: 'all 0.15s',
    };
  }

  /*   Render   */
  return (
    <>
      <div>
        {/* Page header */}
        <div className="page-header">
          <div>
            <h2>Settings</h2>
            <p>Camera, GPS &amp; Gyro — saved to server, auto-loaded by edge on startup</p>
          </div>
          <button className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13 }}
            onClick={() => void saveAll()} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : '💾 Save All'}
          </button>
        </div>

        {/* Saved banner */}
        {saved && (
          <div style={{ marginBottom: 14, padding: '9px 14px', background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)' }}>
            ✅ Config saved — edge will load this on next startup
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="spinner" /> Loading config…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

            {/* Left: tabs */}
            <div>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
                {TAB_DEFS.map(t => (
                  <button key={t.id} style={tabStyle(t.id)} onClick={() => setActiveTab(t.id)}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'camera' && (
                <CameraTab
                  source={source}       camLabel={camLabel}     modelPath={modelPath}
                  conf={conf}           every={every}           streamPort={streamPort}
                  upload={upload}       testing={testing}       testResult={testResult}
                  scanning={scanning}   cameras={cameras}       edgeStatus={edgeStatus}
                  onSourceChange={v => { setSource(v); setTestResult(null); }}
                  onLabelChange={setCamLabel}
                  onModelPathChange={setModelPath}
                  onConfChange={setConf}
                  onEveryChange={setEvery}
                  onPortChange={setStreamPort}
                  onUploadChange={setUpload}
                  onTest={() => void testCam()}
                  onScan={() => void scanCameras()}
                  onSwitch={(s, l) => void switchCam(s, l)}
                  onBrowse={openBrowse}
                />
              )}

              {activeTab === 'gps' && (
                <GpsTab gps={gps} onChange={setGps} />
              )}

              {activeTab === 'gyro' && (
                <GyroTab gyro={gyro} onChange={setGyro} />
              )}
            </div>

            {/* Right: sidebar */}
            <SettingsSidebar
              edgeStatus={edgeStatus}
              camLabel={camLabel}   source={source}
              conf={conf}           every={every}
              gps={gps}             gyro={gyro}
              upload={upload}       saving={saving}
              onSave={() => void saveAll()}
            />
          </div>
        )}
      </div>

      <VideoBrowserModal
        open={browseOpen}
        selectedSource={source}
        videos={videoFiles}
        loading={browseLoad}
        onClose={() => setBrowseOpen(false)}
        onRefresh={() => void loadVideos()}
        onSelect={pickVideo}
      />
    </>
  );
}
