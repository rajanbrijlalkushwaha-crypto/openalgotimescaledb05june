/**
 * soctickdata — Live Option Chain
 * Data flow: REST prefetch (once) → Socket.IO tick-by-tick for everything else
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';
import { AppProvider, useApp } from './context/AppContext';
import OptionChainTable from './components/OptionChain/OptionChainTable';
import UISettings       from './components/UISetting/UISettings';
import SimpleTopbar     from './components/Topbar/SimpleTopbar';
import LTPCalculator    from './components/Calculator/LTPCalculator';
import LTPPopup         from './components/Calculator/LTPPopup';
import XPLoader         from './components/Loading/XPLoader';

// Backend chain format → AppContext format
function mapChain(strikes) {
  return (strikes || []).map(row => ({
    strike: row.strike,
    call: {
      ltp:        row.ce?.ltp     ?? 0,
      ltp_change: row.ce?.ltp_chg ?? 0,
      oi:         row.ce?.oi      ?? 0,
      oi_change:  row.ce?.oi_chg  ?? 0,
      volume:     row.ce?.volume  ?? 0,
      delta:      row.ce?.delta   ?? 0,
      iv:         row.ce?.iv      ?? 0,
      gamma:      row.ce?.gamma   ?? 0,
      theta:      row.ce?.theta   ?? 0,
      vega:       row.ce?.vega    ?? 0,
    },
    put: {
      ltp:        row.pe?.ltp     ?? 0,
      ltp_change: row.pe?.ltp_chg ?? 0,
      oi:         row.pe?.oi      ?? 0,
      oi_change:  row.pe?.oi_chg  ?? 0,
      volume:     row.pe?.volume  ?? 0,
      delta:      row.pe?.delta   ?? 0,
      iv:         row.pe?.iv      ?? 0,
      gamma:      row.pe?.gamma   ?? 0,
      theta:      row.pe?.theta   ?? 0,
      vega:       row.pe?.vega    ?? 0,
    },
  }));
}

function AppInner() {
  const { dispatch } = useApp();
  const socketRef    = useRef(null);
  const activeSymRef = useRef(null);
  const dispatchRef  = useRef(dispatch);
  dispatchRef.current = dispatch;

  const [sioLive,    setSioLive]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Loading data...');
  // futures prices: { NIFTY: { ltp, chg, pct }, BANKNIFTY: {...}, ... }
  const [futures,    setFutures]    = useState({});

  const push = useCallback((chain, spot, expiry, expiries, lotSize) => {
    dispatchRef.current({
      type: 'SET_LIVE_DATA',
      payload: {
        chain,
        spot_price:        spot    || 0,
        expiry:            expiry  || '--',
        lot_size:          lotSize || 25,
        availableExpiries: expiries || [],
        time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        date: new Date().toLocaleDateString('en-CA'),
      },
    });
  }, []);

  useEffect(() => {
    dispatchRef.current({ type: 'SET_LOADING', payload: false });
  }, []);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect',    () => setSioLive(true));
    socket.on('disconnect', () => setSioLive(false));

    socket.on('tick', (tick) => {
      if (!tick?.symbol) return;

      // Futures tick — update futures price state
      if (tick.side === 'futures') {
        setFutures(prev => ({
          ...prev,
          [tick.underlying]: {
            ltp: tick.ltp,
            chg: tick.futures_chg ?? 0,
            pct: tick.futures_pct_chg ?? 0,
          },
        }));
        return;
      }

      // Spot tick
      if (tick.side === 'spot' || tick.underlying === activeSymRef.current) {
        if (tick.side === 'spot' || !tick.side) {
          dispatchRef.current({ type: 'SET_SPOT', payload: tick.ltp });
        } else {
          dispatchRef.current({ type: 'PATCH_TICK', payload: tick });
        }
        return;
      }

      // Option tick
      dispatchRef.current({ type: 'PATCH_TICK', payload: tick });
    });

    socket.on('chain_update', (msg) => {
      if (!msg?.data?.strikes) return;
      push(mapChain(msg.data.strikes), msg.data.underlying_ltp, msg.expiry, [], 25);
      setLoading(false);
    });

    socket.on('expiries_update', (msg) => {
      if (msg?.data?.length) {
        dispatchRef.current({ type: 'SET_AVAILABLE_EXPIRIES', payload: msg.data });
      }
    });

    socket.on('error', () => setLoading(false));

    return () => socket.disconnect();
  }, [push]);

  // ── Load option chain ──────────────────────────────────────────────────────
  const handleLoad = useCallback((symbol, expiry, segment) => {
    activeSymRef.current = symbol;
    dispatchRef.current({ type: 'SET_CURRENT_SYMBOL', payload: symbol });

    setLoadingMsg(`Loading ${symbol} ${expiry}...`);
    setLoading(true);
    setTimeout(() => setLoading(false), 15000); // safety timeout

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('load', { symbol, expiry, segment });
    } else {
      const apiBase = process.env.REACT_APP_API_BASE || '';
      fetch(`${apiBase}/api/chain/${symbol}/${expiry}`)
        .then(r => r.json())
        .then(d => {
          if (d.data?.strikes) push(mapChain(d.data.strikes), d.data.underlying_ltp, expiry, [], 25);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [push]);

  return (
    <>
      {loading && <XPLoader text={loadingMsg} />}
      <SimpleTopbar
        onLoad={handleLoad}
        wsLive={sioLive}
        futures={futures}
        currentSymbol={activeSymRef.current}
      />
      <UISettings />
      <div id="mainContent">
        <LTPCalculator />
        <LTPPopup />
        <OptionChainTable />
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
