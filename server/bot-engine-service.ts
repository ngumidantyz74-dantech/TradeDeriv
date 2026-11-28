import { query, queryOne, execute, addNotification } from './db.ts';
import { derivWs, type TickData } from './deriv-client.ts';
import { placeUnifiedOrder, closeOrderById, bulkCloseOrders, settleVirtualDigitalOrder } from './trade-execution.ts';
import { computeLiveAnalyserSignal } from './routes/intelligence.ts';

export interface BotSessionConfig {
  userId: number;
  strategyName: string;
  strategyType?: string;
  symbol: string;
  contractType: string;
  contractSideMode?: 'both' | 'single';
  tradeSide?: string;
  baseStake: number;
  winStep?: number;
  maxWinSteps?: number;
  maxStake?: number;
  sellTickCount?: number;
  maxLosses?: number;
  barrier?: string;
  duration?: number;
  durationUnit?: string;
  multiplier?: number;
  growthRate?: number;
  martingale?: number;
  takeProfit?: number;
  stopLoss?: number;
  maxTrades?: number;
  executionMode?: 'virtual' | 'deriv';
  connectedAccountId?: number | null;
  accountMode?: 'real' | 'demo';
  executionSpeed?: 'fast' | 'normal';
  analyserSync?: boolean;
  conditionType?: 'any_tick' | 'last_digit_gte' | 'last_digit_lte' | 'rsi_signal';
  conditionDigit?: number;
  quantumPredictionId?: string | null;
}

export interface BotJournalEntry {
  id: string;
  time: string;
  type: 'info' | 'stake' | 'bought' | 'profit' | 'loss' | 'warning' | 'session_profit' | 'error';
  text: string;
}

export interface BotTelemetry {
  running: boolean;
  runId?: string;
  runState?: 'idle' | 'buying' | 'bought' | 'won' | 'lost';
  strategyName: string;
  strategyType: string;
  symbol: string;
  contractType: string;
  baseStake: number;
  currentStake: number;
  martingaleStep: number;
  martingaleFactor: number;
  takeProfit: number;
  stopLoss: number;
  maxTrades: number;
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
  analyserSync: boolean;
  growthRate: number;
  quantumPredictionId?: string | null;
  quantumExpiresAt?: string | null;
  journal?: BotJournalEntry[];
}

interface InternalBotSession extends BotTelemetry {
  userId: number;
  runId: string;
  barrier: string;
  duration: number;
  durationUnit: string;
  multiplier: number;
  executionMode: 'virtual' | 'deriv';
  connectedAccountId: number | null;
  unsubscribeTick: (() => void) | null;
  isExecutingTrade: boolean;
  executingStartedAt: number;
  lastTradeAt: number;
  winStreak: number;
  lossStreak: number;
  winStep: number;
  maxWinSteps: number;
  maxStake: number;
  sellTickCount: number;
  maxLosses: number;
  consecutiveErrors: number;
  contractSideMode: 'both' | 'single';
  currentTradeSide: string;
  conditionType: 'any_tick' | 'last_digit_gte' | 'last_digit_lte' | 'rsi_signal';
  conditionDigit: number;
  quantumPredictionId: string | null;
  quantumExpiresAt: string | null;
  runState: 'idle' | 'buying' | 'bought' | 'won' | 'lost';
  journal: BotJournalEntry[];
}

function appendJournal(
  session: InternalBotSession,
  type: BotJournalEntry['type'],
  text: string
): void {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  session.journal.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: `${yyyy}-${mm}-${dd} | ${hh}:${mi}:${ss} GMT`,
    type,
    text,
  });
  if (session.journal.length > 80) session.journal.length = 80;
}

const activeSessions = new Map<string, InternalBotSession>();
const closingOrderLocks = new Set<number>();
const botLastPersistAt = new Map<number, number>();

function sessionKey(userId: number, accountMode: 'real' | 'demo' = 'demo'): string {
  return `${userId}:${accountMode === 'real' ? 'real' : 'demo'}`;
}

function getLastDigit(price: number, pipSize = 0.01): number {
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const s = price.toFixed(decimals);
  return Number(s[s.length - 1] || 0);
}

function flipBotTradeSide(side: string): string {
  const s = String(side || '').toUpperCase();
  if (s === 'CALL' || s === 'RISE' || s === 'CALLE') return 'PUT';
  if (s === 'PUT' || s === 'FALL' || s === 'PUTE') return 'CALL';
  if (s === 'HIGHER') return 'LOWER';
  if (s === 'LOWER') return 'HIGHER';
  if (s === 'DIGITOVER' || s === 'OVER') return 'DIGITUNDER';
  if (s === 'DIGITUNDER' || s === 'UNDER') return 'DIGITOVER';
  if (s === 'DIGITEVEN' || s === 'EVEN') return 'DIGITODD';
  if (s === 'DIGITODD' || s === 'ODD') return 'DIGITEVEN';
  if (s === 'DIGITMATCH' || s === 'MATCH') return 'DIGITDIFF';
  if (s === 'DIGITDIFF' || s === 'DIFF') return 'DIGITMATCH';
  if (s === 'ONETOUCH' || s === 'TOUCH') return 'NOTOUCH';
  if (s === 'NOTOUCH') return 'ONETOUCH';
  if (s === 'EXPIRYRANGE') return 'EXPIRYMISS';
  if (s === 'EXPIRYMISS') return 'EXPIRYRANGE';
  if (s === 'ENDSIN') return 'ENDSOUT';
  if (s === 'ENDSOUT') return 'ENDSIN';
  if (s === 'ASIANU') return 'ASIAND';
  if (s === 'ASIAND') return 'ASIANU';
  if (s === 'RESETCALL') return 'RESETPUT';
  if (s === 'RESETPUT') return 'RESETCALL';
  if (s === 'TICKHIGH') return 'TICKLOW';
  if (s === 'TICKLOW') return 'TICKHIGH';
  if (s === 'RUNHIGH') return 'RUNLOW';
  if (s === 'RUNLOW') return 'RUNHIGH';
  if (s === 'MULTUP' || s === 'BUY') return 'MULTDOWN';
  if (s === 'MULTDOWN' || s === 'SELL') return 'MULTUP';
  return s;
}

