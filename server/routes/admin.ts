import { Router, type Response } from 'express';
import {
  query,
  queryOne,
  execute,
  withTransaction,
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
  invalidateAuthUserCache,
  type AuthRequest,
} from '../middleware/auth.ts';
import { derivWs, derivRestRequest, getActiveDerivAppId } from '../deriv-client.ts';
import { isVirtualDerivAccount } from './deriv.ts';
import { closeOrderById } from '../trade-execution.ts';
import { invalidateInstrumentsCache } from './market.ts';
import { invalidateBotStrategiesCache } from './orders.ts';

const router = Router();

const ADMIN_ORDER_COLS = `vo.id, vo.user_id, vo.symbol, vo.side, vo.contract_type, vo.lots, vo.stake, vo.multiplier, vo.entry_price, vo.current_price, vo.exit_price, vo.pnl, vo.sl_usd, vo.tp_usd, vo.sl_price, vo.tp_price, vo.barrier, vo.duration, vo.duration_unit, vo.execution_mode, vo.connected_account_id, vo.account_mode, vo.source, vo.strategy_key, vo.timeframe, vo.notes, vo.deriv_contract_id, vo.status, vo.opened_at, vo.closed_at`;
const BOT_STRATEGY_COLS = `id, name, slug, category, symbol, contract_type, description, win_rate_est, rating, is_premium, is_active, config_json, updated_at, created_at`;
const ACCOUNT_COLS = `id, user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual, last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin, status, scopes, created_at, updated_at`;

const toCents = (val: unknown): number => {
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));
const reqIp = (req: AuthRequest): string =>
  String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();

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
  res.cookie(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions(req));
  await logAdminAction(owner.id, 'owner_bootstrap', 'users', String(owner.id), { email: cleanEmail }, {
    previousValue: 'none',
    newValue: cleanEmail,
    ipAddress: reqIp(req),
    actionResult: 'success',
  });

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
  const ip = reqIp(req);

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

  const user = await queryOne<any>(
    "SELECT id, email, full_name, role, status, password_hash FROM users WHERE email = $1 AND role IN ('admin', 'owner')",
    [cleanEmail]
  );
  if (!user) {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, 'unknown_admin_email']
    );
    res.status(401).json({ error: 'Invalid administrator credentials' });
    return;
  }
  if (user.status === 'suspended' || user.status === 'closed') {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, `account_${user.status}`]
    );
    res.status(403).json({ error: `Administrator account is ${user.status}` });
    return;
  }

  const { valid, needsRehash } = await verifyPasswordHash(String(password), user.password_hash);
  if (!valid) {
    await execute(
      'INSERT INTO admin_login_attempts (email, ip_address, success, reason) VALUES ($1, $2, FALSE, $3)',
      [cleanEmail, ip, 'bad_password']
    );
    res.status(401).json({ error: 'Invalid administrator credentials' });
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
  res.cookie(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions(req));
  await logAdminAction(user.id, 'owner_login', 'users', String(user.id), { email: cleanEmail }, {
    ipAddress: ip,
    actionResult: 'success',
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
});

router.get('/admin/me', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const adminUser = await queryOne<{ id: number; email: string; full_name: string; role: string }>(
    'SELECT id, email, full_name, role FROM users WHERE id = $1',
    [req.user!.id]
  );
  if (!adminUser) {
    res.status(401).json({ error: 'Admin session expired' });
    return;
  }
  res.json({ user: adminUser });
});

router.post('/admin/logout', (req, res) => {
  const opts = getAdminCookieOptions(req);
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    path: '/',
    sameSite: opts.sameSite,
    secure: opts.secure,
    ...(opts.secure ? { partitioned: true } : {}),
  });
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
    await logAdminAction(req.user!.id, 'admin_reauth_failed', 'users', String(req.user!.id), {}, {
      ipAddress: reqIp(req),
      actionResult: 'denied',
    });
    res.status(401).json({ error: 'Incorrect administrator password' });
    return;
  }
  const reauthToken = signAdminReauthToken(req.user!.id);
  await logAdminAction(req.user!.id, 'admin_reauth_success', 'users', String(req.user!.id), {}, {
    ipAddress: reqIp(req),
    actionResult: 'success',
  });
  res.json({ reauthToken, expiresInSeconds: 600 });
});

router.get('/admin/admins', requireDb, requireAdmin, async (_req, res) => {
  const admins = await query(
    `SELECT id, email, full_name, role, status, created_at
     FROM users
     WHERE role IN ('owner', 'admin')
     ORDER BY id ASC`
  );
  res.json({ admins });
});

