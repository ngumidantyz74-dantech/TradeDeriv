import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { query, queryOne, execute, requireDb, addNotification, logSystemError } from '../db.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { derivWs, type TickData } from '../deriv-client.ts';
import { CURATED_DERIV_INSTRUMENTS } from '../catalog.ts';
import {
  STRATEGY_CATALOG,
  type StrategyKey,
  computeAllIndicators,
  analyzeSmartMoneyConcepts,
  analyzeBuyLowSellHigh,
  scanStrategySetups,
  runStrategyBacktest,
} from '../../src/lib/quant-engine.ts';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const TIMEFRAME_LABELS: Record<number, string> = {
  1: '1t',
  60: '1m',
  300: '5m',
  900: '15m',
  1800: '30m',
  3600: '1h',
  14400: '4h',
  86400: '1d',
};

const RADAR_SYMBOLS = [
  '1HZ100V',
  '1HZ75V',
  '1HZ50V',
  '1HZ25V',
  '1HZ10V',
  'R_100',
  'R_50',
  'frxEURUSD',
  'frxGBPUSD',
  'frxXAUUSD',
  'cryBTCUSD',
];

function sanitizePublicError(err: unknown, fallback = 'Live market service is temporarily busy. Please try again.'): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (
    trimmed.startsWith('{') ||
    trimmed.includes('"error"') ||
    trimmed.includes('UNAVAILABLE') ||
    trimmed.includes('RESOURCE_EXHAUSTED') ||
    /gemini|genai|GEMINI_API_KEY|sdk|stack|sql|postgres|neon/i.test(trimmed)
  ) {
    return fallback;
  }
  if (/MarketIsClosed|market is closed/i.test(trimmed)) {
    return 'Market is currently closed for this instrument. Try 24/7 Volatility indices or check session hours.';
  }
  return trimmed.slice(0, 220);
}

function buildFallbackQuantitativeBrief(payload: any, prompt: string): string {
  const sym = payload.symbol;
  const tf = payload.timeframe;
  const quote = Number(payload.liveQuote || 0);
  const ind = payload.indicators || {};
  const smc = payload.smc || {};
  const dr = smc.dealingRange || {};
  const blsh = payload.buyLowSellHigh || {};
  const openPos = Array.isArray(payload.userOpenPositions) ? payload.userOpenPositions : [];
  const risk = payload.userRiskSettings || {};
  const openStake = openPos.reduce((s: number, p: any) => s + Number(p.stake || 0), 0);
  const openPnl = openPos.reduce((s: number, p: any) => s + Number(p.pnl || 0), 0);
  const maxExp = Number(risk.max_exposure_usd || 500);

  const lines: string[] = [
    `### ${sym} (${tf}) Live Quantitative Brief`,
    `_Note: AI narrative capacity is temporarily busy — displaying direct live quantitative telemetry for: "${prompt}"_`,
    '',
    `- **Live Spot:** ${quote}`,
    `- **SMC Bias & Range:** ${String(smc.bias || 'neutral').toUpperCase()} | ${dr.zone || 'Equilibrium'} (${Number(dr.currentPct || 50).toFixed(1)}% of dealing range)`,
    `- **Momentum & Trend:** RSI(14) = ${ind.rsi14 !== null && ind.rsi14 !== undefined ? Number(ind.rsi14).toFixed(1) : '—'} | ADX(14) = ${ind.adx14?.adx !== null && ind.adx14?.adx !== undefined ? Number(ind.adx14.adx).toFixed(1) : '—'} | MACD Hist = ${ind.macd?.histogram !== null && ind.macd?.histogram !== undefined ? Number(ind.macd.histogram).toFixed(4) : '—'}`,
    `- **Buy Low / Sell High:** ${String(blsh.action || 'WAIT').replace(/_/g, ' ')} (${blsh.regimeLabel || 'Evaluating range'})`,
    `- **Key Levels:** Support ${(smc.supportLevels || []).slice(0, 2).join(', ') || '—'} | Resistance ${(smc.resistanceLevels || []).slice(0, 2).join(', ') || '—'}`,
  ];

  if (blsh.stopLoss || blsh.takeProfit) {
    lines.push(
      `- **Suggested Invalidation / Target:** SL ${blsh.stopLoss ?? '—'} | TP ${blsh.takeProfit ?? '—'} (R:R ${blsh.riskReward ?? '—'}:1)`
    );
  }

  lines.push(
    '',
    '### Open Exposure & Risk Audit',
    `- **Active Open Trades:** ${openPos.length} | **Used Margin:** $${openStake.toFixed(2)} / $${maxExp.toFixed(2)} limit`,
    `- **Floating P/L:** ${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)} | **Daily Loss Cap:** $${Number(risk.daily_loss_limit_usd || 150).toFixed(2)}`,
    `- **Compliance Status:** ${openStake <= maxExp ? 'Within configured exposure limits' : 'Exceeds configured max exposure limit — reduce open stake'}`
  );

  return lines.join('\n');
}

