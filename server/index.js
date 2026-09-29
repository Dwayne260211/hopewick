/**
 * Hopewick account + billing server.
 *
 * The marketing site and companion stay static HTML. This process serves those
 * files and a small /api for email magic-link and password sign-in, Stripe Checkout,
 * the Customer Portal, and subscription webhooks.
 *
 * Hosted Hope chat is POST /api/hope/chat. The OpenAI key stays in
 * OPENAI_API_KEY on this server (the same key can already exist on the
 * Azure invite proxy). The browser never receives it.
 *
 * Plus Checkout includes a 3-day trial, then the existing monthly price.
 * Daily caps: Free is 5 messages. Hopewick Plus, a 3-day trial, and
 * complimentary founder emails have no daily message cap. Counts use the
 * Australia/Brisbane calendar day. A crisis reply that calls the model
 * spends a message. Once the free cap is reached, crisis gets the static
 * numbers (000 and 1800 250 015) and the model is not called.
 * Saved chats for a signed-in account live in chats.json (per profile),
 * beside the account file. The model call itself does not write that file.
 * The account file holds email, an optional name and phone, a scrypt
 * password hash when one is set, subscription status, and that day's
 * message count. Card numbers, CVV, and full payment details are never
 * stored. Sign-in email cannot be changed from My Account.
 * The session cookie is httpOnly and lasts until sign-out (it slides
 * forward on each return visit). The one-time email link still expires
 * in 30 minutes.
 *
 * Invite-code live AI can still use the Azure Functions API from
 * Developer settings in the companion. It is not the default path.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createStore, hashToken, publicUser, isPlusStatus, isFounderPlusEmail } from './store.js';
import { hashPassword, verifyPassword, passwordError } from './password.js';
import { stripeConfigured, stripeRequest, verifyStripeEvent } from './stripe-client.js';
import { plusLibraryPayload, todayReadingPayload } from './plus-library.js';
import { createChatStore, validProfileId } from './chats.js';
import {
  hopeConfigured,
  freeDailyCap,
  usageSnapshot,
  lastUserText,
  isCrisisText,
  CRISIS_FALLBACK,
  sanitizeMessages,
  completionBody,
  openAiEndpoint,
  admitHopeCall,
  commitSpend,
  rollbackSpend,
  capMessage,
  HOPE_RESET_LABEL,
} from './hope-chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

const SESSION_COOKIE = 'hopewick_session';
/**
 * Lasting sign-in on this browser. 400 days is the long cookie browsers
 * will keep. Each signed-in return visit slides the expiry forward, so
 * people stay signed in until they choose Sign out.
 */
export const SESSION_MS = 400 * 24 * 60 * 60 * 1000;
const MAGIC_MS = 30 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLUS_OK = new Set(['active', 'trialing']);
const PLUS_TRIAL_DAYS = 3;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const HOUR_MS = 60 * 60 * 1000;
const CHAT_WINDOW_MS = 10 * 60 * 1000;
const magicByEmail = new Map();
const magicByIp = new Map();
const passwordFailures = new Map();
const passwordChangeFailures = new Map();
const deleteAttempts = new Map();
const SENSITIVE_WINDOW_MS = 60 * 60 * 1000;
const SENSITIVE_LIMIT = 8;
const loginByIp = new Map();
const chatByUser = new Map();
const chatByIp = new Map();
const rateBuckets = [
  magicByEmail,
  magicByIp,
  passwordFailures,
  loginByIp,
  chatByUser,
  chatByIp,
  passwordChangeFailures,
  deleteAttempts,
];

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function pruneRateBuckets(now) {
  if (pruneRateBuckets.last && now - pruneRateBuckets.last < 60_000) return;
  pruneRateBuckets.last = now;
  for (const map of rateBuckets) {
    if (map.size < 2000) continue;
    for (const [key, stamps] of map) {
      const fresh = stamps.filter((t) => now - t < HOUR_MS);
      if (!fresh.length) map.delete(key);
      else map.set(key, fresh);
    }
  }
}

function recentHits(map, key, windowMs) {
  const now = Date.now();
  pruneRateBuckets(now);
  const prev = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (!prev.length) map.delete(key);
  else map.set(key, prev);
  return prev;
}

function underLimit(map, key, limit, windowMs) {
  return recentHits(map, key, windowMs).length < limit;
}

function recordHit(map, key, windowMs) {
  const prev = recentHits(map, key, windowMs);
  prev.push(Date.now());
  map.set(key, prev);
}

function tooManyHits(map, key) {
  return !underLimit(map, key, SENSITIVE_LIMIT, SENSITIVE_WINDOW_MS);
}

function noteHit(map, key) {
  recordHit(map, key, SENSITIVE_WINDOW_MS);
}

