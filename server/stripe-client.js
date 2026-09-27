/**
 * Minimal Stripe REST helper (Checkout, Customer Portal, webhooks).
 * No SDK dependency — Node's fetch and crypto are enough for test mode.
 */
import crypto from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export async function stripeRequest(method, apiPath, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.');
    err.status = 503;
    throw err;
  }
  const url = new URL(STRIPE_API + apiPath);
  const headers = { Authorization: `Bearer ${key}` };
  let body;
  if (method === 'GET') {
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.append(k, String(v));
      }
    }
  } else if (params) {
    body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) body.append(k, String(v));
    }
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const response = await fetch(url, { method, headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data.error && data.error.message) || `Stripe request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status >= 500 ? 502 : 502;
    throw err;
  }
  return data;
}

/**
 * Verify a Stripe-Signature header. Returns the parsed event or throws status 400.
 */
export function verifyStripeEvent(rawBody, signatureHeader, secret, nowMs = Date.now()) {
  if (!secret) {
    const err = new Error('Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.');
    err.status = 503;
    throw err;
  }
  if (!signatureHeader) {
    const err = new Error('Missing Stripe-Signature header.');
    err.status = 400;
    throw err;
  }
  const parts = Object.fromEntries(
    String(signatureHeader).split(',').map((piece) => {
      const i = piece.indexOf('=');
      return [piece.slice(0, i), piece.slice(i + 1)];
    }),
  );
  const timestamp = parts.t;
  const signatures = String(signatureHeader)
    .split(',')
    .filter((piece) => piece.startsWith('v1='))
    .map((piece) => piece.slice(3));
  if (!timestamp || !signatures.length) {
    const err = new Error('Invalid Stripe-Signature header.');
    err.status = 400;
    throw err;
  }
  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    const err = new Error('Stripe signature timestamp is outside the tolerance window.');
    err.status = 400;
    throw err;
  }
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const ok = signatures.some((sig) => timingSafeEqualHex(expected, sig));
  if (!ok) {
    const err = new Error('Stripe signature did not match.');
    err.status = 400;
    throw err;
  }
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    const err = new Error('Webhook body was not JSON.');
    err.status = 400;
    throw err;
  }
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