function summarizeLatestIndicators(candles: any[], ind: ReturnType<typeof computeAllIndicators>) {
  const n = candles.length - 1;
  if (n < 0) return null;
  const close = candles[n].close;
  return {
    close,
    ema9: ind.ema9[n],
    ema20: ind.ema20[n],
    ema50: ind.ema50[n],
    ema200: ind.ema200[n],
    sma20: ind.sma20[n],
    sma50: ind.sma50[n],
    rsi14: ind.rsi14[n],
    macd: {
      line: ind.macd.line[n],
      signal: ind.macd.signal[n],
      histogram: ind.macd.histogram[n],
    },
    bollinger: {
      upper: ind.bollinger.upper[n],
      middle: ind.bollinger.middle[n],
      lower: ind.bollinger.lower[n],
      percentB: ind.bollinger.percentB[n],
      bandwidth: ind.bollinger.bandwidth[n],
    },
    stochastic: {
      k: ind.stochastic.k[n],
      d: ind.stochastic.d[n],
    },
    atr14: ind.atr14[n],
    adx14: {
      adx: ind.adx14.adx[n],
      plusDi: ind.adx14.plusDi[n],
      minusDi: ind.adx14.minusDi[n],
    },
    vwap: {
      available: ind.vwap.available,
      reason: ind.vwap.reason || null,
      latest: ind.vwap.values[n] ?? null,
    },
    psar: {
      value: ind.psar.values[n],
      trend: ind.psar.trend[n],
    },
  };
}

// 1. Live Symbol Quant Analysis (10 Indicators + SMC + Buy Low/Sell High + Strategy Setups)
router.get('/intelligence/analyze', async (req, res) => {
  const symbol = String(req.query.symbol || '1HZ100V');
  const granularity = Number(req.query.granularity || 900);
  const count = Math.min(500, Math.max(80, Number(req.query.count || 200)));
  const tfLabel = TIMEFRAME_LABELS[granularity] || `${Math.round(granularity / 60)}m`;

  const detailed = await derivWs.fetchCandlesDetailed(symbol, granularity, count);
  const tick = derivWs.getLatestTick(symbol);

  if (detailed.candles.length < 30) {
    res.json({
      symbol,
      granularity,
      timeframe: tfLabel,
      source: detailed.source,
      error: detailed.error || 'Real historical candles from Deriv are currently unavailable.',
      lastUpdated: detailed.lastUpdated,
      latestTick: tick || null,
      candlesCount: detailed.candles.length,
      indicators: null,
      smc: null,
      buyLowSellHigh: null,
      setups: [],
    });
    return;
  }

  const ind = computeAllIndicators(detailed.candles);
  const smc = analyzeSmartMoneyConcepts(detailed.candles, ind);
  const buyLowSellHigh = analyzeBuyLowSellHigh(detailed.candles, ind, smc);
  const setups = scanStrategySetups(detailed.candles, tfLabel, ind, smc);

  res.json({
    symbol,
    granularity,
    timeframe: tfLabel,
    source: detailed.source,
    error: null,
    lastUpdated: detailed.lastUpdated,
    latestTick: tick || null,
    candlesCount: detailed.candles.length,
    indicators: summarizeLatestIndicators(detailed.candles, ind),
    smc,
    buyLowSellHigh,
    setups,
  });
});

// 2. Multi-Instrument Market Radar Scanner (Always live, zero cache)
router.get('/intelligence/radar', async (req, res) => {
  const granularity = Number(req.query.granularity || 900);
  const tfLabel = TIMEFRAME_LABELS[granularity] || '15m';

  const results = await Promise.all(
    RADAR_SYMBOLS.map(async (sym) => {
      const meta = CURATED_DERIV_INSTRUMENTS.find((i) => i.symbol === sym);
      const tick = derivWs.getLatestTick(sym);
      const detailed = await derivWs.fetchCandlesDetailed(sym, granularity, 140);
      if (detailed.candles.length < 40) {
        return {
          symbol: sym,
          displayName: meta?.display_name || sym,
          category: meta?.category || 'Market',
          price: tick?.quote ?? meta?.base_price ?? null,
          source: detailed.source,
          error: sanitizePublicError(detailed.error, 'Market closed or candles temporarily unavailable'),
          volatilityPct: null,
          trendStrengthAdx: null,
          rsi14: null,
          smcBias: 'neutral',
          dealingZone: 'Equilibrium',
          rangePct: 50,
          buyLowSellHigh: null,
          topSetup: null,
          setupCount: 0,
        };
      }

      const ind = computeAllIndicators(detailed.candles);
      const smc = analyzeSmartMoneyConcepts(detailed.candles, ind);
      const blsh = analyzeBuyLowSellHigh(detailed.candles, ind, smc);
      const setups = scanStrategySetups(detailed.candles, tfLabel, ind, smc);
      const n = detailed.candles.length - 1;
      const close = detailed.candles[n].close;
      const atr = ind.atr14[n] ?? 0;
      const volatilityPct = close > 0 ? Number(((atr / close) * 100).toFixed(3)) : 0;

      return {
        symbol: sym,
        displayName: meta?.display_name || sym,
        category: meta?.category || 'Market',
        price: tick?.source === 'deriv_ws' ? tick.quote : close,
        source: detailed.source,
        error: null,
        volatilityPct,
        trendStrengthAdx: ind.adx14.adx[n] ? Number(ind.adx14.adx[n]!.toFixed(1)) : null,
        rsi14: ind.rsi14[n] ? Number(ind.rsi14[n]!.toFixed(1)) : null,
        smcBias: smc.bias,
        dealingZone: smc.dealingRange.zone,
        rangePct: smc.dealingRange.currentPct,
        buyLowSellHigh: blsh,
        topSetup: setups[0] || null,
        setupCount: setups.length,
      };
    })
  );

  const payload = {
    granularity,
    timeframe: tfLabel,
    derivDiagnostics: derivWs.getDiagnostics(),
    scannedAt: new Date().toISOString(),
    instruments: results,
  };
  res.json({ ...payload, cached: false });
});