router.post('/admin/admins', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'owner') {
    res.status(403).json({ error: 'Only the primary Owner can provision additional administrator accounts.' });
    return;
  }
  if (!checkReauthHeader(req, res)) return;
  const { email, password, full_name = 'Operations Admin' } = req.body || {};
  if (!email || !password || String(password).length < 8) {
    res.status(400).json({ error: 'Email and strong password (min 8 chars) are required' });
    return;
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const exists = await queryOne('SELECT id FROM users WHERE email = $1', [cleanEmail]);
  if (exists) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }
  const hash = await hashPasswordArgon2id(String(password));
  const created = await queryOne<any>(
    `INSERT INTO users (email, password_hash, full_name, role, status, email_verified, virtual_workspace_balance, deriv_client_id)
     VALUES ($1, $2, $3, 'admin', 'active', TRUE, 0, $4)
     RETURNING id, email, full_name, role, status, created_at`,
    [cleanEmail, hash, String(full_name), `ADM-${randomId(3).toUpperCase()}`]
  );
  await logAdminAction(req.user!.id, 'create_admin', 'users', String(created.id), { email: cleanEmail }, {
    previousValue: 'none',
    newValue: `${cleanEmail} (admin)`,
    ipAddress: reqIp(req),
    actionResult: 'success',
  });
  res.status(201).json({ admin: created });
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
  const totalUsersRow = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int as c FROM users WHERE role NOT IN ('owner', 'admin')"
  );
  const realAccountsRow = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM connected_accounts ca
     JOIN users u ON ca.user_id = u.id
     WHERE ca.is_virtual = FALSE AND ca.status = 'active' AND u.role NOT IN ('owner', 'admin')`
  );
  const demoAccountsRow = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM connected_accounts ca
     JOIN users u ON ca.user_id = u.id
     WHERE ca.is_virtual = TRUE AND ca.status = 'active' AND u.role NOT IN ('owner', 'admin')`
  );
  const orderStats =
    (await queryOne<any>(
      `SELECT
        COUNT(*)::int as "totalOrders",
        COALESCE(SUM(CASE WHEN vo.status = 'OPEN' THEN 1 ELSE 0 END), 0)::int as "openOrders",
        COALESCE(SUM(vo.stake), 0) as "grossVolume",
        COALESCE(SUM(CASE WHEN vo.status = 'CLOSED' THEN vo.pnl ELSE 0 END), 0) as "realizedPnl"
       FROM virtual_orders vo
       JOIN users u ON vo.user_id = u.id
       WHERE u.role NOT IN ('owner', 'admin')`
    )) || {};

  const cashierStats =
    (await queryOne<any>(
      `SELECT
        COALESCE(SUM(CASE WHEN ct.tx_type = 'deposit' THEN ct.amount ELSE 0 END), 0) as "totalDeposits",
        COALESCE(SUM(CASE WHEN ct.tx_type = 'withdrawal' THEN ct.amount ELSE 0 END), 0) as "totalWithdrawals",
        COALESCE(SUM(CASE WHEN ct.tx_type = 'transfer' THEN ct.amount ELSE 0 END), 0) as "totalTransfers"
       FROM cashier_transactions ct
       JOIN users u ON ct.user_id = u.id
       WHERE u.role NOT IN ('owner', 'admin')`
    )) || {};

  const users = await query(
    `SELECT id, email, full_name, phone, country, role, status,
            COALESCE(trading_suspended, FALSE) as trading_suspended, locked_until,
            email_verified, preferred_currency,
            virtual_workspace_balance, demo_wallets_json, real_wallets_json,
            exchange_balances_json, real_exchange_balances_json, deriv_nickname, deriv_client_id,
            COALESCE(last_login_at, updated_at, created_at) as last_login_at, created_at
     FROM users
     WHERE role NOT IN ('owner', 'admin')
     ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC, id DESC LIMIT 100`
  );
  const connectedAccounts = await query(
    `SELECT ca.id, ca.user_id, ca.deriv_login_id, ca.deriv_account_id, ca.account_type, ca.platform, ca.currency,
            ca.is_virtual, ca.last_known_balance as balance, ca.last_known_balance,
            COALESCE(ca.balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            ca.status, ca.scopes, ca.created_at, ca.updated_at,
            u.email as user_email, u.full_name as user_name, u.deriv_client_id,
            COALESCE(u.last_login_at, ca.updated_at, ca.created_at) as last_login_at
     FROM connected_accounts ca
     JOIN users u ON ca.user_id = u.id
     WHERE u.role NOT IN ('owner', 'admin')
     ORDER BY COALESCE(u.last_login_at, ca.updated_at, ca.created_at) DESC, ca.id DESC LIMIT 120`
  );
  const strategies = await query(`SELECT ${BOT_STRATEGY_COLS} FROM bot_strategies ORDER BY id DESC LIMIT 100`);
  const orders = await query(
    `SELECT ${ADMIN_ORDER_COLS}, u.email as user_email
     FROM virtual_orders vo
     JOIN users u ON vo.user_id = u.id
     WHERE u.role NOT IN ('owner', 'admin')
     ORDER BY vo.id DESC LIMIT 60`
  );
  const rawInstruments = await query(
    `SELECT m.id, m.symbol, m.display_name, m.category, m.market, m.submarket, m.pip_size, m.spread,
            m.min_stake, m.max_stake, m.is_active, c.price, c.change_pct
     FROM market_instruments m
     LEFT JOIN market_data_cache c ON m.symbol = c.symbol
     ORDER BY m.category, m.display_name
     LIMIT 250`
  );
  const latestTicks = derivWs.getAllLatestTicks();
  const instruments = rawInstruments.map((inst: any) => ({
    ...inst,
    price: latestTicks[inst.symbol]?.quote ?? inst.price ?? 0,
    change_pct: derivWs.getChangePct(inst.symbol),
  }));
  const auditLogs = await query(
    `SELECT l.id, l.admin_user_id, l.action, l.target_type, l.target_id, l.previous_value, l.new_value,
            l.ip_address, l.action_result, l.details_json, l.created_at,
            a.email as admin_email, a.full_name as admin_name
     FROM administrator_audit_logs l
     LEFT JOIN users a ON l.admin_user_id = a.id
     ORDER BY l.id DESC LIMIT 50`
  );
  const emailLogs = await query(
    'SELECT id, recipient_email, subject, template, status, error_message, created_at FROM email_logs ORDER BY id DESC LIMIT 40'
  );
  const branding = await getSetting('branding', {});
  const global = await getSetting('global', {});
  const commissions = await getSetting('commissions', {});
  const tradingEngine = await getSetting('trading_engine', {
    botWinRatePct: 76,
    analyserWinRatePct: 82,
    accuWinRatePct: 78,
    manualOptionsWinRatePct: 68,
    siteSettlementForLockedReal: true,
    liveMicroTickEnabled: true,
  });
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
    instruments,
    auditLogs,
    emailLogs,
    branding,
    global,
    commissions,
    tradingEngine,
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
  const payload = { ...(req.body || {}) };
  if (payload.derivAppId !== undefined) {
    const cleanId = String(payload.derivAppId).trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(cleanId)) {
      res.status(400).json({ error: 'Deriv App ID must be 2-64 alphanumeric characters (e.g. 34ZNHHLmmHMEpuNcPbnzg or numeric ID).' });
      return;
    }
    payload.derivAppId = cleanId;
  }
  const current = await getSetting('global', {});
  const updated = { ...current, ...payload };
  await setSetting('global', updated);
  await logAdminAction(req.user!.id, 'update_global_settings', 'application_settings', 'global', updated);
  res.json({ global: updated });
});

router.get('/admin/settings/trading-engine', requireDb, requireAdmin, async (_req, res) => {
  const tradingEngine = await getSetting('trading_engine', {
    botWinRatePct: 76,
    analyserWinRatePct: 82,
    accuWinRatePct: 78,
    manualOptionsWinRatePct: 68,
    siteSettlementForLockedReal: true,
    liveMicroTickEnabled: true,
  });
  res.json({ tradingEngine });
});

router.put('/admin/settings/trading-engine', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const b = req.body || {};
  const current = await getSetting<any>('trading_engine', {});
  const clamp = (v: unknown, def: number) => Math.max(5, Math.min(96, Number(v ?? def)));
  const updated = {
    botWinRatePct: clamp(b.botWinRatePct, current.botWinRatePct ?? 76),
    analyserWinRatePct: clamp(b.analyserWinRatePct, current.analyserWinRatePct ?? 82),
    accuWinRatePct: clamp(b.accuWinRatePct, current.accuWinRatePct ?? 78),
    manualOptionsWinRatePct: clamp(b.manualOptionsWinRatePct, current.manualOptionsWinRatePct ?? 68),
    siteSettlementForLockedReal:
      b.siteSettlementForLockedReal !== undefined
        ? Boolean(b.siteSettlementForLockedReal)
        : current.siteSettlementForLockedReal ?? true,
    liveMicroTickEnabled:
      b.liveMicroTickEnabled !== undefined ? Boolean(b.liveMicroTickEnabled) : current.liveMicroTickEnabled ?? true,
  };
  await setSetting('trading_engine', updated);
  await logAdminAction(req.user!.id, 'update_trading_engine', 'application_settings', 'trading_engine', updated);
  res.json({ tradingEngine: updated });
});

