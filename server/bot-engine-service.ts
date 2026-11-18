import { query, queryOne, execute, addNotification } from './db.ts';
import { derivWs, type TickData } from './deriv-client.ts';
import { placeUnifiedOrder, closeOrderById, bulkCloseOrders } from './trade-execution.ts';

export interface BotSessionConfig {
  userId: number;
  strategyName: string;
  symbol: string;
  contractType: string;
  baseStake: number;
  barrier?: string;
  duration?: number;
  durationUnit?: string;
  multiplier?: number;
  martingale?: number;
  takeProfit?: number;
  stopLoss?: number;
  maxTrades?: number;
  executionMode?: 'virtual' | 'deriv';
  connectedAccountId?: number | null;
}

export interface BotTelemetry {
  running: boolean;
  strategyName: string;
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
}

interface InternalBotSession extends BotTelemetry {
  userId: number;
  barrier: string;
  duration: number;
  durationUnit: string;
  multiplier: number;
  executionMode: 'virtual' | 'deriv';
  connectedAccountId: number | null;
  unsubscribeTick: (() => void) | null;
  isExecutingTrade: boolean;
}

const activeSessions = new Map<number, InternalBotSession>();
const closingOrderLocks = new Set<number>();

function getLastDigit(price: number, pipSize = 0.01): number {
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const s = price.toFixed(decimals);
  return Number(s[s.length - 1] || 0);
}

function decideBotSide(session: InternalBotSession, latestPrice: number, pipSize: number) {
  const ct = session.contractType.toUpperCase();
  const digit = getLastDigit(latestPrice, pipSize);
  const prices = session.recentPrices;
  const avg5 = prices.length >= 5 ? prices.slice(-5).reduce((a, b) => a + b, 0) / 5 : latestPrice;

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
    const bullish = latestPrice >= avg5;
    const chosen = ct === 'CALL' ? (bullish ? 'CALL' : 'PUT') : 'PUT';
    return { contractType: chosen, side: chosen, barrier: '', reason: `Momentum ${latestPrice.toFixed(2)} vs 5-tick avg ${avg5.toFixed(2)} -> ${chosen}` };
  }
  if (ct === 'MULTUP' || ct === 'MULTDOWN') {
    const bullish = latestPrice >= avg5;
    const chosen = bullish ? 'MULTUP' : 'MULTDOWN';
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

    const hitTp = order.tp_usd && livePnl >= Number(order.tp_usd);
    const hitSl = order.sl_usd && livePnl <= -Number(order.sl_usd);
    if (hitTp || hitSl) {
      closingOrderLocks.add(order.id);
      closeOrderById(order.id, session.userId)
        .then((closed) => {
          if (closed) {
            const p = Number(closed.pnl || 0);
            session.realizedPnl = Number((session.realizedPnl + p).toFixed(2));
            if (p >= 0) {
              session.wins += 1;
              session.currentStake = session.baseStake;
              session.martingaleStep = 0;
            } else {
              session.losses += 1;
              session.martingaleStep += 1;
              session.currentStake = Number((session.currentStake * session.martingaleFactor).toFixed(2));
            }
          }
        })
        .finally(() => closingOrderLocks.delete(order.id))
        .catch(() => {});
    }
  }

  if (session.takeProfit > 0 && session.realizedPnl >= session.takeProfit) {
    await stopBotSession(session.userId, `Take Profit target ($${session.takeProfit.toFixed(2)}) reached`);
    return;
  }
  if (session.stopLoss > 0 && session.realizedPnl <= -session.stopLoss) {
    await stopBotSession(session.userId, `Stop Loss limit (-$${session.stopLoss.toFixed(2)}) reached`);
    return;
  }
  if (session.maxTrades > 0 && session.tradesPlaced >= session.maxTrades) {
    await stopBotSession(session.userId, `Completed max ${session.maxTrades} bot trades`);
    return;
  }

  if (session.isExecutingTrade) return;
  const stillOpen = await queryOne<{ c: string }>(
    "SELECT COUNT(*)::text as c FROM virtual_orders WHERE user_id = $1 AND symbol = $2 AND status = 'OPEN' AND source = 'bot'",
    [session.userId, session.symbol]
  );
  if (Number(stillOpen?.c || 0) > 0) return;

  session.isExecutingTrade = true;
  try {
    const decision = decideBotSide(session, tick.quote, tick.pipSize);
    session.lastSignal = decision.reason;

    const order = await placeUnifiedOrder({
      userId: session.userId,
      symbol: session.symbol,
      side: decision.side,
      contractType: decision.contractType,
      stake: session.currentStake,
      lots: Number((session.currentStake / 100).toFixed(2)),
      multiplier: session.multiplier,
      slUsd: session.contractType.startsWith('MULT') ? Number((session.currentStake * 0.5).toFixed(2)) : null,
      tpUsd: session.contractType.startsWith('MULT') ? Number((session.currentStake * 1.0).toFixed(2)) : null,
      barrier: decision.barrier,
      duration: session.duration,
      durationUnit: session.durationUnit,
      executionMode: session.executionMode,
      connectedAccountId: session.connectedAccountId,
      source: 'bot',
    });

    session.tradesPlaced += 1;
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
              session.realizedPnl = Number((session.realizedPnl + p).toFixed(2));
              if (p >= 0) {
                session.wins += 1;
                session.currentStake = session.baseStake;
                session.martingaleStep = 0;
              } else {
                session.losses += 1;
                session.martingaleStep += 1;
                session.currentStake = Number((session.currentStake * session.martingaleFactor).toFixed(2));
              }
              derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
            }
          }
        } catch {
          clearInterval(checkInterval);
        }
      }, 450);
    }
  } catch (err) {
    session.lastSignal = err instanceof Error ? err.message : 'Execution paused';
    if (session.lastSignal.toLowerCase().includes('insufficient')) {
      await stopBotSession(session.userId, session.lastSignal);
    }
  } finally {
    session.isExecutingTrade = false;
  }
}

