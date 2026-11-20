import { Router } from 'express';
import { pool, query, queryOne, execute, ensureDatabaseSchema, requireDb, addNotification } from '../db.ts';
import { SEEDED_BOT_STRATEGIES } from '../catalog.ts';
import { derivWs, executeDerivBulkPurchase, resetDerivDemoBalance } from '../deriv-client.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import {
  placeUnifiedOrder,
  closeOrderById,
  bulkCloseOrders,
  updateOrderLimits,
  getContractUpdateHistory,
  cancelOrderById,
  getDecryptedAccountToken,
} from '../trade-execution.ts';
import {
  startBotSession,
  pauseBotSession,
  resumeBotSession,
  resetBotSession,
  stopBotSession,
  emergencyKillAllBots,
  closeAllBotOrders,
  getBotStatus,
  validateBotAst,
} from '../bot-engine-service.ts';
import { runStrategyBacktest } from '../../src/lib/quant-engine.ts';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

router.get('/orders', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const rows = await query<any>('SELECT * FROM virtual_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 200', [
    req.user!.id,
  ]);
  const orders = rows.map((o) => {
    if (o.status !== 'OPEN') return o;
    derivWs.ensureSymbolSubscribed(o.symbol).catch(() => {});
    const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(String(o.contract_type || '').toUpperCase());
    const t = derivWs.getLatestTick(o.symbol);
    if (isMult && t && (t.source === 'deriv_ws' || t.source === 'sync_stream') && Number(o.entry_price) > 0) {
      const isUp = o.contract_type === 'MULTUP' || o.side === 'BUY';
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
      slUsd: body.slUsd !== undefined ? Number(body.slUsd) : null,
      tpUsd: body.tpUsd !== undefined ? Number(body.tpUsd) : null,
      slPrice: body.slPrice !== undefined ? Number(body.slPrice) : null,
      tpPrice: body.tpPrice !== undefined ? Number(body.tpPrice) : null,
      barrier: body.barrier !== undefined ? String(body.barrier) : null,
      duration: body.duration !== undefined ? Number(body.duration) : 5,
      durationUnit: body.durationUnit || 't',
      executionMode: body.executionMode || 'virtual',
      connectedAccountId: body.connectedAccountId ? Number(body.connectedAccountId) : null,
      source: body.source || 'manual',
      strategyKey: body.strategyKey ? String(body.strategyKey) : '',
      timeframe: body.timeframe ? String(body.timeframe) : '',
      accountMode: body.accountMode === 'real' ? 'real' : 'demo',
      notes: body.notes ? String(body.notes) : '',
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
      growthRate: body.growthRate !== undefined ? Number(body.growthRate) : undefined,
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

    // Pre-warm live Deriv subscription and spot quote so entry and live P/L stream immediately
    await derivWs.ensureSymbolSubscribed(symbol).catch(() => {});
    await derivWs.getLiveQuote(symbol).catch(() => null);

    // Upfront batch balance check for wallet/demo modes to avoid half-filled batches
    if (acctMode === 'demo' && body.executionMode !== 'deriv') {
      const u = await queryOne<{ virtual_workspace_balance: number }>(
        'SELECT virtual_workspace_balance FROM users WHERE id = $1',
        [req.user!.id]
      );
      if (Number(u?.virtual_workspace_balance ?? 0) < totalBatchStake) {
        res.status(400).json({
          error: `Insufficient Demo balance ($${Number(u?.virtual_workspace_balance ?? 0).toFixed(2)}) for ${count}x $${unitStake.toFixed(2)} batch ($${totalBatchStake.toFixed(2)}).`,
        });
        return;
      }
    }

    // Optional Deriv REST V2 multi-account bulk purchase (/trading/v1/options/contracts/bulk-purchase/{account_type})
    const targetAccountIds: number[] = Array.isArray(body.targetAccountIds)
      ? body.targetAccountIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0).slice(0, 100)
      : [];

    if (targetAccountIds.length > 0 && body.executionMode === 'deriv') {
      const credsList = (
        await Promise.all(targetAccountIds.map((aid) => getDecryptedAccountToken(aid, req.user!.id)))
      ).filter((c): c is NonNullable<typeof c> => Boolean(c));

      if (credsList.length === 0) {
        res.status(400).json({ error: 'No active connected Deriv accounts found for bulk purchase.' });
        return;
      }

      const primaryCreds = credsList[0];
      const upstreamAccountType = primaryCreds.account.is_virtual ? 'demo' : 'real';
      const normalizedType = String(body.contractType || (body.side === 'SELL' ? 'MULTDOWN' : 'MULTUP')).toUpperCase();
      const limitOrder: Record<string, number> = {};
      if (body.tpUsd && Number(body.tpUsd) >= 0.5) limitOrder.take_profit = Number(Number(body.tpUsd).toFixed(2));
      if (body.slUsd && Number(body.slUsd) >= 0.5 && Number(body.slUsd) < unitStake) {
        limitOrder.stop_loss = Number(Number(body.slUsd).toFixed(2));
      }

      const bulkResp = await executeDerivBulkPurchase(primaryCreds.token, upstreamAccountType, {
        accounts: credsList.map((c) => ({ token: c.token, account_id: c.account.deriv_login_id })),
        amount: unitStake,
        basis: 'stake',
        contract_type: normalizedType,
        currency: primaryCreds.account.currency || 'USD',
        underlying_symbol: symbol,
        symbol,
        multiplier: normalizedType === 'MULTUP' || normalizedType === 'MULTDOWN' ? Number(body.multiplier || 100) : undefined,
        duration: normalizedType !== 'MULTUP' && normalizedType !== 'MULTDOWN' ? Number(body.duration || 5) : undefined,
        duration_unit: normalizedType !== 'MULTUP' && normalizedType !== 'MULTDOWN' ? String(body.durationUnit || 't') : undefined,
        barrier: body.barrier !== undefined && body.barrier !== null ? String(body.barrier) : undefined,
        limit_order: Object.keys(limitOrder).length > 0 ? limitOrder : undefined,
      });

      const entryTick = derivWs.getLatestTick(symbol);
      const entrySpot = entryTick?.quote || 1000;
      const results = Array.isArray(bulkResp?.data?.results)
        ? bulkResp.data.results
        : Array.isArray(bulkResp?.results)
          ? bulkResp.results
          : credsList.map((c) => ({ account_id: c.account.deriv_login_id, contract_id: null }));

      const insertedOrders: any[] = [];
      for (let idx = 0; idx < results.length; idx++) {
        const r = results[idx];
        const matchedCred = credsList.find((c) => c.account.deriv_login_id === r.account_id) || credsList[idx];
        if (r.error) continue;
        const created = await queryOne<any>(
          `INSERT INTO virtual_orders (
            user_id, connected_account_id, deriv_contract_id, execution_mode, source,
            symbol, side, contract_type, lots, stake, multiplier,
            entry_price, current_price, sl_usd, tp_usd, barrier, duration, duration_unit,
            payout, pnl, status, strategy_key, timeframe, account_mode, notes
          ) VALUES ($1,$2,$3,'deriv','bulk',$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16,0,'OPEN',$17,$18,$19,'Deriv V2 bulk-purchase')
          RETURNING *`,
          [
            req.user!.id,
            matchedCred?.account.id || null,
            r.contract_id ? String(r.contract_id) : null,
            symbol,
            String(body.side || 'BUY').toUpperCase(),
            normalizedType,
            Number((unitStake / 100).toFixed(2)),
            unitStake,
            Number(body.multiplier || 100),
            Number(r.spot || entrySpot),
            body.slUsd ? Number(body.slUsd) : null,
            body.tpUsd ? Number(body.tpUsd) : null,
            body.barrier ?? null,
            Number(body.duration || 5),
            String(body.durationUnit || 't'),
            Number(r.payout || 0),
            String(body.strategyKey || ''),
            String(body.timeframe || ''),
            upstreamAccountType,
          ]
        );
        if (created) insertedOrders.push(created);
      }

      await addNotification(
        req.user!.id,
        'Multi-Account Deriv Bulk Purchase',
        `Executed ${insertedOrders.length} contract(s) across ${credsList.length} Deriv account(s) on ${symbol}.`,
        'trading'
      );
      res.status(201).json({ count: insertedOrders.length, orders: insertedOrders, derivBulkResponse: bulkResp });
      return;
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
        connectedAccountId: body.connectedAccountId ? Number(body.connectedAccountId) : null,
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
      if (isMult && liveTick && (liveTick.source === 'deriv_ws' || liveTick.source === 'sync_stream') && Number(o.entry_price) > 0) {
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

router.get('/orders/:id/contract-history', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getContractUpdateHistory(Number(req.params.id), req.user!.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to fetch contract update history' });
  }
});

router.post('/orders/:id/cancel', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const order = await cancelOrderById(Number(req.params.id), req.user!.id);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to cancel contract' });
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

  // Best-effort upstream Deriv REST reset for connected demo accounts
  let derivResetCount = 0;
  try {
    const demoAccounts = await query<{ id: number; deriv_login_id: string }>(
      "SELECT id, deriv_login_id FROM connected_accounts WHERE user_id = $1 AND is_virtual = TRUE AND platform = 'deriv' AND status = 'active'",
      [req.user!.id]
    );
    for (const acc of demoAccounts) {
      const creds = await getDecryptedAccountToken(acc.id, req.user!.id);
      if (creds?.token) {
        await resetDerivDemoBalance(creds.token, acc.deriv_login_id).catch(() => {});
        derivResetCount++;
      }
    }
  } catch {
    // non-fatal upstream sync
  }

  await execute(
    `UPDATE users
     SET virtual_workspace_balance = 10000.00,
         demo_wallets_json = '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
         updated_at = NOW()
     WHERE id = $1`,
    [req.user!.id]
  );
  await execute(
    `UPDATE connected_accounts
     SET balance = CASE WHEN platform = 'deriv' THEN 10000.00 ELSE 0 END,
         last_known_balance = CASE WHEN platform = 'deriv' THEN 10000.00 ELSE 0 END,
         updated_at = NOW()
     WHERE user_id = $1 AND is_virtual = TRUE`,
    [req.user!.id]
  );
  await addNotification(
    req.user!.id,
    'Demo Balance Reset',
    'Demo Options balance reset to $10,000.00 USD. Real balances remain untouched.',
    'account'
  );
  res.json({ ok: true, virtual_workspace_balance: 10000.0, derivResetCount });
});

// Bots (No password gate)
router.get('/bots/strategies', async (_req, res) => {
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const rows = await query<any>('SELECT * FROM bot_strategies WHERE is_active = TRUE ORDER BY is_premium ASC, rating DESC');
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
      strategyName: String(b.strategyName || 'TradeDeriv Instant Bot'),
      symbol: String(b.symbol || '1HZ100V'),
      contractType: String(b.contractType || 'DIGITOVER'),
      baseStake: Number(b.baseStake || b.stake || 1.0),
      barrier: b.barrier !== undefined ? String(b.barrier) : '2',
      duration: Number(b.duration || 1),
      durationUnit: String(b.durationUnit || 't'),
      multiplier: Number(b.multiplier || 100),
      martingale: Number(b.martingale || 2.0),
      takeProfit: Number(b.takeProfit || 6),
      stopLoss: Number(b.stopLoss || 3),
      maxTrades: Number(b.maxTrades || 15),
      executionMode: b.executionMode || 'virtual',
      connectedAccountId: b.connectedAccountId ? Number(b.connectedAccountId) : null,
      accountMode: b.accountMode === 'real' ? 'real' : 'demo',
      executionSpeed: b.executionSpeed === 'normal' ? 'normal' : 'fast',
    });
    res.json({ telemetry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start bot' });
  }
});

router.post('/bots/pause', requireAuth, async (req: AuthRequest, res) => {
  const telemetry = await pauseBotSession(req.user!.id);
  res.json({ telemetry: telemetry || getBotStatus(req.user!.id) });
});

router.post('/bots/resume', requireAuth, async (req: AuthRequest, res) => {
  const telemetry = await resumeBotSession(req.user!.id);
  res.json({ telemetry: telemetry || getBotStatus(req.user!.id) });
});

router.post('/bots/reset', requireAuth, async (req: AuthRequest, res) => {
  const telemetry = await resetBotSession(req.user!.id);
  res.json({ telemetry });
});

router.post('/bots/stop', requireAuth, async (req: AuthRequest, res) => {
  const telemetry = await stopBotSession(req.user!.id, 'Stopped by trader');
  res.json({ telemetry: telemetry || getBotStatus(req.user!.id) });
});

router.post('/bots/kill-all', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'owner' || req.user!.role === 'admin';
  let stoppedCount = 0;
  if (isAdmin) {
    const k = await emergencyKillAllBots('Global Kill Switch Activated by Admin');
    stoppedCount = k.stoppedCount;
  } else {
    const s = await stopBotSession(req.user!.id, 'Emergency Kill Switch Activated by Trader');
    stoppedCount = s ? 1 : 0;
  }
  const closed = await closeAllBotOrders(req.user!.id);
  res.json({ ok: true, stoppedCount, closedOrders: closed.closedCount, telemetry: getBotStatus(req.user!.id) });
});

router.post('/bots/close-all', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const result = await closeAllBotOrders(req.user!.id);
  res.json(result);
});