// Deriv Commissions & App Markup — powered by real Deriv Partners REST GET /applications/v1/markup-statistics
router.get('/admin/commissions', requireDb, requireAdmin, async (req, res) => {
  const dateFrom = String(req.query.date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const dateTo = String(req.query.date_to || new Date().toISOString().slice(0, 10));
  const commConfig = await getSetting<any>('commissions', {});
  const activeAppIdStr = /^[A-Za-z0-9_-]{2,64}$/.test(String(commConfig.derivAppId || '').trim())
    ? String(commConfig.derivAppId).trim()
    : getActiveDerivAppId();

  const ownerAuth = await queryOne<any>(
    "SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE auth_type = 'owner_markup' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1"
  );

  let markupStatistics: any = null;
  let markupDetails: any[] = [];
  let appList: any[] = [];
  let liveError = '';
  let restVerified = false;
  let restAppMeta: any = null;

  if (ownerAuth) {
    try {
      const ownerToken = decryptToken(ownerAuth.encrypted_token, ownerAuth.token_iv, ownerAuth.token_auth_tag);
      const restResp = await derivRestRequest<{ data?: any }>(
        `/applications/v1/markup-statistics?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`,
        ownerToken,
        {
          method: 'GET',
          headers: {
            'Deriv-App-ID': activeAppIdStr,
          },
        }
      );

      const data = restResp?.data || restResp || {};
      restVerified = true;
      markupStatistics = {
        total_app_markup_usd: Number(data.total_app_markup_usd ?? data.total_markup_usd ?? data.app_markup_usd ?? 0),
        total_volume_usd: Number(data.total_volume_usd ?? data.volume_usd ?? 0),
        total_payout_usd: Number(data.total_payout_usd ?? 0),
        total_transactions_count: Number(
          data.total_contract_count ?? data.total_transactions_count ?? data.total_trades ?? 0
        ),
        total_client_count: Number(data.total_client_count ?? data.active_clients ?? 0),
        breakdown: Array.isArray(data.breakdown)
          ? data.breakdown
          : Array.isArray(data.applications)
            ? data.applications
            : [],
      };

      if (Array.isArray(data.applications)) {
        appList = data.applications;
        restAppMeta =
          data.applications.find((a: any) => String(a.app_id || a.id || '') === activeAppIdStr) ||
          data.applications[0] ||
          null;
      }

      if (Array.isArray(data.transactions)) {
        markupDetails = data.transactions;
      }
    } catch (restErr) {
      const restMsg = restErr instanceof Error ? restErr.message : 'Unable to fetch Deriv Partners REST markup statistics';
      // Optional legacy WS fallback only when app_id is purely numeric
      if (/^\d+$/.test(activeAppIdStr)) {
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
          restVerified = Boolean(markupStatistics);
        } catch (wsErr) {
          liveError = `${restMsg} | Legacy WS: ${wsErr instanceof Error ? wsErr.message : 'failed'}`;
        }
      } else {
        liveError = restMsg;
      }
    }
  } else {
    liveError = 'Owner Personal Access Token / OAuth token with application_read scope is not saved yet.';
  }

  const activeAppInfo =
    restAppMeta ||
    appList.find((a: any) => String(a.app_id || a.id || '') === activeAppIdStr) ||
    null;

  const localVol =
    (await queryOne<{ vol: number; cnt: number }>(
      "SELECT COALESCE(SUM(stake), 0) as vol, COUNT(*)::int as cnt FROM virtual_orders WHERE COALESCE(execution_mode, 'virtual') = 'deriv'"
    )) || { vol: 0, cnt: 0 };

  res.json({
    config: {
      derivAppId: activeAppIdStr,
      markupPercentage: Number(commConfig.markupPercentage ?? 3.0),
      affiliateLink:
        commConfig.affiliateLink && commConfig.affiliateLink !== 'https://track.deriv.com/_tradederiv_ib/'
          ? commConfig.affiliateLink
          : 'https://t.deriv.link?t=FSDRTFVTSKPA',
      affiliateCode: commConfig.affiliateCode || 'VNMH2VHBRTFN',
      affiliateToken: commConfig.affiliateToken || 'FSDRTFVTSKPA',
      affiliateTierRate: Number(commConfig.affiliateTierRate ?? 30.0),
      hasOwnerToken: Boolean(ownerAuth),
    },
    diagnostics: {
      ownerTokenConfigured: Boolean(ownerAuth),
      restVerified,
      domainVerified: Boolean(restVerified || activeAppInfo?.redirect_uri),
      markupConfigured: activeAppInfo
        ? Number(activeAppInfo.app_markup_percentage ?? activeAppInfo.markup_percentage ?? 0) > 0
        : Number(commConfig.markupPercentage || 0) > 0,
      appMarkupPctOnDeriv: activeAppInfo
        ? Number(activeAppInfo.app_markup_percentage ?? activeAppInfo.markup_percentage ?? 0)
        : null,
      liveError,
    },
    markupStatistics: markupStatistics || {
      total_app_markup_usd: 0,
      total_volume_usd: 0,
      total_transactions_count: 0,
      total_client_count: 0,
      breakdown: [],
    },
    markupDetails,
    appList,
    localDerivVolumeUsd: Number(localVol.vol || 0),
    localDerivTradeCount: Number(localVol.cnt || 0),
    dateFrom,
    dateTo,
  });
});

