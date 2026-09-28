import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { clearOAuthCachesForTests } from './oauth.js';

const realFetch = globalThis.fetch;

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'hopewick-test';
jwk.alg = 'RS256';
jwk.use = 'sig';
const jwks = { keys: [jwk] };

const appleKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const applePem = appleKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signRs256(payload) {
  const header = { alg: 'RS256', kid: jwk.kid, typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(data), privateKey);
  return `${data}.${b64url(sig)}`;
}

function idToken({ provider, email, sub, nonce, emailVerified = true, clientId }) {
  const now = Math.floor(Date.now() / 1000);
  return signRs256({
    iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
    aud: clientId,
    sub,
    email,
    email_verified: provider === 'apple' ? (emailVerified ? 'true' : 'false') : emailVerified,
    nonce,
    iat: now,
    exp: now + 300,
  });
}

function cookieHeader(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  return list.map((item) => item.split(';')[0]).filter(Boolean).join('; ');
}

function sessionCookie(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const session = list.find((item) => item.startsWith('hopewick_session='));
  assert.ok(session, 'expected a session cookie');
  return session.split(';')[0];
}

async function listen(env, capture) {
  clearOAuthCachesForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-oauth-'));
  const storePath = path.join(dir, 'users.json');
  const previous = {};
  const keys = [
    'HOPEWICK_DEV', 'NODE_ENV', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'FOUNDER_PLUS_EMAILS',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APPLE_CLIENT_ID', 'APPLE_TEAM_ID',
    'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'OAUTH_STATE_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID',
  ];
  for (const key of keys) previous[key] = process.env[key];
  process.env.HOPEWICK_DEV = '1';
  process.env.NODE_ENV = 'test';
  for (const key of keys) {
    if (key !== 'HOPEWICK_DEV' && key !== 'NODE_ENV') delete process.env[key];
  }
  Object.assign(process.env, env);

  globalThis.fetch = async (url, opts) => {
    const target = String(url);
    const body = opts && opts.body ? String(opts.body) : '';
    capture.calls.push({ url: target, body });
    if (target === 'https://www.googleapis.com/oauth2/v3/certs' || target === 'https://appleid.apple.com/auth/keys') {
      return Response.json(jwks);
    }
    if (target === 'https://oauth2.googleapis.com/token' || target === 'https://appleid.apple.com/auth/token') {
      assert.equal(body.includes('BEGIN PRIVATE KEY'), false);
      assert.equal(body.includes(applePem), false);
      return Response.json({ id_token: capture.idToken, token_type: 'Bearer', expires_in: 300 });
    }
    return realFetch(url, opts);
  };

  const server = await startServer({ port: 0, host: '127.0.0.1', storePath });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
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

const googleEnv = {
  GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
};

function appleEnv() {
  return {
    APPLE_CLIENT_ID: 'au.com.hopewick.web',
    APPLE_TEAM_ID: 'TEAMID1234',
    APPLE_KEY_ID: 'KEYID12345',
    APPLE_PRIVATE_KEY: applePem.replace(/\n/g, '\\n'),
  };
}

async function me(base, cookie) {
  const response = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.json();
}

async function magicSession(base, email) {
  const sent = await fetch(`${base}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await sent.json();
  assert.equal(sent.status, 200);
  const verified = await fetch(data.devLink, { redirect: 'manual' });
  return sessionCookie(verified);
}

test('oauth buttons stay hidden until each provider is configured', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen({}, capture);
  try {
    const config = await (await fetch(`${app.base}/api/billing/config`)).json();
    assert.equal(config.googleSignIn, false);
    assert.equal(config.appleSignIn, false);

    const google = await fetch(`${app.base}/api/auth/google?next=https://evil.example/phish`, { redirect: 'manual' });
    assert.equal(google.status, 302);
    assert.equal(google.headers.get('location'), '/app/?account=1&oauth_error=config');

    const partial = await listen({ GOOGLE_CLIENT_ID: 'only-an-id' }, { calls: [], idToken: '' });
    try {
      const again = await (await fetch(`${partial.base}/api/billing/config`)).json();
      assert.equal(again.googleSignIn, false);
    } finally {
      await partial.close();
    }
  } finally {
    await app.close();
  }
});

