import { Router } from 'express';
import { pool, query, queryOne, execute, requireDb, addNotification } from '../db.ts';
import { randomId, decryptToken } from '../crypto.ts';
import { requireAuth, invalidateAuthUserCache, type AuthRequest } from '../middleware/auth.ts';
import { derivWs, derivRestRequest } from '../deriv-client.ts';

const router = Router();

type ModeKey = 'real' | 'demo';
type WalletBucket = 'main_usd' | 'options' | 'mt5_standard' | 'mt5_gold' | 'exchange_usdt';

function parseJsonObj<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(raw || '{}') || {}) };
  } catch {
    return { ...fallback };
  }
}

function normalizeWalletBucket(label: string): WalletBucket {
  const s = String(label || '').trim().toLowerCase();
  if (s === 'main_usd' || s.includes('usd wallet') || s.includes('us dollar') || s === 'main wallet' || s === 'wallet') {
    return 'main_usd';
  }
  if (s.includes('gold') || s.includes('swap') || s.includes('ctrader')) return 'mt5_gold';
  if (s.includes('standard') || s.includes('mt5') || s.includes('zero') || s.includes('fin') || s.includes('cfd')) {
    return 'mt5_standard';
  }
  if (s.includes('exchange') || s.includes('dxn') || s.includes('usdt')) return 'exchange_usdt';
  if (s.includes('option') || s === 'options' || s.startsWith('cr') || s.startsWith('vr')) return 'options';
  return 'main_usd';
}

function bucketDisplayName(bucket: WalletBucket): string {
  switch (bucket) {
    case 'main_usd':
      return 'USD Wallet';
    case 'options':
      return 'Options';
    case 'mt5_standard':
      return 'MT5 Standard';
    case 'mt5_gold':
      return 'MT5 Gold';
    case 'exchange_usdt':
      return 'Deriv Exchange';
    default:
      return 'USD Wallet';
  }
}

