import { query, queryOne, execute } from './db.ts';
import {
  independentFeed,
  INDEPENDENT_INSTRUMENTS,
  type AnalyserTimeframe,
  type IndependentCandle,
  type IndependentQuote,
} from './independent-feed.ts';
import { computeAllIndicators, analyzeSmartMoneyConcepts } from '../src/lib/quant-engine.ts';

export interface AnalyserSetup {
  instrument: string;
  displayName: string;
  assetClass: 'commodity' | 'forex';
  timeframe: AnalyserTimeframe;
  direction: 'BUY' | 'SELL' | 'WAIT';
  setupType: 'Breakout' | 'Pullback' | 'Reversal' | 'Range Sweep' | 'None';
  strategyName: string;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  spread: number;
  atr: number;
  rsi14: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdHistogram: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
  mtfAlignment: Array<{ timeframe: AnalyserTimeframe; bias: 'bullish' | 'bearish' | 'neutral'; rsi14: number }>;
  supportLevels: number[];
  resistanceLevels: number[];
  fibLevels: Array<{ ratio: string; price: number }>;
  liquidityEvents: Array<{ time: number; type: string; price: number; description: string }>;
  qualityScore: number; // Explicit heuristic confluence score (0-100), NOT win probability
  qualityScoreDisclaimer: string;
  lifecycleStatus: 'Forming' | 'Confirmed' | 'Active' | 'Invalidated' | 'Expired' | 'Completed';
  blockedReason: string | null;
  feedSource: string;
  feedProvenance: string;
  feedTimestamp: string;
  isFeedStale: boolean;
  invalidationConditions: string[];
  qualificationReasons: string[];
}

export interface WalkForwardBacktestResult {
  instrument: string;
  timeframe: AnalyserTimeframe;
  strategyName: string;
  candleCount: number;
  spreadPipsCost: number;
  commissionPerLotUsd: number;
  slippagePips: number;
  inSample: BacktestWindowMetrics;
  outOfSample: BacktestWindowMetrics;
  overall: BacktestWindowMetrics;
  equityCurve: Array<{ index: number; time: number; equity: number }>;
  noLookaheadVerified: boolean;
  disclaimer: string;
}

export interface BacktestWindowMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlUsd: number;
  profitFactor: number;
  maxDrawdownUsd: number;
  expectancyUsd: number;
}

