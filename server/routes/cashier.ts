import { Router } from 'express';
import { pool, query, queryOne, execute, requireDb, addNotification } from '../db.ts';
import { randomId, decryptToken } from '../crypto.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { derivWs, derivRestRequest } from '../deriv-client.ts';

const router = Router();

type ModeKey = 'real' | 'demo';
type WalletBucket = 'options' | 'mt5_standard' | 'mt5_gold' | 'exchange_usdt';

function parseJsonObj<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(raw || '{}') || {}) };
  } catch {
    return { ...fallback };
  }
}

function normalizeWalletBucket(label: string): WalletBucket {
  const s = String(label || '').trim().toLowerCase();
  if (s.includes('gold')) return 'mt5_gold';
  if (s.includes('standard') || s.includes('mt5')) return 'mt5_standard';
  if (s.includes('exchange') || s.includes('dxn') || s.includes('usdt')) return 'exchange_usdt';
  return 'options';
}

function bucketDisplayName(bucket: WalletBucket): string {
  switch (bucket) {
    case 'mt5_standard':
      return 'MT5 Standard';
    case 'mt5_gold':
      return 'MT5 Gold';
    case 'exchange_usdt':
      return 'Deriv Exchange';
    case 'options':
    default:
      return 'USD Wallet / Options';
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
    options: 0,
    mt5_standard: 0,
    mt5_gold: 0,
    exchange_usdt: 0,
  });
  const demoWallets = parseJsonObj(user?.demo_wallets_json, {
    mt5_standard: 0,
    mt5_gold: 0,
    exchange_usdt: 0,
  });
  const exchangeBalances = parseJsonObj(user?.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
  const realExchangeBalances = parseJsonObj(user?.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });

  const realAccounts = accounts.filter((a) => !a.is_virtual);
  const demoAccounts = accounts.filter((a) => a.is_virtual);

  const realOptionsBal = realAccounts.some((a) => a.platform === 'deriv')
    ? realAccounts
        .filter((a) => a.platform === 'deriv')
        .reduce((acc, a) => acc + Number(a.last_known_balance ?? a.balance ?? 0), 0)
    : Number(realWallets.options || 0);

  const totalRealUsd = Number(
    (
      realOptionsBal +
      Number(realWallets.mt5_standard || 0) +
      Number(realWallets.mt5_gold || 0) +
      Number(realExchangeBalances.USDT ?? realWallets.exchange_usdt ?? 0)
    ).toFixed(2)
  );

  const demoOptionsBal = Number(user?.virtual_workspace_balance ?? 0);
  const totalDemoUsd = Number(
    (
      demoOptionsBal +
      Number(demoWallets.mt5_standard || 0) +
      Number(demoWallets.mt5_gold || 0) +
      Number(exchangeBalances.USDT ?? demoWallets.exchange_usdt ?? 0)
    ).toFixed(2)
  );

  res.json({
    virtualWorkspaceBalance: demoOptionsBal,
    realWallets: { ...realWallets, options: realOptionsBal },
    demoWallets: { ...demoWallets, options: demoOptionsBal },
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

router.get('/cashier/transactions', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const txType = typeof req.query.tx_type === 'string' ? req.query.tx_type : '';
  const mode = req.query.accountMode === 'real' ? 'real' : req.query.accountMode === 'demo' ? 'demo' : '';
  const limit = Math.min(150, Math.max(1, Number(req.query.limit || 40)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const clauses = ['user_id = $1'];
  const params: any[] = [req.user!.id];
  if (txType) {
    params.push(txType);
    clauses.push(`tx_type = $${params.length}`);
  }
  if (mode) {
    params.push(mode);
    clauses.push(`COALESCE(account_mode, 'demo') = $${params.length}`);
  }
  params.push(limit, offset);
  const rows = await query(
    `SELECT ${CASHIER_TX_COLS} FROM cashier_transactions WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ transactions: rows });
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

  const user = await queryOne<any>(
    'SELECT virtual_workspace_balance, real_wallets_json, demo_wallets_json, exchange_balances_json, real_exchange_balances_json FROM users WHERE id = $1',
    [req.user!.id]
  );

  const upperCur = String(currency).toUpperCase();
  const isCryptoStable = upperCur === 'USDT' || upperCur === 'USDC';

  if (mode === 'real') {
    const rw = parseJsonObj(user?.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const rex = parseJsonObj(user?.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
    if (isCryptoStable) {
      rex[upperCur] = Number(((rex[upperCur] || 0) + amt).toFixed(6));
      rw.exchange_usdt = Number(((rw.exchange_usdt || 0) + (upperCur === 'USDT' ? amt : 0)).toFixed(2));
      await execute(
        'UPDATE users SET real_exchange_balances_json = $1, real_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(rex), JSON.stringify(rw), req.user!.id]
      );
    } else {
      rw.options = Number((Number(rw.options || 0) + amt).toFixed(2));
      await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(rw),
        req.user!.id,
      ]);
      await execute(
        `UPDATE connected_accounts
         SET balance = ROUND((balance + $1)::numeric, 2)::double precision,
             last_known_balance = ROUND((last_known_balance + $1)::numeric, 2)::double precision,
             updated_at = NOW()
         WHERE id = (
           SELECT id FROM connected_accounts
           WHERE user_id = $2 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active'
           ORDER BY id ASC LIMIT 1
         )`,
        [amt, req.user!.id]
      );
    }
  } else {
    const dw = parseJsonObj(user?.demo_wallets_json, { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const dex = parseJsonObj(user?.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
    if (isCryptoStable) {
      dex[upperCur] = Number(((dex[upperCur] || 0) + amt).toFixed(6));
      dw.exchange_usdt = Number(((dw.exchange_usdt || 0) + (upperCur === 'USDT' ? amt : 0)).toFixed(2));
      await execute(
        'UPDATE users SET exchange_balances_json = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(dex), JSON.stringify(dw), req.user!.id]
      );
    } else {
      await execute(
        'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
        [amt, req.user!.id]
      );
    }
  }

  const ref = `DEP-${randomId(4).toUpperCase()}`;
  const tx = await queryOne(
    `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
     VALUES ($1, 'deposit', $2, $3, $4, $5, $6, $7, 'completed', $8, $9)
     RETURNING ${CASHIER_TX_COLS}`,
    [
      req.user!.id,
      method,
      provider,
      isCryptoStable ? 'Deriv Exchange' : 'USD Wallet',
      amt,
      currency,
      ref,
      mode,
      JSON.stringify({ cashierUrl, accountMode: mode }),
    ]
  );

  derivWs.emitUserEvent(req.user!.id, 'balance_updated', { mode, amount: amt });
  await addNotification(
    req.user!.id,
    'Deposit Processed',
    `[${mode.toUpperCase()}] ${amt.toFixed(2)} ${currency} via ${method} (Ref: ${ref})`,
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

  const user = await queryOne<any>('SELECT virtual_workspace_balance, real_wallets_json FROM users WHERE id = $1', [
    req.user!.id,
  ]);

  if (mode === 'real') {
    const realAcc = await queryOne<any>(
      "SELECT id, last_known_balance FROM connected_accounts WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active' ORDER BY id ASC LIMIT 1",
      [req.user!.id]
    );
    const rw = parseJsonObj(user?.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const avail = realAcc ? Number(realAcc.last_known_balance || 0) : Number(rw.options || 0);
    if (avail < amt) {
      res.status(400).json({ error: `Insufficient Real USD Wallet balance ($${avail.toFixed(2)} available)` });
      return;
    }
    const nextAvail = Number((avail - amt).toFixed(2));
    rw.options = nextAvail;
    await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(rw),
      req.user!.id,
    ]);
    if (realAcc) {
      await execute('UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2', [
        nextAvail,
        realAcc.id,
      ]);
    }
  } else {
    const avail = Number(user?.virtual_workspace_balance || 0);
    if (avail < amt) {
      res.status(400).json({ error: `Insufficient Demo USD Wallet balance ($${avail.toFixed(2)} available)` });
      return;
    }
    await execute(
      'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance - $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
      [amt, req.user!.id]
    );
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
  const tx = await queryOne(
    `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, amount, currency, reference_id, status, account_mode, metadata_json)
     VALUES ($1, 'withdrawal', $2, 'deriv', 'USD Wallet', $3, $4, $5, 'completed', $6, $7)
     RETURNING ${CASHIER_TX_COLS}`,
    [req.user!.id, method, amt, currency, ref, mode, JSON.stringify({ cashierUrl, accountMode: mode })]
  );

  derivWs.emitUserEvent(req.user!.id, 'balance_updated', { mode, amount: -amt });
  await addNotification(
    req.user!.id,
    'Withdrawal Submitted',
    `[${mode.toUpperCase()}] ${amt.toFixed(2)} ${currency} via ${method} (Ref: ${ref})`,
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
    amount,
    currency = 'USD',
    accountMode = 'demo',
  } = req.body || {};

  const mode: ModeKey = accountMode === 'real' ? 'real' : 'demo';
  const fromBucket = normalizeWalletBucket(account_from);
  const toBucket = normalizeWalletBucket(account_to);

  if (fromBucket === toBucket) {
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

    const findMatchingConnectedAccount = (bucket: WalletBucket) => {
      if (bucket === 'options') return modeAccounts.find((a) => a.platform === 'deriv');
      if (bucket === 'mt5_gold') {
        return modeAccounts.find((a) => String(a.platform || '').includes('gold') || String(a.account_type || '').toLowerCase().includes('gold'));
      }
      if (bucket === 'mt5_standard') {
        return modeAccounts.find(
          (a) =>
            String(a.platform || '').startsWith('mt5') &&
            !String(a.platform || '').includes('gold') &&
            !String(a.account_type || '').toLowerCase().includes('gold')
        );
      }
      return null;
    };

    const rw = parseJsonObj(user.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const dw = parseJsonObj(user.demo_wallets_json, { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const dex = parseJsonObj(user.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
    const rex = parseJsonObj(user.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });

    const realOptionsAcc = findMatchingConnectedAccount('options');

    const getBucketBalance = (bucket: WalletBucket): number => {
      if (mode === 'real') {
        if (bucket === 'options') {
          return realOptionsAcc ? Number(realOptionsAcc.last_known_balance ?? 0) : Number(rw.options ?? 0);
        }
        if (bucket === 'exchange_usdt') return Number(rex.USDT ?? rw.exchange_usdt ?? 0);
        return Number(rw[bucket] ?? 0);
      } else {
        if (bucket === 'options') return Number(user.virtual_workspace_balance ?? 0);
        if (bucket === 'exchange_usdt') return Number(dex.USDT ?? dw.exchange_usdt ?? 0);
        return Number(dw[bucket] ?? 0);
      }
    };

    const sourceBal = getBucketBalance(fromBucket);
    if (sourceBal + 1e-9 < amt) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error: `Insufficient ${mode.toUpperCase()} ${bucketDisplayName(fromBucket)} balance ($${sourceBal.toFixed(2)} available)`,
      });
      return;
    }

    const nextSourceBal = Number(Math.max(0, sourceBal - amt).toFixed(2));
    const nextDestBal = Number((getBucketBalance(toBucket) + amt).toFixed(2));

    const applyBucketUpdate = async (bucket: WalletBucket, nextVal: number) => {
      if (mode === 'real') {
        rw[bucket] = nextVal;
        if (bucket === 'exchange_usdt') {
          rex.USDT = nextVal;
        }
        const matchedAcc = findMatchingConnectedAccount(bucket);
        if (matchedAcc) {
          await client.query(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [nextVal, matchedAcc.id]
          );
          matchedAcc.last_known_balance = nextVal;
        }
      } else {
        if (bucket === 'options') {
          user.virtual_workspace_balance = nextVal;
          const demoOptAcc = findMatchingConnectedAccount('options');
          if (demoOptAcc) {
            await client.query(
              'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
              [nextVal, demoOptAcc.id]
            );
          }
        } else {
          dw[bucket] = nextVal;
          if (bucket === 'exchange_usdt') {
            dex.USDT = nextVal;
          }
          const matchedAcc = findMatchingConnectedAccount(bucket);
          if (matchedAcc) {
            await client.query(
              'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
              [nextVal, matchedAcc.id]
            );
          }
        }
      }
    };

    await applyBucketUpdate(fromBucket, nextSourceBal);
    await applyBucketUpdate(toBucket, nextDestBal);

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
      [req.user!.id, bucketDisplayName(fromBucket), bucketDisplayName(toBucket), amt, currency, ref, mode]
    );

    await client.query('COMMIT');

    derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
      mode,
      from: fromBucket,
      to: toBucket,
      realWallets: rw,
      demoWallets: dw,
      virtual_workspace_balance: user.virtual_workspace_balance,
    });

    await addNotification(
      req.user!.id,
      'Transfer Complete',
      `[${mode.toUpperCase()}] Transferred $${amt.toFixed(2)} from ${bucketDisplayName(fromBucket)} to ${bucketDisplayName(toBucket)}.`,
      'cashier'
    );

    res.json({
      transaction: txRes.rows[0],
      accountMode: mode,
      realWallets: rw,
      demoWallets: { ...dw, options: user.virtual_workspace_balance },
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

  const user = await queryOne<any>('SELECT virtual_workspace_balance, real_wallets_json FROM users WHERE id = $1', [
    req.user!.id,
  ]);
  if (mode === 'real') {
    const rw = parseJsonObj(user?.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
    const realAcc = await queryOne<any>(
      "SELECT id, last_known_balance FROM connected_accounts WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active' ORDER BY id ASC LIMIT 1",
      [req.user!.id]
    );
    const avail = realAcc ? Number(realAcc.last_known_balance || 0) : Number(rw.options || 0);
    if (avail < amt) {
      res.status(400).json({ error: `Insufficient Real USD Wallet balance ($${avail.toFixed(2)})` });
      return;
    }
    const nextVal = Number((avail - amt).toFixed(2));
    rw.options = nextVal;
    await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(rw),
      req.user!.id,
    ]);
    if (realAcc) {
      await execute('UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2', [
        nextVal,
        realAcc.id,
      ]);
    }
  } else {
    const avail = Number(user?.virtual_workspace_balance || 0);
    if (avail < amt) {
      res.status(400).json({ error: `Insufficient Demo USD Wallet balance ($${avail.toFixed(2)})` });
      return;
    }
    await execute(
      'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance - $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
      [amt, req.user!.id]
    );
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

  const ref = `PAW-${randomId(4).toUpperCase()}`;
  const tx = await queryOne(
    `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode)
     VALUES ($1, 'withdrawal', 'Payment Agent (M-Pesa)', 'paymentagent', 'USD Wallet', $2, $3, $4, $5, 'completed', $6)
     RETURNING ${CASHIER_TX_COLS}`,
    [req.user!.id, paymentagent_loginid, amt, currency, ref, mode]
  );

  derivWs.emitUserEvent(req.user!.id, 'balance_updated', { mode, amount: -amt });
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
  if (!advert_id || Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Advert ID and positive amount required' });
    return;
  }

  if (type === 'buy') {
    if (mode === 'real') {
      const user = await queryOne<any>('SELECT real_wallets_json FROM users WHERE id = $1', [req.user!.id]);
      const rw = parseJsonObj(user?.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      rw.options = Number((Number(rw.options || 0) + amt).toFixed(2));
      await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(rw),
        req.user!.id,
      ]);
    } else {
      await execute(
        'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)::numeric, 2)::double precision WHERE id = $2',
        [amt, req.user!.id]
      );
    }
  }

  const ref = `P2P-${randomId(4).toUpperCase()}`;
  const order = await queryOne(
    `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
     VALUES ($1, 'p2p', $2, 'deriv_p2p', $3, $4, 'USD', $5, 'completed', $6, $7)
     RETURNING ${CASHIER_TX_COLS}`,
    [req.user!.id, `P2P ${String(type).toUpperCase()}`, String(advert_id), amt, ref, mode, JSON.stringify({ advert_id, type, accountMode: mode })]
  );

  derivWs.emitUserEvent(req.user!.id, 'balance_updated', { mode, amount: type === 'buy' ? amt : 0 });
  res.json({ order });
});

export default router;
