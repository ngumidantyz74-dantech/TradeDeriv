import { Router, type Response } from 'express';
import {
  query,
  queryOne,
  execute,
  requireDb,
  checkDatabaseHealth,
  getSetting,
  setSetting,
  logAdminAction,
} from '../db.ts';
import { config } from '../config.ts';
import { encryptToken, decryptToken, randomId } from '../crypto.ts';
import { hashPasswordArgon2id, verifyPasswordHash } from '../password-hash.ts';
import {
  ADMIN_SESSION_COOKIE,
  getAdminCookieOptions,
  requireAdmin,
  signUserToken,
  signAdminReauthToken,
  verifyAdminReauthToken,
  type AuthRequest,
} from '../middleware/auth.ts';
import { derivWs, derivRestRequest, getActiveDerivAppId } from '../deriv-client.ts';
import { closeOrderById } from '../trade-execution.ts';

const router = Router();

function checkReauthHeader(req: AuthRequest, res: Response): boolean {
  const token = String(req.headers['x-admin-reauth'] || '').trim();
  if (!verifyAdminReauthToken(token, req.user!.id)) {
    res.status(428).json({
      error: 'Re-authentication required for sensitive admin operation.',
      code: 'REAUTH_REQUIRED',
    });
    return false;
  }
  return true;
}

router.get('/admin/bootstrap-status', requireDb, async (_req, res) => {
  const adminRow = await queryOne("SELECT id, email, full_name FROM users WHERE role IN ('admin', 'owner') LIMIT 1");
  const globalSettings = await getSetting<{ adminPrivateSlug?: string }>('global', {});
  res.json({
    bootstrapped: Boolean(adminRow),
    adminPrivateSlug: globalSettings.adminPrivateSlug || config.adminPrivateSlug,
  });
});

