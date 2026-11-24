import { Router } from 'express';
import { pool, query, queryOne, execute, ensureDatabaseSchema, requireDb, addNotification } from '../db.ts';
import { SEEDED_BOT_STRATEGIES } from '../catalog.ts';
import { derivWs } from '../deriv-client.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import {
  placeUnifiedOrder,
  closeOrderById,
  bulkCloseOrders,
  updateOrderLimits,
  classifyConnectedAccountBucket,
  type WalletBucket,
} from '../trade-execution.ts';
import { startBotSession, stopBotSession, closeAllBotOrders, getBotStatus } from '../bot-engine-service.ts';

const router = Router();

const ORDER_COLS = `id, user_id, symbol, side, contract_type, lots, stake, multiplier, entry_price, current_price, exit_price, pnl, sl_usd, tp_usd, sl_price, tp_price, barrier, duration, duration_unit, execution_mode, connected_account_id, account_mode, wallet_bucket, source, strategy_key, timeframe, notes, deriv_contract_id, status, opened_at, closed_at`;

const BOT_STRATEGIES_TTL_MS = 5 * 60 * 1000;
let botStrategiesCache: any[] | null = null;
let botStrategiesCachedAt = 0;

export function invalidateBotStrategiesCache(): void {
  botStrategiesCache = null;
  botStrategiesCachedAt = 0;
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

router.get('/orders', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 60)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const rows = await query<any>(
    `SELECT ${ORDER_COLS} FROM virtual_orders WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset]
  );
  const orders = rows.map((o) => {
    if (o.status !== 'OPEN') return o;
    derivWs.ensureSymbolSubscribed(o.symbol).catch(() => {});
    const ct = String(o.contract_type || '').toUpperCase();
    const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(ct);
    const t = derivWs.getLatestTick(o.symbol);
    if (ct === 'ACCU') {
      const growthRate = Math.min(0.05, Math.max(0.01, Number(o.barrier || 0.02)));
      const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(o.opened_at).getTime()) / 1500));
      const accrued = Number((Number(o.stake) * (Math.pow(1 + growthRate, Math.min(45, elapsedTicks)) - 1)).toFixed(2));
      return { ...o, current_price: t?.quote ?? o.current_price, pnl: accrued };
    }
    if (isMult && t && (t.source === 'deriv_ws' || t.source === 'live_pulse') && Number(o.entry_price) > 0) {
      const isUp = ct === 'MULTUP' || o.side === 'BUY';
      const pctDiff = (t.quote - Number(o.entry_price)) / Number(o.entry_price);
      const directional = isUp ? pctDiff : -pctDiff;
      const livePnl = Number(
        Math.max(-Number(o.stake), directional * Number(o.stake) * Number(o.multiplier || 100)).toFixed(2)
      );
      return { ...o, current_price: t.quote, pnl: livePnl };
    }
    return o;
  });
  res.json({ orders });
});

async function handleExecuteOrder(req: AuthRequest, res: any) {
  try {
    const body = req.body || {};
    if (!body.symbol || !body.side) {
      res.status(400).json({ error: 'Symbol and side are required' });
      return;
    }

    const order = await placeUnifiedOrder({
      userId: req.user!.id,
      symbol: String(body.symbol),
      side: String(body.side),
      contractType: body.contractType,
      lots: body.lots !== undefined ? Number(body.lots) : undefined,
      stake: body.stake !== undefined ? Number(body.stake) : undefined,
      multiplier: body.multiplier !== undefined ? Number(body.multiplier) : 100,
      growthRate: body.growthRate !== undefined ? Number(body.growthRate) : undefined,
      isAnalyserSynced: Boolean(body.isAnalyserSynced),
      slUsd: body.slUsd !== undefined ? Number(body.slUsd) : null,
      tpUsd: body.tpUsd !== undefined ? Number(body.tpUsd) : null,
      slPrice: body.slPrice !== undefined ? Number(body.slPrice) : null,
      tpPrice: body.tpPrice !== undefined ? Number(body.tpPrice) : null,
      barrier: body.barrier !== undefined ? String(body.barrier) : null,
      duration: body.duration !== undefined ? Number(body.duration) : 5,
      durationUnit: body.durationUnit || 't',
      executionMode: body.executionMode || 'virtual',
      connectedAccountId: body.connectedAccountId ? Number(body.connectedAccountId) : null,
      walletBucket:
        body.walletBucket === 'mt5_standard' || body.walletBucket === 'mt5_gold' ? body.walletBucket : 'options',
      source: body.source || 'manual',
      strategyKey: body.strategyKey ? String(body.strategyKey) : '',
      timeframe: body.timeframe ? String(body.timeframe) : '',
      accountMode: body.accountMode === 'real' ? 'real' : 'demo',
      notes: body.notes ? String(body.notes) : '',
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Order execution failed' });
  }
}

router.post('/orders', requireDb, requireAuth, handleExecuteOrder);
router.post('/trade/execute', requireDb, requireAuth, handleExecuteOrder);

router.post('/orders/bulk', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const symbol = String(body.symbol || '1HZ100V');
    const count = Math.min(25, Math.max(1, Number(body.count || 1)));
    const unitStake =
      body.stake !== undefined
        ? Math.max(0.5, Number(body.stake))
        : body.lots !== undefined
          ? Math.max(0.5, Number(body.lots) * 100)
          : 2;
    const totalBatchStake = Number((unitStake * count).toFixed(2));
    const acctMode = body.accountMode === 'real' ? 'real' : 'demo';

    const requestedBucket: WalletBucket =
      body.walletBucket === 'mt5_standard' || body.walletBucket === 'mt5_gold' ? body.walletBucket : 'options';
    const connectedAccId = body.connectedAccountId ? Number(body.connectedAccountId) : null;

    // Pre-warm live Deriv subscription and spot quote so entry and live P/L stream immediately
    await derivWs.ensureSymbolSubscribed(symbol).catch(() => {});
    await derivWs.getLiveQuote(symbol).catch(() => null);

    // Upfront batch balance check for wallet/demo modes (skip blocking when unlocked Deriv account trades live)
    const uWalletRow = await queryOne<{ virtual_workspace_balance: number; demo_wallets_json: string; real_wallets_json: string }>(
      'SELECT virtual_workspace_balance, demo_wallets_json, real_wallets_json FROM users WHERE id = $1',
      [req.user!.id]
    );
    const parseW = (raw: string | null | undefined) => {
      try {
        return JSON.parse(raw || '{}');
      } catch {
        return {};
      }
    };
    const dwParsed = parseW(uWalletRow?.demo_wallets_json);
    const rwParsed = parseW(uWalletRow?.real_wallets_json);
    const isModeDbLocked = acctMode === 'real' ? Boolean(rwParsed?.db_locked) : Boolean(dwParsed?.db_locked);

    let skipLocalCheck = false;
    if (requestedBucket === 'options' && body.executionMode === 'deriv' && !isModeDbLocked) {
      const targetIsVirt = acctMode === 'demo';
      const optAcc = connectedAccId
        ? await queryOne<{ balance_locked_by_admin: boolean }>(
            "SELECT COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE id = $1 AND user_id = $2 AND is_virtual = $3 AND status = 'active'",
            [connectedAccId, req.user!.id, targetIsVirt]
          )
        : await queryOne<{ balance_locked_by_admin: boolean }>(
            "SELECT COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE user_id = $1 AND is_virtual = $2 AND (platform = 'deriv' OR platform IS NULL) AND status = 'active' ORDER BY COALESCE(balance_locked_by_admin, FALSE) ASC, id ASC LIMIT 1",
            [req.user!.id, targetIsVirt]
          );
      if (optAcc && !optAcc.balance_locked_by_admin) {
        skipLocalCheck = true;
      }
    }

    if (acctMode === 'demo' && !skipLocalCheck) {
      let effectiveBucket: WalletBucket = requestedBucket;
      let accBal: number | null = null;
      let accLocked = false;
      if (connectedAccId) {
        const acc = await queryOne<{
          account_type: string;
          platform: string;
          last_known_balance: number;
          balance: number;
          balance_locked_by_admin: boolean;
        }>(
          "SELECT account_type, platform, last_known_balance, balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE id = $1 AND user_id = $2 AND is_virtual = TRUE AND status = 'active'",
          [connectedAccId, req.user!.id]
        );
        if (acc) {
          const derived = classifyConnectedAccountBucket(acc);
          if (derived !== 'options') effectiveBucket = derived;
          accBal = Number(acc.last_known_balance ?? acc.balance ?? 0);
          accLocked = Boolean(acc.balance_locked_by_admin);
        }
      }

      if (effectiveBucket !== 'options') {
        const dwBal = Number(dwParsed?.[effectiveBucket] || 0);
        const availDemoCfd = accBal !== null && (accBal > 0 || dwBal === 0) ? accBal : dwBal;
        if (availDemoCfd < totalBatchStake) {
          res.status(400).json({
            error: `Insufficient Demo CFD balance ($${availDemoCfd.toFixed(2)}) for ${count}x $${unitStake.toFixed(2)} batch ($${totalBatchStake.toFixed(2)}).`,
          });
          return;
        }
      } else {
        const dwOpts = Number(dwParsed?.options || 0);
        const availDemoOptions = accLocked && accBal !== null ? Math.max(accBal, dwOpts) : dwOpts;
        if (availDemoOptions < totalBatchStake) {
          res.status(400).json({
            error: `Insufficient Demo Options balance ($${availDemoOptions.toFixed(2)}) for ${count}x $${unitStake.toFixed(2)} batch ($${totalBatchStake.toFixed(2)}). Transfer funds from USD Wallet to Options first.`,
          });
          return;
        }
      }
    }

    const orders: any[] = [];
    for (let i = 0; i < count; i++) {
      const o = await placeUnifiedOrder({
        userId: req.user!.id,
        symbol,
        side: String(body.side || 'BUY'),
        contractType: body.contractType,
        lots: body.lots !== undefined ? Number(body.lots) : undefined,
        stake: unitStake,
        multiplier: body.multiplier !== undefined ? Number(body.multiplier) : 100,
        slUsd: body.slUsd !== undefined ? Number(body.slUsd) : null,
        tpUsd: body.tpUsd !== undefined ? Number(body.tpUsd) : null,
        slPrice: body.slPrice !== undefined ? Number(body.slPrice) : null,
        tpPrice: body.tpPrice !== undefined ? Number(body.tpPrice) : null,
        barrier: body.barrier !== undefined ? String(body.barrier) : null,
        duration: body.duration !== undefined ? Number(body.duration) : 5,
        durationUnit: body.durationUnit || 't',
        executionMode: body.executionMode || 'virtual',
        connectedAccountId: connectedAccId,
        walletBucket: requestedBucket,
        accountMode: acctMode,
        strategyKey: body.strategyKey ? String(body.strategyKey) : '',
        timeframe: body.timeframe ? String(body.timeframe) : '',
        notes: body.notes ? String(body.notes) : '',
        idempotencyKey: body.idempotencyKey ? `${String(body.idempotencyKey)}-${i}` : undefined,
        source: 'bulk',
      });
      orders.push(o);
    }

    const liveTick = derivWs.getLatestTick(symbol);
    const enrichedOrders = orders.map((o) => {
      const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(String(o.contract_type || '').toUpperCase());
      if (isMult && liveTick && (liveTick.source === 'deriv_ws' || liveTick.source === 'live_pulse') && Number(o.entry_price) > 0) {
        const isUp = o.contract_type === 'MULTUP' || o.side === 'BUY';
        const pctDiff = (liveTick.quote - Number(o.entry_price)) / Number(o.entry_price);
        const directional = isUp ? pctDiff : -pctDiff;
        const livePnl = Number(
          Math.max(-Number(o.stake), directional * Number(o.stake) * Number(o.multiplier || 100)).toFixed(2)
        );
        return { ...o, current_price: liveTick.quote, pnl: livePnl };
      }
      return o;
    });

    await addNotification(
      req.user!.id,
      'Bulk Order Batch Executed',
      `Opened ${enrichedOrders.length} ${body.side} position(s) on ${symbol}.`,
      'trading'
    );
    res.status(201).json({ count: enrichedOrders.length, orders: enrichedOrders });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Bulk execution failed' });
  }
});

router.post('/orders/bulk-close', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const filter = (req.body?.filter || 'all') as 'all' | 'profitable' | 'losing' | 'buy' | 'sell' | 'over' | 'under' | 'bot';
    const result = await bulkCloseOrders(req.user!.id, filter);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Bulk close failed' });
  }
});

router.post('/orders/:id/close', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const order = await closeOrderById(Number(req.params.id), req.user!.id);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close position' });
  }
});

router.patch('/orders/:id/limits', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const order = await updateOrderLimits(Number(req.params.id), req.user!.id, {
      slPrice: b.slPrice !== undefined ? (b.slPrice === null || b.slPrice === '' ? null : Number(b.slPrice)) : undefined,
      tpPrice: b.tpPrice !== undefined ? (b.tpPrice === null || b.tpPrice === '' ? null : Number(b.tpPrice)) : undefined,
      slUsd: b.slUsd !== undefined ? (b.slUsd === null || b.slUsd === '' ? null : Number(b.slUsd)) : undefined,
      tpUsd: b.tpUsd !== undefined ? (b.tpUsd === null || b.tpUsd === '' ? null : Number(b.tpUsd)) : undefined,
    });
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update SL/TP limits' });
  }
});

router.post('/trade/close', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.body?.orderId ?? req.body?.id);
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }
    const order = await closeOrderById(orderId, req.user!.id);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close position' });
  }
});

router.post('/orders/reset-balance', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.body?.accountMode === 'real') {
    res.status(400).json({ error: 'Reset balance is only available for Demo accounts.' });
    return;
  }

  const rawTarget = String(req.body?.target || 'options').toLowerCase();
  const targetAccountId = req.body?.accountId ? Number(req.body.accountId) : null;
  const resetBucket: 'options' | 'mt5_standard' | 'mt5_gold' | 'cfd' =
    rawTarget === 'mt5_standard' || rawTarget === 'mt5_gold' || rawTarget === 'cfd' ? rawTarget : 'options';

  if (resetBucket !== 'options') {
    const u = await queryOne<{ demo_wallets_json: string }>(
      'SELECT demo_wallets_json FROM users WHERE id = $1',
      [req.user!.id]
    );
    const dw = (() => {
      try {
        return { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0, ...JSON.parse(u?.demo_wallets_json || '{}') };
      } catch {
        return { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 };
      }
    })();

    const demoCfdAccs = await query<{ id: number; account_type: string; platform: string; last_known_balance: number }>(
      `SELECT id, account_type, platform, last_known_balance
       FROM connected_accounts
       WHERE user_id = $1 AND is_virtual = TRUE AND status = 'active'
       ORDER BY id ASC`,
      [req.user!.id]
    );

    const bucketsToReset: Array<'mt5_standard' | 'mt5_gold'> =
      resetBucket === 'cfd' ? ['mt5_standard', 'mt5_gold'] : [resetBucket];

    for (const b of bucketsToReset) {
      const matching = demoCfdAccs.filter((a) => classifyConnectedAccountBucket(a) === b);
      if (targetAccountId && matching.some((a) => Number(a.id) === targetAccountId)) {
        await execute(
          'UPDATE connected_accounts SET balance = 10000.00, last_known_balance = 10000.00, updated_at = NOW() WHERE id = $1 AND user_id = $2',
          [targetAccountId, req.user!.id]
        );
        for (const a of matching) {
          if (Number(a.id) === targetAccountId) a.last_known_balance = 10000.0;
        }
        derivWs.emitUserEvent(req.user!.id, 'account_updated', { accountId: targetAccountId, balance: 10000.0 });
        dw[b] = Number(matching.reduce((s, a) => s + Number(a.last_known_balance || 0), 0).toFixed(2));
      } else if (matching.length > 0) {
        const primary = matching[matching.length - 1];
        for (const a of matching) {
          const val = Number(a.id) === Number(primary.id) ? 10000.0 : 0;
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [val, a.id]
          );
          a.last_known_balance = val;
          derivWs.emitUserEvent(req.user!.id, 'account_updated', { accountId: a.id, balance: val });
        }
        dw[b] = 10000.0;
      } else {
        dw[b] = 10000.0;
      }
    }

    await execute('UPDATE users SET demo_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(dw),
      req.user!.id,
    ]);
    derivWs.emitUserEvent(req.user!.id, 'balance_updated', { demo_wallets: dw, demoWallets: dw });

    await addNotification(
      req.user!.id,
      'Demo CFD Balance Reset',
      `Demo ${resetBucket === 'mt5_gold' ? 'CFD Gold / Swap-Free' : 'CFD Standard'} balance reset to $10,000.00 USD. Options & Real balances remain untouched.`,
      'account'
    );
    res.json({ ok: true, demo_wallets: dw, balance: 10000.0 });
    return;
  }

  const u = await queryOne<{ demo_wallets_json: string; virtual_workspace_balance: number }>(
    'SELECT demo_wallets_json, virtual_workspace_balance FROM users WHERE id = $1',
    [req.user!.id]
  );
  const dw = (() => {
    try {
      return {
        main_usd: Number(u?.virtual_workspace_balance ?? 10000),
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
        ...JSON.parse(u?.demo_wallets_json || '{}'),
      };
    } catch {
      return {
        main_usd: Number(u?.virtual_workspace_balance ?? 10000),
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
      };
    }
  })();
  dw.options = 10000.0;

  await execute(
    `UPDATE users
     SET demo_wallets_json = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(dw), req.user!.id]
  );
  await execute(
    `UPDATE connected_accounts
     SET balance = 10000.00,
         last_known_balance = 10000.00,
         updated_at = NOW()
     WHERE user_id = $1 AND is_virtual = TRUE AND (platform = 'deriv' OR platform IS NULL)`,
    [req.user!.id]
  );
  derivWs.emitUserEvent(req.user!.id, 'balance_updated', { demo_wallets: dw, demoWallets: dw });
  derivWs.emitUserEvent(req.user!.id, 'account_updated', { userId: req.user!.id });
  await addNotification(
    req.user!.id,
    'Demo Balance Reset',
    'Demo Options balance reset to $10,000.00 USD. Main USD Wallet, Real & CFD balances remain untouched.',
    'account'
  );
  res.json({ ok: true, demo_wallets: dw, balance: 10000.0 });
});