function handleBotTradeSettled(session: InternalBotSession, pnl: number): void {
  session.realizedPnl = Number((session.realizedPnl + pnl).toFixed(2));
  session.runState = pnl >= 0 ? 'won' : 'lost';
  appendJournal(
    session,
    pnl >= 0 ? 'profit' : 'loss',
    pnl >= 0 ? `Profit amount: +${pnl.toFixed(2)} USD` : `Loss amount: ${pnl.toFixed(2)} USD`
  );
  const switched = applyProgressionStake(session, pnl >= 0);
  if (switched) {
    appendJournal(session, 'warning', '3 consecutive losses: switching Buy/Sell side');
  }
  const spStr = Number.isInteger(session.realizedPnl)
    ? String(session.realizedPnl)
    : session.realizedPnl.toFixed(2);
  appendJournal(session, 'session_profit', `Session profit: ${spStr}`);
  derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));

  // Stop immediately when session risk targets are met without waiting on another tick
  let stopReason: string | null = null;
  if (session.takeProfit > 0 && session.realizedPnl >= session.takeProfit) {
    stopReason = `Take Profit target ($${session.takeProfit.toFixed(2)}) reached`;
  } else if (session.stopLoss > 0 && session.realizedPnl <= -session.stopLoss) {
    stopReason = `Stop Loss limit (-$${session.stopLoss.toFixed(2)}) reached`;
  } else if (session.maxLosses > 0 && session.losses >= session.maxLosses) {
    stopReason = `Reached max ${session.maxLosses} losses cap`;
  } else if (session.maxTrades > 0 && session.tradesPlaced >= session.maxTrades) {
    stopReason = `Completed max ${session.maxTrades} bot trades`;
  }
  if (stopReason) {
    const finalReason = stopReason;
    queueMicrotask(() => {
      stopBotSession(session.userId, finalReason, session.accountMode).catch(() => {});
    });
  } else if (session.running) {
    const nextDelayMs = session.executionSpeed === 'fast' ? 160 : 850;
    setTimeout(() => {
      if (!session.running || session.isExecutingTrade) return;
      const latest = derivWs.getLatestTick(session.symbol);
      if (latest) {
        evaluateAndExecuteBotTick(session, latest).catch(() => {});
      }
    }, nextDelayMs);
  }
}

function applyProgressionStake(session: InternalBotSession, won: boolean): boolean {
  const style = session.strategyType.toLowerCase();
  const base = session.baseStake;
  const factor = Math.max(1.0, session.martingaleFactor || 2.0);
  const winStep = Math.max(0, Number(session.winStep || 0));
  const maxWinSteps = Math.max(1, Number(session.maxWinSteps || 3));
  let switchedSide = false;

  if (won) {
    session.wins += 1;
    session.winStreak += 1;
    session.lossStreak = 0;

    if (style.includes('reverse_martingale') || style.includes('reverse martingale')) {
      session.martingaleStep = session.winStreak >= maxWinSteps ? 0 : session.martingaleStep + 1;
      session.currentStake =
        session.martingaleStep === 0
          ? base
          : Number((session.currentStake * (factor > 1 ? factor : 2.0)).toFixed(2));
    } else if (style.includes('reverse_dalembert') || style.includes("reverse d'alembert")) {
      if (style.includes('stat_reset') || style.includes('stat reset')) {
        session.martingaleStep = session.winStreak >= maxWinSteps ? 0 : session.martingaleStep + 1;
        session.currentStake =
          session.martingaleStep === 0 ? base : Number((session.currentStake + (winStep > 0 ? winStep : base)).toFixed(2));
      } else {
        session.martingaleStep += 1;
        session.currentStake = Number((session.currentStake + (winStep > 0 ? winStep : base)).toFixed(2));
      }
    } else if (style.includes('dalembert_stat_reset') || style.includes("d'alembert on stat reset")) {
      if (session.winStreak >= 2) {
        session.martingaleStep = 0;
        session.currentStake = base;
      } else {
        session.martingaleStep = Math.max(0, session.martingaleStep - 1);
        session.currentStake = Number(Math.max(base, session.currentStake - (winStep > 0 ? winStep : base)).toFixed(2));
      }
    } else if (style.includes('dalembert') || style.includes("d'alembert")) {
      session.martingaleStep = Math.max(0, session.martingaleStep - 1);
      session.currentStake = Number(Math.max(base, session.currentStake - (winStep > 0 ? winStep : base)).toFixed(2));
    } else if (style.includes('oscar')) {
      if (session.realizedPnl >= 0) {
        session.martingaleStep = 0;
        session.currentStake = base;
      } else {
        session.martingaleStep += 1;
        session.currentStake = Number((session.currentStake + base).toFixed(2));
      }
    } else if (style.includes('1_3_2_6') || style.includes('1-3-2-6')) {
      const seq = [1, 3, 2, 6];
      const mult = seq[session.winStreak % seq.length];
      session.martingaleStep = session.winStreak % seq.length;
      session.currentStake = Number((base * mult).toFixed(2));
    } else if (winStep > 0 && style === 'xml_block_flow') {
      if (session.winStreak <= maxWinSteps) {
        session.martingaleStep = session.winStreak;
        session.currentStake = Number((base + session.winStreak * winStep).toFixed(2));
      } else {
        session.martingaleStep = 0;
        session.winStreak = 0;
        session.currentStake = base;
      }
    } else {
      session.martingaleStep = 0;
      session.currentStake = base;
    }
  } else {
    session.losses += 1;
    session.winStreak = 0;
    session.lossStreak += 1;

    if (session.lossStreak >= 3 && session.contractSideMode === 'both') {
      session.currentTradeSide = flipBotTradeSide(session.currentTradeSide);
      session.lossStreak = 0;
      switchedSide = true;
    }

    if (style.includes('reverse') || style.includes('1_3_2_6') || style.includes('1-3-2-6')) {
      session.martingaleStep = 0;
      session.currentStake = base;
    } else if (style.includes('oscar')) {
      session.currentStake = Number(Math.max(base, session.currentStake).toFixed(2));
    } else if (style.includes('dalembert') || style.includes("d'alembert")) {
      session.martingaleStep += 1;
      session.currentStake = Number((session.currentStake + (winStep > 0 ? winStep : base)).toFixed(2));
    } else if (style.includes('stat_reset') || style.includes('stat reset')) {
      if (session.martingaleStep >= 4) {
        session.martingaleStep = 0;
        session.currentStake = base;
      } else {
        session.martingaleStep += 1;
        session.currentStake = Number(Math.min(base * 16, session.currentStake * factor).toFixed(2));
      }
    } else if (style === 'xml_block_flow') {
      session.martingaleStep = 0;
      session.currentStake = base;
    } else {
      session.martingaleStep += 1;
      session.currentStake = Number(Math.min(base * 16, session.currentStake * factor).toFixed(2));
    }
  }
  if (session.maxStake > 0 && session.currentStake > session.maxStake) {
    session.currentStake = Number(Math.max(base, session.maxStake).toFixed(2));
  }
  return switchedSide;
}

