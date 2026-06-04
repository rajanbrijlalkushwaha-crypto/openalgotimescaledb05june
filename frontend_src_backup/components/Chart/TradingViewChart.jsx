import React, { useEffect, useRef } from 'react';

// Parse date from various formats to YYYY-MM-DD
function parseDateToISO(dateStr) {
  if (!dateStr || dateStr === '--') return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

const SYMBOL_MAP = {
  'NIFTY': 'NSE:NIFTY',
  'NIFTY 50': 'NSE:NIFTY',
  'NIFTY50': 'NSE:NIFTY',
  'BANKNIFTY': 'NSE:BANKNIFTY',
  'BANK NIFTY': 'NSE:BANKNIFTY',
  'FINNIFTY': 'NSE:FINNIFTY',
  'FIN NIFTY': 'NSE:FINNIFTY',
  'SENSEX': 'BSE:SENSEX',
  'MIDCPNIFTY': 'NSE:MIDCPNIFTY',
  'MIDCAP NIFTY': 'NSE:MIDCPNIFTY',
  'INDIAVIX': 'NSE:INDIAVIX',
  'INDIA VIX': 'NSE:INDIAVIX',
};

const TradingViewChart = ({ symbol = 'BANKNIFTY', date = null }) => {
  const containerRef = useRef();
  const widgetRef = useRef();

  useEffect(() => {
    const cleanSymbol = String(symbol || '').trim().toUpperCase();
    const tvSymbol = SYMBOL_MAP[cleanSymbol] ||
      (cleanSymbol.includes(':') ? cleanSymbol : `NSE:${cleanSymbol}`);

    // Build date range — show only the target trading day
    const isoDate = parseDateToISO(date);
    let fromDate = null;
    let toDate = null;
    if (isoDate) {
      fromDate = isoDate;
      // toDate = next calendar day so the full session is included
      const d = new Date(`${isoDate}T00:00:00+05:30`);
      d.setDate(d.getDate() + 1);
      toDate = d.toISOString().slice(0, 10);
    }

    function initWidget() {
      if (!window.TradingView || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      const containerId = `tv-chart-${Date.now()}`;
      containerRef.current.id = containerId;

      const config = {
        container_id: containerId,
        symbol: tvSymbol,
        interval: '5',
        timezone: 'Asia/Kolkata',
        theme: 'light',
        style: '1',
        width: '100%',
        height: '100%',
        locale: 'in',
        toolbar_bg: '#f1f3f6',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies: ['Volume@tv-basicstudies'],
        autosize: true,
        loading_screen: { backgroundColor: '#ffffff', foregroundColor: '#2962FF' },
      };

      // Set visible date range for the specific trading day
      if (fromDate) config.from_date = fromDate;
      if (toDate)   config.to_date   = toDate;

      widgetRef.current = new window.TradingView.widget(config);
    }

    const TV_SRC = 'https://s3.tradingview.com/tv.js';
    if (!document.querySelector(`script[src="${TV_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = TV_SRC;
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else if (window.TradingView) {
      initWidget();
    } else {
      // Script tag exists but not yet loaded — wait
      const interval = setInterval(() => {
        if (window.TradingView) { clearInterval(interval); initWidget(); }
      }, 100);
    }

    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch (e) {}
        widgetRef.current = null;
      }
    };
  }, [symbol, date]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        background: '#f5f5f5',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    />
  );
};

export default TradingViewChart;
