import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './OIChartModal.css';
import './Chart.css';

const REF_LINES = [
  { value: 1.5, color: '#c62828', label: '1.5 Bearish' },
  { value: 1.2, color: '#e53935', label: '1.2' },
  { value: 1.0, color: '#888',    label: '1.0 Neutral' },
  { value: 0.8, color: '#43a047', label: '0.8' },
  { value: 0.5, color: '#1b5e20', label: '0.5 Bullish' },
  { value: 0.3, color: '#0d47a1', label: '0.3' },
];

function PCRGraph({ data, cutoffTime }) {
  if (!data?.length) return <div className="oic-empty">No PCR data available.</div>;

  const cutoffHHMM = cutoffTime ? cutoffTime.substring(0, 5) : null;
  const points = data.filter(d => !cutoffHHMM || d.time <= cutoffHHMM);
  if (!points.length) return <div className="oic-empty">No PCR data in range.</div>;

  const W = 900, H = 400;
  const mg = { top: 20, right: 80, bottom: 44, left: 52 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top  - mg.bottom;
  const n  = points.length;

  const allVals = points.map(p => p.pcr).concat(REF_LINES.map(r => r.value));
  const minV = Math.max(0, Math.min(...allVals) - 0.1);
  const maxV = Math.max(...allVals) + 0.1;

  const xS = i  => mg.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yS = v  => mg.top  + cH * (1 - (v - minV) / (maxV - minV));

  // PCR line path
  const pts = points.map((p, i) => `${xS(i)},${yS(p.pcr)}`).join(' ');

  // x-tick indices
  const xTicks = points.filter((_, i) => i === 0 || i === n - 1 || i % Math.max(1, Math.floor(n / 8)) === 0);

  // y-ticks
  const step  = (maxV - minV) / 5;
  const yTicks = Array.from({ length: 6 }, (_, i) => parseFloat((minV + i * step).toFixed(2)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={mg.left} x2={W - mg.right} y1={yS(v)} y2={yS(v)} stroke="#eee" strokeWidth="1" />
          <text x={mg.left - 6} y={yS(v) + 4} textAnchor="end" fontSize="11" fill="#666">{v.toFixed(2)}</text>
        </g>
      ))}

      {/* Reference lines */}
      {REF_LINES.map(r => {
        if (r.value < minV || r.value > maxV) return null;
        const y = yS(r.value);
        return (
          <g key={r.value}>
            <line x1={mg.left} x2={W - mg.right} y1={y} y2={y} stroke={r.color} strokeWidth="1.5" strokeDasharray="6,4" />
            <text x={W - mg.right + 4} y={y + 4} fontSize="10" fill={r.color} fontWeight="bold">{r.value}</text>
          </g>
        );
      })}

      {/* PCR area fill */}
      <polyline
        points={[`${xS(0)},${mg.top + cH}`, ...points.map((p, i) => `${xS(i)},${yS(p.pcr)}`), `${xS(n-1)},${mg.top + cH}`].join(' ')}
        fill="rgba(25,118,210,0.08)" stroke="none"
      />

      {/* PCR line */}
      <polyline points={pts} fill="none" stroke="#1976d2" strokeWidth="2.5" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={xS(i)} cy={yS(p.pcr)} r="3" fill="#1976d2" />
      ))}

      {/* X-axis ticks */}
      {xTicks.map((p, i) => {
        const xi = points.indexOf(p);
        return (
          <text key={i} x={xS(xi)} y={H - mg.bottom + 16} textAnchor="middle" fontSize="11" fill="#555">
            {p.time}
          </text>
        );
      })}

      {/* Axes */}
      <line x1={mg.left} x2={mg.left} y1={mg.top} y2={mg.top + cH} stroke="#ccc" strokeWidth="1" />
      <line x1={mg.left} x2={W - mg.right} y1={mg.top + cH} y2={mg.top + cH} stroke="#ccc" strokeWidth="1" />
    </svg>
  );
}

export default function PCRChartModal({ open, onClose }) {
  const { state } = useApp();
  const { currentSymbol, currentExpiry, currentDataDate, currentTime, historicalMode } = state;
  const [chartData, setChartData] = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!open || !currentSymbol || !currentExpiry || !currentDataDate) return;
    setLoading(true);
    fetch(`/api/chart/pcr/${encodeURIComponent(currentSymbol)}/${encodeURIComponent(currentExpiry)}/${currentDataDate}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setChartData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, currentSymbol, currentExpiry, currentDataDate]);

  if (!open) return null;

  const cutoff = historicalMode ? currentTime : null;

  return (
    <>
      <div className="chart-modal-backdrop" onClick={onClose} />
      <div className="oic-modal oic-modal-big">
        <div className="oic-header">
          <span className="oic-title">PCR Chart — {currentSymbol} {currentExpiry} {currentDataDate}</span>
          <button className="chart-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '8px 16px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
          {REF_LINES.map(r => (
            <span key={r.value} style={{ color: r.color, fontWeight: 600 }}>― {r.label}</span>
          ))}
          <span style={{ color: '#1976d2', fontWeight: 600 }}>— PCR</span>
        </div>

        <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
          {loading && <div className="oic-empty">Loading PCR data…</div>}
          {!loading && <PCRGraph data={chartData?.data} cutoffTime={cutoff} />}
        </div>
      </div>
    </>
  );
}
