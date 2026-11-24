import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { queryOne, logAdminAction } from '../db.ts';
import {
  type AdminContext,
  loadAdminSecurityProfile,
  resolveVerifiedDevice,
  verifyActiveAdminSession,
  invalidateAdminSecurityCaches,
  logDeviceActivity,
} from '../rbac-device.ts';

export interface AuthUserPayload {
  id: number;
  email: string;
  role: string;
  jti?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
  adminCtx?: AdminContext;
}

export const ADMIN_SESSION_COOKIE = 'td_admin_session';

export function parseCookies(cookieHeader?: string): Record<string, string> {
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

export function isSecureTransport(req?: Request): boolean {
  if (config.nodeEnv === 'production') return true;
  if (!req) return false;
  if (req.secure) return true;
  const xfProto = String(req.get('x-forwarded-proto') || '').toLowerCase();
  return xfProto.includes('https');
}

export function getAdminCookieOptions(req?: Request) {
  const secure = isSecureTransport(req);
  return {
    httpOnly: true,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    secure,
    ...(secure ? { partitioned: true } : {}),
    path: '/',
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
  };
}

export function signUserToken(user: { id: number; email: string; role: string }, expiresIn: '7d' | '12h' = '7d'): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn }
  );
}

export function signAdminSessionToken(
  user: { id: number; email: string; role: string; jti: string },
  expiresIn: '12h' = '12h'
): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: user.jti },
    config.jwtSecret,
    { expiresIn }
  );
}

export function verifyJwtToken(token: string): AuthUserPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthUserPayload;
  } catch {
    return null;
  }
}

export function signAdminReauthToken(adminId: number): string {
  return jwt.sign(
    { id: adminId, scope: 'admin_reauth' },
    config.jwtSecret,
    { expiresIn: '10m' }
  );
}

export function verifyAdminReauthToken(token: string | undefined, expectedAdminId: number): boolean {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: number; scope?: string };
    return decoded.scope === 'admin_reauth' && decoded.id === expectedAdminId;
  } catch {
    return false;
  }
}

export function extractRawToken(req: Request, allowAdminCookie = false): { token: string; viaCookie: boolean } {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return { token: t, viaCookie: false };
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  if (queryToken) return { token: queryToken, viaCookie: false };
  if (allowAdminCookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[ADMIN_SESSION_COOKIE]) return { token: cookies[ADMIN_SESSION_COOKIE], viaCookie: true };
  }
  return { token: '', viaCookie: false };
}

function passesCsrfOriginCheck(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const expectedHost = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase();
  const origin = String(req.get('origin') || '').trim();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!expectedHost || originHost === expectedHost) return true;
      return false;
    } catch {
      return false;
    }
  }
  const xrw = String(req.get('x-requested-with') || '').toLowerCase();
  if (xrw === 'xmlhttprequest') return true;
  const referer = String(req.get('referer') || '').trim();
  if (referer && expectedHost) {
    try {
      return new URL(referer).host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }
  return false;
}

interface CachedAuthUser {
  id: number;
  email: string;
  role: string;
  status: string;
  locked_until: string | null;
  cachedAt: number;
}

const AUTH_CACHE_TTL_MS = 10_000;
const authUserCache = new Map<number, CachedAuthUser>();

export function invalidateAuthUserCache(userId?: number): void {
  if (userId !== undefined) {
    authUserCache.delete(userId);
    invalidateAdminSecurityCaches({ adminUserId: userId });
  } else {
    authUserCache.clear();
    invalidateAdminSecurityCaches();
  }
}