function decideBotSide(session: InternalBotSession, latestPrice: number, pipSize: number) {
  const ct = String(session.currentTradeSide || session.contractType || '').toUpperCase();
  const digit = getLastDigit(latestPrice, pipSize);
  const prices = session.recentPrices;
  const avg5 = prices.length >= 5 ? prices.slice(-5).reduce((a, b) => a + b, 0) / 5 : latestPrice;

  if (ct === 'ACCU') {
    return {
      contractType: 'ACCU',
      side: 'ACCU',
      barrier: String(session.growthRate || 0.02),
      reason: `Accumulator ${(session.growthRate * 100).toFixed(0)}% growth range @ ${latestPrice.toFixed(2)}`,
    };
  }
  if (ct === 'DIGITOVER') {
    return { contractType: 'DIGITOVER', side: 'OVER', barrier: session.barrier || '2', reason: `Last digit ${digit} -> OVER ${session.barrier || '2'}` };
  }
  if (ct === 'DIGITUNDER') {
    return { contractType: 'DIGITUNDER', side: 'UNDER', barrier: session.barrier || '7', reason: `Last digit ${digit} -> UNDER ${session.barrier || '7'}` };
  }
  if (ct === 'DIGITEVEN') {
    return { contractType: 'DIGITEVEN', side: 'EVEN', barrier: '', reason: `Parity scan -> EVEN (last digit ${digit})` };
  }
  if (ct === 'DIGITODD') {
    return { contractType: 'DIGITODD', side: 'ODD', barrier: '', reason: `Parity scan -> ODD (last digit ${digit})` };
  }
  if (ct === 'DIGITDIFF') {
    return { contractType: 'DIGITDIFF', side: 'DIFF', barrier: session.barrier || String(digit), reason: `Differ vs digit ${session.barrier || digit}` };
  }
  if (ct === 'DIGITMATCH') {
    return { contractType: 'DIGITMATCH', side: 'MATCH', barrier: session.barrier || String(digit), reason: `Match target digit ${session.barrier || digit}` };
  }
  if (ct === 'CALL' || ct === 'PUT') {
    return { contractType: ct, side: ct, barrier: '', reason: `Block tradeSide ${ct} @ ${latestPrice.toFixed(2)}` };
  }
  if (ct === 'HIGHER' || ct === 'LOWER') {
    return {
      contractType: ct,
      side: ct,
      barrier: session.barrier || (ct === 'HIGHER' ? '+0.50' : '-0.50'),
      reason: `Block barrier ${ct} @ ${latestPrice.toFixed(2)}`,
    };
  }
  if (ct === 'ONETOUCH' || ct === 'NOTOUCH') {
    return {
      contractType: ct,
      side: ct,
      barrier: session.barrier || '+0.50',
      reason: `Touch barrier ${ct} @ ${latestPrice.toFixed(2)}`,
    };
  }
  if (ct === 'EXPIRYRANGE' || ct === 'EXPIRYMISS' || ct === 'ENDSIN' || ct === 'ENDSOUT') {
    return {
      contractType: ct,
      side: ct,
      barrier: session.barrier || '+0.50',
      reason: `Range ${ct} @ ${latestPrice.toFixed(2)}`,
    };
  }
  if (ct === 'ASIANU' || ct === 'ASIAND' || ct === 'RESETCALL' || ct === 'RESETPUT' || ct === 'TICKHIGH' || ct === 'TICKLOW' || ct === 'RUNHIGH' || ct === 'RUNLOW') {
    return {
      contractType: ct,
      side: ct,
      barrier: '',
      reason: `Block strategy ${ct} @ ${latestPrice.toFixed(2)}`,
    };
  }
  if (ct === 'MULTUP' || ct === 'MULTDOWN') {
    const bullish = ct === 'MULTUP' ? true : latestPrice >= avg5;
    const chosen = ct === 'MULTUP' || ct === 'MULTDOWN' ? ct : bullish ? 'MULTUP' : 'MULTDOWN';
    return { contractType: chosen, side: chosen === 'MULTUP' ? 'BUY' : 'SELL', barrier: '', reason: `Trend ${latestPrice.toFixed(2)} vs SMA5 ${avg5.toFixed(2)} -> ${chosen}` };
  }
  return { contractType: 'DIGITOVER', side: 'OVER', barrier: '2', reason: 'Default OVER 2' };
}

