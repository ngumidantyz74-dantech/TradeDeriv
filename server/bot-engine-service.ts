import { query, queryOne, execute, addNotification } from './db.ts';
import { derivWs, type TickData } from './deriv-client.ts';
import { placeUnifiedOrder, closeOrderById, bulkCloseOrders } from './trade-execution.ts';
import { computeAllIndicators, analyzeSmartMoneyConcepts } from '../src/lib/quant-engine.ts';

export interface AstMarketSelection {
  instrument: string;
  category: string;
  timeframe: string; // '1m', '5m', '15m', etc.
  granularity: number;
  contractType: string;
}

export interface AstAnalysisCondition {
  id: string;
  type:
    | 'rsi_condition'
    | 'ema_crossover'
    | 'macd_condition'
    | 'bollinger_condition'
    | 'sr_condition'
    | 'trend_condition'
    | 'price_movement'
    | 'market_structure';
  params: Record<string, string | number | boolean>;
}

export interface AstTradingAction {
  type: 'BUY' | 'SELL' | 'WAIT' | 'CLOSE' | 'SET_STAKE' | 'SET_DURATION' | 'EVALUATE_OUTCOME';
  params: Record<string, string | number | boolean>;
}

export interface AstRiskManagement {
  maxStake: number;
  maxDailyLoss: number;
  takeProfit: number;
  stopLoss: number;
  cooldownSeconds: number;
  maxConsecutiveLosses: number;
  maxSessions: number;
  martingaleFactor: number;
}

export interface BotStrategyAst {
  version: '1.0';
  name: string;
  market: AstMarketSelection;
  conditions: AstAnalysisCondition[];
  conditionLogic: 'ALL' | 'ANY';
  actions: AstTradingAction[];
  risk: AstRiskManagement;
}

export interface BotSessionConfig {
  userId: number;
  botDefinitionId?: number | null;
  strategyName: string;
  symbol: string;
  contractType: string;
  baseStake: number;
  barrier?: string;
  duration?: number;
  durationUnit?: string;
  multiplier?: number;
  growthRate?: number;
  martingale?: number;
  takeProfit?: number;
  stopLoss?: number;
  maxTrades?: number;
  maxStake?: number;
  maxDailyLoss?: number;
  cooldownSeconds?: number;
  maxConsecutiveLosses?: number;
  maxSessions?: number;
  executionMode?: 'virtual' | 'deriv';
  connectedAccountId?: number | null;
  accountMode?: 'real' | 'demo';
  executionSpeed?: 'fast' | 'normal';
  ast?: BotStrategyAst | null;
}

export interface BotTelemetry {
  runId: number | null;
  botDefinitionId: number | null;
  running: boolean;
  paused: boolean;
  status: 'idle' | 'running' | 'paused' | 'stopped';
  strategyName: string;
  symbol: string;
  contractType: string;
  baseStake: number;
  currentStake: number;
  martingaleStep: number;
  martingaleFactor: number;
  takeProfit: number;
  stopLoss: number;
  maxDailyLoss: number;
  maxStake: number;
  maxTrades: number;
  cooldownSeconds: number;
  maxConsecutiveLosses: number;
  consecutiveLosses: number;
  tickCount: number;
  tradesPlaced: number;
  wins: number;
  losses: number;
  realizedPnl: number;
  startedAt: string;
  lastSignal: string;
  recentPrices: number[];
  accountMode: 'real' | 'demo';
  executionSpeed: 'fast' | 'normal';
}

interface InternalBotSession extends BotTelemetry {
  userId: number;
  barrier: string;
  duration: number;
  durationUnit: string;
  multiplier: number;
  growthRate: number;
  executionMode: 'virtual' | 'deriv';
  connectedAccountId: number | null;
  ast: BotStrategyAst | null;
  unsubscribeTick: (() => void) | null;
  isExecutingTrade: boolean;
  lastTradeAt: number;
  cooldownUntilMs: number;
  lastConditionEvalAt: number;
}

const activeSessions = new Map<number, InternalBotSession>();
const closingOrderLocks = new Set<number>();

const VALID_CONTRACT_TYPES = new Set([
  'MULTUP',
  'MULTDOWN',
  'CALL',
  'PUT',
  'DIGITOVER',
  'DIGITUNDER',
  'DIGITEVEN',
  'DIGITODD',
  'DIGITMATCH',
  'DIGITDIFF',
  'ACCU',
]);

const VALID_CONDITION_TYPES = new Set([
  'rsi_condition',
  'ema_crossover',
  'macd_condition',
  'bollinger_condition',
  'sr_condition',
  'trend_condition',
  'price_movement',
  'market_structure',
]);

