import WebSocket from 'ws';
import { config } from './config.ts';
import { getCachedSetting, queryOne, pool } from './db.ts';
import { CURATED_DERIV_INSTRUMENTS } from './catalog.ts';

export interface TickData {
  symbol: string;
  quote: number;
  bid: number;
  ask: number;
  epoch: number;
  pipSize: number;
  source?: 'deriv_ws' | 'cached';
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface DetailedCandleResult {
  candles: CandleData[];
  source: 'deriv_ws' | 'unavailable';
  error?: string;
  lastUpdated: number | null;
}

type TickListener = (tick: TickData) => void;
type UserEventListener = (userId: number, event: string, payload: unknown) => void;

export function getActiveDerivAppId(): string {
  const globalSettings = getCachedSetting<{ derivAppId?: string }>('global', {});
  return (globalSettings.derivAppId || config.derivAppId || '1089').trim();
}

export class DerivWebSocketClient {
  private ws: WebSocket | null = null;
  private reqIdCounter = 1;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private lastWorkingEndpoint: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectingPromise: Promise<WebSocket> | null = null;
  private isConnected = false;
  private lastDerivTickAt: number | null = null;
  private lastError = '';
  private reconnectAttempts = 0;

  private tickListeners = new Set<TickListener>();
  private userEventListeners = new Set<UserEventListener>();
  private subscribedSymbols = new Set<string>([
    '1HZ100V',
    '1HZ15V',
    '1HZ10V',
    '1HZ25V',
    '1HZ75V',
    'R_100',
    'R_50',
    'frxEURUSD',
    'frxXAUUSD',
    'cryBTCUSD',
  ]);
  private latestTicks = new Map<string, TickData>();
  private tickHistoryBuffers = new Map<string, number[]>();

  constructor() {
    this.seedInitialPricesFromCatalog();
  }

  private seedInitialPricesFromCatalog(): void {
    const nowEpoch = Math.floor(Date.now() / 1000);
    for (const inst of CURATED_DERIV_INSTRUMENTS) {
      const pip = inst.pip_size;
      const spread = inst.spread;
      const quote = inst.base_price;
      this.latestTicks.set(inst.symbol, {
        symbol: inst.symbol,
        quote,
        bid: Number((quote - spread / 2).toFixed(pip < 0.001 ? 5 : 2)),
        ask: Number((quote + spread / 2).toFixed(pip < 0.001 ? 5 : 2)),
        epoch: nowEpoch,
        pipSize: pip,
        source: 'cached',
      });
    }
  }

  public getDiagnostics() {
    return {
      connected: this.isConnected,
      endpoint: this.lastWorkingEndpoint || config.derivWsUrl,
      subscribedSymbols: this.subscribedSymbols.size,
      trackedPrices: this.latestTicks.size,
      lastDerivTickAt: this.lastDerivTickAt,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError || null,
    };
  }

  public onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  public onUserEvent(listener: UserEventListener): () => void {
    this.userEventListeners.add(listener);
    return () => this.userEventListeners.delete(listener);
  }

  public emitUserEvent(userId: number, event: string, payload: unknown): void {
    for (const fn of this.userEventListeners) {
      try {
        fn(userId, event, payload);
      } catch {
        // ignore listener failure
      }
    }
  }

  private broadcastTick(tick: TickData): void {
    this.latestTicks.set(tick.symbol, tick);
    if (tick.source === 'deriv_ws') {
      this.lastDerivTickAt = Date.now();
    }
    const buf = this.tickHistoryBuffers.get(tick.symbol) || [];
    buf.push(tick.quote);
    if (buf.length > 300) buf.shift();
    this.tickHistoryBuffers.set(tick.symbol, buf);

    for (const fn of this.tickListeners) {
      try {
        fn(tick);
      } catch {
        // ignore listener failure
      }
    }
  }

  public getLatestTick(symbol: string): TickData | undefined {
    return this.latestTicks.get(symbol);
  }

  public getAllLatestTicks(): Record<string, TickData> {
    const out: Record<string, TickData> = {};
    for (const [sym, data] of this.latestTicks.entries()) {
      out[sym] = data;
    }
    return out;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delayMs = Math.min(30000, 2000 * Math.pow(1.5, Math.min(6, this.reconnectAttempts)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      this.connectCluster().catch(() => {
        this.scheduleReconnect();
      });
    }, delayMs);
  }

  public startMarketFeed(): void {
    this.connectCluster().catch((err) => {
      this.lastError = err instanceof Error ? err.message : 'Deriv WS initial connect failed';
      this.scheduleReconnect();
    });
  }

