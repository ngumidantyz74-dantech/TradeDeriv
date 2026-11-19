import crypto from 'node:crypto';
import type { Request } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const derivedFallbackSecret = crypto
  .createHash('sha256')
  .update(process.env.APP_URL || process.env.FRONTEND_URL || process.cwd() || 'tradederiv-dev-secret')
  .digest('hex');

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv:
    process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
      ? 'production'
      : process.env.NODE_ENV || 'development',
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  frontendUrl: (process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  jwtSecret: process.env.JWT_SECRET || `td_jwt_${derivedFallbackSecret}`,
  botGateJwtSecret: process.env.BOT_GATE_JWT_SECRET || `td_bot_${derivedFallbackSecret}`,
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || derivedFallbackSecret,
  adminPrivateSlug: (process.env.ADMIN_PRIVATE_SLUG || 'pf-ops-9482').replace(/^\/+/, ''),

  derivAppId: (process.env.DERIV_APP_ID || process.env.VITE_DERIV_APP_ID || '1089').trim(),
  derivClientSecret: (process.env.DERIV_CLIENT_SECRET || '').trim(),
  derivOAuthUrl: (process.env.DERIV_OAUTH_URL || 'https://auth.deriv.com/oauth2/auth').trim(),
  derivLegacyOAuthUrl: 'https://oauth.deriv.com/oauth2/authorize',
  derivTokenUrl: 'https://auth.deriv.com/oauth2/token',
  derivApiBase: 'https://api.derivws.com',
  derivOAuthRedirectUri: (process.env.DERIV_OAUTH_REDIRECT_URI || '').trim().replace(/\/+$/, ''),
  derivOAuthScopes: (process.env.DERIV_OAUTH_SCOPES || 'trade account_manage').trim(),
  derivWsUrl: (process.env.DERIV_WS_URL || 'wss://red.derivws.com/websockets/v3').trim(),
  derivWsClusters: [
    'wss://red.derivws.com/websockets/v3',
    'wss://ws.derivws.com/websockets/v3',
    'wss://green.derivws.com/websockets/v3',
    'wss://blue.derivws.com/websockets/v3',
    'wss://ws.binaryws.com/websockets/v3',
  ],

  brevoApiKey: process.env.BREVO_API_KEY || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || 'noreply@tradederiv.app',
  brevoSenderName: process.env.BREVO_SENDER_NAME || 'TradeDeriv',
};

function isLocalUrl(url: string): boolean {
  return !url || url.includes('localhost') || url.includes('127.0.0.1') || url.includes('MY_APP_URL');
}

export function resolvePublicOrigin(req?: Request): string {
  const envOrigin = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
  if (envOrigin && !isLocalUrl(envOrigin)) {
    return envOrigin.replace(/\/+$/, '');
  }
  if (req) {
    const protoHeader = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const hostHeader = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (hostHeader) {
      return `${protoHeader}://${hostHeader}`.replace(/\/+$/, '');
    }
  }
  return config.frontendUrl;
}

export function getDerivRedirectUri(req?: Request, explicitOrigin?: string): string {
  if (config.derivOAuthRedirectUri && !isLocalUrl(config.derivOAuthRedirectUri)) {
    return config.derivOAuthRedirectUri.replace(/\/+$/, '');
  }
  if (explicitOrigin && !isLocalUrl(explicitOrigin)) {
    return `${explicitOrigin.replace(/\/+$/, '')}/api/deriv/oauth/callback`;
  }
  return `${resolvePublicOrigin(req).replace(/\/+$/, '')}/api/deriv/oauth/callback`;
}
