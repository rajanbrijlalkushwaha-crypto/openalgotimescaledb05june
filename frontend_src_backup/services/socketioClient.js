/**
 * Socket.io singleton client for tick pipeline (port 5900)
 *
 * Usage:
 *   import sioClient from './socketioClient';
 *   const unsub = sioClient.subscribe('NIFTY', (tick) => { ... });
 *   unsub(); // cleanup
 */

import { io } from 'socket.io-client';

const SIO_URL =
  process.env.REACT_APP_PIPELINE_URL ||
  process.env.REACT_APP_API_URL?.replace('5800', '5900') ||
  'http://127.0.0.1:5900';

class SIOClient {
  constructor() {
    this.socket     = null;
    this.handlers   = new Map();   // symbol → Set<fn(tick)>
    this.connected  = false;
    this._connCbs   = new Set();
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(SIO_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._connCbs.forEach(fn => fn(true));
      // Re-subscribe all active symbols after reconnect
      if (this.handlers.size > 0) {
        this.socket.emit('subscribe', { symbols: [...this.handlers.keys()] });
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this._connCbs.forEach(fn => fn(false));
    });

    this.socket.on('tick', (tick) => {
      const sym = tick?.symbol;
      if (!sym) return;
      const set = this.handlers.get(sym);
      if (set) set.forEach(fn => { try { fn(tick); } catch (_) {} });
    });
  }

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