async function getUserAuthToken(userId: number): Promise<string | null> {
  const row = await queryOne<{ encrypted_token: string; token_iv: string; token_auth_tag: string }>(
    'SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE user_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (!row) return null;
  try {
    return decryptToken(row.encrypted_token, row.token_iv, row.token_auth_tag);
  } catch {
    return null;
  }
}

router.get('/cashier/wallets', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const user = await queryOne<any>(
    `SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json,
            exchange_balances_json, real_exchange_balances_json, preferred_currency, role
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  const accounts = isOwner
    ? []
    : await query<any>(
        `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
                last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin, status
         FROM connected_accounts WHERE user_id = $1 AND status = 'active'`,
        [req.user!.id]
      );

  const realWallets = parseJsonObj(user?.real_wallets_json, {
    main_usd: 0,
    options: 0,
    mt5_standard: 0,
    mt5_gold: 0,
    exchange_usdt: 0,
  });
  const demoWallets = parseJsonObj(user?.demo_wallets_json, {
    main_usd: Number(user?.virtual_workspace_balance ?? 0),
    options: 0,
    mt5_standard: 0,
    mt5_gold: 0,
    exchange_usdt: 0,
  });
  const exchangeBalances = parseJsonObj(user?.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
  const realExchangeBalances = parseJsonObj(user?.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });

  const realAccounts = accounts.filter((a) => !a.is_virtual);
  const demoAccounts = accounts.filter((a) => a.is_virtual);

  const realMainUsd = Number(Number(realWallets.main_usd || 0).toFixed(2));
  const realOptionsAccs = realAccounts.filter((a) => a.platform === 'deriv' || !a.platform);
  const realOptionsBal =
    realOptionsAccs.length > 0 && !realOptionsAccs.some((a) => Boolean(a.balance_locked_by_admin))
      ? Number(realOptionsAccs.reduce((acc, a) => acc + Number(a.last_known_balance ?? a.balance ?? 0), 0).toFixed(2))
      : Number(realWallets.options || 0);

  const totalRealUsd = Number(
    (
      realMainUsd +
      realOptionsBal +
      Number(realWallets.mt5_standard || 0) +
      Number(realWallets.mt5_gold || 0) +
      Number(realExchangeBalances.USDT ?? realWallets.exchange_usdt ?? 0)
    ).toFixed(2)
  );

  const demoMainUsd = Number(Number(user?.virtual_workspace_balance ?? demoWallets.main_usd ?? 0).toFixed(2));
  const demoOptionsAccs = demoAccounts.filter((a) => a.platform === 'deriv' || !a.platform);
  const demoOptionsBal =
    demoOptionsAccs.length > 0 && !demoOptionsAccs.some((a) => Boolean(a.balance_locked_by_admin))
      ? Number(demoOptionsAccs.reduce((acc, a) => acc + Number(a.last_known_balance ?? a.balance ?? 0), 0).toFixed(2))
      : Number(demoWallets.options || 0);

  const totalDemoUsd = Number(
    (
      demoMainUsd +
      demoOptionsBal +
      Number(demoWallets.mt5_standard || 0) +
      Number(demoWallets.mt5_gold || 0) +
      Number(exchangeBalances.USDT ?? demoWallets.exchange_usdt ?? 0)
    ).toFixed(2)
  );

  res.json({
    virtualWorkspaceBalance: demoMainUsd,
    realWallets: { ...realWallets, main_usd: realMainUsd, options: realOptionsBal },
    demoWallets: { ...demoWallets, main_usd: demoMainUsd, options: demoOptionsBal },
    totalRealUsd,
    totalDemoUsd,
    exchangeBalances,
    realExchangeBalances,
    accounts,
    demoAccountsCount: demoAccounts.length,
  });
});

const CASHIER_TX_COLS =
  'id, user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, created_at';

function sanitizeCashierTransactionForClient(row: any) {
  const { metadata_json, ...base } = row;
  const rawType = String(base.tx_type || '').toLowerCase();
  const rawMethod = String(base.method || '');
  const rawProvider = String(base.provider || '');
  const rawFrom = String(base.account_from || '');
  const rawTo = String(base.account_to || '');

  const isAdminOrigin =
    rawProvider.toLowerCase() === 'admin_console' ||
    rawMethod.toLowerCase().includes('admin') ||
    rawFrom.toLowerCase().includes('admin treasury') ||
    rawTo.toLowerCase().includes('admin treasury') ||
    rawType === 'credit' ||
    rawType === 'debit' ||
    rawType === 'adjustment';

  if (!isAdminOrigin) {
    return base;
  }

  let meta: any = null;
  if (metadata_json) {
    try {
      meta = typeof metadata_json === 'string' ? JSON.parse(metadata_json) : metadata_json;
    } catch {
      meta = null;
    }
  }

  let signedCents: number | null = null;
  if (
    meta &&
    meta.previousBalance !== undefined &&
    meta.previousBalance !== null &&
    meta.newBalance !== undefined &&
    meta.newBalance !== null &&
    Number.isFinite(Number(meta.previousBalance)) &&
    Number.isFinite(Number(meta.newBalance))
  ) {
    signedCents = Math.round(Number(meta.newBalance) * 100) - Math.round(Number(meta.previousBalance) * 100);
  } else {
    const absCents = Math.round(Math.abs(Number(base.amount || 0)) * 100);
    if (absCents === 0) {
      signedCents = 0;
    } else if (rawType === 'credit' || rawType === 'deposit' || rawFrom.toLowerCase().includes('treasury')) {
      signedCents = absCents;
    } else if (rawType === 'debit' || rawType === 'withdrawal' || rawType === 'withdraw' || rawTo.toLowerCase().includes('treasury')) {
      signedCents = -absCents;
    }
  }

  if (signedCents === null || signedCents === 0) {
    return null;
  }

  const isDeposit = signedCents > 0;
  const cleanFrom = rawFrom.toLowerCase().includes('admin') ? 'External Wallet' : base.account_from;
  const cleanTo = rawTo.toLowerCase().includes('admin') ? 'External Wallet' : base.account_to;

  return {
    ...base,
    tx_type: isDeposit ? 'deposit' : 'withdrawal',
    method: isDeposit ? 'Deposit' : 'Withdraw',
    provider: 'deriv',
    account_from: cleanFrom,
    account_to: cleanTo,
    amount: Number((Math.abs(signedCents) / 100).toFixed(2)),
  };
}

router.get('/cashier/transactions', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const txType = typeof req.query.tx_type === 'string' ? req.query.tx_type.toLowerCase() : '';
  const mode = req.query.accountMode === 'real' ? 'real' : req.query.accountMode === 'demo' ? 'demo' : '';
  const limit = Math.min(150, Math.max(1, Number(req.query.limit || 40)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const clauses = ['user_id = $1'];
  const params: any[] = [req.user!.id];
  if (mode) {
    params.push(mode);
    clauses.push(`COALESCE(account_mode, 'demo') = $${params.length}`);
  }
  const fetchLimit = Math.min(300, limit + offset + 60);
  params.push(fetchLimit);
  const rows = await query(
    `SELECT ${CASHIER_TX_COLS}, metadata_json FROM cashier_transactions WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  const cleaned = rows
    .map(sanitizeCashierTransactionForClient)
    .filter((tx): tx is NonNullable<typeof tx> => Boolean(tx))
    .filter((tx) => !txType || String(tx.tx_type || '').toLowerCase() === txType);

  res.json({ transactions: cleaned.slice(offset, offset + limit) });
});

router.post('/cashier/deposit', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'owner' || req.user!.role === 'admin') {
    res.status(403).json({ error: 'Owner / Admin MIS accounts are not trading wallets.' });
    return;
  }
  const {
    amount = 50,
    currency = 'USD',
    method = 'Mobile Money / M-Pesa',
    provider = 'doughflow',
    accountMode = 'demo',
  } = req.body || {};
  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Deposit amount must be positive' });
    return;
  }

  const token = await getUserAuthToken(req.user!.id);
  let cashierUrl = '';
  if (token && !token.startsWith('ory_at_') && mode === 'real') {
    try {
      const resp = await derivWs.requestWithToken(token, { cashier: 'deposit', provider }, 4500);
      if (typeof resp?.cashier === 'string') cashierUrl = resp.cashier;
    } catch {
      // proceed with local tracking
    }
  }

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const ref = `DEP-${randomId(4).toUpperCase()}`;
  const client = await pool.connect();
  let tx: any;
  let freshUser: any;
  try {
    await client.query('BEGIN');
    const uRes = await client.query<any>(
      'SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json FROM users WHERE id = $1 FOR UPDATE',
      [req.user!.id]
    );
    const user = uRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (mode === 'real') {
      const rw = parseJsonObj(user.real_wallets_json, {
        main_usd: 0,
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
      });
      rw.main_usd = Number((Number(rw.main_usd || 0) + amt).toFixed(2));
      const updated = await client.query<any>(
        'UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [JSON.stringify(rw), req.user!.id]
      );
      freshUser = updated.rows[0];
    } else {
      const nextMain = Number((Number(user.virtual_workspace_balance || 0) + amt).toFixed(2));
      const dw = parseJsonObj(user.demo_wallets_json, {
        main_usd: nextMain,
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
      });
      dw.main_usd = nextMain;
      const updated = await client.query<any>(
        'UPDATE users SET virtual_workspace_balance = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [nextMain, JSON.stringify(dw), req.user!.id]
      );
      freshUser = updated.rows[0];
    }

    const txRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
       VALUES ($1, 'deposit', $2, $3, 'USD Wallet', $4, $5, $6, 'completed', $7, $8)
       RETURNING ${CASHIER_TX_COLS}`,
      [
        req.user!.id,
        method,
        provider,
        amt,
        currency,
        ref,
        mode,
        JSON.stringify({ cashierUrl, accountMode: mode, walletBucket: 'main_usd' }),
      ]
    );
    tx = txRes.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Deposit failed' });
    return;
  } finally {
    client.release();
  }

  invalidateAuthUserCache(req.user!.id);
  derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
    mode,
    amount: amt,
    virtual_workspace_balance: freshUser?.virtual_workspace_balance,
    real_wallets: parseJsonObj(freshUser?.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
    demo_wallets: parseJsonObj(freshUser?.demo_wallets_json, { main_usd: Number(freshUser?.virtual_workspace_balance ?? 0), options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
  });
  await addNotification(
    req.user!.id,
    'Deposit Processed',
    `[${mode.toUpperCase()}] ${amt.toFixed(2)} ${currency} credited to Main USD Wallet via ${method} (Ref: ${ref})`,
    'cashier'
  );
  res.json({ transaction: tx, cashierUrl });
});

router.post('/cashier/withdraw/request-code', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const user = await queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [req.user!.id]);
  const token = await getUserAuthToken(req.user!.id);
  const type = req.body?.type || 'payment_withdraw';

  if (token && user) {
    try {
      if (token.startsWith('ory_at_')) {
        await derivRestRequest('/payment-agents/v1/withdraw/verification_code', token, { method: 'POST' });
      } else {
        await derivWs.requestWithToken(token, { verify_email: user.email, type }, 4500);
      }
    } catch {
      // fallback
    }
  }

  const demoCode = String(Math.floor(100000 + Math.random() * 900000));
  await addNotification(
    req.user!.id,
    'Withdrawal Verification Code',
    `Use verification code ${demoCode} to authorize your withdrawal.`,
    'security'
  );
  res.json({ ok: true, message: 'Verification code dispatched to your email & notifications', hintCode: demoCode });
});

router.post('/cashier/withdraw', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'owner' || req.user!.role === 'admin') {
    res.status(403).json({ error: 'Owner / Admin MIS accounts are not trading wallets.' });
    return;
  }
  const { amount, currency = 'USD', method = 'Bank / E-Wallet', verification_code, accountMode = 'demo' } = req.body || {};
  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Withdrawal amount must be positive' });
    return;
  }

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const token = await getUserAuthToken(req.user!.id);
  let cashierUrl = '';
  if (token && !token.startsWith('ory_at_') && verification_code && mode === 'real') {
    try {
      const resp = await derivWs.requestWithToken(
        token,
        { cashier: 'withdraw', provider: 'doughflow', verification_code },
        4500
      );
      if (typeof resp?.cashier === 'string') cashierUrl = resp.cashier;
    } catch {
      // fallback
    }
  }

  const ref = `WDR-${randomId(4).toUpperCase()}`;
  const client = await pool.connect();
  let tx: any;
  let freshUser: any;
  try {
    await client.query('BEGIN');
    const uRes = await client.query<any>(
      'SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json FROM users WHERE id = $1 FOR UPDATE',
      [req.user!.id]
    );
    const user = uRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (mode === 'real') {
      const rw = parseJsonObj(user.real_wallets_json, {
        main_usd: 0,
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
      });
      const avail = Number(rw.main_usd || 0);
      if (avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient Real Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds from Options, CFDs, or Exchange to USD Wallet first.`,
        });
        return;
      }
      rw.main_usd = Number(Math.max(0, avail - amt).toFixed(2));
      const updated = await client.query<any>(
        'UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [JSON.stringify(rw), req.user!.id]
      );
      freshUser = updated.rows[0];
    } else {
      const avail = Number(user.virtual_workspace_balance || 0);
      if (avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient Demo Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds from Options, CFDs, or Exchange to USD Wallet first.`,
        });
        return;
      }
      const nextMain = Number(Math.max(0, avail - amt).toFixed(2));
      const dw = parseJsonObj(user.demo_wallets_json, {
        main_usd: nextMain,
        options: 0,
        mt5_standard: 0,
        mt5_gold: 0,
        exchange_usdt: 0,
      });
      dw.main_usd = nextMain;
      const updated = await client.query<any>(
        'UPDATE users SET virtual_workspace_balance = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [nextMain, JSON.stringify(dw), req.user!.id]
      );
      freshUser = updated.rows[0];
    }

    const txRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, amount, currency, reference_id, status, account_mode, metadata_json)
       VALUES ($1, 'withdrawal', $2, 'deriv', 'USD Wallet', $3, $4, $5, 'completed', $6, $7)
       RETURNING ${CASHIER_TX_COLS}`,
      [req.user!.id, method, amt, currency, ref, mode, JSON.stringify({ cashierUrl, accountMode: mode, walletBucket: 'main_usd' })]
    );
    tx = txRes.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Withdrawal failed' });
    return;
  } finally {
    client.release();
  }

  invalidateAuthUserCache(req.user!.id);
  derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
    mode,
    amount: -amt,
    virtual_workspace_balance: freshUser?.virtual_workspace_balance,
    real_wallets: parseJsonObj(freshUser?.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
    demo_wallets: parseJsonObj(freshUser?.demo_wallets_json, { main_usd: Number(freshUser?.virtual_workspace_balance ?? 0), options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
  });
  await addNotification(
    req.user!.id,
    'Withdrawal Submitted',
    `[${mode.toUpperCase()}] ${amt.toFixed(2)} ${currency} withdrawn from Main USD Wallet via ${method} (Ref: ${ref})`,
    'cashier'
  );
  res.json({ transaction: tx, cashierUrl });
});