test('a bad Apple private key keeps the Apple button hidden', async () => {
  const app = await listen({
    APPLE_CLIENT_ID: 'au.com.hopewick.web',
    APPLE_TEAM_ID: 'TEAMID1234',
    APPLE_KEY_ID: 'KEYID12345',
    APPLE_PRIVATE_KEY: 'not-a-pem',
  }, { calls: [], idToken: '' });
  try {
    const config = await (await fetch(`${app.base}/api/billing/config`)).json();
    assert.equal(config.appleSignIn, false);
    const start = await fetch(`${app.base}/api/auth/apple`, { redirect: 'manual' });
    assert.equal(start.headers.get('location'), '/app/?account=1&oauth_error=config');
  } finally {
    await app.close();
  }
});

async function finishGoogle(app, capture, { email, sub, emailVerified, next, clientId = googleEnv.GOOGLE_CLIENT_ID }) {
  const start = await fetch(`${app.base}/api/auth/google?next=${encodeURIComponent(next || '/app/?signedin=1')}`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('client_id'), clientId);
  assert.equal(location.searchParams.get('redirect_uri'), `${app.base}/api/auth/google/callback`);
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('client_secret'), null);
  const oauthCookie = cookieHeader(start);
  assert.match(oauthCookie, /hopewick_oauth=/);
  assert.match(start.headers.get('set-cookie'), /HttpOnly/);
  assert.match(start.headers.get('set-cookie'), /SameSite=Lax/);
  capture.idToken = idToken({
    provider: 'google',
    email,
    sub,
    nonce: location.searchParams.get('nonce'),
    emailVerified,
    clientId,
  });
  const callback = await fetch(
    `${app.base}/api/auth/google/callback?code=google-code&state=${encodeURIComponent(location.searchParams.get('state'))}`,
    { redirect: 'manual', headers: { cookie: oauthCookie } },
  );
  return callback;
}

test('Google sign-in joins the magic-link account and keeps Plus', async () => {
  const capture = { calls: [], idToken: '' };
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => logs.push(args.join(' '));
  const app = await listen(googleEnv, capture);
  try {
    const magic = await magicSession(app.base, 'alex@example.com');
    const before = await me(app.base, magic);
    const marked = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: magic, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(marked.status, 200);

    const callback = await finishGoogle(app, capture, { email: 'Alex@Example.com', sub: 'google-sub-alex' });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/app/?signedin=1');
    const session = sessionCookie(callback);
    const after = await me(app.base, session);
    assert.equal(after.id, before.id);
    assert.equal(after.email, 'alex@example.com');
    assert.equal(after.plus, true);
    assert.equal(after.founder, false);

    const again = await magicSession(app.base, 'alex@example.com');
    const relinked = await me(app.base, again);
    assert.equal(relinked.id, before.id);

    const stored = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(stored.includes('google-client-secret'), false);
    assert.equal(stored.includes(capture.idToken), false);
    assert.equal(logs.some((line) => line.includes(capture.idToken) || line.includes('google-client-secret')), false);
    const tokenCall = capture.calls.find((call) => call.url === 'https://oauth2.googleapis.com/token');
    assert.ok(tokenCall);
    assert.match(tokenCall.body, /client_secret=google-client-secret/);
    assert.match(tokenCall.body, /redirect_uri=/);
  } finally {
    console.log = origLog;
    console.error = origErr;
    await app.close();
  }
});

test('a different Google email is a different account', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(googleEnv, capture);
  try {
    const magic = await magicSession(app.base, 'alex@example.com');
    await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: magic, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    const before = await me(app.base, magic);
    const callback = await finishGoogle(app, capture, { email: 'other@example.com', sub: 'google-sub-other' });
    const after = await me(app.base, sessionCookie(callback));
    assert.notEqual(after.id, before.id);
    assert.equal(after.email, 'other@example.com');
    assert.equal(after.plus, false);
  } finally {
    await app.close();
  }
});

test('Google founder email is complimentary Plus and the organisations inbox is not', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(googleEnv, capture);
  try {
    const founder = await finishGoogle(app, capture, { email: 'DwayneSimons1990@gmail.com', sub: 'google-founder' });
    const founderMe = await me(app.base, sessionCookie(founder));
    assert.equal(founderMe.email, 'dwaynesimons1990@gmail.com');
    assert.equal(founderMe.founder, true);
    assert.equal(founderMe.plus, true);
    assert.equal(founderMe.complimentary, true);

    const clinic = await finishGoogle(app, capture, { email: 'admin@bridge-bite-co.com', sub: 'google-clinic' });
    const clinicMe = await me(app.base, sessionCookie(clinic));
    assert.equal(clinicMe.founder, false);
    assert.equal(clinicMe.plus, false);
  } finally {
    await app.close();
  }
});

