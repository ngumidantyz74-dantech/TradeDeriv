import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute, requireDb, addNotification, logSecurityEvent, getSetting } from '../db.ts';
import { config } from '../config.ts';
import { randomId, decryptToken, maskClientId } from '../crypto.ts';
import { requireAuth, signUserToken, type AuthRequest } from '../middleware/auth.ts';
import { sendTransactionalEmail } from '../email-service.ts';
import { derivWs } from '../deriv-client.ts';

const router = Router();

function formatPublicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone || '',
    country: u.country || 'Kenya',
    role: u.role,
    status: u.status,
    email_verified: Boolean(u.email_verified),
    preferred_currency: u.preferred_currency || 'USD',
    preferred_language: u.preferred_language || 'EN',
    display_theme: u.display_theme || 'light',
    virtual_workspace_balance: Number(u.virtual_workspace_balance ?? 10000),
    exchange_balances: (() => {
      try {
        return JSON.parse(u.exchange_balances_json || '{}');
      } catch {
        return { USDT: 0, USDC: 0, BTC: 0, ETH: 0 };
      }
    })(),
    deriv_nickname: u.deriv_nickname || '',
    deriv_client_id: u.deriv_client_id || maskClientId(String(u.id).padStart(8, '0')),
    created_at: u.created_at,
  };
}

async function getPrimaryTokenForUser(userId: number): Promise<string | null> {
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

router.post('/auth/register', requireDb, async (req, res) => {
  try {
    const globalSettings = await getSetting<{ allowRegistration?: boolean; defaultVirtualBalance?: number }>('global', {});
    if (globalSettings.allowRegistration === false) {
      res.status(403).json({ error: 'New registrations are currently paused' });
      return;
    }

    const { email, password, full_name, phone, country } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const verifyToken = randomId(20);
    const defaultBalance = Number(globalSettings.defaultVirtualBalance ?? 10000);
    const clientCode = `TD${randomId(4).toUpperCase()}`;

    const newUser = await queryOne<any>(
      `INSERT INTO users (email, password_hash, full_name, phone, country, role, status, email_verified, email_verification_token, virtual_workspace_balance, deriv_client_id)
       VALUES ($1, $2, $3, $4, $5, 'user', 'active', FALSE, $6, $7, $8)
       RETURNING *`,
      [
        cleanEmail,
        passwordHash,
        String(full_name || cleanEmail.split('@')[0]),
        String(phone || ''),
        String(country || 'Kenya'),
        verifyToken,
        defaultBalance,
        clientCode,
      ]
    );

    const token = signUserToken({ id: newUser.id, email: newUser.email, role: newUser.role });

    await addNotification(
      newUser.id,
      'Welcome to TradeDeriv',
      'Your trading workspace is active with $10,000.00 virtual funds.',
      'system'
    );
    await logSecurityEvent(newUser.id, 'register', req.ip, { email: cleanEmail });

    await sendTransactionalEmail({
      to: cleanEmail,
      toName: newUser.full_name,
      template: 'welcome_verification',
      subject: 'Verify your TradeDeriv account',
      htmlContent: `<p>Welcome to TradeDeriv, ${newUser.full_name}. Verify your email: <a href="${config.appUrl}/api/auth/verify-email?token=${verifyToken}">Verify Email</a></p>`,
    });

    res.status(201).json({ token, user: formatPublicUser(newUser) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

router.post('/auth/login', requireDb, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const user = await queryOne<any>('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      await logSecurityEvent(user.id, 'login_failed', req.ip);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Account is suspended' });
      return;
    }

    const token = signUserToken({ id: user.id, email: user.email, role: user.role });
    await logSecurityEvent(user.id, 'login_success', req.ip);
    res.json({ token, user: formatPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
});

router.get('/auth/me', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const accounts = await query(
    `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
            last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            status, scopes, updated_at
     FROM connected_accounts
     WHERE user_id = $1
     ORDER BY id ASC`,
    [user.id]
  );
  res.json({ user: formatPublicUser(user), accounts });
});

router.get('/auth/verify-email', requireDb, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }
  const user = await queryOne<{ id: number }>('SELECT id FROM users WHERE email_verification_token = $1', [token]);
  if (!user) {
    res.status(404).json({ error: 'Invalid or expired verification token' });
    return;
  }
  await execute(
    'UPDATE users SET email_verified = TRUE, email_verification_token = NULL, updated_at = NOW() WHERE id = $1',
    [user.id]
  );
  res.json({ ok: true, message: 'Email verified successfully' });
});

router.post('/auth/forgot-password', requireDb, async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const user = await queryOne<{ id: number; full_name: string }>('SELECT id, full_name FROM users WHERE email = $1', [
    cleanEmail,
  ]);
  if (user) {
    const resetToken = randomId(16);
    await execute('UPDATE users SET reset_token = $1 WHERE id = $2', [resetToken, user.id]);
    await sendTransactionalEmail({
      to: cleanEmail,
      toName: user.full_name,
      template: 'password_reset',
      subject: 'TradeDeriv Password Reset',
      htmlContent: `<p>Reset your password using code: <strong>${resetToken}</strong></p>`,
    });
  }
  res.json({ ok: true, message: 'If an account matches that email, a reset link has been sent.' });
});

router.post('/auth/reset-password', requireDb, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    res.status(400).json({ error: 'Reset token and new password are required' });
    return;
  }
  const user = await queryOne<{ id: number }>('SELECT id FROM users WHERE reset_token = $1', [String(token)]);
  if (!user) {
    res.status(400).json({ error: 'Invalid reset token' });
    return;
  }
  const hash = await bcrypt.hash(String(password), 10);
  await execute('UPDATE users SET password_hash = $1, reset_token = NULL, updated_at = NOW() WHERE id = $2', [
    hash,
    user.id,
  ]);
  await logSecurityEvent(user.id, 'password_reset', req.ip);
  res.json({ ok: true });
});

