import type { GpsConfig } from './types';
import { GPS_CITIES, sCard, sInp, sLbl } from './constants';
import { CardHead } from './CardHead';

interface Props {
  gps: GpsConfig;
  onChange: (updated: GpsConfig) => void;
}

export function GpsTab({ gps, onChange }: Props) {
  function set(patch: Partial<GpsConfig>) { onChange({ ...gps, ...patch }); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Mode selector ── */}
      <div style={sCard}>
        <CardHead title="GPS Source Mode" sub="How does the edge device get GPS coordinates?" />
        <div style={{ padding: '12px 14px', display: 'flex', gap: 10 }}>
          {(['simulate', 'serial'] as const).map(m => (
            <button key={m} onClick={() => set({ mode: m })}
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${gps.mode === m ? 'var(--accent-blue)' : 'var(--border)'}`,
                background: gps.mode === m ? 'rgba(59,130,246,0.06)' : 'transparent',
                textAlign: 'center', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m === 'simulate' ? '🛰️' : '📡'}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: gps.mode === m ? 'var(--accent-blue)' : 'var(--text)' }}>
                {m === 'simulate' ? 'Simulate (road walk)' : 'Real GPS (serial)'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                {m === 'simulate' ? 'Realistic road-walk from start coordinates' : 'NMEA GPS module via COM port'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Simulate params ── */}
      {gps.mode === 'simulate' && (
        <div style={sCard}>
          <CardHead title="Simulation Parameters" />
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* City presets */}
            <div>
              <label style={{ ...sLbl, marginBottom: 8 }}>Start City</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {GPS_CITIES.map(c => (
                  <button key={c.city}
                    onClick={() => set({ city: c.city, startLat: c.lat, startLon: c.lon })}
                    style={{
                      padding: '7px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${gps.city === c.city ? 'var(--accent-blue)' : 'var(--border)'}`,
                      background: gps.city === c.city ? 'rgba(59,130,246,0.06)' : 'transparent',
                      color: gps.city === c.city ? 'var(--accent-blue)' : 'var(--text)',
                    }}>
                    {c.city}
                  </button>
                ))}
              </div>
            </div>

            {/* Lat / Lon */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={sLbl}>Start Latitude</label>
                <input type="number" step="0.0001" value={gps.startLat}
                  onChange={e => set({ startLat: parseFloat(e.target.value), city: 'Custom' })}
                  style={{ ...sInp, fontFamily: 'monospace' }} />
              </div>
              <div>
                <label style={sLbl}>Start Longitude</label>
                <input type="number" step="0.0001" value={gps.startLon}
                  onChange={e => set({ startLon: parseFloat(e.target.value), city: 'Custom' })}
                  style={{ ...sInp, fontFamily: 'monospace' }} />
              </div>
            </div>

            {/* Speed range */}
            <div>
              <label style={sLbl}>
                Speed Range — <strong style={{ color: 'var(--text)' }}>{gps.minSpeedKmh}–{gps.maxSpeedKmh} km/h</strong>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>Min speed</div>
                  <input type="range" min={5} max={80} step={5} value={gps.minSpeedKmh}
                    onChange={e => set({ minSpeedKmh: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                  <div style={{ fontSize: 10, textAlign: 'center', color: 'var(--text-dim)' }}>{gps.minSpeedKmh} km/h</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>Max speed</div>
                  <input type="range" min={10} max={120} step={5} value={gps.maxSpeedKmh}
                    onChange={e => set({ maxSpeedKmh: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                  <div style={{ fontSize: 10, textAlign: 'center', color: 'var(--text-dim)' }}>{gps.maxSpeedKmh} km/h</div>
                </div>
              </div>
            </div>

            <a
              href={`https://www.google.com/maps?q=${gps.startLat},${gps.startLon}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: 'var(--accent-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              🗺️ View start point on Google Maps →
            </a>
          </div>
        </div>
      )}

      {/* ── Serial params ── */}
      {gps.mode === 'serial' && (
        <div style={sCard}>
          <CardHead title="Serial GPS Parameters" sub="NMEA-compatible GPS dongle" />
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={sLbl}>COM / Serial Port</label>
              <input value={gps.serialPort} onChange={e => set({ serialPort: e.target.value })}
                placeholder="COM3 or /dev/ttyUSB0"
                style={{ ...sInp, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={sLbl}>Baud Rate</label>
              <select value={gps.baudRate} onChange={e => set({ baudRate: parseInt(e.target.value) })}
                style={{ ...sInp, cursor: 'pointer' }}>
                {[4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ padding: '0 14px 12px', fontSize: 11, color: 'var(--text-dim)' }}>
            Requires <code>pip install pyserial</code>
          </div>
        </div>
      )}
    </div>
  );
}