// 3. Real Deriv Trading Times & Market Sessions
router.get('/intelligence/sessions', async (_req, res) => {
  const nowUtc = new Date();
  const utcHour = nowUtc.getUTCHours() + nowUtc.getUTCMinutes() / 60;

  const sessions = [
    {
      name: 'Sydney Session',
      openUtc: '21:00 UTC',
      closeUtc: '06:00 UTC',
      isOpen: utcHour >= 21 || utcHour < 6,
      focus: 'AUD, NZD, Asia-Pacific Indices',
    },
    {
      name: 'Tokyo Session',
      openUtc: '00:00 UTC',
      closeUtc: '09:00 UTC',
      isOpen: utcHour >= 0 && utcHour < 9,
      focus: 'JPY Crosses, Gold Asia Range',
    },
    {
      name: 'London Session',
      openUtc: '07:00 UTC',
      closeUtc: '16:00 UTC',
      isOpen: utcHour >= 7 && utcHour < 16,
      focus: 'EUR, GBP, XAU/USD Peak Liquidity',
    },
    {
      name: 'New York Session',
      openUtc: '12:00 UTC',
      closeUtc: '21:00 UTC',
      isOpen: utcHour >= 12 && utcHour < 21,
      focus: 'USD Majors, US Indices, London/NY Overlap (12:00–16:00 UTC)',
    },
    {
      name: 'Deriv Synthetics & Crypto',
      openUtc: '00:00 UTC',
      closeUtc: '24:00 UTC',
      isOpen: true,
      focus: '24/7 Volatility Indices, Crash/Boom, Step, BTC/ETH',
    },
  ];

  let tradingTimesMarkets: any[] = [];
  let source: 'deriv_ws' | 'unavailable' = 'unavailable';
  let error: string | null = null;

  try {
    const resp = await derivWs.getTradingTimes('today');
    const markets = resp?.trading_times?.markets || [];
    tradingTimesMarkets = markets.map((m: any) => ({
      name: m.name,
      submarkets: (m.submarkets || []).slice(0, 4).map((sm: any) => ({
        name: sm.name,
        symbolsCount: (sm.symbols || []).length,
        sampleSymbols: (sm.symbols || []).slice(0, 5).map((s: any) => ({
          symbol: s.symbol,
          name: s.name,
          tradingDays: s.trading_days || [],
          times: s.times || null,
        })),
      })),
    }));
    source = 'deriv_ws';
  } catch (err) {
    error = err instanceof Error ? err.message : 'Deriv trading_times API unavailable';
  }

  res.json({
    utcTime: nowUtc.toISOString(),
    sessions,
    derivTradingTimes: {
      source,
      error,
      markets: tradingTimesMarkets,
    },
    integrityNote:
      'TradeDeriv displays real Deriv trading_times schedules and UTC liquidity windows only. No synthetic or unverified economic news headlines are fabricated.',
  });
});

