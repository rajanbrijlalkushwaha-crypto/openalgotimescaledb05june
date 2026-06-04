/**
 * useLiveTick(symbol)
 *
 * Returns latest raw tick from Socket.io pipeline server.
 * Falls back to Dragonfly REST /api/latest/<symbol> if Socket.io is not connected.
 *
 * tick shape:
 *   { symbol, exchange, ts, ltp, bid, ask, volume, oi, iv, delta, theta, gamma, vega }
 */

import { useEffect, useState, useRef } from 'react';
import sioClient from '../services/socketioClient';

const API_BASE =
  process.env.REACT_APP_PIPELINE_URL ||
  process.env.REACT_APP_API_URL?.replace('5800', '5900') ||
  'http://127.0.0.1:5900';

export function useLiveTick(symbol) {
  const [tick,      setTick]      = useState(null);
  const [connected, setConnected] = useState(sioClient.connected);
  const pollRef = useRef(null);

  // Connection state
  useEffect(() => {
    return sioClient.onConnectionChange(setConnected);
  }, []);

  // Socket.io subscription
  useEffect(() => {
    if (!symbol) { setTick(null); return; }
    return sioClient.subscribe(symbol, setTick);
  }, [symbol]);

  // REST fallback poll when Socket.io is disconnected
  useEffect(() => {
    if (connected || !symbol) {
      clearInterval(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/latest/${symbol}`);
        if (res.ok) setTick(await res.json());
      } catch (_) {}
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [connected, symbol]);

  return { tick, connected };
}

export default useLiveTick;
