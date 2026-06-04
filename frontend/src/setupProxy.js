const { createProxyMiddleware } = require('http-proxy-middleware');

process.on('uncaughtException', (err) => {
  const safe = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ERR_STREAM_WRITE_AFTER_END'];
  if (safe.includes(err.code)) return;
  throw err;
});

module.exports = function(app) {
  const onError = (err, req, res) => {
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    }
  };

  // Proxy all /api calls to soctickdata server on port 3001
  app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    logLevel: 'silent',
    on: { error: onError },
  }));

  // WebSocket proxy → soctickdata WS server
  app.use('/ws', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    on: { error: onError },
  }));
};
