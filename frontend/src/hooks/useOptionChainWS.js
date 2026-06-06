/**
 * useOptionChainWS(symbol)
 *
 * Subscribes to live option chain data via Socket.IO.
 *
 * - Emits 'subscribe_chain' on mount and after every reconnect.
 * - Receives 'chain_update' for full snapshots, 'tick' for live updates.
 * - Patches individual strike rows in-place on each tick (no full re-render).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import sioClient from '../services/socketioClient';

export function useOptionChainWS(symbol) {
  const [data,      setData]      = useState(null);
  const [connected, setConnected] = useState(sioClient.connected);
  const [error,     setError]     = useState(null);

  // Kept in a ref so reconnect handler always sees the latest symbol
  const symbolRef = useRef(symbol);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  // Apply a live tick to the in-memory chain snapshot
  const applyTick = useCallback((tick) => {
    if (!tick?.strike || !tick?.side) return;

    setData(prev => {
      if (!prev) return prev;
      const next = { ...prev };

      if (tick.side === 'spot') {
        next.underlying_ltp = tick.ltp;
        return next;
      }

      next.strikes = (prev.strikes || []).map(row => {
        if (row.strike !== tick.strike) return row;
        const side = tick.side;
        if (!row[side]) return row;
        return {
          ...row,
          [side]: {
            ...row[side],
            ltp:     tick.ltp     ?? row[side].ltp,
            ltp_chg: tick.ltp_chg ?? row[side].ltp_chg,
            oi:      tick.oi      ?? row[side].oi,
            oi_chg:  tick.oi_chg  ?? row[side].oi_chg,
            volume:  tick.volume  ?? row[side].volume,
            iv:      tick.iv      ?? row[side].iv,
            delta:   tick.delta   ?? row[side].delta,
            gamma:   tick.gamma   ?? row[side].gamma,
            theta:   tick.theta   ?? row[side].theta,
            vega:    tick.vega    ?? row[side].vega,
          },
        };
      });
      return next;
    });
  }, []);

  // Subscribe / re-subscribe helper
  const doSubscribe = useCallback((sym) => {
    if (!sym || !sioClient.socket) return;
    sioClient.socket.emit('subscribe_chain', { underlying: sym });
  }, []);

  useEffect(() => {
    if (!symbol) {
      setData(null);
      return;
    }

    setData(null);
    setError(null);

    // Handlers for this symbol — defined here so we can remove them on cleanup
    const onChainUpdate = (msg) => {
      if (msg?.symbol === symbol || msg?.underlying === symbol) {
        setData(msg.data || msg);
        setError(null);
      }
    };

    const onTick = (tick) => {
      if (tick?.underlying === symbol) applyTick(tick);
    };

    const onError = (msg) => {
      if (msg?.symbol === symbol || !msg?.symbol) setError(msg?.message || 'Unknown error');
    };

    // Register listeners
    sioClient.socket?.on('chain_update', onChainUpdate);
    sioClient.socket?.on('tick', onTick);
    sioClient.socket?.on('error', onError);

    // Subscribe now (queued by Socket.IO if not yet connected)
    doSubscribe(symbol);

    // Re-subscribe every time we reconnect — server loses socket state on disconnect
    const unsubConn = sioClient.onConnectionChange((isConnected) => {
      setConnected(isConnected);
      if (isConnected) doSubscribe(symbolRef.current);
    });

    return () => {
      sioClient.socket?.emit('unsubscribe_chain', { underlying: symbol });
      sioClient.socket?.off('chain_update', onChainUpdate);
      sioClient.socket?.off('tick', onTick);
      sioClient.socket?.off('error', onError);
      unsubConn();
    };
  }, [symbol, applyTick, doSubscribe]);

  return { data, connected, error };
}
