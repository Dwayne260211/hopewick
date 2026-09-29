import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { startServer, REPO_ROOT, SESSION_MS } from './index.js';
import { createStore, hashToken } from './store.js';

const realFetch = globalThis.fetch;

function stripeSignature(raw, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

async function listen(env, stripeCalls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-billing-'));
  const storePath = path.join(dir, 'users.json');
  const previous = {
    HOPEWICK_DEV: process.env.HOPEWICK_DEV,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    FOUNDER_PLUS_EMAILS: process.env.FOUNDER_PLUS_EMAILS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    HOPEWICK_FREE_DAILY: process.env.HOPEWICK_FREE_DAILY,
    HOPEWICK_PLUS_DAILY: process.env.HOPEWICK_PLUS_DAILY,
  };
  process.env.HOPEWICK_DEV = '1';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_placeholder';
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.FOUNDER_PLUS_EMAILS;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  delete process.env.HOPEWICK_FREE_DAILY;
  delete process.env.HOPEWICK_PLUS_DAILY;
  Object.assign(process.env, env);

  const openaiCalls = [];
  globalThis.fetch = async (url, opts) => {
    const target = String(url);
    if (target.startsWith('https://api.openai.com/') || target.endsWith('/chat/completions')) {
      const headers = opts && opts.headers ? opts.headers : {};
      openaiCalls.push({
        url: target,
        body: opts && opts.body ? String(opts.body) : '',
        authorization: headers.Authorization || headers.authorization || '',
      });
      const parsed = opts && opts.body ? JSON.parse(String(opts.body)) : {};
      if (parsed.stream) {
        const sse = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n';
        return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return jsonResponse({ choices: [{ message: { role: 'assistant', content: 'Hello from Hope' } }] });
    }
    if (target.startsWith('https://api.stripe.com/')) {
      stripeCalls.push({ url: target, body: opts && opts.body ? String(opts.body) : '', method: opts && opts.method });
      if (target.endsWith('/customers') && (!opts || opts.method === 'POST')) {
        return jsonResponse({ id: 'cus_test_123' });
      }
      if (target.includes('/customers/') && opts && opts.method === 'POST') {
        return jsonResponse({ id: 'cus_test_123' });
      }
      if (target.includes('/checkout/sessions')) {
        return jsonResponse({ id: 'cs_test_123', url: 'https://checkout.stripe.test/c/cs_test_123' });
      }
      if (target.includes('/billing_portal/sessions')) {
        return jsonResponse({ id: 'bps_test', url: 'https://billing.stripe.test/p/bps_test' });
      }
      if (target.includes('/payment_methods')) {
        return jsonResponse({
          object: 'list',
          data: [{
            id: 'pm_test',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2030,
              number: '4242424242424242',
              cvc: '999',
            },
          }],
        });
      }
      if (target.includes('/invoices')) {
        return jsonResponse({
          object: 'list',
          data: [{
            id: 'in_test',
            number: 'HW-0001',
            created: 1893456000,
            amount_paid: 2000,
            total: 2000,
            currency: 'aud',
            status: 'paid',
            hosted_invoice_url: 'https://invoice.stripe.com/i/test_invoice',
            invoice_pdf: 'https://pay.stripe.com/invoice/test_invoice/pdf',
            customer_email: 'hidden@example.com',
            number_full: '4242424242424242',
          }],
        });
      }
      if (target.includes('/subscriptions/') && opts && opts.method === 'DELETE') {
        return jsonResponse({ id: 'sub_live', status: 'canceled' });
      }
      if (target.includes('/subscriptions/') && opts && opts.method === 'POST') {
        const body = opts.body ? String(opts.body) : '';
        return jsonResponse({
          id: 'sub_live',
          customer: 'cus_from_webhook',
          status: 'active',
          cancel_at_period_end: body.includes('cancel_at_period_end'),
          current_period_end: 1893456000,
          metadata: {},
        });
      }
      if (target.includes('/subscriptions/')) {
        return jsonResponse({
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_end: 1893456000,
          metadata: {},
        });
      }
      return jsonResponse({ error: { message: 'unexpected stripe url ' + target } }, 404);
    }
    return realFetch(url, opts);
  };

  const server = await startServer({ port: 0, host: '127.0.0.1', storePath });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    openaiCalls,
    storePath,
    async close() {
      globalThis.fetch = realFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function signIn(base, email = 'alex@example.com') {
  const sent = await fetch(`${base}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await sent.json();
  assert.equal(sent.status, 200);
  assert.ok(data.devLink);
  const verified = await fetch(data.devLink, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  const cookie = verified.headers.get('set-cookie') || '';
  assert.match(cookie, /hopewick_session=/);
  const session = cookie.split(';')[0];
  return session;
}

test('magic link signs in and checkout requires that session', async () => {
  const stripeCalls = [];
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, stripeCalls);
  try {
    const bare = await fetch(`${app.base}/api/billing/checkout`, { method: 'POST' });
    assert.equal(bare.status, 401);

    const session = await signIn(app.base);
    const me = await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } });
    const user = await me.json();
    assert.equal(user.signedIn, true);
    assert.equal(user.email, 'alex@example.com');
    assert.equal(user.plus, false);
    assert.equal(user.hasPassword, false);

    const checkout = await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const sessionBody = await checkout.json();
    assert.equal(checkout.status, 200);
    assert.equal(sessionBody.url, 'https://checkout.stripe.test/c/cs_test_123');
    const checkoutCall = stripeCalls.find((call) => call.url.includes('/checkout/sessions'));
    assert.ok(checkoutCall);
    assert.match(checkoutCall.body, /mode=subscription/);
    assert.match(checkoutCall.body, /price_test_placeholder/);
    assert.match(checkoutCall.body, new RegExp(`metadata%5BuserId%5D=${user.id}|metadata\\[userId\\]=${user.id}`));
    assert.match(checkoutCall.body, /subscription_data%5Btrial_period_days%5D=3/);
    assert.match(checkoutCall.body, /payment_method_collection=always/);

    const config = await fetch(`${app.base}/api/billing/config`);
    const cfg = await config.json();
    assert.equal(cfg.publishableKey, 'pk_test_placeholder');
    assert.equal(cfg.checkoutReady, true);
    assert.equal(cfg.amountLabel, 'AU$20/month');
    assert.equal(cfg.trialDays, 3);
  } finally {
    await app.close();
  }
});

test('webhook marks the subscription active and then canceled', async () => {
  const stripeCalls = [];
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, stripeCalls);
  try {
    const session = await signIn(app.base, 'sam@example.com');
    const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();

    const trialPayload = JSON.stringify({
      id: 'evt_trial',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_live',
          customer: 'cus_from_webhook',
          status: 'trialing',
          current_period_end: 1893456000,
          metadata: { userId: me.id },
        },
      },
    });
    const trial = await fetch(`${app.base}/api/billing/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': stripeSignature(trialPayload, 'whsec_test_secret'),
      },
      body: trialPayload,
    });
    assert.equal(trial.status, 200);
    const duringTrial = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(duringTrial.subscriptionStatus, 'trialing');
    assert.equal(duringTrial.plus, true);

    const activePayload = JSON.stringify({
      id: 'evt_active',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_live',
          customer: 'cus_from_webhook',
          status: 'active',
          current_period_end: 1893456000,
          metadata: { userId: me.id },
        },
      },
    });
    const ok = await fetch(`${app.base}/api/billing/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': stripeSignature(activePayload, 'whsec_test_secret'),
      },
      body: activePayload,
    });
    assert.equal(ok.status, 200);
    const after = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(after.subscriptionStatus, 'active');
    assert.equal(after.plus, true);

    const bad = await fetch(`${app.base}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=nope' },
      body: activePayload,
    });
    assert.equal(bad.status, 400);

    const cancelPayload = JSON.stringify({
      id: 'evt_cancel',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_live',
          customer: 'cus_from_webhook',
          status: 'canceled',
          metadata: { userId: me.id },
        },
      },
    });
    const canceled = await fetch(`${app.base}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature(cancelPayload, 'whsec_test_secret') },
      body: cancelPayload,
    });
    assert.equal(canceled.status, 200);
    const done = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(done.subscriptionStatus, 'canceled');
    assert.equal(done.plus, false);

    stripeCalls.length = 0;
    const again = await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(again.status, 200);
    const againCall = stripeCalls.find((call) => call.url.includes('/checkout/sessions'));
    assert.ok(againCall);
    assert.doesNotMatch(againCall.body, /trial_period_days/);

    const portal = await fetch(`${app.base}/api/billing/portal`, {
      method: 'POST',
      headers: { cookie: session },
    });
    assert.equal(portal.status, 200);
    const portalBody = await portal.json();
    assert.match(portalBody.url, /billing\.stripe\.test/);
  } finally {
    await app.close();
  }
});

test('checkout session webhook activates the signed-in user', async () => {
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, []);
  try {
    const session = await signIn(app.base, 'jo@example.com');
    const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = JSON.stringify({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_test_123',
          subscription: 'sub_test_123',
          client_reference_id: me.id,
          metadata: { userId: me.id },
          mode: 'subscription',
        },
      },
    });
    const response = await fetch(`${app.base}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Stripe-Signature': stripeSignature(payload, 'whsec_test_secret') },
      body: payload,
    });
    assert.equal(response.status, 200);
    const after = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(after.plus, true);
    assert.equal(after.subscriptionStatus, 'active');
  } finally {
    await app.close();
  }
});

