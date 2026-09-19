import type { EdgeStatus, GpsConfig, GyroConfig } from './types';

interface Props {
  edgeStatus: EdgeStatus | null;
  camLabel: string;
  source: string;
  conf: number;
  every: number;
  gps: GpsConfig;
  gyro: GyroConfig;
  upload: boolean;
  saving: boolean;
  onSave: () => void;
}

export function SettingsSidebar({
  edgeStatus, camLabel, source, conf, every, gps, gyro, upload, saving, onSave,
}: Props) {
  const [copied, setCopied] = React.useState(false);

  function copyUrl(u: string) {
    void navigator.clipboard.writeText(u);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Phone link card */}
      <div style={{
        background: edgeStatus?.gui_url ? 'rgba(34,197,94,0.06)' : 'var(--bg-card)',
        border: `1px solid ${edgeStatus?.gui_url ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)', padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>📱</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Open on Phone</span>
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
            background: edgeStatus?.gui_url ? 'rgba(34,197,94,0.15)' : 'rgba(63,63,70,0.4)',
            color: edgeStatus?.gui_url ? 'var(--green)' : 'var(--text-dim)',
            border: `1px solid ${edgeStatus?.gui_url ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
          }}>
            {edgeStatus?.gui_url ? '● LIVE' : '○ OFFLINE'}
          </span>
        </div>

        {edgeStatus?.gui_url ? (
          <div>
            <a href={edgeStatus.gui_url} target="_blank" rel="noreferrer"
              style={{ display: 'block', background: 'var(--bg-popover)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 12, fontFamily: 'monospace', color: 'var(--green)', textDecoration: 'none', wordBreak: 'break-all', marginBottom: 8 }}>
              {edgeStatus.gui_url}
            </a>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => copyUrl(edgeStatus.gui_url!)}
                style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 11, color: copied ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>
                {copied ? '✅ Copied!' : '📋 Copy URL'}
              </button>
              <a href={edgeStatus.gui_url} target="_blank" rel="noreferrer"
                style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 11, color: 'var(--green)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🔗 Open
              </a>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
              Same WiFi · {edgeStatus.fps} fps · {edgeStatus.lan_ip}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Edge offline.<br />
            <code style={{ display: 'block', marginTop: 6, background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)' }}>
              npm run dev:full
            </code>
          </div>
        )}
      </div>

      {/* Config summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Active Config</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {([
            ['📷 Camera',  camLabel],
            ['🔗 Source',  source],
            ['📊 Conf',    `${(conf * 100).toFixed(0)}%`],
            ['🔁 Infer',   `every ${every}f`],
            ['🛰️ GPS',    `${gps.mode} · ${gps.city}`],
            ['📐 Gyro',   `${gyro.mode} · ${gyro.updateHz} Hz`],
            ['⬆️ Upload',  upload ? 'Yes' : 'No'],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontSize: 10, fontWeight: 500, fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: 13 }}
        onClick={onSave} disabled={saving}>
        {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : '💾 Save All Config'}
      </button>

      {/* How it works */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>How it works</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <div>1. Configure Camera / GPS / Gyro here</div>
          <div>2. Click <strong>Save All</strong> → saves to <code>edge.config.json</code></div>
          <div>3. Start edge:</div>
          <code style={{ display: 'block', margin: '4px 0', background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', color: 'var(--accent-blue)' }}>
            npm run dev:full
          </code>
          <div>4. Edge fetches config → starts with your settings</div>
        </div>
      </div>
    </div>
  );
}

// Need React for useState
import React from 'react';
