import { useEffect, useState, useRef, useCallback } from 'react';
import './HeatmapPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

// Squarified treemap algorithm
function squarify(items, x, y, w, h) {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.value, 0);

  const results = [];
  let remaining = [...items];
  let rx = x, ry = y, rw = w, rh = h;

  while (remaining.length) {
    const short = Math.min(rw, rh);
    const long  = Math.max(rw, rh);
    const areaTotal = remaining.reduce((s, i) => s + i.value, 0);

    // Find best row — add items while aspect ratio improves
    let row = [];
    let rowArea = 0;
    let prevWorst = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const area = (item.value / areaTotal) * rw * rh;
      row.push({ ...item, area });
      rowArea += area;

      const rowLen = rowArea / short;
      let worst = 0;
      for (const ri of row) {
        const side = ri.area / rowLen;
        const ratio = side > rowLen ? side / rowLen : rowLen / side;
        if (ratio > worst) worst = ratio;
      }

      if (i > 0 && worst > prevWorst) {
        row.pop();
        rowArea -= area;
        break;
      }
      prevWorst = worst;
    }

    // Lay out the row
    const rowLen = rowArea / short;
    const horizontal = rw >= rh;
    let cx = rx, cy = ry;

    for (const ri of row) {
      const side = ri.area / rowLen;
      if (horizontal) {
        results.push({ ...ri, x: cx, y: cy, w: rowLen, h: side });
        cy += side;
      } else {
        results.push({ ...ri, x: cx, y: cy, w: side, h: rowLen });
        cx += side;
      }
    }

    // Trim used area
    remaining = remaining.slice(row.length);
    if (horizontal) { rx += rowLen; rw -= rowLen; }
    else             { ry += rowLen; rh -= rowLen; }
  }

  return results;
}

function pctColor(pct) {
  if (pct === null || pct === undefined) return '#2a2a3e';
  if (pct >  3)  return '#0d5c2e';
  if (pct >  1.5) return '#1a7a42';
  if (pct >  0.5) return '#27a35a';
  if (pct >  0)  return '#3db870';
  if (pct === 0) return '#2a2a3e';
  if (pct > -0.5) return '#c0392b';
  if (pct > -1.5) return '#a93226';
  if (pct > -3)  return '#922b21';
  return '#7b241c';
}