router.post('/admin/bootstrap', requireDb, async (req, res) => {
  const existing = await queryOne("SELECT id FROM users WHERE role IN ('admin', 'owner') LIMIT 1");
  if (existing) {
    res.status(409).json({ error: 'Owner admin account has already been bootstrapped' });
    return;
  }
  const { email, password, full_name = 'Platform Owner' } = req.body || {};
  if (!email || !password || String(password).length < 8) {
    res.status(400).json({ error: 'Email and password (min 8 chars) are required' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const hash = await hashPasswordArgon2id(String(password));

  const owner = await queryOne<any>(
    `INSERT INTO users (email, password_hash, full_name, role, status, email_verified, virtual_workspace_balance, deriv_client_id)
     VALUES ($1, $2, $3, 'owner', 'active', TRUE, 100000.00, $4)
     RETURNING id, email, full_name, role`,
    [cleanEmail, hash, String(full_name), `OWNER-${randomId(3).toUpperCase()}`]
  );

  const token = signUserToken({ id: owner.id, email: owner.email, role: owner.role }, '12h');
  res.cookie(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
  await logAdminAction(owner.id, 'owner_bootstrap', 'users', String(owner.id), { email: cleanEmail });

  res.status(201).json({
    token,
    user: { id: owner.id, email: owner.email, full_name: owner.full_name, role: owner.role },
  });
});

router.post('/admin/login', requireDb, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const ip = String(req.ip || 'unknown');

  // Progressive rate limiting / temporary lockout (5 failures in 15 mins per IP or email)
  const failCountRow = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int as cnt
     FROM admin_login_attempts
     WHERE success = FALSE
       AND created_at > NOW() - INTERVAL '15 minutes'
       AND (email = $1 OR ip_address = $2)`,
    [cleanEmail, ip]
  );
  if ((failCountRow?.cnt || 0) >= 5) {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, 'rate_limited_lockout']
    );
    res.status(429).json({
      error: 'Too many failed admin login attempts. Temporary 15-minute security lockout active.',
    });
    return;
  }

  const user = await queryOne<any>("SELECT * FROM users WHERE email = $1 AND role IN ('admin', 'owner')", [cleanEmail]);
  if (!user) {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, 'unknown_admin_email']
    );
    res.status(401).json({ error: 'Invalid owner credentials' });
    return;
  }

  const { valid, needsRehash } = await verifyPasswordHash(String(password), user.password_hash);
  if (!valid) {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, 'bad_password']
    );
    res.status(401).json({ error: 'Invalid owner credentials' });
    return;
  }

  if (needsRehash) {
    const upgraded = await hashPasswordArgon2id(String(password));
    await execute('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [upgraded, user.id]);
  }

  await execute(
    'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, TRUE, $3)',
    [cleanEmail, ip, 'authenticated']
  );

  const token = signUserToken({ id: user.id, email: user.email, role: user.role }, '12h');
  res.cookie(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
  await logAdminAction(user.id, 'owner_login', 'users', String(user.id));
  res.json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
});

router.post('/admin/logout', (_req, res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.post('/admin/reauth', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { password } = req.body || {};
  if (!password) {
    res.status(400).json({ error: 'Current admin password is required' });
    return;
  }
  const adminUser = await queryOne<any>('SELECT id, password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!adminUser) {
    res.status(404).json({ error: 'Admin user not found' });
    return;
  }
  const { valid } = await verifyPasswordHash(String(password), adminUser.password_hash);
  if (!valid) {
    await logAdminAction(req.user!.id, 'admin_reauth_failed', 'users', String(req.user!.id));
    res.status(401).json({ error: 'Incorrect administrator password' });
    return;
  }
  const reauthToken = signAdminReauthToken(req.user!.id);
  await logAdminAction(req.user!.id, 'admin_reauth_success', 'users', String(req.user!.id));
  res.json({ reauthToken, expiresInSeconds: 600 });
});

router.get('/admin/diagnostics', requireDb, requireAdmin, async (_req, res) => {
  const [database, loginAttempts, errorLogs, securityLogs] = await Promise.all([
    checkDatabaseHealth(),
    query('SELECT id, email, ip_address, success, reason, created_at FROM admin_login_attempts ORDER BY id DESC LIMIT 50'),
    query('SELECT id, source, severity, message, details_json, created_at FROM system_error_logs ORDER BY id DESC LIMIT 50'),
    query('SELECT id, user_id, event_type, ip_address, details_json, created_at FROM security_logs ORDER BY id DESC LIMIT 50'),
  ]);
  res.json({
    database,
    deriv: derivWs.getDiagnostics(),
    environment: {
      nodeEnv: config.nodeEnv,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      brevoConfigured: Boolean(config.brevoApiKey),
      derivAppId: getActiveDerivAppId(),
    },
    loginAttempts,
    errorLogs,
    securityLogs,
  });
});

router.get('/admin/overview', requireDb, requireAdmin, async (_req, res) => {
  const totalUsersRow = await queryOne<{ c: number }>('SELECT COUNT(*)::int as c FROM users');
  const realAccountsRow = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int as c FROM connected_accounts WHERE is_virtual = FALSE AND status = 'active'"
  );
  const demoAccountsRow = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int as c FROM connected_accounts WHERE is_virtual = TRUE AND status = 'active'"
  );
  const orderStats =
    (await queryOne<any>(
      `SELECT
        COUNT(*)::int as "totalOrders",
        COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0)::int as "openOrders",
        COALESCE(SUM(stake), 0) as "grossVolume",
        COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN pnl ELSE 0 END), 0) as "realizedPnl"
       FROM virtual_orders`
    )) || {};

  const cashierStats =
    (await queryOne<any>(
      `SELECT
        COALESCE(SUM(CASE WHEN tx_type = 'deposit' THEN amount ELSE 0 END), 0) as "totalDeposits",
        COALESCE(SUM(CASE WHEN tx_type = 'withdrawal' THEN amount ELSE 0 END), 0) as "totalWithdrawals",
        COALESCE(SUM(CASE WHEN tx_type = 'transfer' THEN amount ELSE 0 END), 0) as "totalTransfers"
       FROM cashier_transactions`
    )) || {};

  const users = await query(
    `SELECT id, email, full_name, phone, country, role, status, email_verified, preferred_currency,
            virtual_workspace_balance, deriv_client_id, created_at
     FROM users ORDER BY id DESC LIMIT 200`
  );
  const connectedAccounts = await query(
    `SELECT ca.id, ca.user_id, ca.deriv_login_id, ca.deriv_account_id, ca.account_type, ca.platform, ca.currency,
            ca.is_virtual, ca.last_known_balance as balance, ca.last_known_balance,
            COALESCE(ca.balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            ca.status, ca.scopes, ca.created_at, ca.updated_at,
            u.email as user_email, u.full_name as user_name
     FROM connected_accounts ca
     JOIN users u ON ca.user_id = u.id
     ORDER BY ca.id DESC LIMIT 200`
  );
  const strategies = await query('SELECT * FROM bot_strategies ORDER BY id DESC');
  const orders = await query(
    `SELECT vo.*, u.email as user_email
     FROM virtual_orders vo
     JOIN users u ON vo.user_id = u.id
     ORDER BY vo.id DESC LIMIT 200`
  );
  const auditLogs = await query('SELECT * FROM administrator_audit_logs ORDER BY id DESC LIMIT 100');
  const emailLogs = await query('SELECT * FROM email_logs ORDER BY id DESC LIMIT 100');
  const branding = await getSetting('branding', {});
  const global = await getSetting('global', {});
  const announcements = await getSetting<{ items?: any[] }>('announcements', { items: [] });

  res.json({
    kpis: {
      totalUsers: totalUsersRow?.c ?? 0,
      realAccounts: realAccountsRow?.c ?? 0,
      demoAccounts: demoAccountsRow?.c ?? 0,
      totalOrders: orderStats.totalOrders || 0,
      openOrders: orderStats.openOrders || 0,
      grossVolume: Number(orderStats.grossVolume || 0),
      realizedPnl: Number(orderStats.realizedPnl || 0),
      totalDeposits: Number(cashierStats.totalDeposits || 0),
      totalWithdrawals: Number(cashierStats.totalWithdrawals || 0),
      totalTransfers: Number(cashierStats.totalTransfers || 0),
      derivDiagnostics: derivWs.getDiagnostics(),
    },
    users,
    connectedAccounts,
    strategies,
    orders,
    auditLogs,
    emailLogs,
    branding,
    global,
    announcements: announcements.items || [],
  });
});

// Settings updates
router.put('/admin/settings/admin-credentials', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const { email, password, full_name } = req.body || {};
  if (email) {
    await execute('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [
      String(email).trim().toLowerCase(),
      req.user!.id,
    ]);
  }
  if (full_name) {
    await execute('UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2', [
      String(full_name),
      req.user!.id,
    ]);
  }
  if (password) {
    const hash = await hashPasswordArgon2id(String(password));
    await execute('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user!.id]);
  }
  await logAdminAction(req.user!.id, 'update_admin_credentials', 'users', String(req.user!.id));
  res.json({ ok: true });
});

router.put('/admin/settings/branding', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const current = await getSetting('branding', {});
  const updated = { ...current, ...(req.body || {}) };
  await setSetting('branding', updated);
  await logAdminAction(req.user!.id, 'update_branding', 'application_settings', 'branding', updated);
  res.json({ branding: updated });
});

router.put('/admin/settings/global', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const current = await getSetting('global', {});
  const updated = { ...current, ...(req.body || {}) };
  await setSetting('global', updated);
  await logAdminAction(req.user!.id, 'update_global_settings', 'application_settings', 'global', updated);
  res.json({ global: updated });
});

// Deriv Commissions & App Markup
router.get('/admin/commissions', requireDb, requireAdmin, async (req, res) => {
  const dateFrom = String(req.query.date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const dateTo = String(req.query.date_to || new Date().toISOString().slice(0, 10));
  const commConfig = await getSetting<any>('commissions', {});
  const ownerAuth = await queryOne<any>(
    "SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE auth_type = 'owner_markup' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1"
  );

  let markupStatistics: any = null;
  let markupDetails: any[] = [];
  let appList: any[] = [];
  let liveError = '';

  if (ownerAuth) {
    try {
      const ownerToken = decryptToken(ownerAuth.encrypted_token, ownerAuth.token_iv, ownerAuth.token_auth_tag);
      const [statsResp, detailsResp, appsResp] = await Promise.all([
        derivWs.requestWithToken(ownerToken, { app_markup_statistics: 1, date_from: dateFrom, date_to: dateTo }, 6000),
        derivWs.requestWithToken(ownerToken, { app_markup_details: 1, date_from: dateFrom, date_to: dateTo, limit: 50, sort: 'DESC' }, 6000),
        derivWs.requestWithToken(ownerToken, { app_list: 1 }, 6000),
      ]);
      markupStatistics = statsResp?.app_markup_statistics || null;
      markupDetails = detailsResp?.app_markup_details?.transactions || [];
      appList = appsResp?.app_list || [];
    } catch (err) {
      liveError = err instanceof Error ? err.message : 'Unable to fetch live Deriv app markup';
    }
  }

  const activeAppId = Number(commConfig.derivAppId || getActiveDerivAppId());
  const activeAppInfo = appList.find((a: any) => Number(a.app_id) === activeAppId) || null;

  const localVol =
    (await queryOne<{ vol: number; cnt: number }>(
      'SELECT COALESCE(SUM(stake), 0) as vol, COUNT(*)::int as cnt FROM virtual_orders'
    )) || { vol: 0, cnt: 0 };

  const estimatedAffiliateUsd = Number(
    ((Number(localVol.vol || 0) * Number(commConfig.markupPercentage || 2.0)) / 100).toFixed(2)
  );

  res.json({
    config: {
      derivAppId: commConfig.derivAppId || getActiveDerivAppId(),
      markupPercentage: Number(commConfig.markupPercentage ?? 2.0),
      affiliateLink: commConfig.affiliateLink || 'https://track.deriv.com/_tradederiv_ib/',
      affiliateTierRate: Number(commConfig.affiliateTierRate ?? 30.0),
      hasOwnerToken: Boolean(ownerAuth),
    },
    diagnostics: {
      domainVerified: Boolean(activeAppInfo?.redirect_uri),
      markupConfigured: activeAppInfo ? Number(activeAppInfo.app_markup_percentage || 0) > 0 : Number(commConfig.markupPercentage || 0) > 0,
      appMarkupPctOnDeriv: activeAppInfo ? Number(activeAppInfo.app_markup_percentage || 0) : null,
      liveError,
    },
    markupStatistics: markupStatistics || {
      total_app_markup_usd: 0,
      total_transactions_count: 0,
      breakdown: [],
    },
    markupDetails,
    appList,
    estimatedAffiliateUsd,
    localVolumeUsd: Number(localVol.vol || 0),
    localTradeCount: Number(localVol.cnt || 0),
    dateFrom,
    dateTo,
  });
});

router.put('/admin/commissions/config', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { derivAppId, markupPercentage, affiliateLink, affiliateTierRate, ownerAdminToken } = req.body || {};
  const current = await getSetting<any>('commissions', {});
  const updated = {
    ...current,
    ...(derivAppId ? { derivAppId: String(derivAppId).trim() } : {}),
    ...(markupPercentage !== undefined ? { markupPercentage: Number(markupPercentage) } : {}),
    ...(affiliateLink !== undefined ? { affiliateLink: String(affiliateLink).trim() } : {}),
    ...(affiliateTierRate !== undefined ? { affiliateTierRate: Number(affiliateTierRate) } : {}),
    hasOwnerToken: Boolean(ownerAdminToken || current.hasOwnerToken),
  };
  await setSetting('commissions', updated);

  if (derivAppId) {
    const g = await getSetting<any>('global', {});
    await setSetting('global', { ...g, derivAppId: String(derivAppId).trim() });
  }

  if (ownerAdminToken && String(ownerAdminToken).trim().length > 5) {
    const enc = encryptToken(String(ownerAdminToken).trim());
    await execute("UPDATE account_authorizations SET revoked_at = NOW() WHERE auth_type = 'owner_markup'");
    await execute(
      `INSERT INTO account_authorizations (user_id, auth_type, encrypted_token, token_iv, token_auth_tag, scopes)
       VALUES ($1, 'owner_markup', $2, $3, $4, 'read admin')`,
      [req.user!.id, enc.encryptedToken, enc.iv, enc.authTag]
    );
  }

  await logAdminAction(req.user!.id, 'update_commission_config', 'application_settings', 'commissions');
  res.json({ config: updated });
});

// Users CRUD
router.post('/admin/users', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { email, password = 'ChangeMe123!', full_name = 'New Trader', role = 'user', virtual_workspace_balance = 10000 } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const hash = await hashPasswordArgon2id(String(password));
  try {
    const user = await queryOne<any>(
      `INSERT INTO users (email, password_hash, full_name, role, status, email_verified, virtual_workspace_balance, deriv_client_id)
       VALUES ($1, $2, $3, $4, 'active', TRUE, $5, $6)
       RETURNING id, email, full_name, phone, country, role, status, email_verified, preferred_currency, virtual_workspace_balance, deriv_client_id, created_at`,
      [cleanEmail, hash, full_name, role, Number(virtual_workspace_balance), `TD${randomId(4).toUpperCase()}`]
    );
    await logAdminAction(req.user!.id, 'create_user', 'users', String(user.id), { email: cleanEmail });
    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
  }
});

router.patch('/admin/users/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { full_name, phone, country, role, status, virtual_workspace_balance } = req.body || {};
  const user = await queryOne<any>(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      phone = COALESCE($2, phone),
      country = COALESCE($3, country),
      role = COALESCE($4, role),
      status = COALESCE($5, status),
      virtual_workspace_balance = COALESCE($6, virtual_workspace_balance),
      updated_at = NOW()
     WHERE id = $7
     RETURNING id, email, full_name, phone, country, role, status, email_verified, preferred_currency, virtual_workspace_balance, deriv_client_id, created_at`,
    [full_name ?? null, phone ?? null, country ?? null, role ?? null, status ?? null, virtual_workspace_balance ?? null, id]
  );
  await logAdminAction(req.user!.id, 'update_user', 'users', String(id));
  res.json({ user });
});

