import crypto from 'node:crypto';
import { Router } from 'express';
import { query, queryOne, execute, requireDb } from '../db.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { randomId } from '../crypto.ts';

function hashBridgeKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

async function resolveBridgeByKey(req: any): Promise<any | null> {
  const rawKey = String(req.headers['x-bridge-key'] || req.query.bridgeKey || req.body?.bridgeKey || '').trim();
  if (!rawKey) return null;
  const keyHash = hashBridgeKey(rawKey);
  return queryOne<any>('SELECT * FROM mt5_bridge_connections WHERE api_key_hash = $1', [keyHash]);
}

// 1. Authenticated User Bridge Management
router.get('/mt5-bridge/connections', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const connections = await query<any>(
    `SELECT id, user_id, bridge_name, account_login, server_name, broker_name, status, last_heartbeat_at,
            account_balance, account_equity, margin_free, symbols_json, created_at, updated_at
     FROM mt5_bridge_connections WHERE user_id = $1 ORDER BY id DESC`,
    [req.user!.id]
  );
  const orders = await query<any>(
    'SELECT * FROM mt5_bridge_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 60',
    [req.user!.id]
  );
  res.json({ connections, orders });
});

router.post('/mt5-bridge/connections', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const bridgeName = String(b.bridgeName || 'MT5 EA Bridge').trim();
  const accountLogin = String(b.accountLogin || '').trim();
  const serverName = String(b.serverName || '').trim();
  const brokerName = String(b.brokerName || '').trim();
  const apiKey = `td_mt5_${randomId(16)}`;
  const keyHash = hashBridgeKey(apiKey);

  const row = await queryOne<any>(
    `INSERT INTO mt5_bridge_connections (
      user_id, bridge_name, account_login, server_name, broker_name, api_key_hash, encrypted_secret, status, symbols_json
    ) VALUES ($1, $2, $3, $4, $5, $6, '', 'pending', $7)
    RETURNING id, user_id, bridge_name, account_login, server_name, broker_name, status, last_heartbeat_at, account_balance, account_equity, margin_free, symbols_json, created_at`,
    [
      req.user!.id,
      bridgeName,
      accountLogin,
      serverName,
      brokerName,
      keyHash,
      JSON.stringify(b.symbols || ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY']),
    ]
  );

  // One-time plaintext bridge key returned strictly on creation so user can paste it into their MQL5 EA
  res.status(201).json({
    connection: row,
    bridgeApiKey: apiKey,
    setupNote:
      'Copy this Bridge API Key into your TradeDeriv MT5 Expert Advisor (x-bridge-key header). Key cannot be retrieved again after closing.',
  });
});

router.delete('/mt5-bridge/connections/:id', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('DELETE FROM mt5_bridge_connections WHERE id = $1 AND user_id = $2', [
    Number(req.params.id),
    req.user!.id,
  ]);
  res.json({ ok: true });
});

// 2. MQL5 Expert Advisor Bridge Heartbeat, Poll & Real Fill Report Endpoints
router.post('/mt5-bridge/heartbeat', requireDb, async (req, res) => {
  const bridge = await resolveBridgeByKey(req);
  if (!bridge) {
    res.status(401).json({ error: 'Invalid or missing x-bridge-key' });
    return;
  }
  const b = req.body || {};
  const updated = await queryOne<any>(
    `UPDATE mt5_bridge_connections SET
      status = 'connected',
      account_login = COALESCE(NULLIF($1, ''), account_login),
      server_name = COALESCE(NULLIF($2, ''), server_name),
      broker_name = COALESCE(NULLIF($3, ''), broker_name),
      account_balance = COALESCE($4, account_balance),
      account_equity = COALESCE($5, account_equity),
      margin_free = COALESCE($6, margin_free),
      last_heartbeat_at = NOW(),
      updated_at = NOW()
     WHERE id = $7
     RETURNING id, bridge_name, status, account_login, broker_name, last_heartbeat_at, account_balance, account_equity`,
    [
      String(b.accountLogin || ''),
      String(b.serverName || ''),
      String(b.brokerName || ''),
      b.balance !== undefined ? Number(b.balance) : bridge.account_balance,
      b.equity !== undefined ? Number(b.equity) : bridge.account_equity,
      b.marginFree !== undefined ? Number(b.marginFree) : bridge.margin_free,
      bridge.id,
    ]
  );
  res.json({ ok: true, connection: updated });
});

router.get('/mt5-bridge/poll', requireDb, async (req, res) => {
  const bridge = await resolveBridgeByKey(req);
  if (!bridge) {
    res.status(401).json({ error: 'Invalid or missing x-bridge-key' });
    return;
  }
  const queued = await query<any>(
    "SELECT * FROM mt5_bridge_orders WHERE bridge_id = $1 AND status = 'queued' ORDER BY id ASC",
    [bridge.id]
  );
  res.json({ orders: queued });
});

router.post('/mt5-bridge/report', requireDb, async (req, res) => {
  const bridge = await resolveBridgeByKey(req);
  if (!bridge) {
    res.status(401).json({ error: 'Invalid or missing x-bridge-key' });
    return;
  }
  const b = req.body || {};
  const orderId = Number(b.orderId || 0);
  if (!orderId) {
    res.status(400).json({ error: 'orderId is required' });
    return;
  }
  const status = String(b.status || 'filled');
  const updated = await queryOne<any>(
    `UPDATE mt5_bridge_orders SET
      status = $1,
      fill_price = COALESCE($2, fill_price),
      external_ticket = COALESCE(NULLIF($3, ''), external_ticket),
      error_message = COALESCE($4, error_message),
      updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      status,
      b.fillPrice !== undefined ? Number(b.fillPrice) : null,
      String(b.externalTicket || ''),
      String(b.errorMessage || ''),
      orderId,
    ]
  );
  res.json({ ok: true, order: updated });
});

export default router;
