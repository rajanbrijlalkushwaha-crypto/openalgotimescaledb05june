import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import './AITrainPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const api = (url) => fetch(`${API_BASE}${url}`, { credentials: 'include' }).then(r => r.json());

function DirectionBadge({ dir }) {
  if (!dir) return null;
  const cls = dir === 'UP' ? 'ait-badge-up' : dir === 'DOWN' ? 'ait-badge-down' : 'ait-badge-flat';
  const icon = dir === 'UP' ? '▲' : dir === 'DOWN' ? '▼' : '↔';
  return <span className={`ait-badge ${cls}`}>{icon} {dir}</span>;
}

function AccBar({ pct }) {
  const color = pct >= 80 ? '#4caf50' : pct >= 65 ? '#ff9800' : '#e53935';
  return (
    <div className="ait-acc-bar-wrap" title={`${pct}% accuracy`}>
      <div className="ait-acc-bar-bg">
        <div className="ait-acc-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ait-acc-label" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ── Overview card ─────────────────────────────────────────────────────────────
function InsightsPanel({ insights, symbol }) {
  if (!insights) return <div className="ait-empty">No insights yet. Run AI Train first.</div>;

  return (
    <div className="ait-insights">
      <div className="ait-insights-stats">
        <div className="ait-stat-card">
          <div className="ait-stat-val">{insights.total_days}</div>
          <div className="ait-stat-label">Days Analyzed</div>
        </div>
        <div className="ait-stat-card">
          <div className="ait-stat-val">{insights.avg_lead_time_min} min</div>
          <div className="ait-stat-label">Avg Lead Time</div>
        </div>
        <div className="ait-stat-card">
          <div className="ait-stat-val">{insights.avg_accuracy_pct}%</div>
          <div className="ait-stat-label">Avg Accuracy</div>
        </div>
      </div>

      <div className="ait-section-title">Top Patterns (across all days)</div>
      <div className="ait-pattern-list">
        {insights.top_patterns.map((p, i) => (
          <div key={i} className="ait-pattern-row">
            <div className="ait-pattern-rank">#{i + 1}</div>
            <div className="ait-pattern-name">{p.pattern.replace(/\+/g, ' + ')}</div>
            <DirectionBadge dir={p.direction} />
            <AccBar pct={p.avg_accuracy} />
            <div className="ait-pattern-days">{p.days}d</div>
          </div>
        ))}
        {!insights.top_patterns.length && <div className="ait-empty-sm">Not enough data yet</div>}
      </div>

      <div className="ait-section-title">Recent Days</div>
      <div className="ait-recent-list">
        {insights.recent_days.map((r, i) => (
          <div key={i} className="ait-recent-card">
            <div className="ait-recent-header">
              <span className="ait-recent-date">{r.date}</span>
              <DirectionBadge dir={r.spot_range?.direction} />
              <span className="ait-recent-move">
                {r.spot_range?.change > 0 ? '+' : ''}{r.spot_range?.change} pts
              </span>
            </div>
            <div className="ait-recent-body">{r.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────
function DayDetail({ result }) {
  if (!result) return null;

  return (
    <div className="ait-day-detail">
      {/* Spot Range */}
      <div className="ait-detail-row">
        <div className="ait-spot-card">
          <div className="ait-spot-row">
            <span>Open</span><strong>{result.spot_range?.open}</strong>
            <span>High</span><strong style={{ color: '#4caf50' }}>{result.spot_range?.high}</strong>
            <span>Low</span><strong style={{ color: '#e53935' }}>{result.spot_range?.low}</strong>
            <span>Close</span><strong>{result.spot_range?.close}</strong>
            <span>Chg</span>
            <strong style={{ color: result.spot_range?.change >= 0 ? '#4caf50' : '#e53935' }}>
              {result.spot_range?.change > 0 ? '+' : ''}{result.spot_range?.change}
            </strong>
          </div>
          <div className="ait-pcr-row">
            <span>PCR Open: <b>{result.pcr_stats?.open}</b></span>
            <span>PCR Avg: <b>{result.pcr_stats?.avg}</b></span>
            <span>PCR Close: <b>{result.pcr_stats?.close}</b></span>
            {result.mctr?.support && <span>MCTR S: <b>{result.mctr.support}</b></span>}
            {result.mctr?.resistance && <span>MCTR R: <b>{result.mctr.resistance}</b></span>}
          </div>
        </div>
      </div>

      {/* Why it moved */}
      <div className="ait-section-title">Why Market Moved</div>
      <div className="ait-why-list">
        {(result.why_market_moved || []).map((r, i) => (
          <div key={i} className="ait-why-card">
            <span className="ait-why-icon">{r.icon}</span>
            <div>
              <div className="ait-why-label">{r.label}</div>
              <div className="ait-why-detail">{r.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Key Patterns */}
      <div className="ait-section-title">Key Patterns This Day</div>
      <div className="ait-pattern-list">
        {(result.key_patterns || []).map((p, i) => (
          <div key={i} className="ait-pattern-row">
            <div className="ait-pattern-rank">#{i + 1}</div>
            <div className="ait-pattern-name">{p.pattern.replace(/\+/g, ' + ')}</div>
            <DirectionBadge dir={p.direction} />
            <AccBar pct={p.accuracy_pct} />
            <div className="ait-pattern-lead">{p.lead_time_min}min lead</div>
            <div className="ait-pattern-occ">{p.occurrences}x</div>
          </div>
        ))}
        {!result.key_patterns?.length && <div className="ait-empty-sm">No strong patterns detected</div>}
      </div>

      {/* Predictive signals */}
      <div className="ait-section-title">Predictive Signals Timeline</div>
      <div className="ait-signals-table-wrap">
        <table className="ait-signals-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Signals</th>
              <th>Direction</th>
              <th>Lead</th>
              <th>Spot</th>
              <th>Actual Move</th>
              <th>From Strike</th>
              <th>From Reversal</th>
              <th>PCR</th>
              <th>ATM</th>
            </tr>
          </thead>
          <tbody>
            {(result.predictive_signals || []).map((s, i) => (
              <tr key={i}>
                <td className="ait-sig-time">{s.time}</td>
                <td className="ait-sig-sigs">{(s.signals || []).map(sig => (
                  <span key={sig} className="ait-sig-tag">{sig}</span>
                ))}</td>
                <td><DirectionBadge dir={s.direction} /></td>
                <td className="ait-sig-lead">{s.minutes_before} min</td>
                <td>{s.spot_at_signal}</td>
                <td className={`ait-sig-move ${s.direction === 'UP' ? 'up' : 'down'}`}>{s.actual_move}</td>
                <td className="ait-sig-from-strike">{s.from_strike ?? '—'}</td>
                <td className={`ait-sig-from-rev ${s.direction === 'UP' ? 'up' : 'down'}`}>
                  {s.from_reversal ?? '—'}
                </td>
                <td>{s.pcr}</td>
                <td>{s.atm_strike}</td>
              </tr>
            ))}
            {!result.predictive_signals?.length && (
              <tr><td colSpan={10} className="ait-empty-sm">No predictive signals found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Session Window Analysis */}
      {result.time_window_analysis?.length > 0 && (
        <>
          <div className="ait-section-title">⏱ How Early? — Session Window Analysis</div>
          <div className="ait-window-list">
            {result.time_window_analysis.map((win, wi) => (
              <div key={wi} className="ait-window-card">
                <div className="ait-window-header">
                  <span className="ait-window-icon">{win.icon}</span>
                  <span className="ait-window-label">{win.label}</span>
                  <span className="ait-window-range">{win.from} – {win.to}</span>
                  {win.avg_lead_min !== null && (
                    <span className="ait-window-lead">~{win.avg_lead_min} min early</span>
                  )}
                  <span className="ait-window-counts">
                    {win.up_moves > 0 && <span className="ait-wc-up">▲ {win.up_moves}</span>}
                    {win.down_moves > 0 && <span className="ait-wc-down">▼ {win.down_moves}</span>}
                  </span>
                </div>
                <div className="ait-move-list">
                  {win.moves.map((mv, mi) => (
                    <div key={mi} className="ait-move-row">
                      <span className={`ait-move-dir ${mv.direction === 'UP' ? 'up' : 'down'}`}>
                        {mv.direction === 'UP' ? '▲' : '▼'}
                      </span>
                      <span className="ait-move-pts">
                        {mv.direction === 'UP' ? '+' : ''}{mv.pts} pts
                      </span>
                      <span className="ait-move-at">moved at {mv.move_time}</span>
                      {mv.signal_time ? (
                        <>
                          <span className="ait-move-arrow">→</span>
                          <span className="ait-move-sig">
                            signal at {mv.signal_time}
                          </span>
                          <span className="ait-move-lead-badge">
                            {mv.lead_min} min before
                          </span>
                          {mv.from_reversal != null && (
                            <span className={`ait-move-reversal ${mv.direction === 'UP' ? 'up' : 'down'}`}>
                              {mv.direction === 'UP' ? '⬆ from' : '⬇ from'} {mv.from_strike} → rev {mv.from_reversal}
                            </span>
                          )}
                          {mv.signals?.length > 0 && (
                            <span className="ait-move-sigs">
                              {mv.signals.map(s => (
                                <span key={s} className="ait-sig-tag">{s}</span>
                              ))}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="ait-move-nosig">no early signal found</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Summary */}
      <div className="ait-summary-box">
        <div className="ait-summary-label">AI Summary</div>
        <div className="ait-summary-text">{result.summary}</div>
      </div>
    </div>
  );
}

// ── Pattern Match panel ────────────────────────────────────────────────────────
function PatternMatch({ symbol, selDate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!selDate) return;
    setLoading(true); setError(null); setData(null);
    api(`/api/trainai/pattern-match/${symbol}/${selDate.expiry}/${selDate.date}`)
      .then(r => {
        if (r.success) setData(r);
        else setError(r.error || 'Failed to load pattern match data');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [symbol, selDate]);

  if (!selDate) return <div className="ait-empty">Select a date from the sidebar first</div>;
  if (loading)  return <div className="ait-loading">Loading pattern matches…</div>;
  if (error)    return <div className="ait-empty" style={{ color: '#e53935' }}>{error}</div>;
  if (!data)    return null;

  const { target_patterns = [], matches = [], stats = {} } = data;

  return (
    <div className="ait-pattern-match">
      <div className="ait-section-title" style={{ marginBottom: 12 }}>
        Patterns on {selDate.date}
      </div>

      {/* Target pattern accuracy cards */}
      <div className="ait-pm-cards">
        {target_patterns.length === 0 && (
          <div className="ait-empty-sm">No key patterns found for this date</div>
        )}
        {target_patterns.map((p, i) => {
          const s = stats[p.pattern] || {};
          const acc = s.accuracy ?? p.accuracy_pct ?? 0;
          const color = acc >= 80 ? '#4caf50' : acc >= 65 ? '#ff9800' : '#e53935';
          return (
            <div key={i} className="ait-pm-card">
              <div className="ait-pm-card-name">{(p.pattern || '').replace(/\+/g, ' + ')}</div>
              <div className="ait-pm-card-row">
                <DirectionBadge dir={p.direction} />
                <span className="ait-pm-card-lead">{p.lead_time_min}min lead</span>
              </div>
              <div className="ait-pm-card-stats">
                <span style={{ color, fontWeight: 700 }}>{acc}% accuracy</span>
                {s.total != null && (
                  <span className="ait-pm-card-hist">
                    {s.correct}/{s.total} historical days
                  </span>
                )}
              </div>
              <AccBar pct={acc} />
            </div>
          );
        })}
      </div>

      {/* Historical matches table */}
      <div className="ait-section-title" style={{ marginTop: 20, marginBottom: 8 }}>
        Historical Days With Same Patterns
      </div>
      {matches.length === 0 ? (
        <div className="ait-empty-sm">No historical matches found yet</div>
      ) : (
        <div className="ait-pm-table-wrap">
          <table className="ait-pm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pattern</th>
                <th>Predicted</th>
                <th>Actual</th>
                <th>Match</th>
                <th>Change</th>
                <th>Lead</th>
                <th>Open</th>
                <th>Close</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={i} className={m.match ? 'ait-pm-row-ok' : 'ait-pm-row-fail'}>
                  <td className="ait-pm-date">{m.date}</td>
                  <td className="ait-pm-pat">{(m.pattern || '').replace(/\+/g, ' + ')}</td>
                  <td><DirectionBadge dir={m.predicted_direction} /></td>
                  <td><DirectionBadge dir={m.actual_direction} /></td>
                  <td className={`ait-pm-match ${m.match ? 'ok' : 'fail'}`}>
                    {m.match ? '✓' : '✗'}
                  </td>
                  <td className={`ait-pm-chg ${(m.actual_change || 0) >= 0 ? 'up' : 'down'}`}>
                    {m.actual_change != null
                      ? `${m.actual_change > 0 ? '+' : ''}${m.actual_change}`
                      : '—'}
                  </td>
                  <td className="ait-pm-lead">{m.lead_time_min != null ? `${m.lead_time_min}m` : '—'}</td>
                  <td>{m.spot_open ?? '—'}</td>
                  <td>{m.spot_close ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function AITrainPanel() {
  useBodyScroll();
  const { state }     = useApp();
  const userRole      = state.user?.role || 'user';
  const isAdmin       = userRole === 'admin';

  const [symbol,     setSymbol]     = useState('');
  const [dates,      setDates]      = useState([]);
  const [selDate,    setSelDate]    = useState(null);
  const [dayResult,  setDayResult]  = useState(null);
  const [insights,   setInsights]   = useState(null);
  const [runStatus,  setRunStatus]  = useState(null);
  const [view,       setView]       = useState('insights'); // 'insights' | 'day' | 'pattern'
  const [loading,    setLoading]    = useState(false);
  const [running,    setRunning]    = useState(false);
  const [msg,        setMsg]        = useState('');

  const symbols = state.symbols || [];

  // Init symbol
  useEffect(() => {
    if (!symbol && symbols.length > 0) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  // Fetch dates + insights when symbol changes
  const loadSymbol = useCallback(async (sym) => {
    if (!sym) return;
    setLoading(true);
    setDates([]); setInsights(null); setSelDate(null); setDayResult(null);
    try {
      const [dRes, iRes] = await Promise.all([
        api(`/api/trainai/dates/${sym}`),
        api(`/api/trainai/insights/${sym}`),
      ]);
      setDates(dRes.dates || []);
      setInsights(iRes.success ? iRes.insights : null);
    } catch(e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadSymbol(symbol); }, [symbol, loadSymbol]);

  // Fetch status periodically
  const loadStatus = useCallback(async () => {
    try {
      const d = await api('/api/trainai/status');
      setRunStatus(d.status);
      if (!d.status?.running) setRunning(false);
    } catch(e) {}
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 5000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // Load day result when date selected
  const loadDay = async (expiry, date) => {
    setSelDate({ expiry, date });
    setView(v => v === 'pattern' ? 'pattern' : 'day');
    setDayResult(null);
    const d = await api(`/api/trainai/result/${symbol}/${expiry}/${date}`);
    setDayResult(d.success ? d.result : null);
  };

  // Run analysis
  const runAnalysis = async (force = false) => {
    setRunning(true);
    setMsg('');
    try {
      const d = await fetch(`${API_BASE}/api/trainai/run`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      }).then(r => r.json());
      setMsg(d.message || (d.success ? 'Started!' : 'Failed'));
      if (d.success) {
        // Poll until done
        const poll = setInterval(async () => {
          await loadStatus();
          const s = await api('/api/trainai/status');
          if (!s.status?.running) {
            clearInterval(poll);
            setRunning(false);
            await loadSymbol(symbol);
            setMsg(`Done! ${s.status?.last_result?.analyzed || 0} days analyzed.`);
          }
        }, 3000);
      }
    } catch(e) { setMsg('Error'); setRunning(false); }
    setTimeout(() => setMsg(''), 8000);
  };

  return (
    <div className="ait-page">
      {/* Header */}
      <div className="ait-header">
        <div className="ait-header-left">
          <span className="ait-header-icon">🧠</span>
          <div>
            <div className="ait-header-title">AI Train — Pattern Analysis</div>
            <div className="ait-header-sub">Learns why market goes up/down from your option chain data</div>
          </div>
        </div>
        <div className="ait-header-right">
          {runStatus && (
            <div className="ait-run-status">
              <span className={`ait-dot ${runStatus.running ? 'green pulsing' : 'grey'}`} />
              {runStatus.running ? 'Analyzing…' : runStatus.last_run
                ? `Last run: ${new Date(runStatus.last_run).toLocaleString('en-IN', { hour12: false, dateStyle: 'short', timeStyle: 'short' })}`
                : 'Never run'}
            </div>
          )}
          {isAdmin && (
            <button
              className="ait-btn ait-btn-primary"
              onClick={() => runAnalysis(false)}
              disabled={running}
            >
              {running ? '⟳ Analyzing…' : '▶ Run AI Analysis'}
            </button>
          )}
          {isAdmin && (
            <button
              className="ait-btn ait-btn-outline"
              onClick={() => runAnalysis(true)}
              disabled={running}
              title="Re-analyze all dates (force)"
            >
              ↺ Force All
            </button>
          )}
        </div>
      </div>

      {msg && <div className="ait-msg">{msg}</div>}

      {/* Controls */}
      <div className="ait-controls">
        <select
          className="ait-select"
          value={symbol}
          onChange={e => { setSymbol(e.target.value); setView('insights'); }}
        >
          {symbols.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>

        <div className="ait-view-tabs">
          <button
            className={`ait-view-btn ${view === 'insights' ? 'active' : ''}`}
            onClick={() => setView('insights')}
          >Insights</button>
          <button
            className={`ait-view-btn ${view === 'day' ? 'active' : ''}`}
            onClick={() => setView('day')}
            disabled={!selDate}
          >Day Detail</button>
          <button
            className={`ait-view-btn ${view === 'pattern' ? 'active' : ''}`}
            onClick={() => setView('pattern')}
            disabled={!selDate}
          >Pattern Match</button>
        </div>
      </div>

      {/* Main body */}
      <div className="ait-body">
        {/* Sidebar: date list */}
        <div className="ait-sidebar">
          <div className="ait-sidebar-title">Analyzed Days</div>
          {loading && <div className="ait-loading">Loading…</div>}
          {!loading && !dates.length && (
            <div className="ait-empty-sm">No analyzed dates found.<br />Run AI Analysis first.</div>
          )}
          {dates.map((d, i) => (
            <button
              key={i}
              className={`ait-date-btn ${selDate?.date === d.date && selDate?.expiry === d.expiry ? 'active' : ''}`}
              onClick={() => loadDay(d.expiry, d.date)}
            >
              <span className="ait-date-d">{d.date}</span>
              <span className="ait-date-exp">{d.expiry}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="ait-main">
          {view === 'insights' && <InsightsPanel insights={insights} symbol={symbol} />}
          {view === 'day' && (
            dayResult
              ? <DayDetail result={dayResult} />
              : selDate
                ? <div className="ait-loading">Loading day analysis…</div>
                : <div className="ait-empty">Select a date from the sidebar</div>
          )}
          {view === 'pattern' && (
            <PatternMatch symbol={symbol} selDate={selDate} />
          )}
        </div>
      </div>
    </div>
  );
}
