import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchShiftingData, fetchLiveShiftingData } from '../../services/api';
import './Shifting.css';

export default function ShiftingModal() {
  const { state, dispatch } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!state.shiftingModalOpen) return;
    const load = async () => {
      setLoading(true);
      try {
        const { currentSymbol: symbol, currentExpiry: expiry, currentDataDate: date } = state;
        if (!symbol) return;
        const result = state.historicalMode && expiry && date && expiry !== '--' && date !== '--'
          ? await fetchShiftingData(symbol, expiry, date)
          : await fetchLiveShiftingData(symbol);
        setData(result);
      } catch (e) {
        console.error('Shifting data error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [state.shiftingModalOpen, state.currentSymbol, state.currentExpiry, state.currentDataDate, state.historicalMode]);

  if (!state.shiftingModalOpen) return null;
  const close = () => dispatch({ type: 'SET_SHIFTING_MODAL', payload: false });

  const cutoff = state.historicalMode && state.currentTime && state.currentTime !== '--'
    ? state.currentTime.substring(0, 5) : null;
  const timeline = data?.timeline?.filter(e =>
    e.time >= '09:15' && (!cutoff || e.time <= cutoff)
  ) || [];
  const rows = [];
  let firstAdded = false;
  for (const entry of timeline) {
    const hasShift = entry.resistance?.shift || entry.support?.shift;
    if (!firstAdded) { rows.push({ ...entry, isFirst: true }); firstAdded = true; }
    else if (hasShift) rows.push(entry);
  }

  const renderSide = (side, entry) => {
    const d = entry[side];
    const isRes = side === 'resistance';
    const colorClass = isRes ? 'sm-res' : 'sm-sup';
    if (!d) return <span className="sm-empty">—</span>;

    if (d.shift) {
      const isUp = d.shift === 'SFBTT';
      return (
        <div className="sm-shift-cell">
          <span className={`sm-shift-badge ${isUp ? 'sm-badge-up' : 'sm-badge-down'}`}>
            {isUp ? '↑ UP' : '↓ DOWN'}
          </span>
          <span className="sm-from">{d.shiftFrom}</span>
          <span className="sm-arrow">→</span>
          <span className={`sm-strike ${colorClass}`}>{d.strike}</span>
          {d.strength != null && <span className="sm-strength">{d.strength}</span>}
        </div>
      );
    }

    return (
      <div className="sm-normal-cell">
        <span className={`sm-strike ${colorClass}`}>{d.strike}</span>
        {d.strength != null && <span className="sm-strength">{d.strength}</span>}
      </div>
    );
  };

  return (
    <div className="sm-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="sm-panel">

        <div className="sm-header">
          <div className="sm-title-wrap">
            <span className="sm-header-icon">⇅</span>
            <div>
              <div className="sm-title">Level Shifts</div>
              <div className="sm-subtitle">
                {state.currentSymbol} · {state.currentDataDate || 'Live'}
              </div>
            </div>
          </div>
          <button className="sm-close" onClick={close}>✕</button>
        </div>

        <div className="sm-col-headers">
          <div className="sm-col-time">TIME</div>
          <div className="sm-col-res">RESISTANCE</div>
          <div className="sm-col-sup">SUPPORT</div>
        </div>

        <div className="sm-body">
          {loading && <div className="sm-state">Loading shifting data…</div>}
          {!loading && rows.length === 0 && <div className="sm-state">No data available</div>}
          {!loading && rows.map((entry, i) => (
            <div key={i} className={`sm-row ${entry.isFirst ? 'sm-row-open' : 'sm-row-shift'}`}>
              <div className="sm-td-time">
                <span className="sm-time-pill">{entry.time}</span>
                {entry.isFirst && <span className="sm-open-tag">OPEN</span>}
              </div>
              <div className="sm-td-res">{renderSide('resistance', entry)}</div>
              <div className="sm-td-sup">{renderSide('support', entry)}</div>
            </div>
          ))}
          {!loading && rows.length === 1 && rows[0].isFirst && (
            <div className="sm-stable">✓ Levels stable — no shifts detected</div>
          )}
        </div>

      </div>
    </div>
  );
}
