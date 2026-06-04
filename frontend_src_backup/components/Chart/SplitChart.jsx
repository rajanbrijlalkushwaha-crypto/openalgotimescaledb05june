import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { useApp } from '../../context/AppContext';
import './SplitChart.css';

const API_BASE = process.env.REACT_APP_API_URL || '';
const apiFetch = (url) => fetch(`${API_BASE}${url}`, { credentials: 'include' }).then(r => r.json());

// Times in _chart_spot.json are IST strings (e.g. "09:00", "09:15", "15:30").
// Embedded as-if UTC so chart labels show IST time directly.
const PREMARKET_START_MIN = 9  * 60 + 0;   // 9:00 AM IST
const PREMARKET_END_MIN   = 9  * 60 + 9;   // 9:09 AM IST (last pre-market candle)
const MARKET_OPEN_MIN     = 9  * 60 + 15;  // 9:15 AM IST
const MARKET_CLOSE_MIN    = 15 * 60 + 30;  // 3:30 PM IST

function toTs(tradeDate, timeStr) {
  return Math.floor(new Date(`${tradeDate}T${timeStr}:00Z`).getTime() / 1000);
}

// Returns { market: [...], premarket: [...], openTs: number|null }
function parseCandles(data, fallbackDate) {
  if (!data?.candles?.length) return null;
  const tradeDate = data.date || fallbackDate;
  const market = [], premarket = [];

  for (const c of data.candles) {
    const [h, m] = c.time.split(':').map(Number);
    const istMin = h * 60 + m;
    const candle = {
      time:  toTs(tradeDate, c.time),
      open:  Number(c.open), high: Number(c.high),
      low:   Number(c.low),  close: Number(c.close),
    };
    if (isNaN(candle.time) || candle.open <= 0) continue;

    if (istMin >= PREMARKET_START_MIN && istMin <= PREMARKET_END_MIN) {
      premarket.push(candle);
    } else if (istMin >= MARKET_OPEN_MIN && istMin <= MARKET_CLOSE_MIN) {
      market.push(candle);
    }
  }

  market.sort((a, b) => a.time - b.time);
  premarket.sort((a, b) => a.time - b.time);

  // Timestamp for 9:15 open marker
  const openTs = market.length ? market[0].time : null;

  return { market, premarket, openTs };
}