router.patch('/admin/users/:id/role', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const role = String(req.body?.role || 'user');
  await execute('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
  await logAdminAction(req.user!.id, 'update_user_role', 'users', String(id), { role });
  res.json({ ok: true });
});

router.patch('/admin/users/:id/status', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || 'active');
  if (status === 'suspended' || status === 'closed') {
    if (!checkReauthHeader(req, res)) return;
  }
  await execute('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  await logAdminAction(req.user!.id, 'update_user_status', 'users', String(id), { status });
  res.json({ ok: true });
});

router.patch('/admin/users/:id/virtual-balance', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const id = Number(req.params.id);
  const balance = Number(req.body?.balance);
  if (Number.isNaN(balance) || balance < 0) {
    res.status(400).json({ error: 'Valid non-negative balance is required' });
    return;
  }

  const user = await queryOne<any>(
    `UPDATE users
     SET virtual_workspace_balance = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, full_name, role, status, virtual_workspace_balance`,
    [balance, id]
  );
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Also lock & update any virtual/demo connected_accounts owned by this user so repeat logins preserve Admin edits
  await execute(
    `UPDATE connected_accounts
     SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
     WHERE user_id = $2 AND is_virtual = TRUE`,
    [balance, id]
  );

  derivWs.emitUserEvent(id, 'balance_updated', { virtual_workspace_balance: balance });
  await logAdminAction(req.user!.id, 'update_virtual_balance', 'users', String(id), { balance });
  res.json({ ok: true, user });
});