// Bots (No password gate)
router.get('/bots/strategies', async (_req, res) => {
  if (botStrategiesCache && Date.now() - botStrategiesCachedAt < BOT_STRATEGIES_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ strategies: botStrategiesCache });
    return;
  }
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const rows = await query<any>(
        `SELECT id, name, slug, category, symbol, contract_type, description, win_rate_est, rating, is_premium, is_active, config_json
         FROM bot_strategies
         WHERE is_active = TRUE
         ORDER BY is_premium ASC, rating DESC
         LIMIT 100`
      );
      const strategies = rows.map((r) => ({
        ...r,
        config: (() => {
          try {
            return JSON.parse(r.config_json || '{}');
          } catch {
            return {};
          }
        })(),
      }));
      botStrategiesCache = strategies;
      botStrategiesCachedAt = Date.now();
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json({ strategies });
      return;
    } catch {
      // fallback to curated seeded list
    }
  }
  res.json({
    strategies: SEEDED_BOT_STRATEGIES.map((s, idx) => ({
      id: idx + 1,
      ...s,
      is_active: true,
    })),
  });
});

router.post('/bots/run', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const telemetry = await startBotSession({
      userId: req.user!.id,
      strategyName: String(b.strategyName || 'Deriv Bot'),
      strategyType: String(b.strategyType || 'Martingale'),
      symbol: String(b.symbol || '1HZ100V'),
      contractType: String(b.contractType || 'DIGITOVER'),
      contractSideMode: b.contractSideMode === 'single' ? 'single' : 'both',
      tradeSide: b.tradeSide ? String(b.tradeSide) : undefined,
      baseStake: Number(b.baseStake || b.stake || 1.0),
      winStep: b.winStep !== undefined ? Number(b.winStep) : undefined,
      maxWinSteps: b.maxWinSteps !== undefined ? Number(b.maxWinSteps) : undefined,
      barrier: b.barrier !== undefined ? String(b.barrier) : '2',
      duration: Number(b.duration || 1),
      durationUnit: String(b.durationUnit || 't'),
      multiplier: Number(b.multiplier || 100),
      growthRate: Number(b.growthRate || 0.02),
      martingale: Number(b.martingale || 2.0),
      takeProfit: Number(b.takeProfit || 6),
      stopLoss: Number(b.stopLoss || 3),
      maxTrades: Number(b.maxTrades || 15),
      executionMode: b.executionMode || 'virtual',
      connectedAccountId: b.connectedAccountId ? Number(b.connectedAccountId) : null,
      accountMode: b.accountMode === 'real' ? 'real' : 'demo',
      executionSpeed: b.executionSpeed === 'normal' ? 'normal' : 'fast',
      analyserSync: Boolean(b.analyserSync),
      conditionType: b.conditionType,
      conditionDigit: b.conditionDigit !== undefined ? Number(b.conditionDigit) : undefined,
    });
    res.json({ telemetry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start bot' });
  }
});

router.post('/bots/stop', requireAuth, async (req: AuthRequest, res) => {
  const telemetry = await stopBotSession(req.user!.id, 'Stopped by trader');
  res.json({ telemetry: telemetry || getBotStatus(req.user!.id) });
});

router.post('/bots/close-all', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const result = await closeAllBotOrders(req.user!.id);
  res.json(result);
});

router.get('/bots/status', requireAuth, (req: AuthRequest, res) => {
  res.json({ telemetry: getBotStatus(req.user!.id) });
});

export default router;
