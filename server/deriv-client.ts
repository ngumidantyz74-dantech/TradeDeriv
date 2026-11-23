import WebSocket from 'ws';
import { config } from './config.ts';
import { getCachedSetting, queryOne, pool } from './db.ts';
import { CURATED_DERIV_INSTRUMENTS, EXCHANGE_PAIRS_CATALOG } from './catalog.ts';

export interface TickData {
  symbol: string;
  quote: number;
  bid: number;
  ask: number;
  epoch: number;
  pipSize: number;
  source?: 'deriv_ws' | 'live_pulse' | 'cached';
}

export interface LiveExchangePair {
  pair: string;
  base: string;
  quote: string;
  price: number;
  change24h: number;
  volume24hM: number;
  color: string;
  sparkline: number[];
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
type ExchangeTickListener = (pairs: LiveExchangePair[]) => void;
type UserEventListener = (userId: number, event: string, payload: unknown) => void;

export function getActiveDerivAppId(): string {
  const isValidAppId = (val: string) => /^[A-Za-z0-9_-]{2,64}$/.test(val);
  const globalSettings = getCachedSetting<{ derivAppId?: string }>('global', {});
  const commSettings = getCachedSetting<{ derivAppId?: string }>('commissions', {});
  const candidates = [
    String(globalSettings.derivAppId || '').trim(),
    String(commSettings.derivAppId || '').trim(),
    String(config.derivAppId || '').trim(),
  ].filter(isValidAppId);

  const nonDefault = candidates.find((c) => c !== '1089');
  if (nonDefault) return nonDefault;
  return candidates[0] || '1089';
}

export function getWsFeedAppId(): string {
  const active = getActiveDerivAppId();
  if (/^\d+$/.test(active)) return active;
  const envWs = String(process.env.DERIV_WS_APP_ID || '').trim();
  if (/^\d+$/.test(envWs)) return envWs;
  return '1089';
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
  private exchangeTickListeners = new Set<ExchangeTickListener>();
  private userEventListeners = new Set<UserEventListener>();
  private subscribedSymbols = new Set<string>([
    '1HZ100V',
    '1HZ15V',
    '1HZ10V',
    '1HZ25V',
    '1HZ50V',
    '1HZ75V',
    'R_100',
    'R_75',
    'R_50',
    'R_25',
    'R_10',
    'BOOM1000',
    'CRASH1000',
    'frxEURUSD',
    'frxGBPUSD',
    'frxXAUUSD',
    'cryBTCUSD',
    'cryETHUSD',
    'OTC_NDX',
  ]);
  private activeStreamSymbols = new Set<string>();
  private marketClosedSymbols = new Map<string, string>();
  private quoteKeepaliveTimer: NodeJS.Timeout | null = null;
  private microTickTimer: NodeJS.Timeout | null = null;
  private lastOpenOrderSyncAt = 0;
  private latestTicks = new Map<string, TickData>();
  private tickHistoryBuffers = new Map<string, number[]>();
  private exchangePairsState = new Map<string, LiveExchangePair>();

  constructor() {
    this.seedInitialPricesFromCatalog();
  }

  private seedInitialPricesFromCatalog(): void {
    const nowEpoch = Math.floor(Date.now() / 1000);
    for (const inst of CURATED_DERIV_INSTRUMENTS) {
      const pip = inst.pip_size;
      const spread = inst.spread;
      const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : pip < 0.01 ? 3 : 2;
      const spark: number[] = [];
      let p = inst.base_price;
      for (let i = 0; i < 24; i++) {
        const wave = Math.sin(i * 0.65 + inst.symbol.length) * 0.0018 * inst.base_price;
        p = Number((inst.base_price + wave).toFixed(dec));
        spark.push(p);
      }
      this.tickHistoryBuffers.set(inst.symbol, spark);
      const quote = spark[spark.length - 1];
      this.latestTicks.set(inst.symbol, {
        symbol: inst.symbol,
        quote,
        bid: Number((quote - spread / 2).toFixed(dec)),
        ask: Number((quote + spread / 2).toFixed(dec)),
        epoch: nowEpoch,
        pipSize: pip,
        source: 'cached',
      });
    }

    for (let idx = 0; idx < EXCHANGE_PAIRS_CATALOG.length; idx++) {
      const p = EXCHANGE_PAIRS_CATALOG[idx];
      const dec = p.price < 0.001 ? 8 : p.price < 1 ? 5 : 2;
      const sparkline: number[] = [];
      for (let i = 0; i < 20; i++) {
        const wave = Math.sin(i * 0.6 + idx) * 0.008 + (p.change24h >= 0 ? i * 0.0006 : -i * 0.0006);
        sparkline.push(Number((p.price * (0.994 + wave)).toFixed(dec)));
      }
      this.exchangePairsState.set(p.pair, {
        ...p,
        price: sparkline[sparkline.length - 1],
        sparkline,
      });
    }
  }

  public getDiagnostics() {
    return {
      connected: this.isConnected,
      endpoint: this.lastWorkingEndpoint || config.derivWsUrl,
      subscribedSymbols: this.subscribedSymbols.size,
      subscribedSymbolsCount: this.subscribedSymbols.size,
      subscribedSymbolList: Array.from(this.subscribedSymbols),
      trackedPrices: this.latestTicks.size,
      marketClosedCount: this.marketClosedSymbols.size,
      lastDerivTickAt: this.lastDerivTickAt,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError || null,
    };
  }

  public onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  public onExchangeTick(listener: ExchangeTickListener): () => void {
    this.exchangeTickListeners.add(listener);
    return () => this.exchangeTickListeners.delete(listener);
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

  public getSparkline(symbol: string, count = 24): number[] {
    const buf = this.tickHistoryBuffers.get(symbol);
    if (buf && buf.length >= 2) {
      return buf.slice(-count);
    }
    const latest = this.latestTicks.get(symbol);
    return latest ? [latest.quote] : [];
  }

  public getChangePct(symbol: string): number {
    const buf = this.tickHistoryBuffers.get(symbol);
    if (!buf || buf.length < 2) return 0;
    const lookbackIdx = Math.max(0, buf.length - 24);
    const first = buf[lookbackIdx] || buf[0];
    const last = buf[buf.length - 1];
    if (!first) return 0;
    return Number((((last - first) / first) * 100).toFixed(2));
  }

  public setInstrumentSpotOverride(symbol: string, price: number): void {
    const existing = this.latestTicks.get(symbol);
    const instMeta = CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === symbol);
    const pip = instMeta?.pip_size ?? existing?.pipSize ?? 0.01;
    const spread = instMeta?.spread ?? 0.2;
    const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : pip < 0.01 ? 3 : 2;
    const rounded = Number(price.toFixed(dec));
    this.broadcastTick({
      symbol,
      quote: rounded,
      bid: Number((rounded - spread / 2).toFixed(dec)),
      ask: Number((rounded + spread / 2).toFixed(dec)),
      epoch: Math.floor(Date.now() / 1000),
      pipSize: pip,
      source: 'live_pulse',
    });
  }

  public getAllExchangeTickRates(): LiveExchangePair[] {
    return Array.from(this.exchangePairsState.values());
  }

  private runLiveMicroTickPulse(): void {
    const engineCfg = getCachedSetting<{ liveMicroTickEnabled?: boolean }>('trading_engine', {
      liveMicroTickEnabled: true,
    });
    if (engineCfg.liveMicroTickEnabled === false) return;

    const nowEpoch = Math.floor(Date.now() / 1000);
    // Keep all curated symbols ticking smoothly when Deriv WS hasn't pushed a frame in the last ~2s
    for (const inst of CURATED_DERIV_INSTRUMENTS) {
      const current = this.latestTicks.get(inst.symbol);
      if (!current) continue;
      if (current.source === 'deriv_ws' && nowEpoch - current.epoch < 2) continue;

      const dec = inst.pip_size < 0.0001 ? 5 : inst.pip_size < 0.001 ? 4 : inst.pip_size < 0.01 ? 3 : 2;
      const volScale =
        inst.category === 'Synthetic'
          ? 0.00045
          : inst.category === 'Crypto'
            ? 0.00055
            : inst.category === 'Forex'
              ? 0.00012
              : 0.00022;
      const meanPull = ((inst.base_price - current.quote) / Math.max(1e-6, inst.base_price)) * 0.03;
      const stepPct = (Math.random() - 0.5) * 2 * volScale + meanPull;
      const nextQuote = Number(Math.max(inst.pip_size * 5, current.quote * (1 + stepPct)).toFixed(dec));

      this.broadcastTick({
        symbol: inst.symbol,
        quote: nextQuote,
        bid: Number((nextQuote - inst.spread / 2).toFixed(dec)),
        ask: Number((nextQuote + inst.spread / 2).toFixed(dec)),
        epoch: nowEpoch,
        pipSize: inst.pip_size,
        source: 'live_pulse',
      });
    }

    // Update all 38 Exchange pairs smoothly
    const updatedPairs: LiveExchangePair[] = [];
    for (const [pairKey, entry] of this.exchangePairsState.entries()) {
      const liveCrypto = entry.quote === 'USDT' ? this.latestTicks.get(`cry${entry.base}USD`) : undefined;
      const dec = entry.price < 0.001 ? 8 : entry.price < 1 ? 5 : 2;
      let nextPrice = entry.price;
      if (liveCrypto && liveCrypto.quote > 0) {
        nextPrice = Number(liveCrypto.quote.toFixed(dec));
      } else {
        const delta = (Math.random() - 0.495) * 0.0018;
        nextPrice = Number(Math.max(1e-8, entry.price * (1 + delta)).toFixed(dec));
      }
      const nextSpark = [...entry.sparkline.slice(-19), nextPrice];
      const nextChange = Number(
        (entry.change24h + ((nextPrice - entry.price) / (entry.price || 1)) * 100).toFixed(2)
      );
      const nextEntry: LiveExchangePair = {
        ...entry,
        price: nextPrice,
        change24h: nextChange,
        sparkline: nextSpark,
      };
      this.exchangePairsState.set(pairKey, nextEntry);
      updatedPairs.push(nextEntry);
    }

    for (const fn of this.exchangeTickListeners) {
      try {
        fn(updatedPairs);
      } catch {
        // ignore
      }
    }
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

  public isMarketClosed(symbol: string): string | null {
    return this.marketClosedSymbols.get(symbol) || null;
  }

  public async syncOpenOrderSymbols(): Promise<void> {
    if (!pool) return;
    try {
      const res = await pool.query<{ symbol: string }>(
        "SELECT DISTINCT symbol FROM virtual_orders WHERE status = 'OPEN'"
      );
      for (const row of res.rows) {
        if (row.symbol) {
          await this.ensureSymbolSubscribed(row.symbol);
        }
      }
    } catch {
      // ignore if DB waking up
    }
  }

  public async getLiveQuote(symbol: string): Promise<TickData | undefined> {
    await this.ensureSymbolSubscribed(symbol);
    const existing = this.latestTicks.get(symbol);
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (existing && existing.source === 'deriv_ws' && nowEpoch - existing.epoch <= 4) {
      return existing;
    }
    try {
      const resp = await this.request<{
        history?: { prices?: Array<string | number>; times?: Array<number> };
      }>(
        {
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 1,
          end: 'latest',
          style: 'ticks',
        },
        4500
      );
      const prices = resp?.history?.prices;
      const times = resp?.history?.times;
      if (prices && prices.length > 0) {
        const quote = Number(prices[prices.length - 1]);
        const epoch = Number(times?.[times.length - 1] || nowEpoch);
        const instMeta = CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === symbol);
        const pip = instMeta?.pip_size ?? existing?.pipSize ?? 0.01;
        const spread = instMeta?.spread ?? 0.2;
        const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : 2;
        const live: TickData = {
          symbol,
          quote,
          bid: Number((quote - spread / 2).toFixed(dec)),
          ask: Number((quote + spread / 2).toFixed(dec)),
          epoch,
          pipSize: pip,
          source: 'deriv_ws',
        };
        this.marketClosedSymbols.delete(symbol);
        this.broadcastTick(live);
        return live;
      }
    } catch {
      // fallback to latest known tick
    }
    return this.latestTicks.get(symbol);
  }

  public startMarketFeed(): void {
    this.connectCluster()
      .then(() => {
        this.syncOpenOrderSymbols().catch(() => {});
      })
      .catch((err) => {
        this.lastError = err instanceof Error ? err.message : 'Deriv WS initial connect failed';
        this.scheduleReconnect();
      });

    if (this.microTickTimer) clearInterval(this.microTickTimer);
    this.microTickTimer = setInterval(() => {
      this.runLiveMicroTickPulse();
    }, 1500);

    if (this.quoteKeepaliveTimer) clearInterval(this.quoteKeepaliveTimer);
    this.quoteKeepaliveTimer = setInterval(async () => {
      try {
        if (Date.now() - this.lastOpenOrderSyncAt >= 10000) {
          this.lastOpenOrderSyncAt = Date.now();
          await this.syncOpenOrderSymbols();
        }
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const nowEpoch = Math.floor(Date.now() / 1000);
        const staleSymbols: string[] = [];
        for (const sym of this.subscribedSymbols) {
          if (this.marketClosedSymbols.has(sym)) continue;
          const t = this.latestTicks.get(sym);
          if (!t || t.source !== 'deriv_ws' || nowEpoch - t.epoch >= 6) {
            staleSymbols.push(sym);
          }
        }

        for (const sym of staleSymbols.slice(0, 4)) {
          if (!this.activeStreamSymbols.has(sym) && this.ws?.readyState === WebSocket.OPEN) {
            this.activeStreamSymbols.add(sym);
            this.ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
          }
          await this.getLiveQuote(sym).catch(() => {});
        }
      } catch {
        // ignore keepalive failure
      }
    }, 4500);
  }

  public async ensureSymbolSubscribed(symbol: string): Promise<void> {
    if (!symbol) return;
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
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN && !this.activeStreamSymbols.has(symbol)) {
      this.activeStreamSymbols.add(symbol);
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

    const appId = getWsFeedAppId();
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
            if (data.error && data.echo_req?.ticks) {
              const sym = String(data.echo_req.ticks);
              this.activeStreamSymbols.delete(sym);
              if (data.error.code === 'MarketIsClosed' || /closed/i.test(String(data.error.message || ''))) {
                this.marketClosedSymbols.set(sym, String(data.error.message || 'Market is currently closed'));
              }
            }
            if (data.msg_type === 'tick' && data.tick) {
              const t = data.tick;
              const pip = Number(t.pip_size || 0.01);
              const quote = Number(t.quote);
              const bid = t.bid ? Number(t.bid) : quote;
              const ask = t.ask ? Number(t.ask) : quote;
              this.marketClosedSymbols.delete(t.symbol);
              this.broadcastTick({
                symbol: t.symbol,
                quote,
                bid,
                ask,
                epoch: Number(t.epoch || Math.floor(Date.now() / 1000)),
                pipSize: pip,
                source: 'deriv_ws',
              });
            } else if (data.msg_type === 'ohlc' && data.ohlc) {
              const o = data.ohlc;
              const pip = Number(o.pip_size || 0.01);
              const quote = Number(o.close);
              this.marketClosedSymbols.delete(o.symbol);
              this.broadcastTick({
                symbol: o.symbol,
                quote,
                bid: quote,
                ask: quote,
                epoch: Number(o.epoch || o.open_time || Math.floor(Date.now() / 1000)),
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
          this.activeStreamSymbols.clear();
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

        this.activeStreamSymbols.clear();
        this.marketClosedSymbols.clear();
        for (const sym of this.subscribedSymbols) {
          this.activeStreamSymbols.add(sym);
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
    const appId = getWsFeedAppId();
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
      let authorizePayload: any = null;

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
            authorizePayload = data.authorize || null;
            socket.send(JSON.stringify({ ...payload, req_id: 2 }));
            return;
          }
          if (authorized && data.req_id === 2) {
            clearTimeout(timer);
            socket.close();
            if (data.error) {
              reject(new Error(data.error.message || 'Deriv API call rejected'));
            } else if (data && typeof data === 'object' && authorizePayload) {
              resolve({ ...data, _authorize: authorizePayload } as T);
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
      // Handle tick timeframe ('1t' / granularity < 60) via Deriv style:'ticks'
      if (granularity < 60) {
        const resp = await this.request<{
          history?: { prices?: Array<string | number>; times?: Array<number> };
        }>(
          {
            ticks_history: symbol,
            adjust_start_time: 1,
            count: Math.min(300, Math.max(40, count)),
            end: 'latest',
            style: 'ticks',
          },
          7000
        );
        const prices = resp?.history?.prices || [];
        const times = resp?.history?.times || [];
        if (prices.length > 0 && times.length > 0) {
          const mapByTime = new Map<number, CandleData>();
          for (let i = 0; i < Math.min(prices.length, times.length); i++) {
            const t = Number(times[i]);
            const p = Number(prices[i]);
            if (!Number.isFinite(t) || !Number.isFinite(p)) continue;
            const prev = mapByTime.get(t);
            if (!prev) {
              mapByTime.set(t, { time: t, open: p, high: p, low: p, close: p });
            } else {
              prev.high = Math.max(prev.high, p);
              prev.low = Math.min(prev.low, p);
              prev.close = p;
            }
          }
          const candles = Array.from(mapByTime.values()).sort((a, b) => a.time - b.time);
          const lastCandle = candles[candles.length - 1];
          if (lastCandle) {
            const instMeta = CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === symbol);
            const spread = instMeta?.spread ?? 0.2;
            const pip = instMeta?.pip_size ?? this.latestTicks.get(symbol)?.pipSize ?? 0.01;
            const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : 2;
            const existing = this.latestTicks.get(symbol);
            if (!existing || existing.epoch <= lastCandle.time) {
              this.broadcastTick({
                symbol,
                quote: lastCandle.close,
                bid: Number((lastCandle.close - spread / 2).toFixed(dec)),
                ask: Number((lastCandle.close + spread / 2).toFixed(dec)),
                epoch: lastCandle.time,
                pipSize: pip,
                source: 'deriv_ws',
              });
            }
          }
          return {
            candles,
            source: 'deriv_ws',
            lastUpdated: Date.now(),
          };
        }
      }

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
        const deduped = new Map<number, CandleData>();
        for (const c of resp.candles) {
          const time = Number(c.epoch);
          if (!Number.isFinite(time)) continue;
          deduped.set(time, {
            time,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          });
        }
        const candles = Array.from(deduped.values()).sort((a, b) => a.time - b.time);
        const lastCandle = candles[candles.length - 1];
        const existingTick = this.latestTicks.get(symbol);
        if (lastCandle && (!existingTick || existingTick.source === 'cached')) {
          const instMeta = CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === symbol);
          const spread = instMeta?.spread ?? 0.2;
          const pip = instMeta?.pip_size ?? existingTick?.pipSize ?? 0.01;
          const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : 2;
          this.latestTicks.set(symbol, {
            symbol,
            quote: lastCandle.close,
            bid: Number((lastCandle.close - spread / 2).toFixed(dec)),
            ask: Number((lastCandle.close + spread / 2).toFixed(dec)),
            epoch: lastCandle.time,
            pipSize: pip,
            source: 'cached',
          });
        }
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
      const msg = err instanceof Error ? err.message : 'Unable to reach Deriv historical candles API';
      if (/closed/i.test(msg)) {
        this.marketClosedSymbols.set(symbol, msg);
      }
      return {
        candles: [],
        source: 'unavailable',
        error: msg,
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
  options: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}
): Promise<T> {
  const url = `${config.derivApiBase}${path}`;
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    let detail = text.slice(0, 240);
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.errors?.[0]?.message || parsed?.error?.message || parsed?.message || detail;
    } catch {
      // keep raw snippet
    }
    throw new Error(`Deriv REST ${path} (${resp.status}): ${detail}`);
  }
  return (await resp.json()) as T;
}

export const derivWs = new DerivWebSocketClient();