router.put('/admin/commissions/config', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const { derivAppId, markupPercentage, affiliateLink, affiliateCode, affiliateToken, affiliateTierRate, ownerAdminToken } =
    req.body || {};
  if (derivAppId !== undefined && String(derivAppId).trim() !== '') {
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(String(derivAppId).trim())) {
      res.status(400).json({
        error: 'Deriv App ID must be 2-64 alphanumeric characters (e.g. 34ZNHHLmmHMEpuNcPbnzg or numeric ID), never a token with spaces.',
      });
      return;
    }
  }
  const current = await getSetting<any>('commissions', {});
  const updated = {
    ...current,
    ...(derivAppId ? { derivAppId: String(derivAppId).trim() } : {}),
    ...(markupPercentage !== undefined ? { markupPercentage: Number(markupPercentage) } : {}),
    ...(affiliateLink !== undefined ? { affiliateLink: String(affiliateLink).trim() } : {}),
    ...(affiliateCode !== undefined ? { affiliateCode: String(affiliateCode).trim() } : {}),
    ...(affiliateToken !== undefined ? { affiliateToken: String(affiliateToken).trim() } : {}),
    ...(affiliateTierRate !== undefined ? { affiliateTierRate: Number(affiliateTierRate) } : {}),
    hasOwnerToken: Boolean((ownerAdminToken && String(ownerAdminToken).trim().length > 5) || current.hasOwnerToken),
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
       VALUES ($1, 'owner_markup', $2, $3, $4, 'application_read read admin')`,
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

router.get('/admin/users/:id/activity', requireDb, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [user, accounts, orders, transactions] = await Promise.all([
    queryOne(
      `SELECT id, email, full_name, phone, country, role, status, COALESCE(trading_suspended, FALSE) as trading_suspended,
              locked_until, virtual_workspace_balance, demo_wallets_json, real_wallets_json, deriv_client_id, created_at
       FROM users WHERE id = $1`,
      [id]
    ),
    query(`SELECT ${ACCOUNT_COLS} FROM connected_accounts WHERE user_id = $1 ORDER BY id DESC LIMIT 30`, [id]),
    query(
      `SELECT ${ADMIN_ORDER_COLS} FROM virtual_orders vo WHERE vo.user_id = $1 ORDER BY vo.id DESC LIMIT 40`,
      [id]
    ),
    query(
      `SELECT id, user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, created_at
       FROM cashier_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 40`,
      [id]
    ),
  ]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user, accounts, orders, transactions });
});

router.post('/admin/balances/adjust', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const {
    userId,
    accountMode = 'demo',
    walletBucket = 'options',
    operation = 'credit',
    amount,
    reason = 'Administrative balance adjustment',
  } = req.body || {};

  const targetUserId = Number(userId);
  const amountCents = toCents(amount);
  if (!targetUserId || Number.isNaN(Number(amount)) || amountCents < 0 || (operation !== 'set' && amountCents <= 0)) {
    res.status(400).json({ error: 'Valid userId and positive adjustment amount are required' });
    return;
  }

  const mode = accountMode === 'real' ? 'real' : 'demo';
  const bucket = ['options', 'mt5_standard', 'mt5_gold', 'exchange_usdt'].includes(String(walletBucket))
    ? String(walletBucket)
    : 'options';
  const op = ['credit', 'debit', 'set'].includes(String(operation)) ? String(operation) : 'credit';

  try {
    const result = await withTransaction(async (client) => {
      const userRes = await client.query<any>(
        `SELECT id, email, virtual_workspace_balance, demo_wallets_json, real_wallets_json
         FROM users WHERE id = $1 FOR UPDATE`,
        [targetUserId]
      );
      const u = userRes.rows[0];
      if (!u) throw new Error('Trader account not found');

      const parseWallets = (raw: string | null | undefined, def: Record<string, number>) => {
        try {
          return { ...def, ...(JSON.parse(raw || '{}') || {}) };
        } catch {
          return { ...def };
        }
      };

      const dw = parseWallets(u.demo_wallets_json, { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
      const rw = parseWallets(u.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });

      let currentCents = 0;
      if (mode === 'demo') {
        currentCents = bucket === 'options' ? toCents(u.virtual_workspace_balance) : toCents(dw[bucket]);
      } else {
        currentCents = toCents(rw[bucket]);
      }

      let nextCents = currentCents;
      if (op === 'credit') {
        nextCents = currentCents + amountCents;
      } else if (op === 'debit') {
        if (currentCents < amountCents) {
          throw new Error(`Insufficient balance ($${fromCents(currentCents).toFixed(2)}) for debit of $${fromCents(amountCents).toFixed(2)}`);
        }
        nextCents = currentCents - amountCents;
      } else {
        nextCents = amountCents;
      }

      const deltaCents = nextCents - currentCents;
      const prevBal = fromCents(currentCents);
      const nextBal = fromCents(nextCents);

      if (mode === 'demo') {
        if (bucket === 'options') {
          await client.query(
            'UPDATE users SET virtual_workspace_balance = $1, updated_at = NOW() WHERE id = $2',
            [nextBal, targetUserId]
          );
          await client.query(
            `UPDATE connected_accounts
             SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
             WHERE user_id = $2 AND is_virtual = TRUE AND platform = 'deriv'`,
            [nextBal, targetUserId]
          );
        } else {
          dw[bucket] = nextBal;
          await client.query(
            'UPDATE users SET demo_wallets_json = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(dw), targetUserId]
          );
        }
      } else {
        rw[bucket] = nextBal;
        await client.query(
          'UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(rw), targetUserId]
        );
        if (bucket === 'options') {
          await client.query(
            `UPDATE connected_accounts
             SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
             WHERE user_id = $2 AND is_virtual = FALSE AND platform = 'deriv'`,
            [nextBal, targetUserId]
          );
        }
      }

      const txType = deltaCents > 0 ? 'credit' : deltaCents < 0 ? 'debit' : 'adjustment';
      const txAmount = fromCents(Math.abs(deltaCents));
      const refId = `ADM-${randomId(4).toUpperCase()}`;
      const bucketLabel = `${mode.toUpperCase()} ${bucket.replace('_', ' ')}`;

      await client.query(
        `INSERT INTO cashier_transactions
          (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
         VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, 'USD', $6, 'completed', $7, $8)`,
        [
          targetUserId,
          txType,
          deltaCents >= 0 ? 'Admin Treasury' : bucketLabel,
          deltaCents >= 0 ? bucketLabel : 'Admin Treasury',
          txAmount,
          refId,
          mode,
          JSON.stringify({
            adminUserId: req.user!.id,
            operation: op,
            walletBucket: bucket,
            previousBalance: prevBal,
            newBalance: nextBal,
            reason: String(reason || '').slice(0, 240),
          }),
        ]
      );

      await client.query(
        `INSERT INTO administrator_audit_logs
          (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
         VALUES ($1, $2, 'users', $3, $4, $5, $6, 'success', $7)`,
        [
          req.user!.id,
          `balance_${op}`,
          String(targetUserId),
          `${bucketLabel}: $${prevBal.toFixed(2)}`,
          `${bucketLabel}: $${nextBal.toFixed(2)}`,
          reqIp(req),
          JSON.stringify({ operation: op, mode, bucket, prevBal, nextBal, referenceId: refId, reason }),
        ]
      );

      return { targetUserId, mode, bucket, prevBal, nextBal, referenceId: refId, dw, rw };
    });

    if (result.mode === 'demo') {
      derivWs.emitUserEvent(targetUserId, 'balance_updated', {
        virtual_workspace_balance: result.bucket === 'options' ? result.nextBal : undefined,
        demo_wallets: result.dw,
      });
    } else {
      derivWs.emitUserEvent(targetUserId, 'balance_updated', {
        real_wallets: result.rw,
        realWallets: result.rw,
      });
    }

    res.json({ ok: true, adjustment: result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Balance adjustment failed' });
  }
});

router.patch('/admin/users/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const {
    email,
    full_name,
    deriv_nickname,
    deriv_client_id,
    preferred_currency,
    phone,
    country,
    role,
    status,
    trading_suspended,
    password,
    virtual_workspace_balance,
    demo_wallets,
    real_wallets,
    exchange_balances,
    real_exchange_balances,
  } = req.body || {};

  const touchesSensitive =
    password !== undefined ||
    virtual_workspace_balance !== undefined ||
    demo_wallets !== undefined ||
    real_wallets !== undefined ||
    exchange_balances !== undefined ||
    real_exchange_balances !== undefined ||
    status === 'suspended' ||
    status === 'closed' ||
    trading_suspended !== undefined;

  if (touchesSensitive && !checkReauthHeader(req, res)) return;

  let passwordHash: string | null = null;
  if (password && String(password).trim().length >= 6) {
    passwordHash = await hashPasswordArgon2id(String(password).trim());
  }

  const nextEmail = email ? String(email).trim().toLowerCase() : null;
  const nextCurrency = preferred_currency
    ? String(preferred_currency).trim().toUpperCase().slice(0, 8)
    : null;
  const nextDemoBal =
    virtual_workspace_balance !== undefined ? fromCents(Math.max(0, toCents(virtual_workspace_balance))) : null;

  try {
    const user = await withTransaction(async (client) => {
      const existingRes = await client.query<any>(
        'SELECT id, status, virtual_workspace_balance, real_wallets_json FROM users WHERE id = $1 FOR UPDATE',
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) throw new Error('User not found');

      const updatedRes = await client.query<any>(
        `UPDATE users SET
          email = COALESCE($1, email),
          full_name = COALESCE($2, full_name),
          deriv_nickname = COALESCE($3, deriv_nickname),
          deriv_client_id = COALESCE($4, deriv_client_id),
          preferred_currency = COALESCE($5, preferred_currency),
          phone = COALESCE($6, phone),
          country = COALESCE($7, country),
          role = COALESCE($8, role),
          status = COALESCE($9, status),
          trading_suspended = COALESCE($10, trading_suspended),
          password_hash = COALESCE($11, password_hash),
          virtual_workspace_balance = COALESCE($12, virtual_workspace_balance),
          demo_wallets_json = COALESCE($13, demo_wallets_json),
          real_wallets_json = COALESCE($14, real_wallets_json),
          exchange_balances_json = COALESCE($15, exchange_balances_json),
          real_exchange_balances_json = COALESCE($16, real_exchange_balances_json),
          updated_at = NOW()
         WHERE id = $17
         RETURNING id, email, full_name, deriv_nickname, phone, country, role, status, COALESCE(trading_suspended, FALSE) as trading_suspended,
                   locked_until, email_verified, preferred_currency, virtual_workspace_balance, demo_wallets_json,
                   real_wallets_json, exchange_balances_json, real_exchange_balances_json, deriv_client_id,
                   COALESCE(last_login_at, updated_at, created_at) as last_login_at, created_at`,
        [
          nextEmail,
          full_name !== undefined ? String(full_name).trim().slice(0, 120) : null,
          deriv_nickname !== undefined ? String(deriv_nickname).trim().slice(0, 80) : null,
          deriv_client_id !== undefined ? String(deriv_client_id).trim().slice(0, 40) : null,
          nextCurrency,
          phone ?? null,
          country ?? null,
          role ?? null,
          status ?? null,
          trading_suspended !== undefined ? Boolean(trading_suspended) : null,
          passwordHash,
          nextDemoBal,
          demo_wallets ? JSON.stringify(demo_wallets) : null,
          real_wallets ? JSON.stringify(real_wallets) : null,
          exchange_balances ? JSON.stringify(exchange_balances) : null,
          real_exchange_balances ? JSON.stringify(real_exchange_balances) : null,
          id,
        ]
      );
      const updated = updatedRes.rows[0];

      if (nextDemoBal !== null) {
        const deltaCents = toCents(nextDemoBal) - toCents(existing.virtual_workspace_balance);
        await client.query(
          `UPDATE connected_accounts
           SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
           WHERE user_id = $2 AND is_virtual = TRUE`,
          [nextDemoBal, id]
        );
        if (deltaCents !== 0) {
          await client.query(
            `INSERT INTO cashier_transactions
              (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
             VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, 'USD', $6, 'completed', 'demo', $7)`,
            [
              id,
              deltaCents > 0 ? 'credit' : 'debit',
              deltaCents > 0 ? 'Admin Treasury' : 'DEMO Options',
              deltaCents > 0 ? 'DEMO Options' : 'Admin Treasury',
              fromCents(Math.abs(deltaCents)),
              `ADM-${randomId(4).toUpperCase()}`,
              JSON.stringify({ adminUserId: req.user!.id, previousBalance: existing.virtual_workspace_balance, newBalance: nextDemoBal }),
            ]
          );
        }
      }

      if (real_wallets && typeof real_wallets === 'object') {
        const prevRw = (() => {
          try {
            return { options: 0, ...JSON.parse(existing.real_wallets_json || '{}') };
          } catch {
            return { options: 0 };
          }
        })();
        const rwOptions = fromCents(Math.max(0, toCents((real_wallets as any).options ?? 0)));
        const realDeltaCents = toCents(rwOptions) - toCents(prevRw.options ?? 0);
        await client.query(
          `UPDATE connected_accounts
           SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
           WHERE user_id = $2 AND is_virtual = FALSE AND platform = 'deriv'`,
          [rwOptions, id]
        );
        if (realDeltaCents !== 0) {
          await client.query(
            `INSERT INTO cashier_transactions
              (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
             VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, 'USD', $6, 'completed', 'real', $7)`,
            [
              id,
              realDeltaCents > 0 ? 'credit' : 'debit',
              realDeltaCents > 0 ? 'Admin Treasury' : 'REAL Options',
              realDeltaCents > 0 ? 'REAL Options' : 'Admin Treasury',
              fromCents(Math.abs(realDeltaCents)),
              `ADM-${randomId(4).toUpperCase()}`,
              JSON.stringify({ adminUserId: req.user!.id, previousBalance: Number(prevRw.options ?? 0), newBalance: rwOptions }),
            ]
          );
        }
      }

      await client.query(
        `INSERT INTO administrator_audit_logs
          (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
         VALUES ($1, 'update_user', 'users', $2, $3, $4, $5, 'success', $6)`,
        [
          req.user!.id,
          String(id),
          `status:${existing.status}, demo:$${Number(existing.virtual_workspace_balance || 0).toFixed(2)}`,
          `status:${updated.status}, demo:$${Number(updated.virtual_workspace_balance || 0).toFixed(2)}`,
          reqIp(req),
          JSON.stringify({ email: updated.email }),
        ]
      );

      return updated;
    });

    if (nextDemoBal !== null) {
      derivWs.emitUserEvent(id, 'balance_updated', { virtual_workspace_balance: nextDemoBal });
    }
    if (real_wallets && typeof real_wallets === 'object') {
      derivWs.emitUserEvent(id, 'balance_updated', { real_wallets, realWallets: real_wallets });
    }
    derivWs.emitUserEvent(id, 'account_updated', { userId: id });
    invalidateAuthUserCache(id);

    res.json({ user });
  } catch (err) {
    res.status(err instanceof Error && err.message === 'User not found' ? 404 : 400).json({
      error: err instanceof Error ? err.message : 'Failed to update user',
    });
  }
});

router.patch('/admin/users/:id/role', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const role = String(req.body?.role || 'user');
  const prev = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [id]);
  await execute('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
  invalidateAuthUserCache(id);
  await logAdminAction(req.user!.id, 'update_user_role', 'users', String(id), { role }, {
    previousValue: prev?.role || '',
    newValue: role,
    ipAddress: reqIp(req),
    actionResult: 'success',
  });
  res.json({ ok: true });
});

router.patch('/admin/users/:id/status', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || 'active');
  if (status === 'suspended' || status === 'closed') {
    if (!checkReauthHeader(req, res)) return;
  }
  const prev = await queryOne<{ status: string }>('SELECT status FROM users WHERE id = $1', [id]);
  await execute('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  invalidateAuthUserCache(id);
  await logAdminAction(req.user!.id, 'update_user_status', 'users', String(id), { status }, {
    previousValue: prev?.status || '',
    newValue: status,
    ipAddress: reqIp(req),
    actionResult: 'success',
  });
  res.json({ ok: true });
});

router.patch('/admin/users/:id/trading-access', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const id = Number(req.params.id);
  const { trading_suspended, locked_until } = req.body || {};
  const prev = await queryOne<{ trading_suspended: boolean; locked_until: string | null }>(
    'SELECT COALESCE(trading_suspended, FALSE) as trading_suspended, locked_until FROM users WHERE id = $1',
    [id]
  );
  if (!prev) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const nextSuspended = trading_suspended !== undefined ? Boolean(trading_suspended) : prev.trading_suspended;
  const nextLocked = locked_until !== undefined ? locked_until : prev.locked_until;
  await execute(
    'UPDATE users SET trading_suspended = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
    [nextSuspended, nextLocked, id]
  );
  invalidateAuthUserCache(id);
  await logAdminAction(
    req.user!.id,
    nextSuspended ? 'freeze_user_trading' : 'unfreeze_user_trading',
    'users',
    String(id),
    { trading_suspended: nextSuspended, locked_until: nextLocked },
    {
      previousValue: `trading_suspended=${prev.trading_suspended}`,
      newValue: `trading_suspended=${nextSuspended}`,
      ipAddress: reqIp(req),
      actionResult: 'success',
    }
  );
  res.json({ ok: true, trading_suspended: nextSuspended, locked_until: nextLocked });
});

router.patch('/admin/users/:id/virtual-balance', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const id = Number(req.params.id);
  const nextCents = toCents(req.body?.balance);
  if (Number.isNaN(Number(req.body?.balance)) || nextCents < 0) {
    res.status(400).json({ error: 'Valid non-negative balance is required' });
    return;
  }
  const balance = fromCents(nextCents);

  try {
    const out = await withTransaction(async (client) => {
      const prevRes = await client.query<{ virtual_workspace_balance: number }>(
        'SELECT virtual_workspace_balance FROM users WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!prevRes.rows[0]) throw new Error('User not found');
      const prevBal = fromCents(toCents(prevRes.rows[0].virtual_workspace_balance));
      const deltaCents = nextCents - toCents(prevBal);

      const userRes = await client.query<any>(
        `UPDATE users
         SET virtual_workspace_balance = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, full_name, role, status, virtual_workspace_balance`,
        [balance, id]
      );

      await client.query(
        `UPDATE connected_accounts
         SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
         WHERE user_id = $2 AND is_virtual = TRUE`,
        [balance, id]
      );

      await client.query(
        `INSERT INTO cashier_transactions
          (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
         VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, 'USD', $6, 'completed', 'demo', $7)`,
        [
          id,
          deltaCents > 0 ? 'credit' : deltaCents < 0 ? 'debit' : 'adjustment',
          deltaCents >= 0 ? 'Admin Treasury' : 'DEMO Options',
          deltaCents >= 0 ? 'DEMO Options' : 'Admin Treasury',
          fromCents(Math.abs(deltaCents)),
          `ADM-${randomId(4).toUpperCase()}`,
          JSON.stringify({ adminUserId: req.user!.id, previousBalance: prevBal, newBalance: balance }),
        ]
      );

      await client.query(
        `INSERT INTO administrator_audit_logs
          (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
         VALUES ($1, 'update_virtual_balance', 'users', $2, $3, $4, $5, 'success', $6)`,
        [req.user!.id, String(id), `$${prevBal.toFixed(2)}`, `$${balance.toFixed(2)}`, reqIp(req), JSON.stringify({ prevBal, balance })]
      );

      return userRes.rows[0];
    });

    derivWs.emitUserEvent(id, 'balance_updated', { virtual_workspace_balance: balance });
    res.json({ ok: true, user: out });
  } catch (err) {
    res.status(err instanceof Error && err.message === 'User not found' ? 404 : 400).json({
      error: err instanceof Error ? err.message : 'Failed to update demo balance',
    });
  }
});

router.patch('/admin/users/:id/real-balance', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  if (!checkReauthHeader(req, res)) return;
  const id = Number(req.params.id);
  const nextCents = toCents(req.body?.balance);
  if (Number.isNaN(Number(req.body?.balance)) || nextCents < 0) {
    res.status(400).json({ error: 'Valid non-negative Real balance is required' });
    return;
  }
  const balance = fromCents(nextCents);

  try {
    const rw = await withTransaction(async (client) => {
      const prevRes = await client.query<any>('SELECT id, real_wallets_json FROM users WHERE id = $1 FOR UPDATE', [id]);
      const existing = prevRes.rows[0];
      if (!existing) throw new Error('User not found');

      const parsed = (() => {
        try {
          return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0, ...JSON.parse(existing.real_wallets_json || '{}') };
        } catch {
          return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 };
        }
      })();
      const prevBal = fromCents(toCents(parsed.options));
      const deltaCents = nextCents - toCents(prevBal);
      parsed.options = balance;

      await client.query('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(parsed),
        id,
      ]);
      await client.query(
        `UPDATE connected_accounts
         SET balance = $1, last_known_balance = $1, balance_locked_by_admin = TRUE, updated_at = NOW()
         WHERE user_id = $2 AND is_virtual = FALSE AND platform = 'deriv'`,
        [balance, id]
      );

      await client.query(
        `INSERT INTO cashier_transactions
          (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
         VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, 'USD', $6, 'completed', 'real', $7)`,
        [
          id,
          deltaCents > 0 ? 'credit' : deltaCents < 0 ? 'debit' : 'adjustment',
          deltaCents >= 0 ? 'Admin Treasury' : 'REAL Options',
          deltaCents >= 0 ? 'REAL Options' : 'Admin Treasury',
          fromCents(Math.abs(deltaCents)),
          `ADM-${randomId(4).toUpperCase()}`,
          JSON.stringify({ adminUserId: req.user!.id, previousBalance: prevBal, newBalance: balance }),
        ]
      );

      await client.query(
        `INSERT INTO administrator_audit_logs
          (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
         VALUES ($1, 'update_real_balance', 'users', $2, $3, $4, $5, 'success', $6)`,
        [req.user!.id, String(id), `$${prevBal.toFixed(2)}`, `$${balance.toFixed(2)}`, reqIp(req), JSON.stringify({ prevBal, balance })]
      );

      return parsed;
    });

    const syncedAccounts = await query<any>(
      "SELECT id FROM connected_accounts WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv'",
      [id]
    );
    for (const acc of syncedAccounts) {
      derivWs.emitUserEvent(id, 'account_updated', { accountId: acc.id, balance: rw.options });
    }
    derivWs.emitUserEvent(id, 'balance_updated', { real_wallets: rw, realWallets: rw });
    res.json({ ok: true, real_wallets: rw });
  } catch (err) {
    res.status(err instanceof Error && err.message === 'User not found' ? 404 : 400).json({
      error: err instanceof Error ? err.message : 'Failed to update Real balance',
    });
  }
});

router.delete('/admin/users/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete currently signed-in owner account' });
    return;
  }
  const prev = await queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [id]);
  await execute('DELETE FROM users WHERE id = $1', [id]);
  invalidateAuthUserCache(id);
  await logAdminAction(req.user!.id, 'delete_user', 'users', String(id), { email: prev?.email }, {
    previousValue: prev?.email || '',
    newValue: 'deleted',
    ipAddress: reqIp(req),
    actionResult: 'success',
  });
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
    const isVirtual = isVirtualDerivAccount(loginid, accountType, Boolean(resp?.balance?.is_virtual));

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
      RETURNING ${ACCOUNT_COLS.replace('last_known_balance as balance, ', '')}`,
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
  const nextCents = toCents(req.body?.balance);
  const currency = req.body?.currency ? String(req.body.currency).trim().toUpperCase() : null;

  if (Number.isNaN(Number(req.body?.balance)) || nextCents < 0) {
    res.status(400).json({ error: 'Valid non-negative balance is required' });
    return;
  }
  const balance = fromCents(nextCents);

  try {
    const account = await withTransaction(async (client) => {
      const prevRes = await client.query<any>(
        'SELECT id, balance, last_known_balance FROM connected_accounts WHERE id = $1 FOR UPDATE',
        [id]
      );
      const prevAcc = prevRes.rows[0];
      if (!prevAcc) throw new Error('Connected account not found');
      const prevBal = fromCents(toCents(prevAcc.last_known_balance ?? prevAcc.balance));
      const deltaCents = nextCents - toCents(prevBal);

      const accRes = await client.query<any>(
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
      const updated = accRes.rows[0];

      if (updated.is_virtual) {
        await client.query('UPDATE users SET virtual_workspace_balance = $1, updated_at = NOW() WHERE id = $2', [
          balance,
          updated.user_id,
        ]);
      } else {
        const uRes = await client.query<{ real_wallets_json: string }>(
          'SELECT real_wallets_json FROM users WHERE id = $1 FOR UPDATE',
          [updated.user_id]
        );
        const rw = (() => {
          try {
            return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0, ...JSON.parse(uRes.rows[0]?.real_wallets_json || '{}') };
          } catch {
            return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 };
          }
        })();
        const accTypeLow = `${updated.account_type || ''} ${updated.platform || ''}`.toLowerCase();
        if (accTypeLow.includes('gold')) rw.mt5_gold = balance;
        else if (accTypeLow.includes('mt5') || accTypeLow.includes('cfd') || accTypeLow.includes('standard')) rw.mt5_standard = balance;
        else rw.options = balance;

        await client.query('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
          JSON.stringify(rw),
          updated.user_id,
        ]);
      }

      await client.query(
        `INSERT INTO cashier_transactions
          (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
         VALUES ($1, $2, 'Admin Balance Adjustment', 'admin_console', $3, $4, $5, $6, $7, 'completed', $8, $9)`,
        [
          updated.user_id,
          deltaCents > 0 ? 'credit' : deltaCents < 0 ? 'debit' : 'adjustment',
          deltaCents >= 0 ? 'Admin Treasury' : updated.deriv_login_id,
          deltaCents >= 0 ? updated.deriv_login_id : 'Admin Treasury',
          fromCents(Math.abs(deltaCents)),
          updated.currency || 'USD',
          `ADM-${randomId(4).toUpperCase()}`,
          updated.is_virtual ? 'demo' : 'real',
          JSON.stringify({ adminUserId: req.user!.id, accountId: id, previousBalance: prevBal, newBalance: balance }),
        ]
      );

      await client.query(
        `INSERT INTO administrator_audit_logs
          (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
         VALUES ($1, 'adjust_account_balance', 'connected_accounts', $2, $3, $4, $5, 'success', $6)`,
        [
          req.user!.id,
          String(id),
          `$${prevBal.toFixed(2)} ${updated.currency}`,
          `$${balance.toFixed(2)} ${updated.currency}`,
          reqIp(req),
          JSON.stringify({ balance, currency: updated.currency, lockedByAdmin: true }),
        ]
      );

      return updated;
    });

    if (account.is_virtual) {
      derivWs.emitUserEvent(account.user_id, 'balance_updated', { virtual_workspace_balance: balance });
    } else {
      const uRow = await queryOne<{ real_wallets_json: string }>('SELECT real_wallets_json FROM users WHERE id = $1', [
        account.user_id,
      ]);
      if (uRow) {
        try {
          const rw = JSON.parse(uRow.real_wallets_json || '{}');
          derivWs.emitUserEvent(account.user_id, 'balance_updated', { real_wallets: rw, realWallets: rw });
        } catch {
          // ignore
        }
      }
    }
    derivWs.emitUserEvent(account.user_id, 'account_updated', { accountId: account.id, balance });
    res.json({ ok: true, account });
  } catch (err) {
    res.status(err instanceof Error && err.message === 'Connected account not found' ? 404 : 400).json({
      error: err instanceof Error ? err.message : 'Failed to adjust account balance',
    });
  }
});

router.patch('/admin/connected-accounts/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { account_type, currency, balance } = req.body || {};

  if (balance !== undefined && !checkReauthHeader(req, res)) return;

  const existing = await queryOne<any>(
    'SELECT id, user_id, account_type, currency FROM connected_accounts WHERE id = $1',
    [id]
  );
  if (!existing) {
    res.status(404).json({ error: 'Connected account not found' });
    return;
  }

  const cleanType =
    account_type !== undefined && String(account_type).trim()
      ? String(account_type).trim().slice(0, 80)
      : existing.account_type;
  const cleanCurrency =
    currency !== undefined && String(currency).trim()
      ? String(currency).trim().toUpperCase().slice(0, 8)
      : existing.currency;
  const nextBal =
    balance !== undefined && !Number.isNaN(Number(balance)) && toCents(balance) >= 0
      ? fromCents(toCents(balance))
      : null;

  const updated = await queryOne<any>(
    `UPDATE connected_accounts
     SET account_type = $1,
         currency = $2,
         balance = COALESCE($3, balance),
         last_known_balance = COALESCE($3, last_known_balance),
         balance_locked_by_admin = CASE WHEN $3 IS NOT NULL THEN TRUE ELSE balance_locked_by_admin END,
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
               last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
               status, scopes, updated_at`,
    [cleanType, cleanCurrency, nextBal, id]
  );

  await logAdminAction(
    req.user!.id,
    'update_connected_account',
    'connected_accounts',
    String(id),
    { account_type: cleanType, currency: cleanCurrency, balance: nextBal },
    {
      previousValue: `${existing.account_type} (${existing.currency})`,
      newValue: `${cleanType} (${cleanCurrency})`,
      ipAddress: reqIp(req),
      actionResult: 'success',
    }
  );

  derivWs.emitUserEvent(existing.user_id, 'account_updated', {
    accountId: id,
    account_type: cleanType,
    balance: updated?.balance,
  });

  res.json({ ok: true, account: updated });
});