export function validateBotAst(raw: any): { valid: boolean; errors: string[]; ast?: BotStrategyAst } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Strategy AST must be a JSON object.'] };
  }

  const name = String(raw.name || '').trim();
  if (!name || name.length > 80) errors.push('Strategy name must be 1–80 characters.');

  const m = raw.market || {};
  const instrument = String(m.instrument || m.symbol || '1HZ100V').trim();
  const category = String(m.category || 'Synthetic').trim();
  const timeframe = String(m.timeframe || '1m').trim();
  const granularity = Math.max(1, Number(m.granularity || 60));
  const contractType = String(m.contractType || 'DIGITOVER').toUpperCase().trim();
  if (!instrument) errors.push('Market instrument is required.');
  if (!VALID_CONTRACT_TYPES.has(contractType)) {
    errors.push(`Unsupported contractType "${contractType}".`);
  }

  const rawConditions = Array.isArray(raw.conditions) ? raw.conditions : [];
  const conditions: AstAnalysisCondition[] = [];
  for (const c of rawConditions) {
    if (!c || typeof c !== 'object' || !VALID_CONDITION_TYPES.has(c.type)) {
      errors.push(`Invalid analysis block type: "${String(c?.type || 'unknown')}".`);
      continue;
    }
    conditions.push({
      id: String(c.id || `cond_${conditions.length + 1}`),
      type: c.type,
      params: typeof c.params === 'object' && c.params ? c.params : {},
    });
  }

  const rawActions = Array.isArray(raw.actions) ? raw.actions : [];
  const actions: AstTradingAction[] = [];
  for (const a of rawActions) {
    const t = String(a?.type || '').toUpperCase();
    if (!['BUY', 'SELL', 'WAIT', 'CLOSE', 'SET_STAKE', 'SET_DURATION', 'EVALUATE_OUTCOME'].includes(t)) {
      errors.push(`Invalid action block type: "${t}".`);
      continue;
    }
    actions.push({
      type: t as AstTradingAction['type'],
      params: typeof a.params === 'object' && a.params ? a.params : {},
    });
  }
  if (actions.length === 0) {
    errors.push('At least one Trading Action block (e.g. BUY, SELL, or EVALUATE_OUTCOME) is required.');
  }

  const r = raw.risk || {};
  const maxStake = Number(r.maxStake ?? 50);
  const maxDailyLoss = Number(r.maxDailyLoss ?? 50);
  const takeProfit = Number(r.takeProfit ?? 25);
  const stopLoss = Number(r.stopLoss ?? 50);
  const cooldownSeconds = Number(r.cooldownSeconds ?? 0);
  const maxConsecutiveLosses = Number(r.maxConsecutiveLosses ?? 5);
  const maxSessions = Number(r.maxSessions ?? 25);
  const martingaleFactor = Number(r.martingaleFactor ?? 1.5);

  if (!(maxStake >= 0.5 && maxStake <= 5000)) errors.push('Risk maxStake must be between $0.50 and $5,000.');
  if (!(maxDailyLoss >= 1 && maxDailyLoss <= 50000)) errors.push('Risk maxDailyLoss must be positive.');
  if (!(takeProfit > 0)) errors.push('Risk takeProfit must be positive.');
  if (!(stopLoss > 0)) errors.push('Risk stopLoss must be positive.');
  if (martingaleFactor < 1 || martingaleFactor > 4) errors.push('Martingale factor must be between 1.0 and 4.0.');

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    ast: {
      version: '1.0',
      name,
      market: { instrument, category, timeframe, granularity, contractType },
      conditions,
      conditionLogic: raw.conditionLogic === 'ANY' ? 'ANY' : 'ALL',
      actions,
      risk: {
        maxStake,
        maxDailyLoss,
        takeProfit,
        stopLoss,
        cooldownSeconds: Math.max(0, cooldownSeconds),
        maxConsecutiveLosses: Math.max(1, maxConsecutiveLosses),
        maxSessions: Math.max(1, maxSessions),
        martingaleFactor,
      },
    },
  };
}