router.post('/cashier/transfer', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'owner' || req.user!.role === 'admin') {
    res.status(403).json({ error: 'Owner / Admin MIS accounts are not trading wallets.' });
    return;
  }
  const {
    account_from = 'USD Wallet',
    account_to = 'MT5 Standard',
    account_from_id = null,
    account_to_id = null,
    amount,
    currency = 'USD',
    accountMode = 'demo',
  } = req.body || {};

  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const fromBucket = normalizeWalletBucket(account_from);
  const toBucket = normalizeWalletBucket(account_to);
  const fromAccId = account_from_id ? Number(account_from_id) : null;
  const toAccId = account_to_id ? Number(account_to_id) : null;
  const isDistinctAccountIdTransfer = Boolean(fromAccId && toAccId && fromAccId !== toAccId);

  if (fromBucket === toBucket && !isDistinctAccountIdTransfer) {
    res.status(400).json({ error: 'Source and destination wallets must be different' });
    return;
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Transfer amount must be positive' });
    return;
  }

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  // Attempt upstream Deriv platform transfer if a Real Deriv token is linked
  if (mode === 'real') {
    const token = await getUserAuthToken(req.user!.id);
    if (token) {
      try {
        if (token.startsWith('ory_at_')) {
          await derivRestRequest('/wallet/v1/transfers/validate', token, {
            method: 'POST',
            body: { account_from, account_to, amount: amt, currency },
          });
          await derivRestRequest('/wallet/v1/transfers/platforms', token, {
            method: 'POST',
            body: { account_from, account_to, amount: amt, currency },
          });
        } else {
          await derivWs.requestWithToken(
            token,
            { transfer_between_accounts: 1, account_from, account_to, amount: amt, currency },
            4500
          );
        }
      } catch {
        // Proceed with atomic DB wallet accounting
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query<any>(
      `SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json,
              exchange_balances_json, real_exchange_balances_json
       FROM users WHERE id = $1 FOR UPDATE`,
      [req.user!.id]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isVirtualMode = mode === 'demo';
    const accRes = await client.query<any>(
      `SELECT id, deriv_login_id, account_type, platform, last_known_balance
       FROM connected_accounts
       WHERE user_id = $1 AND is_virtual = $2 AND status = 'active'
       ORDER BY id ASC`,
      [req.user!.id, isVirtualMode]
    );
    const modeAccounts = accRes.rows;

    const accBucketOf = (a: any): WalletBucket => {
      const p = String(a.platform || '').toLowerCase();
      const t = String(a.account_type || '').toLowerCase();
      if (p.includes('gold') || p.includes('swap') || p === 'ctrader' || t.includes('gold') || t.includes('swap') || t.includes('ctrader')) {
        return 'mt5_gold';
      }
      if (p.includes('mt5') || p.includes('cfd') || t.includes('cfd') || t.includes('standard') || t.includes('zero') || t.includes('fin')) {
        return 'mt5_standard';
      }
      return 'options';
    };

    const findMatchingConnectedAccount = (bucket: WalletBucket, preferredId?: number | null, labelHint?: string) => {
      if (bucket === 'main_usd' || bucket === 'exchange_usdt') return null;
      if (preferredId) {
        const byId = modeAccounts.find((a) => Number(a.id) === preferredId);
        if (byId && accBucketOf(byId) === bucket) return byId;
      }
      if (bucket === 'options') return modeAccounts.find((a) => a.platform === 'deriv' || !a.platform) || null;
      const candidates = modeAccounts.filter((a) => accBucketOf(a) === bucket);
      if (candidates.length === 0) return null;
      const hint = String(labelHint || '').toLowerCase();
      if (hint) {
        const byHint = candidates.find((a) => {
          const t = String(a.account_type || '').toLowerCase();
          return t === hint || t.includes(hint) || hint.includes(t);
        });
        if (byHint) return byHint;
      }
      return (
        candidates.find((a) => String(a.account_type || '').toLowerCase().includes('standard 3')) ||
        candidates.find((a) => Number(a.last_known_balance ?? 0) > 0) ||
        candidates[candidates.length - 1]
      );
    };

    const rw = parseJsonObj(user.real_wallets_json, {
      main_usd: 0,
      options: 0,
      mt5_standard: 0,
      mt5_gold: 0,
      exchange_usdt: 0,
    });
    const dw = parseJsonObj(user.demo_wallets_json, {
      main_usd: Number(user.virtual_workspace_balance ?? 0),
      options: 0,
      mt5_standard: 0,
      mt5_gold: 0,
      exchange_usdt: 0,
    });
    const dex = parseJsonObj(user.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
    const rex = parseJsonObj(user.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });

    const fromMatchedAcc = findMatchingConnectedAccount(fromBucket, fromAccId, account_from);
    const toMatchedAcc = findMatchingConnectedAccount(toBucket, toAccId, account_to);

    const getBucketBalance = (bucket: WalletBucket, matchedAcc?: any): number => {
      if (mode === 'real') {
        if (bucket === 'main_usd') return Number(rw.main_usd ?? 0);
        if (bucket === 'options') {
          return matchedAcc ? Number(matchedAcc.last_known_balance ?? 0) : Number(rw.options ?? 0);
        }
        if (bucket === 'exchange_usdt') return Number(rex.USDT ?? rw.exchange_usdt ?? 0);
        if (matchedAcc && (Number(matchedAcc.last_known_balance ?? 0) > 0 || isDistinctAccountIdTransfer || Number(rw[bucket] ?? 0) === 0)) {
          return Number(matchedAcc.last_known_balance ?? 0);
        }
        return Number(rw[bucket] ?? 0);
      } else {
        if (bucket === 'main_usd') return Number(user.virtual_workspace_balance ?? dw.main_usd ?? 0);
        if (bucket === 'options') {
          return matchedAcc ? Number(matchedAcc.last_known_balance ?? 0) : Number(dw.options ?? 0);
        }
        if (bucket === 'exchange_usdt') return Number(dex.USDT ?? dw.exchange_usdt ?? 0);
        if (matchedAcc && (Number(matchedAcc.last_known_balance ?? 0) > 0 || isDistinctAccountIdTransfer || Number(dw[bucket] ?? 0) === 0)) {
          return Number(matchedAcc.last_known_balance ?? 0);
        }
        return Number(dw[bucket] ?? 0);
      }
    };

    const sourceBal = getBucketBalance(fromBucket, fromMatchedAcc);
    if (sourceBal + 1e-9 < amt) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error: `Insufficient ${mode.toUpperCase()} ${bucketDisplayName(fromBucket)} balance ($${sourceBal.toFixed(2)} available)`,
      });
      return;
    }

    const nextSourceBal = Number(Math.max(0, sourceBal - amt).toFixed(2));
    const nextDestBal = Number((getBucketBalance(toBucket, toMatchedAcc) + amt).toFixed(2));

    const applyBucketUpdate = async (bucket: WalletBucket, nextVal: number, matchedAcc: any) => {
      if (mode === 'real') {
        if (bucket === 'main_usd') {
          rw.main_usd = nextVal;
          return;
        }
        if (matchedAcc) {
          await client.query(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [nextVal, matchedAcc.id]
          );
          matchedAcc.last_known_balance = nextVal;
          const bucketAccs = modeAccounts.filter((a) => accBucketOf(a) === bucket);
          rw[bucket] =
            bucketAccs.length > 0 && (bucket === 'mt5_standard' || bucket === 'mt5_gold')
              ? Number(bucketAccs.reduce((s, a) => s + Number(a.last_known_balance ?? 0), 0).toFixed(2))
              : nextVal;
        } else {
          rw[bucket] = nextVal;
        }
        if (bucket === 'exchange_usdt') {
          rex.USDT = nextVal;
        }
      } else {
        if (bucket === 'main_usd') {
          user.virtual_workspace_balance = nextVal;
          dw.main_usd = nextVal;
          return;
        }
        if (matchedAcc) {
          await client.query(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [nextVal, matchedAcc.id]
          );
          matchedAcc.last_known_balance = nextVal;
          const bucketAccs = modeAccounts.filter((a) => accBucketOf(a) === bucket);
          dw[bucket] =
            bucketAccs.length > 0 && (bucket === 'mt5_standard' || bucket === 'mt5_gold')
              ? Number(bucketAccs.reduce((s, a) => s + Number(a.last_known_balance ?? 0), 0).toFixed(2))
              : nextVal;
        } else {
          dw[bucket] = nextVal;
        }
        if (bucket === 'exchange_usdt') {
          dex.USDT = nextVal;
        }
      }
    };

    await applyBucketUpdate(fromBucket, nextSourceBal, fromMatchedAcc);
    await applyBucketUpdate(toBucket, nextDestBal, toMatchedAcc);

    if (mode === 'real') {
      await client.query(
        'UPDATE users SET real_wallets_json = $1, real_exchange_balances_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(rw), JSON.stringify(rex), req.user!.id]
      );
    } else {
      await client.query(
        'UPDATE users SET virtual_workspace_balance = $1, demo_wallets_json = $2, exchange_balances_json = $3, updated_at = NOW() WHERE id = $4',
        [user.virtual_workspace_balance, JSON.stringify(dw), JSON.stringify(dex), req.user!.id]
      );
    }

    const ref = `TRF-${randomId(4).toUpperCase()}`;
    const txRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode)
       VALUES ($1, 'transfer', 'Internal Platform Transfer', 'deriv', $2, $3, $4, $5, $6, 'completed', $7)
       RETURNING ${CASHIER_TX_COLS}`,
      [req.user!.id, account_from || bucketDisplayName(fromBucket), account_to || bucketDisplayName(toBucket), amt, currency, ref, mode]
    );

    await client.query('COMMIT');
    invalidateAuthUserCache(req.user!.id);

    derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
      mode,
      from: fromBucket,
      to: toBucket,
      real_wallets: rw,
      realWallets: rw,
      demo_wallets: dw,
      demoWallets: dw,
      virtual_workspace_balance: user.virtual_workspace_balance,
    });
    derivWs.emitUserEvent(req.user!.id, 'account_updated', { userId: req.user!.id });

    await addNotification(
      req.user!.id,
      'Transfer Complete',
      `[${mode.toUpperCase()}] Transferred $${amt.toFixed(2)} from ${bucketDisplayName(fromBucket)} to ${bucketDisplayName(toBucket)}.`,
      'cashier'
    );

    res.json({
      transaction: txRes.rows[0],
      accountMode: mode,
      virtualWorkspaceBalance: user.virtual_workspace_balance,
      realWallets: rw,
      demoWallets: dw,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Transfer failed' });
  } finally {
    client.release();
  }
});

router.get('/cashier/payment-agents', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const country = String(req.query.country || 'ke').toLowerCase();
  const currency = String(req.query.currency || 'USD').toUpperCase();
  const token = await getUserAuthToken(req.user!.id);

  if (token && !token.startsWith('ory_at_')) {
    try {
      const resp = await derivWs.requestWithToken(token, { paymentagent_list: country, currency }, 4500);
      if (resp?.paymentagent_list?.list?.length > 0) {
        res.json({ agents: resp.paymentagent_list.list });
        return;
      }
    } catch {
      // fallback
    }
  }

  res.json({
    agents: [
      {
        paymentagent_loginid: 'CR900142',
        name: 'Savannah Pay Express (M-Pesa)',
        summary: 'Instant M-Pesa & Airtel Money deposits/withdrawals in KES & USD.',
        deposit_commission: '0%',
        withdrawal_commission: '1.0%',
        supported_payment_methods: [{ payment_method: 'M-Pesa' }, { payment_method: 'Mobile Money' }],
        min_withdrawal: 5,
        max_withdrawal: 2500,
      },
      {
        paymentagent_loginid: 'CR900288',
        name: 'Nairobi FX Cashier Hub',
        summary: 'Verified local agent supporting Pesalink, M-Pesa Paybill & Equity Bank.',
        deposit_commission: '0%',
        withdrawal_commission: '0.5%',
        supported_payment_methods: [{ payment_method: 'M-Pesa' }, { payment_method: 'Bank Transfer' }],
        min_withdrawal: 10,
        max_withdrawal: 5000,
      },
      {
        paymentagent_loginid: 'CR900410',
        name: 'EastAfrica Digital Agents',
        summary: '24/7 automated Mobile Money & Crypto P2P settlement.',
        deposit_commission: '0%',
        withdrawal_commission: '1.5%',
        supported_payment_methods: [{ payment_method: 'Mobile Money' }, { payment_method: 'USDT TRC20' }],
        min_withdrawal: 5,
        max_withdrawal: 3000,
      },
    ],
  });
});

router.post('/cashier/payment-agents/withdraw', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { paymentagent_loginid, amount, currency = 'USD', verification_code, accountMode = 'demo' } = req.body || {};
  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const amt = Number(amount);
  if (!paymentagent_loginid || Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Agent ID and valid amount are required' });
    return;
  }

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const ref = `PAW-${randomId(4).toUpperCase()}`;
  const client = await pool.connect();
  let tx: any;
  let freshUser: any;
  try {
    await client.query('BEGIN');
    const uRes = await client.query<any>(
      'SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json FROM users WHERE id = $1 FOR UPDATE',
      [req.user!.id]
    );
    const user = uRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (mode === 'real') {
      const rw = parseJsonObj(user.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      const avail = Number(rw.main_usd || 0);
      if (avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient Real Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds from Options, CFDs, or Exchange to USD Wallet first.`,
        });
        return;
      }
      rw.main_usd = Number(Math.max(0, avail - amt).toFixed(2));
      const updated = await client.query<any>(
        'UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [JSON.stringify(rw), req.user!.id]
      );
      freshUser = updated.rows[0];
    } else {
      const avail = Number(user.virtual_workspace_balance || 0);
      if (avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient Demo Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds from Options, CFDs, or Exchange to USD Wallet first.`,
        });
        return;
      }
      const nextMain = Number(Math.max(0, avail - amt).toFixed(2));
      const dw = parseJsonObj(user.demo_wallets_json, { main_usd: nextMain, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      dw.main_usd = nextMain;
      const updated = await client.query<any>(
        'UPDATE users SET virtual_workspace_balance = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [nextMain, JSON.stringify(dw), req.user!.id]
      );
      freshUser = updated.rows[0];
    }

    const txRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode)
       VALUES ($1, 'withdrawal', 'Payment Agent (M-Pesa)', 'paymentagent', 'USD Wallet', $2, $3, $4, $5, 'completed', $6)
       RETURNING ${CASHIER_TX_COLS}`,
      [req.user!.id, paymentagent_loginid, amt, currency, ref, mode]
    );
    tx = txRes.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Payment agent withdrawal failed' });
    return;
  } finally {
    client.release();
  }

  const token = await getUserAuthToken(req.user!.id);
  if (token && mode === 'real') {
    try {
      if (token.startsWith('ory_at_')) {
        await derivRestRequest('/payment-agents/v1/withdraw', token, {
          method: 'POST',
          body: { paymentagent_loginid, amount: amt, currency, verification_code },
        });
      } else {
        await derivWs.requestWithToken(
          token,
          { paymentagent_withdraw: 1, paymentagent_loginid, amount: amt, currency, verification_code },
          4500
        );
      }
    } catch {
      // fallback
    }
  }

  invalidateAuthUserCache(req.user!.id);
  derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
    mode,
    amount: -amt,
    virtual_workspace_balance: freshUser?.virtual_workspace_balance,
    real_wallets: parseJsonObj(freshUser?.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
    demo_wallets: parseJsonObj(freshUser?.demo_wallets_json, { main_usd: Number(freshUser?.virtual_workspace_balance ?? 0), options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
  });
  res.json({ transaction: tx });
});

