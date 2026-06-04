/**
 * Singleton WebSocket client — one persistent connection shared by all components.
 *
 * Works with Vercel frontend + separate backend by reading REACT_APP_WS_URL
 * or deriving wss:// from REACT_APP_API_URL.
 *
 * Usage:
 *   import wsClient from './wsClient';
 *   const unsub = wsClient.subscribe('NIFTY', ({ type, symbol, data }) => { ... });
 *   unsub(); // when done
 */

const WS_BASE = (() => {
  if (process.env.REACT_APP_WS_URL) return process.env.REACT_APP_WS_URL;
  const api = process.env.REACT_APP_API_URL;
  if (api) return api.replace(/^http/, 'ws');
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
})();

const WS_URL        = `${WS_BASE}/ws`;
const PING_MS       = 25_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS  = 30_000;

class WSClient {
  constructor() {
    this.ws           = null;
    this.handlers     = new Map(); // symbol → Set<fn>
    this.subscribed   = new Set(); // symbols subscribed on backend
    this.connected    = false;
    this._retryN      = 0;
    this._pingTimer   = null;
    this._retryTimer  = null;
    this._connCbs     = new Set(); // (isConnected: bool) → void
  }

  /** Subscribe handler to a symbol. Returns cleanup unsubscribe function. */
  subscribe(symbol, handler) {
    if (!this.handlers.has(symbol)) this.handlers.set(symbol, new Set());
    this.handlers.get(symbol).add(handler);

    if (!this.subscribed.has(symbol)) {
      this.subscribed.add(symbol);
      this._send({ action: 'subscribe', symbol });
    }

    return () => this._removeHandler(symbol, handler);
  }

  _removeHandler(symbol, handler) {
    const set = this.handlers.get(symbol);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(symbol);
      this.subscribed.delete(symbol);
      this._send({ action: 'unsubscribe', symbol });
    }
  }

  /** Get notified when connection state changes. Returns cleanup fn. */
  onConnectionChange(fn) {
    this._connCbs.add(fn);
    return () => this._connCbs.delete(fn);
  }

  _notifyConn() {
    for (const fn of this._connCbs) fn(this.connected);
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this._retryN   = 0;
      this._notifyConn();

      // Re-subscribe all active symbols after reconnect
      for (const sym of this.subscribed) {
        this.ws.send(JSON.stringify({ action: 'subscribe', symbol: sym }));
      }

      clearInterval(this._pingTimer);
      this._pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, PING_MS);
    };

    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      const { type, symbol, data } = msg;
      if (type === 'pong' || !symbol) return;

      const handlers = this.handlers.get(symbol);
      if (!handlers?.size) return;
      for (const h of handlers) {
        try { h({ type, symbol, data }); } catch (_) {}
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this._pingTimer);
      this._notifyConn();

      const delay = Math.min(RETRY_BASE_MS * (2 ** this._retryN), RETRY_MAX_MS);
      this._retryN++;
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => this.connect(), delay);
    };

    this.ws.onerror = () => {}; // onclose fires after — retry handled there
  }
}

const wsClient = new WSClient();
// WebSocket disabled — REST API only
// wsClient.connect();

export default wsClient;