test('missing Stripe keys refuse checkout without inventing a session', async () => {
  const app = await listen({}, []);
  try {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    const session = await signIn(app.base, 'nope@example.com');
    const response = await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: session },
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error, /STRIPE_SECRET_KEY/);
  } finally {
    await app.close();
  }
});

function rawRequest(base, requestPath, headers) {
  const url = new URL(requestPath, base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('health check and www host redirect to the public origin', async () => {
  const app = await listen({ PUBLIC_BASE_URL: 'https://hopewick.com.au' }, []);
  try {
    const health = await rawRequest(app.base, '/api/health', { host: '127.0.0.1' });
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true });

    const redirected = await rawRequest(app.base, '/api/health?from=www', { host: 'www.hopewick.com.au' });
    assert.equal(redirected.status, 308);
    assert.equal(redirected.headers.location, 'https://hopewick.com.au/api/health?from=www');

    const apex = await rawRequest(app.base, '/api/health', { host: 'hopewick.com.au' });
    assert.equal(apex.status, 200);
  } finally {
    await app.close();
  }
});

test('founder email gets complimentary Plus and the organisations inbox does not', async () => {
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, []);
  try {
    const founder = await signIn(app.base, 'DwayneSimons1990@gmail.com');
    const founderMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: founder } })).json();
    assert.equal(founderMe.plus, true);
    assert.equal(founderMe.complimentary, true);
    assert.equal(founderMe.founder, true);
    assert.equal(founderMe.email, 'dwaynesimons1990@gmail.com');
    assert.equal(founderMe.subscriptionStatus, 'active');

    const clinic = await signIn(app.base, 'admin@bridge-bite-co.com');
    const clinicMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: clinic } })).json();
    assert.equal(clinicMe.plus, false);
    assert.equal(clinicMe.complimentary, false);
    assert.equal(clinicMe.founder, false);
  } finally {
    await app.close();
  }
});