function serializeTelemetry(s: InternalBotSession): BotTelemetry {
  return {
    running: s.running,
    strategyName: s.strategyName,
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
  };
}

export async function startBotSession(cfg: BotSessionConfig): Promise<BotTelemetry> {
  if (activeSessions.has(cfg.userId)) {
    await stopBotSession(cfg.userId, 'Replaced by new bot run');
  }

  await derivWs.ensureSymbolSubscribed(cfg.symbol);
  const seedPrices = await derivWs.fetchTickHistory(cfg.symbol, 25);
  const latestTick = derivWs.getLatestTick(cfg.symbol) || {
    symbol: cfg.symbol,
    quote: seedPrices[seedPrices.length - 1] || 1000,
    bid: seedPrices[seedPrices.length - 1] || 1000,
    ask: seedPrices[seedPrices.length - 1] || 1000,
    epoch: Math.floor(Date.now() / 1000),
    pipSize: 0.01,
  };

  const session: InternalBotSession = {
    userId: cfg.userId,
    running: true,
    strategyName: cfg.strategyName || 'Custom Bot',
    symbol: cfg.symbol,
    contractType: cfg.contractType || 'DIGITOVER',
    baseStake: Number(Math.max(0.5, cfg.baseStake || 1).toFixed(2)),
    currentStake: Number(Math.max(0.5, cfg.baseStake || 1).toFixed(2)),
    martingaleStep: 0,
    martingaleFactor: Number(cfg.martingale || 2.0),
    takeProfit: Number(cfg.takeProfit || 25),
    stopLoss: Number(cfg.stopLoss || 50),
    maxTrades: Number(cfg.maxTrades || 50),
    tickCount: 0,
    tradesPlaced: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    startedAt: new Date().toISOString(),
    lastSignal: 'Zero-delay startup: evaluating immediate entry',
    recentPrices: seedPrices.slice(-20),
    barrier: cfg.barrier ?? '2',
    duration: Number(cfg.duration || 1),
    durationUnit: cfg.durationUnit || 't',
    multiplier: Number(cfg.multiplier || 100),
    executionMode: cfg.executionMode || 'virtual',
    connectedAccountId: cfg.connectedAccountId || null,
    unsubscribeTick: null,
    isExecutingTrade: false,
  };

  session.unsubscribeTick = derivWs.onTick((tick) => {
    if (tick.symbol === session.symbol && session.running) {
      evaluateAndExecuteBotTick(session, tick).catch(() => {});
    }
  });

  activeSessions.set(cfg.userId, session);
  await addNotification(
    cfg.userId,
    'Bot Started',
    `${session.strategyName} active on ${session.symbol} (${session.contractType}, $${session.baseStake}).`,
    'bot'
  );

  await evaluateAndExecuteBotTick(session, latestTick);
  derivWs.emitUserEvent(cfg.userId, 'bot_status', serializeTelemetry(session));
  return serializeTelemetry(session);
}

export async function stopBotSession(userId: number, reason = 'Stopped by trader'): Promise<BotTelemetry | null> {
  const session = activeSessions.get(userId);
  if (!session) return null;
  session.running = false;
  session.lastSignal = reason;
  if (session.unsubscribeTick) {
    session.unsubscribeTick();
    session.unsubscribeTick = null;
  }
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

export async function closeAllBotOrders(userId: number) {
  return bulkCloseOrders(userId, 'bot');
}

export function getBotStatus(userId: number): BotTelemetry {
  const session = activeSessions.get(userId);
  if (session) return serializeTelemetry(session);
  return {
    running: false,
    strategyName: '',
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
  };
}