router.get('/bots/status', requireAuth, (req: AuthRequest, res) => {
  res.json({ telemetry: getBotStatus(req.user!.id) });
});

router.get('/bots/runs', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const runs = await query('SELECT * FROM bot_runs WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.user!.id]);
  res.json({ runs });
});

router.get('/bots/logs', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const logs = await query('SELECT * FROM bot_execution_logs WHERE user_id = $1 ORDER BY id DESC LIMIT 120', [
    req.user!.id,
  ]);
  res.json({ logs });
});

// Visual Blockly AST Strategy Builder Endpoints
router.get('/bots/ast/definitions', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const personal = await query('SELECT * FROM bot_definitions WHERE user_id = $1 ORDER BY id DESC', [req.user!.id]);
  const templates = await query(
    "SELECT * FROM bot_definitions WHERE is_template = TRUE OR visibility = 'public' ORDER BY id DESC"
  );
  res.json({ definitions: personal, templates });
});

router.post('/bots/ast/definitions', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const check = validateBotAst(b.ast);
  if (!check.valid || !check.ast) {
    res.status(400).json({ error: check.errors.join(' '), errors: check.errors });
    return;
  }

  const row = await queryOne<any>(
    `INSERT INTO bot_definitions (
      user_id, name, description, category, ast_json, xml_source, symbol, timeframe, contract_type,
      config_json, risk_json, demo_tested, is_template, visibility
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, 'private')
    RETURNING *`,
    [
      req.user!.id,
      check.ast.name,
      String(b.description || ''),
      String(b.category || check.ast.market.category || 'Custom'),
      JSON.stringify(check.ast),
      String(b.xmlSource || ''),
      check.ast.market.instrument,
      check.ast.market.timeframe,
      check.ast.market.contractType,
      JSON.stringify({ actions: check.ast.actions, conditions: check.ast.conditions }),
      JSON.stringify(check.ast.risk),
      Boolean(b.demoTested),
    ]
  );

  res.status(201).json({ definition: row });
});