test('FOUNDER_PLUS_EMAILS overrides the default and still ignores the organisations inbox', async () => {
  const app = await listen({
    FOUNDER_PLUS_EMAILS: 'patron@example.com, admin@bridge-bite-co.com',
  }, []);
  try {
    const patron = await signIn(app.base, 'patron@example.com');
    const patronMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: patron } })).json();
    assert.equal(patronMe.plus, true);
    assert.equal(patronMe.complimentary, true);
    assert.equal(patronMe.founder, true);

    const founder = await signIn(app.base, 'dwaynesimons1990@gmail.com');
    const founderMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: founder } })).json();
    assert.equal(founderMe.plus, false);
    assert.equal(founderMe.founder, false);

    const clinic = await signIn(app.base, 'admin@bridge-bite-co.com');
    const clinicMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: clinic } })).json();
    assert.equal(clinicMe.plus, false);
    assert.equal(clinicMe.founder, false);
  } finally {
    await app.close();
  }
});

test('free Hope defaults to 5 a day and a trial has no daily cap', async () => {
  const app = await listen({
    OPENAI_API_KEY: 'sk-test-hope-secret',
    HOPEWICK_PLUS_DAILY: '2',
  }, []);
  try {
    const config = await (await fetch(`${app.base}/api/billing/config`)).json();
    assert.equal(config.freeDailyMessages, 5);
    assert.equal(config.plusDailyMessages, null);

    const free = await signIn(app.base, 'five@example.com');
    const usage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: free } })).json();
    assert.equal(usage.plus, false);
    assert.equal(usage.limit, 5);
    assert.equal(usage.remaining, 5);
    assert.equal(usage.resetLabel, 'midnight, Brisbane time');
    assert.equal(usage.trialEligible, true);

    const trial = await signIn(app.base, 'trial@example.com');
    const set = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: trial, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'trialing' }),
    });
    assert.equal(set.status, 200);
    for (let i = 0; i < 3; i += 1) {
      const ok = await fetch(`${app.base}/api/hope/chat`, {
        method: 'POST',
        headers: { cookie: trial, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Trial message ${i}` }] }),
      });
      assert.equal(ok.status, 200);
    }
    const trialUsage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: trial } })).json();
    assert.equal(trialUsage.plus, true);
    assert.equal(trialUsage.limit, null);
    assert.equal(trialUsage.remaining, null);
    assert.equal(trialUsage.resetLabel, null);
    assert.equal(trialUsage.trialEligible, false);
    assert.equal(trialUsage.used, 3);
  } finally {
    await app.close();
  }
});

test('hosted Hope requires sign-in, hides the key, and enforces the free cap', async () => {
  const app = await listen({
    OPENAI_API_KEY: 'sk-test-hope-secret',
    HOPEWICK_FREE_DAILY: '1',
    HOPEWICK_PLUS_DAILY: '2',
  }, []);
  try {
    const anon = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello Hope' }] }),
    });
    assert.equal(anon.status, 401);
    assert.equal(app.openaiCalls.length, 0);

    const session = await signIn(app.base, 'free@example.com');
    const first = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are Hope.' },
          { role: 'user', content: 'A private note about my day that must not be stored' },
        ],
        stream: false,
        model: 'gpt-4o',
      }),
    });
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.choices[0].message.content, 'Hello from Hope');
    assert.equal(JSON.stringify(firstBody).includes('sk-test-hope-secret'), false);
    assert.equal(app.openaiCalls.length, 1);
    assert.equal(app.openaiCalls[0].authorization, 'Bearer sk-test-hope-secret');
    const sent = JSON.parse(app.openaiCalls[0].body);
    assert.equal(sent.model, 'gpt-4o-mini');
    assert.equal(sent.messages[1].content.includes('must not be stored'), true);

    const usage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: session } })).json();
    assert.equal(usage.used, 1);
    assert.equal(usage.limit, 1);
    assert.equal(usage.plus, false);
    assert.equal(usage.remaining, 0);

    const blocked = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'One more please' }] }),
    });
    assert.equal(blocked.status, 429);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error.code, 'daily_cap');
    assert.match(blockedBody.error.message, /You’ve used your 1 free Hope message for today/);
    assert.match(blockedBody.error.message, /midnight, Brisbane time/);
    assert.match(blockedBody.error.message, /no daily message limit/);
    assert.match(blockedBody.error.message, /Get help stay free/);
    assert.equal(blockedBody.limit, 1);
    assert.equal(blockedBody.used, 1);
    assert.equal(blockedBody.remaining, 0);
    assert.equal(blockedBody.resetLabel, 'midnight, Brisbane time');
    assert.equal(app.openaiCalls.length, 1);

    const crisis = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'I want to die' }] }),
    });
    const crisisBody = await crisis.json();
    assert.equal(crisis.status, 200);
    assert.match(crisisBody.choices[0].message.content, /000/);
    assert.match(crisisBody.choices[0].message.content, /13 11 14/);
    assert.equal(app.openaiCalls.length, 1);

    const stored = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(stored.includes('must not be stored'), false);
    assert.equal(stored.includes('sk-test-hope-secret'), false);
    assert.equal(stored.includes('I want to die'), false);

    const plusSession = await signIn(app.base, 'plus@example.com');
    await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: plusSession, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    for (let i = 0; i < 3; i += 1) {
      const ok = await fetch(`${app.base}/api/hope/chat`, {
        method: 'POST',
        headers: { cookie: plusSession, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Plus message ${i}` }], stream: true }),
      });
      assert.equal(ok.status, 200);
      const text = await ok.text();
      assert.match(text, /data:/);
      assert.match(ok.headers.get('content-type') || '', /event-stream/);
    }
    const plusUsage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: plusSession } })).json();
    assert.equal(plusUsage.plus, true);
    assert.equal(plusUsage.limit, null);
    assert.equal(plusUsage.remaining, null);
    assert.equal(plusUsage.resetLabel, null);
    assert.equal(plusUsage.trialEligible, false);
    assert.equal(plusUsage.used, 3);
  } finally {
    await app.close();
  }
});

