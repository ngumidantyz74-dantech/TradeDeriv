import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import { config, getDerivRedirectUri } from '../config.ts';
import {
  pool,
  ensureDatabaseSchema,
  query,
  queryOne,
  execute,
  requireDb,
  addNotification,
  logSecurityEvent,
  getSetting,
} from '../db.ts';
import { encryptToken, decryptToken, generateCodeVerifier, sha256Base64Url, randomId, maskClientId } from '../crypto.ts';
import { hashPasswordArgon2id } from '../password-hash.ts';
import { requireAuth, signUserToken, invalidateAuthUserCache, type AuthRequest } from '../middleware/auth.ts';
import { derivWs, derivRestRequest, getActiveDerivAppId, OtpDerivClient } from '../deriv-client.ts';
import { getDecryptedAccountToken } from '../trade-execution.ts';
import { sendTransactionalEmail } from '../email-service.ts';
import { bindClientToVerifiedRequestDevice } from '../rbac-device.ts';

const router = Router();
const usedStateJtis = new Map<string, number>();

const USER_PROFILE_COLS =
  'id, email, full_name, phone, country, role, status, email_verified, virtual_workspace_balance, deriv_nickname, deriv_client_id, last_login_at, updated_at, created_at';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isVirtualDerivAccount(
  loginId: string,
  accountType = '',
  explicitVirtual?: boolean
): boolean {
  if (explicitVirtual === true) return true;
  const cleanId = String(loginId || '').trim().toUpperCase();
  if (/^(VR|VRT|VRW|DOT)/.test(cleanId)) return true;
  if (/(demo|virtual)/i.test(String(accountType || ''))) return true;
  return false;
}

function cleanupReplayGuard(): void {
  const now = Date.now();
  for (const [jti, expiresAt] of usedStateJtis.entries()) {
    if (expiresAt < now) usedStateJtis.delete(jti);
  }
}

function buildOAuth2PkceUrls(options: {
  req?: Request;
  userId?: number | null;
  prompt?: 'login' | 'registration';
  origin?: string;
}) {
  cleanupReplayGuard();
  const appId = getActiveDerivAppId();
  const redirectUri = getDerivRedirectUri(options.req, options.origin).replace(/\/+$/, '');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = sha256Base64Url(codeVerifier);
  const jti = randomId(16);

  const encVerifier = encryptToken(
    JSON.stringify({ codeVerifier, redirectUri, userId: options.userId || null, appId })
  );
  const state = jwt.sign({ jti, payload: encVerifier }, config.jwtSecret, { expiresIn: '20m' });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.derivOAuthScopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  if (options.prompt === 'registration') {
    params.set('prompt', 'registration');
  }

  const pkceUrl = `${config.derivOAuthUrl}?${params.toString()}`;
  const legacyUrl = `${config.derivLegacyOAuthUrl}?app_id=${encodeURIComponent(appId)}&l=EN&brand=deriv`;
  // Numeric-only Deriv IDs (e.g. 1089) are WebSocket legacy App IDs and do not exist as Ory OAuth2 PKCE clients
  const isLegacyNumericAppId = /^\d+$/.test(appId);

  return {
    url: isLegacyNumericAppId ? legacyUrl : pkceUrl,
    pkceUrl,
    legacyUrl,
    redirectUri,
    appId,
    flow: isLegacyNumericAppId ? 'legacy_oauth' : 'oauth2_pkce',
  };
}

/**
 * Upserts a connected Deriv account for a user while:
 * 1) Always refreshing the encrypted OAuth/API token in account_authorizations
 * 2) Preserving DB last_known_balance & balance if balance_locked_by_admin = TRUE
 *    OR preserveExistingBalances = TRUE (repeat login where user already exists in DB).
 */