  public async ensureSymbolSubscribed(symbol: string): Promise<void> {
    if (!symbol) return;
    const isNew = !this.subscribedSymbols.has(symbol);
    this.subscribedSymbols.add(symbol);
    if (!this.latestTicks.has(symbol)) {
      let row: { pip_size: number; spread: number } | null = null;
      let cache: { price: number } | null = null;
      if (pool) {
        try {
          row = await queryOne<{ pip_size: number; spread: number }>(
            'SELECT pip_size, spread FROM market_instruments WHERE symbol = $1',
            [symbol]
          );
          cache = await queryOne<{ price: number }>(
            'SELECT price FROM market_data_cache WHERE symbol = $1',
            [symbol]
          );
        } catch {
          // ignore if DB waking up
        }
      }
      if (cache?.price) {
        const pip = row?.pip_size || 0.01;
        const spread = row?.spread || 0.2;
        this.latestTicks.set(symbol, {
          symbol,
          quote: cache.price,
          bid: cache.price - spread / 2,
          ask: cache.price + spread / 2,
          epoch: Math.floor(Date.now() / 1000),
          pipSize: pip,
          source: 'cached',
        });
      }
    }
    if (isNew && this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  }

  private async connectCluster(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    const appId = getActiveDerivAppId();
    const endpoints = this.lastWorkingEndpoint
      ? [this.lastWorkingEndpoint, ...config.derivWsClusters.filter((e) => e !== this.lastWorkingEndpoint)]
      : config.derivWsClusters;

    this.connectingPromise = (async () => {
      const attempts = endpoints.map(
        (base) =>
          new Promise<{ ws: WebSocket; url: string }>((resolve, reject) => {
            const url = `${base}?app_id=${encodeURIComponent(appId)}&l=EN&brand=deriv`;
            const socket = new WebSocket(url);
            const timeout = setTimeout(() => {
              try {
                socket.terminate();
              } catch {
                // ignore
              }
              reject(new Error(`Timeout connecting to ${base}`));
            }, 5000);

            socket.once('open', () => {
              clearTimeout(timeout);
              resolve({ ws: socket, url: base });
            });
            socket.once('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          })
      );

      try {
        const winner = await Promise.any(attempts);
        this.lastWorkingEndpoint = winner.url;
        this.ws = winner.ws;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastError = '';

        winner.ws.on('message', (raw) => {
          try {
            const data = JSON.parse(raw.toString());
            if (data.req_id && this.pending.has(data.req_id)) {
              const handler = this.pending.get(data.req_id)!;
              clearTimeout(handler.timer);
              this.pending.delete(data.req_id);
              if (data.error) {
                handler.reject(new Error(data.error.message || 'Deriv API error'));
              } else {
                handler.resolve(data);
              }
            }
            if (data.msg_type === 'tick' && data.tick) {
              const t = data.tick;
              const pip = Number(t.pip_size || 0.01);
              const quote = Number(t.quote);
              const bid = t.bid ? Number(t.bid) : quote;
              const ask = t.ask ? Number(t.ask) : quote;
              this.broadcastTick({
                symbol: t.symbol,
                quote,
                bid,
                ask,
                epoch: Number(t.epoch || Math.floor(Date.now() / 1000)),
                pipSize: pip,
                source: 'deriv_ws',
              });
            }
          } catch {
            // ignore malformed JSON
          }
        });

        winner.ws.on('close', () => {
          this.isConnected = false;
          this.ws = null;
          if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          }
          this.scheduleReconnect();
        });

        winner.ws.on('error', (err) => {
          this.isConnected = false;
          this.lastError = err instanceof Error ? err.message : 'Deriv WS error';
        });

        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);

        for (const sym of this.subscribedSymbols) {
          winner.ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
        }

        return winner.ws;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : 'Unable to reach Deriv WebSocket cluster';
        throw err;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  public async request<T = any>(payload: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
    const ws = await this.connectCluster();
    const reqId = this.reqIdCounter++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Deriv request timed out'));
      }, timeoutMs);

      this.pending.set(reqId, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...payload, req_id: reqId }));
    });
  }

  public async requestWithToken<T = any>(
    token: string,
    payload: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<T> {
    const appId = getActiveDerivAppId();
    const base = this.lastWorkingEndpoint || config.derivWsUrl;
    const url = `${base}?app_id=${encodeURIComponent(appId)}&l=EN&brand=deriv`;

    return new Promise<T>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        try {
          socket.terminate();
        } catch {
          // ignore
        }
        reject(new Error('Deriv authorized session timed out'));
      }, timeoutMs);

      let authorized = false;

      socket.on('open', () => {
        socket.send(JSON.stringify({ authorize: token, req_id: 1 }));
      });

