/**
 * useInfluxChart(type, symbol, params)
 *
 * Fetches chart data from InfluxDB via Socket.io server REST API.
 * Auto-refreshes every `refreshMs` (default 10s to match snapshot interval).
 *
 * type:
 *   'oi'    → OI history for a strike   (params: { strike, side, hours, expiry })
 *   'price' → Price history for a strike (params: { strike, side, hours })
 *   'spot'  → Spot price history         (params: { hours })
 *   'ohlcv' → OHLCV bars                 (params: { interval, hours })
 *   'iv'    → IV smile                   (params: { hours })
 *
 * Returns: { data: [...], loading, error }
 */

import { useEffect, useState, useRef, useCallback } from 'react';

const PIPELINE_URL =
  process.env.REACT_APP_PIPELINE_URL ||
  (process.env.REACT_APP_API_URL || 'http://127.0.0.1:5800').replace('5800', '5900');

const ENDPOINTS = {
  oi:    (sym, p) => `/api/chart/oi/${sym}?strike=${p.strike}&side=${p.side||'CE'}&hours=${p.hours||6}${p.expiry ? `&expiry=${p.expiry}` : ''}`,
  price: (sym, p) => `/api/chart/price/${sym}?strike=${p.strike}&side=${p.side||'CE'}&hours=${p.hours||6}`,
  spot:  (sym, p) => `/api/chart/spot/${sym}?hours=${p.hours||6}`,
  ohlcv: (sym, p) => `/api/chart/ohlcv/${sym}?interval=${p.interval||'1m'}&hours=${p.hours||6}`,
  iv:    (sym, p) => `/api/chart/iv/${sym}?hours=${p.hours||1}`,
};

export function useInfluxChart(type, symbol, params = {}, refreshMs = 10000) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    if (!type || !symbol) return;
    const buildPath = ENDPOINTS[type];
    if (!buildPath) return;

    setLoading(true);
    try {
      const path = buildPath(symbol, params);
      const res  = await fetch(`${PIPELINE_URL}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Normalize: different endpoints use 'data' or 'bars'
      setData(json.data || json.bars || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, symbol, JSON.stringify(params)]);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, refreshMs);
    return () => clearInterval(timerRef.current);
  }, [fetch_, refreshMs]);

  return { data, loading, error, refresh: fetch_ };
}

export default useInfluxChart;