router.get('/cashier/p2p/adverts', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const token = await getUserAuthToken(req.user!.id);
  if (token && !token.startsWith('ory_at_')) {
    try {
      const resp = await derivWs.requestWithToken(token, { p2p_advert_list: 1 }, 4500);
      if (resp?.p2p_advert_list?.list?.length > 0) {
        res.json({ adverts: resp.p2p_advert_list.list });
        return;
      }
    } catch {
      // fallback
    }
  }

  res.json({
    adverts: [
      { id: 'P2P-101', advertiser_details: { name: 'KenyaTrades_KE', rating: 4.95, completed_orders_count: 1240 }, type: 'buy', rate: 130.2, local_currency: 'KES', min_order_amount_limit: 10, max_order_amount_limit: 1000, payment_method_names: ['M-Pesa', 'Bank'] },
      { id: 'P2P-102', advertiser_details: { name: 'AlphaFX_Desk', rating: 4.91, completed_orders_count: 890 }, type: 'sell', rate: 129.4, local_currency: 'KES', min_order_amount_limit: 15, max_order_amount_limit: 2500, payment_method_names: ['M-Pesa', 'Airtel Money'] },
      { id: 'P2P-103', advertiser_details: { name: 'SwiftSettle_Pro', rating: 4.88, completed_orders_count: 615 }, type: 'buy', rate: 130.5, local_currency: 'KES', min_order_amount_limit: 5, max_order_amount_limit: 500, payment_method_names: ['M-Pesa'] },
    ],
  });
});