router.put('/bots/ast/definitions/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const check = validateBotAst(b.ast);
  if (!check.valid || !check.ast) {
    res.status(400).json({ error: check.errors.join(' '), errors: check.errors });
    return;
  }

  const row = await queryOne<any>(
    `UPDATE bot_definitions SET
      name = $1, description = $2, category = $3, ast_json = $4, xml_source = $5,
      symbol = $6, timeframe = $7, contract_type = $8, config_json = $9, risk_json = $10,
      demo_tested = COALESCE($11, demo_tested), updated_at = NOW()
     WHERE id = $12 AND user_id = $13
     RETURNING *`,
    [
      check.ast.name,
      String(b.description || ''),
      String(b.category || check.ast.market.category || 'Custom'),
      JSON.stringify(check.ast),
      String(b.xmlSource || ''),
      check.ast.market.instrument,
      check.ast.market.timeframe,
      check.ast.market.contractType,
      JSON.stringify({ actions: check.ast.actions, conditions: check.ast.conditions }),
      JSON.stringify(check.ast.risk),
      b.demoTested !== undefined ? Boolean(b.demoTested) : null,
      Number(req.params.id),
      req.user!.id,
    ]
  );
  if (!row) {
    res.status(404).json({ error: 'Bot definition not found' });
    return;
  }
  res.json({ definition: row });
});

