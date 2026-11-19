import { BinanceEnvironment } from '../types';
import { injectWebSocketPrices } from './binanceApi';

export type WebSocketStreamStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED';

export interface PriceStreamCallbacks {
  onPriceBatch: (prices: Record<string, number>) => void;
  onStatusChange?: (status: WebSocketStreamStatus) => void;
}

/**
 * Ultra-low-latency Binance USDⓈ-M Futures WebSocket Price Stream (!miniTicker@arr).
 * Buffers incoming ticks and flushes throttled batches (default 300ms) to avoid React re-render flooding,
 * with automatic exponential backoff reconnection and clean teardown.
 */
export class BinanceFuturesPriceStream {
  private ws: WebSocket | null = null;
  private status: WebSocketStreamStatus = 'DISCONNECTED';
  private shouldRun = false;
  private currentEnv: BinanceEnvironment = 'MAINNET';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPrices: Record<string, number> = {};
  private latestPrices: Record<string, number> = {};
  private callbacks: PriceStreamCallbacks;
  private flushIntervalMs: number;

  constructor(callbacks: PriceStreamCallbacks, flushIntervalMs: number = 300) {
    this.callbacks = callbacks;
    this.flushIntervalMs = Math.max(100, flushIntervalMs);
  }

  public getStatus(): WebSocketStreamStatus {
    return this.status;
  }

  public getLatestPrices(): Record<string, number> {
    return { ...this.latestPrices };
  }

  private setStatus(next: WebSocketStreamStatus): void {
    if (this.status !== next) {
      this.status = next;
      this.callbacks.onStatusChange?.(next);
    }
  }

  private resolveWsUrl(env: BinanceEnvironment): string {
    if (env === 'TESTNET') {
      return 'wss://stream.binancefuture.com/stream?streams=!miniTicker@arr';
    }
    return 'wss://fstream.binance.com/stream?streams=!miniTicker@arr';
  }

  public start(env: BinanceEnvironment = 'MAINNET'): void {
    if (typeof WebSocket === 'undefined') {
      this.setStatus('DISCONNECTED');
      return;
    }

    if (this.shouldRun && this.currentEnv === env && (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.stop();
    this.shouldRun = true;
    this.currentEnv = env;
    this.reconnectAttempts = 0;
    this.connect();
  }

  public stop(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }
    this.pendingPrices = {};
    this.setStatus('DISCONNECTED');
  }

  private connect(): void {
    if (!this.shouldRun || typeof WebSocket === 'undefined') return;

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');
    const url = this.resolveWsUrl(this.currentEnv);

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        if (!this.shouldRun) {
          socket.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
      };

      socket.onmessage = (event) => {
        if (!this.shouldRun || !event?.data) return;
        try {
          const parsed = JSON.parse(String(event.data));
          const items = Array.isArray(parsed?.data)
            ? parsed.data
            : Array.isArray(parsed)
            ? parsed
            : null;
          if (!items) return;

          let hasUpdates = false;
          for (let i = 0; i < items.length; i++) {
            const tick = items[i];
            const sym = tick?.s;
            const closePrice = parseFloat(tick?.c);
            if (typeof sym === 'string' && Number.isFinite(closePrice) && closePrice > 0) {
              this.pendingPrices[sym] = closePrice;
              this.latestPrices[sym] = closePrice;
              hasUpdates = true;
            }
          }

          if (hasUpdates && !this.flushTimer) {
            this.flushTimer = setTimeout(() => {
              this.flushTimer = null;
              const batch = this.pendingPrices;
              this.pendingPrices = {};
              if (Object.keys(batch).length > 0) {
                injectWebSocketPrices(batch);
                this.callbacks.onPriceBatch(batch);
              }
            }, this.flushIntervalMs);
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        // Close will trigger exponential reconnect
      };

      socket.onclose = () => {
        this.ws = null;
        if (!this.shouldRun) {
          this.setStatus('DISCONNECTED');
          return;
        }
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectAttempts += 1;
    const delayMs = Math.min(20_000, 1500 * Math.pow(2, Math.min(4, this.reconnectAttempts - 1)));
    this.setStatus('RECONNECTING');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }
}