router.post('/cashier/p2p/orders', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { advert_id, amount, type = 'buy', accountMode = 'demo' } = req.body || {};
  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const amt = Number(amount);
  const p2pType = String(type).toLowerCase() === 'sell' ? 'sell' : 'buy';
  if (!advert_id || Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Advert ID and positive amount required' });
    return;
  }

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const ref = `P2P-${randomId(4).toUpperCase()}`;
  const client = await pool.connect();
  let order: any;
  let freshUser: any;
  try {
    await client.query('BEGIN');
    const uRes = await client.query<any>(
      'SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json FROM users WHERE id = $1 FOR UPDATE',
      [req.user!.id]
    );
    const user = uRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (mode === 'real') {
      const rw = parseJsonObj(user.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      const avail = Number(rw.main_usd || 0);
      if (p2pType === 'sell' && avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Insufficient Real Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds to USD Wallet first.` });
        return;
      }
      rw.main_usd = Number((p2pType === 'buy' ? avail + amt : Math.max(0, avail - amt)).toFixed(2));
      const updated = await client.query<any>(
        'UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [JSON.stringify(rw), req.user!.id]
      );
      freshUser = updated.rows[0];
    } else {
      const avail = Number(user.virtual_workspace_balance || 0);
      if (p2pType === 'sell' && avail + 1e-9 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Insufficient Demo Main USD Wallet balance ($${avail.toFixed(2)} available). Transfer funds to USD Wallet first.` });
        return;
      }
      const nextMain = Number((p2pType === 'buy' ? avail + amt : Math.max(0, avail - amt)).toFixed(2));
      const dw = parseJsonObj(user.demo_wallets_json, { main_usd: nextMain, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      dw.main_usd = nextMain;
      const updated = await client.query<any>(
        'UPDATE users SET virtual_workspace_balance = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3 RETURNING virtual_workspace_balance, real_wallets_json, demo_wallets_json',
        [nextMain, JSON.stringify(dw), req.user!.id]
      );
      freshUser = updated.rows[0];
    }

    const txRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
       VALUES ($1, 'p2p', $2, 'deriv_p2p', $3, $4, $5, 'USD', $6, 'completed', $7, $8)
       RETURNING ${CASHIER_TX_COLS}`,
      [
        req.user!.id,
        `P2P ${p2pType.toUpperCase()}`,
        p2pType === 'sell' ? 'USD Wallet' : String(advert_id),
        p2pType === 'buy' ? 'USD Wallet' : String(advert_id),
        amt,
        ref,
        mode,
        JSON.stringify({ advert_id, type: p2pType, accountMode: mode, walletBucket: 'main_usd' }),
      ]
    );
    order = txRes.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'P2P order failed' });
    return;
  } finally {
    client.release();
  }

  invalidateAuthUserCache(req.user!.id);
  derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
    mode,
    amount: p2pType === 'buy' ? amt : -amt,
    virtual_workspace_balance: freshUser?.virtual_workspace_balance,
    real_wallets: parseJsonObj(freshUser?.real_wallets_json, { main_usd: 0, options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
    demo_wallets: parseJsonObj(freshUser?.demo_wallets_json, { main_usd: Number(freshUser?.virtual_workspace_balance ?? 0), options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
  });
  res.json({ order });
});

export default router;
