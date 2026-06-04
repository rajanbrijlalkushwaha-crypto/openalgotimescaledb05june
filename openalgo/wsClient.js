const { WebSocket } = require('ws');

class OpenAlgoWSClient {
  constructor(url, apiKey, onTick, onAuth) {
    this.url = url;
    this.apiKey = apiKey;
    this.onTick = onTick;
    this.onAuth = onAuth || null;
    this.ws = null;
    this.isConnected = false;
    this.authenticated = false;
    this.pendingSubs = [];
    this._reconnectTimer = null;
    this.RECONNECT_DELAY = 5000;
  }

  connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.terminate(); } catch (_) {}
    }

    console.log(`[OpenAlgo WS] Connecting → ${this.url}`);
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[OpenAlgo WS] Connected, authenticating...');
      this.isConnected = true;
      this.ws.send(JSON.stringify({ action: 'authenticate', api_key: this.apiKey }));
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Handle auth response — OpenAlgo sends: {"type":"auth","status":"success",...}
      if (msg.type === 'auth' && msg.status === 'success') {
        console.log(`[OpenAlgo WS] Authenticated (broker: ${msg.broker || 'unknown'})`);
        this.authenticated = true;
        for (const sub of this.pendingSubs) this._send(sub);
        this.pendingSubs = [];
        if (this.onAuth) this.onAuth();
        return;
      }

      // Also handle legacy formats
      if (!this.authenticated && (msg.status === 'authenticated' || msg.authenticated === true)) {
        console.log('[OpenAlgo WS] Authenticated (legacy format)');
        this.authenticated = true;
        for (const sub of this.pendingSubs) this._send(sub);
        this.pendingSubs = [];
        if (this.onAuth) this.onAuth();
        return;
      }

      if (msg.type === 'auth' && msg.status !== 'success') {
        console.error('[OpenAlgo WS] Auth failed:', msg.message);
        return;
      }

      // Handle market data tick
      if (msg.type === 'market_data' && msg.data) {
        const [symbol, exchange] = (msg.topic || '').split('.');
        this.onTick({
          symbol:    symbol     || msg.data.symbol    || '',
          exchange:  exchange   || msg.data.exchange  || '',
          ltp:       msg.data.ltp       ?? null,
          bid:       msg.data.bid       ?? null,
          ask:       msg.data.ask       ?? null,
          open:      msg.data.open      ?? null,
          high:      msg.data.high      ?? null,
          low:       msg.data.low       ?? null,
          close:     msg.data.close     ?? null,
          volume:    msg.data.volume    ?? null,
          oi:        msg.data.oi        ?? null,
          timestamp: msg.data.timestamp ?? Date.now(),
        });
      }
    });

    // OpenAlgo sends ping every 30s — respond with pong
    this.ws.on('ping', (data) => {
      try { this.ws.pong(data); } catch (_) {}
    });

    this.ws.on('close', (code) => {
      console.log(`[OpenAlgo WS] Closed (${code}). Retry in ${this.RECONNECT_DELAY}ms...`);
      this.isConnected = false;
      this.authenticated = false;
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[OpenAlgo WS] Error:', err.message);
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this.RECONNECT_DELAY);
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribe(symbol, exchange, mode = 2) {
    const payload = { action: 'subscribe', symbol, exchange, mode };
    if (!this.authenticated) {
      this.pendingSubs.push(payload);
    } else {
      this._send(payload);
    }
  }

  unsubscribe(symbol, exchange) {
    this._send({ action: 'unsubscribe', symbol, exchange });
  }
}

module.exports = OpenAlgoWSClient;
