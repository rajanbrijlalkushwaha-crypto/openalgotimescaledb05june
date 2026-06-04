import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import './AIStockPanel.css';

const api = (url) => fetch(url, { credentials: 'include' }).then(r => r.json());

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-IN') : '—';
}

function SignalCard({ s, type, onLive, onHistorical }) {
  const isSupport = type === 'sup';

  const score = s.trade_score ?? 0;
  const scoreColor = score >= 80 ? '#006600' : score >= 60 ? '#b45a00' : '#c00';
  const scoreLabel = score >= 80 ? 'Strong' : score >= 60 ? 'Moderate' : 'Weak';

  return (
    <div className={`ais-card ais-card-${type}`}>
      {/* Trade Score banner */}
      <div className="ais-score-banner" style={{ background: scoreColor }}>
        <div className="ais-score-left">
          <span className="ais-score-title">TRADE SCORE</span>
          <span className="ais-score-label">{scoreLabel}</span>
        </div>
        <div className="ais-score-ring">
          <span className="ais-score-num">{score}</span>
          <span className="ais-score-max">/100</span>
        </div>
        <div className="ais-score-breakdown">
          <span>Accuracy: {Math.round(Math.min(s.accuracy_pct ?? 0, 100) / 100 * 50)}pts</span>
          <span>History: {Math.round((isSupport ? (s.hist_rise_pct ?? 0) : (s.hist_fall_pct ?? 0)) / 100 * 30)}pts</span>
          <span>Reliability: {Math.round(Math.min(s.occurrences ?? 0, 10) / 10 * 20)}pts</span>
        </div>
      </div>

      {/* Top row */}
      <div className="ais-card-top">
        <span className="ais-card-symbol">{s.symbol}</span>
        <span className={`ais-card-badge ${type}`}>
          {isSupport ? '⬆ SUPPORT' : '⬇ RESISTANCE'}
        </span>
        {s.actual_direction && (
          <span className={`ais-card-actual ${s.actual_direction === 'UP' ? 'up' : 'down'}`}>
            {s.actual_direction === 'UP' ? '▲' : '▼'} Actual
            {s.actual_change != null && (
              <> {s.actual_change > 0 ? '+' : ''}{s.actual_change}</>
            )}
          </span>
        )}
      </div>

      {/* Expiry + Signal time */}
      <div className="ais-card-meta">
        <span className="ais-card-expiry">{s.expiry}</span>
        {s.trade_time && <span className="ais-card-time">⏱ {s.trade_time}</span>}
        {s.lead_time_min != null && <span className="ais-card-lead">{s.lead_time_min}m lead</span>}
      </div>

      {/* Pattern */}
      {s.pattern && (
        <div className="ais-card-pattern">{s.pattern.replace(/\+/g, ' + ')}</div>
      )}

      {/* Historical pattern match — rise%/fall% breakdown */}
      <div className={`ais-hist-bar ${type}`}>
        <div className="ais-hist-bar-inner">
          <div className="ais-hist-left">
            <span className="ais-hist-label">Pattern Match History</span>
            {s.hist_total > 0 && (
              <span className="ais-hist-days">{s.hist_total} days</span>
            )}
          </div>
          {s.hist_total > 0 ? (
            <div className="ais-hist-risefall">
              <span className="ais-hist-rise">▲ {s.hist_rise_pct ?? 0}% ({s.hist_rise_days ?? 0}d)</span>
              <span className="ais-hist-fall">▼ {s.hist_fall_pct ?? 0}% ({s.hist_fall_days ?? 0}d)</span>
            </div>
          ) : (
            <span className="ais-hist-na">No history yet</span>
          )}
        </div>
        {s.hist_total > 0 && (
          <div className="ais-hist-track">
            <div className="ais-hist-fill-rise" style={{ width: `${s.hist_rise_pct ?? 0}%` }} />
            <div className="ais-hist-fill-fall" style={{ width: `${s.hist_fall_pct ?? 0}%` }} />
          </div>
        )}
      </div>

      {/* ── TRADE GUIDE ── */}
      <div className={`ais-trade-guide ${type}`}>
        <div className="ais-tg-title">{isSupport ? '📈 HOW TO BUY' : '📉 HOW TO SELL'}</div>

        <div className="ais-tg-row">
          <span className="ais-tg-lbl">Spot at Signal</span>
          <span className="ais-tg-val">{fmt(s.trade_point)}</span>
        </div>

        <div className="ais-tg-divider" />

        <div className="ais-tg-row highlight">
          <span className="ais-tg-lbl">{isSupport ? '⬇ Reversal Zone' : '⬆ Reversal Zone'}</span>
          <span className={`ais-tg-val ais-tg-entry ${type}`}>{fmt(s.from_reversal)}</span>
        </div>

        <div className="ais-tg-hint">
          {isSupport
            ? '← wait for price to fall to reversal zone, then BUY'
            : '← wait for price to rise to reversal zone, then SELL'}
        </div>

        <div className="ais-tg-divider" />

        <div className="ais-tg-row">
          <span className="ais-tg-lbl">{isSupport ? 'CE Strike to BUY' : 'PE Strike to BUY'}</span>
          <span className={`ais-tg-val strike-${type}`}>{fmt(s.from_strike)}</span>
        </div>

        <div className="ais-tg-actions">
          {isSupport ? (
            <>
              <span className="ais-action-pill buy-ce">BUY {fmt(s.from_strike)} CE</span>
              <span className="ais-action-or">or</span>
              <span className="ais-action-pill sell-pe">SELL {fmt(s.from_strike)} PE</span>
            </>
          ) : (
            <>
              <span className="ais-action-pill buy-pe">BUY {fmt(s.from_strike)} PE</span>
              <span className="ais-action-or">or</span>
              <span className="ais-action-pill sell-ce">SELL {fmt(s.from_strike)} CE</span>
            </>
          )}
        </div>
      </div>

      {/* All patterns */}
      {s.all_patterns?.length > 1 && (
        <div className="ais-card-tags">
          {s.all_patterns.map((pat, i) => (
            <span key={i} className="ais-tag">{pat.replace(/\+/g, ' + ')}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="ais-card-actions">
        <button className="ais-btn ais-btn-live" onClick={() => onLive(s)}>🔴 Live</button>
        <button className="ais-btn ais-btn-hist" onClick={() => onHistorical(s)}>📅 Historical</button>
      </div>
    </div>
  );
}

export default function AIStockPanel() {
  const { dispatch } = useApp();

  const [dates,        setDates]        = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [dateIdx,      setDateIdx]      = useState(0);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [runStatus,    setRunStatus]    = useState(null);

  const prevDatesRef    = useRef([]);
  const prevDateRef     = useRef('');
  const selectedDateRef = useRef('');

  // Keep ref in sync so intervals can read the latest value
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ── Fetch backend analysis status ──────────────────────────────────
  const loadStatus = useCallback(() => {
    api('/api/trainai/status')
      .then(d => setRunStatus(d.status || null))
      .catch(() => {});
  }, []);

  // ── Fetch available dates ───────────────────────────────────────────
  const loadDates = useCallback(() => {
    api('/api/trainai/stock-dates')
      .then(d => {
        const arr = d.dates || [];
        setDates(arr);
        // Auto-select newest date if we have new dates or nothing selected yet
        if (arr.length > 0) {
          const wasEmpty = prevDatesRef.current.length === 0;
          const newDate  = arr[0] !== prevDatesRef.current[0];
          if (wasEmpty || newDate || !selectedDateRef.current) {
            setSelectedDate(arr[0]);
            setDateIdx(0);
          }
        }
        prevDatesRef.current = arr;
      })
      .catch(() => {});
  }, []);

  // ── Fetch signals for a date ────────────────────────────────────────
  const loadSignals = useCallback((date) => {
    if (!date) return;
    setLoading(true);
    api(`/api/trainai/stock-signals/${date}`)
      .then(d => {
        setData(d.success ? d : null);
        setLastUpdated(new Date());
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // ── On mount: load everything and start polling ─────────────────────
  useEffect(() => {
    loadStatus();
    loadDates();

    const statusInterval = setInterval(loadStatus, 10_000);  // status every 10s
    const datesInterval  = setInterval(loadDates,  60_000);  // dates every 60s

    return () => {
      clearInterval(statusInterval);
      clearInterval(datesInterval);
    };
  }, [loadStatus, loadDates]);

  // ── Auto-reload signals when analysis finishes ──────────────────────
  // When runStatus transitions from running→idle, refresh dates + signals
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && runStatus && !runStatus.running) {
      // Analysis just finished — reload dates and current signals
      loadDates();
      if (selectedDateRef.current) loadSignals(selectedDateRef.current);
    }
    wasRunning.current = runStatus?.running || false;
  }, [runStatus, loadDates, loadSignals]);

  // ── Reload signals when selected date changes ───────────────────────
  useEffect(() => {
    if (!selectedDate) return;
    loadSignals(selectedDate);

    // Poll signals every 60s for the current date
    const id = setInterval(() => loadSignals(selectedDateRef.current), 60_000);
    return () => clearInterval(id);
  }, [selectedDate, loadSignals]);

  const goDate = (idx) => {
    if (idx < 0 || idx >= dates.length) return;
    setDateIdx(idx);
    setSelectedDate(dates[idx]);
  };

  const goLive = (s) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: s.symbol.replace(/ /g, '_') });
    dispatch({ type: 'SET_HISTORICAL_MODE', payload: false });
    dispatch({ type: 'SET_AI_STOCK',        payload: false });
    dispatch({ type: 'SET_INDEX_PAGE',      payload: false });
  };

  const goHistorical = (s) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL',  payload: s.symbol.replace(/ /g, '_') });
    dispatch({ type: 'SET_EXPIRY',          payload: s.expiry });
    dispatch({ type: 'SET_DATA_DATE',       payload: s.date });
    dispatch({ type: 'SET_HISTORICAL_MODE', payload: true });
    dispatch({ type: 'SET_AI_STOCK',        payload: false });
    dispatch({ type: 'SET_INDEX_PAGE',      payload: false });
  };

  const resistance = data?.resistance || [];
  const support    = data?.support    || [];
  const isRunning  = runStatus?.running === true;

  return (
    <div className="ais-panel">
      {/* Header */}
      <div className="ais-topbar">
        <div className="ais-topbar-left">
          <span className="ais-topbar-icon">🧠</span>
          <span className="ais-topbar-title">AI STOCK SIGNALS</span>
        </div>

        <div className="ais-topbar-center">
          <button
            className="ais-nav-btn"
            onClick={() => goDate(dateIdx + 1)}
            disabled={dateIdx >= dates.length - 1}
            title="Previous date"
          >‹</button>

          <label className="ais-date-label">Date:</label>
          <select
            className="ais-date-select"
            value={selectedDate}
            onChange={e => {
              const idx = dates.indexOf(e.target.value);
              setDateIdx(idx);
              setSelectedDate(e.target.value);
            }}
          >
            {dates.length === 0 && <option value="">No data yet</option>}
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <button
            className="ais-nav-btn"
            onClick={() => goDate(dateIdx - 1)}
            disabled={dateIdx <= 0}
            title="Next date"
          >›</button>

          {lastUpdated && (
            <span className="ais-updated">
              <span className="ais-live-dot" />
              {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        <div className="ais-topbar-right">
          {/* Backend status pill */}
          {runStatus && (
            <span className={`ais-run-pill ${isRunning ? 'running' : 'idle'}`}>
              <span className={`ais-dot ${isRunning ? 'green pulsing' : 'grey'}`} />
              {isRunning
                ? 'Analyzing…'
                : runStatus.last_run
                  ? `Last: ${new Date(runStatus.last_run).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                  : 'Auto AI'}
            </span>
          )}
        </div>
      </div>

      {/* Analyzing banner */}
      {isRunning && (
        <div className="ais-analyzing-banner">
          <div className="ais-spinner" />
          AI is analyzing option chain data… signals will appear automatically when done.
        </div>
      )}

      {/* Body */}
      <div className="ais-body">
        {loading && (
          <div className="ais-state">
            <div className="ais-spinner" />
            Loading signals…
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary bar */}
            <div className="ais-summary">
              <span>Date: <b>{selectedDate}</b></span>
              <span className="ais-sum-res">⬇ Resistance: <b>{resistance.length}</b></span>
              <span className="ais-sum-sup">⬆ Support: <b>{support.length}</b></span>
            </div>

            {/* Two columns */}
            <div className="ais-columns">
              {/* Resistance */}
              <div className="ais-col">
                <div className="ais-col-header res">⬇ Resistance Signals</div>
                {resistance.length === 0
                  ? <div className="ais-col-empty">No resistance signals for {selectedDate}</div>
                  : <div className="ais-cards-grid">
                      {resistance.map((s, i) => (
                        <SignalCard key={i} s={s} type="res" onLive={goLive} onHistorical={goHistorical} />
                      ))}
                    </div>
                }
              </div>

              {/* Support */}
              <div className="ais-col">
                <div className="ais-col-header sup">⬆ Support Signals</div>
                {support.length === 0
                  ? <div className="ais-col-empty">No support signals for {selectedDate}</div>
                  : <div className="ais-cards-grid">
                      {support.map((s, i) => (
                        <SignalCard key={i} s={s} type="sup" onLive={goLive} onHistorical={goHistorical} />
                      ))}
                    </div>
                }
              </div>
            </div>

            {(!resistance.length && !support.length) && (
              <div className="ais-state">
                No AI signals for {selectedDate} yet.
                {isRunning && <><br /><small>Analysis is running — signals will appear shortly.</small></>}
              </div>
            )}
          </>
        )}

        {!loading && !data && selectedDate && (
          <div className="ais-state">
            {isRunning
              ? <><div className="ais-spinner" /><br />AI analysis is running for {selectedDate}…<br /><small>Signals will appear automatically when done.</small></>
              : `No data for ${selectedDate}`
            }
          </div>
        )}

        {!loading && dates.length === 0 && (
          <div className="ais-state">
            {isRunning ? (
              <>
                <div className="ais-spinner" />
                <br />AI is analyzing option chain data…
                <br /><small>Signals will appear here automatically when analysis completes.</small>
              </>
            ) : (
              <>
                No analyzed dates found.
                <br /><small>The AI auto-analyzes data every 15 min during market hours and after close (15:35). Signals will appear here automatically.</small>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
