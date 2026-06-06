import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './FuturesView.css';

export default function FuturesView({ underlying, seg, socket }) {
  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!underlying || !socket) return;
    setLoading(true);
    setError('');
    setInfo(null);

    // Request server to subscribe + return snapshot
    socket.emit('load_futures', { underlying, seg });

    const onLoaded = (data) => {
      if (data.underlying !== underlying) return;
      setInfo(data);
      setLoading(false);
    };

    const onTick = (tick) => {
      if (tick.underlying !== underlying || tick.side !== 'futures') return;
      setInfo(prev => prev ? {
        ...prev,
        ltp:  tick.ltp,
        chg:  tick.futures_chg,
        pct:  tick.futures_pct_chg,
        volume: tick.volume ?? prev.volume,
        oi:     tick.oi    ?? prev.oi,
        open:   tick.open  ?? prev.open,
        high:   tick.high  ?? prev.high,
        low:    tick.low   ?? prev.low,
      } : prev);
    };

    const onErr = (data) => {
      if (data.underlying !== underlying) return;
      setError(data.message || 'Failed to load futures');
      setLoading(false);
    };

    socket.on('futures_loaded', onLoaded);
    socket.on('tick',           onTick);
    socket.on('futures_error',  onErr);

    return () => {
      socket.off('futures_loaded', onLoaded);
      socket.off('tick',           onTick);
      socket.off('futures_error',  onErr);
    };
  }, [underlying, seg, socket]);

  if (loading) return <div className="fv-center"><div className="fv-spin" /><span>Subscribing to {underlying} futures...</span></div>;
  if (error)   return <div className="fv-center fv-err">⚠ {error}</div>;
  if (!info)   return null;

  const pos = (info.chg ?? 0) >= 0;

  return (
    <div className="fv-wrap">
      <div className="fv-header">
        <span className="fv-sym">{info.symbol}</span>
        <span className="fv-exch">{info.exchange}</span>
        <span className="fv-badge">FUTURES</span>
      </div>

      <div className="fv-price-row">
        <span className="fv-ltp">₹{(info.ltp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        <span className={`fv-chg ${pos ? 'up' : 'dn'}`}>
          {pos ? '+' : ''}{(info.chg || 0).toFixed(2)}
          &nbsp;({pos ? '+' : ''}{(info.pct || 0).toFixed(2)}%)
        </span>
      </div>

      <div className="fv-stats">
        <Stat label="Prev Close" value={(info.prev_close || 0).toFixed(2)} />
        <Stat label="Open"       value={(info.open       || 0).toFixed(2)} />
        <Stat label="High"       value={(info.high       || 0).toFixed(2)} green />
        <Stat label="Low"        value={(info.low        || 0).toFixed(2)} red />
        <Stat label="Volume"     value={fmt(info.volume)} />
        <Stat label="OI"         value={fmt(info.oi)} />
      </div>
    </div>
  );
}

function Stat({ label, value, green, red }) {
  return (
    <div className="fv-stat">
      <span className="fv-stat-label">{label}</span>
      <span className={`fv-stat-val${green ? ' green' : red ? ' red' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function fmt(n) {
  if (!n) return '—';
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  return n.toLocaleString('en-IN');
}