async function evaluateAndExecuteBotTick(session: InternalBotSession, tick: TickData): Promise<void> {
  if (!session.running) return;
  session.tickCount += 1;
  session.recentPrices.push(tick.quote);
  if (session.recentPrices.length > 20) session.recentPrices.shift();

  const openBotOrders = await query<any>(
    `SELECT id, user_id, symbol, contract_type, execution_mode, deriv_contract_id, stake, multiplier, entry_price, barrier, sl_usd, tp_usd, opened_at
     FROM virtual_orders
     WHERE user_id = $1 AND symbol = $2 AND account_mode = $3 AND status = 'OPEN' AND source = 'bot'
     LIMIT 20`,
    [session.userId, session.symbol, session.accountMode]
  );

  for (const order of openBotOrders) {
    if (closingOrderLocks.has(order.id)) continue;
    // Live Deriv contracts are settled authoritatively by monitorDerivOpenContract
    if (order.execution_mode === 'deriv') continue;
    const oct = String(order.contract_type || '').toUpperCase();
    const nowMs = Date.now();
    const shouldPersist = nowMs - (botLastPersistAt.get(order.id) || 0) >= 3000;

    if (oct === 'ACCU') {
      const growthRate = Math.min(0.05, Math.max(0.01, Number(order.barrier || session.growthRate || 0.02)));
      const tickMs = order.execution_mode === 'virtual' ? 650 : 1500;
      const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(order.opened_at).getTime()) / tickMs));
      const knockoutChance = Math.min(0.12, growthRate * 1.4);
      if (elapsedTicks >= 2 && Math.random() < knockoutChance) {
        closingOrderLocks.add(order.id);
        botLastPersistAt.delete(order.id);
        await execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
          tick.quote,
          -Number(order.stake),
          order.id,
        ]).catch(() => {});
        closeOrderById(order.id, session.userId)
          .then((closed) => {
            if (closed) {
              handleBotTradeSettled(session, Number(closed.pnl || 0));
            }
          })
          .finally(() => closingOrderLocks.delete(order.id))
          .catch(() => {});
        continue;
      }

      const accruedPnl = Number((order.stake * (Math.pow(1 + growthRate, elapsedTicks) - 1)).toFixed(2));
      if (shouldPersist) {
        botLastPersistAt.set(order.id, nowMs);
        execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
          tick.quote,
          accruedPnl,
          order.id,
        ]).catch(() => {});
      }
      derivWs.emitUserEvent(session.userId, 'order_updated', {
        id: order.id,
        current_price: tick.quote,
        pnl: accruedPnl,
      });

      const targetTicks = order.execution_mode === 'virtual' ? 3 : 5;
      if (
        (session.sellTickCount > 0 && elapsedTicks >= session.sellTickCount) ||
        elapsedTicks >= targetTicks ||
        accruedPnl >= Number(order.tp_usd || order.stake * 0.15)
      ) {
        closingOrderLocks.add(order.id);
        botLastPersistAt.delete(order.id);
        closeOrderById(order.id, session.userId)
          .then((closed) => {
            if (closed) {
              handleBotTradeSettled(session, Number(closed.pnl || 0));
            }
          })
          .finally(() => closingOrderLocks.delete(order.id))
          .catch(() => {});
      }
      continue;
    }

    if (!['MULTUP', 'MULTDOWN'].includes(oct)) continue;

    const isUp = oct === 'MULTUP';
    const pctDiff = (tick.quote - order.entry_price) / (order.entry_price || 1);
    const directional = isUp ? pctDiff : -pctDiff;
    const livePnl = Number(Math.max(-order.stake, directional * order.stake * order.multiplier).toFixed(2));
    if (shouldPersist) {
      botLastPersistAt.set(order.id, nowMs);
      execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [tick.quote, livePnl, order.id]).catch(() => {});
    }
    derivWs.emitUserEvent(session.userId, 'order_updated', {
      id: order.id,
      current_price: tick.quote,
      pnl: livePnl,
    });

    const hitTp = order.tp_usd && livePnl >= Number(order.tp_usd);
    const hitSl = order.sl_usd && livePnl <= -Number(order.sl_usd);
    if (hitTp || hitSl) {
      closingOrderLocks.add(order.id);
      botLastPersistAt.delete(order.id);
      closeOrderById(order.id, session.userId)
        .then((closed) => {
          if (closed) {
            handleBotTradeSettled(session, Number(closed.pnl || 0));
          }
        })
        .finally(() => closingOrderLocks.delete(order.id))
        .catch(() => {});
    }
  }

  if (session.takeProfit > 0 && session.realizedPnl >= session.takeProfit) {
    await stopBotSession(session.userId, `Take Profit target ($${session.takeProfit.toFixed(2)}) reached`, session.accountMode);
    return;
  }
  if (session.stopLoss > 0 && session.realizedPnl <= -session.stopLoss) {
    await stopBotSession(session.userId, `Stop Loss limit (-$${session.stopLoss.toFixed(2)}) reached`, session.accountMode);
    return;
  }
  if (session.maxLosses > 0 && session.losses >= session.maxLosses) {
    await stopBotSession(session.userId, `Reached max ${session.maxLosses} losses cap`, session.accountMode);
    return;
  }
  if (session.maxTrades > 0 && session.tradesPlaced >= session.maxTrades) {
    await stopBotSession(session.userId, `Completed max ${session.maxTrades} bot trades`, session.accountMode);
    return;
  }

  if (session.isExecutingTrade) {
    if (Date.now() - session.executingStartedAt < 18000) return;
    session.isExecutingTrade = false;
  }
  if (session.executionSpeed === 'normal' && Date.now() - session.lastTradeAt < 1200) {
    return;
  }
  if (openBotOrders.length > 0) return;
  const stillOpen = await queryOne<{ id: number }>(
    "SELECT id FROM virtual_orders WHERE user_id = $1 AND account_mode = $2 AND status = 'OPEN' AND source = 'bot' LIMIT 1",
    [session.userId, session.accountMode]
  );
  if (stillOpen) return;

  if (!session.analyserSync) {
    const ld = getLastDigit(tick.quote, tick.pipSize);
    if (session.conditionType === 'last_digit_gte' && ld < session.conditionDigit) return;
    if (session.conditionType === 'last_digit_lte' && ld > session.conditionDigit) return;
  }

  session.isExecutingTrade = true;
  session.executingStartedAt = Date.now();
  session.runState = 'buying';
  try {
    const targetSymbol = session.symbol;
    let decision = decideBotSide(session, tick.quote, tick.pipSize);
    const duration = session.duration;
    const durationUnit = session.durationUnit;

    // Silent behind-the-scenes analyser guidance (never surfaced in DBOT UI or journal)
    let linkedPredictionId: string | null = session.quantumPredictionId;
    try {
      const activeQp = await queryOne<{
        prediction_id: string;
        instrument: string;
        contract_type: string;
        barrier: string | null;
      }>(
        `SELECT prediction_id, instrument, contract_type, barrier
         FROM quantum_predictions
         WHERE user_id = $1 AND validity_status = 'VALID' AND expires_at > NOW()
         ORDER BY CASE WHEN instrument = $2 THEN 0 ELSE 1 END, generated_at DESC
         LIMIT 1`,
        [session.userId, session.symbol]
      );
      if (activeQp) {
        linkedPredictionId = activeQp.prediction_id;
      }

      const sig = await computeLiveAnalyserSignal(session.symbol);
      const currCt = decision.contractType.toUpperCase();

      if (session.contractSideMode === 'both') {
        const qpCt = activeQp && activeQp.instrument === session.symbol
          ? String(activeQp.contract_type || '').toUpperCase()
          : '';
        const guideCt = qpCt || sig.contractType.toUpperCase();

        if (currCt === 'CALL' || currCt === 'PUT') {
          const picked = guideCt === 'PUT' || sig.direction === 'BEARISH' ? 'PUT' : 'CALL';
          decision = { ...decision, contractType: picked, side: picked };
        } else if (currCt === 'HIGHER' || currCt === 'LOWER') {
          const picked = guideCt === 'PUT' || guideCt === 'LOWER' || sig.direction === 'BEARISH' ? 'LOWER' : 'HIGHER';
          decision = { ...decision, contractType: picked, side: picked };
        } else if (currCt === 'DIGITEVEN' || currCt === 'DIGITODD') {
          const picked = qpCt === 'DIGITODD' || (!qpCt && sig.oddPct > sig.evenPct) ? 'DIGITODD' : 'DIGITEVEN';
          decision = {
            ...decision,
            contractType: picked,
            side: picked === 'DIGITEVEN' ? 'EVEN' : 'ODD',
          };
        } else if (currCt === 'DIGITOVER' || currCt === 'DIGITUNDER') {
          const picked = qpCt === 'DIGITUNDER' || (!qpCt && sig.under7Pct > sig.over2Pct) ? 'DIGITUNDER' : 'DIGITOVER';
          const defaultBarrier = picked === 'DIGITUNDER' ? '7' : '2';
          decision = {
            ...decision,
            contractType: picked,
            side: picked === 'DIGITUNDER' ? 'UNDER' : 'OVER',
            barrier:
              activeQp && activeQp.instrument === session.symbol && activeQp.barrier
                ? String(activeQp.barrier)
                : decision.barrier || defaultBarrier,
          };
        } else if (currCt === 'DIGITMATCH' || currCt === 'DIGITDIFF') {
          if (activeQp && activeQp.instrument === session.symbol && (qpCt === 'DIGITMATCH' || qpCt === 'DIGITDIFF')) {
            decision = {
              ...decision,
              contractType: qpCt,
              side: qpCt === 'DIGITMATCH' ? 'MATCH' : 'DIFF',
              barrier: activeQp.barrier ? String(activeQp.barrier) : decision.barrier,
            };
          }
        } else if (currCt === 'MULTUP' || currCt === 'MULTDOWN') {
          const picked = guideCt === 'PUT' || guideCt === 'MULTDOWN' || sig.direction === 'BEARISH' ? 'MULTDOWN' : 'MULTUP';
          decision = {
            ...decision,
            contractType: picked,
            side: picked === 'MULTUP' ? 'BUY' : 'SELL',
          };
        }
      }
    } catch {
      // Keep running seamlessly with XML decision on transient analyser read error
    }

    session.lastSignal = `${decision.contractType} @ ${tick.quote.toFixed(2)}`;
    appendJournal(session, 'stake', 'Trade info');
    derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));

    const order = await placeUnifiedOrder({
      userId: session.userId,
      symbol: targetSymbol,
      side: decision.side,
      contractType: decision.contractType,
      stake: session.currentStake,
      lots: Number((session.currentStake / 100).toFixed(2)),
      multiplier: session.multiplier,
      growthRate: session.growthRate,
      slUsd: decision.contractType.startsWith('MULT') ? Number((session.currentStake * 0.5).toFixed(2)) : null,
      tpUsd:
        decision.contractType === 'ACCU'
          ? Number((session.currentStake * 0.16).toFixed(2))
          : decision.contractType.startsWith('MULT')
            ? Number((session.currentStake * 1.0).toFixed(2))
            : null,
      barrier: decision.barrier,
      duration,
      durationUnit,
      executionMode: session.executionMode,
      connectedAccountId: session.connectedAccountId,
      accountMode: session.accountMode,
      strategyKey: session.strategyType,
      isAnalyserSynced: true,
      quantumPredictionId: linkedPredictionId,
      notes: `run:${session.runId}`,
      source: 'bot',
    });

    session.lastTradeAt = Date.now();
    session.tradesPlaced += 1;
    session.consecutiveErrors = 0;
    session.runState = 'bought';
    appendJournal(
      session,
      'bought',
      `Bought: Contract purchased (ID: ${order.deriv_contract_id || order.id})`
    );
    derivWs.emitUserEvent(session.userId, 'bot_order_opened', {
      order,
      telemetry: serializeTelemetry(session),
    });

    if (order.execution_mode === 'deriv' || !['MULTUP', 'MULTDOWN', 'ACCU'].includes(decision.contractType)) {
      const isVirtualOrder = order.execution_mode === 'virtual';
      const unitSec = durationUnit === 'm' ? 60 : durationUnit === 'h' ? 3600 : 1;
      const expectedMs = isVirtualOrder
        ? durationUnit.toLowerCase() === 't'
          ? Math.max(450, Math.min(2500, duration * 550))
          : Math.max(700, Math.min(2500, duration * unitSec * 150))
        : durationUnit.toLowerCase() === 't'
          ? Math.max(1100, duration * 1100)
          : Math.max(2000, duration * unitSec * 1000);
      const pollMs = isVirtualOrder || durationUnit.toLowerCase() === 't' ? 350 : 800;
      const maxAttempts = Math.max(240, Math.ceil(expectedMs / pollMs) + 60);
      const startedAtMs = Date.now();
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts += 1;
        try {
          const row = await queryOne<{ status: string; pnl: number; execution_mode: string }>(
            'SELECT status, pnl, execution_mode FROM virtual_orders WHERE id = $1',
            [order.id]
          );
          if (!row || row.status === 'CLOSED') {
            clearInterval(checkInterval);
            if (row && session.running) {
              handleBotTradeSettled(session, Number(row.pnl || 0));
            }
            return;
          }
          if (row.execution_mode === 'virtual' && Date.now() - startedAtMs >= expectedMs + 900) {
            await settleVirtualDigitalOrder(Number(order.id)).catch(() => {});
          } else if (attempts >= maxAttempts || !session.running) {
            if (row.execution_mode === 'virtual') {
              await settleVirtualDigitalOrder(Number(order.id)).catch(() => {});
            }
            clearInterval(checkInterval);
          }
        } catch {
          clearInterval(checkInterval);
        }
      }, pollMs);
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Execution paused';
    const low = rawMsg.toLowerCase();
    const isInsuff = low.includes('insufficient');
    const isFatalAuth =
      low.includes('token') ||
      low.includes('reconnect') ||
      low.includes('suspended') ||
      low.includes('otp') ||
      low.includes('unauthorized') ||
      low.includes('authorization') ||
      low.includes('invalid') ||
      low.includes('rejected') ||
      low.includes('expired') ||
      low.includes('no active connected') ||
      low.includes('market is closed') ||
      low.includes('cannot be purchased');
    session.consecutiveErrors += 1;
    if (session.running) {
      session.runState = 'idle';
    }
    session.lastSignal = isInsuff
      ? 'Your account balance is insufficient to buy this contract.'
      : rawMsg;
    appendJournal(session, 'error', session.lastSignal);
    derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
    if (isInsuff || isFatalAuth || session.consecutiveErrors >= 3) {
      await stopBotSession(session.userId, session.lastSignal, session.accountMode);
    }
  } finally {
    session.isExecutingTrade = false;
    session.executingStartedAt = 0;
  }
}

