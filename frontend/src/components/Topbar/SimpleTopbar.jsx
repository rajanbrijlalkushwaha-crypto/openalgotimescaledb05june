import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import './SimpleTopbar.css';

// Fallback symbols — shown even when broker not connected yet
const NSE_IDX_FALLBACK = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50'];
const BSE_IDX_FALLBACK = ['SENSEX', 'BANKEX'];
const MCX_FALLBACK     = ['GOLD', 'SILVER', 'COPPER', 'ZINC', 'NATURALGAS', 'CRUDEOIL'];

const NSE_INDICES = new Set(NSE_IDX_FALLBACK);
const BSE_INDICES = new Set(BSE_IDX_FALLBACK);

const GROUPS = [
  { id: 'NSE_IDX', label: 'NSE Indices', color: '#2196f3' },
  { id: 'BSE_IDX', label: 'BSE Indices', color: '#4caf50' },
  { id: 'NFO',     label: 'NSE F&O',     color: '#7c3aed' },
  { id: 'MCX',     label: 'MCX',         color: '#ff9800' },
];

export default function SimpleTopbar({ onLoad, wsLive, futures = {}, currentSymbol }) {
  const { state } = useApp();
  const [underlyings, setUnderlyings] = useState({ NFO: [], BFO: [], MCX: [] });
  const [selected,    setSelected]    = useState(null);
  const [expiries,    setExpiries]    = useState([]);
  const [expiry,      setExpiry]      = useState('');
  const [open,        setOpen]        = useState(false);
  const [search,      setSearch]      = useState('');
  const [time,        setTime]        = useState('');
  const wrapRef   = useRef(null);
  const searchRef = useRef(null);

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Load all underlyings from server
  useEffect(() => {
    fetch('/api/underlyings')
      .then(r => r.json())
      .then(d => { if (d.data) setUnderlyings(d.data); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  // Build groups — use fallbacks if underlyings not loaded yet
  const nfoAll  = underlyings.NFO?.length > 0 ? underlyings.NFO : NSE_IDX_FALLBACK;
  const bfoAll  = underlyings.BFO?.length > 0 ? underlyings.BFO : BSE_IDX_FALLBACK;
  const mcxAll  = underlyings.MCX?.length > 0 ? underlyings.MCX : MCX_FALLBACK;

  const nseIdx  = nfoAll.filter(s => NSE_INDICES.has(s));
  const bseIdx  = bfoAll.filter(s => BSE_INDICES.has(s));
  const nfoStks = nfoAll.filter(s => !NSE_INDICES.has(s));

  const q = search.toLowerCase();
  const rawGroups = [
    { id: 'NSE_IDX', seg: 'NFO', items: nseIdx },
    { id: 'BSE_IDX', seg: 'BFO', items: bseIdx },
    { id: 'NFO',     seg: 'NFO', items: nfoStks },
    { id: 'MCX',     seg: 'MCX', items: mcxAll  },
  ];

  const groups = rawGroups
    .map(g => ({
      ...g,
      ...GROUPS.find(x => x.id === g.id),
      items: q ? g.items.filter(s => s.toLowerCase().includes(q)) : g.items,
    }))
    .filter(g => g.items.length > 0);

  const pickSymbol = async (sym, seg, groupId) => {
    setOpen(false);
    setSearch('');
    setSelected({ sym, seg, groupId });
    setExpiries([]);
    setExpiry('');
    try {
      const r = await fetch(`/api/expiries/${seg}/${encodeURIComponent(sym)}`);
      const d = await r.json();
      if (d.status === 'error') { alert(`Cannot load ${sym}: ${d.message}`); return; }
      const list = d.data || [];
      setExpiries(list);
      if (list.length) {
        setExpiry(list[0]);
        onLoad(sym, list[0], seg);
      }
    } catch {
      alert(`Failed to load expiries for ${sym}`);
    }
  };

  const handleExpiryChange = (e) => {
    const exp = e.target.value;
    setExpiry(exp);
    if (selected && exp) onLoad(selected.sym, exp, selected.seg);
  };

  const spot    = state.currentSpot  || 0;
  const futData = futures[currentSymbol] || futures[state.currentSymbol];
  const symBadge = state.currentSymbol || '';
  const expBadge = state.currentExpiry || '—';

  const fmt = (n) => n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';
  const isPos = (n) => (n ?? 0) >= 0;

  return (
    <div className="stb">

      {/* Symbol dropdown */}
      <div className="stb-sym-wrap" ref={wrapRef}>
        <button
          className={`stb-sym-btn${open ? ' open' : ''}`}
          onClick={() => setOpen(v => !v)}
        >
          {selected ? (
            <>
              <span className="stb-sym-tag"
                style={{ background: GROUPS.find(g => g.id === selected.groupId)?.color || '#444' }}>
                {GROUPS.find(g => g.id === selected.groupId)?.label || selected.seg}
              </span>
              <span className="stb-sym-name">{selected.sym}</span>
            </>
          ) : (
            <span className="stb-sym-placeholder">Select Symbol ▾</span>
          )}
          <span className="stb-sym-arrow">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="stb-sym-drop">
            <div className="stb-sym-search-wrap">
              <input
                ref={searchRef}
                className="stb-sym-search"
                placeholder="Search symbol…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {search && (
                <button className="stb-sym-clear" onClick={() => setSearch('')}>✕</button>
              )}
            </div>
            <div className="stb-sym-list">
              {groups.length === 0 ? (
                <div className="stb-sym-empty">No symbols found</div>
              ) : (
                groups.map(({ id, seg, label, color, items }) => (
                  <div key={id}>
                    <div className="stb-sym-group" style={{ borderLeftColor: color }}>
                      <span style={{ color }}>{label}</span>
                      <span className="stb-sym-count">{items.length}</span>
                    </div>
                    {items.map(sym => {
                      const isActive = selected?.sym === sym && selected?.groupId === id;
                      return (
                        <div
                          key={`${id}:${sym}`}
                          className={`stb-sym-item${isActive ? ' active' : ''}`}
                          style={isActive ? { borderLeftColor: color, color } : {}}
                          onClick={() => pickSymbol(sym, seg, id)}
                        >
                          {sym}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expiry */}
      {expiries.length > 0 && (
        <select className="stb-select" value={expiry} onChange={handleExpiryChange}>
          {expiries.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      )}

      <div className="stb-divider" />

      {/* Symbol + Expiry badges */}
      {symBadge && (
        <>
          <span className="stb-badge sym">{symBadge}</span>
          <span className="stb-badge exp">{expBadge}</span>
        </>
      )}

      {/* Spot price badge */}
      {spot > 0 && (
        <span className="stb-badge spot">
          <span className="stb-price-label">SPOT</span>
          ₹{fmt(spot)}
        </span>
      )}

      {/* Futures price badge — shown when futures data is available for current symbol */}
      {futData?.ltp > 0 && (
        <span className={`stb-badge fut ${isPos(futData.chg) ? 'up' : 'dn'}`}>
          <span className="stb-price-label">FUT</span>
          ₹{fmt(futData.ltp)}
          <span className="stb-fut-chg">
            {isPos(futData.chg) ? '+' : ''}{(futData.chg || 0).toFixed(2)}
            &nbsp;({isPos(futData.pct) ? '+' : ''}{(futData.pct || 0).toFixed(2)}%)
          </span>
        </span>
      )}

      {/* WS status + time */}
      <div className="stb-right">
        <span className={`stb-ws${wsLive ? ' on' : ''}`}>
          {wsLive ? '● LIVE' : '○ CONN...'}
        </span>
        <span className="stb-time">{time}</span>
      </div>
    </div>
  );
}
