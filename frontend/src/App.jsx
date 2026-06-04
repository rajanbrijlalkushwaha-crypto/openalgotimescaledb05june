/**
 * soctickdata — Live Option Chain
 * Data flow: REST prefetch (once) → WS tick-by-tick for everything else
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import OptionChainTable from './components/OptionChain/OptionChainTable';
import UISettings from './components/UISetting/UISettings';
import SimpleTopbar from './components/Topbar/SimpleTopbar';

// NON-lazy imports — avoids Suspense hanging issues
import LTPCalculator from './components/Calculator/LTPCalculator';
import LTPPopup from './components/Calculator/LTPPopup';

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
})();

// Backend format → AppContext format
function mapChain(strikes) {
  return (strikes || []).map(row => ({
    strike: row.strike,
    call: {
      ltp:        row.ce?.ltp        ?? 0,
      ltp_change: row.ce?.ltp_chg    ?? 0,
      oi:         row.ce?.oi         ?? 0,
      oi_change:  row.ce?.oi_chg     ?? 0,
      volume:     row.ce?.volume     ?? 0,
      delta:      row.ce?.delta      ?? 0,
      iv:         row.ce?.iv         ?? 0,
      gamma:      row.ce?.gamma      ?? 0,
      theta:      row.ce?.theta      ?? 0,
      vega:       row.ce?.vega       ?? 0,
    },
    put: {
      ltp:        row.pe?.ltp        ?? 0,
      ltp_change: row.pe?.ltp_chg    ?? 0,
      oi:         row.pe?.oi         ?? 0,
      oi_change:  row.pe?.oi_chg     ?? 0,
      volume:     row.pe?.volume     ?? 0,
      delta:      row.pe?.delta      ?? 0,
      iv:         row.pe?.iv         ?? 0,
      gamma:      row.pe?.gamma      ?? 0,
      theta:      row.pe?.theta      ?? 0,
      vega:       row.pe?.vega       ?? 0,
    },
  }));
}

function AppInner() {
  const { dispatch }  = useApp();
  const wsRef         = useRef(null);
  const retryRef      = useRef(null);
  const activeSymRef  = useRef(null);
  const dispatchRef   = useRef(dispatch);
  const [wsLive, setWsLive] = useState(false);
  dispatchRef.current = dispatch;

  const push = useCallback((chain, spot, expiry, expiries, lotSize) => {
    dispatchRef.current({
      type: 'SET_LIVE_DATA',
      payload: {
        chain,
        spot_price:        spot || 0,
        expiry:            expiry || '--',
        lot_size:          lotSize || 25,
        availableExpiries: expiries || [],
        time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        date: new Date().toLocaleDateString('en-CA'),
      },
    });
  }, []);

  // ── Load initial chain via REST ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/prefetch')
      .then(r => r.json())
      .then(d => {
        const syms = d.liveSymbols || [];
        if (syms.length) {
          dispatchRef.current({ type: 'SET_SYMBOLS',           payload: syms });
          dispatchRef.current({ type: 'SET_AVAILABLE_SYMBOLS', payload: syms });
        }
        const ld = d.liveData;
        if (ld?.chain?.length) {
          activeSymRef.current = d.firstSymbol;
          dispatchRef.current({ type: 'SET_CURRENT_SYMBOL', payload: d.firstSymbol });
          push(ld.chain, ld.spot_price, ld.expiry, ld.availableExpiries, ld.lot_size);
        } else {
          // No chain data yet — clear loading so table shows "Select symbol"
          dispatchRef.current({ type: 'SET_LOADING', payload: false });
        }
      })
      .catch(err => {
        console.error('[prefetch]', err);
        dispatchRef.current({ type: 'SET_LOADING', payload: false });
      });
  }, [push]);

  // ── WebSocket — live tick-by-tick ────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === 0 || wsRef.current?.readyState === 1) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => { clearTimeout(retryRef.current); setWsLive(true); };
    ws.onclose = () => { setWsLive(false); retryRef.current = setTimeout(connect, 3000); };
    ws.onerror = () => {};

    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }

      if (m.type === 'tick') {
        const t = m.data;
        if (!t?.symbol) return;
        if (t.symbol === activeSymRef.current) {
          dispatchRef.current({ type: 'SET_SPOT', payload: t.ltp });
        } else {
          dispatchRef.current({ type: 'PATCH_TICK', payload: t });
        }
        return;
      }

      if (m.type === 'chain_update') {
        if (!m.data?.strikes) {
          console.warn('[WS] chain_update missing strikes:', m);
          return;
        }
        console.log('[WS] chain_update', m.symbol, m.expiry, 'strikes:', m.data.strikes.length, 'spot:', m.data.underlying_ltp);
        activeSymRef.current = m.symbol;
        dispatchRef.current({ type: 'SET_CURRENT_SYMBOL', payload: m.symbol });
        push(mapChain(m.data.strikes), m.data.underlying_ltp, m.expiry, [], 25);
      }

      if (m.type === 'error') {
        console.error('[WS] server error:', m.message);
      }
    };
  }, [push]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(retryRef.current); wsRef.current?.close(); };
  }, [connect]);

  // ── Called from SimpleTopbar when user selects symbol + expiry ────────
  const handleLoad = useCallback((symbol, expiry, segment) => {
    activeSymRef.current = symbol;
    dispatchRef.current({ type: 'SET_CURRENT_SYMBOL', payload: symbol });
    const ws = wsRef.current;
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({ action: 'load', symbol, expiry, segment }));
    } else {
      // WS not ready — fallback REST
      fetch(`/api/chain/${symbol}/${expiry}`)
        .then(r => r.json())
        .then(d => {
          if (d.data?.strikes) {
            push(mapChain(d.data.strikes), d.data.underlying_ltp, expiry, [], 25);
          }
        })
        .catch(() => {});
    }
  }, [push]);

  return (
    <>
      <SimpleTopbar onLoad={handleLoad} wsLive={wsLive} />
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
