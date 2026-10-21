// The native helper (native/src/hw-native.js) must do nothing on the website and, in the app,
// send API calls to hopewick.com.au with the bearer token instead of the cookie.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../native/src/hw-native.js', import.meta.url), 'utf8');

function sandbox(cap) {
  const calls = [];
  const store = new Map();
  const listeners = {};
  const ctx = {
    calls,
    Headers,
    Response,
    Promise,
    JSON,
    navigator: { onLine: true },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { readyState: 'loading', documentElement: { classList: { add() {} } }, addEventListener() {}, getElementById: () => null },
    addEventListener: (n, f) => { listeners[n] = f; },
    setTimeout,
    fetch: async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify(url.includes('/api/auth/login') ? { signedIn: true, sessionToken: 'a'.repeat(64) } : { ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); },
  };
  if (cap) ctx.Capacitor = cap;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store };
}

test('website: the helper is a no-op without a native Capacitor platform', () => {
  const plain = sandbox(null);
  assert.equal(plain.ctx.HopewickNative, undefined);
  const webCap = sandbox({ isNativePlatform: () => false, Plugins: {} });
  assert.equal(webCap.ctx.HopewickNative, undefined);
});

test('app: API calls go to hopewick.com.au without cookies and carry the token after sign-in', async () => {
  const { ctx, store } = sandbox({ isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} });
  assert.equal(typeof ctx.HopewickNative, 'object');
  await ctx.fetch('/api/auth/login', { method: 'POST', credentials: 'include' });
  await new Promise((r) => setTimeout(r, 10));
  const first = ctx.calls[0];
  assert.equal(first.url, 'https://hopewick.com.au/api/auth/login');
  assert.equal(first.opts.credentials, 'omit');
  assert.equal(first.opts.headers.get('X-Hopewick-Client'), 'native');
  assert.equal(store.get('hopewick.native.session'), 'a'.repeat(64));
  await ctx.fetch('/api/auth/me');
  assert.equal(ctx.calls[1].opts.headers.get('Authorization'), `Bearer ${'a'.repeat(64)}`);
  await ctx.fetch('/api/auth/logout', { method: 'POST' });
  assert.equal(store.has('hopewick.native.session'), false);
  await ctx.fetch('/assets/x.css');
  assert.equal(ctx.calls[3].url, '/assets/x.css', 'non-API requests are untouched');
});

test('sign-in stubs explain that Google and Apple are coming', async () => {
  const { ctx } = sandbox({ isNativePlatform: () => true, Plugins: {} });
  await assert.rejects(ctx.HopewickNative.signInWithGoogle(), /coming/);
  await assert.rejects(ctx.HopewickNative.signInWithApple(), /coming/);
});

test('crisis numbers are tap-to-call in the app and the lock screen keeps them', () => {
  assert.match(SRC, /a\[href\^="tel:"\]/);
  assert.match(SRC, /href="tel:000"/);
  assert.match(SRC, /href="tel:131114"/);
  const app = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.match(app, /href="tel:000"/);
  assert.match(app, /href="tel:131114"/);
});

test('reminder is off by default and the website file is not changed by the native build', () => {
  assert.match(SRC, /reminderOn: false/);
  const app = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.equal(app.includes('hw-native.js'), false);
});
