import { useApp } from '../../context/AppContext';
import HistoricalControls from '../Historical/HistoricalControls';
import SymbolSelect from './SymbolSelect';
import ExpirySelect from './ExpirySelect';
import { useEffect, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useGiftNifty() {
  const [gift, setGift] = useState(null);
  useEffect(() => {
    let alive = true;
    async function fetch_() {
      try {
        const r = await fetch(`${API_BASE}/api/market/global-indices`, { credentials: 'include' });
        const j = await r.json();
        if (!alive) return;
        if (j.success && Array.isArray(j.data)) {
          const g = j.data.find(x => x.short === 'GIFT');
          if (g) setGift(g);
        }
      } catch (_) {}
    }
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return gift;
}

function useAiSignals() {
  const [signals, setSignals] = useState(null);
  useEffect(() => {
    let alive = true;
    async function fetch_() {
      try {
        const r = await fetch(`${API_BASE}/api/trainai/stock-signals/live`, { credentials: 'include' });
        const j = await r.json();
        if (!alive) return;
        if (j.success !== false) setSignals(j);
      } catch (_) {}
    }
    fetch_();
    const t = setInterval(fetch_, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return signals;
}

export default function Topbar() {
  const { state, dispatch } = useApp();
  const gift    = useGiftNifty();
  const signals = useAiSignals();

  const topRes = signals?.resistance?.[0] ?? null;
  const topSup = signals?.support?.[0] ?? null;

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    window.location.replace('/');
  };

  return (
    <div className="topbar" id="mainTopbar" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      {state.historicalMode ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <HistoricalControls />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            SYMBOL: <SymbolSelect />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            EXPIRY:&nbsp;
            {state.loading && state.currentExpiry === '--' ? (
              <span className="skeleton skeleton-topbar" />
            ) : (
              <ExpirySelect />
            )}
          </div>
          <div>DATA DATE: {state.loading && state.currentDataDate === '--'
            ? <span className="skeleton skeleton-topbar wide" />
            : <span>{state.currentDataDate}</span>}
          </div>
          <div>TIME: {state.loading && state.currentTime === '--'
            ? <span className="skeleton skeleton-topbar" />
            : <span>{state.currentTime}</span>}
          </div>
          <div>LOT: <span style={{ color: '#ff6f00', fontWeight: 700 }}>{state.lotSize}</span></div>

          {/* GIFT Nifty */}
          {gift && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
              <span style={{ color: '#888', fontWeight: 600 }}>GIFT:</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{gift.ltp?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
              <span style={{
                color: gift.change >= 0 ? '#26c65b' : '#ef5350',
                fontWeight: 700, fontSize: '12px',
              }}>
                {gift.change >= 0 ? '▲' : '▼'}{Math.abs(gift.pct_change).toFixed(2)}%
              </span>
            </div>
          )}

          {/* AI Signals: top resistance + support */}
          {(topRes || topSup) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', borderLeft: '1px solid #333', paddingLeft: '12px' }}>
              <span style={{ color: '#888', fontWeight: 600, fontSize: '11px' }}>AI:</span>
              {topRes && (
                <span title={`Resistance — score ${topRes.trade_score ?? ''}`} style={{
                  background: 'rgba(239,83,80,0.15)', border: '1px solid #ef5350',
                  borderRadius: '4px', padding: '1px 6px',
                  color: '#ef5350', fontWeight: 700, letterSpacing: '0.3px',
                }}>
                  ↓ {topRes.symbol}
                </span>
              )}
              {topSup && (
                <span title={`Support — score ${topSup.trade_score ?? ''}`} style={{
                  background: 'rgba(38,198,91,0.15)', border: '1px solid #26c65b',
                  borderRadius: '4px', padding: '1px 6px',
                  color: '#26c65b', fontWeight: 700, letterSpacing: '0.3px',
                }}>
                  ↑ {topSup.symbol}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <select
          value={state.splitScreenActive ? state.splitScreenMode : 'chain'}
          onChange={e => dispatch({ type: 'SET_SPLIT_MODE', payload: e.target.value })}
          style={{
            padding: '5px 8px', cursor: 'pointer',
            background: '#1976d2', color: '#fff',
            border: '1.5px solid #1976d2', borderRadius: '6px',
            fontSize: '13px', fontWeight: 700, outline: 'none',
          }}
        >
          <option value="chain">Chain</option>
          <option value="split">Chain+Chart</option>
          <option value="chart">Chart</option>
        </select>
        {state.user && (
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ff6f00' }}>
            Welcome! <span style={{ color: '#ff6f00' }}>{state.user?.name || '--'}</span>
          </span>
        )}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_UI_MENU' })}
          title="Settings & Toggles"
          style={{
            padding: '5px 14px', cursor: 'pointer',
            background: 'rgba(33,150,243,0.15)', color: '#2196f3',
            border: '1.5px solid #2196f3', borderRadius: '6px',
            fontSize: '13px', fontWeight: 700,
          }}
        >
          ⚙ UI
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_NOTIF_PANEL', payload: true })}
          title="Notifications"
          style={{
            position: 'relative', padding: '5px 12px', cursor: 'pointer',
            background: 'rgba(255,111,0,0.1)', color: '#ff6f00',
            border: '1.5px solid #ff6f00', borderRadius: '6px',
            fontSize: '16px', fontWeight: 700, lineHeight: 1,
          }}
        >
          🔔
          {state.notifUnread > 0 && (
            <span style={{
              position: 'absolute', top: '-6px', right: '-6px',
              background: '#e53935', color: '#fff',
              borderRadius: '10px', fontSize: '10px', fontWeight: 900,
              padding: '1px 5px', lineHeight: '14px', minWidth: '16px',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              {state.notifUnread > 99 ? '99+' : state.notifUnread}
            </span>
          )}
        </button>
        <button
          onClick={handleLogout}
          title="Logout"
          style={{
            padding: '5px 14px', cursor: 'pointer',
            background: 'rgba(255,111,0,0.15)', color: '#ff6f00',
            border: '1.5px solid #ff6f00', borderRadius: '6px',
            fontSize: '13px', fontWeight: 700,
          }}
        >
          ⏻ Logout
        </button>
      </div>
    </div>
  );
}
