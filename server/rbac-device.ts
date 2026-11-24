import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { config } from './config.ts';
import { query, queryOne, execute, logAdminAction } from './db.ts';
import { randomId } from './crypto.ts';

export const DEVICE_COOKIE_NAME = 'td_device_cred';
const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const ALL_PERMISSION_KEYS = [
  'dashboard.view',
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'users.search',
  'users.export',
  'clients.view',
  'clients.manage',
  'devices.view',
  'devices.manage',
  'transactions.view',
  'reports.view',
  'reports.export',
  'strategies.manage',
  'markets.manage',
  'engine.manage',
  'settings.manage',
  'audit_logs.view',
  'admins.manage',
  'roles.manage',
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export interface VerifiedDeviceRecord {
  id: number;
  device_uid: string;
  device_name: string;
  device_type: string;
  platform: string;
  verification_status: string;
  is_active: boolean;
  owner_admin_id: number | null;
  revoked_at: string | null;
}

export interface AdminSecurityProfile {
  userId: number;
  email: string;
  fullName: string;
  role: string;
  status: string;
  lockedUntil: string | null;
  isSuperAdmin: boolean;
  adminRoleId: number | null;
  adminRoleName: string;
  adminRoleSlug: string;
  permissions: string[];
  assignedDeviceIds: number[];
  cachedAt: number;
}

export interface AdminContext {
  userId: number;
  email: string;
  fullName: string;
  role: string;
  isSuperAdmin: boolean;
  adminRoleId: number | null;
  adminRoleName: string;
  adminRoleSlug: string;
  permissions: string[];
  deviceId: number | null;
  deviceUid: string | null;
  deviceName: string | null;
  assignedDeviceIds: number[];
  sessionJti: string;
}

export function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function getDeviceCookieOptions(req?: Request) {
  const secure =
    config.nodeEnv === 'production' ||
    Boolean(req?.secure) ||
    String(req?.get('x-forwarded-proto') || '').toLowerCase().includes('https');
  return {
    httpOnly: true,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    secure,
    ...(secure ? { partitioned: true } : {}),
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  };
}

function hmacSignDeviceData(payloadB64: string): string {
  return crypto.createHmac('sha256', `${config.jwtSecret}:device_cred_v1`).update(payloadB64).digest('base64url');
}

export function signDeviceCredentialToken(deviceUid: string, deviceSecret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ uid: deviceUid, sec: deviceSecret }), 'utf8').toString('base64url');
  const sig = hmacSignDeviceData(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function parseAndVerifyDeviceCredentialToken(rawToken: string): { uid: string; sec: string } | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const parts = rawToken.trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = hmacSignDeviceData(payloadB64);
  try {
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      sec?: string;
    };
    if (!decoded.uid || !decoded.sec) return null;
    return { uid: String(decoded.uid), sec: String(decoded.sec) };
  } catch {
    return null;
  }
}

export function extractRawDeviceCredential(req: Request): string {
  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies[DEVICE_COOKIE_NAME]) {
    return cookies[DEVICE_COOKIE_NAME];
  }
  const headerCred = req.headers['x-device-credential'];
  if (typeof headerCred === 'string' && headerCred.trim()) {
    return headerCred.trim();
  }
  return '';
}

// Brief short-lived caches with synchronous invalidation on any security mutation
const CACHE_TTL_MS = 5_000;
const adminProfileCache = new Map<number, AdminSecurityProfile>();
const deviceCacheByUid = new Map<string, { record: VerifiedDeviceRecord & { credential_hash: string | null }; cachedAt: number }>();
const sessionCacheByJti = new Map<
  string,
  { admin_user_id: number; device_id: number | null; status: string; expires_at: string; revoked_at: string | null; cachedAt: number }
>();

export function invalidateAdminSecurityCaches(opts?: {
  adminUserId?: number;
  deviceUid?: string;
  sessionJti?: string;
}): void {
  if (!opts) {
    adminProfileCache.clear();
    deviceCacheByUid.clear();
    sessionCacheByJti.clear();
    return;
  }
  if (opts.adminUserId !== undefined) {
    adminProfileCache.delete(opts.adminUserId);
    for (const [jti, sess] of sessionCacheByJti.entries()) {
      if (sess.admin_user_id === opts.adminUserId) sessionCacheByJti.delete(jti);
    }
  }
  if (opts.deviceUid) {
    deviceCacheByUid.delete(opts.deviceUid);
  } else if (opts.adminUserId === undefined && opts.sessionJti === undefined) {
    deviceCacheByUid.clear();
  }
  if (opts.sessionJti) {
    sessionCacheByJti.delete(opts.sessionJti);
  }
}

