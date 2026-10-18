/**
 * Saved Hope chats for a signed-in account.
 * Separate from users.json so a chat write does not rewrite password hashes.
 * Scoped by account id, then profile id. The browser keeps a copy too.
 * Staff have no inbox of these transcripts.
 *
 * Live-disk retention: a chat stays until the person deletes that chat,
 * deletes the account, or its `updated` time (epoch ms) is 24 months or
 * older. 24 months is CHAT_RETENTION_MS (730 days, not calendar months).
 * Expired rows are removed on read and on merge/save. There is no separate
 * cron. This does not delete browser localStorage and does not touch
 * snapshots. Free accounts can open the latest chat (FREE_HISTORY_KEEP).
 * Older chats stay stored until this rule or a user delete. Account delete
 * still removes that account's chats immediately.
 *
 * Encryption at rest (server/db/crypto.js, AES-256-GCM, hwenc:v1, HOPEWICK_DATA_KEY):
 * chat titles, message text, the study-focus extra text, the passage label and
 * the profile name are sealed before they reach chats.json, bound to
 * "<userId>:chat.<field>". Reads accept plain text (chats saved before this
 * change) and ciphertext. Any write for an account seals that account's chats,
 * so older plain-text chats are encrypted the next time that person's chats
 * are written. There is no bulk rewrite job. Ids, timestamps, roles and flags
 * stay plain so expiry (`updated`), sorting and the free-plan view still work.
 * Without a key (local development) text is stored as it is.
 */
import { createJsonFile } from './json-file.js';
import { encryptText, decryptText, isEncrypted } from './db/crypto.js';

const MAX_PROFILES = 12;
/** Free accounts may open this many recent chats. Older ones stay stored. */
export const FREE_HISTORY_KEEP = 1;
/** 24 months on the live disk. 730 days of 24 hours, not a calendar-month count. */
export const CHAT_RETENTION_DAYS = 730;
export const CHAT_RETENTION_MS = CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** True when `updated` is missing or is CHAT_RETENTION_MS or older than `now`. */
export function isChatExpired(convo, now = Date.now()) {
  const updated = Number(convo && convo.updated);
  if (!Number.isFinite(updated)) return true;
  return updated <= now - CHAT_RETENTION_MS;
}

export function withoutExpiredChats(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  return list.filter((row) => row && !isChatExpired(row, now));
}

/** What a client may see. Plus gets the stored list. Free gets the recent openable chats only. */
export function conversationsForViewer(conversations, plus) {
  const list = Array.isArray(conversations) ? conversations : [];
  if (plus) return list;
  const ranked = list
    .filter((row) => row && Array.isArray(row.messages) && row.messages.length)
    .slice()
    .sort((a, b) => (Number(b.updated) || 0) - (Number(a.updated) || 0));
  const keep = new Set(ranked.slice(0, FREE_HISTORY_KEEP).map((row) => row.id));
  return list.filter((row) => {
    if (!row || !Array.isArray(row.messages) || !row.messages.length) return true;
    return keep.has(row.id);
  });
}

const MAX_CONVOS = 80;
const MAX_MESSAGES = 200;
const MAX_TEXT = 8000;
const MAX_TITLE = 120;
const MAX_EXTRA = 4000;
const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function validProfileId(id) {
  return PROFILE_ID_RE.test(String(id || ''));
}

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : '';
  if (!role) return null;
  const msg = {
    role,
    content: clip(raw.content, MAX_TEXT),
    ts: Number(raw.ts) || Date.now(),
  };
  if (raw.card === 'crisis') msg.card = 'crisis';
  if (raw.crisis === true) msg.crisis = true;
  if (raw.crisisKind) msg.crisisKind = clip(raw.crisisKind, 40);
  if (raw.error === true) msg.error = true;
  if (raw.demo === true) msg.demo = true;
  return msg;
}

