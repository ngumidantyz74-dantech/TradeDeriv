import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { queryOne } from '../db.ts';

export interface AuthUserPayload {
  id: number;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
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

export function getAdminCookieOptions() {
  const isProd = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
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

function extractRawToken(req: Request, allowAdminCookie = false): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  if (queryToken) return queryToken;
  if (allowAdminCookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[ADMIN_SESSION_COOKIE]) return cookies[ADMIN_SESSION_COOKIE];
  }
  return '';
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const rawToken = extractRawToken(req, false);

  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, config.jwtSecret) as AuthUserPayload;
    const dbUser = await queryOne<{ id: number; email: string; role: string; status: string }>(
      'SELECT id, email, role, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!dbUser) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }
    if (dbUser.status === 'suspended') {
      res.status(403).json({ error: 'Account is suspended' });
      return;
    }

    req.user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const rawToken = extractRawToken(req, true);

  if (!rawToken) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, config.jwtSecret) as AuthUserPayload;
    const dbUser = await queryOne<{ id: number; email: string; role: string; status: string }>(
      'SELECT id, email, role, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!dbUser || dbUser.status === 'suspended') {
      res.status(401).json({ error: 'Admin account unavailable' });
      return;
    }
    if (!['admin', 'owner'].includes(dbUser.role)) {
      res.status(403).json({ error: 'Owner or administrator privileges required' });
      return;
    }

    req.user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}
