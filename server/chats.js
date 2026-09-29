/**
 * Saved Hope chats for a signed-in account.
 * Separate from users.json so a chat write does not rewrite password hashes.
 * Scoped by account id, then profile id. The browser keeps a copy too.
 * Staff have no inbox of these transcripts.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAX_PROFILES = 12;
/** Free accounts may open this many recent chats. Older ones stay stored. */
export const FREE_HISTORY_KEEP = 1;

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
  return [...map.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, MAX_CONVOS);
}

function publicProfile(id, row, plus) {
  const stored = Array.isArray(row.conversations) ? row.conversations : [];
  return {
    id,
    name: row.name || '',
    updated: row.updated || 0,
    activeId: row.activeId || null,
    conversations: conversationsForViewer(stored, plus === true),
  };
}

export function createChatStore(filePath) {
  let data = { users: {} };

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && parsed.users && typeof parsed.users === 'object') data = parsed;
    } catch {
      data = { users: {} };
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, filePath);
  }

  load();

  function userRow(userId) {
    if (!data.users[userId]) data.users[userId] = { profiles: {} };
    if (!data.users[userId].profiles || typeof data.users[userId].profiles !== 'object') {
      data.users[userId].profiles = {};
    }
    return data.users[userId];
  }

  return {
    list(userId, options) {
      const row = data.users[userId];
      if (!row || !row.profiles) return [];
      const plus = !!(options && options.plus);
      return Object.entries(row.profiles)
        .map(([id, profile]) => publicProfile(id, profile, plus))
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
      const prev = row.profiles[profileId] || { conversations: [], activeId: null, name: '', updated: 0 };
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
      persist();
      return publicProfile(profileId, row.profiles[profileId], !!(options && options.plus));
    },
  };
}
