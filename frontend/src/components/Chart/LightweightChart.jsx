import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { fetchLiveCandles, fetchHistoricalCandles } from '../../services/api';


const POLL_MS = 10000; // fallback poll interval when WebSocket is unavailable

function parseCandles(data, fallbackDate, cutoffTime) {
  if (!data?.candles?.length) return null;

  // Fast path: candles already have epoch-second times (from _chart_upstox.json)
  if (data.isEpoch) {
    if (!cutoffTime) return data.candles;
    const cutHHMM = cutoffTime.substring(0, 5);
    return data.candles.filter(c => {
      const d = new Date(c.time * 1000);
      const hhmm = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
      return hhmm <= cutHHMM;
    });
  }

  // Slow path: candles have HH:MM string times (from gz snapshot scan)
  const tradeDate = data.date || fallbackDate;
  const cutoffHHMM = cutoffTime ? cutoffTime.substring(0, 5) : null;
  return data.candles
    .filter(c => !cutoffHHMM || c.time <= cutoffHHMM)
    .map(c => ({
      time:  Math.floor(new Date(`${tradeDate}T${c.time}:00Z`).getTime() / 1000),
      open:  Number(c.open),
      high:  Number(c.high),
      low:   Number(c.low),
      close: Number(c.close),
    }))
    .sort((a, b) => a.time - b.time);
}

export default function LightweightChart({ symbol, expiry, date, historicalMode, cutoffTime }) {
  const containerRef = useRef();
  const chartRef     = useRef();
  const seriesRef    = useRef();
  const pollRef      = useRef();
  const wsRef        = useRef();
  const [status, setStatus]     = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !symbol) return;

    // Use explicit dimensions (same pattern as ChartTest that works)
    const chart = createChart(el, {
      width:  el.clientWidth  || 800,
      height: el.clientHeight || 500,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Resize chart when container resizes
    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({
          width:  el.clientWidth,
          height: el.clientHeight,
        });
      }
    });
    ro.observe(el);

    const series = chart.addSeries(CandlestickSeries, {
      upColor:       '#26a69a',
      downColor:     '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Fetch initial data
    setStatus('loading');
    const request = historicalMode
      ? fetchHistoricalCandles(symbol, expiry, date, 5)
      : fetchLiveCandles(symbol, 5);

    request
      .then(data => {
        const candles = parseCandles(data, date, cutoffTime);
        if (!candles) {
          setStatus('error');
          setErrorMsg('No candle data for this date');
          return;
        }
        series.setData(candles);
        chart.timeScale().fitContent();
        setStatus('ready');

        if (!historicalMode) {
          // Connect WebSocket for tick-by-tick live updates
          const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const ws = new WebSocket(`${proto}://${window.location.host}/ws/chart`);
          wsRef.current = ws;
          let wsConnected = false;

          ws.onopen = () => {
            wsConnected = true;
            ws.send(JSON.stringify({ type: 'subscribe', symbol: symbol.toUpperCase(), tf: 5 }));
          };

          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (!seriesRef.current) return;
              if (msg.type === 'init' && Array.isArray(msg.candles)) {
                // Full candle set on subscribe — already epoch seconds format
                if (msg.candles.length) {
                  seriesRef.current.setData(msg.candles);
                  chartRef.current?.timeScale().fitContent();
                }
              } else if ((msg.type === 'candle' || msg.type === 'candle_close') && msg.candle) {
                // Tick-by-tick update — already epoch seconds format
                seriesRef.current.update(msg.candle);
              }
            } catch (_) {}
          };

          ws.onerror = () => { wsConnected = false; };

          ws.onclose = () => {
            wsConnected = false;
            // Fall back to polling if WebSocket disconnects
            if (!pollRef.current) {
              pollRef.current = setInterval(() => {
                fetchLiveCandles(symbol, 5)
                  .then(d => {
                    const updated = parseCandles(d, date);
                    if (updated?.length && seriesRef.current) {
                      seriesRef.current.update(updated[updated.length - 1]);
                    }
                  })
                  .catch(() => {});
              }, POLL_MS);
            }
          };

          // Start fallback poll after 5s if WebSocket never connected
          setTimeout(() => {
            if (!wsConnected && !pollRef.current) {
              pollRef.current = setInterval(() => {
                fetchLiveCandles(symbol, 5)
                  .then(d => {
                    const updated = parseCandles(d, date);
                    if (updated?.length && seriesRef.current) {
                      seriesRef.current.update(updated[updated.length - 1]);
                    }
                  })
                  .catch(() => {});
              }, POLL_MS);
            }
          }, 5000);
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg('Failed to load chart data');
      });

    return () => {
      clearInterval(pollRef.current);
      pollRef.current = null;
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent fallback poll on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, expiry, date, historicalMode, cutoffTime]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {status === 'loading' && (
        <div className="chart-overlay">Loading chart…</div>
      )}
      {status === 'error' && (
        <div className="chart-overlay chart-overlay-error">{errorMsg}</div>
      )}
      {status === 'ready' && !historicalMode && (
        <button
          className="chart-realtime-btn"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
        >
          ▶ Live
        </button>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