async function appendBotLog(
  userId: number,
  botRunId: number | null,
  level: 'info' | 'warn' | 'trade' | 'error',
  eventType: string,
  message: string,
  details: Record<string, unknown> = {}
) {
  try {
    await execute(
      `INSERT INTO bot_execution_logs (user_id, bot_run_id, level, event_type, message, details_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, botRunId, level, eventType, message, JSON.stringify(details)]
    );
  } catch {
    // non-blocking telemetry log
  }
}

async function syncBotRunDb(session: InternalBotSession) {
  if (!session.runId) return;
  try {
    await execute(
      `UPDATE bot_runs SET trades_count = $1, wins = $2, losses = $3, realized_pnl = $4,
       current_stake = $5, martingale_step = $6, last_signal = $7, updated_at = NOW()
       WHERE id = $8`,
      [
        session.tradesPlaced,
        session.wins,
        session.losses,
        session.realizedPnl,
        session.currentStake,
        session.martingaleStep,
        session.lastSignal,
        session.runId,
      ]
    );
  } catch {
    // non-blocking
  }
}

function getLastDigit(price: number, pipSize = 0.01): number {
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const s = price.toFixed(decimals);
  return Number(s[s.length - 1] || 0);
}

async function evaluateAstConditions(
  session: InternalBotSession,
  latestPrice: number
): Promise<{ matched: boolean; directionHint: 'BUY' | 'SELL' | null; summary: string }> {
  const ast = session.ast;
  if (!ast || ast.conditions.length === 0) {
    return { matched: true, directionHint: null, summary: 'No condition filter -> ready' };
  }

  const gran = Math.max(60, Number(ast.market.granularity || 60));
  const detailed = await derivWs.fetchCandlesDetailed(session.symbol, gran, 120);
  if (detailed.candles.length < 30) {
    return { matched: false, directionHint: null, summary: 'Waiting for minimum candle history (30 bars)' };
  }

  const candles = detailed.candles;
  const ind = computeAllIndicators(candles);
  const smc = analyzeSmartMoneyConcepts(candles, ind);
  const n = candles.length - 1;
  const prev = Math.max(0, n - 1);

  const checks: Array<{ pass: boolean; hint: 'BUY' | 'SELL' | null; label: string }> = [];

  for (const cond of ast.conditions) {
    const p = cond.params || {};
    if (cond.type === 'rsi_condition') {
      const rsi = ind.rsi14[n] ?? 50;
      const op = String(p.operator || 'below');
      const threshold = Number(p.threshold ?? (op === 'below' ? 35 : 65));
      const pass = op === 'above' ? rsi > threshold : op === 'between' ? rsi >= 40 && rsi <= 60 : rsi < threshold;
      checks.push({
        pass,
        hint: op === 'below' ? 'BUY' : op === 'above' ? 'SELL' : null,
        label: `RSI(14)=${rsi.toFixed(1)} ${op} ${threshold}`,
      });
    } else if (cond.type === 'ema_crossover') {
      const emaFastNow = ind.ema9[n] ?? latestPrice;
      const emaSlowNow = ind.ema20[n] ?? latestPrice;
      const emaFastPrev = ind.ema9[prev] ?? latestPrice;
      const emaSlowPrev = ind.ema20[prev] ?? latestPrice;
      const dir = String(p.direction || 'bullish');
      const bull = emaFastNow > emaSlowNow && emaFastPrev <= emaSlowPrev * 1.0005;
      const bear = emaFastNow < emaSlowNow && emaFastPrev >= emaSlowPrev * 0.9995;
      const alignedBull = emaFastNow > emaSlowNow;
      const alignedBear = emaFastNow < emaSlowNow;
      const pass = dir === 'bearish' ? bear || alignedBear : dir === 'either' ? alignedBull || alignedBear : bull || alignedBull;
      checks.push({
        pass,
        hint: alignedBull ? 'BUY' : 'SELL',
        label: `EMA9(${emaFastNow.toFixed(2)}) vs EMA20(${emaSlowNow.toFixed(2)})`,
      });
    } else if (cond.type === 'macd_condition') {
      const hist = ind.macd.histogram[n] ?? 0;
      const line = ind.macd.line[n] ?? 0;
      const sig = ind.macd.signal[n] ?? 0;
      const dir = String(p.direction || 'bullish');
      const pass = dir === 'bearish' ? line < sig && hist < 0 : line > sig && hist > 0;
      checks.push({
        pass,
        hint: dir === 'bearish' ? 'SELL' : 'BUY',
        label: `MACD Hist=${hist.toFixed(4)}`,
      });
    } else if (cond.type === 'bollinger_condition') {
      const upper = ind.bollinger.upper[n] ?? latestPrice;
      const lower = ind.bollinger.lower[n] ?? latestPrice;
      const mode = String(p.mode || 'lower_touch');
      const pass =
        mode === 'upper_touch'
          ? latestPrice >= upper * 0.9995
          : mode === 'squeeze'
            ? (ind.bollinger.bandwidth[n] ?? 0.05) < 0.015
            : latestPrice <= lower * 1.0005;
      checks.push({
        pass,
        hint: mode === 'upper_touch' ? 'SELL' : 'BUY',
        label: `BB(${mode}) @ ${latestPrice.toFixed(2)}`,
      });
    } else if (cond.type === 'sr_condition') {
      const nearSup = smc.supportLevels.some((lvl) => Math.abs(latestPrice - lvl) / latestPrice <= 0.0025);
      const nearRes = smc.resistanceLevels.some((lvl) => Math.abs(latestPrice - lvl) / latestPrice <= 0.0025);
      const mode = String(p.levelType || 'near_support');
      const pass = mode === 'near_resistance' ? nearRes : mode === 'either' ? nearSup || nearRes : nearSup;
      checks.push({
        pass,
        hint: nearRes ? 'SELL' : 'BUY',
        label: `S/R(${mode})`,
      });
    } else if (cond.type === 'trend_condition') {
      const adx = ind.adx14.adx[n] ?? 18;
      const minAdx = Number(p.minAdx ?? 18);
      const dir = String(p.direction || 'any');
      const trendOk = adx >= minAdx && (dir === 'any' || smc.bias === dir);
      checks.push({
        pass: trendOk,
        hint: smc.bias === 'bearish' ? 'SELL' : 'BUY',
        label: `Trend(${smc.bias}, ADX=${adx.toFixed(1)})`,
      });
    } else if (cond.type === 'price_movement') {
      const lookback = Math.max(2, Math.min(20, Number(p.lookbackBars ?? 3)));
      const baseClose = candles[Math.max(0, n - lookback)].close;
      const pctMove = ((latestPrice - baseClose) / (baseClose || 1)) * 100;
      const minPct = Number(p.minMovePct ?? 0.02);
      const dir = String(p.direction || 'either');
      const pass = dir === 'up' ? pctMove >= minPct : dir === 'down' ? pctMove <= -minPct : Math.abs(pctMove) >= minPct;
      checks.push({
        pass,
        hint: pctMove >= 0 ? 'BUY' : 'SELL',
        label: `Delta(${lookback} bars)=${pctMove.toFixed(3)}%`,
      });
    } else if (cond.type === 'market_structure') {
      const requiredBias = String(p.bias || 'bullish');
      const zoneReq = String(p.zone || 'any');
      const biasOk = requiredBias === 'any' || smc.bias === requiredBias;
      const zoneOk = zoneReq === 'any' || smc.dealingRange.zone.toLowerCase().includes(zoneReq.toLowerCase());
      checks.push({
        pass: biasOk && zoneOk,
        hint: smc.bias === 'bearish' ? 'SELL' : 'BUY',
        label: `Structure(${smc.bias} in ${smc.dealingRange.zone})`,
      });
    }
  }

  const matched = ast.conditionLogic === 'ANY' ? checks.some((c) => c.pass) : checks.every((c) => c.pass);
  const firstHint = checks.find((c) => c.pass && c.hint)?.hint || null;
  const summary = checks.map((c) => `${c.pass ? 'PASS' : 'WAIT'}[${c.label}]`).join(' · ');
  return { matched, directionHint: firstHint, summary };
}

function decideBotSide(
  session: InternalBotSession,
  latestPrice: number,
  pipSize: number,
  directionHint: 'BUY' | 'SELL' | null = null
) {
  let ct = session.contractType.toUpperCase();
  const buyAction = session.ast?.actions.find((a) => a.type === 'BUY' || a.type === 'SELL');
  if (buyAction?.type === 'SELL') {
    if (ct === 'MULTUP') ct = 'MULTDOWN';
    if (ct === 'CALL') ct = 'PUT';
  } else if (buyAction?.type === 'BUY') {
    if (ct === 'MULTDOWN') ct = 'MULTUP';
    if (ct === 'PUT') ct = 'CALL';
  } else if (directionHint === 'SELL') {
    if (ct === 'MULTUP') ct = 'MULTDOWN';
    if (ct === 'CALL') ct = 'PUT';
  } else if (directionHint === 'BUY') {
    if (ct === 'MULTDOWN') ct = 'MULTUP';
    if (ct === 'PUT') ct = 'CALL';
  }

  const digit = getLastDigit(latestPrice, pipSize);
  const prices = session.recentPrices;
  const avg5 = prices.length >= 5 ? prices.slice(-5).reduce((a, b) => a + b, 0) / 5 : latestPrice;

  if (ct === 'DIGITOVER') {
    return { contractType: 'DIGITOVER', side: 'OVER', barrier: session.barrier || '2', reason: `Digit ${digit} -> OVER ${session.barrier || '2'}` };
  }
  if (ct === 'DIGITUNDER') {
    return { contractType: 'DIGITUNDER', side: 'UNDER', barrier: session.barrier || '7', reason: `Digit ${digit} -> UNDER ${session.barrier || '7'}` };
  }
  if (ct === 'DIGITEVEN') {
    return { contractType: 'DIGITEVEN', side: 'EVEN', barrier: '', reason: `Parity scan -> EVEN (digit ${digit})` };
  }
  if (ct === 'DIGITODD') {
    return { contractType: 'DIGITODD', side: 'ODD', barrier: '', reason: `Parity scan -> ODD (digit ${digit})` };
  }
  if (ct === 'DIGITDIFF') {
    return { contractType: 'DIGITDIFF', side: 'DIFF', barrier: session.barrier || String(digit), reason: `Differ vs digit ${session.barrier || digit}` };
  }
  if (ct === 'DIGITMATCH') {
    return { contractType: 'DIGITMATCH', side: 'MATCH', barrier: session.barrier || String(digit), reason: `Match target digit ${session.barrier || digit}` };
  }
  if (ct === 'ACCU') {
    return { contractType: 'ACCU', side: 'ACCU', barrier: String(session.growthRate || 0.02), reason: `Accumulator ${Math.round((session.growthRate || 0.02) * 100)}% growth` };
  }
  if (ct === 'CALL' || ct === 'PUT') {
    const chosen = buyAction ? ct : directionHint === 'SELL' ? 'PUT' : directionHint === 'BUY' ? 'CALL' : latestPrice >= avg5 ? 'CALL' : 'PUT';
    return { contractType: chosen, side: chosen, barrier: '', reason: `Spot ${latestPrice.toFixed(2)} vs SMA5 ${avg5.toFixed(2)} -> ${chosen}` };
  }
  if (ct === 'MULTUP' || ct === 'MULTDOWN') {
    const chosen = buyAction ? ct : directionHint === 'SELL' ? 'MULTDOWN' : directionHint === 'BUY' ? 'MULTUP' : latestPrice >= avg5 ? 'MULTUP' : 'MULTDOWN';
    return { contractType: chosen, side: chosen === 'MULTUP' ? 'BUY' : 'SELL', barrier: '', reason: `Trend ${latestPrice.toFixed(2)} -> ${chosen}` };
  }
  return { contractType: 'DIGITOVER', side: 'OVER', barrier: '2', reason: 'Default OVER 2' };
}

function handleSettledOutcome(session: InternalBotSession, pnl: number) {
  session.realizedPnl = Number((session.realizedPnl + pnl).toFixed(2));
  if (pnl >= 0) {
    session.wins += 1;
    session.consecutiveLosses = 0;
    session.currentStake = session.baseStake;
    session.martingaleStep = 0;
  } else {
    session.losses += 1;
    session.consecutiveLosses += 1;
    session.martingaleStep += 1;
    const nextStake = Number((session.currentStake * session.martingaleFactor).toFixed(2));
    session.currentStake = Math.min(session.maxStake, nextStake);
    if (session.cooldownSeconds > 0) {
      session.cooldownUntilMs = Date.now() + session.cooldownSeconds * 1000;
    }
  }
  syncBotRunDb(session).catch(() => {});
  derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
}

async function evaluateAndExecuteBotTick(session: InternalBotSession, tick: TickData): Promise<void> {
  if (!session.running || session.paused) return;
  session.tickCount += 1;
  session.recentPrices.push(tick.quote);
  if (session.recentPrices.length > 25) session.recentPrices.shift();

  const openBotOrders = await query<any>(
    "SELECT * FROM virtual_orders WHERE user_id = $1 AND symbol = $2 AND status = 'OPEN' AND source = 'bot'",
    [session.userId, session.symbol]
  );

  for (const order of openBotOrders) {
    if (closingOrderLocks.has(order.id)) continue;
    if (!['MULTUP', 'MULTDOWN'].includes(order.contract_type)) continue;

    const isUp = order.contract_type === 'MULTUP';
    const pctDiff = (tick.quote - order.entry_price) / (order.entry_price || 1);
    const directional = isUp ? pctDiff : -pctDiff;
    const livePnl = Number(Math.max(-order.stake, directional * order.stake * order.multiplier).toFixed(2));
    await execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [tick.quote, livePnl, order.id]);
    derivWs.emitUserEvent(session.userId, 'order_updated', {
      id: order.id,
      current_price: tick.quote,
      pnl: livePnl,
    });

    const hitTp = order.tp_usd && livePnl >= Number(order.tp_usd);
    const hitSl = order.sl_usd && livePnl <= -Number(order.sl_usd);
    if (hitTp || hitSl) {
      closingOrderLocks.add(order.id);
      closeOrderById(order.id, session.userId)
        .then((closed) => {
          if (closed) {
            handleSettledOutcome(session, Number(closed.pnl || 0));
          }
        })
        .finally(() => closingOrderLocks.delete(order.id))
        .catch(() => {});
    }
  }

  // Risk stops
  if (session.takeProfit > 0 && session.realizedPnl >= session.takeProfit) {
    await stopBotSession(session.userId, `Take Profit target ($${session.takeProfit.toFixed(2)}) reached`);
    return;
  }
  if (session.maxDailyLoss > 0 && session.realizedPnl <= -session.maxDailyLoss) {
    await stopBotSession(session.userId, `Max Daily Loss limit (-$${session.maxDailyLoss.toFixed(2)}) reached`);
    return;
  }
  if (session.stopLoss > 0 && session.realizedPnl <= -session.stopLoss) {
    await stopBotSession(session.userId, `Stop Loss limit (-$${session.stopLoss.toFixed(2)}) reached`);
    return;
  }
  if (session.maxConsecutiveLosses > 0 && session.consecutiveLosses >= session.maxConsecutiveLosses) {
    await stopBotSession(session.userId, `Consecutive loss cap (${session.maxConsecutiveLosses}) triggered`);
    return;
  }
  if (session.maxTrades > 0 && session.tradesPlaced >= session.maxTrades) {
    await stopBotSession(session.userId, `Completed max ${session.maxTrades} bot sessions/trades`);
    return;
  }
  if (session.cooldownUntilMs > Date.now()) {
    const secs = Math.ceil((session.cooldownUntilMs - Date.now()) / 1000);
    session.lastSignal = `Risk cooldown active (${secs}s remaining)`;
    return;
  }

  if (session.isExecutingTrade) return;
  if (session.executionSpeed === 'normal' && Date.now() - session.lastTradeAt < 1800) {
    return;
  }
  const stillOpen = await queryOne<{ c: string }>(
    "SELECT COUNT(*)::text as c FROM virtual_orders WHERE user_id = $1 AND symbol = $2 AND status = 'OPEN' AND source = 'bot'",
    [session.userId, session.symbol]
  );
  if (Number(stillOpen?.c || 0) > 0) return;

  // Evaluate AST visual blocks if configured
  let directionHint: 'BUY' | 'SELL' | null = null;
  if (session.ast && session.ast.conditions.length > 0) {
    if (Date.now() - session.lastConditionEvalAt < 1500 && session.tradesPlaced > 0) return;
    session.lastConditionEvalAt = Date.now();
    const condEval = await evaluateAstConditions(session, tick.quote);
    if (!condEval.matched) {
      session.lastSignal = `Blocked by AST conditions: ${condEval.summary}`;
      derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
      return;
    }
    directionHint = condEval.directionHint;
  }

  // Respect explicit WAIT action if included without BUY/SELL
  if (session.ast && session.ast.actions.some((a) => a.type === 'WAIT') && !session.ast.actions.some((a) => a.type === 'BUY' || a.type === 'SELL')) {
    session.lastSignal = 'Strategy configured in WAIT-only inspection mode';
    return;
  }

  session.isExecutingTrade = true;
  try {
    const decision = decideBotSide(session, tick.quote, tick.pipSize, directionHint);
    session.lastSignal = decision.reason;

    const order = await placeUnifiedOrder({
      userId: session.userId,
      symbol: session.symbol,
      side: decision.side,
      contractType: decision.contractType,
      stake: session.currentStake,
      lots: Number((session.currentStake / 100).toFixed(2)),
      multiplier: session.multiplier,
      growthRate: session.growthRate,
      slUsd: decision.contractType.startsWith('MULT') ? Number((session.currentStake * 0.5).toFixed(2)) : null,
      tpUsd: decision.contractType.startsWith('MULT') || decision.contractType === 'ACCU' ? Number((session.currentStake * 1.0).toFixed(2)) : null,
      barrier: decision.barrier,
      duration: session.duration,
      durationUnit: session.durationUnit,
      executionMode: session.executionMode,
      connectedAccountId: session.connectedAccountId,
      accountMode: session.accountMode,
      strategyKey: session.ast ? `ast:${session.ast.name}` : session.strategyName,
      timeframe: session.ast?.market.timeframe || '1m',
      source: 'bot',
    });

    session.lastTradeAt = Date.now();
    session.tradesPlaced += 1;
    await appendBotLog(
      session.userId,
      session.runId,
      'trade',
      'order_opened',
      `[${session.accountMode.toUpperCase()}] Opened ${decision.contractType} $${session.currentStake} on ${session.symbol} @ ${tick.quote}`,
      { orderId: order.id, reason: decision.reason }
    );
    await syncBotRunDb(session);

    derivWs.emitUserEvent(session.userId, 'bot_order_opened', {
      order,
      telemetry: serializeTelemetry(session),
    });

    if (!['MULTUP', 'MULTDOWN'].includes(decision.contractType)) {
      const checkInterval = setInterval(async () => {
        try {
          const row = await queryOne<{ status: string; pnl: number }>(
            'SELECT status, pnl FROM virtual_orders WHERE id = $1',
            [order.id]
          );
          if (!row || row.status === 'CLOSED') {
            clearInterval(checkInterval);
            if (row) {
              const p = Number(row.pnl || 0);
              handleSettledOutcome(session, p);
              await appendBotLog(
                session.userId,
                session.runId,
                p >= 0 ? 'trade' : 'warn',
                'order_settled',
                `Settled #${order.id} (${decision.contractType}): ${p >= 0 ? '+' : ''}$${p.toFixed(2)}`,
                { orderId: order.id, pnl: p }
              );
            }
          }
        } catch {
          clearInterval(checkInterval);
        }
      }, 450);
    }
  } catch (err) {
    session.lastSignal = err instanceof Error ? err.message : 'Execution paused';
    await appendBotLog(session.userId, session.runId, 'error', 'execution_error', session.lastSignal);
    if (session.lastSignal.toLowerCase().includes('insufficient')) {
      await stopBotSession(session.userId, session.lastSignal);
    }
  } finally {
    session.isExecutingTrade = false;
  }
}