router.delete('/admin/users/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete currently signed-in owner account' });
    return;
  }
  await execute('DELETE FROM users WHERE id = $1', [id]);
  await logAdminAction(req.user!.id, 'delete_user', 'users', String(id));
  res.json({ ok: true });
});

// Connected Deriv Accounts CRUD
router.post('/admin/connected-accounts/connect', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { userId, token, accountType = 'Deriv Account' } = req.body || {};
  if (!userId || !token) {
    res.status(400).json({ error: 'userId and Deriv token are required' });
    return;
  }
  try {
    const resp = await derivWs.requestWithToken(String(token), { balance: 1 }, 5500);
    const loginid = String(resp?.balance?.loginid || `CR${randomId(3).toUpperCase()}`);
    const currency = String(resp?.balance?.currency || 'USD');
    const balance = Number(resp?.balance?.balance || 0);
    const isVirtual = loginid.toUpperCase().startsWith('VR');

    const account = await queryOne<any>(
      `INSERT INTO connected_accounts (
        user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
        balance, last_known_balance, balance_locked_by_admin, status, updated_at
      ) VALUES ($1, $2, $2, $3, 'deriv', $4, $5, $6, $6, FALSE, 'active', NOW())
      ON CONFLICT (user_id, deriv_login_id) DO UPDATE SET
        deriv_account_id = EXCLUDED.deriv_login_id,
        account_type = EXCLUDED.account_type,
        currency = EXCLUDED.currency,
        is_virtual = EXCLUDED.is_virtual,
        balance = CASE
          WHEN COALESCE(connected_accounts.balance_locked_by_admin, FALSE) = TRUE THEN connected_accounts.last_known_balance
          ELSE EXCLUDED.last_known_balance
        END,
        last_known_balance = CASE
          WHEN COALESCE(connected_accounts.balance_locked_by_admin, FALSE) = TRUE THEN connected_accounts.last_known_balance
          ELSE EXCLUDED.last_known_balance
        END,
        status = 'active',
        updated_at = NOW()
      RETURNING *`,
      [Number(userId), loginid, accountType, currency, isVirtual, balance]
    );

    const enc = encryptToken(String(token));
    await execute('UPDATE account_authorizations SET revoked_at = NOW() WHERE connected_account_id = $1 AND revoked_at IS NULL', [
      account.id,
    ]);
    await execute(
      `INSERT INTO account_authorizations (connected_account_id, user_id, auth_type, encrypted_token, token_iv, token_auth_tag, scopes)
       VALUES ($1, $2, 'pat', $3, $4, $5, 'read trade')`,
      [account.id, Number(userId), enc.encryptedToken, enc.iv, enc.authTag]
    );

    await logAdminAction(req.user!.id, 'admin_connect_deriv', 'connected_accounts', String(account.id));
    res.status(201).json({ account });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Deriv token verification failed' });
  }
});