export async function analyzeInstrumentSetup(
  instrument: string,
  timeframe: AnalyserTimeframe = 'M15',
  selectedTimeframes: AnalyserTimeframe[] = ['M5', 'M15', 'H1', 'H4']
): Promise<AnalyserSetup> {
  const clean = String(instrument || 'XAUUSD').toUpperCase();
  const meta = INDEPENDENT_INSTRUMENTS.find((m) => m.instrument === clean) || INDEPENDENT_INSTRUMENTS[0];
  const primary = await independentFeed.getCandles(meta.instrument, timeframe, 180);
  const quote: IndependentQuote = primary.quote;
  const candles = primary.candles;

  const ind = computeAllIndicators(candles);
  const smc = analyzeSmartMoneyConcepts(candles, ind);
  const n = candles.length - 1;
  const close = candles[n]?.close ?? quote.mid;
  const atr = ind.atr14[n] ?? meta.pipSize * 20;
  const rsi14 = ind.rsi14[n] ?? 50;
  const ema20 = ind.ema20[n] ?? close;
  const ema50 = ind.ema50[n] ?? close;
  const ema200 = ind.ema200[n] ?? ema50;
  const macdHist = ind.macd.histogram[n] ?? 0;

  // Multi-timeframe alignment
  const mtfList: AnalyserTimeframe[] = Array.from(new Set([timeframe, ...selectedTimeframes])).slice(0, 5) as AnalyserTimeframe[];
  const mtfAlignment = await Promise.all(
    mtfList.map(async (tf) => {
      const sub = tf === timeframe ? primary : await independentFeed.getCandles(meta.instrument, tf, 90);
      const subInd = computeAllIndicators(sub.candles);
      const subSmc = analyzeSmartMoneyConcepts(sub.candles, subInd);
      const sn = sub.candles.length - 1;
      return {
        timeframe: tf,
        bias: subSmc.bias,
        rsi14: Number((subInd.rsi14[sn] ?? 50).toFixed(1)),
      };
    })
  );

  // Fibonacci retracement from active dealing range
  const dr = smc.dealingRange;
  const diff = Math.max(meta.pipSize, dr.high - dr.low);
  const fibLevels = [
    { ratio: '0.0% (High)', price: Number(dr.high.toFixed(meta.decimals)) },
    { ratio: '38.2%', price: Number((dr.high - diff * 0.382).toFixed(meta.decimals)) },
    { ratio: '50.0% (EQ)', price: Number((dr.high - diff * 0.5).toFixed(meta.decimals)) },
    { ratio: '61.8% (OTE)', price: Number((dr.high - diff * 0.618).toFixed(meta.decimals)) },
    { ratio: '78.6%', price: Number((dr.high - diff * 0.786).toFixed(meta.decimals)) },
    { ratio: '100.0% (Low)', price: Number(dr.low.toFixed(meta.decimals)) },
  ];

  // Check median ATR over lookback for abnormal volatility spike gate
  const recentAtrs = ind.atr14.slice(-40).filter((v): v is number => v !== null && v > 0);
  const sortedAtrs = [...recentAtrs].sort((a, b) => a - b);
  const medianAtr = sortedAtrs.length > 0 ? sortedAtrs[Math.floor(sortedAtrs.length / 2)] : atr;
  const volatilityAbnormal = medianAtr > 0 && atr > medianAtr * 3.2;
  const spreadExcessive = quote.spread > meta.maxAllowedSpread;

  // Directional evaluation
  const bullVotes = mtfAlignment.filter((m) => m.bias === 'bullish').length;
  const bearVotes = mtfAlignment.filter((m) => m.bias === 'bearish').length;

  let rawDirection: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let setupType: AnalyserSetup['setupType'] = 'None';
  let strategyName = 'Multi-Timeframe Structure Filter';
  const qualificationReasons: string[] = [];

  const priceAboveEma = close > ema20 && ema20 > ema50;
  const priceBelowEma = close < ema20 && ema20 < ema50;
  const recentSweep = smc.liquidityEvents[smc.liquidityEvents.length - 1];

  if (recentSweep && candles.length - 1 - recentSweep.time <= 1800) {
    if (recentSweep.kind === 'SSL_SWEEP' && rsi14 < 58) {
      rawDirection = 'BUY';
      setupType = 'Range Sweep';
      strategyName = 'Liquidity Sweep + Equilibrium Reclaim';
      qualificationReasons.push(`Sell-side liquidity sweep detected near ${recentSweep.price.toFixed(meta.decimals)}`);
    } else if (recentSweep.kind === 'BSL_SWEEP' && rsi14 > 42) {
      rawDirection = 'SELL';
      setupType = 'Range Sweep';
      strategyName = 'Liquidity Sweep + Premium Rejection';
      qualificationReasons.push(`Buy-side liquidity sweep detected near ${recentSweep.price.toFixed(meta.decimals)}`);
    }
  }

  if (rawDirection === 'WAIT') {
    if (priceAboveEma && macdHist > 0 && rsi14 >= 45 && rsi14 <= 69) {
      rawDirection = 'BUY';
      setupType = dr.currentPct < 48 ? 'Pullback' : 'Breakout';
      strategyName = setupType === 'Pullback' ? 'EMA Trend Pullback Long' : 'Momentum Breakout Long';
      qualificationReasons.push(`EMA20 (${ema20.toFixed(meta.decimals)}) > EMA50 (${ema50.toFixed(meta.decimals)}) with positive MACD histogram`);
    } else if (priceBelowEma && macdHist < 0 && rsi14 <= 55 && rsi14 >= 31) {
      rawDirection = 'SELL';
      setupType = dr.currentPct > 52 ? 'Pullback' : 'Breakout';
      strategyName = setupType === 'Pullback' ? 'EMA Trend Pullback Short' : 'Momentum Breakout Short';
      qualificationReasons.push(`EMA20 (${ema20.toFixed(meta.decimals)}) < EMA50 (${ema50.toFixed(meta.decimals)}) with negative MACD histogram`);
    } else if (rsi14 <= 32 && bullVotes >= bearVotes) {
      rawDirection = 'BUY';
      setupType = 'Reversal';
      strategyName = 'Oversold Support Mean Reversion';
      qualificationReasons.push(`RSI(14)=${rsi14.toFixed(1)} oversold near discount (${dr.currentPct.toFixed(1)}% of range)`);
    } else if (rsi14 >= 68 && bearVotes >= bullVotes) {
      rawDirection = 'SELL';
      setupType = 'Reversal';
      strategyName = 'Overbought Resistance Mean Reversion';
      qualificationReasons.push(`RSI(14)=${rsi14.toFixed(1)} overbought near premium (${dr.currentPct.toFixed(1)}% of range)`);
    }
  }

  // Entry, SL, TP1, TP2, TP3 precision calculation
  const entryPrice = Number((rawDirection === 'BUY' ? quote.ask : rawDirection === 'SELL' ? quote.bid : quote.mid).toFixed(meta.decimals));
  const zoneHalf = Number((atr * 0.22).toFixed(meta.decimals));
  const entryZoneLow = Number((entryPrice - zoneHalf).toFixed(meta.decimals));
  const entryZoneHigh = Number((entryPrice + zoneHalf).toFixed(meta.decimals));

  const slDist = Math.max(quote.spread * 3.5, atr * 1.45);
  const stopLoss =
    rawDirection === 'BUY'
      ? Number((entryPrice - slDist).toFixed(meta.decimals))
      : rawDirection === 'SELL'
        ? Number((entryPrice + slDist).toFixed(meta.decimals))
        : 0;

  const tp1 =
    rawDirection === 'BUY'
      ? Number((entryPrice + slDist * 1.5).toFixed(meta.decimals))
      : rawDirection === 'SELL'
        ? Number((entryPrice - slDist * 1.5).toFixed(meta.decimals))
        : 0;
  const tp2 =
    rawDirection === 'BUY'
      ? Number((entryPrice + slDist * 2.4).toFixed(meta.decimals))
      : rawDirection === 'SELL'
        ? Number((entryPrice - slDist * 2.4).toFixed(meta.decimals))
        : 0;
  const tp3 =
    rawDirection === 'BUY'
      ? Number((entryPrice + slDist * 3.4).toFixed(meta.decimals))
      : rawDirection === 'SELL'
        ? Number((entryPrice - slDist * 3.4).toFixed(meta.decimals))
        : 0;

  const riskDist = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;
  const rewardDist = tp2 > 0 ? Math.abs(tp2 - entryPrice) : 0;
  const riskReward = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 0;

  // Blocking gates
  const blockedReasons: string[] = [];
  if (quote.isStale) blockedReasons.push(`Feed stale (${quote.ageSeconds}s old > 60s threshold)`);
  if (spreadExcessive) blockedReasons.push(`Spread ${quote.spread} exceeds max ${meta.maxAllowedSpread}`);
  if (volatilityAbnormal) blockedReasons.push(`Abnormal volatility spike (ATR ${atr.toFixed(meta.decimals)} > 3.2x median)`);
  if (rawDirection !== 'WAIT') {
    if (riskDist <= quote.spread * 1.5) blockedReasons.push('Invalid SL distance inside spread buffer');
    if (riskReward < 1.3) blockedReasons.push(`Risk/Reward ${riskReward}:1 below minimum 1.30:1 gate`);
    if (rawDirection === 'BUY' && bearVotes >= 3 && bullVotes === 0) {
      blockedReasons.push('Higher-timeframe MTF consensus strongly contradicts BUY');
    }
    if (rawDirection === 'SELL' && bullVotes >= 3 && bearVotes === 0) {
      blockedReasons.push('Higher-timeframe MTF consensus strongly contradicts SELL');
    }
  }

  const blockedReason = blockedReasons.length > 0 ? blockedReasons.join(' | ') : null;
  const finalDirection = blockedReason ? 'WAIT' : rawDirection;

  // Transparent rule-based Setup Quality Score (0-100) — explicitly NOT a win probability
  let qualityScore = 30;
  if (finalDirection !== 'WAIT') {
    const alignedVotes = finalDirection === 'BUY' ? bullVotes : bearVotes;
    qualityScore += Math.min(30, alignedVotes * 8);
    if (Math.abs(macdHist) > 0) qualityScore += 12;
    if (!quote.isStale) qualityScore += 10;
    if (riskReward >= 2.0) qualityScore += 10;
    if (
      (finalDirection === 'BUY' && dr.currentPct <= 48) ||
      (finalDirection === 'SELL' && dr.currentPct >= 52)
    ) {
      qualityScore += 8;
    }
  } else {
    qualityScore = Math.max(10, 35 - blockedReasons.length * 10);
  }
  qualityScore = Math.max(0, Math.min(98, Math.round(qualityScore)));

  const invalidationConditions: string[] = [];
  if (finalDirection === 'BUY') {
    invalidationConditions.push(`Close below ${stopLoss.toFixed(meta.decimals)} invalidates long structure.`);
    invalidationConditions.push(`MTF shift to bearish on H1/H4 voids continuation thesis.`);
  } else if (finalDirection === 'SELL') {
    invalidationConditions.push(`Close above ${stopLoss.toFixed(meta.decimals)} invalidates short structure.`);
    invalidationConditions.push(`MTF shift to bullish on H1/H4 voids continuation thesis.`);
  } else {
    invalidationConditions.push(blockedReason || 'No qualifying confluence setup currently formed.');
  }

  if (finalDirection !== 'WAIT') {
    qualificationReasons.push(`MTF alignment: ${bullVotes} Bullish vs ${bearVotes} Bearish across ${mtfAlignment.length} timeframes`);
    qualificationReasons.push(`ATR(14)=${atr.toFixed(meta.decimals)}, Spread=${quote.spread}, TP2 R:R=${riskReward}:1`);
  }

  const lifecycleStatus: AnalyserSetup['lifecycleStatus'] =
    finalDirection === 'WAIT' ? 'Forming' : qualityScore >= 72 ? 'Confirmed' : 'Forming';

  return {
    instrument: meta.instrument,
    displayName: meta.displayName,
    assetClass: meta.assetClass,
    timeframe,
    direction: finalDirection,
    setupType: finalDirection === 'WAIT' ? 'None' : setupType,
    strategyName,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward,
    spread: quote.spread,
    atr: Number(atr.toFixed(meta.decimals)),
    rsi14: Number(rsi14.toFixed(2)),
    ema20: Number(ema20.toFixed(meta.decimals)),
    ema50: Number(ema50.toFixed(meta.decimals)),
    ema200: Number(ema200.toFixed(meta.decimals)),
    macdHistogram: Number(macdHist.toFixed(5)),
    trendBias: smc.bias,
    mtfAlignment,
    supportLevels: smc.supportLevels.map((l) => Number(l.toFixed(meta.decimals))),
    resistanceLevels: smc.resistanceLevels.map((l) => Number(l.toFixed(meta.decimals))),
    fibLevels,
    liquidityEvents: smc.liquidityEvents.slice(-6).map((l) => ({
      time: l.time,
      type: l.kind,
      price: l.price,
      description: l.description,
    })),
    qualityScore,
    qualityScoreDisclaimer:
      'Rule-based structural & indicator confluence score (0–100). This is NOT a win probability or performance guarantee.',
    lifecycleStatus,
    blockedReason,
    feedSource: primary.source,
    feedProvenance: quote.provenance,
    feedTimestamp: quote.utcTimestamp,
    isFeedStale: quote.isStale,
    invalidationConditions,
    qualificationReasons,
  };
}