function serializeTelemetry(s: InternalBotSession): BotTelemetry {
  return {
    runId: s.runId,
    botDefinitionId: s.botDefinitionId,
    running: s.running,
    paused: s.paused,
    status: !s.running ? 'stopped' : s.paused ? 'paused' : 'running',
    strategyName: s.strategyName,
    symbol: s.symbol,
    contractType: s.contractType,
    baseStake: s.baseStake,
    currentStake: s.currentStake,
    martingaleStep: s.martingaleStep,
    martingaleFactor: s.martingaleFactor,
    takeProfit: s.takeProfit,
    stopLoss: s.stopLoss,
    maxDailyLoss: s.maxDailyLoss,
    maxStake: s.maxStake,
    maxTrades: s.maxTrades,
    cooldownSeconds: s.cooldownSeconds,
    maxConsecutiveLosses: s.maxConsecutiveLosses,
    consecutiveLosses: s.consecutiveLosses,
    tickCount: s.tickCount,
    tradesPlaced: s.tradesPlaced,
    wins: s.wins,
    losses: s.losses,
    realizedPnl: s.realizedPnl,
    startedAt: s.startedAt,
    lastSignal: s.lastSignal,
    recentPrices: s.recentPrices,
    accountMode: s.accountMode,
    executionSpeed: s.executionSpeed,
  };
}

