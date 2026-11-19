import { execute, query } from './db.ts';

export type AnalyserTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export const ANALYSER_TIMEFRAME_SECONDS: Record<AnalyserTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export interface IndependentInstrumentMeta {
  instrument: string;
  displayName: string;
  assetClass: 'commodity' | 'forex';
  pipSize: number;
  decimals: number;
  contractSize: number;
  defaultSpread: number;
  maxAllowedSpread: number;
  yahooSymbol: string;
  erKey?: string;
}

export const INDEPENDENT_INSTRUMENTS: IndependentInstrumentMeta[] = [
  {
    instrument: 'XAUUSD',
    displayName: 'Gold / US Dollar (Spot XAUUSD)',
    assetClass: 'commodity',
    pipSize: 0.01,
    decimals: 2,
    contractSize: 100,
    defaultSpread: 0.28,
    maxAllowedSpread: 1.5,
    yahooSymbol: 'GC=F',
  },
  {
    instrument: 'EURUSD',
    displayName: 'Euro / US Dollar',
    assetClass: 'forex',
    pipSize: 0.0001,
    decimals: 5,
    contractSize: 100000,
    defaultSpread: 0.00014,
    maxAllowedSpread: 0.00045,
    yahooSymbol: 'EURUSD=X',
    erKey: 'EUR',
  },
  {
    instrument: 'GBPUSD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'forex',
    pipSize: 0.0001,
    decimals: 5,
    contractSize: 100000,
    defaultSpread: 0.00018,
    maxAllowedSpread: 0.00055,
    yahooSymbol: 'GBPUSD=X',
    erKey: 'GBP',
  },
  {
    instrument: 'USDJPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'forex',
    pipSize: 0.01,
    decimals: 3,
    contractSize: 100000,
    defaultSpread: 0.016,
    maxAllowedSpread: 0.055,
    yahooSymbol: 'USDJPY=X',
    erKey: 'JPY',
  },
  {
    instrument: 'AUDUSD',
    displayName: 'Australian Dollar / US Dollar',
    assetClass: 'forex',
    pipSize: 0.0001,
    decimals: 5,
    contractSize: 100000,
    defaultSpread: 0.00016,
    maxAllowedSpread: 0.0005,
    yahooSymbol: 'AUDUSD=X',
    erKey: 'AUD',
  },
  {
    instrument: 'USDCAD',
    displayName: 'US Dollar / Canadian Dollar',
    assetClass: 'forex',
    pipSize: 0.0001,
    decimals: 5,
    contractSize: 100000,
    defaultSpread: 0.00018,
    maxAllowedSpread: 0.00055,
    yahooSymbol: 'USDCAD=X',
    erKey: 'CAD',
  },
  {
    instrument: 'USDCHF',
    displayName: 'US Dollar / Swiss Franc',
    assetClass: 'forex',
    pipSize: 0.0001,
    decimals: 5,
    contractSize: 100000,
    defaultSpread: 0.00018,
    maxAllowedSpread: 0.00055,
    yahooSymbol: 'USDCHF=X',
    erKey: 'CHF',
  },
  {
    instrument: 'XAGUSD',
    displayName: 'Silver / US Dollar',
    assetClass: 'commodity',
    pipSize: 0.001,
    decimals: 3,
    contractSize: 5000,
    defaultSpread: 0.024,
    maxAllowedSpread: 0.08,
    yahooSymbol: 'SI=F',
  },
];

export interface IndependentQuote {
  instrument: string;
  displayName: string;
  assetClass: 'commodity' | 'forex';
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  decimals: number;
  providerName: string;
  provenance: string;
  utcTimestamp: string;
  epochMs: number;
  isStale: boolean;
  ageSeconds: number;
}

export interface IndependentCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const DEFAULT_ANCHORS: Record<string, number> = {
  XAUUSD: 2684.5,
  EURUSD: 1.0842,
  GBPUSD: 1.2965,
  USDJPY: 152.35,
  AUDUSD: 0.6548,
  USDCAD: 1.3895,
  USDCHF: 0.8764,
  XAGUSD: 31.42,
};

class IndependentMarketFeedService {
  private startedAt = Date.now();
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollCount = 0;
  private reconnectCount = 0;
  private consecutiveFailures = 0;
  private lastPollAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;

  private quotes = new Map<string, IndependentQuote>();
  private candleCache = new Map<string, { candles: IndependentCandle[]; source: string; fetchedAt: number }>();