test('complimentary founder has no daily cap and is not sent to Checkout', async () => {
  const stripeCalls = [];
  const app = await listen({
    OPENAI_API_KEY: 'sk-test-hope-secret',
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
    HOPEWICK_FREE_DAILY: '1',
    HOPEWICK_PLUS_DAILY: '2',
  }, stripeCalls);
  try {
    const founder = await signIn(app.base, 'dwaynesimons1990@gmail.com');
    const checkout = await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: founder, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(checkout.status, 409);
    assert.match((await checkout.json()).error, /No payment is needed/);
    assert.equal(stripeCalls.length, 0);

    for (let i = 0; i < 3; i += 1) {
      const ok = await fetch(`${app.base}/api/hope/chat`, {
        method: 'POST',
        headers: { cookie: founder, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Founder message ${i}` }] }),
      });
      assert.equal(ok.status, 200);
    }
    const usage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: founder } })).json();
    assert.equal(usage.plus, true);
    assert.equal(usage.complimentary, true);
    assert.equal(usage.limit, null);
    assert.equal(usage.remaining, null);
    assert.equal(usage.used, 3);

    const clinic = await signIn(app.base, 'admin@bridge-bite-co.com');
    const clinicUsage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: clinic } })).json();
    assert.equal(clinicUsage.plus, false);
    assert.equal(clinicUsage.limit, 1);
    const clinicCheckout = await fetch(`${app.base}/api/billing/checkout`, {
      method: 'POST',
      headers: { cookie: clinic, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(clinicCheckout.status, 200);
  } finally {
    await app.close();
  }
});

test('hosted Hope without a server key does not call the model', async () => {
  const app = await listen({}, []);
  try {
    const session = await signIn(app.base, 'nokey@example.com');
    const response = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error.message, /not connected/);
    assert.equal(app.openaiCalls.length, 0);
    const config = await (await fetch(`${app.base}/api/billing/config`)).json();
    assert.equal(config.hopeHosted, false);

    const crisis = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'I am not safe at home' }] }),
    });
    const crisisBody = await crisis.json();
    assert.equal(crisis.status, 200);
    assert.match(crisisBody.choices[0].message.content, /000/);
    assert.equal(app.openaiCalls.length, 0);
  } finally {
    await app.close();
  }
});

test('memory extraction does not spend a daily message', async () => {
  const app = await listen({
    OPENAI_API_KEY: 'sk-test-hope-secret',
    HOPEWICK_FREE_DAILY: '1',
  }, []);
  try {
    const session = await signIn(app.base, 'mem@example.com');
    const chat = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'I walk the dog when cravings hit' }] }),
    });
    assert.equal(chat.status, 200);
    const memory = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'memory',
        messages: [{ role: 'user', content: 'Already known:\n(none)\n\nLatest exchange:\nUser: I walk the dog' }],
      }),
    });
    assert.equal(memory.status, 200);
    const usage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: session } })).json();
    assert.equal(usage.used, 1);
    assert.equal(usage.remaining, 0);
  } finally {
    await app.close();
  }
});

test('developer settings flag follows the founder allowlist, not Plus or a typed name', async () => {
  const app = await listen({}, []);
  try {
    const guest = await (await fetch(`${app.base}/api/auth/me`)).json();
    assert.equal(guest.signedIn, false);
    assert.equal(guest.founder, false);
    assert.equal(guest.plus, false);

    const freeSession = await signIn(app.base, 'free@example.com');
    const freeMe = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: freeSession } })).json();
    assert.equal(freeMe.founder, false);
    assert.equal(freeMe.plus, false);

    const plusOn = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: freeSession, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    const plusMe = await plusOn.json();
    assert.equal(plusOn.status, 200);
    assert.equal(plusMe.plus, true);
    assert.equal(plusMe.founder, false);
    assert.equal(plusMe.complimentary, false);

    const founderSession = await signIn(app.base, 'dwaynesimons1990@gmail.com');
    const paidFounder = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: founderSession, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    const paidFounderMe = await paidFounder.json();
    assert.equal(paidFounderMe.plus, true);
    assert.equal(paidFounderMe.complimentary, false);
    assert.equal(paidFounderMe.founder, true);
  } finally {
    await app.close();
  }
});

test('developer toggle can mark Plus for local UI checks', async () => {
  const app = await listen({}, []);
  try {
    const session = await signIn(app.base, 'dev@example.com');
    const on = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(on.status, 200);
    assert.equal((await on.json()).plus, true);
    const off = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'canceled' }),
    });
    assert.equal((await off.json()).plus, false);
  } finally {
    await app.close();
  }
});

test('root favicon and apple touch icon return 200 without hiding app icons', async () => {
  const app = await listen({}, []);
  try {
    const fav = await fetch(`${app.base}/favicon.ico`);
    assert.equal(fav.status, 200);
    assert.match(fav.headers.get('content-type') || '', /image\/x-icon/);
    const favBody = Buffer.from(await fav.arrayBuffer());
    assert.equal(favBody.readUInt16LE(0), 0);
    assert.equal(favBody.readUInt16LE(2), 1);
    assert.ok(favBody.readUInt16LE(4) >= 1);

    const apple = await fetch(`${app.base}/apple-touch-icon.png`);
    assert.equal(apple.status, 200);
    assert.match(apple.headers.get('content-type') || '', /image\/png/);
    const appleBody = Buffer.from(await apple.arrayBuffer());
    assert.equal(appleBody.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const icon180 = fs.readFileSync(path.join(REPO_ROOT, 'app', 'icon-180.png'));
    assert.deepEqual(appleBody, icon180);

    for (const route of ['/app/manifest.webmanifest', '/app/icon-180.png', '/app/icon-192.png', '/app/icon-512.png']) {
      const res = await fetch(`${app.base}${route}`);
      assert.equal(res.status, 200, route);
    }

    const landing = await fetch(`${app.base}/`);
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
    assert.match(html, /<link rel="manifest" href="app\/manifest\.webmanifest">/);
    assert.match(html, /<link rel="apple-touch-icon" href="app\/icon-180\.png">/);
  } finally {
    await app.close();
  }
});

test('an expired session does not sign anyone in', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-session-'));
  try {
    const store = createStore(path.join(dir, 'users.json'));
    const user = store.createUser('old@example.com');
    user.session = { hash: hashToken('stale-token'), expiresAt: Date.now() - 1000 };
    store.save(user);
    assert.equal(store.findBySession('stale-token'), null);
    user.session = { hash: hashToken('fresh-token'), expiresAt: Date.now() + SESSION_MS };
    store.save(user);
    assert.equal(store.findBySession('fresh-token').email, 'old@example.com');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session cookie lasts until sign-out and refreshes on return', async () => {
  const app = await listen({}, []);
  try {
    const sent = await fetch(`${app.base}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'stay@example.com' }),
    });
    const data = await sent.json();
    assert.equal(sent.status, 200);
    const verified = await fetch(data.devLink, { redirect: 'manual' });
    const setCookie = verified.headers.get('set-cookie') || '';
    assert.equal(verified.status, 302);
    const maxAge = Math.floor(SESSION_MS / 1000);
    assert.ok(maxAge >= 180 * 24 * 60 * 60);
    assert.match(setCookie, /hopewick_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, new RegExp(`Max-Age=${maxAge}\\b`));
    const session = setCookie.split(';')[0];

    const before = JSON.parse(fs.readFileSync(app.storePath, 'utf8')).users[0].session.expiresAt;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const meRes = await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } });
    const refreshed = meRes.headers.get('set-cookie') || '';
    assert.match(refreshed, new RegExp(`Max-Age=${maxAge}\\b`));
    assert.match(refreshed, /HttpOnly/);
    assert.equal(refreshed.split(';')[0], session);
    const me = await meRes.json();
    assert.equal(me.signedIn, true);
    assert.equal(me.hasPassword, false);
    assert.equal(me.passwordHash, undefined);
    assert.equal(me.session, undefined);
    const after = JSON.parse(fs.readFileSync(app.storePath, 'utf8')).users[0].session.expiresAt;
    assert.ok(after > before);
    assert.ok(after - Date.now() > SESSION_MS - 60_000);

    const out = await fetch(`${app.base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: session },
    });
    assert.equal(out.status, 200);
    const cleared = out.headers.get('set-cookie') || '';
    assert.match(cleared, /Max-Age=0/);
    assert.match(cleared, /HttpOnly/);
    const gone = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(gone.signedIn, false);
    const disk = JSON.parse(fs.readFileSync(app.storePath, 'utf8'));
    assert.equal(disk.users[0].session, null);
  } finally {
    await app.close();
  }
});

test('set password, password login, magic link still works, and sign-out clears it', async () => {
  const app = await listen({}, []);
  const secret = 'harbour-light-42';
  try {
    const session = await signIn(app.base, 'pat@example.com');
    const before = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(before.hasPassword, false);

    const anon = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: secret }),
    });
    assert.equal(anon.status, 401);

    const weak = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'short' }),
    });
    assert.equal(weak.status, 400);

    const set = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: secret }),
    });
    assert.equal(set.status, 200);
    assert.equal((await set.json()).hasPassword, true);
    const disk = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(disk.includes(secret), false);
    assert.match(disk, /scrypt\$/);

    const still = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(still.signedIn, true);
    assert.equal(still.hasPassword, true);

    const out = await fetch(`${app.base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: session },
    });
    assert.match(out.headers.get('set-cookie') || '', /Max-Age=0/);
    const afterOut = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(afterOut.signedIn, false);

    const bad = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pat@example.com', password: 'not-the-password' }),
    });
    assert.equal(bad.status, 401);

    const login = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pat@example.com', password: secret }),
    });
    assert.equal(login.status, 200);
    const loginCookie = login.headers.get('set-cookie') || '';
    assert.match(loginCookie, /HttpOnly/);
    assert.match(loginCookie, /SameSite=Lax/);
    assert.match(loginCookie, new RegExp(`Max-Age=${Math.floor(SESSION_MS / 1000)}\\b`));
    const next = loginCookie.split(';')[0];
    const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: next } })).json();
    assert.equal(me.signedIn, true);
    assert.equal(me.email, 'pat@example.com');
    assert.equal(me.hasPassword, true);
    assert.equal(JSON.stringify(me).includes(secret), false);

    const again = await signIn(app.base, 'pat@example.com');
    const viaLink = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: again } })).json();
    assert.equal(viaLink.signedIn, true);
    assert.equal(viaLink.hasPassword, true);
    const replaced = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: next } })).json();
    assert.equal(replaced.signedIn, false);
    assert.equal(fs.readFileSync(app.storePath, 'utf8').includes(secret), false);

    const out2 = await fetch(`${app.base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: again },
    });
    assert.equal(out2.status, 200);
    const cleared = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: again } })).json();
    assert.equal(cleared.signedIn, false);

    const back = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Pat@Example.com', password: secret }),
    });
    assert.equal(back.status, 200);
    assert.equal((await back.json()).signedIn, true);
  } finally {
    await app.close();
  }
});

test('optional password on the first sign-in link is saved, and magic link still works', async () => {
  const app = await listen({}, []);
  const secret = 'first-light-88';
  try {
    const unknown = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: secret }),
    });
    assert.equal(unknown.status, 401);
    assert.equal(fs.existsSync(app.storePath) && fs.readFileSync(app.storePath, 'utf8').includes('new@example.com'), false);

    const weak = await fetch(`${app.base}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: 'short' }),
    });
    assert.equal(weak.status, 400);

    const sent = await fetch(`${app.base}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: secret }),
    });
    const data = await sent.json();
    assert.equal(sent.status, 200);
    assert.match(data.message, /password you chose/);
    const pendingDisk = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(pendingDisk.includes(secret), false);
    assert.match(pendingDisk, /scrypt\$/);

    const verified = await fetch(data.devLink, { redirect: 'manual' });
    assert.equal(verified.status, 302);
    const session = (verified.headers.get('set-cookie') || '').split(';')[0];
    const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(me.signedIn, true);
    assert.equal(me.hasPassword, true);
    assert.equal(fs.readFileSync(app.storePath, 'utf8').includes('pendingPassword": {'), false);

    await fetch(`${app.base}/api/auth/logout`, { method: 'POST', headers: { cookie: session } });
    const replay = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(replay.signedIn, false);

    const login = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: secret }),
    });
    assert.equal(login.status, 200);
    const loggedIn = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.match(login.headers.get('set-cookie') || '', /HttpOnly/);

    const linkOnly = await signIn(app.base, 'only-link@example.com');
    const missing = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'only-link@example.com', password: secret }),
    });
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).code, 'password_missing');
    const still = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: linkOnly } })).json();
    assert.equal(still.signedIn, true);
    assert.equal(still.hasPassword, false);

    const plain = await fetch(`${app.base}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    });
    const plainData = await plain.json();
    assert.equal(plain.status, 200);
    const plainVerify = await fetch(plainData.devLink, { redirect: 'manual' });
    const plainSession = (plainVerify.headers.get('set-cookie') || '').split(';')[0];
    const kept = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: plainSession } })).json();
    assert.equal(kept.signedIn, true);
    assert.equal(kept.hasPassword, true);
    const previous = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: loggedIn } })).json();
    assert.equal(previous.signedIn, false);

    await fetch(`${app.base}/api/auth/logout`, { method: 'POST', headers: { cookie: plainSession } });
    const after = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: plainSession } })).json();
    assert.equal(after.signedIn, false);
  } finally {
    await app.close();
  }
});

