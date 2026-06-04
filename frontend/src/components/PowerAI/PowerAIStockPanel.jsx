import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './PowerAIStockPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function StockCard({ s, type, onLive, onHistorical }) {
  const fmt   = (n) => n != null ? Number(n).toLocaleString('en-IN') : '--';
  const isSupport = type === 'sup';
  const strike    = isSupport ? s.support    : s.resistance;
  const reversal  = isSupport ? s.supportReversal : s.resistanceReversal;

  return (
    <div className={`pai-card pai-card-${type}`}>

      {/* Symbol + Score */}
      <div className="pai-card-top">
        <span className="pai-card-symbol">{s.symbol}</span>
        <span className={`pai-card-badge ${type}`}>
          {isSupport ? '⬆ SUPPORT' : '⬇ RESISTANCE'}
        </span>
        <span className="pai-card-score">{s.score ?? '--'}</span>
      </div>

      {/* Expiry + Signal time */}
      <div className="pai-card-meta">
        <span className="pai-card-expiry">Expiry: {s.expiry}</span>
        {s.firstTime && <span className="pai-card-time">⏱ Signal: {s.firstTime}</span>}
      </div>

      {/* Spot */}
      <div className="pai-card-spot">
        <span className="pai-card-spot-label">Spot</span>
        <span className="pai-card-spot-val">{fmt(s.spot)}</span>
      </div>

      {/* Strike + Reversal */}
      <div className="pai-card-data">
        <div className="pai-card-datarow">
          <span className="pai-card-datalabel">
            {isSupport ? 'Support Strike' : 'Resistance Strike'}
          </span>
          <span className={`pai-card-dataval strike-${type}`}>{fmt(strike)}</span>
        </div>
        <div className="pai-card-datarow">
          <span className="pai-card-datalabel">Reversal Value</span>
          <span className="pai-card-dataval rev-val">{fmt(reversal)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="pai-card-actions">
        <button className="pai-btn pai-btn-live" onClick={() => onLive(s)}>
          🔴 Live
        </button>
        <button className="pai-btn pai-btn-hist" onClick={() => onHistorical(s)}>
          📅 Historical
        </button>
      </div>

    </div>
  );
}

export default function PowerAIStockPanel() {
  const { state, dispatch } = useApp();
  const [dates, setDates]               = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [lastUpdated, setLastUpdated]   = useState(null);

  const handleLogout = async () => {
    try { await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (_) {}
    window.location.replace('/');
  };

  // Navigate to LIVE option chain for this stock
  const goLive = (s) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: s.symbol });
    dispatch({ type: 'SET_HISTORICAL_MODE', payload: false });
    dispatch({ type: 'SET_AI_PAGE', payload: { active: false } });
    dispatch({ type: 'SET_INDEX_PAGE', payload: false });
  };

  // Navigate to HISTORICAL option chain at the signal date/time
  const goHistorical = (s) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: s.symbol });
    dispatch({ type: 'SET_EXPIRY',         payload: s.expiry });
    dispatch({ type: 'SET_DATA_DATE',      payload: selectedDate });
    dispatch({ type: 'SET_HISTORICAL_MODE', payload: true });
    dispatch({ type: 'SET_AI_PAGE',        payload: { active: false } });
    dispatch({ type: 'SET_INDEX_PAGE',     payload: false });
  };

  // Load available dates — poll every 30s so newly generated dates appear automatically
  useEffect(() => {
    const fetchDates = () => {
      fetch(`${API_BASE}/api/power-ai/dates`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          const arr = Array.isArray(d) ? d : [];
          setDates(arr);
          // Auto-select newest date only if nothing is selected yet
          setSelectedDate(prev => prev || (arr.length > 0 ? arr[0] : ''));
        })
        .catch(() => {});
    };
    fetchDates();
    const id = setInterval(fetchDates, 30000);
    return () => clearInterval(id);
  }, []);

  // Fetch results for selected date, poll every 30s
  useEffect(() => {
    if (!selectedDate) return;
    const load = () => {
      setLoading(true);
      fetch(`/api/power-ai/results/${selectedDate}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          setData(d?.error ? null : d);
          setLastUpdated(new Date());
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [selectedDate]);

  const resistance = data?.power_resistance || [];
  const support    = data?.power_support    || [];

  return (
    <div className="pai-panel">

      {/* Top header */}
      <div className="pai-topbar">
        <div className="pai-topbar-left">
          <span className="pai-topbar-icon">⚡</span>
          <span className="pai-topbar-title">POWER AI STOCK</span>
        </div>
        <div className="pai-topbar-center">
          <label className="pai-date-label">Date:</label>
          <select
            className="pai-date-select"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          >
            {dates.length === 0 && <option value="">No data yet</option>}
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {lastUpdated && (
            <span className="pai-updated">
              <span className="pai-live-dot" />
              {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="pai-topbar-right">
          {state.user && (
            <span className="pai-username">
              Welcome! <b>{state.user?.name || state.user?.username || '--'}</b>
            </span>
          )}
          <button className="pai-logout-btn" onClick={handleLogout}>⏻ Logout</button>
        </div>
      </div>

      {/* Body */}
      <div className="pai-body">
        {loading && !data && (
          <div className="pai-state">
            <div className="pai-spinner" />
            Scanning option chain data...
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary */}
            <div className="pai-summary">
              <span>Scanned: <b>{data.total_scanned ?? '--'}</b></span>
              <span className="pai-sum-res">⬇ Resistance: <b>{resistance.length}</b></span>
              <span className="pai-sum-sup">⬆ Support: <b>{support.length}</b></span>
              {data.both_criteria?.length > 0 && (
                <span className="pai-sum-both">⚡ Both: <b>{data.both_criteria.length}</b></span>
              )}
            </div>

            {/* Two columns */}
            <div className="pai-columns">
              {/* Left — Resistance */}
              <div className="pai-col">
                <div className="pai-col-header res">⬇ Resistance</div>
                {resistance.length === 0
                  ? <div className="pai-col-empty">No resistance signals for this date</div>
                  : <div className="pai-cards-grid">
                      {resistance.map((s, i) => (
                        <StockCard key={i} s={s} type="res" onLive={goLive} onHistorical={goHistorical} />
                      ))}
                    </div>
                }
              </div>

              {/* Right — Support */}
              <div className="pai-col">
                <div className="pai-col-header sup">⬆ Support</div>
                {support.length === 0
                  ? <div className="pai-col-empty">No support signals for this date</div>
                  : <div className="pai-cards-grid">
                      {support.map((s, i) => (
                        <StockCard key={i} s={s} type="sup" onLive={goLive} onHistorical={goHistorical} />
                      ))}
                    </div>
                }
              </div>
            </div>

            {(!resistance.length && !support.length) && (
              <div className="pai-state">No Power AI signals for {selectedDate} yet.<br /><small>Signals appear when strong OI criteria are met during market hours.</small></div>
            )}
          </>
        )}

        {!loading && !data && selectedDate && (
          <div className="pai-state">No data for {selectedDate}</div>
        )}
      </div>
    </div>
  );
}
