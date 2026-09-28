/**
 * Sign in with Google (OAuth 2.0 / OpenID Connect) and Sign in with Apple (web).
 *
 * The browser only ever visits /api/auth/<provider> and the provider's return
 * URL. Client secrets, the Apple private key, and tokens stay on the server
 * and are not logged. A verified email joins the same Hopewick account the
 * magic link uses. Plus and founder checks stay on that email.
 */
import crypto from 'node:crypto';

export const OAUTH_COOKIE = 'hopewick_oauth';
const OAUTH_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_LIMIT = 40;

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const APPLE_AUTH = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

const starts = new Map();
const jwksCache = new Map();
let ephemeralStateKey = '';
let cachedPem = '';
let cachedAppleKey = null;

function envValue(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function label(provider) {
  return provider === 'apple' ? 'Apple' : 'Google';
}

function fail(provider, reason, oauthCode) {
  console.error(`Sign in with ${label(provider)} failed (${reason}).`);
  const err = new Error('oauth');
  err.oauthCode = oauthCode;
  throw err;
}

function stateKey() {
  const configured = envValue('OAUTH_STATE_SECRET');
  if (configured) return configured;
  if (!ephemeralStateKey) ephemeralStateKey = crypto.randomBytes(32).toString('hex');
  return ephemeralStateKey;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function safeNext(value) {
  if (!value || typeof value !== 'string') return '/app/?signedin=1';
  if (value.length > 500) return '/app/?signedin=1';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return '/app/?signedin=1';
  }
  return value;
}

function allowStart(ip, provider) {
  const key = `${provider}:${ip || 'local'}`;
  const now = Date.now();
  const prev = (starts.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (prev.length >= STATE_LIMIT) return false;
  prev.push(now);
  starts.set(key, prev);
  return true;
}

export function clearOAuthCachesForTests() {
  starts.clear();
  jwksCache.clear();
  cachedPem = '';
  cachedAppleKey = null;
}

function normalizePem(raw) {
  let text = String(raw || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  if (!text.includes('BEGIN')) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) text = decoded;
    } catch {
      /* keep the original text */
    }
  }
  return text;
}

function loadAppleKey() {
  const pem = normalizePem(envValue('APPLE_PRIVATE_KEY'));
  if (!pem.includes('BEGIN PRIVATE KEY') && !pem.includes('BEGIN EC PRIVATE KEY')) {
    throw new Error('bad apple key');
  }
  if (cachedAppleKey && cachedPem === pem) return cachedAppleKey;
  const key = crypto.createPrivateKey(pem);
  cachedAppleKey = key;
  cachedPem = pem;
  return key;
}

export function googleConfigStatus() {
  const id = envValue('GOOGLE_CLIENT_ID');
  const secret = envValue('GOOGLE_CLIENT_SECRET');
  if (!id && !secret) return 'missing';
  if (!id || !secret) return 'partial';
  return 'ok';
}

export function appleConfigStatus() {
  const parts = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'].map(envValue);
  if (parts.every((part) => !part)) return 'missing';
  if (parts.some((part) => !part)) return 'partial';
  try {
    loadAppleKey();
    return 'ok';
  } catch {
    return 'badkey';
  }
}

export function googleSignInEnabled() {
  return googleConfigStatus() === 'ok';
}

export function appleSignInEnabled() {
  return appleConfigStatus() === 'ok';
}