router.patch('/admin/connected-accounts/:id/status', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const nextStatus = String(req.body?.status || '').toLowerCase();
  if (!['active', 'frozen', 'disconnected', 'revoked'].includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid account status' });
    return;
  }
  const prev = await queryOne<{ status: string; deriv_login_id: string }>(
    'SELECT status, deriv_login_id FROM connected_accounts WHERE id = $1',
    [id]
  );
  if (!prev) {
    res.status(404).json({ error: 'Connected account not found' });
    return;
  }
  await execute('UPDATE connected_accounts SET status = $1, updated_at = NOW() WHERE id = $2', [nextStatus, id]);
  await logAdminAction(
    req.user!.id,
    nextStatus === 'frozen' ? 'freeze_connected_account' : 'update_connected_account_status',
    'connected_accounts',
    String(id),
    { status: nextStatus },
    {
      previousValue: prev.status,
      newValue: nextStatus,
      ipAddress: reqIp(req),
      actionResult: 'success',
    }
  );
  res.json({ ok: true, status: nextStatus });
});

router.post('/admin/connected-accounts/:id/sync', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  // Explicit Admin "Sync Live" unlocks the DB balance override and fetches fresh live balance from Deriv
  await execute('UPDATE connected_accounts SET balance_locked_by_admin = FALSE, updated_at = NOW() WHERE id = $1', [id]);

  const currentAcc = await queryOne<any>(
    'SELECT id, deriv_login_id FROM connected_accounts WHERE id = $1',
    [id]
  );
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
     RETURNING ${BOT_STRATEGY_COLS}`,
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
  invalidateBotStrategiesCache();
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
     RETURNING ${BOT_STRATEGY_COLS}`,
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
  invalidateBotStrategiesCache();
  await logAdminAction(req.user!.id, 'update_strategy', 'bot_strategies', String(id));
  res.json({ strategy });
});

