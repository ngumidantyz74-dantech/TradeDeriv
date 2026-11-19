import { Router } from 'express';
import { pool, query, execute, ensureDatabaseSchema, requireDb, addNotification } from '../db.ts';
import { SEEDED_BOT_STRATEGIES } from '../catalog.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { placeUnifiedOrder, closeOrderById, bulkCloseOrders } from '../trade-execution.ts';
import { startBotSession, stopBotSession, closeAllBotOrders, getBotStatus } from '../bot-engine-service.ts';

const router = Router();

router.get('/orders', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const orders = await query('SELECT * FROM virtual_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 200', [
    req.user!.id,
  ]);
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
    const count = Math.min(25, Math.max(1, Number(body.count || 1)));
    const orders: any[] = [];

    for (let i = 0; i < count; i++) {
      const o = await placeUnifiedOrder({
        userId: req.user!.id,
        symbol: String(body.symbol || '1HZ100V'),
        side: String(body.side || 'BUY'),
        contractType: body.contractType,
        lots: body.lots !== undefined ? Number(body.lots) : undefined,
        stake: body.stake !== undefined ? Number(body.stake) : 10,
        multiplier: body.multiplier !== undefined ? Number(body.multiplier) : 100,
        slUsd: body.slUsd !== undefined ? Number(body.slUsd) : null,
        tpUsd: body.tpUsd !== undefined ? Number(body.tpUsd) : null,
        barrier: body.barrier !== undefined ? String(body.barrier) : null,
        duration: body.duration !== undefined ? Number(body.duration) : 5,
        durationUnit: body.durationUnit || 't',
        executionMode: body.executionMode || 'virtual',
        connectedAccountId: body.connectedAccountId ? Number(body.connectedAccountId) : null,
        accountMode: body.accountMode === 'real' ? 'real' : 'demo',
        source: 'bulk',
      });
      orders.push(o);
    }

    await addNotification(
      req.user!.id,
      'Bulk Order Batch Executed',
      `Opened ${orders.length} ${body.side} position(s) on ${body.symbol}.`,
      'trading'
    );
    res.status(201).json({ count: orders.length, orders });
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
  res.json({ ok: true, virtual_workspace_balance: 10000.0 });
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
      takeProfit: Number(b.takeProfit || 25),
      stopLoss: Number(b.stopLoss || 50),
      maxTrades: Number(b.maxTrades || 50),
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

router.post('/bots/stop', requireAuth, (req: AuthRequest, res) => {
  const telemetry = stopBotSession(req.user!.id, 'Stopped by trader');
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