export function devMode() {
  if (process.env.HOPEWICK_DEV === '0') return false;
  if (process.env.HOPEWICK_DEV === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

export function loadEnvFile(file = path.join(REPO_ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}

function requestHostname(req) {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  return raw.replace(/:\d+$/, '');
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1').split(',')[0].trim();
  return `${proto}://${host}`;
}

function cookieSecure(req) {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  if ((process.env.PUBLIC_BASE_URL || '').startsWith('https://')) return true;
  return requestOrigin(req).startsWith('https://');
}

/** True only when this request itself arrived over HTTPS (Render sets x-forwarded-proto). */
function requestIsHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;
  return requestOrigin(req).startsWith('https://');
}

/**
 * Last address in X-Forwarded-For is the one a single reverse proxy appends.
 * A caller-supplied list cannot hide behind a fake first address.
 */
function clientIp(req) {
  const parts = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  if (last) return last.slice(0, 80);
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** Browsers send Origin on POST. Missing Origin is allowed for the app's tests and Stripe. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host && host === requestHostname(req)) return true;
  try {
    const configured = new URL(process.env.PUBLIC_BASE_URL || '').hostname.toLowerCase();
    if (configured && host === configured) return true;
  } catch { /* PUBLIC_BASE_URL is optional in local dev */ }
  return false;
}

function contentSecurityPolicy(req) {
  const connect = ["'self'", 'https:', 'http://127.0.0.1:7071', 'http://localhost:7071'];
  const parts = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
  ];
  if (requestIsHttps(req)) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

function securityHeaders(req) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self)',
    'Content-Security-Policy': contentSecurityPolicy(req),
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
  if (requestIsHttps(req)) {
    headers['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  }
  return headers;
}

function installSecurityHeaders(req, res) {
  const writeHead = res.writeHead;
  res.writeHead = function writeHeadWithSecurity(status, reason, headers) {
    let message = reason;
    let hdrs = headers;
    if (reason !== undefined && typeof reason !== 'string') {
      hdrs = reason;
      message = undefined;
    }
    const merged = { ...securityHeaders(req) };
    if (hdrs && typeof hdrs === 'object' && !Array.isArray(hdrs)) Object.assign(merged, hdrs);
    if (message !== undefined) return writeHead.call(res, status, message, merged);
    return writeHead.call(res, status, merged);
  };
}

/**
 * Send www.<public host> to the apex so the session cookie (host-only, SameSite=Lax)
 * and Stripe return URLs stay on one origin.
 */
function maybeCanonicalRedirect(req, res) {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  let canonical = '';
  try { canonical = new URL(base).hostname.toLowerCase(); } catch { return false; }
  if (!canonical || canonical === 'localhost' || canonical === '127.0.0.1') return false;
  if (requestHostname(req) !== `www.${canonical}`) return false;
  const pathAndQuery = req.url && req.url.startsWith('/') ? req.url : `/${req.url || ''}`;
  res.writeHead(308, {
    Location: `${base}${pathAndQuery}`,
    'Cache-Control': 'no-store',
  });
  res.end();
  return true;
}

function publicBase(req) {
  const configured = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return configured || requestOrigin(req);
}

function json(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...(extraHeaders || {}),
  });
  res.end(payload);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error('Request body is too large.');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function sessionMaxAgeSec() {
  return Math.floor(SESSION_MS / 1000);
}

function sessionCookie(token, req, maxAgeSec) {
  const secure = cookieSecure(req);
  const bits = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (maxAgeSec > 0) bits.push(`Expires=${new Date(Date.now() + maxAgeSec * 1000).toUTCString()}`);
  else bits.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function clearCookie(req) {
  return sessionCookie('', req, 0);
}

function currentUser(req, store) {
  return store.findBySession(cookies(req)[SESSION_COOKIE]);
}

function startSession(user, req, store) {
  const session = crypto.randomBytes(32).toString('hex');
  user.session = { hash: hashToken(session), expiresAt: Date.now() + SESSION_MS };
  store.save(user);
  return sessionCookie(session, req, sessionMaxAgeSec());
}

/** Slide the same httpOnly cookie forward so a return visit does not force a new email. */
function touchSession(user, req, store) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!user || !user.session || !token) return null;
  user.session.expiresAt = Date.now() + SESSION_MS;
  store.save(user);
  return sessionCookie(token, req, sessionMaxAgeSec());
}

function safeNext(value) {
  if (!value || typeof value !== 'string') return '';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '';
  return value;
}

function allowMagicLink(email, req) {
  const ip = clientIp(req);
  const emailLimit = positiveIntEnv('HOPEWICK_MAGIC_EMAIL_LIMIT', 8);
  const ipLimit = positiveIntEnv('HOPEWICK_MAGIC_IP_LIMIT', 80);
  if (!underLimit(magicByEmail, email, emailLimit, HOUR_MS)) return false;
  if (!underLimit(magicByIp, ip, ipLimit, HOUR_MS)) return false;
  recordHit(magicByEmail, email, HOUR_MS);
  recordHit(magicByIp, ip, HOUR_MS);
  return true;
}

function allowLoginIp(req) {
  const ip = clientIp(req);
  const limit = positiveIntEnv('HOPEWICK_LOGIN_IP_LIMIT', 120);
  if (!underLimit(loginByIp, ip, limit, HOUR_MS)) return false;
  recordHit(loginByIp, ip, HOUR_MS);
  return true;
}

function passwordBlocked(email) {
  const limit = positiveIntEnv('HOPEWICK_LOGIN_EMAIL_LIMIT', 8);
  return !underLimit(passwordFailures, email, limit, HOUR_MS);
}

function notePasswordFailure(email) {
  recordHit(passwordFailures, email, HOUR_MS);
}

/**
 * Hope calls that would reach the model. A person chatting normally stays under this.
 * Crisis text that is already over the limit still gets the emergency message, not a refusal.
 */
function allowChatBurst(req, user) {
  const ip = clientIp(req);
  const perUser = positiveIntEnv('HOPEWICK_CHAT_BURST', 24);
  const perIp = positiveIntEnv('HOPEWICK_CHAT_IP_LIMIT', 80);
  if (!underLimit(chatByUser, user.id, perUser, CHAT_WINDOW_MS)) return false;
  if (!underLimit(chatByIp, ip, perIp, CHAT_WINDOW_MS)) return false;
  recordHit(chatByUser, user.id, CHAT_WINDOW_MS);
  recordHit(chatByIp, ip, CHAT_WINDOW_MS);
  return true;
}

let dummyPasswordHashPromise;
function dummyPasswordHash() {
  if (!dummyPasswordHashPromise) dummyPasswordHashPromise = hashPassword('hopewick-password-timing');
  return dummyPasswordHashPromise;
}

/** Always runs scrypt, including when the email has no account, so timing does not reveal that. */
async function passwordMatches(password, user) {
  if (user && user.passwordHash) return verifyPassword(password, user.passwordHash);
  await verifyPassword(password, await dummyPasswordHash());
  return false;
}

const RAW_CARD_KEYS = new Set(['card', 'cardnumber', 'card_number', 'pan', 'cvc', 'cvv', 'securitycode', 'expiry']);

function hasRawCardFields(body) {
  if (!body || typeof body !== 'object') return false;
  return Object.keys(body).some((key) => RAW_CARD_KEYS.has(String(key).toLowerCase().replace(/[^a-z_]/g, '')));
}

