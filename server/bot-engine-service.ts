import { query, queryOne, execute, addNotification } from './db.ts';
import { derivWs, type TickData } from './deriv-client.ts';
import { placeUnifiedOrder, closeOrderById, bulkCloseOrders } from './trade-execution.ts';
import { computeLiveAnalyserSignal } from './routes/intelligence.ts';

export interface BotSessionConfig {
  userId: number;
  strategyName: string;
  strategyType?: string;
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
  executionMode?: 'virtual' | 'deriv';
  connectedAccountId?: number | null;
  accountMode?: 'real' | 'demo';
  executionSpeed?: 'fast' | 'normal';
  analyserSync?: boolean;
}

export interface BotJournalEntry {
  id: string;
  time: string;
  type: 'info' | 'stake' | 'bought' | 'profit' | 'loss' | 'error';
  text: string;
}

export interface BotTelemetry {
  running: boolean;
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
  journal?: BotJournalEntry[];
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
  lastTradeAt: number;
  winStreak: number;
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

const activeSessions = new Map<number, InternalBotSession>();
const closingOrderLocks = new Set<number>();
const botLastPersistAt = new Map<number, number>();

function getLastDigit(price: number, pipSize = 0.01): number {
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const s = price.toFixed(decimals);
  return Number(s[s.length - 1] || 0);
}

function applyProgressionStake(session: InternalBotSession, won: boolean): void {
  const style = session.strategyType.toLowerCase();
  const base = session.baseStake;
  const factor = Math.max(1.1, session.martingaleFactor || 2.0);

  if (won) {
    session.wins += 1;
    session.winStreak += 1;

    if (style.includes('reverse martingale')) {
      session.martingaleStep = session.winStreak >= 3 ? 0 : session.martingaleStep + 1;
      session.currentStake =
        session.martingaleStep === 0 ? base : Number((session.currentStake * factor).toFixed(2));
    } else if (style.includes("reverse d'alembert")) {
      session.martingaleStep += 1;
      session.currentStake = Number((session.currentStake + base).toFixed(2));
    } else if (style.includes("d'alembert on stat reset")) {
      if (session.winStreak >= 2) {
        session.martingaleStep = 0;
        session.currentStake = base;
      } else {
        session.martingaleStep = Math.max(0, session.martingaleStep - 1);
        session.currentStake = Number(Math.max(base, session.currentStake - base).toFixed(2));
      }
    } else if (style.includes("d'alembert")) {
      session.martingaleStep = Math.max(0, session.martingaleStep - 1);
      session.currentStake = Number(Math.max(base, session.currentStake - base).toFixed(2));
    } else if (style.includes("oscar")) {
      if (session.realizedPnl >= 0) {
        session.martingaleStep = 0;
        session.currentStake = base;
      } else {
        session.martingaleStep += 1;
        session.currentStake = Number((session.currentStake + base).toFixed(2));
      }
    } else if (style.includes('1-3-2-6')) {
      const seq = [1, 3, 2, 6];
      const mult = seq[session.winStreak % seq.length];
      session.martingaleStep = session.winStreak % seq.length;
      session.currentStake = Number((base * mult).toFixed(2));
    } else {
      session.martingaleStep = 0;
      session.currentStake = base;
    }
  } else {
    session.losses += 1;
    session.winStreak = 0;

    if (style.includes('reverse') || style.includes('1-3-2-6')) {
      session.martingaleStep = 0;
      session.currentStake = base;
    } else if (style.includes("oscar")) {
      // Oscar's Grind keeps unit steady on a loss
      session.currentStake = Number(Math.max(base, session.currentStake).toFixed(2));
    } else if (style.includes("d'alembert")) {
      session.martingaleStep += 1;
      session.currentStake = Number((session.currentStake + base).toFixed(2));
    } else if (style.includes('stat reset') && session.martingaleStep >= 4) {
      session.martingaleStep = 0;
      session.currentStake = base;
    } else {
      session.martingaleStep += 1;
      session.currentStake = Number(Math.min(base * 16, session.currentStake * factor).toFixed(2));
    }
  }
}

function decideBotSide(session: InternalBotSession, latestPrice: number, pipSize: number) {
  const ct = session.contractType.toUpperCase();
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
    `SELECT id, user_id, symbol, contract_type, execution_mode, deriv_contract_id, stake, multiplier, entry_price, barrier, sl_usd, tp_usd, opened_at
     FROM virtual_orders
     WHERE user_id = $1 AND symbol = $2 AND status = 'OPEN' AND source = 'bot'
     LIMIT 20`,
    [session.userId, session.symbol]
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
      const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 1500));
      // Realistic mock barrier knockout chance per tick calibrated to growth rate (1%..5%)
      const knockoutChance = Math.min(0.14, growthRate * 1.6);
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
              const p = Number(closed.pnl || 0);
              session.realizedPnl = Number((session.realizedPnl + p).toFixed(2));
              session.runState = p >= 0 ? 'won' : 'lost';
              appendJournal(
                session,
                p >= 0 ? 'profit' : 'loss',
                p >= 0 ? `Profit amount: +${p.toFixed(2)} USD` : `Loss amount: ${p.toFixed(2)} USD`
              );
              applyProgressionStake(session, p >= 0);
              derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
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

      if (elapsedTicks >= 5 || accruedPnl >= Number(order.tp_usd || order.stake * 0.15)) {
        closingOrderLocks.add(order.id);
        botLastPersistAt.delete(order.id);
        closeOrderById(order.id, session.userId)
          .then((closed) => {
            if (closed) {
              const p = Number(closed.pnl || 0);
              session.realizedPnl = Number((session.realizedPnl + p).toFixed(2));
              session.runState = p >= 0 ? 'won' : 'lost';
              appendJournal(
                session,
                p >= 0 ? 'profit' : 'loss',
                p >= 0 ? `Profit amount: +${p.toFixed(2)} USD` : `Loss amount: ${p.toFixed(2)} USD`
              );
              applyProgressionStake(session, p >= 0);
              derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
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
            const p = Number(closed.pnl || 0);
            session.realizedPnl = Number((session.realizedPnl + p).toFixed(2));
            applyProgressionStake(session, p >= 0);
            derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
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
  if (session.executionSpeed === 'normal' && Date.now() - session.lastTradeAt < 1800) {
    return;
  }
  if (openBotOrders.length > 0) return;
  const stillOpen = await queryOne<{ id: number }>(
    "SELECT id FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN' AND source = 'bot' LIMIT 1",
    [session.userId]
  );
  if (stillOpen) return;

  session.isExecutingTrade = true;
  session.runState = 'buying';
  try {
    let targetSymbol = session.symbol;
    let decision = decideBotSide(session, tick.quote, tick.pipSize);
    let duration = session.duration;
    let durationUnit = session.durationUnit;

    if (session.analyserSync) {
      const sig = await computeLiveAnalyserSignal(session.symbol);
      targetSymbol = sig.symbol;
      session.contractType = sig.contractType;
      session.barrier = sig.barrier;
      duration = sig.duration;
      durationUnit = sig.durationUnit;
      decision = {
        contractType: sig.contractType,
        side: sig.side,
        barrier: sig.barrier,
        reason: `[Analyser ${sig.confidence}%] ${sig.reason}`,
      };
    }

    session.lastSignal = decision.reason;
    appendJournal(session, 'stake', `${session.strategyName || 'Bot'} stake: ${session.currentStake.toFixed(2)}`);
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
      isAnalyserSynced: session.analyserSync,
      source: 'bot',
    });

    session.lastTradeAt = Date.now();
    session.tradesPlaced += 1;
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
              session.runState = p >= 0 ? 'won' : 'lost';
              appendJournal(
                session,
                p >= 0 ? 'profit' : 'loss',
                p >= 0 ? `Profit amount: +${p.toFixed(2)} USD` : `Loss amount: ${p.toFixed(2)} USD`
              );
              applyProgressionStake(session, p >= 0);
              derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
            }
          }
        } catch {
          clearInterval(checkInterval);
        }
      }, 900);
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Execution paused';
    const low = rawMsg.toLowerCase();
    const isInsuff = low.includes('insufficient');
    const isFatalAuth = low.includes('token') || low.includes('reconnect') || low.includes('suspended');
    session.lastSignal = isInsuff
      ? 'Your account balance is insufficient to buy this contract.'
      : rawMsg;
    appendJournal(session, 'error', session.lastSignal);
    derivWs.emitUserEvent(session.userId, 'bot_status', serializeTelemetry(session));
    if (isInsuff || isFatalAuth) {
      await stopBotSession(session.userId, session.lastSignal);
    }
  } finally {
    session.isExecutingTrade = false;
  }
}

