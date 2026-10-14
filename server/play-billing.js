/**
 * Google Play Billing for the Hopewick Android app (Trusted Web Activity).
 * Inside the TWA, Hopewick Plus is bought through Play (Digital Goods API +
 * Payment Request). The app sends the purchaseToken here; we verify it with
 * the Play Developer API (purchases.subscriptionsv2.get), acknowledge it, and
 * mark the account Plus. Inert unless GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is set.
 */
import crypto from 'node:crypto';

export const PLAY_PACKAGE_NAME = 'com.bridgebite.hopewick';
export const PLAY_PRODUCT_ID = 'hopewick_plus_monthly';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

export function playPackageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME || PLAY_PACKAGE_NAME;
}

export function playProductId() {
  return process.env.GOOGLE_PLAY_PRODUCT_ID || PLAY_PRODUCT_ID;
}

export function playServiceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (sa && sa.client_email && sa.private_key) return sa;
  } catch { /* fall through */ }
  return null;
}

export function playBillingConfigured() {
  return Boolean(playServiceAccount());
}

let cachedToken = null;
export function resetPlayTokenCache() { cachedToken = null; }

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = playServiceAccount();
  if (!sa) throw Object.assign(new Error('Google Play billing is not configured.'), { status: 503 });
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600,
  }))}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const assertion = `${unsigned}.${b64url(sig)}`;
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw Object.assign(new Error('Could not reach Google Play. Try again shortly.'), { status: 502 });
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

export async function getPlaySubscription(purchaseToken) {
  const token = await accessToken();
  const url = `${API}/${encodeURIComponent(playPackageName())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 400 || res.status === 404 || res.status === 410) {
    throw Object.assign(new Error('Google Play did not recognise that purchase.'), { status: 400 });
  }
  if (!res.ok) throw Object.assign(new Error('Could not verify the purchase with Google Play.'), { status: 502 });
  return res.json();
}

export async function acknowledgePlaySubscription(productId, purchaseToken) {
  const token = await accessToken();
  const url = `${API}/${encodeURIComponent(playPackageName())}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw Object.assign(new Error('Could not acknowledge the Google Play purchase.'), { status: 502 });
  return true;
}

/** Map a SubscriptionPurchaseV2 to Hopewick's Stripe-style status fields. */
export function mapPlaySubscription(sub, productId = playProductId()) {
  const items = Array.isArray(sub && sub.lineItems) ? sub.lineItems : [];
  const item = items.find((li) => li.productId === productId) || null;
  const expiry = item && item.expiryTime ? new Date(item.expiryTime) : null;
  const notExpired = expiry ? expiry.getTime() > Date.now() : false;
  const trial = Boolean(item && item.offerDetails && item.offerDetails.offerId
    && /trial/i.test(String(item.offerDetails.offerId)));
  let status = 'none';
  let cancelAtPeriodEnd = false;
  switch (sub && sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE': status = notExpired ? (trial ? 'trialing' : 'active') : 'canceled'; break;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD': status = notExpired ? 'active' : 'past_due'; break;
    case 'SUBSCRIPTION_STATE_CANCELED': status = notExpired ? (trial ? 'trialing' : 'active') : 'canceled'; cancelAtPeriodEnd = notExpired; break;
    case 'SUBSCRIPTION_STATE_ON_HOLD': status = 'unpaid'; break;
    case 'SUBSCRIPTION_STATE_PAUSED': status = 'paused'; break;
    case 'SUBSCRIPTION_STATE_PENDING': status = 'incomplete'; break;
    case 'SUBSCRIPTION_STATE_EXPIRED': status = 'canceled'; break;
    default: status = 'none';
  }
  if (!item) status = 'none';
  return {
    matchesProduct: Boolean(item),
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd: expiry ? expiry.toISOString() : null,
    needsAck: (sub && sub.acknowledgementState) === 'ACKNOWLEDGEMENT_STATE_PENDING',
    linkedPurchaseToken: (sub && sub.linkedPurchaseToken) || null,
  };
}

export function applyPlayState(user, purchaseToken, mapped) {
  user.billingProvider = 'google_play';
  user.playPurchaseToken = purchaseToken;
  user.playProductId = playProductId();
  user.subscriptionStatus = mapped.status;
  user.currentPeriodEnd = mapped.currentPeriodEnd;
  user.cancelAtPeriodEnd = mapped.cancelAtPeriodEnd;
  user.playCheckedAt = new Date().toISOString();
  return user;
}

/**
 * Re-check a Play subscription on session load when its paid period has
 * ended (or the last check is older than 12h). Never throws.
 */
export async function refreshPlayIfStale(user, store) {
  if (!user || user.billingProvider !== 'google_play' || !user.playPurchaseToken) return false;
  if (!playBillingConfigured()) return false;
  const end = user.currentPeriodEnd ? Date.parse(user.currentPeriodEnd) : 0;
  const checked = user.playCheckedAt ? Date.parse(user.playCheckedAt) : 0;
  if (end > Date.now() && Date.now() - checked < 12 * 60 * 60 * 1000) return false;
  try {
    const sub = await getPlaySubscription(user.playPurchaseToken);
    applyPlayState(user, user.playPurchaseToken, mapPlaySubscription(sub));
    store.save(user);
    return true;
  } catch (err) {
    console.error('Play subscription re-check failed:', err.message);
    return false;
  }
}