// 4. Server-Side AI Trading Co-Pilot (Strictly Grounded in Live Deriv Data, Sanitised + Retry + Quantitative Fallback)
router.post('/intelligence/copilot', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      symbol = '1HZ100V',
      granularity = 900,
      prompt = 'Analyze current structure, indicator confluence, Buy Low/Sell High regime, and key invalidation risks.',
    } = req.body || {};

    const tfLabel = TIMEFRAME_LABELS[Number(granularity)] || '15m';
    const detailed = await derivWs.fetchCandlesDetailed(String(symbol), Number(granularity), 160);
    const tick = await derivWs.getLiveQuote(String(symbol)).catch(() => derivWs.getLatestTick(String(symbol)));

    if (detailed.candles.length < 30) {
      res.status(503).json({
        error: sanitizePublicError(
          detailed.error,
          `Live historical candles for ${symbol} are temporarily unavailable (market may be closed). Switch to a 24/7 Volatility index or retry.`
        ),
      });
      return;
    }

    const ind = computeAllIndicators(detailed.candles);
    const smc = analyzeSmartMoneyConcepts(detailed.candles, ind);
    const blsh = analyzeBuyLowSellHigh(detailed.candles, ind, smc);
    const setups = scanStrategySetups(detailed.candles, tfLabel, ind, smc);
    const latestInd = summarizeLatestIndicators(detailed.candles, ind);

    const openOrders = await query<any>(
      "SELECT id, symbol, side, contract_type, stake, entry_price, current_price, pnl, sl_price, tp_price, execution_mode FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN' LIMIT 15",
      [req.user!.id]
    );
    const risk = await queryOne<any>('SELECT * FROM risk_settings WHERE user_id = $1', [req.user!.id]);

    const groundedPayload = {
      symbol: String(symbol),
      timeframe: tfLabel,
      liveQuote: tick?.quote ?? detailed.candles[detailed.candles.length - 1].close,
      indicators: latestInd,
      smc: {
        bias: smc.bias,
        dealingRange: smc.dealingRange,
        recentStructure: smc.structureEvents.slice(-5),
        activeZones: smc.zones.slice(-5),
        supportLevels: smc.supportLevels,
        resistanceLevels: smc.resistanceLevels,
        liquidityEvents: smc.liquidityEvents.slice(-5),
      },
      buyLowSellHigh: blsh,
      activeStrategySetups: setups.slice(0, 4),
      userOpenPositions: openOrders,
      userRiskSettings: risk || { risk_per_trade_pct: 1.5, daily_loss_limit_usd: 150, max_exposure_usd: 500 },
    };

    const groundedSummary = {
      bias: smc.bias,
      dealingZone: smc.dealingRange.zone,
      rangePct: smc.dealingRange.currentPct,
      rsi14: latestInd?.rsi14,
      adx: latestInd?.adx14.adx,
      buyLowSellHighAction: blsh.action,
      setupsCount: setups.length,
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await logSystemError('ai-copilot', 'AI narrative service key unavailable; served quant brief', 'warn', {
        userId: req.user?.id,
      });
      res.json({
        model: 'quant-engine',
        degraded: true,
        symbol: String(symbol),
        timeframe: tfLabel,
        answer: buildFallbackQuantitativeBrief(groundedPayload, String(prompt)),
        groundedSummary,
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const generateBrief = async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Live Grounded Market & Portfolio Snapshot (JSON):\n${JSON.stringify(groundedPayload, null, 2)}\n\nTrader Question:\n${String(prompt)}`,
        config: {
          systemInstruction:
            'You are the TradeDeriv Institutional Trading Co-Pilot. Analyze ONLY the supplied live Deriv market data, indicators, SMC structure, Buy Low/Sell High regime, and user open positions/risk settings. Cite exact numbers from the JSON. Never invent prices, never fabricate news, and never guarantee profits or claim certain outcomes. State invalidation levels, risk-reward trade-offs, and whether current exposure complies with the user risk limits. Keep the output concise, structured with clear markdown headings and bullet points.',
        },
      });
      const text = (response.text || '').trim();
      if (!text) throw new Error('Empty narrative output');
      return text;
    };

    let answer = '';
    let degraded = false;
    try {
      answer = await generateBrief();
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 650));
      try {
        answer = await generateBrief();
      } catch (secondErr) {
        const rawErr =
          secondErr instanceof Error ? secondErr.message : firstErr instanceof Error ? firstErr.message : 'Upstream busy';
        await logSystemError('ai-copilot', rawErr, 'warn', { userId: req.user?.id, symbol });
        answer = buildFallbackQuantitativeBrief(groundedPayload, String(prompt));
        degraded = true;
      }
    }

    res.json({
      model: degraded ? 'quant-engine' : 'copilot-live',
      degraded,
      symbol: String(symbol),
      timeframe: tfLabel,
      answer,
      groundedSummary,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Co-Pilot analysis interrupted';
    await logSystemError('ai-copilot', rawMsg, 'error', { userId: req.user?.id });
    res.status(503).json({
      error: sanitizePublicError(err, 'Live analysis is temporarily unavailable. Please retry in a few seconds.'),
    });
  }
});

// 5. Strategy Catalog, User Config & Real Deriv Backtester
router.get('/strategies/catalog', async (_req, res) => {
  res.json({ strategies: STRATEGY_CATALOG });
});

router.get('/strategies/user', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const rows = await query<any>('SELECT * FROM user_strategies WHERE user_id = $1 ORDER BY id ASC', [req.user!.id]);
  res.json({ strategies: rows });
});

router.put('/strategies/user', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { strategyKey, name, enabled = true, executionMode = 'paper', symbol = '1HZ100V', timeframe = '15m', config = {}, risk = {} } = req.body || {};
  if (!strategyKey) {
    res.status(400).json({ error: 'strategyKey is required' });
    return;
  }
  const def = STRATEGY_CATALOG.find((s) => s.key === strategyKey);
  const row = await queryOne<any>(
    `INSERT INTO user_strategies (user_id, strategy_key, name, enabled, execution_mode, symbol, timeframe, config_json, risk_json, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id, strategy_key) DO UPDATE SET
       name = EXCLUDED.name,
       enabled = EXCLUDED.enabled,
       execution_mode = EXCLUDED.execution_mode,
       symbol = EXCLUDED.symbol,
       timeframe = EXCLUDED.timeframe,
       config_json = EXCLUDED.config_json,
       risk_json = EXCLUDED.risk_json,
       updated_at = NOW()
     RETURNING *`,
    [
      req.user!.id,
      String(strategyKey),
      String(name || def?.name || strategyKey),
      Boolean(enabled),
      executionMode === 'live' ? 'live' : 'paper',
      String(symbol),
      String(timeframe),
      JSON.stringify(config),
      JSON.stringify(risk),
    ]
  );
  res.json({ strategy: row });
});

router.post('/strategies/backtest', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const {
    strategyKey = 'trend_following',
    symbol = '1HZ100V',
    granularity = 900,
    candleCount = 300,
    stake = 10,
    stopLossAtrMult,
    takeProfitRr,
    spreadCostPct = 0.0006,
    adxThreshold,
    rsiOversold,
    rsiOverbought,
  } = req.body || {};

  const count = Math.min(500, Math.max(120, Number(candleCount)));
  const detailed = await derivWs.fetchCandlesDetailed(String(symbol), Number(granularity), count);
  if (detailed.candles.length < 80) {
    res.status(503).json({
      error:
        detailed.error ||
        'Real Deriv historical candles are required for backtesting and are currently unavailable.',
    });
    return;
  }

  const report = runStrategyBacktest(strategyKey as StrategyKey, detailed.candles, {
    stake: Number(stake),
    stopLossAtrMult: stopLossAtrMult !== undefined ? Number(stopLossAtrMult) : undefined,
    takeProfitRr: takeProfitRr !== undefined ? Number(takeProfitRr) : undefined,
    spreadCostPct: Number(spreadCostPct),
    adxThreshold: adxThreshold !== undefined ? Number(adxThreshold) : undefined,
    rsiOversold: rsiOversold !== undefined ? Number(rsiOversold) : undefined,
    rsiOverbought: rsiOverbought !== undefined ? Number(rsiOverbought) : undefined,
  });

  await execute(
    `INSERT INTO strategy_backtest_runs (user_id, strategy_key, symbol, granularity, candle_count, spread_cost_pct, in_sample_json, out_of_sample_json, full_metrics_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      req.user!.id,
      report.strategyKey,
      String(symbol),
      Number(granularity),
      detailed.candles.length,
      report.spreadCostPct,
      JSON.stringify(report.inSample),
      JSON.stringify(report.outOfSample),
      JSON.stringify(report.overall),
    ]
  );

  res.json({ symbol, granularity, source: detailed.source, report });
});

