const { createProxyMiddleware } = require('http-proxy-middleware');

// ── Suppress harmless proxy socket errors ────────────────────────────────────
// When the backend is unavailable or resets a WebSocket connection, the
// underlying net.Socket emits 'error' with no listener, which would crash
// the webpack-dev-server process.  Swallow only known-harmless codes here.
process.on('uncaughtException', (err) => {
  const safe = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ERR_STREAM_WRITE_AFTER_END'];
  if (safe.includes(err.code)) return; // backend unavailable — ignore
  throw err; // re-throw anything unexpected
});

module.exports = function(app) {
  const onError = (err, req, res) => {
    // HTTP proxy errors — send 502 instead of crashing
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable', code: err.code }));
    }
  };

  // HTTP API proxy
  app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
    logLevel: 'silent',
    on: { error: onError },
  }));

  // WebSocket proxy — only /ws/chart (our backend WS).
  // Do NOT proxy /ws — that path belongs to webpack HMR.
  app.use('/ws/chart', createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    on: { error: onError },
  }));

  // Socket.IO proxy — for live option chain tick-by-tick
  app.use('/socket.io', createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    on: { error: onError },
  }));
};