function cleanAccountName(value) {
  if (typeof value !== 'string') return { ok: false, error: 'Enter your name as text.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > 80) return { ok: false, error: 'Name must be 80 characters or fewer.' };
  if (/[\u0000-\u001f<>]/.test(name)) return { ok: false, error: 'Name can’t include those characters.' };
  return { ok: true, value: name };
}

function cleanAccountPhone(value) {
  if (typeof value !== 'string') return { ok: false, error: 'Enter a phone number as text.' };
  const phone = value.trim();
  if (!phone) return { ok: true, value: '' };
  if (phone.length > 30) return { ok: false, error: 'That phone number is too long.' };
  if (!/^[0-9+().\-\s]+$/.test(phone)) return { ok: false, error: 'Use digits, spaces, and + ( ) - only.' };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Enter a phone number with 8 to 15 digits.' };
  return { ok: true, value: phone };
}

function accountSummary(user) {
  const pub = publicUser(user);
  const stored = user.subscriptionStatus || 'none';
  const founderAccess = Boolean(pub.complimentary);
  const paidLike = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'].includes(stored);
  let plan = 'Free';
  let priceLabel = 'AU$20/month when you start Plus';
  let billingStatus = stored;
  if (founderAccess) {
    plan = 'Founder access';
    priceLabel = 'Included — no charge';
    billingStatus = 'founder';
  } else if (paidLike && stored !== 'none') {
    plan = 'Hopewick Plus';
    priceLabel = 'AU$20/month';
  }
  const cancelable = !founderAccess
    && ['active', 'trialing', 'past_due', 'unpaid'].includes(stored)
    && Boolean(user.stripeSubscriptionId)
    && !user.cancelAtPeriodEnd;
  return Object.assign({}, pub, {
    plan,
    priceLabel,
    billingStatus,
    nextBillingDate: founderAccess ? null : (user.currentPeriodEnd || null),
    canManageBilling: Boolean(user.stripeCustomerId),
    canCancel: cancelable,
    canUpgrade: !pub.plus,
    emailChangeSupported: false,
  });
}

function stripeHostedUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return '';
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === 'stripe.com' || host.endsWith('.stripe.com')) return value;
  } catch { /* ignore unexpected invoice links */ }
  return '';
}

function cardSummary(paymentMethod) {
  const card = paymentMethod && paymentMethod.card;
  if (!card) return null;
  const last4 = String(card.last4 || '');
  if (!/^\d{4}$/.test(last4)) return null;
  const brand = String(card.brand || 'card').slice(0, 20);
  const expMonth = Number(card.exp_month);
  const expYear = Number(card.exp_year);
  return {
    brand,
    last4,
    expMonth: Number.isInteger(expMonth) ? expMonth : null,
    expYear: Number.isInteger(expYear) ? expYear : null,
  };
}

function invoiceSummary(invoice) {
  const amount = typeof invoice.amount_paid === 'number' && invoice.status === 'paid'
    ? invoice.amount_paid
    : (typeof invoice.total === 'number' ? invoice.total : 0);
  return {
    id: String(invoice.id || ''),
    number: invoice.number ? String(invoice.number) : '',
    created: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
    amount,
    currency: String(invoice.currency || 'aud').toLowerCase().slice(0, 8),
    status: String(invoice.status || 'unknown').slice(0, 32),
    hostedUrl: stripeHostedUrl(invoice.hosted_invoice_url),
    pdfUrl: stripeHostedUrl(invoice.invoice_pdf),
  };
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    const body = JSON.parse(raw.toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const err = new Error('Send JSON.');
      err.status = 400;
      throw err;
    }
    return body;
  } catch (err) {
    if (err.status) throw err;
    const invalid = new Error('Send JSON.');
    invalid.status = 400;
    throw invalid;
  }
}

function requireSession(req, res, store) {
  const user = currentUser(req, store);
  if (!user) {
    json(res, 401, { error: 'Sign in to open your account.' });
    return null;
  }
  return user;
}

async function sendMagicEmail(email, link, savingPassword = false) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAGIC_LINK_FROM;
  if (!key || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Hopewick sign-in link',
      text: [
        'Here is your Hopewick sign-in link. It works for 30 minutes and can only be used once.',
        '',
        link,
        '',
        savingPassword
          ? 'Opening this link also saves the password you just chose. You can then sign in with that password, and you stay signed in on this device until you sign out.'
          : 'After you open it you stay signed in on this device until you sign out.',
        '',
        'If you did not ask for this, you can ignore this email. Your password will not change.',
        'Hopewick is an AI recovery companion, not a crisis service. In an emergency call 000.',
      ].join('\n'),
    }),
  });
  if (!response.ok) {
    console.error('Sign-in email was not sent. Provider status:', response.status);
    const err = new Error('Could not send the sign-in email. Try again in a little while.');
    err.status = 502;
    throw err;
  }
  return true;
}

function applySubscription(user, sub) {
  user.stripeSubscriptionId = sub.id || user.stripeSubscriptionId || null;
  const customer = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id);
  if (customer) user.stripeCustomerId = customer;
  user.subscriptionStatus = sub.status || 'none';
  user.currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  if (Object.prototype.hasOwnProperty.call(sub, 'cancel_at_period_end')) {
    user.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  }
  if (user.subscriptionStatus === 'canceled' || user.subscriptionStatus === 'incomplete_expired' || user.subscriptionStatus === 'none') {
    user.cancelAtPeriodEnd = false;
  }
  return user;
}

function findUserForStripeObject(store, object) {
  const userId = (object.metadata && object.metadata.userId) || object.client_reference_id || '';
  if (userId) {
    const byId = store.findById(userId);
    if (byId) return byId;
  }
  const customer = typeof object.customer === 'string' ? object.customer : (object.customer && object.customer.id);
  if (customer) {
    const byCustomer = store.findByStripeCustomer(customer);
    if (byCustomer) return byCustomer;
  }
  const email = object.customer_email || object.customer_details?.email || object.email;
  if (email) return store.findByEmail(email);
  return null;
}