async function getAuthUserRecord(userId: number): Promise<CachedAuthUser | null> {
  const cached = authUserCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) {
    return cached;
  }
  const dbUser = await queryOne<{
    id: number;
    email: string;
    role: string;
    status: string;
    locked_until: string | null;
  }>('SELECT id, email, role, status, locked_until FROM users WHERE id = $1', [userId]);
  if (!dbUser) {
    authUserCache.delete(userId);
    return null;
  }
  const entry: CachedAuthUser = { ...dbUser, cachedAt: Date.now() };
  if (authUserCache.size > 1000) {
    authUserCache.clear();
  }
  authUserCache.set(userId, entry);
  return entry;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const { token: rawToken } = extractRawToken(req, false);

  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, config.jwtSecret) as AuthUserPayload;
    const dbUser = await getAuthUserRecord(decoded.id);

    if (!dbUser) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }
    if (dbUser.status === 'suspended' || dbUser.status === 'closed' || dbUser.status === 'deactivated') {
      res.status(403).json({ error: `Account is ${dbUser.status}` });
      return;
    }
    if (dbUser.locked_until && new Date(dbUser.locked_until).getTime() > Date.now()) {
      res.status(403).json({ error: 'Account is temporarily locked by security controls' });
      return;
    }

    req.user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const { token: rawToken, viaCookie } = extractRawToken(req, true);

  if (!rawToken) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  if (viaCookie && !passesCsrfOriginCheck(req)) {
    res.status(403).json({ error: 'Cross-site request validation failed for admin session' });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, config.jwtSecret) as AuthUserPayload;
    const profile = await loadAdminSecurityProfile(decoded.id);

    if (!profile) {
      res.status(401).json({ error: 'Admin account unavailable' });
      return;
    }
    if (profile.status !== 'active') {
      res.status(403).json({
        error: `Administrator account is ${profile.status}`,
        code: 'ADMIN_INACTIVE',
      });
      return;
    }
    if (profile.lockedUntil && new Date(profile.lockedUntil).getTime() > Date.now()) {
      res.status(403).json({ error: 'Admin account is temporarily locked' });
      return;
    }
    if (!['admin', 'owner'].includes(profile.role)) {
      res.status(403).json({ error: 'Owner or administrator privileges required' });
      return;
    }

    // Verify trackable session JTI (supports immediate session revocation)
    const sessionCheck = await verifyActiveAdminSession(decoded.jti, profile.userId);
    if (!sessionCheck.ok) {
      res.status(401).json({
        error: 'Administrator session revoked or expired. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
      return;
    }

    const devCheck = await resolveVerifiedDevice(req);
    const reqIp = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();

    if (!profile.isSuperAdmin) {
      // Delegated administrators MUST present a valid, verified, active assigned device credential
      if (!devCheck.ok || !devCheck.device) {
        logDeviceActivity({
          deviceId: devCheck.device?.id ?? null,
          adminUserId: profile.userId,
          eventType: 'blocked_unverified_device_request',
          ipAddress: reqIp,
          userAgent: String(req.headers['user-agent'] || ''),
          details: { reason: devCheck.reason, path: req.originalUrl },
        }).catch(() => {});
        logAdminAction(
          profile.userId,
          'blocked_unverified_device_request',
          'registered_devices',
          devCheck.device ? String(devCheck.device.id) : 'none',
          { reason: devCheck.reason, path: req.originalUrl },
          { ipAddress: reqIp, actionResult: 'denied', sessionJti: decoded.jti || '', actorRole: profile.adminRoleSlug }
        ).catch(() => {});
        res.status(403).json({
          error: 'Unauthorized or revoked device. Delegated administrators must access from a verified assigned device.',
          code: 'DEVICE_UNAUTHORIZED',
          reason: devCheck.reason,
        });
        return;
      }

      if (!profile.assignedDeviceIds.includes(devCheck.device.id)) {
        logDeviceActivity({
          deviceId: devCheck.device.id,
          adminUserId: profile.userId,
          eventType: 'blocked_unassigned_device_request',
          ipAddress: reqIp,
          userAgent: String(req.headers['user-agent'] || ''),
          details: { path: req.originalUrl },
        }).catch(() => {});
        logAdminAction(
          profile.userId,
          'blocked_unassigned_device_request',
          'registered_devices',
          String(devCheck.device.id),
          { deviceUid: devCheck.device.device_uid, path: req.originalUrl },
          { ipAddress: reqIp, actionResult: 'denied', deviceId: devCheck.device.id, sessionJti: decoded.jti || '', actorRole: profile.adminRoleSlug }
        ).catch(() => {});
        res.status(403).json({
          error: 'This device is not assigned to your administrator account.',
          code: 'DEVICE_NOT_ASSIGNED',
        });
        return;
      }

      if (sessionCheck.deviceId !== null && sessionCheck.deviceId !== devCheck.device.id) {
        res.status(403).json({
          error: 'Session token does not match the verified device credential.',
          code: 'DEVICE_SESSION_MISMATCH',
        });
        return;
      }
    }

    req.user = {
      id: profile.userId,
      email: profile.email,
      role: profile.role,
      jti: decoded.jti,
    };
    req.adminCtx = {
      userId: profile.userId,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      isSuperAdmin: profile.isSuperAdmin,
      adminRoleId: profile.adminRoleId,
      adminRoleName: profile.adminRoleName,
      adminRoleSlug: profile.adminRoleSlug,
      permissions: profile.permissions,
      deviceId: devCheck.ok && devCheck.device ? devCheck.device.id : null,
      deviceUid: devCheck.ok && devCheck.device ? devCheck.device.device_uid : null,
      deviceName: devCheck.ok && devCheck.device ? devCheck.device.device_name : null,
      assignedDeviceIds: profile.assignedDeviceIds,
      sessionJti: decoded.jti || '',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}