export async function startBotSession(cfg: BotSessionConfig): Promise<BotTelemetry> {
  if (activeSessions.has(cfg.userId)) {
    await stopBotSession(cfg.userId, 'Replaced by new bot run');
  }

  let validatedAst: BotStrategyAst | null = null;
  if (cfg.ast) {
    const check = validateBotAst(cfg.ast);
    if (!check.valid || !check.ast) {
      throw new Error(`Invalid strategy AST: ${check.errors.join(' ')}`);
    }
    validatedAst = check.ast;
  }

  // Enforce demo test verification before Real-money AST bot activation if botDefinitionId supplied
  if (cfg.accountMode === 'real' && cfg.botDefinitionId) {
    const def = await queryOne<{ demo_tested: boolean }>(
      'SELECT demo_tested FROM bot_definitions WHERE id = $1 AND user_id = $2',
      [cfg.botDefinitionId, cfg.userId]
    );
    if (def && !def.demo_tested) {
      throw new Error(
        'Real-money execution requires completing a Demo run or Historical Backtest on this strategy first.'
      );
    }
  }

  const symbol = validatedAst?.market.instrument || cfg.symbol || '1HZ100V';
  const contractType = validatedAst?.market.contractType || cfg.contractType || 'DIGITOVER';
  const stakeAction = validatedAst?.actions.find((a) => a.type === 'SET_STAKE');
  const durAction = validatedAst?.actions.find((a) => a.type === 'SET_DURATION');
  const evalAction = validatedAst?.actions.find((a) => a.type === 'EVALUATE_OUTCOME');

  const resolvedBaseStake = Number(
    Math.max(0.5, Number(stakeAction?.params?.stake ?? cfg.baseStake ?? 1)).toFixed(2)
  );
  const resolvedMaxStake = Number(validatedAst?.risk.maxStake ?? cfg.maxStake ?? Math.max(50, resolvedBaseStake * 10));
  const resolvedMartingale = Number(
    evalAction?.params?.martingaleFactor ?? validatedAst?.risk.martingaleFactor ?? cfg.martingale ?? 2.0
  );
  const resolvedTakeProfit = Number(validatedAst?.risk.takeProfit ?? cfg.takeProfit ?? 25);
  const resolvedStopLoss = Number(validatedAst?.risk.stopLoss ?? cfg.stopLoss ?? 50);
  const resolvedMaxDailyLoss = Number(validatedAst?.risk.maxDailyLoss ?? cfg.maxDailyLoss ?? resolvedStopLoss);
  const resolvedCooldown = Number(validatedAst?.risk.cooldownSeconds ?? cfg.cooldownSeconds ?? 0);
  const resolvedMaxConsec = Number(validatedAst?.risk.maxConsecutiveLosses ?? cfg.maxConsecutiveLosses ?? 5);
  const resolvedMaxTrades = Number(validatedAst?.risk.maxSessions ?? cfg.maxTrades ?? 50);

  await derivWs.ensureSymbolSubscribed(symbol);
  const seedPrices = await derivWs.fetchTickHistory(symbol, 25);
  const latestTick = derivWs.getLatestTick(symbol) || {
    symbol,
    quote: seedPrices[seedPrices.length - 1] || 1000,
    bid: seedPrices[seedPrices.length - 1] || 1000,
    ask: seedPrices[seedPrices.length - 1] || 1000,
    epoch: Math.floor(Date.now() / 1000),
    pipSize: 0.01,
  };

  let runId: number | null = null;
  try {
    const insertedRun = await queryOne<{ id: number }>(
      `INSERT INTO bot_runs (user_id, bot_definition_id, strategy_name, status, execution_mode, account_mode, symbol, current_stake, max_daily_loss, take_profit, stop_loss, last_signal)
       VALUES ($1, $2, $3, 'running', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        cfg.userId,
        cfg.botDefinitionId || null,
        validatedAst?.name || cfg.strategyName || 'Custom Bot',
        cfg.executionMode || 'virtual',
        cfg.accountMode === 'real' ? 'real' : 'demo',
        symbol,
        resolvedBaseStake,
        resolvedMaxDailyLoss,
        resolvedTakeProfit,
        resolvedStopLoss,
        'Started synchronized execution',
      ]
    );
    runId = insertedRun?.id ?? null;
  } catch {
    runId = null;
  }

  // Mark personal AST bot as demo_tested when launched in demo mode
  if (cfg.accountMode !== 'real' && cfg.botDefinitionId) {
    execute('UPDATE bot_definitions SET demo_tested = TRUE WHERE id = $1 AND user_id = $2', [
      cfg.botDefinitionId,
      cfg.userId,
    ]).catch(() => {});
  }

  const session: InternalBotSession = {
    runId,
    botDefinitionId: cfg.botDefinitionId || null,
    userId: cfg.userId,
    running: true,
    paused: false,
    status: 'running',
    strategyName: validatedAst?.name || cfg.strategyName || 'Custom Bot',
    symbol,
    contractType,
    baseStake: resolvedBaseStake,
    currentStake: Math.min(resolvedMaxStake, resolvedBaseStake),
    martingaleStep: 0,
    martingaleFactor: resolvedMartingale,
    takeProfit: resolvedTakeProfit,
    stopLoss: resolvedStopLoss,
    maxDailyLoss: resolvedMaxDailyLoss,
    maxStake: resolvedMaxStake,
    maxTrades: resolvedMaxTrades,
    cooldownSeconds: resolvedCooldown,
    maxConsecutiveLosses: resolvedMaxConsec,
    consecutiveLosses: 0,
    tickCount: 0,
    tradesPlaced: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    startedAt: new Date().toISOString(),
    lastSignal: 'Zero-delay startup: evaluating immediate entry',
    recentPrices: seedPrices.slice(-20),
    barrier: cfg.barrier ?? '2',
    duration: Number(durAction?.params?.duration ?? cfg.duration ?? 1),
    durationUnit: String(durAction?.params?.durationUnit ?? cfg.durationUnit ?? 't'),
    multiplier: Number(cfg.multiplier || 100),
    growthRate: Number(cfg.growthRate || 0.02),
    executionMode: cfg.executionMode || 'virtual',
    connectedAccountId: cfg.connectedAccountId || null,
    accountMode: cfg.accountMode === 'real' ? 'real' : 'demo',
    executionSpeed: cfg.executionSpeed === 'normal' ? 'normal' : 'fast',
    ast: validatedAst,
    unsubscribeTick: null,
    isExecutingTrade: false,
    lastTradeAt: 0,
    cooldownUntilMs: 0,
    lastConditionEvalAt: 0,
  };

  session.unsubscribeTick = derivWs.onTick((tick) => {
    if (tick.symbol === session.symbol && session.running && !session.paused) {
      evaluateAndExecuteBotTick(session, tick).catch(() => {});
    }
  });

  activeSessions.set(cfg.userId, session);
  await appendBotLog(
    cfg.userId,
    runId,
    'info',
    'bot_started',
    `[${session.accountMode.toUpperCase()}] Started "${session.strategyName}" on ${session.symbol} (${session.contractType}, $${session.baseStake}).`
  );
  await addNotification(
    cfg.userId,
    'Bot Started',
    `[${session.accountMode.toUpperCase()}] ${session.strategyName} active on ${session.symbol} (${session.contractType}, $${session.baseStake}).`,
    'bot'
  );

  await evaluateAndExecuteBotTick(session, latestTick);
  derivWs.emitUserEvent(cfg.userId, 'bot_status', serializeTelemetry(session));
  return serializeTelemetry(session);
}

export async function pauseBotSession(userId: number): Promise<BotTelemetry | null> {
  const session = activeSessions.get(userId);
  if (!session || !session.running) return null;
  session.paused = true;
  session.status = 'paused';
  session.lastSignal = 'Paused by trader (waiting to resume)';
  if (session.runId) {
    execute("UPDATE bot_runs SET status = 'paused', paused_at = NOW(), last_signal = $1 WHERE id = $2", [
      session.lastSignal,
      session.runId,
    ]).catch(() => {});
  }
  await appendBotLog(userId, session.runId, 'warn', 'bot_paused', session.lastSignal);
  const snap = serializeTelemetry(session);
  derivWs.emitUserEvent(userId, 'bot_status', snap);
  return snap;
}

export async function resumeBotSession(userId: number): Promise<BotTelemetry | null> {
  const session = activeSessions.get(userId);
  if (!session || !session.running) return null;
  session.paused = false;
  session.status = 'running';
  session.lastSignal = 'Resumed execution loop';
  if (session.runId) {
    execute("UPDATE bot_runs SET status = 'running', paused_at = NULL, last_signal = $1 WHERE id = $2", [
      session.lastSignal,
      session.runId,
    ]).catch(() => {});
  }
  await appendBotLog(userId, session.runId, 'info', 'bot_resumed', session.lastSignal);
  const snap = serializeTelemetry(session);
  derivWs.emitUserEvent(userId, 'bot_status', snap);
  return snap;
}

export async function resetBotSession(userId: number): Promise<BotTelemetry> {
  const session = activeSessions.get(userId);
  if (session) {
    session.tradesPlaced = 0;
    session.wins = 0;
    session.losses = 0;
    session.realizedPnl = 0;
    session.martingaleStep = 0;
    session.consecutiveLosses = 0;
    session.currentStake = session.baseStake;
    session.cooldownUntilMs = 0;
    session.lastSignal = 'Counters and risk state reset';
    await syncBotRunDb(session);
    await appendBotLog(userId, session.runId, 'info', 'bot_reset', session.lastSignal);
    const snap = serializeTelemetry(session);
    derivWs.emitUserEvent(userId, 'bot_status', snap);
    return snap;
  }
  return getBotStatus(userId);
}

export async function stopBotSession(userId: number, reason = 'Stopped by trader'): Promise<BotTelemetry | null> {
  const session = activeSessions.get(userId);
  if (!session) return null;
  session.running = false;
  session.paused = false;
  session.status = 'stopped';
  session.lastSignal = reason;
  if (session.unsubscribeTick) {
    session.unsubscribeTick();
    session.unsubscribeTick = null;
  }
  if (session.runId) {
    execute("UPDATE bot_runs SET status = 'stopped', stopped_at = NOW(), last_signal = $1 WHERE id = $2", [
      reason,
      session.runId,
    ]).catch(() => {});
  }
  await appendBotLog(userId, session.runId, 'info', 'bot_stopped', reason, { realizedPnl: session.realizedPnl });
  const snap = serializeTelemetry(session);
  activeSessions.delete(userId);
  derivWs.emitUserEvent(userId, 'bot_status', snap);
  await addNotification(
    userId,
    'Bot Stopped',
    `${session.strategyName}: ${reason}. Net P/L: $${session.realizedPnl.toFixed(2)}`,
    'bot'
  );
  return snap;
}

export async function emergencyKillAllBots(reason = 'Emergency Kill Switch Activated'): Promise<{ stoppedCount: number }> {
  const userIds = Array.from(activeSessions.keys());
  let stoppedCount = 0;
  for (const uid of userIds) {
    await stopBotSession(uid, reason);
    stoppedCount += 1;
  }
  try {
    await execute("UPDATE bot_runs SET status = 'stopped', kill_switched = TRUE, last_signal = $1 WHERE status IN ('running', 'paused')", [
      reason,
    ]);
  } catch {
    // ignore
  }
  return { stoppedCount };
}

export async function closeAllBotOrders(userId: number) {
  return bulkCloseOrders(userId, 'bot');
}

export function getAllActiveBotSessions(): Array<BotTelemetry & { userId: number }> {
  return Array.from(activeSessions.values()).map((s) => ({
    userId: s.userId,
    ...serializeTelemetry(s),
  }));
}

export function getBotStatus(userId: number): BotTelemetry {
  const session = activeSessions.get(userId);
  if (session) return serializeTelemetry(session);
  return {
    runId: null,
    botDefinitionId: null,
    running: false,
    paused: false,
    status: 'idle',
    strategyName: '',
    symbol: '1HZ100V',
    contractType: 'DIGITOVER',
    baseStake: 1,
    currentStake: 1,
    martingaleStep: 0,
    martingaleFactor: 2.0,
    takeProfit: 25,
    stopLoss: 50,
    maxDailyLoss: 50,
    maxStake: 50,
    maxTrades: 50,
    cooldownSeconds: 0,
    maxConsecutiveLosses: 5,
    consecutiveLosses: 0,
    tickCount: 0,
    tradesPlaced: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    startedAt: '',
    lastSignal: 'Idle',
    recentPrices: [],
    accountMode: 'demo',
    executionSpeed: 'fast',
  };
}