async function handleWebhook(store, raw) {
  const event = verifyStripeEvent(raw.body, raw.signature, process.env.STRIPE_WEBHOOK_SECRET);
  const type = event.type;
  const object = event.data && event.data.object;
  if (!object) return { received: true, ignored: true };

  if (type === 'checkout.session.completed') {
    const user = findUserForStripeObject(store, object);
    if (!user) return { received: true, matched: false };
    if (object.customer) user.stripeCustomerId = String(object.customer);
    if (object.mode === 'setup') {
      store.save(user);
      return { received: true, matched: true, setup: true };
    }
    if (object.subscription) {
      const sub = await stripeRequest('GET', `/subscriptions/${object.subscription}`);
      applySubscription(user, sub);
    } else if (object.payment_status === 'paid') {
      user.subscriptionStatus = 'active';
    }
    store.save(user);
    return { received: true, matched: true, subscriptionStatus: user.subscriptionStatus };
  }

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const user = findUserForStripeObject(store, object);
    if (!user) return { received: true, matched: false };
    if (type === 'customer.subscription.deleted') {
      user.stripeSubscriptionId = object.id || user.stripeSubscriptionId;
      user.subscriptionStatus = 'canceled';
      user.cancelAtPeriodEnd = false;
      if (object.customer) user.stripeCustomerId = String(object.customer);
    } else {
      applySubscription(user, object);
    }
    store.save(user);
    return { received: true, matched: true, subscriptionStatus: user.subscriptionStatus };
  }

  return { received: true, ignored: true };
}

const PRIVATE_DIRS = new Set(['server', 'tests', 'tools', 'docs', 'node_modules']);
const PRIVATE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'dockerfile',
  'render.yaml',
  'setup.md',
  'readme.md',
  'license',
]);

function blockedStatic(rel) {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm) return false;
  const segments = norm.split('/').filter(Boolean);
  if (!segments.length) return false;
  if (segments.some((seg) => seg.startsWith('.'))) return true;
  if (PRIVATE_DIRS.has(segments[0].toLowerCase())) return true;
  if (segments.length === 1 && PRIVATE_FILES.has(segments[0].toLowerCase())) return true;
  if (norm === 'app/data/word-for-the-day.js' || norm === 'app/data/just-for-today.js') return true;
  return false;
}