router.get('/strategies/backtests', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const runs = await query(
    'SELECT * FROM strategy_backtest_runs WHERE user_id = $1 ORDER BY id DESC LIMIT 20',
    [req.user!.id]
  );
  res.json({ runs });
});

// 6. Performance Intelligence (Real vs Demo Split)
function computeOrderCohortStats(orders: any[]) {
  const closed = orders.filter((o) => o.status === 'CLOSED');
  const open = orders.filter((o) => o.status === 'OPEN');

  const wins = closed.filter((o) => Number(o.pnl) > 0);
  const losses = closed.filter((o) => Number(o.pnl) < 0);
  const grossWin = wins.reduce((s, o) => s + Number(o.pnl || 0), 0);
  const grossLoss = losses.reduce((s, o) => s + Math.abs(Number(o.pnl || 0)), 0);
  const netPnl = closed.reduce((s, o) => s + Number(o.pnl || 0), 0);
  const unrealizedPnl = open.reduce((s, o) => s + Number(o.pnl || 0), 0);

  let eq = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  const asc = [...closed].sort((a, b) => new Date(a.closed_at || a.opened_at).getTime() - new Date(b.closed_at || b.opened_at).getTime());
  for (const o of asc) {
    eq += Number(o.pnl || 0);
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
  }

  let totalHoldMins = 0;
  let holdCount = 0;
  for (const o of closed) {
    if (o.opened_at && o.closed_at) {
      const mins = (new Date(o.closed_at).getTime() - new Date(o.opened_at).getTime()) / 60000;
      if (mins >= 0 && Number.isFinite(mins)) {
        totalHoldMins += mins;
        holdCount++;
      }
    }
  }

  const pnls = closed.map((o) => Number(o.pnl || 0));

  return {
    totalTrades: closed.length,
    openTrades: open.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
    netPnlUsd: Number(netPnl.toFixed(2)),
    unrealizedPnlUsd: Number(unrealizedPnl.toFixed(2)),
    avgWinUsd: wins.length ? Number((grossWin / wins.length).toFixed(2)) : 0,
    avgLossUsd: losses.length ? Number((grossLoss / losses.length).toFixed(2)) : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : Number((grossWin / grossLoss).toFixed(2)),
    maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(2)),
    avgHoldMinutes: holdCount ? Number((totalHoldMins / holdCount).toFixed(1)) : 0,
    bestTradeUsd: pnls.length ? Number(Math.max(...pnls).toFixed(2)) : 0,
    worstTradeUsd: pnls.length ? Number(Math.min(...pnls).toFixed(2)) : 0,
  };
}