      socket.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          if (!authorized && data.req_id === 1) {
            if (data.error) {
              clearTimeout(timer);
              socket.close();
              reject(new Error(data.error.message || 'Deriv token authorization failed'));
              return;
            }
            authorized = true;
            socket.send(JSON.stringify({ ...payload, req_id: 2 }));
            return;
          }
          if (authorized && data.req_id === 2) {
            clearTimeout(timer);
            socket.close();
            if (data.error) {
              reject(new Error(data.error.message || 'Deriv API call rejected'));
            } else {
              resolve(data as T);
            }
          }
        } catch (err) {
          clearTimeout(timer);
          socket.close();
          reject(err instanceof Error ? err : new Error('Failed to parse Deriv response'));
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('Deriv socket error'));
      });
    });
  }

  public async fetchTickHistory(symbol: string, count = 25): Promise<number[]> {
    await this.ensureSymbolSubscribed(symbol);
    try {
      const resp = await this.request<{ history?: { prices?: Array<string | number> } }>(
        {
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: 'latest',
          style: 'ticks',
        },
        6000
      );
      if (resp?.history?.prices && resp.history.prices.length > 0) {
        const prices = resp.history.prices.map((p) => Number(p));
        this.tickHistoryBuffers.set(symbol, prices);
        return prices;
      }
    } catch {
      // Return genuine recorded ticks in buffer rather than fabricating random ticks
    }

    const buf = this.tickHistoryBuffers.get(symbol) || [];
    return buf.slice(-count);
  }

  public async fetchCandlesDetailed(symbol: string, granularity = 60, count = 120): Promise<DetailedCandleResult> {
    await this.ensureSymbolSubscribed(symbol);
    try {
      const resp = await this.request<{
        candles?: Array<{ epoch: number; open: number; high: number; low: number; close: number }>;
      }>(
        {
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: 'latest',
          style: 'candles',
          granularity,
        },
        7000
      );
      if (resp?.candles && resp.candles.length > 0) {
        const candles = resp.candles.map((c) => ({
          time: Number(c.epoch),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        return {
          candles,
          source: 'deriv_ws',
          lastUpdated: Date.now(),
        };
      }
      return {
        candles: [],
        source: 'unavailable',
        error: 'Deriv returned no candles for this symbol and timeframe.',
        lastUpdated: null,
      };
    } catch (err) {
      return {
        candles: [],
        source: 'unavailable',
        error: err instanceof Error ? err.message : 'Unable to reach Deriv historical candles API',
        lastUpdated: null,
      };
    }
  }

  public async fetchCandles(symbol: string, granularity = 60, count = 120): Promise<CandleData[]> {
    const detailed = await this.fetchCandlesDetailed(symbol, granularity, count);
    return detailed.candles;
  }

  public async getContractsFor(symbol: string, currency = 'USD'): Promise<any> {
    return this.request(
      {
        contracts_for: symbol,
        currency,
        product_type: 'basic',
      },
      6000
    );
  }

  public async getProposal(payload: Record<string, unknown>, token?: string | null): Promise<any> {
    const req = { proposal: 1, ...payload };
    if (token && !token.startsWith('ory_at_')) {
      return this.requestWithToken(token, req, 7000);
    }
    return this.request(req, 6000);
  }

  public async getTradingTimes(dateStr = 'today'): Promise<any> {
    return this.request(
      {
        trading_times: dateStr,
      },
      7000
    );
  }
}

export class OtpDerivClient {
  public static async requestOnOtpUrl<T = any>(
    otpWsUrl: string,
    payload: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = new WebSocket(otpWsUrl);
      const timer = setTimeout(() => {
        try {
          socket.terminate();
        } catch {
          // ignore
        }
        reject(new Error('OTP WebSocket request timed out'));
      }, timeoutMs);

      socket.on('open', () => {
        socket.send(JSON.stringify({ ...payload, req_id: 101 }));
      });

      socket.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          if (data.req_id === 101) {
            clearTimeout(timer);
            socket.close();
            if (data.error) {
              reject(new Error(data.error.message || 'Deriv OTP execution failed'));
            } else {
              resolve(data as T);
            }
          }
        } catch (err) {
          clearTimeout(timer);
          socket.close();
          reject(err instanceof Error ? err : new Error('Invalid OTP response'));
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('OTP WebSocket error'));
      });
    });
  }
}

export async function derivRestRequest<T = any>(
  path: string,
  token: string,
  options: { method?: string; body?: Record<string, unknown> } = {}
): Promise<T> {
  const url = `${config.derivApiBase}${path}`;
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Deriv REST ${path} (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as T;
}

export const derivWs = new DerivWebSocketClient();