export function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = clip(raw.id, 64).trim();
  if (!PROFILE_ID_RE.test(id)) return null;
  const messages = Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES) : [];
  const convo = {
    id,
    title: clip(raw.title || 'New chat', MAX_TITLE) || 'New chat',
    created: Number(raw.created) || Date.now(),
    updated: Number(raw.updated) || Number(raw.created) || Date.now(),
    messages,
  };
  if (raw.mood && typeof raw.mood === 'object') {
    convo.mood = { e: clip(raw.mood.e, 8), l: clip(raw.mood.l, 24) };
  }
  if (raw.craving) convo.craving = clip(raw.craving, 24);
  if (raw.kind) convo.kind = clip(raw.kind, 40);
  if (raw.systemExtra) convo.systemExtra = clip(raw.systemExtra, MAX_EXTRA);
  // Study-focus ids. Hosted Hope rebuilds the focus prompt on the server from
  // these, so they must survive a sync. Optional and additive.
  const step = Number(raw.step);
  if (Number.isInteger(step) && step >= 1 && step <= 12) convo.step = step;
  const planDay = Number(raw.planDay);
  if (Number.isInteger(planDay) && planDay >= 1 && planDay <= 400) convo.planDay = planDay;
  if (raw.soap === true) convo.soap = true;
  if (raw.divingDeeper === true) convo.divingDeeper = true;
  for (const key of ['lessonId', 'ddDayId', 'deeperTrackId', 'deeperDayId', 'passage']) {
    if (typeof raw[key] === 'string' && raw[key]) convo[key] = clip(raw[key], 80);
  }
  if (raw.accountId && validProfileId(raw.accountId)) convo.accountId = String(raw.accountId);
  return convo;
}

function preferConversation(a, b) {
  const au = Number(a.updated) || 0;
  const bu = Number(b.updated) || 0;
  if (bu !== au) return bu > au ? b : a;
  const am = Array.isArray(a.messages) ? a.messages.length : 0;
  const bm = Array.isArray(b.messages) ? b.messages.length : 0;
  return bm > am ? b : a;
}

/** Union by id. Newer updated wins; a tie keeps the longer transcript. Nothing is dropped just for being local or remote. */
export function mergeConversations(localList, remoteList) {
  const map = new Map();
  const take = (list) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const convo = normalizeConversation(raw);
      if (!convo || !convo.messages.length) continue;
      const prev = map.get(convo.id);
      map.set(convo.id, prev ? preferConversation(prev, convo) : convo);
    }
  };
  take(remoteList);
  take(localList);
  return withoutExpiredChats([...map.values()])
    .sort((a, b) => (b.updated || 0) - (a.updated || 0))
    .slice(0, MAX_CONVOS);
}

function publicProfile(id, row, plus, open = null) {
  const stored = Array.isArray(row.conversations) ? row.conversations : [];
  const visible = conversationsForViewer(stored, plus === true);
  return {
    id,
    name: (open ? open.name(row.name) : row.name) || '',
    updated: row.updated || 0,
    activeId: row.activeId || null,
    conversations: open ? visible.map(open.convo) : visible,
  };
}

/** Fields holding the person's own words. Everything else is ids, numbers, flags or fixed labels. */
export const CHAT_SEALED_FIELDS = Object.freeze({ conversation: ['title', 'systemExtra', 'passage'], message: ['content'], profile: ['name'] });

/**
 * Seal / open helpers for one account. Shared shape for any chat backend:
 * the same associated data ("<userId>:chat.<field>") is used wherever chats are stored.
 */
export function chatSealer(env = process.env) {
  const aad = (userId, field) => `${userId}:chat.${field}`;
  const seal = (userId, field, value) => {
    if (typeof value !== 'string' || value === '' || isEncrypted(value)) return value;
    return encryptText(value, env, aad(userId, field));
  };
  const open = (userId, field, value) => (isEncrypted(value) ? decryptText(value, env, aad(userId, field)) : value);
  const mapConvo = (fn, userId, convo) => {
    if (!convo || typeof convo !== 'object') return convo;
    const out = { ...convo };
    for (const f of CHAT_SEALED_FIELDS.conversation) if (out[f] !== undefined) out[f] = fn(userId, f, out[f]);
    if (Array.isArray(convo.messages)) {
      out.messages = convo.messages.map((m) => {
        if (!m || typeof m !== 'object') return m;
        const mm = { ...m };
        for (const f of CHAT_SEALED_FIELDS.message) if (mm[f] !== undefined) mm[f] = fn(userId, f, mm[f]);
        return mm;
      });
    }
    return out;
  };
  return {
    sealConversation: (userId, convo) => mapConvo(seal, userId, convo),
    openConversation: (userId, convo) => mapConvo(open, userId, convo),
    sealProfileName: (userId, name) => seal(userId, 'name', name),
    openProfileName: (userId, name) => open(userId, 'name', name),
  };
}

/** True when any sealed field of a stored conversation is still plain text. */
export function conversationHasPlaintext(convo) {
  if (!convo || typeof convo !== 'object') return false;
  const plain = (v) => typeof v === 'string' && v !== '' && !isEncrypted(v);
  if (CHAT_SEALED_FIELDS.conversation.some((f) => plain(convo[f]))) return true;
  return Array.isArray(convo.messages) && convo.messages.some((m) => m && CHAT_SEALED_FIELDS.message.some((f) => plain(m[f])));
}