router.get('/analytics/performance', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const orders = await query<any>(
    `SELECT vo.*, COALESCE(ca.is_virtual, TRUE) as acc_is_virtual
     FROM virtual_orders vo
     LEFT JOIN connected_accounts ca ON vo.connected_account_id = ca.id
     WHERE vo.user_id = $1
     ORDER BY vo.opened_at DESC LIMIT 1000`,
    [req.user!.id]
  );

  const realOrders = orders.filter(
    (o) => o.account_mode === 'real' || (o.execution_mode === 'deriv' && o.acc_is_virtual === false)
  );
  const demoOrders = orders.filter(
    (o) => !(o.account_mode === 'real' || (o.execution_mode === 'deriv' && o.acc_is_virtual === false))
  );

  const bySymbolMap = new Map<string, { symbol: string; trades: number; wins: number; netPnl: number }>();
  const byStrategyMap = new Map<string, { strategy: string; trades: number; wins: number; netPnl: number }>();
  const dailyMap = new Map<string, { date: string; pnl: number; trades: number }>();

  for (const o of orders.filter((x) => x.status === 'CLOSED')) {
    const sym = o.symbol || 'UNKNOWN';
    const sEntry = bySymbolMap.get(sym) || { symbol: sym, trades: 0, wins: 0, netPnl: 0 };
    sEntry.trades++;
    if (Number(o.pnl) > 0) sEntry.wins++;
    sEntry.netPnl = Number((sEntry.netPnl + Number(o.pnl || 0)).toFixed(2));
    bySymbolMap.set(sym, sEntry);

    const strat = o.strategy_key || o.source || 'manual';
    const stEntry = byStrategyMap.get(strat) || { strategy: strat, trades: 0, wins: 0, netPnl: 0 };
    stEntry.trades++;
    if (Number(o.pnl) > 0) stEntry.wins++;
    stEntry.netPnl = Number((stEntry.netPnl + Number(o.pnl || 0)).toFixed(2));
    byStrategyMap.set(strat, stEntry);

    const day = new Date(o.closed_at || o.opened_at).toISOString().slice(0, 10);
    const dEntry = dailyMap.get(day) || { date: day, pnl: 0, trades: 0 };
    dEntry.pnl = Number((dEntry.pnl + Number(o.pnl || 0)).toFixed(2));
    dEntry.trades++;
    dailyMap.set(day, dEntry);
  }

  const now = Date.now();
  const closedAll = orders.filter((o) => o.status === 'CLOSED');
  const dailyPnl = closedAll
    .filter((o) => now - new Date(o.closed_at || o.opened_at).getTime() <= 86400000)
    .reduce((s, o) => s + Number(o.pnl || 0), 0);
  const weeklyPnl = closedAll
    .filter((o) => now - new Date(o.closed_at || o.opened_at).getTime() <= 7 * 86400000)
    .reduce((s, o) => s + Number(o.pnl || 0), 0);
  const monthlyPnl = closedAll
    .filter((o) => now - new Date(o.closed_at || o.opened_at).getTime() <= 30 * 86400000)
    .reduce((s, o) => s + Number(o.pnl || 0), 0);

  res.json({
    combined: computeOrderCohortStats(orders),
    real: computeOrderCohortStats(realOrders),
    demo: computeOrderCohortStats(demoOrders),
    periods: {
      dailyPnlUsd: Number(dailyPnl.toFixed(2)),
      weeklyPnlUsd: Number(weeklyPnl.toFixed(2)),
      monthlyPnlUsd: Number(monthlyPnl.toFixed(2)),
    },
    bySymbol: [...bySymbolMap.values()].sort((a, b) => b.trades - a.trades),
    byStrategy: [...byStrategyMap.values()].sort((a, b) => b.trades - a.trades),
    dailySeries: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
  });
});

