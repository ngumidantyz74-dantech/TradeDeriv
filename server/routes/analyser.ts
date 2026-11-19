import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { query, queryOne, execute, requireDb, logSystemError } from '../db.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import {
  independentFeed,
  INDEPENDENT_INSTRUMENTS,
  type AnalyserTimeframe,
} from '../independent-feed.ts';
import {
  analyzeInstrumentSetup,
  persistAndScanAll,
  transitionSignalLifecycle,
  runIndependentWalkForwardBacktest,
} from '../analyser-engine.ts';
import { placeUnifiedOrder } from '../trade-execution.ts';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 1. Independent Feed Health, Provenance & Live Quotes
router.get('/analyser/feed/status', async (_req, res) => {
  const health = independentFeed.getHealthStatus();
  const quotes = independentFeed.getAllQuotes();
  const snapshots = await independentFeed.getSnapshotHistory(25);
  res.json({
    health,
    quotes,
    instruments: INDEPENDENT_INSTRUMENTS,
    snapshots,
  });
});

// 2. Independent MTF Candles
router.get('/analyser/candles', async (req, res) => {
  const instrument = String(req.query.instrument || 'XAUUSD').toUpperCase();
  const tf = (String(req.query.timeframe || 'M15').toUpperCase() as AnalyserTimeframe) || 'M15';
  const count = Math.min(300, Math.max(40, Number(req.query.count || 160)));
  const data = await independentFeed.getCandles(instrument, tf, count);
  res.json({
    instrument,
    timeframe: tf,
    ...data,
  });
});

// 3. Dedicated Gold (XAUUSD) Deep Analysis
router.get('/analyser/gold', async (req, res) => {
  const tf = (String(req.query.timeframe || 'M15').toUpperCase() as AnalyserTimeframe) || 'M15';
  const rawTfs = String(req.query.timeframes || 'M1,M5,M15,M30,H1,H4,D1')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as AnalyserTimeframe[];
  const [setup, chart] = await Promise.all([
    analyzeInstrumentSetup('XAUUSD', tf, rawTfs),
    independentFeed.getCandles('XAUUSD', tf, 160),
  ]);
  res.json({
    setup,
    candles: chart.candles,
    quote: chart.quote,
    feedHealth: independentFeed.getHealthStatus(),
  });
});

// 4. Dedicated Forex Pair Deep Analysis
router.get('/analyser/forex', async (req, res) => {
  const instrument = String(req.query.instrument || 'EURUSD').toUpperCase();
  const tf = (String(req.query.timeframe || 'M15').toUpperCase() as AnalyserTimeframe) || 'M15';
  const rawTfs = String(req.query.timeframes || 'M5,M15,M30,H1,H4,D1')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as AnalyserTimeframe[];
  const [setup, chart] = await Promise.all([
    analyzeInstrumentSetup(instrument, tf, rawTfs),
    independentFeed.getCandles(instrument, tf, 160),
  ]);
  res.json({
    setup,
    candles: chart.candles,
    quote: chart.quote,
    forexPairs: INDEPENDENT_INSTRUMENTS.filter((m) => m.assetClass === 'forex'),
    feedHealth: independentFeed.getHealthStatus(),
  });
});

// 5. Multi-Market Independent Scanner
router.get('/analyser/scan', async (req, res) => {
  const tf = (String(req.query.timeframe || 'M15').toUpperCase() as AnalyserTimeframe) || 'M15';
  const setups = await persistAndScanAll(tf, ['M5', 'M15', 'H1', 'H4']);
  res.json({
    timeframe: tf,
    scannedAt: new Date().toISOString(),
    feedHealth: independentFeed.getHealthStatus(),
    setups,
  });
});

// 6. Signal Lifecycle History & State Transitions
router.get('/analyser/signals', async (req, res) => {
  const instrument = req.query.instrument ? String(req.query.instrument).toUpperCase() : '';
  const rows = instrument
    ? await query('SELECT * FROM analyser_signals WHERE instrument = $1 ORDER BY id DESC LIMIT 50', [instrument])
    : await query('SELECT * FROM analyser_signals ORDER BY id DESC LIMIT 100');
  res.json({ signals: rows });
});

router.post('/analyser/signals/:id/transition', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const nextStatus = String(req.body?.lifecycleStatus || 'Confirmed') as any;
  const reason = String(req.body?.reason || '');
  const updated = await transitionSignalLifecycle(Number(req.params.id), nextStatus, reason);
  if (!updated) {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }
  res.json({ signal: updated });
});

