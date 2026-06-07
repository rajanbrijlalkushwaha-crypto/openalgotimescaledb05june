/**
 * socketioClient.js
 * Socket.IO singleton — one connection shared by all components.
 *
 * Matches the server (server.js) Socket.IO event protocol:
 *   Client → Server: 'subscribe' { symbol }, 'unsubscribe' { symbol }
 *   Server → Client: 'tick' { symbol, ... }
 *
 * Usage:
 *   import sioClient from './socketioClient';
 *   const unsub = sioClient.subscribe('NIFTY', (tick) => { ... });
 *   unsub(); // cleanup
 */

import { io } from 'socket.io-client';

// Always use the same origin — Nginx handles SSL and proxies to Node.js.
// Never connect directly to port 3001 (no SSL on Node.js).
const SIO_URL = process.env.REACT_APP_PIPELINE_URL || window.location.origin;

class SIOClient {
  constructor() {
    this.socket    = null;
    this.handlers  = new Map();  // symbol → Set<fn(tick)>
    this.connected = false;
    this._connCbs  = new Set();
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(SIO_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._connCbs.forEach(fn => fn(true));

      // Re-subscribe all active tick subscriptions after reconnect
      if (this.handlers.size > 0) {
        for (const symbol of this.handlers.keys()) {
          this.socket.emit('subscribe', { symbol });
        }
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this._connCbs.forEach(fn => fn(false));
    });

    // Route incoming ticks to registered handlers by symbol
    this.socket.on('tick', (tick) => {
      const sym = tick?.symbol || tick?.underlying;
      if (!sym) return;

      // Exact symbol match (e.g. an option contract)
      const exactSet = this.handlers.get(sym);
      if (exactSet) exactSet.forEach(fn => { try { fn(tick); } catch (_) {} });

      // Also route to underlying symbol handlers (e.g. 'NIFTY' gets spot ticks)
      if (tick?.underlying && tick.underlying !== sym) {
        const undSet = this.handlers.get(tick.underlying);
        if (undSet) undSet.forEach(fn => { try { fn(tick); } catch (_) {} });
      }
    });
  }

  /**
   * Subscribe to ticks for a symbol.
   * Returns an unsubscribe function.
   */
  subscribe(symbol, handler) {
    if (!this.handlers.has(symbol)) {
      this.handlers.set(symbol, new Set());
      if (this.socket?.connected) {
        this.socket.emit('subscribe', { symbol });
      }
    }
    this.handlers.get(symbol).add(handler);

    return () => {
      const set = this.handlers.get(symbol);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(symbol);
        if (this.socket?.connected) {
          this.socket.emit('unsubscribe', { symbol });
        }
      }
    };
  }

  onConnectionChange(fn) {
    this._connCbs.add(fn);
    return () => this._connCbs.delete(fn);
  }
}

const sioClient = new SIOClient();
sioClient.connect();

export default sioClient;