function serializeTelemetry(s: InternalBotSession): BotTelemetry {
  return {
    running: s.running,
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
    journal: s.journal,
  };
}

export async function startBotSession(cfg: BotSessionConfig): Promise<BotTelemetry> {
  const userRow = await queryOne<{ status: string; trading_suspended: boolean; role: string }>(
    'SELECT role, status, COALESCE(trading_suspended, FALSE) as trading_suspended FROM users WHERE id = $1',
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

  const targetMode: 'real' | 'demo' = cfg.accountMode === 'real' ? 'real' : 'demo';
  let resolvedConnectedAccountId: number | null = cfg.connectedAccountId || null;
  let resolvedExecutionMode: 'virtual' | 'deriv' =
    cfg.executionMode || (targetMode === 'real' ? 'deriv' : 'virtual');
  let resolvedRealLoginId: string | null = null;
  let resolvedRealIsDbLocked = false;

  if (targetMode === 'real') {
    const realAcc = resolvedConnectedAccountId
      ? await queryOne<{ id: number; deriv_login_id: string; balance_locked_by_admin: boolean }>(
          `SELECT id, deriv_login_id, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
           FROM connected_accounts
           WHERE id = $1 AND user_id = $2 AND is_virtual = FALSE AND status = 'active'`,
          [resolvedConnectedAccountId, cfg.userId]
        )
      : await queryOne<{ id: number; deriv_login_id: string; balance_locked_by_admin: boolean }>(
          `SELECT id, deriv_login_id, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
           FROM connected_accounts
           WHERE user_id = $1 AND is_virtual = FALSE AND (platform = 'deriv' OR platform IS NULL) AND status = 'active'
           ORDER BY COALESCE(balance_locked_by_admin, FALSE) ASC, id ASC
           LIMIT 1`,
          [cfg.userId]
        );
    if (realAcc) {
      resolvedConnectedAccountId = realAcc.id;
      resolvedRealLoginId = realAcc.deriv_login_id;
      resolvedRealIsDbLocked = Boolean(realAcc.balance_locked_by_admin);
      if (!resolvedRealIsDbLocked) {
        resolvedExecutionMode = 'deriv';
      }
    }
  }

  const session: InternalBotSession = {
    userId: cfg.userId,
    running: true,
    strategyName: cfg.strategyName || 'Deriv Bot',
    strategyType: cfg.strategyType || 'Martingale',
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
    lastSignal: cfg.analyserSync
      ? 'Analyser Sync connected: scanning highest-confidence entry'
      : 'Zero-delay startup: evaluating immediate entry',
    recentPrices: seedPrices.slice(-20),
    barrier: cfg.barrier ?? '2',
    duration: Number(cfg.duration || 1),
    durationUnit: cfg.durationUnit || 't',
    multiplier: Number(cfg.multiplier || 100),
    growthRate: Number(cfg.growthRate || 0.02),
    executionMode: resolvedExecutionMode,
    connectedAccountId: resolvedConnectedAccountId,
    accountMode: targetMode,
    executionSpeed: cfg.executionSpeed === 'normal' ? 'normal' : 'fast',
    analyserSync: Boolean(cfg.analyserSync),
    unsubscribeTick: null,
    isExecutingTrade: false,
    lastTradeAt: 0,
    winStreak: 0,
    runState: 'buying',
    journal: [],
  };

  appendJournal(
    session,
    'info',
    targetMode === 'real' && resolvedRealLoginId && !resolvedRealIsDbLocked
      ? `You are using your live Real Deriv account (${resolvedRealLoginId}).`
      : 'You are using your USD account.'
  );

  session.unsubscribeTick = derivWs.onTick((tick) => {
    if (tick.symbol === session.symbol && session.running) {
      evaluateAndExecuteBotTick(session, tick).catch(() => {});
    }
  });

  activeSessions.set(cfg.userId, session);
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

export async function stopBotSession(userId: number, reason = 'Stopped by trader'): Promise<BotTelemetry | null> {
  const session = activeSessions.get(userId);
  if (!session) return null;
  session.running = false;
  session.runState = 'idle';
  session.lastSignal = reason;
  if (session.unsubscribeTick) {
    session.unsubscribeTick();
    session.unsubscribeTick = null;
  }
  const snap = serializeTelemetry(session);
  activeSessions.delete(userId);
  if (botLastPersistAt.size > 500) botLastPersistAt.clear();
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
    accountMode: 'demo',
    executionSpeed: 'fast',
    analyserSync: false,
    growthRate: 0.02,
    journal: [],
  };
}