// 7. Grounded AI Analyser Assistant (gemini-4-hydrogen)
router.post('/analyser/ai-assistant', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const {
    instrument = 'XAUUSD',
    timeframe = 'M15',
    prompt = 'Evaluate setup validity, key S/R levels, liquidity zones, and invalidation triggers.',
  } = req.body || {};

  const tf = (String(timeframe).toUpperCase() as AnalyserTimeframe) || 'M15';
  const setup = await analyzeInstrumentSetup(String(instrument).toUpperCase(), tf, ['M5', 'M15', 'H1', 'H4', 'D1']);
  const feedHealth = independentFeed.getHealthStatus();

  const measuredFacts = {
    instrument: setup.instrument,
    timeframe: setup.timeframe,
    bid: setup.entryPrice - setup.spread / 2,
    ask: setup.entryPrice + setup.spread / 2,
    spread: setup.spread,
    atr14: setup.atr,
    rsi14: setup.rsi14,
    ema20: setup.ema20,
    ema50: setup.ema50,
    ema200: setup.ema200,
    macdHistogram: setup.macdHistogram,
    trendBias: setup.trendBias,
    supportLevels: setup.supportLevels,
    resistanceLevels: setup.resistanceLevels,
    fibLevels: setup.fibLevels,
    mtfAlignment: setup.mtfAlignment,
    setupSummary: {
      direction: setup.direction,
      setupType: setup.setupType,
      entryZone: [setup.entryZoneLow, setup.entryZoneHigh],
      stopLoss: setup.stopLoss,
      tp1: setup.tp1,
      tp2: setup.tp2,
      tp3: setup.tp3,
      riskReward: setup.riskReward,
      qualityScore: setup.qualityScore,
      blockedReason: setup.blockedReason,
    },
    feedProvenance: setup.feedProvenance,
    feedTimestamp: setup.feedTimestamp,
    isFeedStale: setup.isFeedStale,
    feedStatus: feedHealth.status,
  };

  const buildQuantitativeFallback = () =>
    [
      `### Measured Telemetry (${setup.instrument} ${setup.timeframe})`,
      `- **Spot / Spread:** Entry ${setup.entryPrice} | Spread ${setup.spread} | Source: ${setup.feedProvenance}`,
      `- **Momentum & Trend:** Trend ${setup.trendBias.toUpperCase()} | RSI(14) ${setup.rsi14} | ATR(14) ${setup.atr} | EMA20 ${setup.ema20} vs EMA50 ${setup.ema50}`,
      `- **S/R & Fib Levels:** Support ${setup.supportLevels.join(', ') || '—'} | Resistance ${setup.resistanceLevels.join(', ') || '—'}`,
      '',
      `### Analytical Interpretation`,
      setup.blockedReason
        ? `- **Gate Blocked:** ${setup.blockedReason}`
        : `- **Setup Status:** ${setup.direction} (${setup.setupType}) | Entry Zone ${setup.entryZoneLow}–${setup.entryZoneHigh} | SL ${setup.stopLoss} | TP1 ${setup.tp1} / TP2 ${setup.tp2} / TP3 ${setup.tp3} (R:R ${setup.riskReward}:1)`,
      `- **Invalidation:** ${setup.invalidationConditions.join(' ')}`,
      `- **Score Note:** Confluence Quality Score = ${setup.qualityScore}/100 (heuristic rubric only, not win probability).`,
    ].join('\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.json({
      model: 'analyser-quant-engine',
      degraded: true,
      notice: 'GEMINI_API_KEY is not configured; returning direct measured telemetry analysis.',
      measuredFacts,
      answer: buildQuantitativeFallback(),
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Measured Market Facts (JSON):\n${JSON.stringify(measuredFacts, null, 2)}\n\nAnalyst Question:\n${String(prompt)}`,
      config: {
        systemInstruction:
          'You are an institutional Gold (XAUUSD) and Forex quantitative analyst. Structure every reply into two explicit sections: (1) Measured Market Facts (citing exact numbers from the supplied JSON) and (2) Analytical Interpretation (explaining setup quality, invalidation levels, and spread/volatility risks). Never invent prices, never present qualityScore as a win probability, and never guarantee profits.',
      },
    });
    const text = (response.text || '').trim();
    if (!text) throw new Error('Empty AI response');
    res.json({
      model: 'gemini-4-hydrogen',
      degraded: false,
      measuredFacts,
      answer: text,
    });
  } catch (err) {
    await logSystemError('analyser-ai', err instanceof Error ? err.message : 'AI assistant degraded', 'warn');
    res.json({
      model: 'analyser-quant-engine',
      degraded: true,
      notice: 'AI narrative service temporarily unavailable; displaying deterministic telemetry analysis.',
      measuredFacts,
      answer: buildQuantitativeFallback(),
    });
  }
});

// 8. Walk-Forward Strategy Laboratory Backtest
router.post('/analyser/backtest', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const result = await runIndependentWalkForwardBacktest({
    instrument: String(b.instrument || 'XAUUSD'),
    timeframe: (String(b.timeframe || 'M15').toUpperCase() as AnalyserTimeframe) || 'M15',
    strategyName: String(b.strategyName || 'EMA20/50 + RSI Walk-Forward'),
    riskUsdPerTrade: Number(b.riskUsdPerTrade ?? 25),
    spreadPipsCost: b.spreadPipsCost !== undefined ? Number(b.spreadPipsCost) : undefined,
    commissionPerLotUsd: b.commissionPerLotUsd !== undefined ? Number(b.commissionPerLotUsd) : 7,
    slippagePips: b.slippagePips !== undefined ? Number(b.slippagePips) : 0.5,
  });
  res.json({ backtest: result });
});

// 9. Controlled Multi-Venue Execution Router (Honest Routing Enforcement)
router.post('/analyser/execute', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const instrument = String(b.instrument || 'XAUUSD').toUpperCase();
  const side = String(b.side || 'BUY').toUpperCase();
  const mode = String(b.executionMode || 'signal-only').toLowerCase() as
    | 'demo'
    | 'signal-only'
    | 'assisted'
    | 'authorized-auto';
  const lots = Math.max(0.01, Math.min(10, Number(b.lots || 0.05)));
  const entryPrice = Number(b.entryPrice || 0);
  const stopLoss = b.stopLoss ? Number(b.stopLoss) : null;
  const takeProfit = b.takeProfit ? Number(b.takeProfit) : null;
  const signalId = b.signalId ? Number(b.signalId) : null;

  // Deriv synthetic/options symbols route ONLY to Deriv venue
  const isDerivSymbol = /^(1HZ|R_|BOOM|CRASH|JD|WLDAUD|frx|cry)/.test(String(b.symbol || ''));
  if (isDerivSymbol && b.symbol) {
    const order = await placeUnifiedOrder({
      userId: req.user!.id,
      symbol: String(b.symbol),
      side,
      contractType: side === 'SELL' ? 'MULTDOWN' : 'MULTUP',
      lots,
      stake: Number(b.stake || 10),
      multiplier: 100,
      slPrice: stopLoss,
      tpPrice: takeProfit,
      executionMode: mode === 'authorized-auto' ? 'deriv' : 'virtual',
      accountMode: mode === 'authorized-auto' ? 'real' : 'demo',
      source: 'manual',
      strategyKey: 'analyser_deriv_route',
      timeframe: String(b.timeframe || 'M15'),
    });
    res.status(201).json({ venue: 'deriv', status: 'executed', order });
    return;
  }

  // Forex & XAUUSD NEVER route through Deriv Options; they route strictly via MT5 EA Bridge or signal-only
  const bridges = await query<any>(
    'SELECT * FROM mt5_bridge_connections WHERE user_id = $1 ORDER BY id DESC',
    [req.user!.id]
  );
  const liveBridge = bridges.find(
    (br) =>
      br.status === 'connected' &&
      br.last_heartbeat_at &&
      Date.now() - new Date(br.last_heartbeat_at).getTime() <= 45000
  );

  if (!liveBridge || mode === 'signal-only' || mode === 'demo') {
    const effectiveStatus = !liveBridge && (mode === 'authorized-auto' || mode === 'assisted')
      ? 'signal_only_no_bridge'
      : mode === 'demo'
        ? 'demo_simulated'
        : 'signal_only';
    const note =
      !liveBridge && (mode === 'authorized-auto' || mode === 'assisted')
        ? `No live MT5 EA Bridge heartbeat active for ${instrument}. Degraded cleanly to Signal-Only audit record without fabricating a broker fill.`
        : `Recorded ${instrument} ${side} setup in ${mode} mode.`;

    const queued = await queryOne<any>(
      `INSERT INTO mt5_bridge_orders (
        bridge_id, user_id, signal_id, symbol, side, volume_lots, requested_price, stop_loss, take_profit,
        status, execution_mode, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        liveBridge?.id || null,
        req.user!.id,
        signalId,
        instrument,
        side,
        lots,
        entryPrice || independentFeed.getQuote(instrument).mid,
        stopLoss,
        takeProfit,
        effectiveStatus,
        !liveBridge ? 'signal-only' : mode,
        note,
      ]
    );
    res.status(201).json({
      venue: 'mt5_bridge',
      degradedToSignalOnly: !liveBridge,
      message: note,
      order: queued,
    });
    return;
  }

  // Active live MT5 EA Bridge connected -> queue real MT5 EA Bridge instruction for EA polling
  const queued = await queryOne<any>(
    `INSERT INTO mt5_bridge_orders (
      bridge_id, user_id, signal_id, symbol, side, volume_lots, requested_price, stop_loss, take_profit,
      status, execution_mode, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10, '')
    RETURNING *`,
    [
      liveBridge.id,
      req.user!.id,
      signalId,
      instrument,
      side,
      lots,
      entryPrice || independentFeed.getQuote(instrument).mid,
      stopLoss,
      takeProfit,
      mode,
    ]
  );

  res.status(201).json({
    venue: 'mt5_bridge',
    degradedToSignalOnly: false,
    message: `Queued ${instrument} ${side} (${lots} lots) for MT5 EA Bridge "${liveBridge.bridge_name}" (${liveBridge.broker_name || 'Connected Terminal'}).`,
    order: queued,
  });
});

export default router;