router.get('/account/profile-details', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  const derivToken = await getPrimaryTokenForUser(req.user!.id);

  let derivSettings: Record<string, unknown> | null = null;
  let accountStatus: Record<string, unknown> | null = null;

  if (derivToken && !derivToken.startsWith('ory_at_')) {
    try {
      const sResp = await derivWs.requestWithToken(derivToken, { get_settings: 1 }, 4500);
      derivSettings = sResp?.get_settings || null;
      const stResp = await derivWs.requestWithToken(derivToken, { get_account_status: 1 }, 4500);
      accountStatus = stResp?.get_account_status || null;
    } catch {
      // fallback to local profile
    }
  }

  res.json({
    profile: formatPublicUser(user),
    derivSettings: derivSettings || {
      email: user.email,
      first_name: user.full_name.split(' ')[0] || '',
      last_name: user.full_name.split(' ').slice(1).join(' ') || '',
      phone: user.phone || '',
      country: user.country || 'Kenya',
      address_line_1: '',
      address_city: 'Nairobi',
      tax_identification_number: '',
      preferred_language: user.preferred_language || 'EN',
    },
    verification: accountStatus || {
      poi_status: 'verified',
      poa_status: 'pending',
      financial_assessment_status: 'incomplete',
      status: ['allow_document_upload'],
    },
  });
});

router.put('/account/profile-details', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const {
    full_name,
    phone,
    country,
    preferred_currency,
    preferred_language,
    display_theme,
    address_line_1,
    address_city,
    tax_identification_number,
  } = req.body || {};

  const updated = await queryOne<any>(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      phone = COALESCE($2, phone),
      country = COALESCE($3, country),
      preferred_currency = COALESCE($4, preferred_currency),
      preferred_language = COALESCE($5, preferred_language),
      display_theme = COALESCE($6, display_theme),
      updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      full_name ?? null,
      phone ?? null,
      country ?? null,
      preferred_currency ?? null,
      preferred_language ?? null,
      display_theme ?? null,
      req.user!.id,
    ]
  );

  const derivToken = await getPrimaryTokenForUser(req.user!.id);
  if (
    derivToken &&
    !derivToken.startsWith('ory_at_') &&
    (address_line_1 || address_city || tax_identification_number || phone)
  ) {
    try {
      await derivWs.requestWithToken(
        derivToken,
        {
          set_settings: 1,
          ...(phone ? { phone } : {}),
          ...(address_line_1 ? { address_line_1 } : {}),
          ...(address_city ? { address_city } : {}),
          ...(tax_identification_number ? { tax_identification_number } : {}),
        },
        4500
      );
    } catch {
      // ignore if demo or restricted scope
    }
  }

  res.json({ user: formatPublicUser(updated) });
});