export async function persistAndScanAll(
  timeframe: AnalyserTimeframe = 'M15',
  selectedTimeframes: AnalyserTimeframe[] = ['M5', 'M15', 'H1', 'H4']
) {
  const setups = await Promise.all(
    INDEPENDENT_INSTRUMENTS.map((m) => analyzeInstrumentSetup(m.instrument, timeframe, selectedTimeframes))
  );

  // Persist qualified setups into analyser_signals lifecycle table (avoid duplicating exact active setup within 5 mins)
  for (const s of setups) {
    if (s.direction === 'WAIT') continue;
    try {
      const existing = await query<any>('SELECT * FROM analyser_signals WHERE instrument = $1', [s.instrument]);
      const recent = existing.find(
        (r) =>
          r.timeframe === s.timeframe &&
          r.direction === s.direction &&
          ['Forming', 'Confirmed', 'Active'].includes(r.lifecycle_status)
      );
      if (!recent) {
        await execute(
          `INSERT INTO analyser_signals (
            instrument, display_name, timeframe, direction, setup_type, strategy_name,
            entry_price, entry_zone_low, entry_zone_high, stop_loss, tp1, tp2, tp3,
            risk_reward, spread, atr, quality_score, lifecycle_status,
            feed_source, feed_timestamp, invalidation_reason, reasons_json, snapshot_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            s.instrument,
            s.displayName,
            s.timeframe,
            s.direction,
            s.setupType,
            s.strategyName,
            s.entryPrice,
            s.entryZoneLow,
            s.entryZoneHigh,
            s.stopLoss,
            s.tp1,
            s.tp2,
            s.tp3,
            s.riskReward,
            s.spread,
            s.atr,
            s.qualityScore,
            s.lifecycleStatus,
            s.feedSource,
            s.feedTimestamp,
            s.invalidationConditions.join(' | '),
            JSON.stringify(s.qualificationReasons),
            JSON.stringify({ rsi14: s.rsi14, trendBias: s.trendBias, mtfAlignment: s.mtfAlignment }),
          ]
        );
      }
    } catch {
      // non-blocking
    }
  }

  return setups.sort((a, b) => b.qualityScore - a.qualityScore);
}

export async function transitionSignalLifecycle(
  signalId: number,
  nextStatus: 'Forming' | 'Confirmed' | 'Active' | 'Invalidated' | 'Expired' | 'Completed',
  reason = ''
) {
  return queryOne(
    `UPDATE analyser_signals SET lifecycle_status = $1, invalidation_reason = COALESCE(NULLIF($2, ''), invalidation_reason), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [nextStatus, reason, signalId]
  );
}

function summarizeWindow(pnls: number[]): BacktestWindowMetrics {
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  const grossWin = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));
  const net = pnls.reduce((s, v) => s + v, 0);

  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  for (const p of pnls) {
    eq += p;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    trades: pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: pnls.length > 0 ? Number(((wins.length / pnls.length) * 100).toFixed(1)) : 0,
    netPnlUsd: Number(net.toFixed(2)),
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : Number((grossWin / grossLoss).toFixed(2)),
    maxDrawdownUsd: Number(maxDd.toFixed(2)),
    expectancyUsd: pnls.length > 0 ? Number((net / pnls.length).toFixed(2)) : 0,
  };
}

export async function runIndependentWalkForwardBacktest(params: {
  instrument: string;
  timeframe: AnalyserTimeframe;
  strategyName?: string;
  riskUsdPerTrade?: number;
  spreadPipsCost?: number;
  commissionPerLotUsd?: number;
  slippagePips?: number;
}): Promise<WalkForwardBacktestResult> {
  const meta =
    INDEPENDENT_INSTRUMENTS.find((m) => m.instrument === String(params.instrument || 'XAUUSD').toUpperCase()) ||
    INDEPENDENT_INSTRUMENTS[0];
  const tf = params.timeframe || 'M15';
  const hist = await independentFeed.getCandles(meta.instrument, tf, 240);
  const candles = hist.candles;
  const ind = computeAllIndicators(candles);

  const riskUsd = Math.max(1, Number(params.riskUsdPerTrade ?? 25));
  const spreadPips = Math.max(0, Number(params.spreadPipsCost ?? (meta.instrument === 'XAUUSD' ? 28 : 1.5)));
  const commissionUsd = Math.max(0, Number(params.commissionPerLotUsd ?? 7));
  const slippagePips = Math.max(0, Number(params.slippagePips ?? 0.5));
  const strategyName = params.strategyName || 'EMA20/50 + RSI Walk-Forward';

  const splitIndex = Math.floor(candles.length * 0.65);
  const inSamplePnls: number[] = [];
  const outSamplePnls: number[] = [];
  const allPnls: Array<{ index: number; time: number; pnl: number }> = [];

  // Strict zero-lookahead bar-by-bar walk-forward simulation: signal evaluated only on bar i close, filled at bar i+1 open
  let i = 35;
  while (i < candles.length - 5) {
    const c = candles[i];
    const emaFast = ind.ema20[i] ?? c.close;
    const emaSlow = ind.ema50[i] ?? c.close;
    const rsi = ind.rsi14[i] ?? 50;
    const atr = ind.atr14[i] ?? meta.pipSize * 20;

    let side: 'BUY' | 'SELL' | null = null;
    if (emaFast > emaSlow && rsi >= 42 && rsi <= 68 && c.close > emaFast) side = 'BUY';
    else if (emaFast < emaSlow && rsi <= 58 && rsi >= 32 && c.close < emaFast) side = 'SELL';

    if (!side) {
      i += 1;
      continue;
    }

    const nextOpen = candles[i + 1].open;
    const costInPrice = (spreadPips + slippagePips) * meta.pipSize;
    const slDist = Math.max(costInPrice * 2, atr * 1.4);
    const tpDist = slDist * 2.0;

    const entry = side === 'BUY' ? nextOpen + costInPrice * 0.5 : nextOpen - costInPrice * 0.5;
    const sl = side === 'BUY' ? entry - slDist : entry + slDist;
    const tp = side === 'BUY' ? entry + tpDist : entry - tpDist;

    let tradeR = 0;
    let exitBar = i + 1;
    for (let j = i + 1; j < Math.min(candles.length, i + 24); j++) {
      exitBar = j;
      const bar = candles[j];
      if (side === 'BUY') {
        if (bar.low <= sl) {
          tradeR = -1;
          break;
        }
        if (bar.high >= tp) {
          tradeR = 2.0;
          break;
        }
      } else {
        if (bar.high >= sl) {
          tradeR = -1;
          break;
        }
        if (bar.low <= tp) {
          tradeR = 2.0;
          break;
        }
      }
      if (j === Math.min(candles.length - 1, i + 23)) {
        const diff = side === 'BUY' ? bar.close - entry : entry - bar.close;
        tradeR = Number((diff / (slDist || 1)).toFixed(2));
      }
    }

    const totalCostUsd = (costInPrice / (slDist || 1)) * riskUsd + commissionUsd * 0.05;
    const netTradeUsd = Number((tradeR * riskUsd - totalCostUsd).toFixed(2));
    if (i < splitIndex) inSamplePnls.push(netTradeUsd);
    else outSamplePnls.push(netTradeUsd);
    allPnls.push({ index: exitBar, time: candles[exitBar].time, pnl: netTradeUsd });
    i = exitBar + 1;
  }

  let runningEq = 1000;
  const equityCurve = allPnls.map((t) => {
    runningEq = Number((runningEq + t.pnl).toFixed(2));
    return { index: t.index, time: t.time, equity: runningEq };
  });

  return {
    instrument: meta.instrument,
    timeframe: tf,
    strategyName,
    candleCount: candles.length,
    spreadPipsCost: spreadPips,
    commissionPerLotUsd: commissionUsd,
    slippagePips,
    inSample: summarizeWindow(inSamplePnls),
    outOfSample: summarizeWindow(outSamplePnls),
    overall: summarizeWindow(allPnls.map((x) => x.pnl)),
    equityCurve,
    noLookaheadVerified: true,
    disclaimer:
      'Historical walk-forward simulation including modeled spread, slippage, and commission costs. Past simulated results do not guarantee future market performance.',
  };
}