// 7. Risk Management Centre
router.get('/risk/settings', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute(
    'INSERT INTO risk_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [req.user!.id]
  );
  const settings = await queryOne<any>('SELECT * FROM risk_settings WHERE user_id = $1', [req.user!.id]);
  const todayPnlRow = await queryOne<{ daily_pnl: number }>(
    `SELECT COALESCE(SUM(pnl), 0) as daily_pnl FROM virtual_orders WHERE user_id = $1 AND status = 'CLOSED' AND closed_at >= CURRENT_DATE`,
    [req.user!.id]
  );
  const exposureRow = await queryOne<{ open_stake: number; open_count: number }>(
    `SELECT COALESCE(SUM(stake), 0) as open_stake, COUNT(*)::int as open_count FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN'`,
    [req.user!.id]
  );
  const recentClosed = await query<{ pnl: number }>(
    `SELECT pnl FROM virtual_orders WHERE user_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 10`,
    [req.user!.id]
  );
  let consecutiveLosses = 0;
  for (const r of recentClosed) {
    if (Number(r.pnl) < 0) consecutiveLosses++;
    else break;
  }

  res.json({
    settings,
    telemetry: {
      dailyPnlUsd: Number(todayPnlRow?.daily_pnl || 0),
      openExposureUsd: Number(exposureRow?.open_stake || 0),
      openPositionsCount: Number(exposureRow?.open_count || 0),
      consecutiveLosses,
      cooldownActive: Boolean(settings?.cooldown_until && new Date(settings.cooldown_until).getTime() > Date.now()),
    },
  });
});

router.put('/risk/settings', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const settings = await queryOne<any>(
    `INSERT INTO risk_settings (
      user_id, risk_per_trade_pct, daily_loss_limit_usd, max_exposure_usd, max_consecutive_losses, cooldown_minutes, enforce_limits, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      risk_per_trade_pct = EXCLUDED.risk_per_trade_pct,
      daily_loss_limit_usd = EXCLUDED.daily_loss_limit_usd,
      max_exposure_usd = EXCLUDED.max_exposure_usd,
      max_consecutive_losses = EXCLUDED.max_consecutive_losses,
      cooldown_minutes = EXCLUDED.cooldown_minutes,
      enforce_limits = EXCLUDED.enforce_limits,
      updated_at = NOW()
    RETURNING *`,
    [
      req.user!.id,
      Math.max(0.1, Math.min(25, Number(b.risk_per_trade_pct ?? 1.5))),
      Math.max(5, Number(b.daily_loss_limit_usd ?? 150)),
      Math.max(10, Number(b.max_exposure_usd ?? 500)),
      Math.max(1, Math.min(20, Number(b.max_consecutive_losses ?? 4))),
      Math.max(1, Math.min(1440, Number(b.cooldown_minutes ?? 30))),
      b.enforce_limits !== undefined ? Boolean(b.enforce_limits) : true,
    ]
  );
  res.json({ settings });
});

router.post('/risk/reset-cooldown', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('UPDATE risk_settings SET cooldown_until = NULL, updated_at = NOW() WHERE user_id = $1', [req.user!.id]);
  res.json({ ok: true });
});

// 8. Trading Journal CRUD
router.get('/journal', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const entries = await query<any>(
    `SELECT j.*, o.pnl as order_pnl, o.entry_price as order_entry_price, o.exit_price as order_exit_price, o.status as order_status
     FROM trading_journal_entries j
     LEFT JOIN virtual_orders o ON j.order_id = o.id
     WHERE j.user_id = $1
     ORDER BY j.created_at DESC LIMIT 200`,
    [req.user!.id]
  );
  res.json({ entries });
});

router.post('/journal', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  if (!b.symbol) {
    res.status(400).json({ error: 'Symbol is required' });
    return;
  }
  const entry = await queryOne<any>(
    `INSERT INTO trading_journal_entries (
      user_id, order_id, symbol, side, strategy_key, timeframe, rationale, emotions, discipline_score, lessons, image_url, tags_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      req.user!.id,
      b.order_id ? Number(b.order_id) : null,
      String(b.symbol),
      String(b.side || 'BUY').toUpperCase(),
      String(b.strategy_key || ''),
      String(b.timeframe || '15m'),
      String(b.rationale || ''),
      String(b.emotions || 'Calm & Objective'),
      Math.max(1, Math.min(10, Number(b.discipline_score ?? 8))),
      String(b.lessons || ''),
      String(b.image_url || ''),
      JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
    ]
  );
  res.status(201).json({ entry });
});

router.put('/journal/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const entry = await queryOne<any>(
    `UPDATE trading_journal_entries SET
      rationale = COALESCE($1, rationale),
      emotions = COALESCE($2, emotions),
      discipline_score = COALESCE($3, discipline_score),
      lessons = COALESCE($4, lessons),
      image_url = COALESCE($5, image_url),
      tags_json = COALESCE($6, tags_json),
      updated_at = NOW()
     WHERE id = $7 AND user_id = $8
     RETURNING *`,
    [
      b.rationale ?? null,
      b.emotions ?? null,
      b.discipline_score !== undefined ? Number(b.discipline_score) : null,
      b.lessons ?? null,
      b.image_url ?? null,
      Array.isArray(b.tags) ? JSON.stringify(b.tags) : null,
      id,
      req.user!.id,
    ]
  );
  if (!entry) {
    res.status(404).json({ error: 'Journal entry not found' });
    return;
  }
  res.json({ entry });
});

router.delete('/journal/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('DELETE FROM trading_journal_entries WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user!.id,
  ]);
  res.json({ ok: true });
});

// 9. Smart Alerts CRUD + Live Tick Evaluator
router.get('/alerts', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const alerts = await query('SELECT * FROM smart_alerts WHERE user_id = $1 ORDER BY id DESC LIMIT 100', [
    req.user!.id,
  ]);
  res.json({ alerts });
});

router.post('/alerts', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  if (!b.symbol || !b.alertType) {
    res.status(400).json({ error: 'symbol and alertType are required' });
    return;
  }
  await derivWs.ensureSymbolSubscribed(String(b.symbol));
  const alert = await queryOne<any>(
    `INSERT INTO smart_alerts (user_id, symbol, alert_type, condition_json, message, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [
      req.user!.id,
      String(b.symbol),
      String(b.alertType),
      JSON.stringify(b.condition || {}),
      String(b.message || `${b.symbol} ${b.alertType} triggered`),
    ]
  );
  res.status(201).json({ alert });
});