async function activateSubscription(base, session, userId, customer = 'cus_from_webhook') {
  const payload = JSON.stringify({
    id: 'evt_account_sub',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_live',
        customer,
        status: 'active',
        current_period_end: 1893456000,
        cancel_at_period_end: false,
        metadata: { userId },
      },
    },
  });
  const response = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSignature(payload, 'whsec_test_secret'),
    },
    body: payload,
  });
  assert.equal(response.status, 200);
}

test('account data stays on the signed-in user, and delete requires DELETE', async () => {
  const stripeCalls = [];
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, stripeCalls);
  try {
    const anon = await fetch(`${app.base}/api/account`);
    assert.equal(anon.status, 401);

    const sessionA = await signIn(app.base, 'alex@example.com');
    const sessionB = await signIn(app.base, 'sam@example.com');
    const meB = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: sessionB } })).json();

    const savedA = await fetch(`${app.base}/api/account/profile`, {
      method: 'POST',
      headers: { cookie: sessionA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex Hope', phone: '0400 111 222', email: 'sam@example.com', userId: meB.id }),
    });
    const bodyA = await savedA.json();
    assert.equal(savedA.status, 200);
    assert.equal(bodyA.email, 'alex@example.com');
    assert.equal(bodyA.name, 'Alex Hope');
    assert.equal(bodyA.phone, '0400 111 222');
    assert.equal(bodyA.emailChangeSupported, false);

    const savedB = await fetch(`${app.base}/api/account/profile`, {
      method: 'POST',
      headers: { cookie: sessionB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sam River', phone: '' }),
    });
    assert.equal(savedB.status, 200);

    const readA = await (await fetch(`${app.base}/api/account?userId=${meB.id}&email=sam@example.com`, { headers: { cookie: sessionA } })).json();
    assert.equal(readA.email, 'alex@example.com');
    assert.equal(readA.name, 'Alex Hope');
    const readB = await (await fetch(`${app.base}/api/account`, { headers: { cookie: sessionB } })).json();
    assert.equal(readB.email, 'sam@example.com');
    assert.equal(readB.name, 'Sam River');

    const badPhone = await fetch(`${app.base}/api/account/profile`, {
      method: 'POST',
      headers: { cookie: sessionA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex Hope', phone: '12' }),
    });
    assert.equal(badPhone.status, 400);

    const cardField = await fetch(`${app.base}/api/account/profile`, {
      method: 'POST',
      headers: { cookie: sessionA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex Hope', phone: '0400 111 222', cvc: '999', cardNumber: '4242424242424242' }),
    });
    assert.equal(cardField.status, 400);

    await activateSubscription(app.base, sessionB, meB.id, 'cus_sam');
    const invoicesA = await (await fetch(`${app.base}/api/account/invoices?customer=cus_sam`, { headers: { cookie: sessionA } })).json();
    assert.deepEqual(invoicesA.invoices, []);
    const cardA = await (await fetch(`${app.base}/api/account/payment-method`, { headers: { cookie: sessionA } })).json();
    assert.equal(cardA.card, null);

    const cardB = await (await fetch(`${app.base}/api/account/payment-method`, { headers: { cookie: sessionB } })).json();
    assert.equal(cardB.card.brand, 'visa');
    assert.equal(cardB.card.last4, '4242');
    assert.equal(cardB.card.expMonth, 12);
    assert.equal(cardB.card.expYear, 2030);
    assert.equal(JSON.stringify(cardB).includes('4242424242424242'), false);
    assert.equal(JSON.stringify(cardB).includes('999'), false);
    assert.equal(Object.hasOwn(cardB.card, 'cvc'), false);
    assert.equal(Object.hasOwn(cardB.card, 'number'), false);

    const invoicesB = await (await fetch(`${app.base}/api/account/invoices`, { headers: { cookie: sessionB } })).json();
    assert.equal(invoicesB.invoices.length, 1);
    assert.equal(invoicesB.invoices[0].status, 'paid');
    assert.equal(invoicesB.invoices[0].amount, 2000);
    assert.equal(invoicesB.invoices[0].hostedUrl, 'https://invoice.stripe.com/i/test_invoice');
    assert.equal(invoicesB.invoices[0].pdfUrl, 'https://pay.stripe.com/invoice/test_invoice/pdf');
    assert.equal(JSON.stringify(invoicesB).includes('4242424242424242'), false);
    assert.equal(JSON.stringify(invoicesB).includes('hidden@example.com'), false);

    const disk = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(disk.includes('4242424242424242'), false);
    assert.equal(disk.includes('"cvc"'), false);
    assert.equal(disk.includes('Alex Hope'), true);
    assert.equal(disk.includes('Sam River'), true);

    const unconfirmed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: sessionA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'delete', userId: meB.id }),
    });
    assert.equal(unconfirmed.status, 400);
    assert.equal((await unconfirmed.json()).code, 'confirm');
    const stillA = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: sessionA } })).json();
    assert.equal(stillA.signedIn, true);
    assert.equal(stillA.email, 'alex@example.com');

    stripeCalls.length = 0;
    const removed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: sessionA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE', userId: meB.id, email: 'sam@example.com' }),
    });
    const removedBody = await removed.json();
    assert.equal(removed.status, 200);
    assert.equal(removedBody.ok, true);
    assert.match(removed.headers.get('set-cookie') || '', /Max-Age=0/);
    const gone = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: sessionA } })).json();
    assert.equal(gone.signedIn, false);
    const stillB = await (await fetch(`${app.base}/api/account`, { headers: { cookie: sessionB } })).json();
    assert.equal(stillB.email, 'sam@example.com');
    assert.equal(stillB.name, 'Sam River');
    const afterDisk = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(afterDisk.includes('alex@example.com'), false);
    assert.equal(afterDisk.includes('sam@example.com'), true);
    assert.equal(afterDisk.includes('4242424242424242'), false);
    assert.equal(stripeCalls.some((call) => call.method === 'DELETE'), false);
  } finally {
    await app.close();
  }
});