router.delete('/bots/ast/definitions/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('DELETE FROM bot_definitions WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user!.id,
  ]);
  res.json({ ok: true });
});

router.post('/bots/ast/definitions/:id/backtest', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const def = await queryOne<any>('SELECT * FROM bot_definitions WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user!.id,
  ]);
  if (!def) {
    res.status(404).json({ error: 'Bot definition not found' });
    return;
  }

  let ast: any = {};
  try {
    ast = JSON.parse(def.ast_json || '{}');
  } catch {
    ast = {};
  }
  const symbol = String(req.body?.symbol || ast?.market?.instrument || def.symbol || '1HZ100V');
  const gran = Number(req.body?.granularity || ast?.market?.granularity || 300);
  const detailed = await derivWs.fetchCandlesDetailed(symbol, Math.max(60, gran), 240);
  if (detailed.candles.length < 60) {
    res.status(503).json({ error: 'Minimum 60 historical candles required for backtest' });
    return;
  }

  const stakeAct = (ast.actions || []).find((a: any) => a.type === 'SET_STAKE');
  const stake = Number(stakeAct?.params?.stake || 5);
  const condTypes = new Set((ast.conditions || []).map((c: any) => c.type));
  const stratKey = condTypes.has('rsi_condition') || condTypes.has('bollinger_condition')
    ? 'mean_reversion'
    : condTypes.has('sr_condition')
      ? 'breakout'
      : 'trend_following';

  const report = runStrategyBacktest(stratKey as any, detailed.candles, {
    stake,
    spreadCostPct: 0.0006,
  });

  await execute('UPDATE bot_definitions SET demo_tested = TRUE WHERE id = $1 AND user_id = $2', [
    def.id,
    req.user!.id,
  ]);

  res.json({
    ok: true,
    definitionId: def.id,
    demoTested: true,
    source: detailed.source,
    symbol,
    granularity: gran,
    report,
  });
});

