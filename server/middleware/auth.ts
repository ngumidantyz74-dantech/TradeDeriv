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

export function signUserToken(user: { id: number; email: string; role: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const rawToken = header.startsWith('Bearer ') ? header.slice(7).trim() : queryToken;

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
  await requireAuth(req, res, () => {
    if (!req.user || !['admin', 'owner'].includes(req.user.role)) {
      res.status(403).json({ error: 'Owner or administrator privileges required' });
      return;
    }
    next();
  });
}