function resolveStatic(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^\/+/, '');
  if (blockedStatic(rel)) return null;
  const rootResolved = path.resolve(root);
  let full = path.resolve(rootResolved, rel);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function serveStatic(root, req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }
  const file = resolveStatic(root, urlPath);
  if (!file) {
    json(res, 404, { error: 'Not found.' });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function handleApi(store, chats, req, res, url) {
  const route = url.pathname;

  if (req.method === 'GET' && route === '/api/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && route === '/api/billing/config') {
    json(res, 200, {
      checkoutReady: stripeConfigured(),
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      priceConfigured: Boolean(process.env.STRIPE_PRICE_ID),
      devMagic: devMode(),
      currency: 'aud',
      amountLabel: 'AU$20/month',
      trialDays: PLUS_TRIAL_DAYS,
      hopeHosted: hopeConfigured(),
      freeDailyMessages: freeDailyCap(),
      plusDailyMessages: null,
    });
    return;
  }

  if (req.method === 'GET' && route === '/api/readings/today') {
    json(res, 200, todayReadingPayload());
    return;
  }

  if (req.method === 'GET' && route === '/api/plus/library') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in to open Hopewick Plus.', code: 'auth' });
      return;
    }
    if (publicUser(user).plus !== true) {
      json(res, 403, { error: 'Hopewick Plus opens this library.', code: 'plus' });
      return;
    }
    json(res, 200, plusLibraryPayload());
    return;
  }


  if (req.method === 'GET' && route === '/api/chats') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in to open saved chats.', code: 'auth' });
      return;
    }
    json(res, 200, { profiles: chats.list(user.id) });
    return;
  }

  if (req.method === 'PUT' && route === '/api/chats') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in to save chats.', code: 'auth' });
      return;
    }
    const raw = await readBody(req, 2_000_000);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
      json(res, 400, { error: 'Send chats as JSON.' });
      return;
    }
    const profileId = String(body.profileId || '').trim();
    if (!validProfileId(profileId)) {
      json(res, 400, { error: 'Choose a profile before saving chats.' });
      return;
    }
    const profile = chats.merge(user.id, profileId, {
      name: body.name,
      conversations: body.conversations,
      activeId: body.activeId,
      removedIds: body.removedIds,
    });
    json(res, 200, { profile });
    return;
  }

  if (req.method === 'GET' && route === '/api/hope/usage') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in to chat with Hope.', code: 'auth' });
      return;
    }
    json(res, 200, usageSnapshot(user));
    return;
  }

  if (req.method === 'POST' && route === '/api/hope/chat') {
    await handleHopeChat(store, req, res);
    return;
  }

  if (req.method === 'GET' && route === '/api/auth/me') {
    const user = currentUser(req, store);
    const headers = {};
    if (user) {
      const cookie = touchSession(user, req, store);
      if (cookie) headers['Set-Cookie'] = cookie;
    }
    json(res, 200, publicUser(user), headers);
    return;
  }

  if (req.method === 'POST' && route === '/api/auth/logout') {
    const user = currentUser(req, store);
    if (user) {
      user.session = null;
      store.save(user);
    }
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
    return;
  }

  if (req.method === 'POST' && route === '/api/auth/login') {
    const raw = await readBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
      json(res, 400, { error: 'Send the email and password as JSON.' });
      return;
    }
    const email = String(body.email || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_RE.test(email) || email.length > 120) {
      json(res, 400, { error: 'Enter a valid email address.' });
      return;
    }
    if (!password) {
      json(res, 400, { error: 'Enter your email and password. If you do not have a password yet, email yourself a sign-in link.' });
      return;
    }
    if (!allowLoginIp(req) || passwordBlocked(email)) {
      json(res, 429, { error: 'Too many sign-in attempts. Try again in a little while, or email yourself a sign-in link.' });
      return;
    }
    const user = store.findByEmail(email);
    const ok = await passwordMatches(password, user);
    if (!ok) {
      // Same response whether the email is unknown, has no password, or the password is wrong.
      notePasswordFailure(email);
      json(res, 401, { error: 'That email or password is not right.', code: 'password' });
      return;
    }
    const cookie = startSession(user, req, store);
    json(res, 200, publicUser(user), { 'Set-Cookie': cookie });
    return;
  }

  if (req.method === 'POST' && route === '/api/auth/password') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in before you create a password.' });
      return;
    }
    const raw = await readBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
      json(res, 400, { error: 'Send the password as JSON.' });
      return;
    }
    const password = typeof body.password === 'string' ? body.password : '';
    const problem = passwordError(password);
    if (problem) {
      json(res, 400, { error: problem });
      return;
    }
    if (hasRawCardFields(body)) {
      json(res, 400, { error: 'Card details are not stored here.' });
      return;
    }
    if (user.passwordHash) {
      if (tooManyHits(passwordChangeFailures, user.id)) {
        json(res, 429, { error: 'Too many password attempts. Try again in a little while, or use the email sign-in link.' });
        return;
      }
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const confirm = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
      if (!current) {
        json(res, 400, { error: 'Enter your current password.', code: 'current_password' });
        return;
      }
      if (confirm !== password) {
        json(res, 400, { error: 'Those passwords don’t match yet.' });
        return;
      }
      const matches = await verifyPassword(current, user.passwordHash);
      if (!matches) {
        noteHit(passwordChangeFailures, user.id);
        json(res, 401, { error: 'That current password isn’t right.', code: 'current_password' });
        return;
      }
    }
    user.passwordHash = await hashPassword(password);
    passwordChangeFailures.delete(user.id);
    user.pendingPassword = null;
    const cookie = touchSession(user, req, store);
    json(res, 200, { ok: true, hasPassword: true }, cookie ? { 'Set-Cookie': cookie } : undefined);
    return;
  }

  if (req.method === 'POST' && route === '/api/auth/magic-link') {
    const raw = await readBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
      json(res, 400, { error: 'Send the email as JSON.' });
      return;
    }
    const email = String(body.email || '').trim().toLowerCase();
    const chosen = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_RE.test(email) || email.length > 120) {
      json(res, 400, { error: 'Enter a valid email address.' });
      return;
    }
    if (chosen) {
      const problem = passwordError(chosen);
      if (problem) {
        json(res, 400, { error: problem });
        return;
      }
    }
    if (!allowMagicLink(email, req)) {
      json(res, 429, { error: 'Too many sign-in links for that email. Try again in a little while.' });
      return;
    }
    const user = store.findByEmail(email) || store.createUser(email);
    const token = crypto.randomBytes(32).toString('hex');
    user.magic = { hash: hashToken(token), expiresAt: Date.now() + MAGIC_MS };
    if (chosen) {
      user.pendingPassword = { hash: await hashPassword(chosen), magicHash: hashToken(token) };
    } else {
      user.pendingPassword = null;
    }
    store.save(user);
    const next = safeNext(body.next) || '/app/?signedin=1';
    const link = `${publicBase(req)}/api/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
    let emailed = false;
    if (process.env.RESEND_API_KEY && process.env.MAGIC_LINK_FROM) {
      emailed = await sendMagicEmail(email, link, Boolean(chosen));
    }
    const dev = devMode();
    if (!emailed && !dev) {
      json(res, 503, { error: 'Email sign-in is not configured on this server yet.' });
      return;
    }
    if (dev) console.log(`Hopewick dev sign-in link for ${email}: ${link}`);
    const savedNote = chosen ? ' Opening it saves the password you chose.' : '';
    json(res, 200, {
      ok: true,
      emailed,
      devLink: dev ? link : undefined,
      message: emailed
        ? `Check your email for a sign-in link.${savedNote} It expires in 30 minutes.`
        : `Developer mode: use the sign-in link shown here.${savedNote} It expires in 30 minutes.`,
    });
    return;
  }

  if (req.method === 'GET' && route === '/api/auth/verify') {
    const token = url.searchParams.get('token') || '';
    const match = store.findByMagic(token);
    if (!match) {
      json(res, 400, { error: 'That sign-in link is invalid or has expired. Request a new one.' });
      return;
    }
    const magicHash = hashToken(token);
    const pending = match.pendingPassword;
    match.magic = null;
    if (pending && pending.hash && pending.magicHash === magicHash) {
      match.passwordHash = pending.hash;
    }
    match.pendingPassword = null;
    const cookie = startSession(match, req, store);
    const next = safeNext(url.searchParams.get('next')) || '/app/?signedin=1';
    res.writeHead(302, {
      Location: next,
      'Set-Cookie': cookie,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && route === '/api/billing/checkout') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in before checkout.' });
      return;
    }
    if (!stripeConfigured()) {
      json(res, 503, { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.' });
      return;
    }
    if (isFounderPlusEmail(user.email)) {
      json(res, 409, { error: 'Hopewick Plus is already included on this account. No payment is needed.' });
      return;
    }
    if (isPlusStatus(user.subscriptionStatus)) {
      json(res, 409, { error: 'Hopewick Plus is already active on this account. Use Manage subscription to make changes.' });
      return;
    }
    if (!user.stripeCustomerId) {
      const customer = await stripeRequest('POST', '/customers', {
        email: user.email,
        'metadata[userId]': user.id,
        name: user.email,
      });
      user.stripeCustomerId = customer.id;
      store.save(user);
    }
    const base = publicBase(req);
    const sessionParams = {
      mode: 'subscription',
      customer: user.stripeCustomerId,
      client_reference_id: user.id,
      'line_items[0][price]': process.env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: `${base}/app/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/app/?checkout=cancel`,
      'metadata[userId]': user.id,
      'metadata[email]': user.email,
      'subscription_data[metadata][userId]': user.id,
      allow_promotion_codes: 'true',
      locale: 'en',
      // Collect a card now so the existing monthly price bills when the trial ends.
      payment_method_collection: 'always',
    };
    // First subscription only. A canceled account already has a Stripe subscription id.
    if (!user.stripeSubscriptionId) {
      sessionParams['subscription_data[trial_period_days]'] = String(PLUS_TRIAL_DAYS);
    }
    const session = await stripeRequest('POST', '/checkout/sessions', sessionParams);
    json(res, 200, { url: session.url, id: session.id });
    return;
  }

  if (req.method === 'POST' && route === '/api/billing/portal') {
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in before opening the billing portal.' });
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      json(res, 503, { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
      return;
    }
    if (!user.stripeCustomerId) {
      json(res, 400, { error: 'Subscribe first, then you can manage billing here.' });
      return;
    }
    let returnTo = '';
    const raw = await readBody(req);
    if (raw.length) {
      let body = {};
      try { body = JSON.parse(raw.toString('utf8')); } catch {
        json(res, 400, { error: 'Send JSON.' });
        return;
      }
      if (body && body.returnTo === 'account') returnTo = 'account';
    }
    const returnUrl = returnTo === 'account'
      ? `${publicBase(req)}/app/?myaccount=1&section=payment`
      : `${publicBase(req)}/app/?portal=return`;
    const portal = await stripeRequest('POST', '/billing_portal/sessions', {
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    json(res, 200, { url: portal.url });
    return;
  }

  if (req.method === 'POST' && route === '/api/billing/webhook') {
    const raw = await readBody(req);
    const result = await handleWebhook(store, {
      body: raw,
      signature: req.headers['stripe-signature'] || '',
    });
    json(res, 200, result);
    return;
  }

  if (req.method === 'POST' && route === '/api/billing/dev-set') {
    if (!devMode()) {
      json(res, 404, { error: 'Not found.' });
      return;
    }
    const user = currentUser(req, store);
    if (!user) {
      json(res, 401, { error: 'Sign in first.' });
      return;
    }
    const raw = await readBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
      json(res, 400, { error: 'Send JSON.' });
      return;
    }
    const allowed = new Set(['none', 'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']);
    const status = String(body.status || '');
    if (!allowed.has(status)) {
      json(res, 400, { error: 'Unknown subscription status.' });
      return;
    }
    user.subscriptionStatus = status;
    if (PLUS_OK.has(status) && !user.stripeSubscriptionId) user.stripeSubscriptionId = 'sub_dev';
    if (status === 'none' || status === 'canceled') {
      user.cancelAtPeriodEnd = false;
      /* keep customer id so the portal can still be tested after a real checkout */
    }
    user.currentPeriodEnd = PLUS_OK.has(status) ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : user.currentPeriodEnd;
    store.save(user);
    json(res, 200, publicUser(user));
    return;
  }

  if (url.pathname.startsWith('/api/account')) {
    await handleAccountApi(store, req, res, route);
    return;
  }

  json(res, 404, { error: 'Not found.' });
}

async function handleAccountApi(store, req, res, route) {
  if (req.method === 'GET' && route === '/api/account') {
    const user = requireSession(req, res, store);
    if (!user) return;
    json(res, 200, accountSummary(user));
    return;
  }

  if (req.method === 'POST' && route === '/api/account/profile') {
    const user = requireSession(req, res, store);
    if (!user) return;
    const body = await readJson(req);
    if (hasRawCardFields(body)) {
      json(res, 400, { error: 'Card details are not stored here. Add a card on Stripe’s secure page.' });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'name') || !Object.prototype.hasOwnProperty.call(body, 'phone')) {
      json(res, 400, { error: 'Send your name and phone.' });
      return;
    }
    const name = cleanAccountName(body.name);
    if (!name.ok) {
      json(res, 400, { error: name.error, field: 'name' });
      return;
    }
    const phone = cleanAccountPhone(body.phone);
    if (!phone.ok) {
      json(res, 400, { error: phone.error, field: 'phone' });
      return;
    }
    user.name = name.value;
    user.phone = phone.value;
    store.save(user);
    if (user.stripeCustomerId && process.env.STRIPE_SECRET_KEY && (user.name || user.phone)) {
      try {
        const params = {};
        if (user.name) params.name = user.name;
        if (user.phone) params.phone = user.phone;
        await stripeRequest('POST', `/customers/${user.stripeCustomerId}`, params);
      } catch (err) {
        console.error('Stripe customer profile update failed:', err && err.status ? err.status : 'error');
      }
    }
    const summary = accountSummary(user);
    json(res, 200, Object.assign({}, summary, {
      ok: true,
      emailNote: 'Your sign-in email stays as it is. Changing it isn’t available.',
    }));
    return;
  }

  if (req.method === 'GET' && route === '/api/account/payment-method') {
    const user = requireSession(req, res, store);
    if (!user) return;
    if (!process.env.STRIPE_SECRET_KEY) {
      json(res, 200, { card: null, configured: false });
      return;
    }
    if (!user.stripeCustomerId) {
      json(res, 200, { card: null, configured: true });
      return;
    }
    const list = await stripeRequest('GET', '/payment_methods', {
      customer: user.stripeCustomerId,
      type: 'card',
      limit: '5',
    });
    const methods = Array.isArray(list.data) ? list.data : [];
    const card = methods.map(cardSummary).find(Boolean) || null;
    json(res, 200, { card, configured: true });
    return;
  }

  if (req.method === 'POST' && route === '/api/account/setup-card') {
    const user = requireSession(req, res, store);
    if (!user) return;
    const body = await readJson(req);
    if (hasRawCardFields(body)) {
      json(res, 400, { error: 'Card details are not stored here. You’ll enter them on Stripe’s secure page.' });
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      json(res, 503, { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
      return;
    }
    if (isFounderPlusEmail(user.email) && !isPlusStatus(user.subscriptionStatus)) {
      json(res, 409, { error: 'Founder access doesn’t need a card.' });
      return;
    }
    if (!user.stripeCustomerId) {
      const customer = await stripeRequest('POST', '/customers', {
        email: user.email,
        name: user.name || undefined,
        phone: user.phone || undefined,
        'metadata[userId]': user.id,
      });
      user.stripeCustomerId = customer.id;
      store.save(user);
    }
    const base = publicBase(req);
    const session = await stripeRequest('POST', '/checkout/sessions', {
      mode: 'setup',
      customer: user.stripeCustomerId,
      client_reference_id: user.id,
      success_url: `${base}/app/?myaccount=1&section=payment&card=saved`,
      cancel_url: `${base}/app/?myaccount=1&section=payment&card=cancel`,
      'metadata[userId]': user.id,
      'payment_method_types[0]': 'card',
    });
    json(res, 200, { url: session.url });
    return;
  }

  if (req.method === 'GET' && route === '/api/account/invoices') {
    const user = requireSession(req, res, store);
    if (!user) return;
    if (!process.env.STRIPE_SECRET_KEY || !user.stripeCustomerId) {
      json(res, 200, { invoices: [], configured: Boolean(process.env.STRIPE_SECRET_KEY) });
      return;
    }
    const list = await stripeRequest('GET', '/invoices', {
      customer: user.stripeCustomerId,
      limit: '24',
    });
    const invoices = (Array.isArray(list.data) ? list.data : []).map(invoiceSummary);
    json(res, 200, { invoices, configured: true });
    return;
  }

  if (req.method === 'POST' && route === '/api/account/cancel') {
    const user = requireSession(req, res, store);
    if (!user) return;
    const body = await readJson(req);
    if (body.confirm !== true) {
      json(res, 400, { error: 'Confirm cancellation first.', code: 'confirm' });
      return;
    }
    if (isFounderPlusEmail(user.email) && !isPlusStatus(user.subscriptionStatus) && !user.stripeSubscriptionId) {
      json(res, 409, { error: 'Founder access doesn’t have a paid subscription to cancel.' });
      return;
    }
    const stored = user.subscriptionStatus || 'none';
    const cancelable = ['active', 'trialing', 'past_due', 'unpaid'].includes(stored) && user.stripeSubscriptionId && !user.cancelAtPeriodEnd;
    if (!cancelable) {
      json(res, 409, { error: 'There isn’t an active subscription to cancel.' });
      return;
    }
    if (String(user.stripeSubscriptionId).startsWith('sub_dev') || !process.env.STRIPE_SECRET_KEY) {
      user.cancelAtPeriodEnd = true;
      store.save(user);
      json(res, 200, Object.assign({ ok: true, local: true }, accountSummary(user)));
      return;
    }
    const sub = await stripeRequest('POST', `/subscriptions/${user.stripeSubscriptionId}`, {
      cancel_at_period_end: 'true',
    });
    applySubscription(user, sub);
    user.cancelAtPeriodEnd = true;
    store.save(user);
    json(res, 200, Object.assign({ ok: true }, accountSummary(user)));
    return;
  }

  if (req.method === 'POST' && route === '/api/account/delete') {
    const user = requireSession(req, res, store);
    if (!user) return;
    if (tooManyHits(deleteAttempts, user.id)) {
      json(res, 429, { error: 'Too many delete attempts. Try again in a little while.' });
      return;
    }
    noteHit(deleteAttempts, user.id);
    const body = await readJson(req);
    if (hasRawCardFields(body)) {
      json(res, 400, { error: 'Card details are not stored here.' });
      return;
    }
    if (body.confirm !== 'DELETE') {
      json(res, 400, { error: 'Type DELETE to confirm account deletion.', code: 'confirm' });
      return;
    }
    const status = user.subscriptionStatus || 'none';
    const live = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(status);
    let subscriptionCanceled = false;
    if (live && user.stripeSubscriptionId) {
      if (String(user.stripeSubscriptionId).startsWith('sub_dev') || !process.env.STRIPE_SECRET_KEY) {
        subscriptionCanceled = true;
      } else {
        try {
          await stripeRequest('DELETE', `/subscriptions/${user.stripeSubscriptionId}`);
          subscriptionCanceled = true;
        } catch (err) {
          const missing = /no such subscription/i.test(String(err && err.message || ''));
          if (!missing) {
            json(res, 502, { error: 'The subscription could not be cancelled, so the account was not deleted. Try again, or cancel it from Manage billing first.' });
            return;
          }
          subscriptionCanceled = true;
        }
      }
    }
    const removed = store.remove(user.id);
    deleteAttempts.delete(user.id);
    passwordChangeFailures.delete(user.id);
    json(res, 200, {
      ok: true,
      removed,
      subscriptionCanceled,
      deleted: [
        'Your Hopewick sign-in on this server (email, name, phone, and password)',
        'Your subscription status and today’s Hope message count on this server',
      ],
      kept: [
        'Chats, journal, profiles, and other notes in this browser — clear them in Settings if you want them gone from this device',
        'Invoices Stripe already has, so a receipt can still be found. Hopewick never stored your card number.',
      ],
    }, { 'Set-Cookie': clearCookie(req) });
    return;
  }

  json(res, 404, { error: 'Not found.' });
}

function completionJson(text) {
  return {
    id: 'hopewick-hosted',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  };
}

function writeSse(res, text) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
  res.end(`data: ${payload}\n\ndata: [DONE]\n\n`);
}

async function pipeUpstream(res, upstream) {
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

async function handleHopeChat(store, req, res) {
  const user = currentUser(req, store);
  if (!user) {
    json(res, 401, { error: { message: 'Sign in to chat with Hope. Free is 5 messages a day. Hopewick Plus has no daily message limit.', code: 'auth' } });
    return;
  }

  const raw = await readBody(req, 200_000);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch {
    json(res, 400, { error: { message: 'Send the conversation as JSON.' } });
    return;
  }

  let messages;
  try { messages = sanitizeMessages(body.messages); } catch (err) {
    json(res, err.status || 400, { error: { message: err.message } });
    return;
  }

  const purpose = body.purpose === 'memory' ? 'memory' : 'chat';
  const stream = body.stream === true && purpose === 'chat';
  const crisis = purpose === 'chat' && isCrisisText(lastUserText(messages));
  if (crisis && !hopeConfigured()) {
    if (stream) writeSse(res, CRISIS_FALLBACK);
    else json(res, 200, completionJson(CRISIS_FALLBACK));
    return;
  }
  if (!hopeConfigured()) {
    json(res, 503, { error: { message: 'Hosted Hope is not connected on this server yet. Today’s Readings, crisis support, and Get help still work.', code: 'unconfigured' } });
    return;
  }
  const admission = admitHopeCall(user, { purpose, crisis });
  if (admission.staticOnly) {
    if (stream) writeSse(res, CRISIS_FALLBACK);
    else json(res, 200, completionJson(CRISIS_FALLBACK));
    return;
  }
  if (!admission.ok) {
    const message = admission.code === 'daily_cap'
      ? capMessage(user, admission.limit)
      : 'Hope can only note memories for messages you have already sent today.';
    json(res, admission.status, {
      error: { message, code: admission.code },
      limit: admission.limit,
      used: admission.usage.count,
      remaining: admission.limit == null ? null : Math.max(0, admission.limit - admission.usage.count),
      resetLabel: admission.code === 'daily_cap' ? HOPE_RESET_LABEL : null,
    });
    return;
  }

  if (!allowChatBurst(req, user)) {
    if (crisis) {
      if (stream) writeSse(res, CRISIS_FALLBACK);
      else json(res, 200, completionJson(CRISIS_FALLBACK));
      return;
    }
    json(res, 429, {
      error: {
        message: 'Hope needs a short pause. Please try again in a few minutes.',
        code: 'rate',
      },
    });
    return;
  }

  commitSpend(user, admission);
  store.save(user);

  let upstream;
  try {
    upstream = await fetch(openAiEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completionBody(messages, {
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream,
      })),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    rollbackSpend(user, admission);
    store.save(user);
    console.error('Hosted Hope request failed:', err && err.name ? err.name : 'error');
    json(res, 502, { error: { message: 'Hope could not reach the model just now. Please try again in a moment.', code: 'upstream' } });
    return;
  }

  if (!upstream.ok) {
    rollbackSpend(user, admission);
    store.save(user);
    upstream.body?.cancel?.().catch(() => {});
    console.error('Hosted Hope upstream status:', upstream.status);
    if (crisis) {
      if (stream) writeSse(res, CRISIS_FALLBACK);
      else json(res, 200, completionJson(CRISIS_FALLBACK));
      return;
    }
    json(res, 502, { error: { message: 'Hope could not complete that reply. Please try again in a moment.', code: 'upstream' } });
    return;
  }

  try {
    if (stream) {
      await pipeUpstream(res, upstream);
      return;
    }
    const data = await upstream.json();
    json(res, 200, data);
  } catch (err) {
    console.error('Hosted Hope response failed:', err && err.name ? err.name : 'error');
    if (!res.headersSent) {
      rollbackSpend(user, admission);
      store.save(user);
      json(res, 502, { error: { message: 'Hope could not complete that reply. Please try again in a moment.', code: 'upstream' } });
    } else {
      res.end();
    }
  }
}

export function createApp({ store, chats, root = REPO_ROOT } = {}) {
  if (!store) throw new Error('createApp requires a store');
  const chatStore = chats || createChatStore(path.join(REPO_ROOT, 'server', 'data', 'chats.json'));
  return async function onRequest(req, res) {
    installSecurityHeaders(req, res);
    try {
      if (maybeCanonicalRedirect(req, res)) return;
      const host = req.headers.host || '127.0.0.1';
      const url = new URL(req.url || '/', `http://${host}`);
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        const crossSiteWrite = (req.method === 'POST' && url.pathname !== '/api/billing/webhook') || req.method === 'PUT';
        if (crossSiteWrite && !originAllowed(req)) {
          req.resume();
          json(res, 403, { error: 'That request was blocked.' });
          return;
        }
        await handleApi(store, chatStore, req, res, url);
        return;
      }
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      serveStatic(root, req, res, pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: err.message || 'Something went wrong.' });
      else res.end();
    }
  };
}