  constructor() {
    const now = Date.now();
    for (const meta of INDEPENDENT_INSTRUMENTS) {
      const mid = DEFAULT_ANCHORS[meta.instrument] || 100;
      const half = meta.defaultSpread / 2;
      this.quotes.set(meta.instrument, {
        instrument: meta.instrument,
        displayName: meta.displayName,
        assetClass: meta.assetClass,
        bid: Number((mid - half).toFixed(meta.decimals)),
        ask: Number((mid + half).toFixed(meta.decimals)),
        mid,
        spread: meta.defaultSpread,
        decimals: meta.decimals,
        providerName: 'initial_baseline',
        provenance: 'Awaiting first independent external feed sync',
        utcTimestamp: new Date(now).toISOString(),
        epochMs: now,
        isStale: true,
        ageSeconds: 999,
      });
    }
  }

  public start(): void {
    if (this.pollTimer) return;
    this.pollAllProviders().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.pollAllProviders().catch(() => {});
    }, 8500);
  }

  private async fetchJsonWithTimeout<T = any>(url: string, timeoutMs = 4200): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TradeDeriv-Independent-Analyser/1.0',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private updateQuote(meta: IndependentInstrumentMeta, mid: number, providerName: string, provenance: string) {
    if (!Number.isFinite(mid) || mid <= 0) return;
    const now = Date.now();
    const half = meta.defaultSpread / 2;
    const quote: IndependentQuote = {
      instrument: meta.instrument,
      displayName: meta.displayName,
      assetClass: meta.assetClass,
      bid: Number((mid - half).toFixed(meta.decimals)),
      ask: Number((mid + half).toFixed(meta.decimals)),
      mid: Number(mid.toFixed(meta.decimals)),
      spread: meta.defaultSpread,
      decimals: meta.decimals,
      providerName,
      provenance,
      utcTimestamp: new Date(now).toISOString(),
      epochMs: now,
      isStale: false,
      ageSeconds: 0,
    };
    this.quotes.set(meta.instrument, quote);

    // Update any cached candle tail with latest independent price
    for (const [key, entry] of this.candleCache.entries()) {
      if (!key.startsWith(`${meta.instrument}:`) || entry.candles.length === 0) continue;
      const last = entry.candles[entry.candles.length - 1];
      last.high = Math.max(last.high, quote.mid);
      last.low = Math.min(last.low, quote.mid);
      last.close = quote.mid;
    }

    if (this.pollCount % 4 === 0) {
      execute(
        `INSERT INTO market_feed_snapshots (provider_name, instrument, bid, ask, spread, mid, raw_timestamp, is_stale, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)`,
        [
          providerName,
          meta.instrument,
          quote.bid,
          quote.ask,
          quote.spread,
          quote.mid,
          quote.utcTimestamp,
          JSON.stringify({ provenance }),
        ]
      ).catch(() => {});
    }
  }

  public async pollAllProviders(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    this.pollCount += 1;
    this.lastPollAt = Date.now();
    let updatedAny = false;

    try {
      // 1. Gold (XAUUSD) primary via api.gold-api.com + Binance PAXGUSDT fallback
      const xauMeta = INDEPENDENT_INSTRUMENTS[0];
      try {
        const goldApi = await this.fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU', 4000);
        if (goldApi?.price && Number(goldApi.price) > 100) {
          this.updateQuote(xauMeta, Number(goldApi.price), 'gold-api.com', 'Independent Spot XAU/USD Feed (gold-api.com)');
          updatedAny = true;
        }
      } catch {
        try {
          const paxg = await this.fetchJsonWithTimeout<{ price?: string }>(
            'https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT',
            3800
          );
          if (paxg?.price && Number(paxg.price) > 100) {
            this.updateQuote(xauMeta, Number(paxg.price), 'binance_paxg', 'Independent Gold Proxy Feed (Binance PAXGUSDT)');
            updatedAny = true;
          }
        } catch {
          // Will check Yahoo Finance below
        }
      }

      // 2. Forex Majors via open.er-api.com/v6/latest/USD
      try {
        const er = await this.fetchJsonWithTimeout<{ rates?: Record<string, number> }>(
          'https://open.er-api.com/v6/latest/USD',
          4200
        );
        if (er?.rates) {
          for (const meta of INDEPENDENT_INSTRUMENTS) {
            if (meta.assetClass !== 'forex' || !meta.erKey) continue;
            const rate = Number(er.rates[meta.erKey]);
            if (!Number.isFinite(rate) || rate <= 0) continue;
            // Pairs starting with USD use USD/XXX directly; XXX/USD pairs invert 1 / rate
            const mid = meta.instrument.startsWith('USD') ? rate : 1 / rate;
            this.updateQuote(meta, mid, 'open.er-api.com', 'Independent FX Reference Spot (open.er-api.com)');
            updatedAny = true;
          }
        }
      } catch {
        // Fallback to Yahoo chart quote below
      }

      // 3. Yahoo Finance spot confirmation for XAU/XAG & fallback FX
      const yahooTargets = INDEPENDENT_INSTRUMENTS.filter(
        (m) => m.instrument === 'XAGUSD' || (this.quotes.get(m.instrument)?.ageSeconds ?? 999) > 25
      );
      for (const meta of yahooTargets.slice(0, 4)) {
        try {
          const y = await this.fetchJsonWithTimeout<any>(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahooSymbol)}?interval=1m&range=1d`,
            3800
          );
          const metaPrice = y?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (metaPrice && Number(metaPrice) > 0) {
            this.updateQuote(meta, Number(metaPrice), 'yahoo_finance', `Yahoo Finance Spot (${meta.yahooSymbol})`);
            updatedAny = true;
          }
        } catch {
          // Continue cleanly
        }
      }

      if (updatedAny) {
        if (this.consecutiveFailures > 0) this.reconnectCount += 1;
        this.consecutiveFailures = 0;
        this.lastSuccessAt = Date.now();
        this.lastError = null;
      } else {
        this.consecutiveFailures += 1;
        this.lastError = 'External market providers unreachable or rate-limited; existing quotes marked stale after 60s.';
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      this.lastError = err instanceof Error ? err.message : 'Independent feed poll failed';
    } finally {
      this.isPolling = false;
    }
  }

  public getQuote(instrument: string): IndependentQuote {
    const clean = String(instrument || 'XAUUSD').toUpperCase();
    const q = this.quotes.get(clean) || this.quotes.get('XAUUSD')!;
    const ageSeconds = Math.max(0, Math.round((Date.now() - q.epochMs) / 1000));
    const isStale = q.providerName === 'initial_baseline' || ageSeconds > 60;
    return {
      ...q,
      ageSeconds,
      isStale,
    };
  }

  public getAllQuotes(): IndependentQuote[] {
    return INDEPENDENT_INSTRUMENTS.map((m) => this.getQuote(m.instrument));
  }

  public getHealthStatus() {
    const quotes = this.getAllQuotes();
    const freshCount = quotes.filter((q) => !q.isStale).length;
    const avgLatencyMs = this.lastSuccessAt && this.lastPollAt ? Math.max(0, this.lastSuccessAt - this.lastPollAt) : null;
    return {
      status: freshCount >= 2 ? 'operational' : freshCount > 0 ? 'degraded' : 'stale',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      pollCount: this.pollCount,
      reconnectCount: this.reconnectCount,
      consecutiveFailures: this.consecutiveFailures,
      freshInstruments: freshCount,
      totalInstruments: quotes.length,
      lastPollUtc: this.lastPollAt ? new Date(this.lastPollAt).toISOString() : null,
      lastSuccessUtc: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      lastError: this.lastError,
      sampleLatencyMs: avgLatencyMs,
      providers: Array.from(new Set(quotes.map((q) => q.providerName))),
    };
  }

  public async getSnapshotHistory(limit = 30) {
    try {
      return await query(
        'SELECT provider_name, instrument, bid, ask, spread, mid, raw_timestamp, is_stale, recorded_at FROM market_feed_snapshots ORDER BY id DESC LIMIT $1',
        [limit]
      );
    } catch {
      return [];
    }
  }

  public async getCandles(
    instrument: string,
    timeframe: AnalyserTimeframe = 'M15',
    count = 160
  ): Promise<{ candles: IndependentCandle[]; source: string; isStale: boolean; quote: IndependentQuote }> {
    const clean = String(instrument || 'XAUUSD').toUpperCase();
    const meta = INDEPENDENT_INSTRUMENTS.find((m) => m.instrument === clean) || INDEPENDENT_INSTRUMENTS[0];
    const cacheKey = `${meta.instrument}:${timeframe}`;
    const existing = this.candleCache.get(cacheKey);
    const quote = this.getQuote(meta.instrument);

    if (existing && Date.now() - existing.fetchedAt < 25000 && existing.candles.length >= 60) {
      return {
        candles: existing.candles.slice(-count),
        source: existing.source,
        isStale: quote.isStale,
        quote,
      };
    }

    const yahooMap: Record<AnalyserTimeframe, { interval: string; range: string }> = {
      M1: { interval: '1m', range: '1d' },
      M5: { interval: '5m', range: '5d' },
      M15: { interval: '15m', range: '5d' },
      M30: { interval: '30m', range: '1mo' },
      H1: { interval: '60m', range: '1mo' },
      H4: { interval: '60m', range: '3mo' },
      D1: { interval: '1d', range: '1y' },
    };

    try {
      const yCfg = yahooMap[timeframe] || yahooMap.M15;
      const y = await this.fetchJsonWithTimeout<any>(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahooSymbol)}?interval=${yCfg.interval}&range=${yCfg.range}`,
        4500
      );
      const res = y?.chart?.result?.[0];
      const timestamps: number[] = res?.timestamp || [];
      const ohlc = res?.indicators?.quote?.[0] || {};
      const parsed: IndependentCandle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = Number(ohlc.open?.[i]);
        const h = Number(ohlc.high?.[i]);
        const l = Number(ohlc.low?.[i]);
        const c = Number(ohlc.close?.[i]);
        const v = Number(ohlc.volume?.[i] || 100);
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        parsed.push({
          time: Number(timestamps[i]),
          open: Number(o.toFixed(meta.decimals)),
          high: Number(h.toFixed(meta.decimals)),
          low: Number(l.toFixed(meta.decimals)),
          close: Number(c.toFixed(meta.decimals)),
          volume: v,
        });
      }

      if (parsed.length >= 40) {
        let finalBars = parsed;
        if (timeframe === 'H4') {
          // Aggregate 1H Yahoo bars cleanly into 4H OHLCV bars
          const agg: IndependentCandle[] = [];
          for (let i = 0; i < parsed.length; i += 4) {
            const chunk = parsed.slice(i, i + 4);
            if (chunk.length === 0) continue;
            agg.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map((x) => x.high)),
              low: Math.min(...chunk.map((x) => x.low)),
              close: chunk[chunk.length - 1].close,
              volume: chunk.reduce((s, x) => s + x.volume, 0),
            });
          }
          finalBars = agg;
        }
        const trimmed = finalBars.slice(-Math.max(160, count));
        this.candleCache.set(cacheKey, {
          candles: trimmed,
          source: `yahoo_ohlcv (${meta.yahooSymbol})`,
          fetchedAt: Date.now(),
        });
        return {
          candles: trimmed.slice(-count),
          source: `yahoo_ohlcv (${meta.yahooSymbol})`,
          isStale: quote.isStale,
          quote,
        };
      }
    } catch {
      // Fallback to spot-anchored deterministic structural bars clearly labeled as anchored
    }

    const stepSec = ANALYSER_TIMEFRAME_SECONDS[timeframe] || 900;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const currentBucket = Math.floor(nowEpoch / stepSec) * stepSec;
    const anchor = quote.mid;
    const volFactor = meta.instrument === 'XAUUSD' ? 0.0018 : meta.assetClass === 'commodity' ? 0.0024 : 0.00075;
    const closes: number[] = Array(count).fill(anchor);
    let cursor = anchor;
    for (let i = count - 2; i >= 0; i--) {
      const drift = Math.sin(i * 0.27 + meta.instrument.length) * volFactor + Math.cos(i * 0.11) * volFactor * 0.55;
      cursor = Number((cursor / (1 + drift)).toFixed(meta.decimals));
      closes[i] = cursor;
    }
    const bars: IndependentCandle[] = [];
    for (let i = 0; i < count; i++) {
      const t = currentBucket - (count - 1 - i) * stepSec;
      const open = i === 0 ? closes[0] : closes[i - 1];
      const close = i === count - 1 ? anchor : closes[i];
      const range = Math.max(meta.pipSize * 4, Math.abs(close - open) * 0.7 + close * volFactor * 0.65);
      bars.push({
        time: t,
        open,
        high: Number((Math.max(open, close) + range * 0.5).toFixed(meta.decimals)),
        low: Number(Math.max(meta.pipSize, Math.min(open, close) - range * 0.5).toFixed(meta.decimals)),
        close,
        volume: 120 + ((i * 19) % 240),
      });
    }

    const src = `spot_anchored_bars (${quote.providerName})`;
    this.candleCache.set(cacheKey, { candles: bars, source: src, fetchedAt: Date.now() });
    return {
      candles: bars,
      source: src,
      isStale: quote.isStale,
      quote,
    };
  }
}

export const independentFeed = new IndependentMarketFeedService();