router.post('/account/create-trading-account', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { account_type = 'Standard', platform = 'mt5', is_virtual = true, currency = 'USD' } = req.body || {};
    const derivToken = await getPrimaryTokenForUser(req.user!.id);
    const labelMap: Record<string, string> = {
      Standard: 'mt5',
      Gold: 'mt5_gold',
      'Zero Spread': 'mt5_zero_spread',
      'Swap-Free': 'mt5_swap_free',
      Financial: 'mt5_financial',
      cTrader: 'ctrader',
    };

    let createdLoginId = `${platform.toUpperCase()}-${is_virtual ? 'VR' : 'RL'}-${randomId(3).toUpperCase()}`;
    let balance = is_virtual ? 10000 : 0;

    if (derivToken && !derivToken.startsWith('ory_at_') && platform === 'mt5') {
      try {
        const resp = await derivWs.requestWithToken(
          derivToken,
          {
            mt5_new_account: 1,
            account_type: is_virtual ? 'demo' : 'real',
            mt5_account_type: account_type.toLowerCase().includes('financial') ? 'financial' : 'synthetic',
            currency,
          },
          5000
        );
        if (resp?.mt5_new_account?.login) {
          createdLoginId = String(resp.mt5_new_account.login);
          balance = Number(resp.mt5_new_account.balance ?? balance);
        }
      } catch {
        // Fallback to local tracked MT5/CFD sub-account
      }
    }

    const created = await queryOne<any>(
      `INSERT INTO connected_accounts (
        user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
        balance, last_known_balance, balance_locked_by_admin, status, scopes
      ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $7, FALSE, 'active', 'trade account_manage')
      RETURNING *`,
      [
        req.user!.id,
        createdLoginId,
        account_type,
        labelMap[account_type] || platform,
        currency,
        Boolean(is_virtual),
        balance,
      ]
    );

    await addNotification(
      req.user!.id,
      'Trading Account Activated',
      `${account_type} (${createdLoginId}) is now ready.`,
      'account'
    );
    res.status(201).json({ account: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create trading account' });
  }
});

router.get('/account/api-tokens', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const derivToken = await getPrimaryTokenForUser(req.user!.id);
  if (derivToken && !derivToken.startsWith('ory_at_')) {
    try {
      const resp = await derivWs.requestWithToken(derivToken, { api_token: 1 }, 4500);
      res.json({ tokens: resp?.api_token?.tokens || [] });
      return;
    } catch {
      // fallback
    }
  }
  const auths = await query(
    'SELECT id, auth_type, scopes, created_at, revoked_at FROM account_authorizations WHERE user_id = $1 ORDER BY id DESC',
    [req.user!.id]
  );
  res.json({ tokens: auths });
});

router.post('/account/api-tokens', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { token_name, scopes = ['read', 'trade'] } = req.body || {};
  if (!token_name) {
    res.status(400).json({ error: 'Token name is required' });
    return;
  }
  const derivToken = await getPrimaryTokenForUser(req.user!.id);
  if (derivToken && !derivToken.startsWith('ory_at_')) {
    try {
      const resp = await derivWs.requestWithToken(
        derivToken,
        { api_token: 1, new_token: token_name, new_token_scopes: scopes },
        5000
      );
      res.json({ tokens: resp?.api_token?.tokens || [] });
      return;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Deriv rejected token creation' });
      return;
    }
  }
  res.status(400).json({ error: 'Connect a Deriv account with admin scope to mint Deriv API tokens' });
});

router.delete('/account/api-tokens/:token', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const target = String(req.params.token);
  const derivToken = await getPrimaryTokenForUser(req.user!.id);
  if (derivToken && !derivToken.startsWith('ory_at_')) {
    try {
      const resp = await derivWs.requestWithToken(derivToken, { api_token: 1, delete_token: target }, 5000);
      res.json({ tokens: resp?.api_token?.tokens || [] });
      return;
    } catch {
      // fallthrough
    }
  }
  await execute('UPDATE account_authorizations SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [
    Number(target) || 0,
    req.user!.id,
  ]);
  res.json({ ok: true });
});

router.post('/account/close', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { reason = 'User requested closure' } = req.body || {};
  const derivToken = await getPrimaryTokenForUser(req.user!.id);
  if (derivToken && !derivToken.startsWith('ory_at_')) {
    try {
      await derivWs.requestWithToken(derivToken, { account_closure: 1, reason }, 5000);
    } catch {
      // ignore upstream error on demo
    }
  }
  await execute("UPDATE users SET status = 'closed', updated_at = NOW() WHERE id = $1", [req.user!.id]);
  await execute('UPDATE account_authorizations SET revoked_at = NOW() WHERE user_id = $1', [req.user!.id]);
  await logSecurityEvent(req.user!.id, 'account_closed', req.ip, { reason });
  res.json({ ok: true, message: 'Account closed and authorizations revoked' });
});

export default router;
