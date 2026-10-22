/**
 * Tiny JSON file store for Hopewick accounts.
 * Holds email, an optional name and phone, a scrypt password hash when one
 * is set, magic-link and session hashes, and Stripe subscription status.
 * Card numbers are never stored here.
 * Saved chats live in chats.json, not in this account file.
 * Passwords are never stored in plaintext.
 */
import crypto from 'node:crypto';
import { createJsonFile } from './json-file.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * How long a sign-in counts as a fresh check for a passwordless account.
 * 10 minutes. Set on the one session by startSession after a password
 * sign-in, a magic-link verify, or Google sign-in. Not a second factor.
 * The magic-link token itself stays single-use and is not stored here.
 * Accounts that have a password still send currentPassword on the
 * sensitive request. This window does not replace that check.
 */
export const REAUTH_MS = 10 * 60 * 1000;

/** Most sessions one account keeps at once (website, phones, tablets). Oldest go first. */
export const MAX_SESSIONS = 10;

/**
 * Sessions live in user.sessions (one entry per signed-in device). Older records
 * kept a single user.session; it is moved into the array, never dropped, so a
 * device that was signed in before this change stays signed in.
 */
export function normalizeSessions(user) {
  if (!user || typeof user !== 'object') return [];
  if (!Array.isArray(user.sessions)) user.sessions = [];
  const legacy = user.session;
  if (legacy && typeof legacy === 'object' && legacy.hash) {
    if (!user.sessions.some((s) => s && s.hash === legacy.hash)) user.sessions.push({ ...legacy });
  }
  if ('session' in user) user.session = null;
  user.sessions = user.sessions.filter((s) => s && typeof s.hash === 'string');
  return user.sessions;
}

/** Add a session, drop expired ones, and keep at most MAX_SESSIONS (oldest removed). */
export function addSession(user, session, now = Date.now()) {
  const list = normalizeSessions(user).filter((s) => Number(s.expiresAt) > now);
  list.push(session);
  list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  while (list.length > MAX_SESSIONS) list.shift();
  user.sessions = list;
  return session;
}

export function removeSession(user, hash) {
  user.sessions = normalizeSessions(user).filter((s) => s.hash !== hash);
}

/** Password change or reset, account deletion: every device is signed out. */
export function clearSessions(user) {
  normalizeSessions(user);
  user.sessions = [];
}

export function sessionReauthFresh(session, now = Date.now()) {
  if (!session) return false;
  const at = Number(session.reauthAt);
  if (!Number.isFinite(at)) return false;
  return now >= at && now - at <= REAUTH_MS;
}

export function newId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * A users.json that exists but does not parse (or has no users array) is
 * never treated as empty and never overwritten: the store is marked
 * unavailable and the server answers 503. See json-file.js.
 */
export function createStore(filePath) {
  const file = createJsonFile(filePath, {
    label: 'users.json',
    isValid: (parsed) => Boolean(parsed) && typeof parsed === 'object' && Array.isArray(parsed.users),
    empty: () => ({ users: [] }),
    serialize: (value) => JSON.stringify(value, null, 2),
  });
  let data = file.initial;
  // Move any single legacy session into the sessions array (in memory; written on next save).
  if (data && Array.isArray(data.users)) for (const u of data.users) normalizeSessions(u);

  function persist() {
    file.write(data);
  }

  function save(user) {
    file.assertWritable();
    normalizeSessions(user);
    const i = data.users.findIndex((u) => u.id === user.id);
    if (i >= 0) data.users[i] = user;
    else data.users.push(user);
    persist();
    return user;
  }

  return {
    filePath,
    health: () => file.health(),
    findByEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      return data.users.find((u) => u.email === e) || null;
    },
    findById(id) {
      return data.users.find((u) => u.id === id) || null;
    },
    /** The account and the one device session a token belongs to, or null. */
    findSession(token) {
      if (!token) return null;
      const h = hashToken(token);
      const now = Date.now();
      for (const u of data.users) {
        const s = normalizeSessions(u).find((x) => x.hash === h && x.expiresAt > now);
        if (s) return { user: u, session: s };
      }
      return null;
    },
    findBySession(token) {
      const found = this.findSession(token);
      return found ? found.user : null;
    },
    findByStripeCustomer(customerId) {
      if (!customerId) return null;
      return data.users.find((u) => u.stripeCustomerId === customerId) || null;
    },
    findByPlayToken(purchaseToken) {
      if (!purchaseToken) return null;
      return data.users.find((u) => u.playPurchaseToken === purchaseToken) || null;
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
        sessions: [],
        name: '',
        phone: '',
        passwordHash: null,
        pendingPassword: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'none',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    },
    remove(id) {
      file.assertWritable();
      const before = data.users.length;
      data.users = data.users.filter((u) => u.id !== id);
      if (data.users.length !== before) persist();
      return data.users.length !== before;
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

/**
 * Google Play review account. Off unless REVIEWER_EMAIL and REVIEWER_PASSWORD
 * are both set and the password is at least 16 characters. Returns the
 * lower-cased email, or '' when disabled. Never the organisations inbox.
 */
export function reviewerEmail() {
  const email = String(process.env.REVIEWER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.REVIEWER_PASSWORD || '');
  if (!email.includes('@') || email === ORGANISATION_CONTACT) return '';
  if (password.length < 16) return '';
  return email;
}

export function isReviewerEmail(email) {
  const reviewer = reviewerEmail();
  return Boolean(reviewer) && String(email || '').trim().toLowerCase() === reviewer;
}

export function isFounderPlusEmail(email) {
  if (isReviewerEmail(email)) return true;
  return founderPlusEmails().has(String(email || '').trim().toLowerCase());
}

export function publicUser(user) {
  if (!user) {
    return {
      signedIn: false,
      id: null,
      email: null,
      name: '',
      phone: '',
      subscriptionStatus: 'none',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      plus: false,
      complimentary: false,
      founder: false,
      hasPassword: false,
      emailChangeSupported: false,
      reauthFresh: false,
      billingProvider: null,
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
    name: typeof user.name === 'string' ? user.name : '',
    phone: typeof user.phone === 'string' ? user.phone : '',
    subscriptionStatus: complimentary ? 'active' : storedStatus,
    currentPeriodEnd: user.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(user.cancelAtPeriodEnd) && paid,
    plus: paid || complimentary,
    complimentary,
    founder,
    hasPassword: Boolean(user.passwordHash),
    emailChangeSupported: false,
    reauthFresh: false, // filled in per device session by json() in index.js
    billingProvider: user.billingProvider === 'google_play' ? 'google_play' : (user.stripeCustomerId ? 'stripe' : null),
  };
}