router.patch('/alerts/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const status = String(req.body?.status || 'active');
  const alert = await queryOne<any>(
    'UPDATE smart_alerts SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [status, Number(req.params.id), req.user!.id]
  );
  res.json({ alert });
});

router.delete('/alerts/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('DELETE FROM smart_alerts WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user!.id,
  ]);
  res.json({ ok: true });
});

let lastAlertCheckAt = 0;
export async function evaluateSmartAlertsForTick(tick: TickData): Promise<void> {
  if (Date.now() - lastAlertCheckAt < 1500) return;
  lastAlertCheckAt = Date.now();
  try {
    const active = await query<any>(
      "SELECT * FROM smart_alerts WHERE symbol = $1 AND status = 'active' LIMIT 50",
      [tick.symbol]
    );
    for (const a of active) {
      let cond: any = {};
      try {
        cond = JSON.parse(a.condition_json || '{}');
      } catch {
        cond = {};
      }
      const target = Number(cond.targetPrice);
      let triggered = false;
      if (a.alert_type === 'price_above' && Number.isFinite(target) && tick.quote >= target) triggered = true;
      if (a.alert_type === 'price_below' && Number.isFinite(target) && tick.quote <= target) triggered = true;
      if (triggered) {
        await execute("UPDATE smart_alerts SET status = 'triggered', triggered_at = NOW() WHERE id = $1", [a.id]);
        await addNotification(a.user_id, `Alert: ${a.symbol}`, `${a.message} @ ${tick.quote}`, 'alert');
        derivWs.emitUserEvent(a.user_id, 'alert_triggered', { ...a, triggerPrice: tick.quote });
      }
    }
  } catch {
    // ignore if DB not yet ready
  }
}

// 10. Workspace Preferences & Chart Drawings Persistence
router.get('/workspace/preferences', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const row = await queryOne<any>('SELECT * FROM user_workspace_preferences WHERE user_id = $1', [req.user!.id]);
  if (!row) {
    res.json({ layout: {}, chartDrawings: {}, chartIndicators: {} });
    return;
  }
  const safeParse = (s: string) => {
    try {
      return JSON.parse(s || '{}');
    } catch {
      return {};
    }
  };
  res.json({
    layout: safeParse(row.layout_json),
    chartDrawings: safeParse(row.chart_drawings_json),
    chartIndicators: safeParse(row.chart_indicators_json),
  });
});

router.put('/workspace/preferences', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { layout, chartDrawings, chartIndicators } = req.body || {};
  const current = await queryOne<any>('SELECT * FROM user_workspace_preferences WHERE user_id = $1', [req.user!.id]);
  const nextLayout = layout !== undefined ? JSON.stringify(layout) : current?.layout_json || '{}';
  const nextDrawings = chartDrawings !== undefined ? JSON.stringify(chartDrawings) : current?.chart_drawings_json || '{}';
  const nextInd = chartIndicators !== undefined ? JSON.stringify(chartIndicators) : current?.chart_indicators_json || '{}';

  await execute(
    `INSERT INTO user_workspace_preferences (user_id, layout_json, chart_drawings_json, chart_indicators_json, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       layout_json = EXCLUDED.layout_json,
       chart_drawings_json = EXCLUDED.chart_drawings_json,
       chart_indicators_json = EXCLUDED.chart_indicators_json,
       updated_at = NOW()`,
    [req.user!.id, nextLayout, nextDrawings, nextInd]
  );
  res.json({ ok: true });
});

export default router;
