/**
 * Password storage for Hopewick accounts.
 * Node's built-in scrypt is the KDF (no extra package, no plaintext).
 * Stored form: scrypt$N$r$p$saltHex$hashHex
 */
import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
/** Reject tampered hashes that would spend huge CPU or memory. Real hashes use the constants above. */
const SCRYPT_MAX_N = 131072;
const SCRYPT_MAX_R = 16;
const SCRYPT_MAX_P = 4;
const SCRYPT_MAX_KEYLEN = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function passwordError(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return 'Choose a password of at least 8 characters.';
  }
  if (password.length > PASSWORD_MAX) {
    return 'That password is too long. Keep it under 200 characters.';
  }
  return '';
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, {
      cost: SCRYPT_N,
      blockSize: SCRYPT_R,
      parallelization: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    }, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return Promise.resolve(false);
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch {
    return Promise.resolve(false);
  }
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return Promise.resolve(false);
  if (n < 2 || n > SCRYPT_MAX_N || r < 1 || r > SCRYPT_MAX_R || p < 1 || p > SCRYPT_MAX_P) {
    return Promise.resolve(false);
  }
  if (salt.length < 8 || salt.length > 64 || expected.length === 0 || expected.length > SCRYPT_MAX_KEYLEN) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    crypto.scrypt(password, salt, expected.length, {
      cost: n,
      blockSize: r,
      parallelization: p,
      maxmem: SCRYPT_MAXMEM,
    }, (err, key) => {
      if (err || !key || key.length !== expected.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}