export function createChatStore(filePath, { env = process.env } = {}) {
  const sealer = chatSealer(env);
  const file = createJsonFile(filePath, {
    label: 'chats.json',
    isValid: (parsed) => Boolean(parsed) && typeof parsed === 'object' && Boolean(parsed.users) && typeof parsed.users === 'object',
    empty: () => ({ users: {} }),
    serialize: (value) => JSON.stringify(value),
  });
  let data = file.initial;

  function persist() {
    file.write(data);
  }

  function userRow(userId) {
    if (!data.users[userId]) data.users[userId] = { profiles: {} };
    if (!data.users[userId].profiles || typeof data.users[userId].profiles !== 'object') {
      data.users[userId].profiles = {};
    }
    return data.users[userId];
  }

  const openerFor = (userId) => ({
    name: (n) => sealer.openProfileName(userId, n),
    convo: (c) => sealer.openConversation(userId, c),
  });
  /** Seal every plain-text field this account still has (older chats get encrypted on this write). */
  function sealUser(userId) {
    const row = data.users[userId];
    if (!row || !row.profiles) return;
    for (const profile of Object.values(row.profiles)) {
      if (!profile || typeof profile !== 'object') continue;
      if (profile.name) profile.name = sealer.sealProfileName(userId, profile.name);
      if (Array.isArray(profile.conversations)) profile.conversations = profile.conversations.map((c) => sealer.sealConversation(userId, c));
    }
  }

  return {
    health: () => file.health(),
    list(userId, options) {
      const row = data.users[userId];
      if (!row || !row.profiles) return [];
      let changed = false;
      for (const profile of Object.values(row.profiles)) {
        const before = Array.isArray(profile.conversations) ? profile.conversations : [];
        const kept = withoutExpiredChats(before);
        if (kept.length !== before.length) {
          profile.conversations = kept;
          if (profile.activeId && !kept.some((c) => c.id === profile.activeId)) {
            profile.activeId = kept[0] ? kept[0].id : null;
          }
          changed = true;
        }
      }
      if (changed) { sealUser(userId); persist(); }
      const plus = !!(options && options.plus);
      const open = openerFor(userId);
      return Object.entries(row.profiles)
        .map(([id, profile]) => publicProfile(id, profile, plus, open))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))
        .slice(0, MAX_PROFILES);
    },
    merge(userId, profileId, incoming, options) {
      if (!validProfileId(profileId)) {
        const err = new Error('That profile id is not valid.');
        err.status = 400;
        throw err;
      }
      const row = userRow(userId);
      const open = openerFor(userId);
      const stored = row.profiles[profileId] || { conversations: [], activeId: null, name: '', updated: 0 };
      // Work on readable text; seal again before it is written.
      const prev = { ...stored, name: open.name(stored.name), conversations: (Array.isArray(stored.conversations) ? stored.conversations : []).map(open.convo) };
      let conversations = mergeConversations(incoming && incoming.conversations, prev.conversations);
      const removed = Array.isArray(incoming && incoming.removedIds) ? incoming.removedIds : [];
      if (removed.length) {
        const drop = new Set(removed.map((id) => String(id)).slice(0, MAX_CONVOS));
        conversations = conversations.filter((c) => !drop.has(c.id));
      }
      let activeId = prev.activeId || null;
      const requested = incoming && incoming.activeId ? String(incoming.activeId) : '';
      if (requested && conversations.some((c) => c.id === requested)) activeId = requested;
      if (activeId && !conversations.some((c) => c.id === activeId)) activeId = conversations[0] ? conversations[0].id : null;
      const name = clip((incoming && incoming.name) || prev.name || '', 40);
      const saved = {
        name,
        conversations,
        activeId,
        updated: Date.now(),
      };
      row.profiles[profileId] = saved;
      const ids = Object.entries(row.profiles).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
      if (ids.length > MAX_PROFILES) {
        row.profiles = Object.fromEntries(ids.slice(0, MAX_PROFILES));
      }
      sealUser(userId);
      persist();
      return publicProfile(profileId, row.profiles[profileId], !!(options && options.plus), open);
    },
    /** Drop this account's saved chats. Other accounts are left as they are. */
    forget(userId) {
      if (userId == null || userId === '') return false;
      const key = String(userId);
      if (!Object.prototype.hasOwnProperty.call(data.users, key)) return false;
      delete data.users[key];
      persist();
      return true;
    },
  };
}
