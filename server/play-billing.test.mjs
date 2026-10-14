import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { createStore, hashToken } from './store.js';
import { mapPlaySubscription, resetPlayTokenCache } from './play-billing.js';

const realFetch = globalThis.fetch;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({
  client_email: 'play@test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
});
const future = () => new Date(Date.now() + 7 * 864e5).toISOString();
const past = () => new Date(Date.now() - 864e5).toISOString();

async function setup({ configured = true, play, seedAlice } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-play-'));
  const storePath = path.join(dir, 'users.json');
  process.env.NODE_ENV = 'test';
  process.env.HOPEWICK_DEV = '1';
  if (configured) process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = SA;
  else delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  resetPlayTokenCache();
  const seed = createStore(storePath);
  const mk = (email, token) => {
    const u = seed.createUser(email);
    u.session = { hash: hashToken(token), expiresAt: Date.now() + 864e5, reauthAt: Date.now() };
    return seed.save(u);
  };
  const alice = mk('alice@example.com', 'sess-alice');
  if (seedAlice) { seedAlice(alice); seed.save(alice); }
  const bob = mk('bob@example.com', 'sess-bob');
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET', auth: (opts.headers || {}).Authorization });
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    }
    if (u.includes('/purchases/subscriptionsv2/tokens/')) {
      const body = play.current();
      return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 });
    }
    if (u.endsWith(':acknowledge')) return new Response('', { status: 200 });
    throw new Error(`unexpected fetch ${u}`);
  };
  const server = await startServer({ port: 0, storePath });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (p, { method = 'GET', sess, body } = {}) => realFetch(base + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, sess ? { Cookie: `hopewick_session=${sess}` } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const close = () => new Promise((r) => server.close(r)).then(() => { globalThis.fetch = realFetch; });
  return { req, calls, close, alice, bob, storePath };
}

function sub(state, { expiry = future(), ack = 'ACKNOWLEDGEMENT_STATE_PENDING', productId = 'hopewick_plus_monthly', offerId } = {}) {
  return {
    subscriptionState: state,
    acknowledgementState: ack,
    lineItems: [{ productId, expiryTime: expiry, offerDetails: { basePlanId: 'monthly', offerId } }],
  };
}

test('mapPlaySubscription maps states', () => {
  assert.equal(mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE')).status, 'active');
  assert.equal(mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE', { offerId: 'free-trial-7d' })).status, 'trialing');
  const c = mapPlaySubscription(sub('SUBSCRIPTION_STATE_CANCELED'));
  assert.equal(c.status, 'active'); assert.equal(c.cancelAtPeriodEnd, true);
  assert.equal(mapPlaySubscription(sub('SUBSCRIPTION_STATE_EXPIRED', { expiry: past() })).status, 'canceled');
  assert.equal(mapPlaySubscription(sub('SUBSCRIPTION_STATE_ON_HOLD')).status, 'unpaid');
  assert.equal(mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE', { productId: 'other' })).matchesProduct, false);
});

test('verify endpoint is inert without service account', async () => {
  const t = await setup({ configured: false, play: { current: () => null } });
  try {
    const cfg = await (await t.req('/api/billing/config')).json();
    assert.equal(cfg.playBillingReady, false);
    const r = await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-alice', body: { purchaseToken: 'tok' } });
    assert.equal(r.status, 503);
    assert.equal(t.calls.length, 0);
  } finally { await t.close(); }
});

test('verify grants Plus, acknowledges, stores token, blocks reuse', async () => {
  let current = sub('SUBSCRIPTION_STATE_ACTIVE', { offerId: 'free-trial-7d' });
  const t = await setup({ play: { current: () => current } });
  try {
    assert.equal((await t.req('/api/billing/play/verify', { method: 'POST', body: { purchaseToken: 'tok' } })).status, 401);
    assert.equal((await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-alice', body: {} })).status, 400);
    assert.equal((await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-alice', body: { purchaseToken: 'tok', productId: 'x' } })).status, 400);
    const r = await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-alice', body: { purchaseToken: 'tok-1', productId: 'hopewick_plus_monthly' } });
    assert.equal(r.status, 200);
    const me = await r.json();
    assert.equal(me.plus, true);
    assert.equal(me.subscriptionStatus, 'trialing');
    assert.ok(t.calls.some((c) => c.url.includes('/purchases/subscriptionsv2/tokens/tok-1') && c.auth === 'Bearer ya29.test'));
    assert.ok(t.calls.some((c) => c.url.endsWith('/purchases/subscriptions/hopewick_plus_monthly/tokens/tok-1:acknowledge') && c.method === 'POST'));
    const saved = createStore(t.storePath).findById(t.alice.id);
    assert.equal(saved.playPurchaseToken, 'tok-1');
    assert.equal(saved.billingProvider, 'google_play');
    const acct = await (await t.req('/api/account', { sess: 'sess-alice' })).json();
    assert.equal(acct.billingProvider, 'google_play');
    assert.equal(acct.canManageBilling, false);
    assert.match(acct.playManageUrl, /play\.google\.com\/store\/account\/subscriptions/);
    const reuse = await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-bob', body: { purchaseToken: 'tok-1' } });
    assert.equal(reuse.status, 409);
  } finally { await t.close(); }
});

test('unknown token is rejected and no Plus is granted', async () => {
  const t = await setup({ play: { current: () => null } });
  try {
    const r = await t.req('/api/billing/play/verify', { method: 'POST', sess: 'sess-alice', body: { purchaseToken: 'bogus' } });
    assert.equal(r.status, 400);
    const me = await (await t.req('/api/auth/me', { sess: 'sess-alice' })).json();
    assert.equal(me.plus, false);
  } finally { await t.close(); }
});

test('session load re-checks an expired Play subscription', async () => {
  let current = sub('SUBSCRIPTION_STATE_EXPIRED', { expiry: past(), ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
  const t = await setup({
    play: { current: () => current },
    seedAlice: (u) => Object.assign(u, {
      billingProvider: 'google_play', playPurchaseToken: 'tok-2', subscriptionStatus: 'active',
      currentPeriodEnd: past(), playCheckedAt: past(),
    }),
  });
  try {
    const me = await (await t.req('/api/auth/me', { sess: 'sess-alice' })).json();
    assert.equal(me.plus, false);
    assert.equal(me.subscriptionStatus, 'canceled');
    assert.ok(t.calls.some((c) => c.url.includes('/subscriptionsv2/tokens/tok-2')));
    // Fresh and unexpired: no further Google calls.
    const n = t.calls.length;
    current = sub('SUBSCRIPTION_STATE_ACTIVE', { ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    await t.req('/api/auth/me', { sess: 'sess-alice' });
    assert.equal(t.calls.length, n + 1, 'still expired locally so it re-checks once more');
    const again = await (await t.req('/api/auth/me', { sess: 'sess-alice' })).json();
    assert.equal(again.plus, true);
    assert.equal(t.calls.length, n + 1, 'renewed and fresh: no re-check');
  } finally { await t.close(); }
});

test('Stripe user is not touched by Play re-check', async () => {
  const t = await setup({
    play: { current: () => null },
    seedAlice: (u) => Object.assign(u, { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active', currentPeriodEnd: past() }),
  });
  try {
    const me = await (await t.req('/api/auth/me', { sess: 'sess-alice' })).json();
    assert.equal(me.plus, true);
    assert.equal(t.calls.length, 0);
  } finally { await t.close(); }
});