router.patch('/admin/connected-accounts/:id/balance', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const id = Number(req.params.id);
  const balance = Number(req.body?.balance);
  const currency = req.body?.currency ? String(req.body.currency).trim().toUpperCase() : null;

  if (Number.isNaN(balance) || balance < 0) {
    res.status(400).json({ error: 'Valid non-negative balance is required' });
    return;
  }

  const account = await queryOne<any>(
    `UPDATE connected_accounts
     SET balance = $1,
         last_known_balance = $1,
         currency = COALESCE($2, currency),
         balance_locked_by_admin = TRUE,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
               last_known_balance as balance, last_known_balance, balance_locked_by_admin, status, scopes, updated_at`,
    [balance, currency, id]
  );

  if (!account) {
    res.status(404).json({ error: 'Connected account not found' });
    return;
  }

  // Keep user's virtual_workspace_balance in sync if this is a virtual/demo account
  if (account.is_virtual) {
    await execute('UPDATE users SET virtual_workspace_balance = $1, updated_at = NOW() WHERE id = $2', [
      balance,
      account.user_id,
    ]);
    derivWs.emitUserEvent(account.user_id, 'balance_updated', { virtual_workspace_balance: balance });
  }

  derivWs.emitUserEvent(account.user_id, 'account_updated', { accountId: account.id, balance });
  await logAdminAction(req.user!.id, 'adjust_account_balance', 'connected_accounts', String(id), {
    balance,
    currency: account.currency,
    lockedByAdmin: true,
  });

  res.json({ ok: true, account });
});