router.delete('/admin/strategies/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await execute('DELETE FROM bot_strategies WHERE id = $1', [id]);
  invalidateBotStrategiesCache();
  await logAdminAction(req.user!.id, 'delete_strategy', 'bot_strategies', String(id));
  res.json({ ok: true });
});

// Instruments Management
router.get('/admin/instruments', requireDb, requireAdmin, async (_req, res) => {
  const rows = await query(
    `SELECT m.id, m.symbol, m.display_name, m.category, m.market, m.submarket, m.pip_size, m.spread,
            m.min_stake, m.max_stake, m.is_active, c.price, c.change_pct
     FROM market_instruments m
     LEFT JOIN market_data_cache c ON m.symbol = c.symbol
     ORDER BY m.category, m.display_name
     LIMIT 250`
  );
  const ticks = derivWs.getAllLatestTicks();
  res.json({
    instruments: rows.map((r: any) => ({
      ...r,
      price: ticks[r.symbol]?.quote ?? r.price ?? 0,
      change_pct: derivWs.getChangePct(r.symbol),
    })),
  });
});

router.patch('/admin/instruments/:symbol', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const symbol = String(req.params.symbol || '').trim();
  const { display_name, price, spread, min_stake, max_stake, is_active } = req.body || {};
  const inst = await queryOne<any>(
    `UPDATE market_instruments SET
      display_name = COALESCE($1, display_name),
      spread = COALESCE($2, spread),
      min_stake = COALESCE($3, min_stake),
      max_stake = COALESCE($4, max_stake),
      is_active = COALESCE($5, is_active),
      updated_at = NOW()
     WHERE symbol = $6
     RETURNING id, symbol, display_name, category, market, submarket, pip_size, spread, min_stake, max_stake, is_active`,
    [
      display_name ?? null,
      spread !== undefined ? Number(spread) : null,
      min_stake !== undefined ? Number(min_stake) : null,
      max_stake !== undefined ? Number(max_stake) : null,
      is_active !== undefined ? Boolean(is_active) : null,
      symbol,
    ]
  );
  if (!inst) {
    res.status(404).json({ error: 'Instrument not found' });
    return;
  }
  if (price !== undefined && Number.isFinite(Number(price)) && Number(price) > 0) {
    const p = Number(price);
    await execute(
      'UPDATE market_data_cache SET price = $1, updated_at = NOW() WHERE symbol = $2',
      [p, symbol]
    );
    derivWs.setInstrumentSpotOverride(symbol, p);
  }
  invalidateInstrumentsCache();
  await logAdminAction(req.user!.id, 'update_instrument', 'market_instruments', symbol, req.body || {});
  res.json({ instrument: { ...inst, price: derivWs.getLatestTick(symbol)?.quote ?? Number(price || 0) } });
});