export default function SplitChart() {
  const { state } = useApp();
  const {
    currentSymbol, currentExpiry, currentDataDate, currentTime, historicalMode,
    strategy40Support, strategy40SupportReversal,
    strategy40Resistance, strategy40ResistanceReversal,
    mctrSupport, mctrSupportRev, mctrResistance, mctrResistanceRev,
    mctrSupportFoundAt, mctrResistanceFoundAt,
    strongSupport, strongResistance,
    strong2ndSupport, strong2ndResistance,
  } = state;

  const containerRef    = useRef();
  const chartRef        = useRef();
  const seriesRef       = useRef();
  const preSeriesRef    = useRef();   // pre-market candle series
  const pollRef         = useRef();
  const wsRef           = useRef(null);
  const plinesRef       = useRef([]);   // active price lines
  const lineLabelDataRef= useRef([]);   // [{price, color, title}] for HTML overlay
  const overlayRef      = useRef();     // HTML overlay for big price-line labels
  const tooltipRef      = useRef();     // OHLC hover tooltip div
  const vlineRef        = useRef();     // vertical separator div
  const openTsRef       = useRef(null); // 9:15 open timestamp
  const allMktRef       = useRef([]);   // full day market candles (historical replay)
  const allPreRef       = useRef([]);   // full day premarket candles (historical replay)

  const [status,     setStatus]     = useState('loading');
  const [showBromos, setShowBromos] = useState(true);
  const [showMCTR,   setShowMCTR]   = useState(true);
  const [showAI,     setShowAI]     = useState(true);
  const [showStrong, setShowStrong] = useState(true);
  const [aiSignals,  setAiSignals]  = useState({ res: [], sup: [] });  // all signals for current symbol
  const [tf,         setTf]         = useState(5);     // timeframe in minutes

  // ── Fetch AI signal for current symbol ──────────────────────────────────────
  // Live mode: uses RAM-cached /live endpoint, polls every 60 s for updates.
  // Historical mode: uses date-based endpoint (one-shot).
  useEffect(() => {
    if (!currentSymbol) { setAiSignals({ res: [], sup: [] }); return; }

    const pickSignal = (d) => {
      if (!d?.success) { setAiSignals({ res: [], sup: [] }); return; }
      const symName = currentSymbol.replace(/_/g, ' ');
      const res = (d.resistance || []).filter(s => s.symbol === symName);
      const sup = (d.support    || []).filter(s => s.symbol === symName);
      setAiSignals({ res, sup });
    };

    if (historicalMode) {
      if (!currentDataDate || currentDataDate === '--') { setAiSignals({ res: [], sup: [] }); return; }
      fetch(`/api/trainai/stock-signals/${currentDataDate}`, { credentials: 'include' })
        .then(r => r.json()).then(pickSignal).catch(() => setAiSignals({ res: [], sup: [] }));
      return;
    }

    // Live mode — try RAM-cache endpoint first; if not ready/unavailable,
    // fall back to fetching the latest date from stock-dates then stock-signals.
    const fetchLive = () =>
      fetch(`${API_BASE}/api/trainai/stock-signals/live`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d?.success) { pickSignal(d); return; }
          // Fallback: get latest date, then fetch signals for that date
          return fetch(`${API_BASE}/api/trainai/stock-dates`, { credentials: 'include' })
            .then(r => r.json())
            .then(dd => {
              const latest = dd?.dates?.[0];
              if (!latest) return;
              return fetch(`${API_BASE}/api/trainai/stock-signals/${latest}`, { credentials: 'include' })
                .then(r => r.json()).then(pickSignal);
            });
        })
        .catch(() => {});

    fetchLive();
    const timer = setInterval(fetchLive, 60_000);
    return () => clearInterval(timer);
  }, [currentSymbol, currentDataDate, historicalMode]);

  // ── Clear and redraw all price lines ────────────────────────────────────────
  const redrawLines = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Remove all existing price lines
    plinesRef.current.forEach(pl => { try { series.removePriceLine(pl); } catch (_) {} });
    plinesRef.current = [];
    lineLabelDataRef.current = [];

    // In historical mode, only show a line if currentTime >= the time it was detected
    const curHHMM = historicalMode && currentTime && currentTime !== '--'
      ? currentTime.substring(0, 5) : null;
    const visible = (foundAt) => {
      if (!curHHMM) return true;           // live mode — always show
      if (!foundAt)  return true;           // no time info — always show
      return curHHMM >= foundAt.substring(0, 5);
    };

    const RED   = '#e53935';
    const GREEN = '#1b8a1b';
    const add = (price, color, title, time = null, style = 0, width = 2) => {
      if (price == null || isNaN(price)) return;
      const pl = series.createPriceLine({ price: Number(price), color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title: '' });
      plinesRef.current.push(pl);
      const timeStr = time ? ` @${time.substring(0, 5)}` : '';
      lineLabelDataRef.current.push({ price: Number(price), color, title: `${title} ${Number(price).toFixed(2)}${timeStr}` });
    };

    // Bromos — previous-day data, always visible
    if (showBromos) {
      add(strategy40ResistanceReversal, RED,   'Bromos R', null, 0, 2);
      add(strategy40SupportReversal,    GREEN, 'Bromos S', null, 0, 2);
    }

    // MCTR — only show after found_at time in historical mode
    if (showMCTR) {
      if (visible(mctrResistanceFoundAt)) add(mctrResistanceRev, RED,   'MCTR-R', mctrResistanceFoundAt, 0, 2);
      if (visible(mctrSupportFoundAt))    add(mctrSupportRev,    GREEN, 'MCTR-S', mctrSupportFoundAt,    0, 2);
    }

    // Strong S/R — 2+ of Vol/OI/OI-Chng at 100% on same strike (dashed)
    if (showStrong) {
      add(strongResistance,    RED,   'Strong R',      null, 2, 2);
      add(strongSupport,       GREEN, 'Strong S',      null, 2, 2);
      add(strong2ndResistance, RED,   '2nd Reversal R', null, 2, 1);
      add(strong2ndSupport,    GREEN, '2nd Reversal S', null, 2, 1);
    }

    // AI signals — only show signals with trade_score >= 80
    if (showAI) {
      for (const sig of (aiSignals.res || [])) {
        if (sig.from_reversal != null && visible(sig.trade_time) && (sig.trade_score ?? 0) >= 80) {
          const scoreStr = sig.trade_score != null ? ` [${sig.trade_score}]` : '';
          add(sig.from_reversal, RED,   `AI-R${scoreStr}`, sig.trade_time, 0, 2);
        }
      }
      for (const sig of (aiSignals.sup || [])) {
        if (sig.from_reversal != null && visible(sig.trade_time) && (sig.trade_score ?? 0) >= 80) {
          const scoreStr = sig.trade_score != null ? ` [${sig.trade_score}]` : '';
          add(sig.from_reversal, GREEN, `AI-S${scoreStr}`, sig.trade_time, 0, 2);
        }
      }
    }
  }, [
    historicalMode, currentTime,
    showBromos, showMCTR, showAI, showStrong, aiSignals,
    strategy40Support, strategy40SupportReversal, strategy40Resistance, strategy40ResistanceReversal,
    mctrSupport, mctrSupportRev, mctrResistance, mctrResistanceRev,
    mctrSupportFoundAt, mctrResistanceFoundAt,
    strongSupport, strongResistance, strong2ndSupport, strong2ndResistance,
  ]);

  // Redraw lines whenever overlays or data change; auto-scale y-axis to show all lines
  useEffect(() => {
    redrawLines();
    try { chartRef.current?.priceScale('right').applyOptions({ autoScale: true }); } catch (_) {}
  }, [redrawLines]);

  // ── RAF loop: position HTML overlay labels over price lines ─────────────────
  useEffect(() => {
    let rafId;
    const loop = () => {
      const overlay = overlayRef.current;
      const series  = seriesRef.current;
      const chart   = chartRef.current;
      if (overlay && series && chart) {
        const labels = lineLabelDataRef.current;
        if (!labels.length) {
          overlay.innerHTML = '';
        } else {
          let html = '';
          for (const { price, color, title } of labels) {
            let y = null;
            try { y = series.priceToCoordinate(price); } catch (_) {}
            if (y == null) {
              try { y = chart.priceScale('right').priceToCoordinate(price); } catch (_) {}
            }
            if (y != null && y > 0) {
              html += `<div style="position:absolute;right:70px;top:${y - 10}px;color:${color};font-size:11px;font-weight:700;background:rgba(255,255,255,0.88);padding:1px 5px 1px 7px;border-radius:3px;border-right:3px solid ${color};pointer-events:none;white-space:nowrap;line-height:1.4">${title}</div>`;
            }
          }
          overlay.innerHTML = html;
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── Build chart once per symbol/date/mode ───────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !currentSymbol) return;

    let alive = true; // guard against post-dispose callbacks

    const chart = createChart(el, {
      width:  el.clientWidth  || 800,
      height: el.clientHeight || 500,
      layout: { background: { color: '#ffffff' }, textColor: '#333333' },
      grid:   { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });

    const ro = new ResizeObserver(() => {
      if (!alive) return;
      try { chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); } catch (_) {}
    });
    ro.observe(el);

    // Pre-market series (9:00–9:09) — muted gray candles
    const preSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#b0bec5', downColor: '#90a4ae',
      borderVisible: false,
      wickUpColor: '#b0bec5', wickDownColor: '#90a4ae',
    });

    // Main market series (9:15–15:30)
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    chartRef.current     = chart;
    seriesRef.current    = series;
    preSeriesRef.current = preSeries;
    plinesRef.current    = [];
    setStatus('loading');

    // ── OHLC hover tooltip via crosshair ─────────────────────────────────────
    chart.subscribeCrosshairMove(param => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = 'none'; return;
      }
      const d = param.seriesData.get(series) || param.seriesData.get(preSeries);
      if (!d) { tooltip.style.display = 'none'; return; }
      // Format time from epoch
      const dt = new Date(param.time * 1000);
      const hh = String(dt.getUTCHours()).padStart(2,'0');
      const mm = String(dt.getUTCMinutes()).padStart(2,'0');
      tooltip.innerHTML = `<b>${hh}:${mm}</b>&nbsp;&nbsp;O:${d.open?.toFixed(2)}&nbsp;&nbsp;H:${d.high?.toFixed(2)}&nbsp;&nbsp;L:${d.low?.toFixed(2)}&nbsp;&nbsp;C:${d.close?.toFixed(2)}`;
      const elC = containerRef.current;
      if (!elC) return;
      let left = param.point.x + 10;
      let top  = param.point.y - 32;
      if (left + 260 > elC.clientWidth) left = param.point.x - 270;
      if (top < 4) top = 4;
      tooltip.style.left    = `${left}px`;
      tooltip.style.top     = `${top}px`;
      tooltip.style.display = 'block';
    });

    // Use server's data date if available; fallback to system date
    const today = (currentDataDate && currentDataDate !== '--') ? currentDataDate : new Date().toISOString().split('T')[0];

    // ── Helper: apply IST-string candles (from saved _chart_spot.json files) ──
    const applyCandles = (data, dateStr) => {
      const parsed = parseCandles(data, dateStr);
      if (!parsed?.market?.length) { setStatus('nodata'); return false; }

      // Store full candles for historical tick-by-tick replay
      allMktRef.current = parsed.market;
      allPreRef.current = parsed.premarket;

      series.setData(parsed.market);
      if (parsed.premarket.length) preSeries.setData(parsed.premarket);

      if (parsed.premarket.length) {
        const lastPre = parsed.premarket[parsed.premarket.length - 1];
        try {
          preSeries.setMarkers([{
            time: lastPre.time, position: 'aboveBar',
            color: '#607d8b', shape: 'arrowDown', text: 'Premarket',
          }]);
        } catch (_) {}
      }
      if (parsed.openTs) {
        try {
          series.setMarkers([{
            time: parsed.openTs, position: 'belowBar',
            color: '#1976d2', shape: 'arrowUp', text: '9:15 Open',
          }]);
        } catch (_) {}
      }
      openTsRef.current = parsed.premarket.length
        ? parsed.premarket[parsed.premarket.length - 1].time
        : parsed.openTs ? parsed.openTs - 5 * 60 : null;

      attachVLine();
      setStatus('ready');
      try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch (_) {}
      // Historical saved files: fitContent spreads all bars left→right
      try {
        chart.timeScale().applyOptions({ rightOffset: 0 });
        chart.timeScale().fitContent();
        setTimeout(() => {
          try {
            const ts = chart.timeScale();
            const range = ts.getVisibleLogicalRange();
            if (range) ts.setVisibleLogicalRange({ from: range.from - 4, to: range.to });
          } catch (_) {}
        }, 80);
      } catch (_) {}
      return true;
    };

    // ── Helper: apply epoch candles (from Upstox API / WS RAM store) ─────────
    // candles: [{time(epoch, IST treated as UTC), open, high, low, close}]
    const applyEpochCandles = (candles, dateStr) => {
      if (!candles?.length) return false;
      // Compute market-hours epoch bounds for this date
      const dateEpoch = Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
      const mktOpen   = dateEpoch + MARKET_OPEN_MIN   * 60;
      const mktClose  = dateEpoch + MARKET_CLOSE_MIN  * 60;
      const preStart  = dateEpoch + PREMARKET_START_MIN * 60;
      const preEnd    = dateEpoch + PREMARKET_END_MIN   * 60;

      const market    = candles.filter(c => c.time >= mktOpen  && c.time <= mktClose);
      const premarket = candles.filter(c => c.time >= preStart && c.time <= preEnd);

      if (!market.length) { setStatus('nodata'); return false; }

      // Store full candles for historical tick-by-tick replay
      allMktRef.current = market;
      allPreRef.current = premarket;

      series.setData(market);
      if (premarket.length) {
        preSeries.setData(premarket);
        const lastPre = premarket[premarket.length - 1];
        try {
          preSeries.setMarkers([{
            time: lastPre.time, position: 'aboveBar',
            color: '#607d8b', shape: 'arrowDown', text: 'Premarket',
          }]);
        } catch (_) {}
      }
      const openTs = market[0].time;
      try {
        series.setMarkers([{
          time: openTs, position: 'belowBar',
          color: '#1976d2', shape: 'arrowUp', text: '9:15 Open',
        }]);
      } catch (_) {}

      openTsRef.current = premarket.length
        ? premarket[premarket.length - 1].time
        : openTs - tf * 60;

      attachVLine();
      setStatus('ready');
      try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch (_) {}
      // Anchor view to trading day: pre-market on left, full day visible.
      // This prevents WS series.update() from auto-scrolling to the right.
      try {
        chart.timeScale().applyOptions({ rightOffset: 3 });
        // Scale how many hours to show based on timeframe
        const viewHours = tf <= 1 ? 2.5 : tf <= 3 ? 4 : 7;
        const viewEnd   = Math.min(
          dateEpoch + MARKET_CLOSE_MIN * 60 + 5 * tf * 60,
          preStart + viewHours * 3600,
        );
        setTimeout(() => {
          try {
            chart.timeScale().setVisibleRange({
              from: preStart - 5 * tf * 60,   // a few bars before pre-market
              to:   viewEnd,
            });
          } catch (_) {}
        }, 80);
      } catch (_) {}
      return true;
    };

    // ── Shared: vline at 9:15 open ────────────────────────────────────────────
    function attachVLine() {
      const drawVLine = () => {
        const vl = vlineRef.current;
        if (!vl || !openTsRef.current || !alive) return;
        try {
          const x = chart.timeScale().timeToCoordinate(openTsRef.current);
          if (x == null || isNaN(x) || x <= 0) { vl.style.display = 'none'; return; }
          vl.style.left    = `${x}px`;
          vl.style.display = 'block';
        } catch (_) { vl.style.display = 'none'; }
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(drawVLine);
      chart.timeScale().subscribeVisibleTimeRangeChange(drawVLine);
      setTimeout(drawVLine, 50);
    }

    if (historicalMode) {
      // ── Historical: try Upstox historical API, fall back to saved files ────
      apiFetch(`/api/chart/historical/${currentSymbol}?tf=${tf}&from=${currentDataDate}&to=${currentDataDate}`)
        .then(data => {
          if (!alive) return;
          if (data?.candles?.length) {
            applyEpochCandles(data.candles, currentDataDate);
          } else {
            // Fall back to saved option chain snapshot data
            return apiFetch(`/api/splitchart/${currentSymbol}/${currentExpiry}/${currentDataDate}?tf=${tf}`)
              .then(d => { if (alive) applyCandles(d, currentDataDate); });
          }
        })
        .catch(() => {
          // Fall back to saved files on any error (token expired, old date not in Upstox, etc.)
          if (!alive) return;
          apiFetch(`/api/splitchart/${currentSymbol}/${currentExpiry}/${currentDataDate}?tf=${tf}`)
            .then(d => { if (alive) applyCandles(d, currentDataDate); })
            .catch(() => { if (alive) setStatus('error'); });
        });

    } else {
      // ── Live: seed from Upstox intraday API, then WebSocket tick updates ────
      // Use the option chain data date (not system date) so chart matches the loaded data

      // 1. Seed with intraday OHLC for the option chain's data date
      apiFetch(`/api/chart/historical/${currentSymbol}?tf=${tf}&from=${today}&to=${today}`)
        .then(data => {
          if (!alive) return;
          if (data?.candles?.length) {
            applyEpochCandles(data.candles, today);
          } else {
            // Try RAM candle store (built from WS ticks so far today)
            return apiFetch(`/api/chart/ws-candles/${currentSymbol}?tf=${tf}`)
              .then(d => {
                if (!alive) return;
                if (d?.candles?.length) {
                  applyEpochCandles(d.candles, today);
                } else {
                  // Last resort: saved splitchart files for this date
                  return apiFetch(`/api/splitchart/live/${currentSymbol}?tf=${tf}&date=${today}`)
                    .then(d2 => { if (alive) applyCandles(d2, today); });
                }
              });
          }
        })
        .catch(() => { if (alive) setStatus('error'); });

      // 2. Connect WebSocket for live tick updates (sub-second via Upstox WS ticks)
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/chart`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: currentSymbol, tf }));
      };

      ws.onmessage = (evt) => {
        if (!alive || !seriesRef.current) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'init' && msg.candles?.length) {
            // WS init: replace seed data with RAM store candles
            applyEpochCandles(msg.candles, today);
          } else if ((msg.type === 'candle' || msg.type === 'candle_close') && msg.candle) {
            const c = msg.candle;
            try {
              seriesRef.current.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
            } catch (_) {}
          }
        } catch (_) {}
      };

      ws.onerror = () => {};
      ws.onclose = () => {};
    }

    return () => {
      alive = false;
      clearInterval(pollRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }
      ro.disconnect();
      chartRef.current     = null;
      seriesRef.current    = null;
      preSeriesRef.current = null;
      plinesRef.current    = [];
      allMktRef.current    = [];
      allPreRef.current    = [];
      try { chart.remove(); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSymbol, currentExpiry, currentDataDate, historicalMode, tf]);

  // In historical mode, show only candles up to currentTime (tick-by-tick replay)
  useEffect(() => {
    if (!historicalMode || !currentTime || currentTime === '--' || !currentDataDate) return;
    if (!seriesRef.current || !preSeriesRef.current || !chartRef.current) return;
    if (!allMktRef.current.length) return;

    try {
      const timeStr = currentTime.substring(0, 5); // HH:MM
      const cutTs = toTs(currentDataDate, timeStr);

      const mktSlice = allMktRef.current.filter(c => c.time <= cutTs);
      const preSlice = allPreRef.current.filter(c => c.time <= cutTs);

      if (!mktSlice.length && !preSlice.length) return;

      seriesRef.current.setData(mktSlice.length ? mktSlice : []);
      preSeriesRef.current.setData(preSlice);

      // Re-apply markers after setData clears them
      if (preSlice.length) {
        const lastPre = preSlice[preSlice.length - 1];
        try { preSeriesRef.current.setMarkers([{ time: lastPre.time, position: 'aboveBar', color: '#607d8b', shape: 'arrowDown', text: 'Premarket' }]); } catch (_) {}
      }
      if (mktSlice.length) {
        try { seriesRef.current.setMarkers([{ time: mktSlice[0].time, position: 'belowBar', color: '#1976d2', shape: 'arrowUp', text: '9:15 Open' }]); } catch (_) {}
      }

      // Scroll viewport to show current candle at right edge
      const lastTs = mktSlice.length ? mktSlice[mktSlice.length - 1].time : preSlice[preSlice.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({ from: lastTs - 3600, to: lastTs + 300 });
    } catch (_) {}
  }, [historicalMode, currentTime, currentDataDate]);

  const btnClass = (active) => `sc-overlay-btn${active ? ' active' : ''}`;

  return (
    <div className="sc-root">
      {/* Toolbar */}
      <div className="sc-toolbar">
        <span className="sc-toolbar-title">
          {currentSymbol?.replace(/_/g, ' ')}
        </span>
        {/* Timeframe dropdown */}
        <select
          value={tf}
          onChange={e => setTf(Number(e.target.value))}
          className="sc-tf-select"
        >
          {[1, 3, 5, 15, 30].map(t => (
            <option key={t} value={t}>{t}m</option>
          ))}
        </select>
        {/* Line toggle buttons */}
        <button
          className={btnClass(showBromos)}
          style={{ '--btn-color': '#e53935' }}
          onClick={() => setShowBromos(v => !v)}
          title="Toggle Bromos levels"
        >Bromos</button>
        <button
          className={btnClass(showMCTR)}
          style={{ '--btn-color': '#9c27b0' }}
          onClick={() => setShowMCTR(v => !v)}
          title="Toggle MCTR levels"
        >MCTR</button>
        <button
          className={btnClass(showAI)}
          style={{ '--btn-color': '#ff6f00' }}
          onClick={() => setShowAI(v => !v)}
          title="Toggle AI levels (80%+ only)"
        >AI</button>
        <button
          className={btnClass(showStrong)}
          style={{ '--btn-color': '#6a1b9a' }}
          onClick={() => setShowStrong(v => !v)}
          title="Toggle Strong S/R (2+ metrics at 100%)"
        >S/R</button>
        {!historicalMode && status === 'ready' && (
          <button
            className="sc-live-btn"
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          >
            ▶ Live
          </button>
        )}
      </div>

      {/* Chart area */}
      <div className="sc-chart-area">
        {status === 'loading' && <div className="sc-state">Loading chart…</div>}
        {status === 'nodata'  && <div className="sc-state sc-state-warn">No candle data for this date</div>}
        {status === 'error'   && <div className="sc-state sc-state-err">Failed to load chart</div>}
        <div style={{ position: 'absolute', inset: 0 }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {/* HTML overlay for price-line labels */}
          <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }} />
          {/* OHLC hover tooltip */}
          <div ref={tooltipRef} style={{ display: 'none', position: 'absolute', zIndex: 20, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '5px', pointerEvents: 'none', whiteSpace: 'nowrap' }} />
          {/* Vertical separator: Pre-Market | Market */}
          <div ref={vlineRef} className="sc-vline" style={{ display: 'none' }}>
            <span className="sc-vline-pre">Pre-Market</span>
            <span className="sc-vline-mkt">Market Open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