router.post('/admin/connected-accounts/:id/sync', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  // Explicit Admin "Sync Live" unlocks the DB balance override and fetches fresh live balance from Deriv
  await execute('UPDATE connected_accounts SET balance_locked_by_admin = FALSE, updated_at = NOW() WHERE id = $1', [id]);

  const currentAcc = await queryOne<any>('SELECT * FROM connected_accounts WHERE id = $1', [id]);
  if (!currentAcc) {
    res.status(404).json({ error: 'Connected account not found' });
    return;
  }

  const auth = await queryOne<any>(
    'SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE connected_account_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',
    [id]
  );

  if (auth) {
    try {
      const raw = decryptToken(auth.encrypted_token, auth.token_iv, auth.token_auth_tag);
      if (raw.startsWith('ory_at_')) {
        const listResp = await derivRestRequest<any>('/trading/v1/options/accounts', raw);
        const list = listResp.data || listResp.accounts || [];
        const found = list.find((item: any) => String(item.account_id) === String(currentAcc.deriv_login_id));
        if (found && found.balance !== undefined) {
          const b = Number(found.balance);
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, balance_locked_by_admin = FALSE, updated_at = NOW() WHERE id = $2',
            [b, id]
          );
        }
      } else {
        const resp = await derivWs.requestWithToken(raw, { balance: 1 }, 4500);
        if (resp?.balance?.balance !== undefined) {
          const b = Number(resp.balance.balance);
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, balance_locked_by_admin = FALSE, updated_at = NOW() WHERE id = $2',
            [b, id]
          );
        }
      }
    } catch {
      // keep existing if live Deriv fetch fails
    }
  }

  const account = await queryOne<any>(
    `SELECT id, user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
            last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            status, scopes, updated_at
     FROM connected_accounts WHERE id = $1`,
    [id]
  );

  await logAdminAction(req.user!.id, 'sync_connected_account', 'connected_accounts', String(id), {
    liveBalance: account?.last_known_balance,
  });
  res.json({ ok: true, account });
});

