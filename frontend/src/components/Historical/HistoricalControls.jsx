import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  fetchHistoricalExpiries,
  fetchHistoricalDates, fetchHistoricalTimes,
  fetchHistoricalSnapshot,
} from '../../services/api';

export default function HistoricalControls() {
  const { state, dispatch } = useApp();
  const [expiries, setExpiries] = useState([]);
  const [dates, setDates] = useState([]);
  const [times, setTimes] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:15:00');
  const [timeframe, setTimeframe] = useState('60');
  const [playing, setPlaying] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const playRef = useRef(null);

  const loadSnapshot = useCallback(async (sym, exp, date, time) => {
    setLoadFailed(false);
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const data = await fetchHistoricalSnapshot(sym, exp, date, time);
      if (!data || !data.chain?.length) { setLoadFailed(true); return false; }
      dispatch({ type: 'SET_LIVE_DATA', payload: { ...data, expiry: exp, date, time } });
      return true;
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
      return false;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  // Auto-load: last expiry → last date → first snapshot when mode activates or symbol changes
  useEffect(() => {
    if (!state.historicalMode || !state.currentSymbol) return;
    const sym = state.currentSymbol;
    setSelectedSymbol(sym);
    setExpiries([]); setDates([]); setTimes([]);
    setSelectedExpiry(''); setSelectedDate(''); setSelectedTime('09:15:00');

    (async () => {
      try {
        const expData = await fetchHistoricalExpiries(sym);
        if (!expData?.length) return;
        setExpiries(expData);
        const lastExp = expData[expData.length - 1];
        setSelectedExpiry(lastExp);
        dispatch({ type: 'SET_EXPIRY', payload: lastExp });

        const dateData = await fetchHistoricalDates(sym, lastExp);
        if (!dateData?.length) return;
        setDates(dateData);
        const lastDate = dateData[dateData.length - 1];
        setSelectedDate(lastDate);
        dispatch({ type: 'SET_DATA_DATE', payload: lastDate });

        const timeData = await fetchHistoricalTimes(sym, lastExp, lastDate);
        if (!timeData?.length) return;
        setTimes(timeData);
        dispatch({
          type: 'SET_HISTORICAL_SNAPSHOTS',
          payload: timeData.map(t => ({ symbol: sym, expiry: lastExp, date: lastDate, time: t.time })),
        });
        // Default to 09:15 — snap to nearest available
        const targetSecs = 9 * 3600 + 15 * 60;
        let best = timeData[0];
        let bestDiff = Infinity;
        for (const t of timeData) {
          const parts = t.time.split(':').map(Number);
          const secs = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
          const diff = Math.abs(secs - targetSecs);
          if (diff < bestDiff) { bestDiff = diff; best = t; }
        }
        // Load nearest to 09:15 — only update time display if load succeeds
        const ok = await loadSnapshot(sym, lastExp, lastDate, best.time);
        if (ok) setSelectedTime(best.time);
      } catch (e) { console.error(e); }
    })();
  }, [state.historicalMode, state.currentSymbol, dispatch, loadSnapshot]);

  // Cleanup play interval on unmount
  useEffect(() => () => clearInterval(playRef.current), []);

  if (!state.historicalMode) return null;

  const loadExpiries = async (sym) => {
    try {
      const data = await fetchHistoricalExpiries(sym);
      setExpiries(data || []);
    } catch (e) { console.error(e); }
  };

  const loadDates = async (sym, exp) => {
    try {
      const data = await fetchHistoricalDates(sym, exp);
      setDates(data || []);
    } catch (e) { console.error(e); }
  };

  const loadTimes = async (sym, exp, date) => {
    try {
      const data = await fetchHistoricalTimes(sym, exp, date);
      setTimes(data || []);
      dispatch({ type: 'SET_HISTORICAL_SNAPSHOTS', payload: data.map(t => ({ symbol: sym, expiry: exp, date, time: t.time })) });
    } catch (e) { console.error(e); }
  };

  const handleSymbolChange = (e) => {
    const sym = e.target.value;
    setSelectedSymbol(sym);
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: sym });
    loadExpiries(sym);
  };

  const handleExpiryChange = (e) => {
    const exp = e.target.value;
    setSelectedExpiry(exp);
    dispatch({ type: 'SET_EXPIRY', payload: exp });
    loadDates(selectedSymbol, exp);
  };

  const handleDateChange = (e) => {
    const date = e.target.value;
    setSelectedDate(date);
    dispatch({ type: 'SET_DATA_DATE', payload: date });
    loadTimes(selectedSymbol, selectedExpiry, date);
  };

  const handleTimeChange = (e) => {
    const val = e.target.value; // HH:MM from native time input
    if (!val || !times.length) return;
    // Snap to nearest available snapshot
    const inputSecs = parseTimeSecs(val + ':00');
    let best = times[0];
    let bestDiff = Infinity;
    for (const t of times) {
      const diff = Math.abs(parseTimeSecs(t.time) - inputSecs);
      if (diff < bestDiff) { bestDiff = diff; best = t; }
    }
    setSelectedTime(best.time);
    loadSnapshot(selectedSymbol, selectedExpiry, selectedDate, best.time);
  };

  const parseTimeSecs = (t) => {
    const parts = t.split(':').map(Number);
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  };

  const navigate = (dir) => {
    const idx = times.findIndex(t => t.time === selectedTime);
    if (idx < 0) return;
    const tf = parseInt(timeframe, 10);
    if (tf <= 30) {
      // Small timeframes: step one snapshot at a time
      const newIdx = idx + dir;
      if (newIdx >= 0 && newIdx < times.length) {
        const newTime = times[newIdx].time;
        setSelectedTime(newTime);
        loadSnapshot(selectedSymbol, selectedExpiry, selectedDate, newTime);
      }
    } else {
      // Larger timeframes: jump by timeframe seconds
      const curSecs = parseTimeSecs(times[idx].time);
      const targetSecs = curSecs + dir * tf;
      let bestIdx = dir > 0 ? times.length - 1 : 0;
      if (dir > 0) {
        // Find first snapshot >= targetSecs
        const found = times.findIndex(t => parseTimeSecs(t.time) >= targetSecs);
        if (found >= 0) bestIdx = found;
      } else {
        // Find last snapshot <= targetSecs
        for (let i = times.length - 1; i >= 0; i--) {
          if (parseTimeSecs(times[i].time) <= targetSecs) { bestIdx = i; break; }
        }
      }
      if (bestIdx !== idx) {
        const newTime = times[bestIdx].time;
        setSelectedTime(newTime);
        loadSnapshot(selectedSymbol, selectedExpiry, selectedDate, newTime);
      }
    }
  };

  const togglePlay = () => {
    if (playing) {
      clearInterval(playRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      playRef.current = setInterval(() => {
        setSelectedTime(prev => {
          const idx = times.findIndex(t => t.time === prev);
          if (idx < 0 || idx >= times.length - 1) {
            clearInterval(playRef.current);
            setPlaying(false);
            return prev;
          }
          const tf = parseInt(timeframe, 10);
          let nextIdx = idx + 1;
          if (tf > 30) {
            const curSecs = parseTimeSecs(times[idx].time);
            const targetSecs = curSecs + tf;
            const found = times.findIndex(t => parseTimeSecs(t.time) >= targetSecs);
            if (found >= 0 && found < times.length) nextIdx = found;
            else { clearInterval(playRef.current); setPlaying(false); return prev; }
          }
          const next = times[nextIdx].time;
          loadSnapshot(selectedSymbol, selectedExpiry, selectedDate, next);
          return next;
        });
      }, 1000);
    }
  };

  return (
    <>
      <select className="historical-select" value={selectedSymbol} onChange={handleSymbolChange}>
        <option value="">Symbol...</option>
        {state.availableSymbols.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
      </select>
      <select className="historical-select" value={selectedExpiry} onChange={handleExpiryChange}>
        <option value="">Expiry...</option>
        {expiries.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      <select className="historical-select" value={selectedDate} onChange={handleDateChange}>
        <option value="">Date...</option>
        {dates.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <div className="time-list-container">
        <input
          type="time"
          value={selectedTime ? selectedTime.substring(0, 5) : '09:15'}
          onChange={handleTimeChange}
          disabled={!times.length}
          step="60"
        />
        {selectedTime && (
          <button
            className={`nav-btn${loadFailed ? ' play-btn playing' : ''}`}
            onClick={() => loadSnapshot(selectedSymbol, selectedExpiry, selectedDate, selectedTime)}
          >
            ⟳ Fetch Data
          </button>
        )}
      </div>
      <select className="timeframe-select" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
        <option value="5">5s</option>
        <option value="15">15s</option>
        <option value="30">30s</option>
        <option value="60">1m</option>
        <option value="300">5m</option>
        <option value="900">15m</option>
      </select>
      <button className="nav-btn" onClick={() => navigate(-1)}>⏮</button>
      <button className={`nav-btn play-btn ${playing ? 'playing' : ''}`} onClick={togglePlay}>
        {playing ? '⏸' : '▶'}
      </button>
      <button className="nav-btn" onClick={() => navigate(1)}>⏭</button>
    </>
  );
}
