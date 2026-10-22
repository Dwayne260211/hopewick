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
  assert.equal(store.has('hopewick.native.session'), false, 'token is not kept in localStorage');
  await ctx.fetch('/api/auth/me');
  assert.equal(ctx.calls[1].opts.headers.get('Authorization'), `Bearer ${'a'.repeat(64)}`);
  await ctx.fetch('/api/auth/logout', { method: 'POST' });
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

function secureStore(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    m,
    get: async ({ key }) => { if (!m.has(key)) throw new Error('Item with given key does not exist'); return { value: m.get(key) }; },
    set: async ({ key, value }) => { m.set(key, value); return { value: true }; },
    remove: async ({ key }) => { m.delete(key); return { value: true }; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('session token lives in secure storage and is removed on sign-out', async () => {
  const SS = secureStore();
  const { ctx } = sandbox({ isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { SecureStoragePlugin: SS } });
  await ctx.fetch('/api/auth/login', { method: 'POST' });
  await tick();
  assert.equal(SS.m.get('hopewick.native.session'), 'a'.repeat(64));
  await ctx.fetch('/api/auth/me');
  assert.equal(ctx.calls[1].opts.headers.get('Authorization'), `Bearer ${'a'.repeat(64)}`);
  await ctx.fetch('/api/auth/logout', { method: 'POST' });
  await tick();
  assert.equal(SS.m.has('hopewick.native.session'), false);
});

test('a phase 1 token in localStorage is moved into secure storage once', async () => {
  const SS = secureStore();
  const legacy = 'b'.repeat(64);
  const calls = [];
  const store = new Map([['hopewick.native.session', legacy]]);
  const ctx = {
    Headers, Response, Promise, JSON, setTimeout, navigator: { onLine: true },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { readyState: 'loading', documentElement: { classList: { add() {} } }, addEventListener() {}, getElementById: () => null },
    addEventListener() {},
    fetch: async (url, opts) => { calls.push({ url, opts }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); },
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { SecureStoragePlugin: SS } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  await ctx.fetch('/api/auth/me');
  assert.equal(calls[0].opts.headers.get('Authorization'), `Bearer ${legacy}`);
  assert.equal(SS.m.get('hopewick.native.session'), legacy);
  assert.equal(store.has('hopewick.native.session'), false);
});

function playSandbox(billing) {
  class FakePR { constructor(m) { this.web = true; this.m = m; } }
  const SS = secureStore();
  const ctx = {
    Headers, Response, Promise, JSON, setTimeout, navigator: { onLine: true }, PaymentRequest: FakePR,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { readyState: 'loading', documentElement: { classList: { add() {} } }, addEventListener() {}, getElementById: () => null },
    addEventListener() {},
    fetch: async () => new Response('{}', { status: 200 }),
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { SecureStoragePlugin: SS, HopewickBilling: billing } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, FakePR };
}
const PLAY = 'https://play.google.com/billing';
const playRequest = (ctx) => new ctx.PaymentRequest([{ supportedMethods: PLAY, data: { sku: 'hopewick_plus_monthly' } }], { total: { label: 'Total', amount: { currency: 'AUD', value: '0' } } });

test('Android: the TWA billing interface is backed by native Play Billing (same product)', async () => {
  const bought = [];
  const { ctx, FakePR } = playSandbox({
    listPurchases: async () => ({ purchases: [{ itemId: 'hopewick_plus_monthly', purchaseToken: 'tok-old' }] }),
    purchase: async ({ productId }) => { bought.push(productId); return { itemId: productId, purchaseToken: 'tok-new' }; },
  });
  assert.equal(ctx.HopewickNative.playBilling, true);
  const service = await ctx.getDigitalGoodsService(PLAY);
  const list = await service.listPurchases();
  assert.equal(list[0].purchaseToken, 'tok-old');
  await assert.rejects(ctx.getDigitalGoodsService('https://example.com/pay'));
  const res = await playRequest(ctx).show();
  assert.equal(res.details.purchaseToken, 'tok-new');
  assert.deepEqual(bought, ['hopewick_plus_monthly']);
  await res.complete('success');
  const other = new ctx.PaymentRequest([{ supportedMethods: 'basic-card' }], {});
  assert.ok(other instanceof FakePR, 'other payment methods are left to the browser');
});

test('Android: cancelling is an AbortError and an owned subscription is restored', async () => {
  const cancel = playSandbox({ listPurchases: async () => ({ purchases: [] }), purchase: async () => { throw Object.assign(new Error('cancelled'), { code: 'USER_CANCELED' }); } });
  await assert.rejects(playRequest(cancel.ctx).show(), (e) => e.name === 'AbortError');
  const owned = playSandbox({
    listPurchases: async () => ({ purchases: [{ itemId: 'hopewick_plus_monthly', purchaseToken: 'tok-owned' }] }),
    purchase: async () => { throw Object.assign(new Error('owned'), { code: 'ITEM_ALREADY_OWNED' }); },
  });
  const res = await playRequest(owned.ctx).show();
  assert.equal(res.details.purchaseToken, 'tok-owned');
});

test('iPhone: StoreKit is off, Play Billing is not installed and web checkout is hidden', () => {
  const { ctx } = sandbox({ isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} });
  assert.equal(ctx.HopewickNative.iosStoreKit.enabled, false);
  assert.equal(ctx.HopewickNative.playBilling, false);
  assert.equal(typeof ctx.getDigitalGoodsService, 'undefined');
  assert.match(SRC, /\.hw-native-ios \[data-web-billing\]\{display:none!important\}/);
});

test('web billing code still uses the same product id and verify endpoint', () => {
  const app = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.match(app, /productId: 'hopewick_plus_monthly'/);
  assert.match(app, /\/api\/billing\/play\/verify/);
  const java = fs.readFileSync(new URL('../native/android/app/src/main/java/com/bridgebite/hopewick/HopewickBillingPlugin.java', import.meta.url), 'utf8');
  assert.equal(/hopewick_plus_monthly|AUD|price/i.test(java.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, 'no product or price is hard-coded natively');
});
