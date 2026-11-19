import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { argon2idAsync } from '@noble/hashes/argon2.js';

const ARGON2_OPTS = {
  t: 3,
  m: 32768, // 32 MiB — balanced for Render starter containers & fast interactive auth
  p: 1,
  dkLen: 32,
};

export async function hashPasswordArgon2id(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await argon2idAsync(Buffer.from(password, 'utf8'), salt, ARGON2_OPTS);
  const saltB64 = Buffer.from(salt).toString('base64').replace(/=+$/, '');
  const hashB64 = Buffer.from(derived).toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${ARGON2_OPTS.m},t=${ARGON2_OPTS.t},p=${ARGON2_OPTS.p}$${saltB64}$${hashB64}`;
}

function decodeBase64Flexible(b64: string): Buffer {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

export async function verifyPasswordHash(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash) {
    return { valid: false, needsRehash: false };
  }

  if (storedHash.startsWith('$argon2id$')) {
    const parts = storedHash.split('$');
    // Expected: ["", "argon2id", "v=19", "m=...,t=...,p=...", "<salt>", "<hash>"]
    if (parts.length !== 6) {
      return { valid: false, needsRehash: false };
    }
    const paramPairs = Object.fromEntries(
      parts[3].split(',').map((kv) => {
        const [k, v] = kv.split('=');
        return [k, Number(v)];
      })
    );
    const salt = decodeBase64Flexible(parts[4]);
    const expected = decodeBase64Flexible(parts[5]);
    const derived = await argon2idAsync(Buffer.from(password, 'utf8'), salt, {
      m: paramPairs.m || ARGON2_OPTS.m,
      t: paramPairs.t || ARGON2_OPTS.t,
      p: paramPairs.p || ARGON2_OPTS.p,
      dkLen: expected.length || 32,
    });
    const derivedBuf = Buffer.from(derived);
    if (derivedBuf.length !== expected.length) {
      return { valid: false, needsRehash: false };
    }
    const valid = crypto.timingSafeEqual(derivedBuf, expected);
    return { valid, needsRehash: false };
  }

  // Legacy bcrypt hash compatibility ($2a$, $2b$, $2y$)
  try {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, needsRehash: valid };
  } catch {
    return { valid: false, needsRehash: false };
  }
}
