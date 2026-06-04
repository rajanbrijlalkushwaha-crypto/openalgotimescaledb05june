import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { fetchLiveCandles } from '../../services/api';

// Standalone chart — no modal, no height inheritance, just works
export default function ChartTest({ symbol = 'NIFTY' }) {
  const containerRef = useRef();
  const [info, setInfo] = useState('Loading…');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Explicit size — no autoSize, no height:100% problems
    const chart = createChart(el, {
      width: el.clientWidth || 800,
      height: 450,
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor:       '#26a69a',
      downColor:     '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    });

    fetchLiveCandles(symbol, 5)
      .then(data => {
        console.log('ChartTest raw data:', data);
        if (!data?.candles?.length) {
          setInfo('No candles returned from API');
          return;
        }
        const tradeDate = data.date;
        const candles = data.candles
          .map(c => ({
            time:  Math.floor(new Date(`${tradeDate}T${c.time}:00Z`).getTime() / 1000),
            open:  Number(c.open),
            high:  Number(c.high),
            low:   Number(c.low),
            close: Number(c.close),
          }))
          .sort((a, b) => a.time - b.time);

        console.log('ChartTest candles:', candles.length, candles[0]);
        series.setData(candles);
        chart.timeScale().fitContent();
        setInfo(`OK — ${candles.length} candles for ${tradeDate}`);
      })
      .catch(err => {
        console.error('ChartTest error:', err);
        setInfo(`Error: ${err.message}`);
      });

    return () => chart.remove();
  }, [symbol]);

  return (
    <div style={{ padding: '16px', background: '#fafafa', border: '1px solid #ddd', borderRadius: 6 }}>
      <div style={{ marginBottom: 8, fontSize: 13, color: '#555' }}>
        Chart Test — {symbol} — {info}
      </div>
      {/* Explicit height so chart always has space */}
      <div ref={containerRef} style={{ width: '100%', height: 450 }} />
    </div>
  );
}
