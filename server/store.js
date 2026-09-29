/**
 * Tiny JSON file store for Hopewick accounts.
 * Holds email, a scrypt password hash when one is set, magic-link and
 * session hashes, and Stripe subscription status.
 * Conversations are not stored here — they stay in the browser.
 * Passwords are never stored in plaintext.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function newId() {
  return crypto.randomBytes(16).toString('hex');
}

export function createStore(filePath) {
  let data = { users: [] };

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && Array.isArray(parsed.users)) data = parsed;
    } catch {
      data = { users: [] };
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  load();

  function save(user) {
    const i = data.users.findIndex((u) => u.id === user.id);
    if (i >= 0) data.users[i] = user;
    else data.users.push(user);
    persist();
    return user;
  }

  return {
    findByEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      return data.users.find((u) => u.email === e) || null;
    },
    findById(id) {
      return data.users.find((u) => u.id === id) || null;
    },
    findBySession(token) {
      if (!token) return null;
      const h = hashToken(token);
      const now = Date.now();
      return data.users.find((u) => u.session && u.session.hash === h && u.session.expiresAt > now) || null;
    },
    findByStripeCustomer(customerId) {
      if (!customerId) return null;
      return data.users.find((u) => u.stripeCustomerId === customerId) || null;
    },
    findByMagic(token) {
      if (!token) return null;
      const h = hashToken(token);
      const now = Date.now();
      return data.users.find((u) => u.magic && u.magic.hash === h && u.magic.expiresAt > now) || null;
    },
    list() {
      return data.users.slice();
    },
    createUser(email) {
      return save({
        id: newId(),
        email: String(email).trim().toLowerCase(),
        createdAt: new Date().toISOString(),
        magic: null,
        session: null,
        passwordHash: null,
        pendingPassword: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'none',
        currentPeriodEnd: null,
      });
    },
    save,
  };
}

export function isPlusStatus(status) {
  return status === 'active' || status === 'trialing';
}

/** Organisations inbox. Never a founder or complimentary Plus address. */
const ORGANISATION_CONTACT = 'admin@bridge-bite-co.com';
const DEFAULT_FOUNDER_PLUS_EMAIL = 'dwaynesimons1990@gmail.com';

/**
 * Complimentary Hopewick Plus. FOUNDER_PLUS_EMAILS (comma-separated) overrides
 * the default. Unset uses the founder address only. An empty value grants none.
 * The organisations contact is ignored even if someone lists it.
 */
export function founderPlusEmails() {
  const raw = process.env.FOUNDER_PLUS_EMAILS;
  const source = raw == null ? DEFAULT_FOUNDER_PLUS_EMAIL : String(raw);
  const emails = source
    .split(/[,;\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes('@') && part !== ORGANISATION_CONTACT);
  return new Set(emails);
}

export function isFounderPlusEmail(email) {
  return founderPlusEmails().has(String(email || '').trim().toLowerCase());
}

export function publicUser(user) {
  if (!user) {
    return {
      signedIn: false,
      id: null,
      email: null,
      subscriptionStatus: 'none',
      currentPeriodEnd: null,
      plus: false,
      complimentary: false,
      founder: false,
      hasPassword: false,
    };
  }
  const storedStatus = user.subscriptionStatus || 'none';
  const paid = isPlusStatus(storedStatus);
  const founder = isFounderPlusEmail(user.email);
  const complimentary = founder && !paid;
  return {
    signedIn: true,
    id: user.id,
    email: user.email,
    subscriptionStatus: complimentary ? 'active' : storedStatus,
    currentPeriodEnd: user.currentPeriodEnd || null,
    plus: paid || complimentary,
    complimentary,
    founder,
    hasPassword: Boolean(user.passwordHash),
  };
}
