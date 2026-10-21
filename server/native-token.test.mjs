/**
 * Native app sessions: the Capacitor apps send X-Hopewick-Client: native and use a bearer
 * token. The website keeps the httpOnly cookie and never sees the token in a JSON body.
 * Run: node --test --test-concurrency=1 server/native-token.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'HOPEWICK_DATA_KEY'];

async function listen() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-native-'));
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test' });
  const { startServer } = await import('./index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((r) => server.close(r));
      for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function webAccount(base, email, password) {
  const data = await (await fetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).json();
  const v = await fetch(data.devLink, { redirect: 'manual' });
  const cookie = (v.headers.get('set-cookie') || '').split(';')[0];
  const set = await fetch(`${base}/api/auth/password`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(set.status, 200);
  return cookie;
}
const NATIVE = { 'X-Hopewick-Client': 'native', Origin: 'capacitor://localhost' };
const SECRET = 'a-long-native-test-password-1';

test('web login is unchanged: cookie only, no token in the body', async () => {
  const app = await listen();
  try {
    await webAccount(app.base, 'web@example.com', SECRET);
    const login = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'web@example.com', password: SECRET }) });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') || '', /HttpOnly/);
    const body = await login.json();
    assert.equal(body.signedIn, true);
    assert.equal('sessionToken' in body, false);
    assert.equal(login.headers.get('access-control-allow-origin'), null);
  } finally { await app.close(); }
});

test('native login returns a bearer token that signs in, refreshes and signs out', async () => {
  const app = await listen();
  try {
    await webAccount(app.base, 'phone@example.com', SECRET);
    const login = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { ...NATIVE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'phone@example.com', password: SECRET }) });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal(login.headers.get('access-control-allow-credentials'), null);
    const body = await login.json();
    assert.match(body.sessionToken, /^[a-f0-9]{64}$/);
    const auth = { ...NATIVE, Authorization: `Bearer ${body.sessionToken}` };

    const me = await fetch(`${app.base}/api/auth/me`, { headers: auth });
    const meBody = await me.json();
    assert.equal(meBody.signedIn, true);
    assert.equal(meBody.email, 'phone@example.com');
    assert.equal(me.headers.get('set-cookie'), null, 'bearer refresh sends no cookie');
    assert.equal('sessionToken' in meBody, false, 'token is only returned when a session is started');

    const out = await fetch(`${app.base}/api/auth/logout`, { method: 'POST', headers: auth });
    assert.equal(out.status, 200);
    const after = await (await fetch(`${app.base}/api/auth/me`, { headers: auth })).json();
    assert.equal(after.signedIn, false);
  } finally { await app.close(); }
});

test('bad or malformed bearer tokens are refused', async () => {
  const app = await listen();
  try {
    for (const h of ['Bearer nope', `Bearer ${'0'.repeat(64)}`, 'Basic abc', `Bearer ${'g'.repeat(64)}`]) {
      const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { ...NATIVE, Authorization: h } })).json();
      assert.equal(me.signedIn, false, h);
    }
  } finally { await app.close(); }
});

test('CORS preflight is answered for the app origins only', async () => {
  const app = await listen();
  try {
    for (const origin of ['https://localhost', 'capacitor://localhost']) {
      const pre = await fetch(`${app.base}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-hopewick-client' } });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get('access-control-allow-origin'), origin);
      assert.match(pre.headers.get('access-control-allow-headers') || '', /Authorization/);
    }
    const evil = await fetch(`${app.base}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    // A write from an app origin without the native header is still blocked.
    const blocked = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { Origin: 'capacitor://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', password: SECRET }) });
    assert.equal(blocked.status, 403);
    // Other sites are still blocked even if they send the native header.
    const other = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Hopewick-Client': 'native', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', password: SECRET }) });
    assert.equal(other.status, 403);
  } finally { await app.close(); }
});

test('a native bearer session can use account routes', async () => {
  const app = await listen();
  try {
    await webAccount(app.base, 'journal@example.com', SECRET);
    const { sessionToken } = await (await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { ...NATIVE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'journal@example.com', password: SECRET }) })).json();
    const res = await fetch(`${app.base}/api/chats`, { headers: { ...NATIVE, Authorization: `Bearer ${sessionToken}` } });
    assert.notEqual(res.status, 401);
    const anon = await fetch(`${app.base}/api/chats`, { headers: NATIVE });
    assert.equal(anon.status, 401);
  } finally { await app.close(); }
});