router.post('/admin/connected-accounts/:id/disconnect', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute("UPDATE connected_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1", [id]);
  await logAdminAction(req.user!.id, 'disconnect_account', 'connected_accounts', String(id));
  res.json({ ok: true });
});

router.post('/admin/connected-accounts/:id/revoke', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute("UPDATE connected_accounts SET status = 'revoked', updated_at = NOW() WHERE id = $1", [id]);
  await execute('UPDATE account_authorizations SET revoked_at = NOW() WHERE connected_account_id = $1', [id]);
  await logAdminAction(req.user!.id, 'revoke_account', 'connected_accounts', String(id));
  res.json({ ok: true });
});

router.delete('/admin/connected-accounts/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute('DELETE FROM connected_accounts WHERE id = $1', [id]);
  await logAdminAction(req.user!.id, 'delete_connected_account', 'connected_accounts', String(id));
  res.json({ ok: true });
});

// Bot Strategies CRUD
router.post('/admin/strategies', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body || {};
  if (!b.name) {
    res.status(400).json({ error: 'Strategy name required' });
    return;
  }
  const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const strategy = await queryOne<any>(
    `INSERT INTO bot_strategies (name, slug, category, symbol, contract_type, description, win_rate_est, rating, is_premium, is_active, config_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
     RETURNING *`,
    [
      b.name,
      slug,
      b.category || 'Free Bots',
      b.symbol || '1HZ100V',
      b.contract_type || 'DIGITOVER',
      b.description || 'Custom admin strategy',
      Number(b.win_rate_est || 75),
      Number(b.rating || 4.8),
      Boolean(b.is_premium),
      typeof b.config === 'string'
        ? b.config
        : JSON.stringify(b.config || { stake: 1, barrier: '2', duration: 1, martingale: 2 }),
    ]
  );
  await logAdminAction(req.user!.id, 'create_strategy', 'bot_strategies', String(strategy.id));
  res.status(201).json({ strategy });
});

