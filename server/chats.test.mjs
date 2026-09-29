import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { mergeConversations } from './chats.js';

function convo(id, updated, text) {
  return {
    id,
    title: text,
    created: updated,
    updated,
    messages: [{ role: 'user', content: text, ts: updated }],
  };
}

test('merge keeps both sides and prefers the newer transcript', () => {
  const local = [convo('a', 2, 'local newer'), convo('b', 1, 'only local')];
  const remote = [convo('a', 1, 'remote older'), convo('c', 3, 'only remote')];
  const merged = mergeConversations(local, remote);
  const byId = Object.fromEntries(merged.map((c) => [c.id, c.messages[0].content]));
  assert.deepEqual(byId, {
    c: 'only remote',
    a: 'local newer',
    b: 'only local',
  });
});

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-chats-'));
  const previous = process.env.HOPEWICK_DEV;
  process.env.HOPEWICK_DEV = '1';
  process.env.NODE_ENV = 'test';
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    storePath: path.join(dir, 'users.json'),
    chatsPath: path.join(dir, 'chats.json'),
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    async close() {
      if (previous == null) delete process.env.HOPEWICK_DEV;
      else process.env.HOPEWICK_DEV = previous;
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function signIn(base, email) {
  const sent = await fetch(`${base}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await sent.json();
  assert.equal(sent.status, 200);
  const verified = await fetch(data.devLink, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  return (verified.headers.get('set-cookie') || '').split(';')[0];
}

test('signed-in chats survive a fresh read and stay on that account', async () => {
  const app = await boot();
  try {
    const bare = await fetch(`${app.base}/api/chats`);
    assert.equal(bare.status, 401);

    const sam = await signIn(app.base, 'sam@example.com');
    const put = await fetch(`${app.base}/api/chats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: sam },
      body: JSON.stringify({
        profileId: 'sam1',
        name: 'Sam',
        activeId: 'c1',
        conversations: [convo('c1', 10, 'hello from yesterday'), convo('c2', 11, 'second chat')],
      }),
    });
    assert.equal(put.status, 200);
    const saved = await put.json();
    assert.equal(saved.profile.conversations.length, 2);

    const again = await fetch(`${app.base}/api/chats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: sam },
      body: JSON.stringify({
        profileId: 'sam1',
        name: 'Sam',
        conversations: [convo('c1', 12, 'hello from yesterday, edited')],
      }),
    });
    const merged = await again.json();
    const texts = merged.profile.conversations.map((c) => c.messages[0].content).sort();
    assert.deepEqual(texts, ['hello from yesterday, edited', 'second chat']);

    const got = await fetch(`${app.base}/api/chats`, { headers: { cookie: sam } });
    const listed = await got.json();
    assert.equal(listed.profiles[0].id, 'sam1');
    assert.equal(listed.profiles[0].conversations.length, 2);

    const other = await signIn(app.base, 'other@example.com');
    const hidden = await fetch(`${app.base}/api/chats`, { headers: { cookie: other } });
    const otherBody = await hidden.json();
    assert.deepEqual(otherBody.profiles, []);

    const removed = await fetch(`${app.base}/api/chats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: sam },
      body: JSON.stringify({ profileId: 'sam1', name: 'Sam', removedIds: ['c2'], conversations: [] }),
    });
    const after = await removed.json();
    assert.deepEqual(after.profile.conversations.map((c) => c.id), ['c1']);
  } finally {
    await app.close();
  }
});
