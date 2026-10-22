/**
 * One account, several devices: website cookie and app bearer token coexist.
 * Sign-out ends one device; password change/reset and deletion end all.
 * Run: node --test --test-concurrency=1 server/multi-session.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, hashToken, MAX_SESSIONS, addSession } from './store.js';

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'HOPEWICK_DATA_KEY'];
const NATIVE = { 'X-Hopewick-Client': 'native', Origin: 'https://localhost' };
const PW = 'a-long-multi-session-password-1';
const PW2 = 'another-long-password-for-reset-2';

async function listen(storePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-multi-'));
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test' });
  const { startServer } = await import('./index.js');
  const sp = storePath || path.join(dir, 'users.json');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: sp, chatsPath: path.join(dir, 'chats.json'), checkinsPath: path.join(dir, 'checkins.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`, storePath: sp,
    async close() {
      await new Promise((r) => server.close(r));
      for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
async function magic(base, email, password) {
  const d = await (await post(base, '/api/auth/magic-link', password ? { email, password } : { email })).json();
  const v = await fetch(d.devLink, { redirect: 'manual' });
  return (v.headers.get('set-cookie') || '').split(';')[0];
}
async function webAccount(base, email) {
  const cookie = await magic(base, email);
  assert.equal((await post(base, '/api/auth/password', { password: PW }, { cookie })).status, 200);
  return cookie;
}
async function nativeLogin(base, email, password = PW) {
  const r = await post(base, '/api/auth/login', { email, password }, NATIVE);
  assert.equal(r.status, 200);
  const t = (await r.json()).sessionToken;
  assert.match(t, /^[0-9a-f]{64}$/);
  return { ...NATIVE, Authorization: `Bearer ${t}` };
}
const me = async (base, headers) => (await (await fetch(base + '/api/auth/me', { headers })).json()).signedIn;

test('web cookie and app bearer sessions coexist; sign out of one leaves the other', async () => {
  const app = await listen();
  try {
    const cookie = await webAccount(app.base, 'two@example.com');
    const bearer = await nativeLogin(app.base, 'two@example.com');
    const cookie2 = (await (await post(app.base, '/api/auth/login', { email: 'two@example.com', password: PW })).headers.get('set-cookie')).split(';')[0];
    assert.equal(await me(app.base, { cookie }), true);
    assert.equal(await me(app.base, bearer), true);
    assert.equal(await me(app.base, { cookie: cookie2 }), true);
    const disk = JSON.parse(fs.readFileSync(app.storePath, 'utf8')).users[0];
    assert.equal(disk.sessions.length, 3);
    assert.ok(!('session' in disk) || disk.session === null);
    assert.equal((await post(app.base, '/api/auth/logout', {}, bearer)).status, 200);
    assert.equal(await me(app.base, bearer), false);
    assert.equal(await me(app.base, { cookie }), true);
    assert.equal(await me(app.base, { cookie: cookie2 }), true);
    assert.equal((await post(app.base, '/api/auth/logout', {}, { cookie })).status, 200);
    assert.equal(await me(app.base, { cookie }), false);
    assert.equal(await me(app.base, { cookie: cookie2 }), true);
  } finally { await app.close(); }
});

test('password change ends every session except the fresh one it issues', async () => {
  const app = await listen();
  try {
    const cookie = await webAccount(app.base, 'chg@example.com');
    const bearer = await nativeLogin(app.base, 'chg@example.com');
    const r = await post(app.base, '/api/auth/password', { currentPassword: PW, password: PW2, confirmPassword: PW2 }, { cookie });
    assert.equal(r.status, 200);
    const fresh = (r.headers.get('set-cookie') || '').split(';')[0];
    assert.equal(await me(app.base, bearer), false);
    assert.equal(await me(app.base, { cookie }), false);
    assert.equal(await me(app.base, { cookie: fresh }), true);
  } finally { await app.close(); }
});

test('password reset by email link ends both web and app sessions', async () => {
  const app = await listen();
  try {
    const cookie = await webAccount(app.base, 'reset@example.com');
    const bearer = await nativeLogin(app.base, 'reset@example.com');
    const viaLink = await magic(app.base, 'reset@example.com', PW2);
    assert.equal(await me(app.base, { cookie }), false);
    assert.equal(await me(app.base, bearer), false);
    assert.equal(await me(app.base, { cookie: viaLink }), true);
    assert.equal((await post(app.base, '/api/auth/login', { email: 'reset@example.com', password: PW })).status, 401);
  } finally { await app.close(); }
});

test('account deletion ends both sessions', async () => {
  const app = await listen();
  try {
    const cookie = await webAccount(app.base, 'del@example.com');
    const bearer = await nativeLogin(app.base, 'del@example.com');
    const r = await post(app.base, '/api/account/delete', { confirm: 'DELETE', currentPassword: PW }, bearer);
    assert.equal(r.status, 200);
    assert.equal(await me(app.base, { cookie }), false);
    assert.equal(await me(app.base, bearer), false);
  } finally { await app.close(); }
});

test('sessions are capped per account, oldest removed first; expired ones pruned', () => {
  const user = { id: 'u', sessions: [] };
  const t0 = Date.now();
  addSession(user, { hash: 'expired', createdAt: t0 - 10, expiresAt: t0 - 1 }, t0);
  for (let i = 0; i < MAX_SESSIONS + 3; i++) addSession(user, { hash: 'h' + i, createdAt: t0 + i, expiresAt: t0 + 1e9 }, t0);
  assert.equal(MAX_SESSIONS, 10);
  assert.equal(user.sessions.length, MAX_SESSIONS);
  assert.deepEqual(user.sessions.map((s) => s.hash), Array.from({ length: 10 }, (_, i) => 'h' + (i + 3)));
});

test('a legacy single session on disk keeps working and migrates without losing the user', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-legacy-'));
  const storePath = path.join(dir, 'users.json');
  const { sessionEpoch } = await import('./index.js');
  const legacyUser = { id: 'legacy1', email: 'legacy@example.com', createdAt: '2026-01-01T00:00:00.000Z', name: 'Keep Me', phone: '', passwordHash: null, subscriptionStatus: 'none',
    session: { hash: hashToken('legacy-token'), expiresAt: Date.now() + 864e5, reauthAt: Date.now(), epoch: sessionEpoch() } };
  fs.writeFileSync(storePath, JSON.stringify({ users: [legacyUser, { id: 'other', email: 'other@example.com', session: null }] }), { mode: 0o600 });
  const app = await listen(storePath);
  try {
    assert.equal(await me(app.base, { cookie: 'hopewick_session=legacy-token' }), true);
    const second = await magic(app.base, 'legacy@example.com');
    assert.equal(await me(app.base, { cookie: 'hopewick_session=legacy-token' }), true);
    assert.equal(await me(app.base, { cookie: second }), true);
    const disk = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(disk.users.length, 2);
    const u = disk.users.find((x) => x.id === 'legacy1');
    assert.equal(u.name, 'Keep Me');
    assert.equal(u.sessions.length, 2);
    assert.equal(createStore(storePath).findBySession('legacy-token').id, 'legacy1');
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
