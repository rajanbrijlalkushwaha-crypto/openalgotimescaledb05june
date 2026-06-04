import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchMarketHolidays, fetchMarketTimings } from '../../services/api';
import wsClient from '../../services/wsClient';
import './IndexPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

// All symbols that are indices (shown before stocks in the list)
const ALL_INDEX_SYMBOLS = new Set([
  'NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY','NIFTYNXT50',
  'SENSEX','BANKEX','SENSEX50',
  'NIFTY100','NIFTY200','NIFTY500','NIFTYMID100','NIFTYSC100',
  'NIFTYIT','NIFTYAUTO','NIFTYPHARMA','NIFTYMETAL','NIFTYENERGY',
  'NIFTYFMCG','NIFTYPSUBNK','NIFTYREALTY','NIFTYPVTBNK','NIFTYMEDIA','INDIAVIX',
  'BSE100','BSE200','BSE500','AUTO','METAL','BSEIT','HEALTHCARE','BSEREALTY',
]);

// Fine-grained priority within indices (lower index = shown first)
const INDEX_PRIORITY = [
  (s) => s === 'NIFTY' || s === 'NIFTY_50' || s === 'NIFTY50',
  (s) => s === 'BANKNIFTY' || s === 'BANK_NIFTY',
  (s) => s === 'FINNIFTY' || s === 'FIN_NIFTY',
  (s) => s === 'MIDCPNIFTY' || s.startsWith('MIDCAP') || s === 'MIDCAP_NIFTY',
  (s) => s === 'NIFTYNXT50',
  (s) => s === 'SENSEX',
  (s) => s === 'BANKEX',
  (s) => s === 'SENSEX50',
];

function getIndexRank(symbol) {
  const s = symbol.toUpperCase();
  for (let i = 0; i < INDEX_PRIORITY.length; i++) {
    if (INDEX_PRIORITY[i](s)) return i;
  }
  return INDEX_PRIORITY.length; // other indices get same rank, sorted alphabetically
}

function isIndex(symbol) {
  const s = symbol.toUpperCase();
  return ALL_INDEX_SYMBOLS.has(s) || s.includes('NIFTY') || s.includes('SENSEX') || s.includes('BANKEX');
}

function sortSymbols(symbols) {
  return [...symbols].sort((a, b) => {
    const aIdx = isIndex(a);
    const bIdx = isIndex(b);
    if (aIdx !== bIdx) return aIdx ? -1 : 1;   // all indices before all stocks
    if (aIdx) {
      const ra = getIndexRank(a), rb = getIndexRank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    }
    return a.localeCompare(b);                  // stocks alphabetical
  });
}

function getExchange(symbol) {
  const s = symbol.toUpperCase();
  if (s.includes('SENSEX') || s.includes('BANKEX') || s.includes('BSE')) return 'BSE';
  return 'NSE';
}

function isMarketOpen() {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 5.5 * 3600000);
  const day   = ist.getDay();
  if (day === 0 || day === 6) return false;
  const t = ist.getHours() * 100 + ist.getMinutes();
  return t >= 859 && t <= 1532;
}