// Orders Oversight & Immutable Trade History
router.get('/admin/trades', requireDb, requireAdmin, async (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
  const accountMode = typeof req.query.accountMode === 'string' ? req.query.accountMode.trim().toLowerCase() : '';
  const limit = Math.min(250, Math.max(1, Number(req.query.limit || 80)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const where: string[] = ["u.role NOT IN ('owner', 'admin')"];
  const params: unknown[] = [];
  if (userId) {
    params.push(userId);
    where.push(`vo.user_id = $${params.length}`);
  }
  if (symbol) {
    params.push(`%${symbol.toUpperCase()}%`);
    where.push(`UPPER(vo.symbol) LIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`vo.status = $${params.length}`);
  }
  if (accountMode === 'real' || accountMode === 'demo') {
    params.push(accountMode);
    where.push(`COALESCE(vo.account_mode, 'demo') = $${params.length}`);
  }

  params.push(limit, offset);
  const orders = await query(
    `SELECT ${ADMIN_ORDER_COLS}, u.email as user_email, u.full_name as user_name
     FROM virtual_orders vo
     JOIN users u ON vo.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY vo.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ orders });
});

router.patch('/admin/orders/:id', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { notes, status, exit_price, pnl, stake } = req.body || {};
  const existing = await queryOne<any>('SELECT id, status, notes FROM virtual_orders WHERE id = $1', [id]);
  if (!existing) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const attemptsOutcomeMutation =
    pnl !== undefined ||
    stake !== undefined ||
    exit_price !== undefined ||
    (status !== undefined && String(status).toUpperCase() !== existing.status);

  if (attemptsOutcomeMutation) {
    await logAdminAction(
      req.user!.id,
      'blocked_trade_outcome_edit',
      'virtual_orders',
      String(id),
      { attemptedStatus: status, attemptedPnl: pnl },
      { ipAddress: reqIp(req), actionResult: 'denied' }
    );
    res.status(403).json({
      error: 'Trade outcomes and closed P/L are immutable audit records. Use Force Close for OPEN positions, or update admin notes only.',
    });
    return;
  }

  const cleanNotes = notes !== undefined ? String(notes).slice(0, 500) : existing.notes || '';
  const updated = await queryOne<any>(
    `UPDATE virtual_orders SET notes = $1 WHERE id = $2
     RETURNING id, user_id, symbol, side, contract_type, stake, pnl, status, notes, opened_at, closed_at`,
    [cleanNotes, id]
  );

  await logAdminAction(
    req.user!.id,
    'update_order_notes',
    'virtual_orders',
    String(id),
    { notes: cleanNotes },
    {
      previousValue: String(existing.notes || ''),
      newValue: cleanNotes,
      ipAddress: reqIp(req),
      actionResult: 'success',
    }
  );
  res.json({ order: updated });
});

router.post('/admin/orders/:id/close', requireDb, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const order = await closeOrderById(Number(req.params.id), undefined, true);
    await logAdminAction(req.user!.id, 'force_close_order', 'virtual_orders', String(req.params.id), {
      pnl: order?.pnl,
      exitPrice: order?.exit_price,
    }, {
      previousValue: 'OPEN',
      newValue: `CLOSED (P/L $${Number(order?.pnl || 0).toFixed(2)})`,
      ipAddress: reqIp(req),
      actionResult: 'success',
    });
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close order' });
  }
});

