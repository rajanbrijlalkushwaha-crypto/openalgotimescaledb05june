import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import '../Chart/OIChartModal.css';

const METRICS = [
  { key: 'vol_pct',    label: 'VOL',     color: '#22c55e' },
  { key: 'oi_pct',     label: 'OI',      color: '#1976d2' },
  { key: 'oichng_pct', label: 'OI CHNG', color: '#ff6f00' },
];

const STRIKE_STYLE = [
  { opacity: 1.0, width: 3.5 },
  { opacity: 0.60, width: 2.0 },
  { opacity: 0.40, width: 1.5 },
  { opacity: 0.25, width: 1.2 },
];

function MultiLineChart({ chartData, selectedStrike, activeMetrics, showCall, showPut, showCompare }) {
  const allStrikes = Object.keys(chartData.strikes || {}).map(Number).sort((a, b) => a - b);
  const selIdx     = allStrikes.indexOf(Number(selectedStrike));

  const compStrikes = [];
  if (showCompare) {
    for (let d = -3; d <= 3; d++) {
      const idx = selIdx + d;
      if (idx >= 0 && idx < allStrikes.length) compStrikes.push({ strike: allStrikes[idx], dist: Math.abs(d) });
    }
  } else {
    if (selIdx >= 0) compStrikes.push({ strike: allStrikes[selIdx], dist: 0 });
  }

  const timeSet = new Set();
  compStrikes.forEach(({ strike }) => {
    const s = chartData.strikes[strike];
    if (!s) return;
    [...(s.call || []), ...(s.put || [])].forEach(d => timeSet.add(d.time));
  });
  const times = [...timeSet].sort();
  if (times.length === 0) return <div className="oic-empty">No data available.</div>;

  const W = 900, H = 440;
  const mg = { top: 28, right: 24, bottom: 44, left: 48 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top  - mg.bottom;
  const n  = times.length;
  const xS = i => mg.left + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yS = v => mg.top  + cH * (1 - v / 100);

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = times.filter((_, i) => i === 0 || i === n - 1 || i % Math.max(1, Math.floor(n / 8)) === 0);

  const lines = [];
  compStrikes.forEach(({ strike, dist }) => {
    const sd  = chartData.strikes[strike];
    if (!sd) return;
    const sty = STRIKE_STYLE[dist] || STRIKE_STYLE[3];

    METRICS.forEach(m => {
      if (!activeMetrics[m.key]) return;
      const buildPath = (arr, dash) => {
        const timeMap = Object.fromEntries((arr || []).map(d => [d.time, d]));
        const pts = times.map((t, i) => ({ i, v: Number(timeMap[t]?.[m.key] || 0) }));
        const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${xS(p.i)},${yS(p.v)}`).join(' ');
        return (
          <path key={`${strike}-${m.key}-${dash}`}
            d={d} fill="none"
            stroke={m.color}
            strokeWidth={sty.width}
            strokeOpacity={sty.opacity}
            strokeDasharray={dash}
          />
        );
      };
      if (showCall) lines.push(buildPath(sd.call, 'none'));
      if (showPut)  lines.push(buildPath(sd.put,  '6 3'));
    });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="oic-svg">
      <text x={W / 2} y={H / 2 - 10} textAnchor="middle" fontSize="28" fontWeight="900"
        fill="#64748b" opacity="0.07" transform={`rotate(-20,${W/2},${H/2})`}>
        SOC.AI.IN
      </text>
      {yTicks.map(v => (
        <line key={v} x1={mg.left} x2={W - mg.right} y1={yS(v)} y2={yS(v)}
          stroke={v === 50 ? '#94a3b8' : '#e2e8f0'}
          strokeWidth={v === 50 ? 1.2 : 1}
          strokeDasharray={v === 50 ? '6 4' : '4 3'}
        />
      ))}
      {lines}
      <line x1={mg.left} x2={mg.left} y1={mg.top} y2={H - mg.bottom} stroke="#94a3b8" />
      <line x1={mg.left} x2={W - mg.right} y1={H - mg.bottom} y2={H - mg.bottom} stroke="#94a3b8" />
      {yTicks.map(v => (
        <text key={v} x={mg.left - 6} y={yS(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">{v}%</text>
      ))}
      {xTicks.map(t => {
        const i = times.indexOf(t);
        return <text key={t} x={xS(i)} y={H - mg.bottom + 14} textAnchor="middle" fontSize="9" fill="#64748b">{t}</text>;
      })}
    </svg>
  );
}

export default function CryptoOIChartModal() {
  const { state, dispatch } = useApp();
  const [chartData,     setChartData]     = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [activeMetrics, setActiveMetrics] = useState({ vol_pct: true, oi_pct: true, oichng_pct: true });
  const [showCall,      setShowCall]      = useState(true);
  const [showPut,       setShowPut]       = useState(false);
  const [focusStrike,   setFocusStrike]   = useState(null);
  const [showCompare,   setShowCompare]   = useState(false);

  const modal = state.cryptoOiChartModal;

  useEffect(() => {
    if (!modal) return;
    setFocusStrike(Number(modal.strike));
    setShowCall(modal.type !== 'put');
    setShowPut(modal.type !== 'call');
    setShowCompare(false);
    setLoading(true); setError(null); setChartData(null);
    fetch(`/api/crypto/chart/oi/${modal.underlying}/${modal.expiry}/${modal.date}`)
      .then(r => r.json())
      .then(res => { setChartData(res); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [modal?.strike, modal?.underlying, modal?.expiry, modal?.date]);

  if (!modal) return null;
  const close     = () => dispatch({ type: 'SET_CRYPTO_OI_CHART_MODAL', payload: null });
  const strike    = focusStrike || Number(modal.strike);
  const sideLabel = modal.type === 'call' ? 'CE' : modal.type === 'put' ? 'PE' : '';

  const allStrikes  = chartData?.strikes ? Object.keys(chartData.strikes).map(Number).sort((a, b) => a - b) : [];
  const selIdx      = allStrikes.indexOf(Number(strike));
  const strikePills = [];
  for (let d = -3; d <= 3; d++) {
    const idx = selIdx + d;
    if (idx >= 0 && idx < allStrikes.length) strikePills.push({ strike: allStrikes[idx], d });
  }

  const toggleMetric = key => setActiveMetrics(p => ({ ...p, [key]: !p[key] }));

  return (
    <>
      <div className="chart-modal-backdrop" onClick={close} />
      <div className="oic-modal oic-modal-big">

        <div className="oic-header">
          <span className="oic-title">
            🪙 {modal.underlying} &nbsp;|&nbsp; Strike {strike} {sideLabel} &nbsp;|&nbsp; OI % Chart
            <span className="oic-wm-badge">SOC.AI.IN</span>
          </span>
          <button className="chart-modal-close" onClick={close}>✕</button>
        </div>

        <div className="oic-controls">
          <div className="oic-ctrl-group">
            {METRICS.map(m => (
              <button key={m.key}
                className={`oic-toggle-btn ${activeMetrics[m.key] ? 'active' : ''}`}
                style={{ '--tc': m.color }}
                onClick={() => toggleMetric(m.key)}
              >{m.label}</button>
            ))}
          </div>
          <div className="oic-ctrl-group">
            <button className={`oic-toggle-btn ${showCall ? 'active' : ''}`}
              style={{ '--tc': '#1976d2' }} onClick={() => setShowCall(p => !p)}>CALL (—)</button>
            <button className={`oic-toggle-btn ${showPut ? 'active' : ''}`}
              style={{ '--tc': '#ff6f00' }} onClick={() => setShowPut(p => !p)}>PUT (- -)</button>
          </div>
          <div className="oic-ctrl-group">
            <button className={`oic-toggle-btn ${showCompare ? 'active' : ''}`}
              style={{ '--tc': '#7c3aed' }}
              onClick={() => setShowCompare(p => !p)}>COMPARE ±3</button>
          </div>
        </div>

        {chartData && strikePills.length > 0 && (
          <div className="oic-strike-row">
            <span className="oic-strike-label">Strike:</span>
            {strikePills.map(({ strike: s, d }) => (
              <button key={s}
                className={`oic-strike-pill ${s === Number(strike) ? 'selected' : ''}`}
                onClick={() => setFocusStrike(s)}
              >
                {d === 0 ? `★ ${s}` : (d > 0 ? `+${d} ${s}` : `${d} ${s}`)}
              </button>
            ))}
          </div>
        )}

        <div className="oic-body oic-body-big">
          {loading && <div className="oic-state">Loading chart data...</div>}
          {error   && <div className="oic-state oic-error">Error: {error}</div>}
          {!loading && !error && chartData && (
            <div className="oic-chart-wrap">
              <div className="oic-legend">
                {METRICS.filter(m => activeMetrics[m.key]).map(m => (
                  <span key={m.key} className="oic-legend-item">
                    <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={m.color} strokeWidth="2.5" /></svg>
                    {m.label}
                  </span>
                ))}
                {showCall && <span className="oic-legend-item"><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#555" strokeWidth="2" /></svg>CALL</span>}
                {showPut  && <span className="oic-legend-item"><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#555" strokeWidth="2" strokeDasharray="5 3" /></svg>PUT</span>}
                {showCompare && <span className="oic-legend-opacity">Faded = adjacent strikes (±1 ±2 ±3)</span>}
              </div>
              <MultiLineChart
                chartData={chartData}
                selectedStrike={strike}
                activeMetrics={activeMetrics}
                showCall={showCall}
                showPut={showPut}
                showCompare={showCompare}
              />
            </div>
          )}
        </div>

      </div>
    </>
  );
}
