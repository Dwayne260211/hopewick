// Optional app-level encryption for the most sensitive free text
// (journal entries, safety plans, check-in notes).
//
// Neon already encrypts all data at rest (AES-256) and in transit (TLS). This adds
// a second layer so a database dump, backup or branch copy alone does not reveal
// journal or safety-plan text: the key lives only in the app's environment.
//
//   HOPEWICK_DATA_KEY           base64 of 32 random bytes. Unset = store plain text.
//   HOPEWICK_DATA_KEY_ID        short label for the key (default "k1"), stored with each value.
//   HOPEWICK_DATA_KEY_PREVIOUS  "id:base64key" of the old key during a rotation (decrypt only).
//
// Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Value format:    hwenc:v1:<keyId>:<base64(iv[12] | tag[16] | ciphertext)>
import crypto from 'node:crypto';

export const ENC_PREFIX = 'hwenc:v1:';
export const ENC_SCHEME = 'aes-256-gcm-v1';

function decodeKey(b64, label) {
  const key = Buffer.from(String(b64 || '').trim(), 'base64');
  if (key.length !== 32) throw new Error(`${label} must be base64 of exactly 32 bytes.`);
  return key;
}

export function loadKeys(env = process.env) {
  const keys = new Map();
  let current = null;
  if (String(env.HOPEWICK_DATA_KEY || '').trim()) {
    const id = String(env.HOPEWICK_DATA_KEY_ID || 'k1').trim();
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new Error('HOPEWICK_DATA_KEY_ID must be 1-16 letters, digits, _ or -.');
    keys.set(id, decodeKey(env.HOPEWICK_DATA_KEY, 'HOPEWICK_DATA_KEY'));
    current = id;
  }
  const prev = String(env.HOPEWICK_DATA_KEY_PREVIOUS || '').trim();
  if (prev) {
    const i = prev.indexOf(':');
    if (i < 1) throw new Error('HOPEWICK_DATA_KEY_PREVIOUS must look like "id:base64key".');
    keys.set(prev.slice(0, i), decodeKey(prev.slice(i + 1), 'HOPEWICK_DATA_KEY_PREVIOUS'));
  }
  return { current, keys };
}

export function encryptionEnabled(env = process.env) {
  return Boolean(loadKeys(env).current);
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** Encrypt text with the current key. Returns the input unchanged when no key is set. */
export function encryptText(plain, env = process.env, aad = '') {
  if (plain == null) return plain;
  const { current, keys } = loadKeys(env);
  if (!current) return String(plain);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(current), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${current}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
}

/** Decrypt a value written by encryptText. Plain (legacy) text passes through. */
export function decryptText(value, env = process.env, aad = '') {
  if (!isEncrypted(value)) return value;
  const rest = value.slice(ENC_PREFIX.length);
  const i = rest.indexOf(':');
  const id = rest.slice(0, i);
  const { keys } = loadKeys(env);
  const key = keys.get(id);
  if (!key) throw new Error(`No key loaded for encrypted value (key id "${id}"). Set HOPEWICK_DATA_KEY or HOPEWICK_DATA_KEY_PREVIOUS.`);
  const raw = Buffer.from(rest.slice(i + 1), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