test('Google rejects a mismatched state, an unverified email, and an open redirect', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(googleEnv, capture);
  try {
    const start = await fetch(`${app.base}/api/auth/google?next=https://evil.example/phish`, { redirect: 'manual' });
    const location = new URL(start.headers.get('location'));
    const oauthCookie = cookieHeader(start);
    capture.idToken = idToken({
      provider: 'google',
      email: 'alex@example.com',
      sub: 'google-sub-alex',
      nonce: location.searchParams.get('nonce'),
      clientId: googleEnv.GOOGLE_CLIENT_ID,
    });
    const mismatch = await fetch(`${app.base}/api/auth/google/callback?code=google-code&state=not-the-state`, {
      redirect: 'manual',
      headers: { cookie: oauthCookie },
    });
    assert.equal(mismatch.headers.get('location'), '/app/?account=1&oauth_error=state');
    assert.equal(mismatch.headers.get('set-cookie').includes('hopewick_session='), false);

    const unverifiedStart = await fetch(`${app.base}/api/auth/google`, { redirect: 'manual' });
    const unverifiedUrl = new URL(unverifiedStart.headers.get('location'));
    capture.idToken = idToken({
      provider: 'google',
      email: 'alex@example.com',
      sub: 'google-sub-unverified',
      nonce: unverifiedUrl.searchParams.get('nonce'),
      emailVerified: false,
      clientId: googleEnv.GOOGLE_CLIENT_ID,
    });
    const unverified = await fetch(
      `${app.base}/api/auth/google/callback?code=google-code&state=${unverifiedUrl.searchParams.get('state')}`,
      { redirect: 'manual', headers: { cookie: cookieHeader(unverifiedStart) } },
    );
    assert.equal(unverified.headers.get('location'), '/app/?account=1&oauth_error=email');

    const ok = await finishGoogle(app, capture, {
      email: 'alex@example.com',
      sub: 'google-sub-safe-next',
      next: 'https://evil.example/phish',
    });
    assert.equal(ok.headers.get('location'), '/app/?signedin=1');
  } finally {
    await app.close();
  }
});

test('the same Google subject keeps its Hopewick email when the provider email changes', async () => {
  const capture = { calls: [], idToken: '' };
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  const app = await listen(googleEnv, capture);
  try {
    const first = await finishGoogle(app, capture, { email: 'alex@example.com', sub: 'google-sub-stable' });
    const firstMe = await me(app.base, sessionCookie(first));
    const second = await finishGoogle(app, capture, { email: 'moved@example.com', sub: 'google-sub-stable' });
    const secondMe = await me(app.base, sessionCookie(second));
    assert.equal(secondMe.id, firstMe.id);
    assert.equal(secondMe.email, 'alex@example.com');
    assert.equal(logs.some((line) => line.includes('left unchanged')), true);
    assert.equal(logs.some((line) => line.includes('moved@example.com')), false);
  } finally {
    console.log = orig;
    await app.close();
  }
});

test('a second Google subject cannot take over an email', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(googleEnv, capture);
  try {
    await finishGoogle(app, capture, { email: 'alex@example.com', sub: 'google-sub-a' });
    const start = await fetch(`${app.base}/api/auth/google`, { redirect: 'manual' });
    const location = new URL(start.headers.get('location'));
    capture.idToken = idToken({
      provider: 'google',
      email: 'alex@example.com',
      sub: 'google-sub-b',
      nonce: location.searchParams.get('nonce'),
      clientId: googleEnv.GOOGLE_CLIENT_ID,
    });
    const callback = await fetch(
      `${app.base}/api/auth/google/callback?code=google-code&state=${location.searchParams.get('state')}`,
      { redirect: 'manual', headers: { cookie: cookieHeader(start) } },
    );
    assert.equal(callback.headers.get('location'), '/app/?account=1&oauth_error=conflict');
  } finally {
    await app.close();
  }
});