function pctLabel(pct) {
  if (pct === null || pct === undefined) return '--';
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

const SECTORS = ['Finance','Energy','Technology','Auto','Consumer','Healthcare','Metals','Industrial','Utilities','Telecom','Aviation','Chemicals'];

export default function HeatmapPage() {
  const [stocks, setStocks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [view, setView]           = useState('all'); // 'all' | sector name
  const containerRef              = useRef(null);
  const [dims, setDims]           = useState({ w: 0, h: 0 });
  const timerRef                  = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/heatmap/nifty50`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setStocks(data.stocks);
        setLastUpdate(new Date());
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, 30000);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filter stocks by selected sector
  const filtered = view === 'all' ? stocks : stocks.filter(s => s.sector === view);

  // Build treemap items — group by sector when showing all
  let tiles = [];
  if (dims.w && dims.h && filtered.length) {
    if (view === 'all') {
      // Group into sectors, then sub-squarify each sector
      const sectorMap = {};
      for (const s of filtered) {
        if (!sectorMap[s.sector]) sectorMap[s.sector] = [];
        sectorMap[s.sector].push(s);
      }

      // Top-level sector blocks
      const sectorItems = SECTORS
        .filter(sec => sectorMap[sec])
        .map(sec => ({
          id: sec,
          value: sectorMap[sec].reduce((a, s) => a + s.mcap, 0),
          stocks: sectorMap[sec],
        }));

      const sectorTiles = squarify(sectorItems, 0, 0, dims.w, dims.h);

      // Within each sector block, squarify the stocks
      for (const st of sectorTiles) {
        const PAD = 2;
        const stockItems = st.stocks.map(s => ({ ...s, id: s.sym, value: s.mcap }));
        const inner = squarify(stockItems, st.x + PAD, st.y + PAD, st.w - PAD * 2, st.h - PAD * 2);
        for (const tile of inner) {
          tiles.push({ ...tile, sectorLabel: st.id });
        }
      }
    } else {
      const items = filtered.map(s => ({ ...s, id: s.sym, value: s.mcap }));
      tiles = squarify(items, 0, 0, dims.w, dims.h);
    }
  }

  const sectors = SECTORS.filter(sec => stocks.some(s => s.sector === sec));

  return (
    <div className="heatmap-page">
      <div className="heatmap-header">
        <div className="heatmap-title-row">
          <h1 className="heatmap-title">Nifty 50 — Stock Heatmap</h1>
          <div className="heatmap-meta">
            {lastUpdate && <span className="heatmap-update">Updated {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            <button className="heatmap-refresh" onClick={fetchData} title="Refresh">&#8635;</button>
          </div>
        </div>

        <div className="heatmap-legend">
          <span className="legend-box" style={{ background: '#0d5c2e' }}></span><span>&gt;+3%</span>
          <span className="legend-box" style={{ background: '#27a35a' }}></span><span>0–3%</span>
          <span className="legend-box" style={{ background: '#2a2a3e' }}></span><span>Flat</span>
          <span className="legend-box" style={{ background: '#c0392b' }}></span><span>0–3%</span>
          <span className="legend-box" style={{ background: '#7b241c' }}></span><span>&lt;-3%</span>
        </div>

        <div className="heatmap-sectors">
          <button className={`sector-btn${view === 'all' ? ' active' : ''}`} onClick={() => setView('all')}>All Sectors</button>
          {sectors.map(sec => (
            <button key={sec} className={`sector-btn${view === sec ? ' active' : ''}`} onClick={() => setView(sec)}>{sec}</button>
          ))}
        </div>
      </div>

      <div className="heatmap-canvas-wrap" ref={containerRef}>
        {loading && <div className="heatmap-loading">Loading live prices...</div>}
        {!loading && dims.w > 0 && (
          <svg width={dims.w} height={dims.h} className="heatmap-svg">
            {tiles.map(tile => {
              const stock = tile;
              const bg    = pctColor(tile.pct);
              const MIN_W = 30, MIN_H = 20;
              const showSym  = tile.w > MIN_W && tile.h > MIN_H;
              const showPct  = tile.w > 45  && tile.h > 36;
              const showName = tile.w > 70  && tile.h > 52;
              const fontSize = Math.max(9, Math.min(14, tile.w / 7));

              return (
                <g key={tile.sym || tile.id} style={{ cursor: 'default' }}>
                  <rect
                    x={tile.x + 1} y={tile.y + 1}
                    width={Math.max(0, tile.w - 2)} height={Math.max(0, tile.h - 2)}
                    rx={3} ry={3}
                    fill={bg}
                    stroke="rgba(0,0,0,0.35)" strokeWidth={1}
                  />
                  {showSym && (
                    <text
                      x={tile.x + tile.w / 2} y={tile.y + tile.h / 2 + (showPct ? -8 : showName ? -10 : 4)}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="#fff" fontWeight="700"
                      fontSize={Math.min(fontSize, showPct ? 12 : 13)}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {tile.sym}
                    </text>
                  )}
                  {showPct && (
                    <text
                      x={tile.x + tile.w / 2} y={tile.y + tile.h / 2 + 6}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={tile.pct === null ? '#888' : tile.pct >= 0 ? '#a8e6c0' : '#f5b7b1'}
                      fontWeight="600" fontSize={Math.min(11, fontSize - 1)}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {pctLabel(tile.pct)}
                    </text>
                  )}
                  {showName && (
                    <text
                      x={tile.x + tile.w / 2} y={tile.y + tile.h / 2 + 20}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="rgba(255,255,255,0.55)" fontSize={9}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {tile.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Sector labels overlay when viewing all */}
            {view === 'all' && tiles.length > 0 && (() => {
              const sectorBounds = {};
              for (const t of tiles) {
                const sec = t.sectorLabel;
                if (!sec) continue;
                if (!sectorBounds[sec]) sectorBounds[sec] = { x: t.x, y: t.y, x2: t.x + t.w, y2: t.y + t.h };
                else {
                  sectorBounds[sec].x  = Math.min(sectorBounds[sec].x, t.x);
                  sectorBounds[sec].y  = Math.min(sectorBounds[sec].y, t.y);
                  sectorBounds[sec].x2 = Math.max(sectorBounds[sec].x2, t.x + t.w);
                  sectorBounds[sec].y2 = Math.max(sectorBounds[sec].y2, t.y + t.h);
                }
              }
              return Object.entries(sectorBounds).map(([sec, b]) => {
                const bw = b.x2 - b.x, bh = b.y2 - b.y;
                if (bw < 60 || bh < 18) return null;
                return (
                  <text key={`sec-${sec}`}
                    x={b.x + 6} y={b.y + 13}
                    fill="rgba(255,255,255,0.35)" fontSize={10} fontWeight="600"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {sec.toUpperCase()}
                  </text>
                );
              });
            })()}
          </svg>
        )}
      </div>
    </div>
  );
}