function serializeTelemetry(s: InternalBotSession): BotTelemetry {
  return {
    running: s.running,
    runId: s.runId,
    runState: s.runState,
    strategyName: s.strategyName,
    strategyType: s.strategyType,
    symbol: s.symbol,
    contractType: s.contractType,
    baseStake: s.baseStake,
    currentStake: s.currentStake,
    martingaleStep: s.martingaleStep,
    martingaleFactor: s.martingaleFactor,
    takeProfit: s.takeProfit,
    stopLoss: s.stopLoss,
    maxTrades: s.maxTrades,
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
    analyserSync: s.analyserSync,
    growthRate: s.growthRate,
    quantumPredictionId: s.quantumPredictionId,
    quantumExpiresAt: s.quantumExpiresAt,
    journal: s.journal,
  };
}

export async function startBotSession(cfg: BotSessionConfig): Promise<BotTelemetry> {
  const userRow = await queryOne<{
    status: string;
    trading_suspended: boolean;
    role: string;
    real_wallets_json: string | null;
    demo_wallets_json: string | null;
  }>(
    'SELECT role, status, COALESCE(trading_suspended, FALSE) as trading_suspended, real_wallets_json, demo_wallets_json FROM users WHERE id = $1',
    [cfg.userId]
  );
  if (!userRow || userRow.status !== 'active') {
    throw new Error('Account is inactive or suspended.');
  }
  if (userRow.role === 'owner' || userRow.role === 'admin') {
    throw new Error('Administrator accounts cannot run trading bots.');
  }
  if (userRow.trading_suspended) {
    throw new Error('Trading is currently frozen on your account by Administrator controls.');
  }

  const targetMode: 'real' | 'demo' = cfg.accountMode === 'real' ? 'real' : 'demo';
  const sKey = sessionKey(cfg.userId, targetMode);
  if (activeSessions.has(sKey)) {
    await stopBotSession(cfg.userId, 'Replaced by new bot run', targetMode);
  }
  // Settle any orphaned OPEN bot orders in this specific mode from an interrupted run
  await bulkCloseOrders(cfg.userId, 'bot', targetMode).catch(() => {});

  await derivWs.ensureSymbolSubscribed(cfg.symbol);
  const bufferedPrices = derivWs.getSparkline(cfg.symbol, 25);
  const seedPrices =
    bufferedPrices.length >= 10
      ? bufferedPrices
      : await Promise.race([
          derivWs.fetchTickHistory(cfg.symbol, 25).catch(() => bufferedPrices),
          new Promise<number[]>((resolve) => setTimeout(() => resolve(bufferedPrices), 1200)),
        ]);
  const latestTick = derivWs.getLatestTick(cfg.symbol) || {
    symbol: cfg.symbol,
    quote: seedPrices[seedPrices.length - 1] || 1000,
    bid: seedPrices[seedPrices.length - 1] || 1000,
    ask: seedPrices[seedPrices.length - 1] || 1000,
    epoch: Math.floor(Date.now() / 1000),
    pipSize: 0.01,
  };

  const targetIsVirtual = targetMode === 'demo';
  let modeDbLocked = false;
  try {
    const parsedWallet = JSON.parse(
      (targetMode === 'real' ? userRow.real_wallets_json : userRow.demo_wallets_json) || '{}'
    );
    modeDbLocked = Boolean(parsedWallet?.db_locked);
  } catch {
    modeDbLocked = false;
  }

  let resolvedConnectedAccountId: number | null = cfg.connectedAccountId || null;
  let resolvedDerivLoginId: string | null = null;
  let resolvedIsDbLocked = modeDbLocked;

  const matchingAcc = resolvedConnectedAccountId
    ? await queryOne<{ id: number; deriv_login_id: string; balance_locked_by_admin: boolean }>(
        `SELECT id, deriv_login_id, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
         FROM connected_accounts
         WHERE id = $1 AND user_id = $2 AND is_virtual = $3 AND (platform = 'deriv' OR platform IS NULL) AND status = 'active'`,
        [resolvedConnectedAccountId, cfg.userId, targetIsVirtual]
      )
    : await queryOne<{ id: number; deriv_login_id: string; balance_locked_by_admin: boolean }>(
        `SELECT id, deriv_login_id, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
         FROM connected_accounts
         WHERE user_id = $1 AND is_virtual = $2 AND (platform = 'deriv' OR platform IS NULL) AND status = 'active'
         ORDER BY COALESCE(balance_locked_by_admin, FALSE) ASC, id ASC
         LIMIT 1`,
        [cfg.userId, targetIsVirtual]
      );

  if (matchingAcc) {
    resolvedConnectedAccountId = matchingAcc.id;
    resolvedDerivLoginId = matchingAcc.deriv_login_id;
    resolvedIsDbLocked = modeDbLocked || Boolean(matchingAcc.balance_locked_by_admin);
  }

  const resolvedExecutionMode: 'virtual' | 'deriv' =
    matchingAcc && !resolvedIsDbLocked ? 'deriv' : 'virtual';

  const rawCt = String(cfg.contractType || '').toUpperCase().trim();
  const normalizedCt = !rawCt || rawCt === 'BOTH' ? 'CALL' : rawCt;
  const rawSide = String(cfg.tradeSide || normalizedCt).toUpperCase().trim();
  const initialTradeSide = !rawSide || rawSide === 'BOTH' ? normalizedCt : rawSide;
  const normalizedSideMode: 'both' | 'single' =
    String(cfg.contractSideMode || '').trim().toLowerCase() === 'single' ? 'single' : 'both';

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const rawStake = Number(cfg.baseStake);
  const clampedStake = Number(Math.max(0.35, Number.isFinite(rawStake) && rawStake > 0 ? rawStake : 1).toFixed(2));
  const safeMartingale = Number.isFinite(Number(cfg.martingale)) && Number(cfg.martingale) > 0 ? Number(cfg.martingale) : 2.0;
  const safeTakeProfit = Number.isFinite(Number(cfg.takeProfit)) && Number(cfg.takeProfit) >= 0 ? Number(cfg.takeProfit) : 25;
  const safeStopLoss = Number.isFinite(Number(cfg.stopLoss)) && Number(cfg.stopLoss) >= 0 ? Number(cfg.stopLoss) : 50;
  const safeMaxTrades = Number.isFinite(Number(cfg.maxTrades)) && Number(cfg.maxTrades) > 0 ? Number(cfg.maxTrades) : 50;

  const session: InternalBotSession = {
    userId: cfg.userId,
    runId,
    running: true,
    strategyName: cfg.strategyName || 'Deriv Bot',
    strategyType: cfg.strategyType || 'Martingale',
    symbol: cfg.symbol,
    contractType: normalizedCt,
    baseStake: clampedStake,
    currentStake: clampedStake,
    martingaleStep: 0,
    martingaleFactor: safeMartingale,
    takeProfit: safeTakeProfit,
    stopLoss: safeStopLoss,
    maxTrades: safeMaxTrades,
    tickCount: 0,
    tradesPlaced: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    startedAt: new Date().toISOString(),
    lastSignal: 'Evaluating entry signal',
    recentPrices: seedPrices.slice(-20),
    barrier: cfg.barrier ?? '2',
    duration: Number.isFinite(Number(cfg.duration)) && Number(cfg.duration) > 0 ? Number(cfg.duration) : 1,
    durationUnit: cfg.durationUnit || 't',
    multiplier: Number.isFinite(Number(cfg.multiplier)) && Number(cfg.multiplier) > 0 ? Number(cfg.multiplier) : 100,
    growthRate: Number.isFinite(Number(cfg.growthRate)) && Number(cfg.growthRate) > 0 ? Number(cfg.growthRate) : 0.02,
    executionMode: resolvedExecutionMode,
    connectedAccountId: resolvedConnectedAccountId,
    accountMode: targetMode,
    executionSpeed: cfg.executionSpeed === 'normal' ? 'normal' : 'fast',
    analyserSync: true,
    unsubscribeTick: null,
    isExecutingTrade: false,
    executingStartedAt: 0,
    lastTradeAt: 0,
    winStreak: 0,
    lossStreak: 0,
    winStep: Number(cfg.winStep || 0),
    maxWinSteps: Number(cfg.maxWinSteps || 3),
    maxStake: Number(cfg.maxStake || 0),
    sellTickCount: Number(cfg.sellTickCount || 0),
    maxLosses: Number(cfg.maxLosses || 0),
    consecutiveErrors: 0,
    contractSideMode: normalizedSideMode,
    currentTradeSide: initialTradeSide,
    conditionType: cfg.conditionType || 'any_tick',
    conditionDigit: Number(cfg.conditionDigit ?? 2),
    quantumPredictionId: cfg.quantumPredictionId || null,
    quantumExpiresAt: null,
    runState: 'idle',
    journal: [],
  };

  appendJournal(
    session,
    'info',
    matchingAcc && !resolvedIsDbLocked && resolvedDerivLoginId
      ? targetMode === 'real'
        ? `You are using your live Real Deriv account (${resolvedDerivLoginId}).`
        : `You are using your live Demo Deriv account (${resolvedDerivLoginId}).`
      : `You are using your ${targetMode === 'real' ? 'Real' : 'Demo'} USD account.`
  );

  session.unsubscribeTick = derivWs.onTick((tick) => {
    if (tick.symbol === session.symbol && session.running) {
      evaluateAndExecuteBotTick(session, tick).catch(() => {});
    }
  });

  activeSessions.set(sKey, session);
  await addNotification(
    cfg.userId,
    'Bot Started',
    `[${session.accountMode.toUpperCase()}] ${session.strategyName} active on ${session.symbol} (${session.contractType}, $${session.baseStake}).`,
    'bot'
  );

  await Promise.race([
    evaluateAndExecuteBotTick(session, latestTick),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);
  derivWs.emitUserEvent(cfg.userId, 'bot_status', serializeTelemetry(session));
  return serializeTelemetry(session);
}

export async function stopBotSession(
  userId: number,
  reason = 'Stopped by trader',
  accountMode?: 'real' | 'demo'
): Promise<BotTelemetry | null> {
  const keysToStop: string[] = accountMode
    ? [sessionKey(userId, accountMode)]
    : [sessionKey(userId, 'demo'), sessionKey(userId, 'real')];

  let lastSnap: BotTelemetry | null = null;
  for (const key of keysToStop) {
    const session = activeSessions.get(key);
    if (!session) continue;
    session.running = false;
    const isManualOrReplace =
      reason.toLowerCase().includes('stopped by trader') ||
      reason.toLowerCase().includes('replaced by');
    if (isManualOrReplace || (session.runState !== 'won' && session.runState !== 'lost')) {
      session.runState = 'idle';
    }
    session.lastSignal = reason;
    if (session.unsubscribeTick) {
      session.unsubscribeTick();
      session.unsubscribeTick = null;
    }
    const snap = serializeTelemetry(session);
    activeSessions.delete(key);
    derivWs.emitUserEvent(userId, 'bot_status', snap);
    await addNotification(
      userId,
      'Bot Stopped',
      `[${session.accountMode.toUpperCase()}] ${session.strategyName}: ${reason}. Net P/L: $${session.realizedPnl.toFixed(2)}`,
      'bot'
    );
    lastSnap = snap;
  }
  if (botLastPersistAt.size > 500) botLastPersistAt.clear();
  return lastSnap;
}

export async function closeAllBotOrders(userId: number, accountMode?: 'real' | 'demo') {
  return bulkCloseOrders(userId, 'bot', accountMode);
}

export function getBotStatus(userId: number, accountMode?: 'real' | 'demo'): BotTelemetry {
  if (accountMode) {
    const session = activeSessions.get(sessionKey(userId, accountMode));
    if (session) return serializeTelemetry(session);
  } else {
    const activeReal = activeSessions.get(sessionKey(userId, 'real'));
    if (activeReal) return serializeTelemetry(activeReal);
    const activeDemo = activeSessions.get(sessionKey(userId, 'demo'));
    if (activeDemo) return serializeTelemetry(activeDemo);
  }
  return {
    running: false,
    runId: '',
    runState: 'idle',
    strategyName: '',
    strategyType: 'Martingale',
    symbol: '1HZ100V',
    contractType: 'DIGITOVER',
    baseStake: 1,
    currentStake: 1,
    martingaleStep: 0,
    martingaleFactor: 2.0,
    takeProfit: 25,
    stopLoss: 50,
    maxTrades: 50,
    tickCount: 0,
    tradesPlaced: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    startedAt: '',
    lastSignal: 'Idle',
    recentPrices: [],
    accountMode: accountMode === 'real' ? 'real' : 'demo',
    executionSpeed: 'fast',
    analyserSync: false,
    growthRate: 0.02,
    journal: [],
  };
}