router.patch('/admin/strategies/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const strategy = await queryOne<any>(
    `UPDATE bot_strategies SET
      name = COALESCE($1, name),
      category = COALESCE($2, category),
      symbol = COALESCE($3, symbol),
      contract_type = COALESCE($4, contract_type),
      description = COALESCE($5, description),
      win_rate_est = COALESCE($6, win_rate_est),
      rating = COALESCE($7, rating),
      is_premium = COALESCE($8, is_premium),
      is_active = COALESCE($9, is_active),
      config_json = COALESCE($10, config_json),
      updated_at = NOW()
     WHERE id = $11
     RETURNING *`,
    [
      b.name ?? null,
      b.category ?? null,
      b.symbol ?? null,
      b.contract_type ?? null,
      b.description ?? null,
      b.win_rate_est ?? null,
      b.rating ?? null,
      b.is_premium !== undefined ? Boolean(b.is_premium) : null,
      b.is_active !== undefined ? Boolean(b.is_active) : null,
      b.config ? (typeof b.config === 'string' ? b.config : JSON.stringify(b.config)) : null,
      id,
    ]
  );
  await logAdminAction(req.user!.id, 'update_strategy', 'bot_strategies', String(id));
  res.json({ strategy });
});

router.delete('/admin/strategies/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute('DELETE FROM bot_strategies WHERE id = $1', [id]);
  await logAdminAction(req.user!.id, 'delete_strategy', 'bot_strategies', String(id));
  res.json({ ok: true });
});

// Orders Management
router.post('/admin/orders/:id/close', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const order = await closeOrderById(Number(req.params.id), undefined, true);
    await logAdminAction(req.user!.id, 'force_close_order', 'virtual_orders', String(req.params.id));
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close order' });
  }
});

router.delete('/admin/orders/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute('DELETE FROM virtual_orders WHERE id = $1', [id]);
  await logAdminAction(req.user!.id, 'delete_order', 'virtual_orders', String(id));
  res.json({ ok: true });
});

// Cashier Logs
router.get('/admin/cashier-logs', requireDb, requireAdmin, async (req, res) => {
  const txType = typeof req.query.tx_type === 'string' ? req.query.tx_type : '';
  const rows = txType
    ? await query(
        `SELECT ct.*, u.email as user_email FROM cashier_transactions ct
         JOIN users u ON ct.user_id = u.id
         WHERE ct.tx_type = $1 ORDER BY ct.id DESC LIMIT 200`,
        [txType]
      )
    : await query(
        `SELECT ct.*, u.email as user_email FROM cashier_transactions ct
         JOIN users u ON ct.user_id = u.id
         ORDER BY ct.id DESC LIMIT 200`
      );
  res.json({ transactions: rows });
});

// Announcements CRUD
router.post('/admin/announcements', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { title, message, severity = 'info' } = req.body || {};
  if (!title || !message) {
    res.status(400).json({ error: 'Title and message are required' });
    return;
  }
  const current = await getSetting<{ items: any[] }>('announcements', { items: [] });
  const item = { id: `ann-${randomId(4)}`, title, message, severity, createdAt: new Date().toISOString() };
  const updated = { items: [item, ...(current.items || [])].slice(0, 20) };
  await setSetting('announcements', updated);
  await logAdminAction(req.user!.id, 'create_announcement', 'application_settings', item.id);
  res.status(201).json({ announcement: item, announcements: updated.items });
});

router.delete('/admin/announcements/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const current = await getSetting<{ items: any[] }>('announcements', { items: [] });
  const updated = { items: (current.items || []).filter((a) => a.id !== req.params.id) };
  await setSetting('announcements', updated);
  await logAdminAction(req.user!.id, 'delete_announcement', 'application_settings', String(req.params.id));
  res.json({ announcements: updated.items });
});

export default router;
