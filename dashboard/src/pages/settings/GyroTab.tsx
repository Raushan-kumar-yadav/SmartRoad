import type { GyroConfig } from './types';
import { sCard, sInp, sLbl } from './constants';
import { CardHead } from './CardHead';

interface Props {
  gyro: GyroConfig;
  onChange: (updated: GyroConfig) => void;
}

const NOISE_LABELS: Record<GyroConfig['noiseLevel'], string> = {
  low:    '🟢 Low',
  medium: '🟡 Medium',
  high:   '🔴 High',
};

const ACCEL_NOISE: Record<GyroConfig['noiseLevel'], string> = {
  low: '0.3 m/s²', medium: '0.8 m/s²', high: '1.8 m/s²',
};
const GYRO_NOISE: Record<GyroConfig['noiseLevel'], string> = {
  low: '1 °/s', medium: '3 °/s', high: '7 °/s',
};

export function GyroTab({ gyro, onChange }: Props) {
  function set(patch: Partial<GyroConfig>) { onChange({ ...gyro, ...patch }); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Mode selector ── */}
      <div style={sCard}>
        <CardHead title="IMU / Gyro Mode" sub="How does the edge device get accelerometer data?" />
        <div style={{ padding: '12px 14px', display: 'flex', gap: 10 }}>
          {(['simulate', 'real'] as const).map(m => (
            <button key={m} onClick={() => set({ mode: m })}
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1px solid ${gyro.mode === m ? 'var(--accent-blue)' : 'var(--border)'}`,
                background: gyro.mode === m ? 'rgba(59,130,246,0.06)' : 'transparent',
                textAlign: 'center', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m === 'simulate' ? '📐' : '🔌'}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: gyro.mode === m ? 'var(--accent-blue)' : 'var(--text)' }}>
                {m === 'simulate' ? 'Simulate (vehicle IMU)' : 'Real IMU (serial)'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                {m === 'simulate' ? '50 Hz physics sim with pothole/turn events' : 'MPU-6050 or similar via COM port'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Simulate params ── */}
      {gyro.mode === 'simulate' && (
        <div style={sCard}>
          <CardHead title="Simulation Parameters" />
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Update rate */}
            <div>
              <label style={sLbl}>
                Update Rate — <strong style={{ color: 'var(--text)' }}>{gyro.updateHz} Hz</strong>
              </label>
              <input type="range" min={10} max={200} step={10} value={gyro.updateHz}
                onChange={e => set({ updateHz: parseInt(e.target.value) })}
                style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-blue)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                <span>10 Hz</span><span>200 Hz</span>
              </div>
            </div>

            {/* Noise level */}
            <div>
              <label style={{ ...sLbl, marginBottom: 8 }}>Road Noise Level</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['low', 'medium', 'high'] as const).map(n => (
                  <button key={n} onClick={() => set({ noiseLevel: n })}
                    className={`btn btn-sm ${gyro.noiseLevel === n ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1 }}>
                    {NOISE_LABELS[n]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                Low = highway · Medium = urban · High = rough / dirt road
              </div>
            </div>

            {/* Random events */}
            <div>
              <label style={{ ...sLbl, marginBottom: 8 }}>Random Events (pothole spikes, turns, brakes)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([true, false] as const).map(v => (
                  <button key={String(v)} onClick={() => set({ enableEvents: v })}
                    className={`btn btn-sm ${gyro.enableEvents === v ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1 }}>
                    {v ? '✅ Enabled' : '⛔ Disabled'}
                  </button>
                ))}
              </div>
            </div>

            {/* IMU preview */}
            <div style={{ background: 'var(--bg-popover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11 }}>IMU Preview</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {([
                  ['Update Hz',  `${gyro.updateHz} Hz`],
                  ['Noise',      gyro.noiseLevel],
                  ['Events',     gyro.enableEvents ? 'On' : 'Off'],
                  ['Accel ±',    ACCEL_NOISE[gyro.noiseLevel]],
                  ['Gyro ±',     GYRO_NOISE[gyro.noiseLevel]],
                  ['Event freq', gyro.enableEvents ? '~15 s' : 'N/A'],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{k}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Real IMU params ── */}
      {gyro.mode === 'real' && (
        <div style={sCard}>
          <CardHead title="Real IMU Parameters" sub="MPU-6050, BNO055, or similar" />
          <div style={{ padding: '12px 14px' }}>
            <label style={sLbl}>COM / Serial Port</label>
            <input value={gyro.serialPort} onChange={e => set({ serialPort: e.target.value })}
              placeholder="COM4 or /dev/ttyUSB1"
              style={{ ...sInp, fontFamily: 'monospace' }} />
          </div>
          <div style={{ padding: '0 14px 12px', fontSize: 11, color: 'var(--text-dim)' }}>
            Requires <code>pip install pyserial</code>. Falls back to simulation if port is unavailable.
          </div>
        </div>
      )}
    </div>
  );
}