export function startServer({
  port = Number(process.env.PORT || 8787),
  host = '127.0.0.1',
  storePath = process.env.BILLING_STORE || path.join(REPO_ROOT, 'server', 'data', 'users.json'),
  chatsPath,
  root = REPO_ROOT,
} = {}) {
  const store = createStore(storePath);
  const chatFile = chatsPath || process.env.CHATS_STORE || path.join(path.dirname(storePath), 'chats.json');
  const chats = createChatStore(chatFile);
  const server = http.createServer(createApp({ store, chats, root }));
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFile();
  if (process.env.NODE_ENV === 'production' && devMode()) {
    console.error('Refusing to start: NODE_ENV=production requires HOPEWICK_DEV=0 so magic links are not returned to the browser.');
    process.exit(1);
  }
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  const storePath = process.env.BILLING_STORE || path.join(REPO_ROOT, 'server', 'data', 'users.json');
  startServer({ host, storePath }).then((server) => {
    const addr = server.address();
    console.log(`Hopewick is running at http://${host}:${addr.port}`);
    console.log(`Health: http://${host}:${addr.port}/api/health`);
    console.log(`Account file: ${storePath}`);
    if (!stripeConfigured()) console.log('Stripe checkout is not configured yet (STRIPE_SECRET_KEY, STRIPE_PRICE_ID).');
    if (devMode()) console.log('Developer mode is on: magic links are printed here and returned to the browser.');
    else if (!process.env.RESEND_API_KEY || !process.env.MAGIC_LINK_FROM) {
      console.log('Magic-link email is not configured. Set RESEND_API_KEY and MAGIC_LINK_FROM or sign-in will return 503.');
    }
  });
}
