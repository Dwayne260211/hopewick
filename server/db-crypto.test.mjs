// App-level encryption (server/db/crypto.js). Always runs; no database needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptText, decryptText, encryptionEnabled, isEncrypted, loadKeys, ENC_PREFIX } from './db/crypto.js';

const key = () => crypto.randomBytes(32).toString('base64');

test('no key: text is stored as-is and encryption is reported off', () => {
  const env = {};
  assert.equal(encryptionEnabled(env), false);
  assert.equal(encryptText('hello', env), 'hello');
  assert.equal(decryptText('hello', env), 'hello');
  assert.equal(encryptText(null, env), null);
});

test('round trip with a key; ciphertext hides the text and differs every time', () => {
  const env = { HOPEWICK_DATA_KEY: key() };
  const plain = 'Today was hard. I rang my sponsor 💙';
  const a = encryptText(plain, env, 'u1:journal_entries.body');
  const b = encryptText(plain, env, 'u1:journal_entries.body');
  assert.ok(a.startsWith(`${ENC_PREFIX}k1:`));
  assert.ok(isEncrypted(a));
  assert.notEqual(a, b);
  assert.ok(!a.includes('sponsor'));
  assert.equal(decryptText(a, env, 'u1:journal_entries.body'), plain);
});

test('ciphertext is bound to its user and field (AAD) and tampering is detected', () => {
  const env = { HOPEWICK_DATA_KEY: key() };
  const value = encryptText('secret plan', env, 'u1:safety_plans.warning_signs');
  assert.throws(() => decryptText(value, env, 'u2:safety_plans.warning_signs'));
  const raw = Buffer.from(value.split(':').pop(), 'base64');
  raw[raw.length - 1] ^= 1;
  const tampered = value.slice(0, value.lastIndexOf(':') + 1) + raw.toString('base64');
  assert.throws(() => decryptText(tampered, env, 'u1:safety_plans.warning_signs'));
});

test('key rotation: old values still decrypt via HOPEWICK_DATA_KEY_PREVIOUS', () => {
  const oldKey = key();
  const oldValue = encryptText('written last year', { HOPEWICK_DATA_KEY: oldKey, HOPEWICK_DATA_KEY_ID: 'k1' }, 'aad');
  const env = { HOPEWICK_DATA_KEY: key(), HOPEWICK_DATA_KEY_ID: 'k2', HOPEWICK_DATA_KEY_PREVIOUS: `k1:${oldKey}` };
  assert.equal(decryptText(oldValue, env, 'aad'), 'written last year');
  assert.ok(encryptText('new', env, 'aad').startsWith(`${ENC_PREFIX}k2:`));
  assert.throws(() => decryptText(oldValue, { HOPEWICK_DATA_KEY: key(), HOPEWICK_DATA_KEY_ID: 'k2' }, 'aad'), /No key loaded/);
});

test('bad keys are rejected with a clear message', () => {
  assert.throws(() => loadKeys({ HOPEWICK_DATA_KEY: 'c2hvcnQ=' }), /32 bytes/);
  assert.throws(() => loadKeys({ HOPEWICK_DATA_KEY: key(), HOPEWICK_DATA_KEY_ID: 'bad id!' }), /HOPEWICK_DATA_KEY_ID/);
  assert.throws(() => loadKeys({ HOPEWICK_DATA_KEY_PREVIOUS: 'nocolon' }), /id:base64key/);
});