export function invalidateAllDeviceCaches(): void {
  deviceCacheByUid.clear();
  adminProfileCache.clear();
  sessionCacheByJti.clear();
}

export async function resolveVerifiedDevice(req: Request): Promise<{
  ok: boolean;
  device: VerifiedDeviceRecord | null;
  reason: string;
}> {
  const rawToken = extractRawDeviceCredential(req);
  if (!rawToken) {
    return { ok: false, device: null, reason: 'missing_device_credential' };
  }

  const parsed = parseAndVerifyDeviceCredentialToken(rawToken);
  if (!parsed) {
    return { ok: false, device: null, reason: 'invalid_device_signature' };
  }

  let row = deviceCacheByUid.get(parsed.uid);
  if (!row || Date.now() - row.cachedAt > CACHE_TTL_MS) {
    const dbDev = await queryOne<VerifiedDeviceRecord & { credential_hash: string | null }>(
      `SELECT id, device_uid, device_name, device_type, platform, credential_hash,
              verification_status, is_active, owner_admin_id, revoked_at
       FROM registered_devices
       WHERE device_uid = $1`,
      [parsed.uid]
    );
    if (!dbDev) {
      deviceCacheByUid.delete(parsed.uid);
      return { ok: false, device: null, reason: 'device_not_registered' };
    }
    row = { record: dbDev, cachedAt: Date.now() };
    if (deviceCacheByUid.size > 1000) deviceCacheByUid.clear();
    deviceCacheByUid.set(parsed.uid, row);
  }

  const dev = row.record;
  if (!dev.is_active || dev.revoked_at || dev.verification_status === 'revoked') {
    return { ok: false, device: dev, reason: 'device_revoked_or_inactive' };
  }
  if (dev.verification_status !== 'verified' || !dev.credential_hash) {
    return { ok: false, device: dev, reason: 'device_enrollment_incomplete' };
  }

  const presentedHash = sha256Hex(parsed.sec);
  if (!constantTimeHexEqual(presentedHash, dev.credential_hash)) {
    return { ok: false, device: null, reason: 'device_credential_mismatch' };
  }

  return { ok: true, device: dev, reason: 'verified' };
}

export async function loadAdminSecurityProfile(userId: number): Promise<AdminSecurityProfile | null> {
  const cached = adminProfileCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const userRow = await queryOne<{
    id: number;
    email: string;
    full_name: string;
    role: string;
    status: string;
    locked_until: string | null;
    admin_role_id: number | null;
    role_name: string | null;
    role_slug: string | null;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.locked_until, u.admin_role_id,
            ar.name as role_name, ar.slug as role_slug
     FROM users u
     LEFT JOIN admin_roles ar ON u.admin_role_id = ar.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!userRow || !['owner', 'admin'].includes(userRow.role)) {
    adminProfileCache.delete(userId);
    return null;
  }

  const isSuperAdmin = userRow.role === 'owner';
  let permissions: string[] = [];
  if (isSuperAdmin) {
    permissions = [...ALL_PERMISSION_KEYS];
  } else if (userRow.admin_role_id) {
    const permRows = await query<{ permission_key: string }>(
      `SELECT rp.permission_key
       FROM role_permissions rp
       JOIN admin_roles ar ON ar.id = rp.role_id
       WHERE rp.role_id = $1 AND ar.is_active = TRUE`,
      [userRow.admin_role_id]
    );
    permissions = permRows.map((p) => p.permission_key);
  }

  const devRows = await query<{ device_id: number }>(
    `SELECT ad.device_id
     FROM admin_devices ad
     JOIN registered_devices rd ON rd.id = ad.device_id
     WHERE ad.admin_user_id = $1
       AND ad.is_active = TRUE
       AND ad.revoked_at IS NULL
       AND rd.is_active = TRUE
       AND rd.revoked_at IS NULL`,
    [userId]
  );

  const profile: AdminSecurityProfile = {
    userId: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
    role: userRow.role,
    status: userRow.status,
    lockedUntil: userRow.locked_until,
    isSuperAdmin,
    adminRoleId: userRow.admin_role_id,
    adminRoleName: isSuperAdmin ? 'Super Admin' : userRow.role_name || 'Delegated Administrator',
    adminRoleSlug: isSuperAdmin ? 'super_admin' : userRow.role_slug || 'delegated_operator',
    permissions,
    assignedDeviceIds: devRows.map((d) => Number(d.device_id)),
    cachedAt: Date.now(),
  };

  if (adminProfileCache.size > 500) adminProfileCache.clear();
  adminProfileCache.set(userId, profile);
  return profile;
}