export function oauthStartupLines() {
  const lines = [];
  const google = googleConfigStatus();
  if (google === 'missing') {
    lines.push('Sign in with Google is hidden. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to show the button.');
  } else if (google === 'partial') {
    lines.push('Sign in with Google is hidden. Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  const apple = appleConfigStatus();
  if (apple === 'missing') {
    lines.push('Sign in with Apple is hidden. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY to show the button.');
  } else if (apple === 'partial') {
    lines.push('Sign in with Apple is hidden. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.');
  } else if (apple === 'badkey') {
    lines.push('Sign in with Apple is hidden. APPLE_PRIVATE_KEY could not be read. Paste the .p8 PEM and use \\n for line breaks.');
  }
  return lines;
}

export function oauthCookie(token, { secure, maxAgeSec }) {
  const bits = [
    `${OAUTH_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    secure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearOauthCookie(secure) {
  return oauthCookie('', { secure, maxAgeSec: 0 });
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readPayload(token) {
  if (!token || typeof token !== 'string' || token.length > 4000) return null;
  const split = token.lastIndexOf('.');
  if (split < 1) return null;
  const body = token.slice(0, split);
  const sig = token.slice(split + 1);
  const expected = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function redirectUriFor(publicBase, provider) {
  return `${String(publicBase || '').replace(/\/+$/, '')}/api/auth/${provider}/callback`;
}

function validRedirect(uri, provider) {
  try {
    const url = new URL(uri);
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return false;
    return url.pathname === `/api/auth/${provider}/callback`;
  } catch {
    return false;
  }
}

export function startOAuth(provider, { next, secure, publicBase, ip }) {
  if (provider !== 'google' && provider !== 'apple') fail(provider, 'provider', 'provider');
  if (provider === 'google' && !googleSignInEnabled()) fail(provider, 'not_configured', 'config');
  if (provider === 'apple' && !appleSignInEnabled()) fail(provider, 'not_configured', 'config');
  if (!allowStart(ip, provider)) fail(provider, 'rate', 'provider');
  const redirectUri = redirectUriFor(publicBase, provider);
  if (!validRedirect(redirectUri, provider)) fail(provider, 'redirect', 'config');
  const state = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(32).toString('hex');
  const payload = {
    state,
    nonce,
    provider,
    next: safeNext(next),
    redirectUri,
    exp: Date.now() + OAUTH_MS,
  };
  const url = provider === 'google' ? new URL(GOOGLE_AUTH) : new URL(APPLE_AUTH);
  const clientId = provider === 'google' ? envValue('GOOGLE_CLIENT_ID') : envValue('APPLE_CLIENT_ID');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', provider === 'google' ? 'code' : 'code id_token');
  url.searchParams.set('scope', provider === 'google' ? 'openid email profile' : 'name email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  if (provider === 'google') url.searchParams.set('prompt', 'select_account');
  else url.searchParams.set('response_mode', 'form_post');
  return {
    location: url.toString(),
    setCookie: oauthCookie(signPayload(payload), { secure: !!secure, maxAgeSec: Math.floor(OAUTH_MS / 1000) }),
  };
}

function decodeJwt(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const signature = Buffer.from(parts[2], 'base64url');
    if (!header || !payload || signature.length < 32) return null;
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature };
  } catch {
    return null;
  }
}

async function fetchJwks(url, provider, force) {
  const hit = jwksCache.get(url);
  if (!force && hit && hit.exp > Date.now()) return hit.keys;
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  } catch {
    fail(provider, 'jwks', 'provider');
  }
  if (!response.ok) fail(provider, 'jwks', 'provider');
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!body || !Array.isArray(body.keys) || !body.keys.length) fail(provider, 'jwks', 'provider');
  jwksCache.set(url, { keys: body.keys, exp: Date.now() + 60 * 60 * 1000 });
  return body.keys;
}

function assertClaims(payload, { issuer, clientId, nonce, provider }) {
  const allowed = Array.isArray(issuer) ? issuer : [issuer];
  if (!allowed.includes(payload.iss)) fail(provider, 'claims', 'provider');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) fail(provider, 'claims', 'provider');
  if (payload.azp && payload.azp !== clientId) fail(provider, 'claims', 'provider');
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const iat = payload.iat == null ? now : Number(payload.iat);
  if (!Number.isFinite(exp) || exp < now - 60) fail(provider, 'expired', 'provider');
  if (!Number.isFinite(iat) || iat > now + 60) fail(provider, 'claims', 'provider');
  if (payload.nbf != null && Number(payload.nbf) > now + 60) fail(provider, 'claims', 'provider');
  if (!safeEqual(String(payload.nonce || ''), nonce)) fail(provider, 'state', 'state');
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub || sub.length > 255) fail(provider, 'claims', 'provider');
  return sub;
}

async function verifyIdToken(token, { jwksUrl, issuer, clientId, nonce, provider }) {
  const decoded = decodeJwt(token);
  if (!decoded || decoded.header.alg !== 'RS256' || decoded.header.crit) fail(provider, 'claims', 'provider');
  const kid = typeof decoded.header.kid === 'string' ? decoded.header.kid : '';
  if (!kid) fail(provider, 'claims', 'provider');
  let keys = await fetchJwks(jwksUrl, provider, false);
  let jwk = keys.find((key) => key && key.kid === kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
  if (!jwk) {
    keys = await fetchJwks(jwksUrl, provider, true);
    jwk = keys.find((key) => key && key.kid === kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
  }
  if (!jwk) fail(provider, 'jwks', 'provider');
  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = crypto.verify('RSA-SHA256', Buffer.from(decoded.signingInput), key, decoded.signature);
  } catch {
    ok = false;
  }
  if (!ok) fail(provider, 'claims', 'provider');
  const sub = assertClaims(decoded.payload, { issuer, clientId, nonce, provider });
  return { payload: decoded.payload, sub };
}

function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: envValue('APPLE_KEY_ID'), typ: 'JWT' };
  const payload = {
    iss: envValue('APPLE_TEAM_ID'),
    iat: now,
    exp: now + 300,
    aud: APPLE_ISSUER,
    sub: envValue('APPLE_CLIENT_ID'),
  };
  const data = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  let signature;
  try {
    signature = crypto.sign('sha256', Buffer.from(data), { key: loadAppleKey(), dsaEncoding: 'ieee-p1363' });
  } catch {
    fail('apple', 'key', 'config');
  }
  return `${data}.${Buffer.from(signature).toString('base64url')}`;
}

async function exchangeCode(provider, { code, redirectUri }) {
  const url = provider === 'google' ? GOOGLE_TOKEN : APPLE_TOKEN;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: provider === 'google' ? envValue('GOOGLE_CLIENT_ID') : envValue('APPLE_CLIENT_ID'),
    client_secret: provider === 'google' ? envValue('GOOGLE_CLIENT_SECRET') : appleClientSecret(),
  });
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail(provider, 'exchange', 'provider');
  }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || typeof data.id_token !== 'string' || !data.id_token) fail(provider, 'exchange', 'provider');
  return data.id_token;
}

function emailFromPayload(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const present = Boolean(email);
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  return { email, present, verified };
}

function attachIdentity(store, provider, sub, email) {
  const linked = store.findByProvider(provider, sub);
  if (linked) {
    return { user: linked, emailMismatch: Boolean(email && linked.email !== email) };
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 120) fail(provider, 'email_missing', 'email');
  const byEmail = store.findByEmail(email);
  if (byEmail) {
    const providers = Object.assign({}, byEmail.providers);
    const current = providers[provider];
    if (current && current.sub !== sub) fail(provider, 'conflict', 'conflict');
    if (!current) {
      providers[provider] = { sub, linkedAt: new Date().toISOString() };
      byEmail.providers = providers;
      store.save(byEmail);
    }
    return { user: byEmail, emailMismatch: false };
  }
  const user = store.createUser(email);
  user.providers = { [provider]: { sub, linkedAt: new Date().toISOString() } };
  store.save(user);
  return { user, emailMismatch: false };
}

const DENIED = new Set(['access_denied', 'user_cancelled_authorize', 'user_cancelled']);

export async function finishOAuth(provider, { cookie, state, code, idToken, error, store }) {
  if (provider !== 'google' && provider !== 'apple') fail(provider, 'provider', 'provider');
  if (provider === 'google' && !googleSignInEnabled()) fail(provider, 'not_configured', 'config');
  if (provider === 'apple' && !appleSignInEnabled()) fail(provider, 'not_configured', 'config');
  if (error) {
    const safeErr = /^[a-z_]{1,40}$/.test(String(error)) ? String(error) : 'rejected';
    if (DENIED.has(safeErr)) fail(provider, 'denied', 'denied');
    fail(provider, safeErr, 'provider');
  }
  const pending = readPayload(cookie);
  if (!pending || pending.provider !== provider || !safeEqual(pending.state, String(state || ''))) {
    fail(provider, 'state', 'state');
  }
  if (!validRedirect(pending.redirectUri, provider)) fail(provider, 'redirect', 'config');
  const authCode = String(code || '');
  if (!authCode || authCode.length > 2048 || /\s/.test(authCode)) fail(provider, 'exchange', 'provider');

  const jwksUrl = provider === 'google' ? GOOGLE_JWKS : APPLE_JWKS;
  const issuer = provider === 'google' ? GOOGLE_ISSUERS : APPLE_ISSUER;
  const clientId = provider === 'google' ? envValue('GOOGLE_CLIENT_ID') : envValue('APPLE_CLIENT_ID');
  const verify = (token) => verifyIdToken(token, {
    jwksUrl,
    issuer,
    clientId,
    nonce: pending.nonce,
    provider,
  });

  if (provider === 'apple' && idToken) {
    const posted = await verify(String(idToken));
    const exchanged = await verify(await exchangeCode(provider, { code: authCode, redirectUri: pending.redirectUri }));
    if (posted.sub !== exchanged.sub) fail(provider, 'mismatch_sub', 'provider');
    return identityResult(store, provider, exchanged, pending.next);
  }

  const exchanged = await verify(await exchangeCode(provider, { code: authCode, redirectUri: pending.redirectUri }));
  return identityResult(store, provider, exchanged, pending.next);
}

function identityResult(store, provider, verified, next) {
  const info = emailFromPayload(verified.payload);
  if (info.present && (!info.verified || !EMAIL_RE.test(info.email) || info.email.length > 120)) {
    const linked = store.findByProvider(provider, verified.sub);
    if (!linked) fail(provider, info.verified ? 'email_invalid' : 'email_unverified', 'email');
    return { user: linked, next: safeNext(next), emailMismatch: true };
  }
  const attached = attachIdentity(store, provider, verified.sub, info.present ? info.email : '');
  return { user: attached.user, next: safeNext(next), emailMismatch: attached.emailMismatch };
}