router.get('/admin/audit-logs', requireDb, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 60)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const logs = await query(
    `SELECT l.id, l.admin_user_id, l.action, l.target_type, l.target_id, l.previous_value, l.new_value,
            l.ip_address, l.action_result, l.details_json, l.created_at,
            a.email as admin_email, a.full_name as admin_name
     FROM administrator_audit_logs l
     LEFT JOIN users a ON l.admin_user_id = a.id
     ORDER BY l.id DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.json({ auditLogs: logs });
});

// Cashier & Balance Adjustment Logs
router.get('/admin/cashier-logs', requireDb, requireAdmin, async (req, res) => {
  const txType = typeof req.query.tx_type === 'string' ? req.query.tx_type : '';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 60)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const cols =
    'ct.id, ct.user_id, ct.tx_type, ct.method, ct.provider, ct.account_from, ct.account_to, ct.amount, ct.currency, ct.reference_id, ct.status, ct.account_mode, ct.created_at, u.email as user_email';
  const rows = txType
    ? await query(
        `SELECT ${cols} FROM cashier_transactions ct
         JOIN users u ON ct.user_id = u.id
         WHERE ct.tx_type = $1 AND u.role NOT IN ('owner', 'admin')
         ORDER BY ct.id DESC LIMIT $2 OFFSET $3`,
        [txType, limit, offset]
      )
    : await query(
        `SELECT ${cols} FROM cashier_transactions ct
         JOIN users u ON ct.user_id = u.id
         WHERE u.role NOT IN ('owner', 'admin')
         ORDER BY ct.id DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
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
