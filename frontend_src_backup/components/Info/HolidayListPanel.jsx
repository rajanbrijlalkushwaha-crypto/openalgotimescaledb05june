import { useState, useEffect } from 'react';
import './InfoPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

export default function HolidayListPanel() {
  useBodyScroll();
  const [holidays, setHolidays] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/market/holidays`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setHolidays(d.data || []);
        setFetchedAt(d.fetched_at || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().split('T')[0];

  // date string 2 days from now
  const in2Days = new Date();
  in2Days.setDate(in2Days.getDate() + 2);
  const in2DaysStr = in2Days.toISOString().split('T')[0];

  const upcomingCount = holidays.filter(h => h.date >= today).length;

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <span className="info-panel-icon">🗓️</span>
        <div>
          <div className="info-panel-title">Market Holiday List</div>
          {fetchedAt && (
            <div className="info-panel-sub">
              Updated: {new Date(fetchedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          <span className="info-panel-count">{holidays.length} total</span>
          <span className="info-panel-count info-panel-count-upcoming">{upcomingCount} upcoming</span>
        </div>
      </div>

      {/* Legend */}
      <div className="holiday-legend">
        <span className="legend-item legend-alert">Today / Within 2 days</span>
        <span className="legend-item legend-upcoming">Upcoming</span>
        <span className="legend-item legend-past">Past</span>
      </div>

      <div className="info-panel-body">
        {loading && <div className="info-state">Loading holidays...</div>}

        {!loading && holidays.length === 0 && (
          <div className="info-state">No holiday data available.</div>
        )}

        {!loading && holidays.length > 0 && (
          <table className="info-table">
            <thead>
              <tr>
                <th className="th-num">#</th>
                <th className="th-date">Date</th>
                <th className="th-day">Day</th>
                <th className="th-name">Holiday</th>
                <th className="th-ex">Exchanges</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h, i) => {
                const d        = new Date(h.date);
                const isPast   = h.date < today;
                const isToday  = h.date === today;
                const isSoon   = !isPast && !isToday && h.date <= in2DaysStr;
                const rowClass = isToday ? 'row-today'
                               : isSoon  ? 'row-soon'
                               : isPast  ? 'row-past'
                               :           'row-upcoming';
                return (
                  <tr key={i} className={rowClass}>
                    <td className="td-num">{i + 1}</td>
                    <td className="td-date">
                      {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {isToday && <span className="badge-today">TODAY</span>}
                      {isSoon  && <span className="badge-soon">SOON</span>}
                    </td>
                    <td className="td-day">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</td>
                    <td className="td-name">{h.description}</td>
                    <td className="td-exchanges">
                      {(h.closed_exchanges || []).map((ex, j) => (
                        <span key={j} className="exchange-chip">{ex}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
