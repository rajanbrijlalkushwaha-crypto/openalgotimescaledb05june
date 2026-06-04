/**
 * hooks/useOptionChainWS.js
 *
 * React hook — subscribes to a symbol via the shared singleton WS client
 * and returns live option chain data.
 *
 * Usage:
 *   const { data, connected, error } = useOptionChainWS('NIFTY');
 *
 * Behaviour:
 *   - Uses the singleton wsClient — one persistent connection shared across the app.
 *   - On symbol change: unsubscribes old, subscribes new.
 *   - On FULL message: replaces entire chain state.
 *   - On DIFF message: merges only changed fields — minimal re-render.
 *   - Reconnection + heartbeat are handled by wsClient automatically.
 */

import { useEffect, useState, useCallback } from 'react';
import wsClient from '../services/wsClient';

export function useOptionChainWS(symbol) {
  const [data,      setData]      = useState(null);
  const [connected, setConnected] = useState(wsClient.connected);
  const [error,     setError]     = useState(null);

  // Track connection state from singleton
  useEffect(() => wsClient.onConnectionChange(c => setConnected(c)), []);

  // Merge diff patch into existing snapshot — avoids full re-render
  const applyDiff = useCallback((diff) => {
    setData(prev => {
      if (!prev) return prev; // no baseline yet — wait for FULL

      const next = { ...prev };

      if (diff.spot_price         !== undefined) next.spot_price         = diff.spot_price;
      if (diff.spot_prev_close    !== undefined) next.spot_prev_close    = diff.spot_prev_close;
      if (diff.spot_change        !== undefined) next.spot_change        = diff.spot_change;
      if (diff.spot_pct_change    !== undefined) next.spot_pct_change    = diff.spot_pct_change;
      if (diff.futures_ltp        !== undefined) next.futures_ltp        = diff.futures_ltp;
      if (diff.futures_prev_close !== undefined) next.futures_prev_close = diff.futures_prev_close;
      if (diff.futures_change     !== undefined) next.futures_change     = diff.futures_change;
      if (diff.futures_pct_change !== undefined) next.futures_pct_change = diff.futures_pct_change;
      if (diff.time               !== undefined) next.time               = diff.time;
      if (diff.expiry             !== undefined) next.expiry             = diff.expiry;
      if (diff.date               !== undefined) next.date               = diff.date;
      if (diff.nextExpiry         !== undefined) next.nextExpiry         = diff.nextExpiry;

      if (diff.chains)            next.chains            = { ...(prev.chains || {}), ...diff.chains };
      if (diff.availableExpiries) next.availableExpiries = diff.availableExpiries;

      if (diff.chain) {
        const chainMap = {};
        for (const row of (prev.chain || [])) chainMap[row.strike] = row;

        for (const [strike, changes] of Object.entries(diff.chain)) {
          const s = Number(strike);
          chainMap[s] = !chainMap[s]
            ? changes
            : {
                ...chainMap[s],
                call: changes.call ? { ...chainMap[s].call, ...changes.call } : chainMap[s].call,
                put:  changes.put  ? { ...chainMap[s].put,  ...changes.put  } : chainMap[s].put,
              };
        }

        next.chain = Object.values(chainMap).sort((a, b) => a.strike - b.strike);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (!symbol) {
      setData(null);
      return;
    }

    setData(null); // clear stale data when symbol changes

    const unsub = wsClient.subscribe(symbol, ({ type, data: d }) => {
      if (type === 'full') {
        setData(d);
        setError(null);
      } else if (type === 'diff') {
        applyDiff(d);
      } else if (type === 'error') {
        setError(d?.message || 'Unknown error');
      }
    });

    return unsub;
  }, [symbol, applyDiff]);

  return { data, connected, error };
}
