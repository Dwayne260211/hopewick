import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';

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
      if (target.includes('/checkout/sessions')) {
        return jsonResponse({ id: 'cs_test_123', url: 'https://checkout.stripe.test/c/cs_test_123' });
      }
      if (target.includes('/billing_portal/sessions')) {
        return jsonResponse({ id: 'bps_test', url: 'https://billing.stripe.test/p/bps_test' });
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

    const config = await fetch(`${app.base}/api/billing/config`);
    const cfg = await config.json();
    assert.equal(cfg.publishableKey, 'pk_test_placeholder');
    assert.equal(cfg.checkoutReady, true);
    assert.equal(cfg.amountLabel, 'AU$20/month');
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

test('hosted Hope requires sign-in, hides the key, and enforces free and Plus caps', async () => {
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
    assert.match(blockedBody.error.message, /20 free messages|today’s 1 free messages/);
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
    for (let i = 0; i < 2; i += 1) {
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
    const plusBlocked = await fetch(`${app.base}/api/hope/chat`, {
      method: 'POST',
      headers: { cookie: plusSession, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'over plus cap' }] }),
    });
    assert.equal(plusBlocked.status, 429);
    const plusUsage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: plusSession } })).json();
    assert.equal(plusUsage.plus, true);
    assert.equal(plusUsage.limit, 2);
    assert.equal(plusUsage.used, 2);
  } finally {
    await app.close();
  }
});

test('complimentary founder gets the Plus cap and is not sent to Checkout', async () => {
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

    const usage = await (await fetch(`${app.base}/api/hope/usage`, { headers: { cookie: founder } })).json();
    assert.equal(usage.plus, true);
    assert.equal(usage.complimentary, true);
    assert.equal(usage.limit, 2);

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
