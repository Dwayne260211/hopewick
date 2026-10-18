// Encryption at rest for saved Hope chats (chats.json). Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createChatStore, chatSealer, conversationHasPlaintext, CHAT_RETENTION_MS } from './chats.js';
import { isEncrypted } from './db/crypto.js';

const newKey = () => crypto.randomBytes(32).toString('base64');
const K1 = { HOPEWICK_DATA_KEY: newKey(), HOPEWICK_DATA_KEY_ID: 't1' };
const SECRET = 'my craving was bad after payday';

function convo(id, updated, text, extra = {}) {
  return { id, title: `About ${text}`, created: updated, updated, messages: [{ role: 'user', content: text, ts: updated }, { role: 'assistant', content: `Reply to ${text}`, ts: updated }], ...extra };
}
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hw-chatenc-')); }
const readDisk = (file) => fs.readFileSync(file, 'utf8');

test('a write seals titles, message text, extra text and the profile name; reads come back readable', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'chats.json');
    const chats = createChatStore(file, { env: K1 });
    const now = Date.now();
    const out = chats.merge('u1', 'p1', { name: 'Sam private', conversations: [convo('c1', now, SECRET, { systemExtra: 'focus on Step 4 resentments', passage: 'Psalm 23' })] });
    assert.equal(out.name, 'Sam private');
    assert.equal(out.conversations[0].messages[0].content, SECRET);
    const raw = readDisk(file);
    for (const plain of [SECRET, 'About my craving', 'Reply to', 'Sam private', 'Step 4 resentments', 'Psalm 23']) assert.ok(!raw.includes(plain), `plain text on disk: ${plain}`);
    const stored = JSON.parse(raw).users.u1.profiles.p1;
    assert.ok(isEncrypted(stored.name));
    const c = stored.conversations[0];
    assert.ok(isEncrypted(c.title) && isEncrypted(c.systemExtra) && isEncrypted(c.passage));
    assert.ok(c.messages.every((m) => isEncrypted(m.content)));
    assert.equal(conversationHasPlaintext(c), false);
    // Ids, timestamps and roles stay plain for expiry, sorting and the free view.
    assert.equal(c.id, 'c1'); assert.equal(c.updated, now); assert.equal(c.messages[0].role, 'user');
    const again = createChatStore(file, { env: K1 }).list('u1', { plus: true });
    assert.equal(again[0].conversations[0].title, `About ${SECRET}`);
    assert.equal(again[0].conversations[0].systemExtra, 'focus on Step 4 resentments');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('legacy plain-text chats read as they are, and are sealed the next time that account writes', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'chats.json');
    const now = Date.now();
    const legacy = { users: {
      a: { profiles: { pa: { name: 'Ada', updated: now, activeId: 'old', conversations: [convo('old', now - 5000, 'legacy from Ada')] } } },
      b: { profiles: { pb: { name: 'Beau', updated: now, activeId: 'x', conversations: [convo('x', now - 5000, 'legacy from Beau')] } } },
    } };
    fs.writeFileSync(file, JSON.stringify(legacy));
    const chats = createChatStore(file, { env: K1 });
    // Reading does not rewrite anything.
    assert.equal(chats.list('a', { plus: true })[0].conversations[0].messages[0].content, 'legacy from Ada');
    assert.equal(readDisk(file), JSON.stringify(legacy));
    // Ada writes a new chat: her old chat is sealed too. Beau is untouched until he writes.
    const out = chats.merge('a', 'pa', { conversations: [convo('new', now, 'new from Ada')] }, { plus: true });
    assert.deepEqual(out.conversations.map((c) => c.id).sort(), ['new', 'old']);
    const raw = readDisk(file);
    assert.ok(!raw.includes('legacy from Ada') && !raw.includes('new from Ada') && !raw.includes('"Ada"'));
    assert.ok(raw.includes('legacy from Beau'), 'no bulk rewrite of other accounts');
    const disk = JSON.parse(raw);
    assert.ok(disk.users.a.profiles.pa.conversations.every((c) => !conversationHasPlaintext(c)));
    assert.equal(chats.list('b', { plus: true })[0].conversations[0].messages[0].content, 'legacy from Beau');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('24-month expiry, the free-plan view and history order still work on sealed chats', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'chats.json');
    const chats = createChatStore(file, { env: K1 });
    const now = Date.now();
    chats.merge('u', 'p', { conversations: [convo('recent', now - 1000, 'recent'), convo('older', now - 60_000, 'older')] });
    const free = chats.list('u', { plus: false })[0].conversations;
    assert.deepEqual(free.map((c) => c.id), ['recent']);
    const plus = chats.list('u', { plus: true })[0].conversations;
    assert.deepEqual(plus.map((c) => c.id), ['recent', 'older']);
    // Age one sealed chat past 24 months on disk: the next read drops it.
    const disk = JSON.parse(readDisk(file));
    disk.users.u.profiles.p.conversations.find((c) => c.id === 'older').updated = now - CHAT_RETENTION_MS - 1;
    fs.writeFileSync(file, JSON.stringify(disk));
    const fresh = createChatStore(file, { env: K1 });
    assert.deepEqual(fresh.list('u', { plus: true })[0].conversations.map((c) => c.id), ['recent']);
    assert.ok(!readDisk(file).includes('"older"'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ciphertext is bound to its account and supports key rotation', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'chats.json');
    const now = Date.now();
    createChatStore(file, { env: K1 }).merge('a', 'p', { conversations: [convo('c', now, 'rotate me')] });
    // Copying Ada's sealed chat under another account does not decrypt.
    const disk = JSON.parse(readDisk(file));
    disk.users.b = JSON.parse(JSON.stringify(disk.users.a));
    fs.writeFileSync(file, JSON.stringify(disk));
    assert.throws(() => createChatStore(file, { env: K1 }).list('b', { plus: true }));
    // New key k2, old key loaded for reading: old chats read, and the next write uses k2.
    const K2 = { HOPEWICK_DATA_KEY: newKey(), HOPEWICK_DATA_KEY_ID: 't2', HOPEWICK_DATA_KEY_PREVIOUS: `t1:${K1.HOPEWICK_DATA_KEY}` };
    const rotated = createChatStore(file, { env: K2 });
    assert.equal(rotated.list('a', { plus: true })[0].conversations[0].messages[0].content, 'rotate me');
    rotated.merge('a', 'p', { conversations: [convo('c2', now + 1, 'after rotation')] });
    const after = JSON.parse(readDisk(file)).users.a.profiles.p.conversations;
    assert.ok(after.every((c) => c.messages.every((m) => m.content.startsWith('hwenc:v1:t2:'))));
    // Without any key, sealed chats fail loudly instead of returning ciphertext.
    assert.throws(() => createChatStore(file, { env: {} }).list('a', { plus: true }), /No key loaded/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no key (local development) stores plain text as before', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'chats.json');
    createChatStore(file, { env: {} }).merge('u', 'p', { conversations: [convo('c', Date.now(), 'dev text')] });
    assert.ok(readDisk(file).includes('dev text'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('chatSealer leaves already-sealed values alone and opens plain text unchanged', () => {
  const s = chatSealer(K1);
  const sealed = s.sealConversation('u', convo('c', 1, 'x'));
  assert.deepEqual(s.sealConversation('u', sealed), sealed);
  assert.equal(s.openConversation('u', convo('c', 1, 'plain')).messages[0].content, 'plain');
});

test('over HTTP: saved chats are sealed on disk and GET /api/chats returns readable text to the owner', async () => {
  const dir = tmp();
  const saved = { key: process.env.HOPEWICK_DATA_KEY, id: process.env.HOPEWICK_DATA_KEY_ID, dev: process.env.HOPEWICK_DEV };
  process.env.HOPEWICK_DATA_KEY = K1.HOPEWICK_DATA_KEY; process.env.HOPEWICK_DATA_KEY_ID = 't1';
  process.env.HOPEWICK_DEV = '1'; process.env.NODE_ENV = 'test';
  const { startServer } = await import('./index.js');
  const chatsPath = path.join(dir, 'chats.json');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json'), chatsPath });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const sent = await (await fetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'enc@example.com' }) })).json();
    const verified = await fetch(sent.devLink, { redirect: 'manual' });
    const cookie = (verified.headers.get('set-cookie') || '').split(';')[0];
    const put = await fetch(`${base}/api/chats`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ profileId: 'enc1', name: 'Enc', conversations: [convo('c1', Date.now(), SECRET)] }) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).profile.conversations[0].messages[0].content, SECRET);
    assert.ok(!readDisk(chatsPath).includes(SECRET));
    const got = await (await fetch(`${base}/api/chats`, { headers: { cookie } })).json();
    assert.equal(got.profiles[0].conversations[0].messages[0].content, SECRET);
    assert.equal(got.profiles[0].conversations[0].title, `About ${SECRET}`);
  } finally {
    await new Promise((r) => server.close(r));
    for (const [k, v] of [['HOPEWICK_DATA_KEY', saved.key], ['HOPEWICK_DATA_KEY_ID', saved.id], ['HOPEWICK_DEV', saved.dev]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