test('password change requires the current password and never stores it', async () => {
  const app = await listen({}, []);
  const current = 'harbour-light-42';
  const next = 'river-light-99';
  try {
    const session = await signIn(app.base, 'pat@example.com');
    const created = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: current }),
    });
    assert.equal(created.status, 200);

    const missing = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: next, confirmPassword: next }),
    });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, 'current_password');

    const wrong = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'not-it', password: next, confirmPassword: next }),
    });
    assert.equal(wrong.status, 401);

    const mismatch = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, password: next, confirmPassword: 'other-password' }),
    });
    assert.equal(mismatch.status, 400);

    const changed = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, password: next, confirmPassword: next }),
    });
    assert.equal(changed.status, 200);
    const disk = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(disk.includes(current), false);
    assert.equal(disk.includes(next), false);
    assert.match(disk, /scrypt\$/);

    await fetch(`${app.base}/api/auth/logout`, { method: 'POST', headers: { cookie: session } });
    const oldLogin = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pat@example.com', password: current }),
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pat@example.com', password: next }),
    });
    assert.equal(newLogin.status, 200);

    const linkOnly = await signIn(app.base, 'only-link@example.com');
    const summary = await (await fetch(`${app.base}/api/account`, { headers: { cookie: linkOnly } })).json();
    assert.equal(summary.hasPassword, false);
    const create = await fetch(`${app.base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: linkOnly, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: next }),
    });
    assert.equal(create.status, 200);
    assert.equal((await create.json()).hasPassword, true);
  } finally {
    await app.close();
  }
});

test('cancel waits until period end, delete cancels a live subscription, and cards are not stored', async () => {
  const stripeCalls = [];
  const app = await listen({
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_PRICE_ID: 'price_test_placeholder',
  }, stripeCalls);
  try {
    const founder = await signIn(app.base, 'dwaynesimons1990@gmail.com');
    const founderAccount = await (await fetch(`${app.base}/api/account`, { headers: { cookie: founder } })).json();
    assert.equal(founderAccount.plan, 'Founder access');
    assert.equal(founderAccount.billingStatus, 'founder');
    assert.equal(founderAccount.plus, true);
    assert.equal(founderAccount.canUpgrade, false);
    assert.equal(founderAccount.canCancel, false);
    assert.equal(founderAccount.priceLabel, 'Included — no charge');
    const founderCard = await fetch(`${app.base}/api/account/setup-card`, {
      method: 'POST',
      headers: { cookie: founder, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(founderCard.status, 409);

    const session = await signIn(app.base, 'bill@example.com');
    const me = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    const noCancel = await fetch(`${app.base}/api/account/cancel`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(noCancel.status, 409);

    await activateSubscription(app.base, session, me.id);
    const unconfirmed = await fetch(`${app.base}/api/account/cancel`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmed.status, 400);

    stripeCalls.length = 0;
    const canceled = await fetch(`${app.base}/api/account/cancel`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, userId: 'someone-else' }),
    });
    const canceledBody = await canceled.json();
    assert.equal(canceled.status, 200);
    assert.equal(canceledBody.cancelAtPeriodEnd, true);
    assert.equal(canceledBody.billingStatus, 'active');
    assert.equal(canceledBody.canCancel, false);
    const cancelCall = stripeCalls.find((call) => call.method === 'POST' && call.url.includes('/subscriptions/sub_live'));
    assert.ok(cancelCall);
    assert.match(cancelCall.body, /cancel_at_period_end=true/);

    const setup = await fetch(`${app.base}/api/account/setup-card`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNumber: '4242424242424242', cvc: '123' }),
    });
    assert.equal(setup.status, 400);
    assert.equal(fs.readFileSync(app.storePath, 'utf8').includes('4242424242424242'), false);

    const portal = await fetch(`${app.base}/api/billing/portal`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'account' }),
    });
    assert.equal(portal.status, 200);
    const portalCall = stripeCalls.find((call) => call.url.includes('/billing_portal/sessions'));
    assert.match(portalCall.body, /myaccount%3D1|myaccount=1/);

    stripeCalls.length = 0;
    const removed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).subscriptionCanceled, true);
    const deleteCall = stripeCalls.find((call) => call.method === 'DELETE' && call.url.includes('/subscriptions/sub_live'));
    assert.ok(deleteCall);
    const gone = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: session } })).json();
    assert.equal(gone.signedIn, false);
    const founderStill = await (await fetch(`${app.base}/api/account`, { headers: { cookie: founder } })).json();
    assert.equal(founderStill.email, 'dwaynesimons1990@gmail.com');
    assert.equal(founderStill.plan, 'Founder access');
  } finally {
    await app.close();
  }
});