router.post('/bots/ast/run', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const check = validateBotAst(b.ast);
    if (!check.valid || !check.ast) {
      res.status(400).json({ error: check.errors.join(' ') });
      return;
    }

    const telemetry = await startBotSession({
      userId: req.user!.id,
      botDefinitionId: b.definitionId ? Number(b.definitionId) : null,
      strategyName: check.ast.name,
      symbol: check.ast.market.instrument,
      contractType: check.ast.market.contractType,
      baseStake: Number(
        check.ast.actions.find((a) => a.type === 'SET_STAKE')?.params?.stake ?? b.baseStake ?? 1
      ),
      barrier: b.barrier !== undefined ? String(b.barrier) : '2',
      duration: Number(
        check.ast.actions.find((a) => a.type === 'SET_DURATION')?.params?.duration ?? b.duration ?? 1
      ),
      durationUnit: String(
        check.ast.actions.find((a) => a.type === 'SET_DURATION')?.params?.durationUnit ?? b.durationUnit ?? 't'
      ),
      multiplier: Number(b.multiplier || 100),
      growthRate: Number(b.growthRate || 0.02),
      martingale: check.ast.risk.martingaleFactor,
      takeProfit: check.ast.risk.takeProfit,
      stopLoss: check.ast.risk.stopLoss,
      maxDailyLoss: check.ast.risk.maxDailyLoss,
      maxStake: check.ast.risk.maxStake,
      cooldownSeconds: check.ast.risk.cooldownSeconds,
      maxConsecutiveLosses: check.ast.risk.maxConsecutiveLosses,
      maxTrades: check.ast.risk.maxSessions,
      executionMode: b.executionMode || 'virtual',
      connectedAccountId: b.connectedAccountId ? Number(b.connectedAccountId) : null,
      accountMode: b.accountMode === 'real' ? 'real' : 'demo',
      executionSpeed: b.executionSpeed === 'normal' ? 'normal' : 'fast',
      ast: check.ast,
    });
    res.json({ telemetry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start AST bot' });
  }
});

export default router;