// Convert epoch ms (UTC) → IST 24-hr "HH:MM"
function msToIST(ms) {
  if (!ms) return '--';
  const ist = new Date(Number(ms) + 5.5 * 3600000);
  const h   = ist.getUTCHours();
  const m   = ist.getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "YYYY-MM-DD" → "DD-MM-YYYY"
function fmtDate(d) {
  if (!d) return '--';
  const [y, mo, day] = d.split('-');
  return `${day}-${mo}-${y}`;
}

// Display order for timing table
const EXCH_ORDER = ['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'BCD', 'MCX'];

// Human-readable segment names for each exchange code
const SEGMENT_NAMES = {
  NSE: 'NSE — Equity',
  BSE: 'BSE — Equity',
  NFO: 'NSE — F&O',
  BFO: 'BSE — F&O',
  CDS: 'NSE — Currency',
  BCD: 'BSE — Currency',
  MCX: 'MCX — Commodity',
};

function exchRank(ex) {
  const i = EXCH_ORDER.indexOf(ex);
  return i === -1 ? 999 : i;
}

// Check if a specific exchange is currently open based on its timing ms timestamps
function isExchangeOpen(startMs, endMs) {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false; // weekend

  const nowMins   = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const startIST  = new Date(Number(startMs) + 5.5 * 3600000);
  const endIST    = new Date(Number(endMs)   + 5.5 * 3600000);
  const startMins = startIST.getUTCHours() * 60 + startIST.getUTCMinutes();
  const endMins   = endIST.getUTCHours()   * 60 + endIST.getUTCMinutes();
  return nowMins >= startMins && nowMins <= endMins;
}

// VIX zone definitions — used by both the gauge and level label
const VIX_ZONES = [
  { from: 0,  to: 12, color: '#3b82f6', label: 'Very Low'  },
  { from: 12, to: 17, color: '#22c55e', label: 'Low'       },
  { from: 17, to: 21, color: '#84cc16', label: 'Normal'    },
  { from: 21, to: 26, color: '#eab308', label: 'Elevated'  },
  { from: 26, to: 33, color: '#f97316', label: 'High'      },
  { from: 33, to: 40, color: '#ef4444', label: 'Extreme'   },
];

function vixLevel(v) {
  const z = VIX_ZONES.find(z => v >= z.from && v < z.to) || VIX_ZONES[VIX_ZONES.length - 1];
  return z || { label: '—', color: '#94a3b8' };
}

// SVG speedometer gauge for India VIX
function VixGauge({ vix }) {
  const MAX = 40;
  const CX = 140, CY = 138;
  const RO = 112, RI = 80;

  const pt = (v, r) => {
    const a = (Math.min(Math.max(v, 0), MAX) / MAX) * Math.PI;
    return [+(CX - r * Math.cos(a)).toFixed(2), +(CY - r * Math.sin(a)).toFixed(2)];
  };

  const arcSeg = (v1, v2, ro, ri) => {
    const [x1, y1] = pt(v1, ro), [x2, y2] = pt(v2, ro);
    const [x3, y3] = pt(v2, ri), [x4, y4] = pt(v1, ri);
    const lg = (v2 - v1) >= MAX * 0.5 ? 1 : 0;
    return `M${x1},${y1} A${ro},${ro} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${ri},${ri} 0 ${lg} 0 ${x4},${y4}Z`;
  };

  const val    = Math.max(0, vix?.ltp || 0);
  const change = vix?.change || 0;
  const pct    = vix?.pct_change || 0;
  const lvl    = vixLevel(val);
  const [nx, ny] = pt(Math.min(val, MAX), 92);

  const ticks = Array.from({ length: 41 }, (_, i) => {
    const v = i;
    const isMaj = v % 10 === 0;
    const isMed = v % 5 === 0 && !isMaj;
    const len = isMaj ? 14 : isMed ? 9 : 5;
    const [ox, oy] = pt(v, RO + 2);
    const [ix, iy] = pt(v, RO + len);
    return { v, ox, oy, ix, iy, isMaj, isMed };
  });

  return (
    <svg viewBox="0 0 280 220" style={{ width: '100%', display: 'block' }}>
      {/* Dark ring background */}
      <path d={arcSeg(0, MAX, RO + 16, RI - 6)} fill="#0d1a2e" />

      {/* Colored zone arcs */}
      {VIX_ZONES.map(z => (
        <path key={z.from} d={arcSeg(z.from, Math.min(z.to, MAX), RO, RI)} fill={z.color} />
      ))}

      {/* Tick marks */}
      {ticks.map(({ v, ox, oy, ix, iy, isMaj, isMed }) => (
        <line key={v} x1={ox} y1={oy} x2={ix} y2={iy}
          stroke="rgba(255,255,255,0.85)" strokeWidth={isMaj ? 2 : isMed ? 1.5 : 0.8} />
      ))}

      {/* Scale labels */}
      {[0, 10, 20, 30, 40].map(v => {
        const [lx, ly] = pt(v, RO + 25);
        return <text key={v} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fill="rgba(255,255,255,0.8)" fontWeight="700">{v}</text>;
      })}

      {/* Needle */}
      <line x1={CX} y1={CY} x2={nx} y2={ny}
        stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r="10" fill="white" />
      <circle cx={CX} cy={CY} r="7"  fill="#0d1a2e" />

      {/* Labels below needle */}
      <text x={CX} y={CY + 22} textAnchor="middle"
        fontSize="10" fill="rgba(255,255,255,0.55)" fontWeight="700" letterSpacing="1.5">
        INDIA VIX
      </text>
      <text x={CX} y={CY + 42} textAnchor="middle"
        fontSize="28" fill="white" fontWeight="900" fontFamily="monospace">
        {val > 0 ? val.toFixed(2) : '—'}
      </text>
      {/* Dot + level label */}
      <circle cx={CX - 26} cy={CY + 57} r="4" fill={lvl.color} />
      <text x={CX - 18} y={CY + 58} dominantBaseline="middle"
        fontSize="13" fill={lvl.color} fontWeight="800">
        {lvl.label}
      </text>
      {/* Change */}
      {val > 0 && (
        <text x={CX} y={CY + 74} textAnchor="middle"
          fontSize="11" fill={change >= 0 ? '#ef4444' : '#22c55e'} fontWeight="600">
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
          {'  '}({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
        </text>
      )}
    </svg>
  );
}

export default function IndexPage() {
  useBodyScroll();
  const { state, dispatch } = useApp();
  const [prices,        setPrices]        = useState({});
  const [lastRefresh,   setLastRefresh]   = useState(null);
  const [marketOpen,    setMarketOpen]    = useState(isMarketOpen());
  const [timings,       setTimings]       = useState({ date: null, rows: [] });
  const [holidays,      setHolidays]      = useState([]);
  const [holidaysOpen,  setHolidaysOpen]  = useState(false);
  const [istClock,      setIstClock]      = useState({ time: '', date: '' });
  const [aiSignals,     setAiSignals]     = useState(null);
  const [vixData,       setVixData]       = useState(null);
  const [globalIndices, setGlobalIndices] = useState([]);

  const isAdminOrMember = state.user?.role === 'admin' || state.user?.role === 'member';

  // Live IST clock — ticks every second
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
      setIstClock({
        time: ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        date: ist.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Re-check market status every minute
  useEffect(() => {
    const id = setInterval(() => setMarketOpen(isMarketOpen()), 60000);
    return () => clearInterval(id);
  }, []);

  // Load AI stock signals (admin/member only)
  useEffect(() => {
    if (!isAdminOrMember) return;
    fetch(`${API_BASE}/api/trainai/stock-signals/live`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setAiSignals(d); })
      .catch(() => {});
  }, [isAdminOrMember]);

  // India VIX — poll every 60s
  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/api/market/vix`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.success && d.data) setVixData(d.data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Global indices — poll every 60s
  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/api/market/global-indices`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.success && d.data?.length) setGlobalIndices(d.data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Load market timings & holidays once
  useEffect(() => {
    fetchMarketTimings()
      .then(res => {
        if (res.success) {
          const sorted = [...(res.data || [])].sort(
            (a, b) => exchRank(a.exchange) - exchRank(b.exchange)
          );
          setTimings({ date: res.date || null, rows: sorted });
        }
      })
      .catch(() => {});
    fetchMarketHolidays()
      .then(res => { if (res.success) setHolidays(res.data || []); })
      .catch(() => {});
  }, []);

  // Live spot prices — initial load via compact endpoint, real-time via WebSocket
  useEffect(() => {
    if (!state.symbols.length) return;

    // One compact HTTP call for instant initial render (all symbols, just spot + time)
    fetch(`${API_BASE}/api/spot-prices`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.prices) {
          setPrices(prev => {
            const updated = { ...prev };
            for (const [sym, info] of Object.entries(d.prices)) {
              updated[sym] = { spot: info.spot, time: info.time || '--', error: false };
            }
            return updated;
          });
          setLastRefresh(new Date().toLocaleTimeString('en-IN'));
        }
      })
      .catch(() => {});

    // Real-time push updates via WebSocket — fires the moment backend updates data
    const unsubs = state.symbols.map(sym =>
      wsClient.subscribe(sym, ({ type, data }) => {
        if ((type === 'full' || type === 'diff') && data?.spot_price !== undefined) {
          setPrices(prev => ({
            ...prev,
            [sym]: { spot: data.spot_price, time: data.time || prev[sym]?.time || '--', error: false },
          }));
          setLastRefresh(new Date().toLocaleTimeString('en-IN'));
        }
      })
    );

    return () => unsubs.forEach(u => u());
  }, [state.symbols]);

  const openChain = (symbol) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: symbol });
    dispatch({ type: 'SET_INDEX_PAGE', payload: false });
  };

  const handleLogout = async () => {
    try { await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (_) {}
    window.location.replace('/');
  };

  const fmt = (val) =>
    val != null
      ? Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '---';

  const sorted   = sortSymbols(state.symbols);
  const userName = state.user?.name || state.user?.email || null;

  // Upcoming holidays (today or future)
  const todayStr    = new Date().toISOString().split('T')[0];
  const upcomingHol = holidays
    .filter(h => (h.date || h.trading_date || '') >= todayStr)
    .sort((a, b) => (a.date || a.trading_date || '').localeCompare(b.date || b.trading_date || ''));

  return (
    <div className="idx-page">

      {/* ── White Top Bar ── */}
      <div className="idx-topbar">
        <div className="idx-topbar-left">
          <span className="idx-brand">SOC<span>.AI.IN</span></span>
          <span className="idx-page-title">Market Dashboard</span>
        </div>
        <div className="idx-topbar-right">
          {!marketOpen && (
            <span className="idx-market-closed-badge">&#x25CF; Market Closed</span>
          )}
          {istClock.time && (
            <span className="idx-ist-clock">
              <span className="idx-live-dot" />
              {istClock.date} &nbsp;{istClock.time} IST
            </span>
          )}
          {lastRefresh && (
            <span className="idx-refresh-time">
              Updated {lastRefresh}
            </span>
          )}
          {userName && (
            <span className="idx-welcome">
              Welcome, <strong>{userName}</strong>
            </span>
          )}
          <button className="idx-logout-btn" onClick={handleLogout}>⏻ Logout</button>
        </div>
      </div>

      {/* ── Scrollable body: hero + content scroll together ── */}
      <div className="idx-scroll-body">

      {/* ── Hero Section ── */}
      <div className="idx-hero">

        {/* Top row: heading left + welcome card right */}
        <div className="idx-hero-top">
          <div className="idx-hero-text">
            <h1 className="idx-hero-h1">
              Welcome to <span style={{ color: '#f97316' }}>Simplify</span>{' '}
              <span style={{ color: '#ef4444' }}>Option</span>{' '}
              <span style={{ color: '#22c55e' }}>Chain</span>
            </h1>
            <h2 className="idx-hero-h2">(Formally known as soc.ai.in)</h2>
            <p className="idx-hero-tagline">Your Intelligent Pathway to Precise Option Analysis</p>
          </div>
          <div className="idx-hero-card">
            <div className="idx-hc-text">
              <span className="idx-hc-welcome">WELCOME</span>
              <span className="idx-hc-to">to your</span>
              <span className="idx-hc-simplified">Simplified<br />Trading</span>
            </div>
            <div className="idx-hc-avatar">🧑‍💼</div>
          </div>
        </div>

        {/* Partner cards */}
        <div className="idx-hero-partners">
          <div className="idx-partner-col">
            <div className="idx-pc-header">
              <span className="idx-pc-label">Partnership with</span>
              <span className="idx-pc-name">Indiabulls Securities &amp; Dhan</span>
            </div>
            <div className="idx-pc-card idx-pc-card-row">
              <div className="idx-pc-logo-wrap">
                <img src="/partners/indiabulls.png" alt="Indiabulls Securities" className="idx-pc-img"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                <span style={{ display: 'none', fontWeight: 800, color: '#1a9e3f' }}>Indiabulls</span>
              </div>
              <div className="idx-pc-divider" />
              <div className="idx-pc-logo-wrap">
                <img src="/partners/dhan.png" alt="Dhan" className="idx-pc-img"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                <span style={{ display: 'none', fontWeight: 800, color: '#1a9e3f' }}>Dhan</span>
              </div>
            </div>
            <div className="idx-pc-btns idx-pc-btns-row">
              <a href="#" className="idx-pc-btn" target="_blank" rel="noreferrer">Create Indiabulls Account</a>
              <a href="https://join.dhan.co/?invite=WQUHQ61043" className="idx-pc-btn" target="_blank" rel="noreferrer">Create Dhan Account</a>
            </div>
          </div>

          <div className="idx-partner-col">
            <div className="idx-pc-header">
              <span className="idx-pc-label">Mutual Fund Partner</span>
            </div>
            <div className="idx-pc-card">
              <img src="/partners/kotak.png" alt="Kotak Securities" className="idx-pc-img"
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
              <span style={{ display: 'none', fontWeight: 800, color: '#e84c0a' }}>Kotak Securities</span>
            </div>
            <div className="idx-pc-btns">
              <a href="#" className="idx-pc-btn" target="_blank" rel="noreferrer">Create Kotak MF Account</a>
            </div>
          </div>

          <div className="idx-partner-col">
            <div className="idx-pc-header">
              <span className="idx-pc-label">Trading Partner</span>
              <span className="idx-pc-name">Alice Blue</span>
            </div>
            <div className="idx-pc-card">
              <img src="/partners/aliceblue.png" alt="Alice Blue" className="idx-pc-img"
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
              <span style={{ display: 'none', fontWeight: 800, color: '#1a56db' }}>Alice Blue</span>
            </div>
            <div className="idx-pc-btns">
              <a href="https://ekyc.aliceblueonline.com/?source=WSRT151" className="idx-pc-btn" target="_blank" rel="noreferrer">Create Alice Blue Account</a>
            </div>
          </div>
        </div>

        {/* Social icons */}
        <div className="idx-hero-social">
          <a href="https://x.com/simplifyoc" target="_blank" rel="noreferrer" className="idx-social-btn idx-social-x" title="X / Twitter">
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <a href="https://t.me/simplifyoc" target="_blank" rel="noreferrer" className="idx-social-btn idx-social-tg" title="Telegram">
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
          </a>
          <a href="https://instagram.com/simplifyoc" target="_blank" rel="noreferrer" className="idx-social-btn idx-social-ig" title="Instagram">
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
          </a>
          <a href="https://youtube.com/@simplifyoc" target="_blank" rel="noreferrer" className="idx-social-btn idx-social-yt" title="YouTube">
            <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
          </a>
        </div>

      </div>

      {/* ── Scrollable content below hero ── */}
      <div className="idx-content">

        {/* ── Market Timings Table ── */}
        {timings.rows.length > 0 && (
          <div className="idx-timing-section">
            <div className="idx-timing-header">
              <span className="idx-section-title" style={{ marginBottom: 0 }}>Market Timings</span>
              {timings.date && (
                <span className="idx-timing-date">{fmtDate(timings.date)}</span>
              )}
            </div>
            <div className="idx-timing-table-wrap">
              <table className="idx-timing-table idx-timing-pivot">
                <thead>
                  <tr>
                    <th className="idx-timing-label-col"></th>
                    {timings.rows.map((row, i) => (
                      <th key={i}>
                        <span className="idx-exch-tag">{row.exchange || '--'}</span>
                        <div className="idx-exch-segment">{SEGMENT_NAMES[row.exchange] || row.exchange}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="idx-timing-row-label">Start Time</td>
                    {timings.rows.map((row, i) => (
                      <td key={i}>{msToIST(row.start_time)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="idx-timing-row-label">End Time</td>
                    {timings.rows.map((row, i) => (
                      <td key={i}>{msToIST(row.end_time)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="idx-timing-row-label">Status</td>
                    {timings.rows.map((row, i) => {
                      const open = isExchangeOpen(row.start_time, row.end_time);
                      return (
                        <td key={i}>
                          <span className={`idx-status-badge ${open ? 'open' : 'closed'}`}>
                            <span className="idx-status-dot" />
                            {open ? 'OPEN' : 'CLOSED'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VIX + Global Indices Row ── */}
        {(vixData?.ltp > 0 || globalIndices.length > 0) && (
          <div className="idx-vix-global-row">
            {vixData && vixData.ltp > 0 && (
              <div className="idx-vix-gauge-card">
                <VixGauge vix={vixData} />
              </div>
            )}
            {globalIndices.length > 0 && (
              <div className="idx-global-wrap">
                <div className="idx-section-title" style={{ marginBottom: 10 }}>Global Markets</div>
                <div className="idx-global-grid">
                  {globalIndices.map(g => {
                    const up  = g.change >= 0;
                    const clr = up ? '#22c55e' : '#ef4444';
                    return (
                      <div key={g.key} className="idx-global-card">
                        <div className="idx-global-name">{g.short || g.name}</div>
                        <div className="idx-global-fullname">{g.name}</div>
                        <div className="idx-global-price">
                          {g.ltp > 0
                            ? g.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : '—'}
                        </div>
                        <div className="idx-global-change" style={{ color: clr }}>
                          {g.ltp > 0 ? (
                            <>
                              <span>{up ? '▲' : '▼'} {Math.abs(g.change).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="idx-global-pct"> {up ? '+' : ''}{g.pct_change.toFixed(2)}%</span>
                            </>
                          ) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Live Market Prices ── */}
        <div className="idx-section-title">Live Market Prices</div>
        <div className="idx-grid">
          {sorted.map(symbol => {
            const p        = prices[symbol];
            const loading  = !p;
            const err      = p?.error;
            const exchange = getExchange(symbol);
            const idx      = isIndex(symbol);

            return (
              <div
                key={symbol}
                className={`idx-card${idx ? ' idx-card-index' : ''}`}
                onClick={() => openChain(symbol)}
              >
                <div className="idx-card-top">
                  <span className={`idx-exchange-badge ${exchange === 'BSE' ? 'bse' : 'nse'}`}>
                    {exchange}
                  </span>
                  <div className="idx-card-pills">
                    {!marketOpen
                      ? <span className="idx-closed-pill">CLOSED</span>
                      : (!loading && !err && <span className="idx-live-pill">LIVE</span>)
                    }
                  </div>
                </div>

                <div className={`idx-card-name${idx ? ' idx-card-name-index' : ''}`}>
                  {symbol.replace(/_/g, ' ')}
                </div>

                <div className={`idx-card-price ${loading ? 'loading' : ''} ${err ? 'error' : ''}`}>
                  {loading ? '···' : err ? 'N/A' : fmt(p.spot)}
                </div>

                {!loading && !err && p.time && (
                  <div className="idx-card-time">as of {p.time} IST</div>
                )}

                <div className="idx-card-footer">
                  <button className="idx-cta-btn">
                    View Option Chain <span className="idx-cta-arrow">→</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── AI Stock Signals (admin/member only) ── */}
        {isAdminOrMember && aiSignals && (aiSignals.resistance?.length > 0 || aiSignals.support?.length > 0) && (
          <div className="idx-ai-section">
            <div className="idx-ai-header">
              <div className="idx-ai-header-left">
                <span className="idx-ai-icon">🧠</span>
                <span className="idx-section-title" style={{ marginBottom: 0 }}>AI Stock Signals</span>
                {aiSignals.date && <span className="idx-ai-date">{aiSignals.date}</span>}
              </div>
              <button
                className="idx-ai-viewall"
                onClick={() => {
                  window.history.pushState(null, '', '/ai-stock');
                  dispatch({ type: 'SET_AI_STOCK', payload: true });
                }}
              >
                View All →
              </button>
            </div>
            <div className="idx-ai-cols">
              <div className="idx-ai-col idx-ai-col-res">
                <div className="idx-ai-col-title">⬇ Resistance ({aiSignals.resistance?.length ?? 0})</div>
                <div className="idx-ai-pills">
                  {(aiSignals.resistance || []).slice(0, 8).map((s, i) => (
                    <div key={i} className="idx-ai-pill idx-ai-pill-res">
                      <span className="idx-ai-pill-sym">{s.symbol}</span>
                      <span className="idx-ai-pill-score">{s.trade_score ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="idx-ai-col idx-ai-col-sup">
                <div className="idx-ai-col-title">⬆ Support ({aiSignals.support?.length ?? 0})</div>
                <div className="idx-ai-pills">
                  {(aiSignals.support || []).slice(0, 8).map((s, i) => (
                    <div key={i} className="idx-ai-pill idx-ai-pill-sup">
                      <span className="idx-ai-pill-sym">{s.symbol}</span>
                      <span className="idx-ai-pill-score">{s.trade_score ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Market Holidays Accordion ── */}
        <div className="idx-holidays-section">
          <button
            className="idx-holidays-toggle"
            onClick={() => setHolidaysOpen(o => !o)}
          >
            <span className="idx-holidays-icon">📅</span>
            <span>Market Holidays</span>
            {upcomingHol.length > 0 && (
              <span className="idx-holidays-count">{upcomingHol.length} upcoming</span>
            )}
            <span className={`idx-holidays-chevron${holidaysOpen ? ' open' : ''}`}>▼</span>
          </button>

          {holidaysOpen && (
            <div className="idx-holidays-body">
              {upcomingHol.length === 0 ? (
                <div className="idx-holidays-empty">No upcoming holidays found.</div>
              ) : (
                <table className="idx-holidays-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Holiday</th>
                      <th>Closed Exchanges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingHol.map((h, i) => {
                      const date    = h.date || h.trading_date || '--';
                      const name    = h.description || h.holiday_name || h.name || '--';
                      const exch    = Array.isArray(h.closed_exchanges)
                        ? h.closed_exchanges.join(', ')
                        : (h.exchange || '--');
                      const isToday = date === todayStr;
                      return (
                        <tr key={i} className={isToday ? 'idx-holiday-today' : ''}>
                          <td>
                            {date}
                            {isToday && <span className="idx-today-badge">Today</span>}
                          </td>
                          <td>{name}</td>
                          <td>{exch}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>

      </div>{/* end idx-scroll-body */}
    </div>
  );
}
