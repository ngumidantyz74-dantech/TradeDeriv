import crypto from 'node:crypto';
import { config } from './config.ts';

function getAesKey(): Buffer {
  const raw = config.tokenEncryptionKey;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export interface EncryptedPayload {
  encryptedToken: string;
  iv: string;
  authTag: string;
}

export function encryptToken(plaintext: string): EncryptedPayload {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedToken: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptToken(encryptedToken: string, ivBase64: string, authTagBase64: string): string {
  const key = getAesKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedToken, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256Base64Url(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

export function randomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function maskClientId(id: string): string {
  if (!id || id.length <= 8) return id || '01a0....826c';
  return `${id.slice(0, 4)}....${id.slice(-4)}`;
}