async function finishApple(app, capture, { email, sub, emailVerified = true, userField }) {
  const start = await fetch(`${app.base}/api/auth/apple?next=${encodeURIComponent('/app/?signedin=1')}`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get('location'));
  assert.equal(location.origin, 'https://appleid.apple.com');
  assert.equal(location.searchParams.get('client_id'), 'au.com.hopewick.web');
  assert.equal(location.searchParams.get('redirect_uri'), `${app.base}/api/auth/apple/callback`);
  assert.equal(location.searchParams.get('response_type'), 'code id_token');
  assert.equal(location.searchParams.get('response_mode'), 'form_post');
  assert.equal(location.searchParams.get('scope'), 'name email');
  const nonce = location.searchParams.get('nonce');
  const state = location.searchParams.get('state');
  const token = idToken({
    provider: 'apple',
    email,
    sub,
    nonce,
    emailVerified,
    clientId: 'au.com.hopewick.web',
  });
  capture.idToken = token;
  const form = new URLSearchParams({ code: 'apple-code', state, id_token: token });
  if (userField) form.set('user', userField);
  const callback = await fetch(`${app.base}/api/auth/apple/callback`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(start),
    },
    body: form,
  });
  return callback;
}

test('Apple sign-in links the same email and signs a client secret', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen({ ...googleEnv, ...appleEnv() }, capture);
  try {
    const magic = await magicSession(app.base, 'sam@example.com');
    const before = await me(app.base, magic);
    const callback = await finishApple(app, capture, { email: 'sam@example.com', sub: 'apple-sub-sam' });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/app/?signedin=1');
    const after = await me(app.base, sessionCookie(callback));
    assert.equal(after.id, before.id);
    assert.equal(after.email, 'sam@example.com');

    const tokenCall = capture.calls.find((call) => call.url === 'https://appleid.apple.com/auth/token');
    assert.ok(tokenCall);
    const params = new URLSearchParams(tokenCall.body);
    const secret = params.get('client_secret');
    assert.ok(secret);
    const [h, p, s] = secret.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    assert.equal(header.alg, 'ES256');
    assert.equal(header.kid, 'KEYID12345');
    assert.equal(payload.iss, 'TEAMID1234');
    assert.equal(payload.sub, 'au.com.hopewick.web');
    assert.equal(payload.aud, 'https://appleid.apple.com');
    const verified = crypto.verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: appleKeys.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url'),
    );
    assert.equal(verified, true);
    const stored = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(stored.includes('BEGIN PRIVATE KEY'), false);
    assert.equal(stored.includes(capture.idToken), false);
  } finally {
    await app.close();
  }
});

test('Apple Hide My Email is a separate account from the real address', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(appleEnv(), capture);
  try {
    const real = await finishApple(app, capture, { email: 'sam@example.com', sub: 'apple-sub-real' });
    const realMe = await me(app.base, sessionCookie(real));
    const relay = await finishApple(app, capture, {
      email: 'abc123@privaterelay.appleid.com',
      sub: 'apple-sub-relay',
    });
    const relayMe = await me(app.base, sessionCookie(relay));
    assert.notEqual(relayMe.id, realMe.id);
    assert.equal(relayMe.email, 'abc123@privaterelay.appleid.com');
    assert.equal(relayMe.plus, false);
  } finally {
    await app.close();
  }
});

test('Apple cancel returns to the account screen without a session', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen(appleEnv(), capture);
  try {
    const start = await fetch(`${app.base}/api/auth/apple`, { redirect: 'manual' });
    const location = new URL(start.headers.get('location'));
    const form = new URLSearchParams({
      state: location.searchParams.get('state'),
      error: 'user_cancelled_authorize',
    });
    const callback = await fetch(`${app.base}/api/auth/apple/callback`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader(start),
      },
      body: form,
    });
    assert.equal(callback.headers.get('location'), '/app/?account=1&oauth_error=denied');
    assert.equal(String(callback.headers.get('set-cookie') || '').includes('hopewick_session='), false);
  } finally {
    await app.close();
  }
});

test('HTTPS starts use a Secure SameSite=None state cookie for Apple’s form POST', async () => {
  const capture = { calls: [], idToken: '' };
  const app = await listen({ ...appleEnv(), PUBLIC_BASE_URL: 'https://hopewick.com.au' }, capture);
  try {
    const start = await fetch(`${app.base}/api/auth/apple`, { redirect: 'manual' });
    const setCookie = start.headers.get('set-cookie') || '';
    assert.match(setCookie, /SameSite=None/);
    assert.match(setCookie, /Secure/);
    const location = new URL(start.headers.get('location'));
    assert.equal(location.searchParams.get('redirect_uri'), 'https://hopewick.com.au/api/auth/apple/callback');
  } finally {
    await app.close();
  }
});
