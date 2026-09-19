import { useState } from 'react';

interface VideoFile {
  path: string;
  name: string;
  sizeKb: number;
  dir: string;
}

interface Props {
  open: boolean;
  selectedSource: string;
  videos: VideoFile[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (v: VideoFile) => void;
}

export function VideoBrowserModal({ open, selectedSource, videos, loading, onClose, onRefresh, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Browse Video Files</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>Desktop · Downloads · Videos · Documents</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={onRefresh} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '🔄 Refresh'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 16, padding: '2px 8px' }} onClick={onClose}>&times;</button>
        </div>

        {/* GPS notice banner */}
        <div style={{ padding: '8px 14px', background: 'rgba(234,179,8,0.05)', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#ca8a04', display: 'flex', gap: 6 }}>
          🛰️ <span>Selecting a video activates <strong>GPS road simulation</strong> using the settings in the GPS tab.</span>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
              <span className="spinner" style={{ width: 20, height: 20, display: 'inline-block', marginBottom: 8 }} /><br />Scanning…
            </div>
          ) : videos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎬</div>
              No video files found.<br />
              <span style={{ fontSize: 10 }}>Add .mp4 / .avi / .mov / .mkv to Desktop or Videos.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {videos.map(v => {
                const isSelected = selectedSource === v.path;
                const isHov = hovered === v.path;
                return (
                  <button
                    key={v.path}
                    onClick={() => onSelect(v)}
                    onMouseEnter={() => setHovered(v.path)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isSelected ? 'rgba(34,197,94,0.08)' : isHov ? 'var(--bg-popover)' : 'transparent',
                      border: `1px solid ${isSelected ? 'rgba(34,197,94,0.3)' : 'transparent'}`,
                      borderRadius: 8, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>🎬</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--green)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.dir}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {v.sizeKb >= 1024 ? `${(v.sizeKb / 1024).toFixed(1)} MB` : `${v.sizeKb} KB`}
                      </div>
                      {isSelected && <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>✓ Selected</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