async function upsertDerivAccountForUser(params: {
  userId: number;
  derivLoginId: string;
  accountType: string;
  platform: string;
  currency: string;
  isVirtual: boolean;
  balance: number;
  token: string;
  authType: 'oauth2' | 'legacy_oauth' | 'pat';
  scopes: string;
  preserveExistingBalances: boolean;
}): Promise<number> {
  const row = await queryOne<{ id: number; last_known_balance: number; balance_locked_by_admin: boolean }>(
    `INSERT INTO connected_accounts (
      user_id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
      balance, last_known_balance, balance_locked_by_admin, status, scopes, updated_at
    ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $7, FALSE, 'active', $8, NOW())
    ON CONFLICT (user_id, deriv_login_id) DO UPDATE SET
      deriv_account_id = EXCLUDED.deriv_login_id,
      account_type = EXCLUDED.account_type,
      platform = EXCLUDED.platform,
      currency = EXCLUDED.currency,
      is_virtual = EXCLUDED.is_virtual,
      balance = CASE
        WHEN COALESCE(connected_accounts.balance_locked_by_admin, FALSE) = TRUE OR $9 = TRUE
          THEN connected_accounts.last_known_balance
        ELSE EXCLUDED.last_known_balance
      END,
      last_known_balance = CASE
        WHEN COALESCE(connected_accounts.balance_locked_by_admin, FALSE) = TRUE OR $9 = TRUE
          THEN connected_accounts.last_known_balance
        ELSE EXCLUDED.last_known_balance
      END,
      status = 'active',
      scopes = EXCLUDED.scopes,
      updated_at = NOW()
    RETURNING id, last_known_balance, balance_locked_by_admin`,
    [
      params.userId,
      params.derivLoginId,
      params.accountType,
      params.platform,
      params.currency,
      params.isVirtual,
      params.balance,
      params.scopes,
      params.preserveExistingBalances,
    ]
  );

  const accountId = Number(row!.id);
  const enc = encryptToken(params.token);

  await execute(
    'UPDATE account_authorizations SET revoked_at = NOW() WHERE connected_account_id = $1 AND revoked_at IS NULL',
    [accountId]
  );
  await execute(
    `INSERT INTO account_authorizations (connected_account_id, user_id, auth_type, encrypted_token, token_iv, token_auth_tag, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [accountId, params.userId, params.authType, enc.encryptedToken, enc.iv, enc.authTag, params.scopes]
  );

  return accountId;
}

async function syncRealDerivWalletForUser(userId: number): Promise<void> {
  const realRows = await query<{
    id: number;
    last_known_balance: number;
    balance_locked_by_admin: boolean;
  }>(
    `SELECT id, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
     FROM connected_accounts
     WHERE user_id = $1
       AND is_virtual = FALSE
       AND status = 'active'
       AND (platform = 'deriv' OR platform IS NULL)
     ORDER BY id ASC`,
    [userId]
  );
  if (realRows.length === 0 || realRows.some((r) => Boolean(r.balance_locked_by_admin))) {
    return;
  }

  const primaryBalance = Number(Number(realRows[0].last_known_balance || 0).toFixed(2));
  const userRow = await queryOne<{ real_wallets_json: string | null }>(
    'SELECT real_wallets_json FROM users WHERE id = $1',
    [userId]
  );
  if (!userRow) return;

  let currentRw: Record<string, number> = {
    options: 0,
    mt5_standard: 0,
    mt5_gold: 0,
    exchange_usdt: 0,
  };
  try {
    currentRw = { ...currentRw, ...(JSON.parse(userRow.real_wallets_json || '{}') || {}) };
  } catch {
    // keep default shape
  }

  if (Number(currentRw.options ?? 0) === primaryBalance) return;
  currentRw.options = primaryBalance;
  await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
    JSON.stringify(currentRw),
    userId,
  ]);
}

function cleanDerivFullName(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s || s === 'Deriv Trader' || s === 'New Trader') return '';
  return s;
}

function normalizeDerivCountry(raw?: string, existing?: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.length <= 2) {
    const map: Record<string, string> = {
      KE: 'Kenya',
      UG: 'Uganda',
      TZ: 'Tanzania',
      NG: 'Nigeria',
      ZA: 'South Africa',
      GH: 'Ghana',
      RW: 'Rwanda',
      GB: 'United Kingdom',
      US: 'United States',
    };
    const mapped = map[s.toUpperCase()];
    if (mapped) return mapped;
    return existing?.trim() ? null : s.toUpperCase();
  }
  return s;
}

async function syncDerivProfileOnExistingUser(
  userRow: any,
  profile: {
    email?: string;
    fullName?: string;
    phone?: string;
    country?: string;
    nickname?: string;
    clientId?: string;
  }
): Promise<any> {
  if (!userRow) return userRow;
  const incomingName = cleanDerivFullName(profile.fullName) || cleanDerivFullName(profile.nickname);
  const currentName = String(userRow.full_name || '').trim();
  const shouldUpdateName = Boolean(
    incomingName && (!currentName || currentName === 'Deriv Trader' || currentName === 'New Trader')
  );

  const incomingPhone = String(profile.phone || '').trim();
  const currentPhone = String(userRow.phone || '').trim();
  const shouldUpdatePhone = Boolean(incomingPhone && !currentPhone);

  const normalizedCountry = normalizeDerivCountry(profile.country, userRow.country);
  const currentCountry = String(userRow.country || '').trim();
  const shouldUpdateCountry = Boolean(normalizedCountry && !currentCountry);

  const incomingNick = String(profile.nickname || '').trim();
  const incomingClientId = profile.clientId ? maskClientId(profile.clientId) : '';

  const fresh = await queryOne<any>(
    `UPDATE users SET
      full_name = CASE WHEN $1 <> '' THEN $1 ELSE full_name END,
      phone = CASE WHEN $2 <> '' THEN $2 ELSE phone END,
      country = CASE WHEN $3 <> '' THEN $3 ELSE country END,
      deriv_nickname = COALESCE(NULLIF($4, ''), deriv_nickname),
      deriv_client_id = COALESCE(NULLIF($5, ''), deriv_client_id),
      last_login_at = NOW(),
      updated_at = NOW()
     WHERE id = $6
     RETURNING ${USER_PROFILE_COLS}`,
    [
      shouldUpdateName ? incomingName : '',
      shouldUpdatePhone ? incomingPhone : '',
      shouldUpdateCountry ? normalizedCountry! : '',
      incomingNick,
      !String(userRow.deriv_client_id || '').trim() ? incomingClientId : '',
      userRow.id,
    ]
  );
  return fresh || userRow;
}

/**
 * Resolves whether this Deriv login belongs to an existing database user (repeat login)
 * or is a brand-new user (first login).
 * Repeat login checks BOTH `users.email` AND `connected_accounts.deriv_login_id`.
 */
async function ensureUserFromDerivProfile(profile: {
  email?: string;
  fullName?: string;
  phone?: string;
  country?: string;
  nickname?: string;
  clientId?: string;
  loginIds?: string[];
  preferredUserId?: number | null;
}): Promise<{ user: any; isNew: boolean; preserveExistingBalances: boolean }> {
  if (profile.preferredUserId) {
    const existingById = await queryOne<any>(
      `SELECT ${USER_PROFILE_COLS} FROM users WHERE id = $1 AND role NOT IN ('owner', 'admin')`,
      [profile.preferredUserId]
    );
    if (existingById) {
      const synced = await syncDerivProfileOnExistingUser(existingById, profile);
      return { user: synced, isNew: false, preserveExistingBalances: true };
    }
  }

  // 1) Check if trader email exists in users (never log into owner/admin rows as trader)
  const candidateEmail = profile.email ? profile.email.trim().toLowerCase() : '';
  if (candidateEmail) {
    const existingByEmail = await queryOne<any>(
      `SELECT ${USER_PROFILE_COLS} FROM users WHERE LOWER(email) = $1 AND role NOT IN ('owner', 'admin')`,
      [candidateEmail]
    );
    if (existingByEmail) {
      const synced = await syncDerivProfileOnExistingUser(existingByEmail, profile);
      return { user: synced, isNew: false, preserveExistingBalances: true };
    }
  }

  // 2) Check if any deriv_login_id already exists in connected_accounts for a non-admin trader
  const loginIds = (profile.loginIds || []).filter(Boolean);
  if (loginIds.length > 0) {
    const existingConn = await queryOne<{ user_id: number }>(
      `SELECT ca.user_id FROM connected_accounts ca
       JOIN users u ON ca.user_id = u.id
       WHERE ca.deriv_login_id = ANY($1::text[]) AND u.role NOT IN ('owner', 'admin')
       LIMIT 1`,
      [loginIds]
    );
    if (existingConn) {
      const existingUser = await queryOne<any>(`SELECT ${USER_PROFILE_COLS} FROM users WHERE id = $1`, [
        existingConn.user_id,
      ]);
      if (existingUser) {
        const synced = await syncDerivProfileOnExistingUser(existingUser, profile);
        return { user: synced, isNew: false, preserveExistingBalances: true };
      }
    }
  }

  // 3) Check fallback synthetic email — if candidateEmail belongs to owner/admin, assign unique trader alias
  const ownerConflict = candidateEmail
    ? await queryOne<{ id: number }>("SELECT id FROM users WHERE LOWER(email) = $1 AND role IN ('owner', 'admin')", [
        candidateEmail,
      ])
    : null;
  const fallbackLogin = profile.clientId || loginIds[0] || randomId(5);
  const cleanEmail = (
    ownerConflict
      ? `${fallbackLogin.toLowerCase()}@deriv-trader.local`
      : candidateEmail || `${fallbackLogin}@deriv-oauth.local`
  ).toLowerCase();

  const existingFallback = await queryOne<any>(
    `SELECT ${USER_PROFILE_COLS} FROM users WHERE LOWER(email) = $1 AND role NOT IN ('owner', 'admin')`,
    [cleanEmail]
  );
  if (existingFallback) {
    const synced = await syncDerivProfileOnExistingUser(existingFallback, profile);
    return { user: synced, isNew: false, preserveExistingBalances: true };
  }

  // First Login: create new user
  const globalSettings = await getSetting<{ defaultVirtualBalance?: number }>('global', {});
  const hash = await hashPasswordArgon2id(randomId(24));
  const resolvedName =
    cleanDerivFullName(profile.fullName) ||
    cleanDerivFullName(profile.nickname) ||
    'Deriv Trader';
  const resolvedPhone = String(profile.phone || '').trim();
  const resolvedCountry = normalizeDerivCountry(profile.country) || 'Kenya';
  const created = await queryOne<any>(
    `INSERT INTO users (email, password_hash, full_name, phone, country, role, status, email_verified, virtual_workspace_balance, deriv_nickname, deriv_client_id)
     VALUES ($1, $2, $3, $4, $5, 'user', 'active', TRUE, $6, $7, $8)
     RETURNING ${USER_PROFILE_COLS}`,
    [
      cleanEmail,
      hash,
      resolvedName,
      resolvedPhone,
      resolvedCountry,
      Number(globalSettings.defaultVirtualBalance ?? 10000),
      profile.nickname || '',
      maskClientId(profile.clientId || randomId(8)),
    ]
  );

  await addNotification(
    created.id,
    'Deriv Account Synced',
    'Your Deriv trading accounts have been linked automatically.',
    'account'
  );
  return { user: created, isNew: true, preserveExistingBalances: false };
}

router.get('/deriv/oauth-url/public', async (req, res) => {
  if (pool) {
    try {
      await ensureDatabaseSchema();
    } catch {
      // fallback to env config if DB temporarily unavailable
    }
  }
  const prompt = req.query.prompt === 'registration' ? 'registration' : 'login';
  const origin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
  const result = buildOAuth2PkceUrls({ req, prompt, origin });
  res.json(result);
});

router.get('/deriv/oauth-url', requireDb, requireAuth, (req: AuthRequest, res) => {
  const origin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
  const result = buildOAuth2PkceUrls({ req, userId: req.user!.id, origin });
  res.json(result);
});

export async function handleDerivOAuthCallback(req: any, res: any): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      const safeErr = escapeHtml(error_description || error);
      res.status(400).send(
        `<html><body style="font-family:sans-serif;padding:24px;"><h3>Deriv Authorization Cancelled</h3><p>${safeErr}</p><script>if(window.opener){window.opener.postMessage({type:'DERIV_OAUTH_ERROR',error:${JSON.stringify(
          String(error_description || error)
        )}},'*');setTimeout(()=>window.close(),1200);}</script></body></html>`
      );
      return;
    }

    // Legacy multi-account callback: ?acct1=CR123&token1=a1-xxx&cur1=USD&acct2=VRTC123&token2=a1-yyy&cur2=USD
    if (req.query.token1 && req.query.acct1) {
      const entries: Array<{ acct: string; token: string; cur: string }> = [];
      let idx = 1;
      while (req.query[`acct${idx}`] && req.query[`token${idx}`]) {
        entries.push({
          acct: String(req.query[`acct${idx}`]),
          token: String(req.query[`token${idx}`]),
          cur: String(req.query[`cur${idx}`] || 'USD'),
        });
        idx++;
      }

      let email = '';
      let fullName = '';
      let phone = '';
      let country = '';
      for (const entry of entries.slice(0, 2)) {
        try {
          const settingsResp = await derivWs.requestWithToken(entry.token, { get_settings: 1 }, 4500);
          const gs = settingsResp?.get_settings || {};
          const authMeta = settingsResp?._authorize || {};
          email = email || gs.email || authMeta.email || '';
          const gsName = `${gs.first_name || ''} ${gs.last_name || ''}`.trim();
          fullName = fullName || gsName || cleanDerivFullName(authMeta.fullname) || '';
          phone = phone || String(gs.phone || '').trim();
          country = country || String(gs.country || authMeta.country || '').trim();
          if (email && fullName && phone) break;
        } catch {
          // continue checking next token
        }
      }

      const session = await ensureUserFromDerivProfile({
        email,
        fullName,
        phone,
        country,
        clientId: entries[0].acct,
        loginIds: entries.map((e) => e.acct),
      });

      const existingAccRows = await query<{ deriv_login_id: string }>(
        'SELECT deriv_login_id FROM connected_accounts WHERE user_id = $1',
        [session.user.id]
      );
      const existingLoginIds = new Set(existingAccRows.map((r) => String(r.deriv_login_id)));

      for (const e of entries) {
        const isVirtual = isVirtualDerivAccount(e.acct);
        const alreadyKnown = existingLoginIds.has(e.acct);
        let bal = isVirtual ? 10000 : 0;
        if (!session.preserveExistingBalances || !alreadyKnown) {
          try {
            const balResp = await derivWs.requestWithToken(e.token, { balance: 1 }, 4000);
            if (balResp?.balance?.balance !== undefined) bal = Number(balResp.balance.balance);
          } catch {
            // ignore
          }
        }
        await upsertDerivAccountForUser({
          userId: session.user.id,
          derivLoginId: e.acct,
          accountType: isVirtual ? 'Demo Options' : 'Real Options',
          platform: 'deriv',
          currency: e.cur,
          isVirtual,
          balance: bal,
          token: e.token,
          authType: 'legacy_oauth',
          scopes: config.derivOAuthScopes,
          preserveExistingBalances: session.preserveExistingBalances && alreadyKnown,
        });
      }

      await syncRealDerivWalletForUser(session.user.id);
      invalidateAuthUserCache(session.user.id);
      const jwtToken = signUserToken({ id: session.user.id, email: session.user.email, role: session.user.role });
      await bindClientToVerifiedRequestDevice(req, session.user.id, 'deriv_oauth_legacy').catch(() => {});
      await logSecurityEvent(session.user.id, 'deriv_oauth_legacy_login', req.ip, {
        accounts: entries.length,
        isNew: session.isNew,
        preservedDbBalances: session.preserveExistingBalances,
      });

      const nextUrl = `/#/?oauth_token=${encodeURIComponent(jwtToken)}&tab=home`;
      res.send(`
        <html><body style="font-family:sans-serif;padding:24px;background:#151820;color:#fff;">
          <p>Connected ${entries.length} Deriv account(s). Redirecting to Deriv...</p>
          <script>
            var nextUrl = ${JSON.stringify(nextUrl)};
            if (window.opener) {
              try { window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: ${JSON.stringify(jwtToken)} }, '*'); } catch (e) {}
              try { window.close(); } catch (e) {}
              setTimeout(function () { window.location.replace(nextUrl); }, 450);
            } else {
              window.location.replace(nextUrl);
            }
          </script>
        </body></html>
      `);
      return;
    }

    // Modern OAuth2 PKCE callback: ?code=...&state=...
    if (!code || !state) {
      res.status(400).json({ error: 'Missing OAuth authorization code or state' });
      return;
    }

    const decodedState = jwt.verify(String(state), config.jwtSecret) as {
      jti: string;
      payload: { encryptedToken: string; iv: string; authTag: string };
    };

    cleanupReplayGuard();
    if (usedStateJtis.has(decodedState.jti)) {
      res.status(409).json({ error: 'OAuth state replay detected' });
      return;
    }
    usedStateJtis.set(decodedState.jti, Date.now() + 20 * 60 * 1000);

    const verifierJson = JSON.parse(
      decryptToken(decodedState.payload.encryptedToken, decodedState.payload.iv, decodedState.payload.authTag)
    ) as { codeVerifier: string; redirectUri: string; userId: number | null; appId?: string };

    const appId = verifierJson.appId || getActiveDerivAppId();
    const baseTokenParams = {
      grant_type: 'authorization_code',
      client_id: appId,
      code: String(code),
      redirect_uri: verifierJson.redirectUri,
      code_verifier: verifierJson.codeVerifier,
    };

    const postTokenExchange = async (
      paramsObj: Record<string, string>,
      extraHeaders: Record<string, string> = {}
    ) => {
      const resp = await fetch(config.derivTokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...extraHeaders,
        },
        body: new URLSearchParams(paramsObj).toString(),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        access_token?: string;
        id_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };
      return { resp, json };
    };

    // 1. Try configured client_secret_post if a secret is provided; otherwise pure PKCE ('none')
    let attempt = config.derivClientSecret
      ? await postTokenExchange({ ...baseTokenParams, client_secret: config.derivClientSecret })
      : await postTokenExchange(baseTokenParams);

    const errText = `${attempt.json.error || ''} ${attempt.json.error_description || ''}`.toLowerCase();

    // 2. If Deriv Ory client is configured for 'none' (public PKCE), retry without client_secret
    if (
      (!attempt.resp.ok || !attempt.json.access_token) &&
      config.derivClientSecret &&
      (errText.includes("'none'") || errText.includes('client_secret_post') || errText.includes('client authentication'))
    ) {
      attempt = await postTokenExchange(baseTokenParams);
    }

    // 3. If Deriv Ory client requires 'client_secret_basic', retry with HTTP Basic Auth header
    const errText2 = `${attempt.json.error || ''} ${attempt.json.error_description || ''}`.toLowerCase();
    if (
      (!attempt.resp.ok || !attempt.json.access_token) &&
      config.derivClientSecret &&
      errText2.includes('client_secret_basic')
    ) {
      const basic = Buffer.from(`${appId}:${config.derivClientSecret}`).toString('base64');
      attempt = await postTokenExchange(baseTokenParams, { Authorization: `Basic ${basic}` });
    }

    if (!attempt.resp.ok || !attempt.json.access_token) {
      throw new Error(attempt.json.error_description || attempt.json.error || 'Deriv OAuth2 token exchange failed');
    }

    const tokenData = attempt.json;
    const accessToken = tokenData.access_token!;
    const scopes = tokenData.scope || config.derivOAuthScopes;

    let nickname = '';
    let fullName = '';
    let phone = '';
    let country = '';
    let externalId = '';
    let email = '';
    if (tokenData.id_token) {
      try {
        const claimsPart = tokenData.id_token.split('.')[1];
        if (claimsPart) {
          const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8')) as {
            email?: string;
            sub?: string;
            name?: string;
            given_name?: string;
            family_name?: string;
            preferred_username?: string;
            phone_number?: string;
            country?: string;
            address?: { country?: string };
          };
          if (claims.email) email = claims.email;
          if (claims.sub) externalId = claims.sub;
          const claimCombined = `${claims.given_name || ''} ${claims.family_name || ''}`.trim();
          fullName = cleanDerivFullName(claims.name) || cleanDerivFullName(claimCombined) || fullName;
          nickname = claims.preferred_username || claims.name || nickname;
          if (claims.phone_number) phone = String(claims.phone_number).trim();
          if (claims.country || claims.address?.country) {
            country = String(claims.country || claims.address?.country || '').trim();
          }
        }
      } catch {
        // ignore malformed id_token
      }
    }
    try {
      const nickData = await derivRestRequest<{
        nickname?: string;
        external_id?: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        full_name?: string;
        phone?: string;
        country?: string;
      }>('/account/v1/nickname', accessToken);
      nickname = nickData.nickname || nickname;
      externalId = nickData.external_id || externalId;
      email = nickData.email || email;
      const nickCombined = `${nickData.first_name || ''} ${nickData.last_name || ''}`.trim();
      fullName = fullName || cleanDerivFullName(nickData.full_name) || cleanDerivFullName(nickCombined) || '';
      phone = phone || String(nickData.phone || '').trim();
      country = country || String(nickData.country || '').trim();
    } catch {
      // ignore if endpoint unavailable
    }

    let derivAccounts: Array<{
      account_id: string;
      balance: number;
      currency: string;
      account_type?: string;
      is_virtual?: boolean;
    }> = [];
    try {
      const accResp = await derivRestRequest<{ data?: any[]; accounts?: any[] }>(
        '/trading/v1/options/accounts',
        accessToken
      );
      const list = accResp.data || accResp.accounts || (Array.isArray(accResp) ? accResp : []);
      derivAccounts = list.map((a: any) => {
        const accountId = String(a.account_id || a.loginid || a.id);
        const accType = String(a.account_type || (a.is_virtual ? 'Demo' : 'Real'));
        const isVirt = isVirtualDerivAccount(accountId, accType, a.is_virtual);
        return {
          account_id: accountId,
          balance: Number(a.balance ?? 0),
          currency: String(a.currency || 'USD'),
          account_type: accType,
          is_virtual: isVirt,
        };
      });
    } catch {
      // ignore empty list
    }

    // Best-effort profile/get_settings hydration when name or phone is still missing on OAuth2 PKCE
    if ((!fullName || !phone) && derivAccounts.length > 0) {
      try {
        const otpResp = await derivRestRequest<any>(
          `/trading/v1/options/accounts/${derivAccounts[0].account_id}/otp`,
          accessToken,
          { method: 'POST' }
        );
        const rawOtp = String(
          otpResp?.url || otpResp?.ws_url || otpResp?.data?.url || otpResp?.data?.ws_url || otpResp?.otp || otpResp?.data?.otp || ''
        ).trim();
        const otpUrl = rawOtp
          ? rawOtp.startsWith('ws://') || rawOtp.startsWith('wss://')
            ? rawOtp
            : `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}&otp=${encodeURIComponent(rawOtp)}`
          : '';
        if (otpUrl) {
          const settingsResp = await OtpDerivClient.requestOnOtpUrl<any>(otpUrl, { get_settings: 1 }, 3500);
          const gs = settingsResp?.get_settings || {};
          const gsName = `${gs.first_name || ''} ${gs.last_name || ''}`.trim();
          fullName = fullName || cleanDerivFullName(gsName);
          phone = phone || String(gs.phone || '').trim();
          country = country || String(gs.country || '').trim();
          email = email || String(gs.email || '').trim();
        }
      } catch {
        // non-blocking best-effort hydration
      }
    }

    const session = await ensureUserFromDerivProfile({
      email,
      fullName,
      phone,
      country,
      nickname,
      clientId: externalId || derivAccounts[0]?.account_id,
      loginIds: derivAccounts.map((a) => a.account_id),
      preferredUserId: verifierJson.userId,
    });

    for (const acc of derivAccounts) {
      await upsertDerivAccountForUser({
        userId: session.user.id,
        derivLoginId: acc.account_id,
        accountType: acc.is_virtual ? 'Demo Options' : 'Real Options',
        platform: 'deriv',
        currency: acc.currency,
        isVirtual: Boolean(acc.is_virtual),
        balance: acc.balance,
        token: accessToken,
        authType: 'oauth2',
        scopes,
        preserveExistingBalances: session.preserveExistingBalances,
      });
    }

    await syncRealDerivWalletForUser(session.user.id);
    invalidateAuthUserCache(session.user.id);
    const jwtToken = signUserToken({ id: session.user.id, email: session.user.email, role: session.user.role });
    await bindClientToVerifiedRequestDevice(req, session.user.id, 'deriv_oauth2_pkce').catch(() => {});
    await logSecurityEvent(session.user.id, 'deriv_oauth2_pkce_login', req.ip, {
      accounts: derivAccounts.length,
      isNew: session.isNew,
      preservedDbBalances: session.preserveExistingBalances,
    });

    const nextUrl = `/#/?oauth_token=${encodeURIComponent(jwtToken)}&tab=home`;
    res.send(`
      <html><body style="font-family:sans-serif;padding:24px;background:#151820;color:#fff;">
        <p>Deriv connected! Redirecting...</p>
        <script>
          var nextUrl = ${JSON.stringify(nextUrl)};
          if (window.opener) {
            try { window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: ${JSON.stringify(jwtToken)} }, '*'); } catch (e) {}
            try { window.close(); } catch (e) {}
            setTimeout(function () { window.location.replace(nextUrl); }, 450);
          } else {
            window.location.replace(nextUrl);
          }
        </script>
      </body></html>
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Deriv OAuth callback error';
    res.status(500).send(
      `<html><body style="font-family:sans-serif;padding:24px;"><h3>Connection Error</h3><p>${escapeHtml(
        msg
      )}</p><script>if(window.opener){window.opener.postMessage({type:'DERIV_OAUTH_ERROR',error:${JSON.stringify(
        msg
      )}},'*');}</script></body></html>`
    );
  }
}

router.get(['/deriv/oauth/callback', '/deriv/oauth/callback/'], requireDb, handleDerivOAuthCallback);

router.post('/deriv/oauth/exchange', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { accounts } = req.body || {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
      res.status(400).json({ error: 'No accounts payload supplied' });
      return;
    }

    const existingAccRows = await query<{ deriv_login_id: string }>(
      'SELECT deriv_login_id FROM connected_accounts WHERE user_id = $1',
      [req.user!.id]
    );
    const existingLoginIds = new Set(existingAccRows.map((r) => String(r.deriv_login_id)));
    const preserveExistingBalances = existingLoginIds.size > 0;

    for (const a of accounts) {
      if (!a.acct || !a.token) continue;
      const loginId = String(a.acct);
      const alreadyKnown = existingLoginIds.has(loginId);
      const isVirtual = isVirtualDerivAccount(loginId);
      let bal = isVirtual ? 10000 : 0;
      if (!preserveExistingBalances || !alreadyKnown) {
        try {
          const resp = await derivWs.requestWithToken(String(a.token), { balance: 1 }, 4000);
          if (resp?.balance?.balance !== undefined) bal = Number(resp.balance.balance);
        } catch {
          // ignore
        }
      }
      await upsertDerivAccountForUser({
        userId: req.user!.id,
        derivLoginId: loginId,
        accountType: isVirtual ? 'Demo Options' : 'Real Options',
        platform: 'deriv',
        currency: String(a.cur || 'USD'),
        isVirtual,
        balance: bal,
        token: String(a.token),
        authType: 'legacy_oauth',
        scopes: config.derivOAuthScopes,
        preserveExistingBalances: preserveExistingBalances && alreadyKnown,
      });
    }

    await syncRealDerivWalletForUser(req.user!.id);

    // Best-effort profile hydration from first valid token
    if (accounts[0]?.token) {
      try {
        const settingsResp = await derivWs.requestWithToken(String(accounts[0].token), { get_settings: 1 }, 3500);
        const gs = settingsResp?.get_settings || {};
        const authMeta = settingsResp?._authorize || {};
        const gsName = `${gs.first_name || ''} ${gs.last_name || ''}`.trim() || cleanDerivFullName(authMeta.fullname);
        const existingUser = await queryOne<any>(`SELECT ${USER_PROFILE_COLS} FROM users WHERE id = $1`, [req.user!.id]);
        await syncDerivProfileOnExistingUser(existingUser, {
          fullName: gsName,
          phone: gs.phone || '',
          country: gs.country || authMeta.country || '',
          clientId: String(accounts[0].acct || ''),
        });
      } catch {
        await execute('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [req.user!.id]);
      }
    } else {
      await execute('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [req.user!.id]);
    }
    await bindClientToVerifiedRequestDevice(req, req.user!.id, 'deriv_oauth_exchange').catch(() => {});
    invalidateAuthUserCache(req.user!.id);

    const updated = await query(
      `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
              last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
              status, scopes, updated_at
       FROM connected_accounts WHERE user_id = $1 ORDER BY id ASC`,
      [req.user!.id]
    );
    res.json({ accounts: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Exchange failed' });
  }
});

router.post('/deriv/connect', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { token, label } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    let derivLoginId = `CR${randomId(3).toUpperCase()}`;
    let currency = 'USD';
    let balance = 0;
    let isVirtual = false;

    const authResp = await derivWs.requestWithToken(String(token), { balance: 1 }, 6000);
    if (authResp?.balance) {
      derivLoginId = String(authResp.balance.loginid || derivLoginId);
      currency = String(authResp.balance.currency || 'USD');
      balance = Number(authResp.balance.balance || 0);
      isVirtual = isVirtualDerivAccount(derivLoginId, label || '', Boolean(authResp.balance.is_virtual));
    }

    const alreadyExists = await queryOne<{ id: number }>(
      'SELECT id FROM connected_accounts WHERE user_id = $1 AND deriv_login_id = $2',
      [req.user!.id, derivLoginId]
    );

    const id = await upsertDerivAccountForUser({
      userId: req.user!.id,
      derivLoginId,
      accountType: label || (isVirtual ? 'Demo Options' : 'Real Options'),
      platform: 'deriv',
      currency,
      isVirtual,
      balance,
      token: String(token),
      authType: 'pat',
      scopes: 'read trade',
      preserveExistingBalances: Boolean(alreadyExists),
    });

    // Hydrate user full_name, phone & country from Deriv settings if still placeholder/blank
    try {
      const settingsResp = await derivWs.requestWithToken(String(token), { get_settings: 1 }, 3500);
      const gs = settingsResp?.get_settings || {};
      const authMeta = settingsResp?._authorize || authResp?._authorize || {};
      const gsName = `${gs.first_name || ''} ${gs.last_name || ''}`.trim() || cleanDerivFullName(authMeta.fullname);
      const existingUser = await queryOne<any>(`SELECT ${USER_PROFILE_COLS} FROM users WHERE id = $1`, [req.user!.id]);
      await syncDerivProfileOnExistingUser(existingUser, {
        fullName: gsName,
        phone: gs.phone || '',
        country: gs.country || authMeta.country || '',
        clientId: derivLoginId,
      });
    } catch {
      // ignore if token lacks read scope or timed out
    }
    await syncRealDerivWalletForUser(req.user!.id);
    await bindClientToVerifiedRequestDevice(req, req.user!.id, 'deriv_pat_connect').catch(() => {});
    invalidateAuthUserCache(req.user!.id);

    const user = await queryOne<{ email: string; full_name: string }>('SELECT email, full_name FROM users WHERE id = $1', [
      req.user!.id,
    ]);
    if (user) {
      await sendTransactionalEmail({
        to: user.email,
        toName: user.full_name,
        template: 'connection_status',
        subject: `Deriv Account ${derivLoginId} Connected`,
        htmlContent: `<p>Your Deriv account <strong>${derivLoginId}</strong> (${currency}) has been linked to TradeDeriv.</p>`,
      });
    }

    const account = await queryOne(
      `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
              last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
              status, scopes, updated_at
       FROM connected_accounts WHERE id = $1`,
      [id]
    );
    res.json({ account });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to connect Deriv token' });
  }
});

router.get('/deriv/accounts', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'owner' || req.user!.role === 'admin') {
    res.json({ accounts: [] });
    return;
  }
  const sync = req.query.sync === '1';
  const rows = await query<any>(
    `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
            last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            status, scopes, updated_at
     FROM connected_accounts WHERE user_id = $1 ORDER BY id ASC`,
    [req.user!.id]
  );

  if (sync) {
    let anyUpdated = false;
    for (const acc of rows) {
      // Never overwrite admin-locked balances during user-triggered ?sync=1
      if (acc.status !== 'active' || acc.balance_locked_by_admin) continue;

      const auth = await queryOne<{ encrypted_token: string; token_iv: string; token_auth_tag: string }>(
        'SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE connected_account_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',
        [acc.id]
      );
      if (!auth) continue;
      try {
        const rawTok = decryptToken(auth.encrypted_token, auth.token_iv, auth.token_auth_tag);
        if (rawTok.startsWith('ory_at_')) {
          const listResp = await derivRestRequest<any>('/trading/v1/options/accounts', rawTok);
          const list = listResp.data || listResp.accounts || [];
          const found = list.find((item: any) => String(item.account_id) === acc.deriv_login_id);
          if (found) {
            const liveBal = Number(found.balance);
            acc.balance = liveBal;
            acc.last_known_balance = liveBal;
            anyUpdated = true;
            await execute(
              'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(balance_locked_by_admin, FALSE) = FALSE',
              [liveBal, acc.id]
            );
          }
        } else {
          const balResp = await derivWs.requestWithToken(rawTok, { balance: 1 }, 4000);
          if (balResp?.balance?.balance !== undefined) {
            const liveBal = Number(balResp.balance.balance);
            acc.balance = liveBal;
            acc.last_known_balance = liveBal;
            anyUpdated = true;
            await execute(
              'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(balance_locked_by_admin, FALSE) = FALSE',
              [liveBal, acc.id]
            );
          }
        }
      } catch {
        // keep cached balance
      }
    }
    if (anyUpdated) {
      await syncRealDerivWalletForUser(req.user!.id);
      invalidateAuthUserCache(req.user!.id);
    }
  }

  res.json({ accounts: rows });
});

router.post('/deriv/accounts/:id/sync', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const accId = Number(req.params.id);
  const acc = await queryOne<{ id: number; balance_locked_by_admin: boolean }>(
    'SELECT id, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE id = $1 AND user_id = $2',
    [accId, req.user!.id]
  );
  if (!acc) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  // Preserve DB balance when locked by Admin
  if (!acc.balance_locked_by_admin) {
    const auth = await queryOne<{ encrypted_token: string; token_iv: string; token_auth_tag: string }>(
      'SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE connected_account_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',
      [acc.id]
    );
    if (auth) {
      try {
        const rawTok = decryptToken(auth.encrypted_token, auth.token_iv, auth.token_auth_tag);
        const balResp = await derivWs.requestWithToken(rawTok, { balance: 1 }, 4500);
        if (balResp?.balance?.balance !== undefined) {
          const b = Number(balResp.balance.balance);
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(balance_locked_by_admin, FALSE) = FALSE',
            [b, acc.id]
          );
          await syncRealDerivWalletForUser(req.user!.id);
          invalidateAuthUserCache(req.user!.id);
        }
      } catch {
        // keep existing
      }
    }
  }

  const updated = await queryOne(
    `SELECT id, deriv_login_id, deriv_account_id, account_type, platform, currency, is_virtual,
            last_known_balance as balance, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin,
            status, scopes, updated_at
     FROM connected_accounts WHERE id = $1`,
    [acc.id]
  );
  res.json({ account: updated });
});

router.post('/deriv/accounts/:id/disconnect', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const accId = Number(req.params.id);
  await execute("UPDATE connected_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = $1 AND user_id = $2", [
    accId,
    req.user!.id,
  ]);
  await logSecurityEvent(req.user!.id, 'deriv_account_disconnected', req.ip, { accountId: accId });
  res.json({ ok: true });
});

router.post('/deriv/accounts/:id/revoke', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const accId = Number(req.params.id);
  await execute("UPDATE connected_accounts SET status = 'revoked', updated_at = NOW() WHERE id = $1 AND user_id = $2", [
    accId,
    req.user!.id,
  ]);
  await execute('UPDATE account_authorizations SET revoked_at = NOW() WHERE connected_account_id = $1 AND user_id = $2', [
    accId,
    req.user!.id,
  ]);
  await logSecurityEvent(req.user!.id, 'deriv_token_revoked', req.ip, { accountId: accId });
  res.json({ ok: true });
});

router.get('/deriv/statement/:accountId', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const accId = Number(req.params.accountId);
  const acc = await queryOne<{ id: number }>(
    'SELECT id FROM connected_accounts WHERE id = $1 AND user_id = $2',
    [accId, req.user!.id]
  );
  if (!acc) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const auth = await queryOne<{ encrypted_token: string; token_iv: string; token_auth_tag: string }>(
    'SELECT encrypted_token, token_iv, token_auth_tag FROM account_authorizations WHERE connected_account_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1',
    [acc.id]
  );

  if (auth) {
    try {
      const rawTok = decryptToken(auth.encrypted_token, auth.token_iv, auth.token_auth_tag);
      if (!rawTok.startsWith('ory_at_')) {
        const stmt = await derivWs.requestWithToken(rawTok, { statement: 1, description: 1, limit: 50 }, 5000);
        if (stmt?.statement?.transactions) {
          res.json({ transactions: stmt.statement.transactions });
          return;
        }
      }
    } catch {
      // fallback to local ledger
    }
  }

  const localOrders = await query(
    'SELECT id as transaction_id, symbol, side, stake as amount, pnl, status, opened_at as transaction_time FROM virtual_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 50',
    [req.user!.id]
  );
  res.json({ transactions: localOrders });
});

router.get('/deriv/contracts-for', async (req, res) => {
  const symbol = String(req.query.symbol || '1HZ100V');
  const currency = String(req.query.currency || 'USD');
  try {
    const resp = await derivWs.getContractsFor(symbol, currency);
    const available = resp?.contracts_for?.available || [];
    res.json({
      symbol,
      currency,
      source: 'deriv_ws',
      available,
    });
  } catch (err) {
    res.status(503).json({
      symbol,
      currency,
      source: 'unavailable',
      available: [],
      error: err instanceof Error ? err.message : 'Unable to fetch contracts_for from Deriv',
    });
  }
});

router.post('/deriv/proposal', requireDb, requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const symbol = String(b.symbol || '1HZ100V');
    const contractType = String(b.contractType || 'MULTUP').toUpperCase();
    const amount = Number(b.amount || b.stake || 10);
    const currency = String(b.currency || 'USD');
    const connectedAccountId = b.connectedAccountId ? Number(b.connectedAccountId) : null;

    let token: string | null = null;
    if (connectedAccountId) {
      const creds = await getDecryptedAccountToken(connectedAccountId, req.user!.id);
      if (creds) token = creds.token;
    }

    const payload: Record<string, unknown> = {
      amount,
      basis: 'stake',
      contract_type: contractType,
      currency,
      symbol,
    };

    if (contractType === 'MULTUP' || contractType === 'MULTDOWN') {
      payload.multiplier = Number(b.multiplier || 100);
      const limitOrder: Record<string, number> = {};
      if (b.tpUsd && Number(b.tpUsd) >= 0.5) limitOrder.take_profit = Number(Number(b.tpUsd).toFixed(2));
      if (b.slUsd && Number(b.slUsd) >= 0.5 && Number(b.slUsd) < amount) {
        limitOrder.stop_loss = Number(Number(b.slUsd).toFixed(2));
      }
      if (Object.keys(limitOrder).length > 0) payload.limit_order = limitOrder;
    } else {
      payload.duration = Number(b.duration || 5);
      payload.duration_unit = String(b.durationUnit || 't');
      if (b.barrier !== undefined && b.barrier !== null && b.barrier !== '') {
        payload.barrier = String(b.barrier);
      }
    }

    const resp = await derivWs.getProposal(payload, token);
    res.json({
      source: 'deriv_ws',
      proposal: resp?.proposal || null,
    });
  } catch (err) {
    res.status(400).json({
      source: 'unavailable',
      proposal: null,
      error: err instanceof Error ? err.message : 'Unable to fetch live Deriv proposal',
    });
  }
});

export default router;