export async function verifyActiveAdminSession(
  jti: string | undefined,
  adminUserId: number
): Promise<{ ok: boolean; deviceId: number | null; reason: string }> {
  if (!jti) {
    return { ok: false, deviceId: null, reason: 'missing_session_jti' };
  }

  let cached = sessionCacheByJti.get(jti);
  if (!cached || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    const dbSess = await queryOne<{
      admin_user_id: number;
      device_id: number | null;
      status: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT admin_user_id, device_id, status, expires_at, revoked_at
       FROM admin_sessions
       WHERE session_jti = $1`,
      [jti]
    );
    if (!dbSess) {
      sessionCacheByJti.delete(jti);
      return { ok: false, deviceId: null, reason: 'session_not_found' };
    }
    cached = { ...dbSess, cachedAt: Date.now() };
    if (sessionCacheByJti.size > 1000) sessionCacheByJti.clear();
    sessionCacheByJti.set(jti, cached);
  }

  if (cached.admin_user_id !== adminUserId) {
    return { ok: false, deviceId: null, reason: 'session_owner_mismatch' };
  }
  if (cached.revoked_at || cached.status !== 'active') {
    return { ok: false, deviceId: null, reason: 'session_revoked' };
  }
  if (new Date(cached.expires_at).getTime() <= Date.now()) {
    return { ok: false, deviceId: null, reason: 'session_expired' };
  }

  return { ok: true, deviceId: cached.device_id, reason: 'active' };
}

export async function createAdminSessionRecord(params: {
  adminUserId: number;
  deviceId: number | null;
  ipAddress: string;
  userAgent: string;
  ttlHours?: number;
}): Promise<string> {
  const jti = `adm_${randomId(20)}`;
  const ttlHours = params.ttlHours ?? 12;
  await execute(
    `INSERT INTO admin_sessions (session_jti, admin_user_id, device_id, ip_address, user_agent, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW() + ($6 || ' hours')::interval)`,
    [jti, params.adminUserId, params.deviceId, params.ipAddress, params.userAgent.slice(0, 250), String(ttlHours)]
  );
  return jti;
}

export async function revokeAdminSessionByJti(
  jti: string,
  revokedByAdminId: number | null,
  reason = 'manual_revoke'
): Promise<void> {
  await execute(
    `UPDATE admin_sessions
     SET status = 'revoked', revoked_at = NOW(), revoked_by_admin_id = $2, revoke_reason = $3
     WHERE session_jti = $1 AND revoked_at IS NULL`,
    [jti, revokedByAdminId, reason]
  );
  invalidateAdminSecurityCaches({ sessionJti: jti });
}

export async function revokeAllSessionsForAdmin(
  adminUserId: number,
  revokedByAdminId: number | null,
  reason = 'admin_sessions_revoked',
  client?: PoolClient
): Promise<void> {
  const sql = `UPDATE admin_sessions
     SET status = 'revoked', revoked_at = NOW(), revoked_by_admin_id = $2, revoke_reason = $3
     WHERE admin_user_id = $1 AND revoked_at IS NULL`;
  if (client) {
    await client.query(sql, [adminUserId, revokedByAdminId, reason]);
  } else {
    await execute(sql, [adminUserId, revokedByAdminId, reason]);
  }
  invalidateAdminSecurityCaches({ adminUserId });
}

export async function revokeSessionsForDevice(
  deviceId: number,
  revokedByAdminId: number | null,
  reason = 'device_revoked_or_reassigned',
  onlyAdminUserId?: number,
  client?: PoolClient
): Promise<void> {
  const sql = onlyAdminUserId
    ? `UPDATE admin_sessions
       SET status = 'revoked', revoked_at = NOW(), revoked_by_admin_id = $2, revoke_reason = $3
       WHERE device_id = $1 AND admin_user_id = $4 AND revoked_at IS NULL`
    : `UPDATE admin_sessions
       SET status = 'revoked', revoked_at = NOW(), revoked_by_admin_id = $2, revoke_reason = $3
       WHERE device_id = $1 AND revoked_at IS NULL`;
  const params = onlyAdminUserId ? [deviceId, revokedByAdminId, reason, onlyAdminUserId] : [deviceId, revokedByAdminId, reason];
  if (client) {
    await client.query(sql, params);
  } else {
    await execute(sql, params);
  }
  invalidateAllDeviceCaches();
}

export async function logDeviceActivity(params: {
  deviceId: number | null;
  adminUserId?: number | null;
  actorAdminId?: number | null;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  client?: PoolClient;
}): Promise<void> {
  const sql = `INSERT INTO device_activity_logs
    (device_id, admin_user_id, actor_admin_id, event_type, ip_address, user_agent, details_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`;
  const args = [
    params.deviceId,
    params.adminUserId ?? null,
    params.actorAdminId ?? null,
    params.eventType,
    params.ipAddress || 'unknown',
    (params.userAgent || '').slice(0, 240),
    JSON.stringify(params.details || {}),
  ];
  if (params.client) {
    await params.client.query(sql, args);
  } else {
    await execute(sql, args);
  }
}

export function hasPermission(ctx: AdminContext | undefined, perm: PermissionKey): boolean {
  if (!ctx) return false;
  if (ctx.isSuperAdmin) return true;
  return ctx.permissions.includes(perm);
}

export function getAdminRequestContext(req: Request): AdminContext | undefined {
  return (req as Request & { adminCtx?: AdminContext }).adminCtx;
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const ctx = getAdminRequestContext(req);
  if (!ctx || !ctx.isSuperAdmin) {
    if (ctx) {
      logAdminAction(
        ctx.userId,
        'blocked_super_admin_operation',
        'system',
        req.originalUrl,
        { method: req.method, path: req.originalUrl, role: ctx.adminRoleSlug },
        {
          ipAddress: String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim(),
          actionResult: 'denied',
        }
      ).catch(() => {});
    }
    res.status(403).json({
      error: 'Super Admin authorization required for this operation.',
      code: 'SUPER_ADMIN_REQUIRED',
    });
    return;
  }
  next();
}

export function requirePermission(perm: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getAdminRequestContext(req);
    if (!ctx) {
      res.status(401).json({ error: 'Administrator context missing' });
      return;
    }
    if (hasPermission(ctx, perm)) {
      next();
      return;
    }
    logAdminAction(
      ctx.userId,
      'blocked_missing_permission',
      'rbac',
      perm,
      { requiredPermission: perm, path: req.originalUrl, role: ctx.adminRoleSlug },
      {
        ipAddress: String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim(),
        actionResult: 'denied',
      }
    ).catch(() => {});
    res.status(403).json({
      error: `Permission '${perm}' is required for this operation.`,
      code: 'PERMISSION_DENIED',
      requiredPermission: perm,
    });
  };
}

/**
 * Returns a parameterized SQL WHERE condition restricting trader rows (`userAlias`)
 * strictly to clients inside the administrator's verified device & client ownership scope.
 * Super Admin (`isSuperAdmin === true`) receives `u.role NOT IN ('owner', 'admin')`.
 */
export function buildScopedClientCondition(
  ctx: AdminContext,
  userAlias: string,
  params: unknown[]
): string {
  const base = `${userAlias}.role NOT IN ('owner', 'admin')`;
  if (ctx.isSuperAdmin) {
    return base;
  }
  params.push(ctx.userId);
  const pIdx = `$${params.length}`;
  return `(
    ${base}
    AND (
      EXISTS (
        SELECT 1
        FROM client_admin_assignments caa
        WHERE caa.user_id = ${userAlias}.id
          AND caa.admin_user_id = ${pIdx}
          AND caa.is_active = TRUE
          AND caa.revoked_at IS NULL
          AND (
            caa.device_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM admin_devices ad
              JOIN registered_devices rd ON rd.id = ad.device_id
              WHERE ad.admin_user_id = ${pIdx}
                AND ad.device_id = caa.device_id
                AND ad.is_active = TRUE
                AND ad.revoked_at IS NULL
                AND rd.is_active = TRUE
                AND rd.revoked_at IS NULL
            )
          )
      )
      OR (
        ${userAlias}.assigned_admin_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM client_device_assignments cda
          JOIN admin_devices ad ON ad.device_id = cda.device_id
          JOIN registered_devices rd ON rd.id = ad.device_id
          WHERE cda.user_id = ${userAlias}.id
            AND cda.is_active = TRUE
            AND cda.revoked_at IS NULL
            AND ad.admin_user_id = ${pIdx}
            AND ad.is_active = TRUE
            AND ad.revoked_at IS NULL
            AND rd.is_active = TRUE
            AND rd.revoked_at IS NULL
        )
      )
    )
  )`;
}

export async function canAdminAccessClient(ctx: AdminContext, targetUserId: number): Promise<boolean> {
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) return false;
  if (ctx.isSuperAdmin) {
    const row = await queryOne<{ id: number }>(
      `SELECT id FROM users WHERE id = $1 AND role NOT IN ('owner', 'admin')`,
      [targetUserId]
    );
    return Boolean(row);
  }
  const params: unknown[] = [targetUserId];
  const scopeWhere = buildScopedClientCondition(ctx, 'u', params);
  const row = await queryOne<{ id: number }>(
    `SELECT u.id FROM users u WHERE u.id = $1 AND ${scopeWhere} LIMIT 1`,
    params
  );
  return Boolean(row);
}

export async function assertAdminCanAccessClient(
  req: Request,
  res: Response,
  targetUserId: number,
  actionName: string
): Promise<boolean> {
  const ctx = getAdminRequestContext(req);
  if (!ctx) {
    res.status(401).json({ error: 'Administrator session missing' });
    return false;
  }
  const allowed = await canAdminAccessClient(ctx, targetUserId);
  if (allowed) return true;

  await logAdminAction(
    ctx.userId,
    `blocked_cross_scope_${actionName}`,
    'users',
    String(targetUserId),
    { targetUserId, path: req.originalUrl, deviceId: ctx.deviceId },
    {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim(),
      actionResult: 'denied',
    }
  ).catch(() => {});

  res.status(403).json({
    error: 'Access denied: client record lies outside your authorized device and ownership scope.',
    code: 'CLIENT_OUT_OF_SCOPE',
  });
  return false;
}

/**
 * Binds a newly registered or logging-in trader user to the verified device present on the request
 * (if any verified device credential exists and the user does not already have a locked device assignment).
 */
export async function bindClientToVerifiedRequestDevice(req: Request, userId: number, source = 'client_auth'): Promise<void> {
  const devCheck = await resolveVerifiedDevice(req);
  if (!devCheck.ok || !devCheck.device) return;
  const device = devCheck.device;

  const existingUser = await queryOne<{
    originating_device_id: number | null;
    assigned_admin_id: number | null;
  }>('SELECT originating_device_id, assigned_admin_id FROM users WHERE id = $1', [userId]);
  if (!existingUser) return;

  // Record active device link only if the client doesn't already have an active device binding
  const existingDeviceLink = await queryOne<{ id: number }>(
    'SELECT id FROM client_device_assignments WHERE user_id = $1 AND is_active = TRUE AND revoked_at IS NULL LIMIT 1',
    [userId]
  );

  if (!existingDeviceLink) {
    await execute(
      `INSERT INTO client_device_assignments (user_id, device_id, assignment_source, verification_status, is_active)
       VALUES ($1, $2, $3, 'verified', TRUE)
       ON CONFLICT (user_id, device_id) DO UPDATE SET
         is_active = TRUE, revoked_at = NULL, verification_status = 'verified', assigned_at = NOW()`,
      [userId, device.id, source]
    );
  }

  // Find currently assigned active admin on that verified device
  const assignedAdminRow = await queryOne<{ admin_user_id: number }>(
    `SELECT admin_user_id
     FROM admin_devices
     WHERE device_id = $1 AND is_active = TRUE AND revoked_at IS NULL
     ORDER BY assigned_at DESC LIMIT 1`,
    [device.id]
  );

  const nextOriginDeviceId = existingUser.originating_device_id || device.id;
  const nextAdminId = existingUser.assigned_admin_id || assignedAdminRow?.admin_user_id || null;

  await execute(
    `UPDATE users
     SET originating_device_id = COALESCE(originating_device_id, $1),
         assigned_admin_id = COALESCE(assigned_admin_id, $2),
         ownership_verification_status = 'verified',
         updated_at = NOW()
     WHERE id = $3`,
    [nextOriginDeviceId, nextAdminId, userId]
  );

  if (nextAdminId && !existingUser.assigned_admin_id) {
    await execute(
      `INSERT INTO client_admin_assignments (user_id, admin_user_id, device_id, verification_status, is_active)
       VALUES ($1, $2, $3, 'verified', TRUE)
       ON CONFLICT (user_id, admin_user_id) DO UPDATE SET
         device_id = EXCLUDED.device_id, is_active = TRUE, revoked_at = NULL, verification_status = 'verified', assigned_at = NOW()`,
      [userId, nextAdminId, device.id]
    );
  }

  await logDeviceActivity({
    deviceId: device.id,
    adminUserId: nextAdminId,
    eventType: 'client_connected_via_device',
    ipAddress: String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim(),
    userAgent: String(req.headers['user-agent'] || ''),
    details: { userId, source },
  });
}
