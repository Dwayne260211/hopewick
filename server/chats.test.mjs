import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { createChatStore, mergeConversations } from './chats.js';

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
    chatsPath: path.join(dir, 'chats.json'),
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
    assert.equal(saved.profile.conversations.length, 1);
    assert.equal(saved.profile.conversations[0].id, 'c2');

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
    assert.deepEqual(merged.profile.conversations.map((c) => c.id), ['c1']);
    assert.equal(merged.profile.conversations[0].messages[0].content, 'hello from yesterday, edited');

    const got = await fetch(`${app.base}/api/chats`, { headers: { cookie: sam } });
    const listed = await got.json();
    assert.equal(listed.profiles[0].id, 'sam1');
    assert.equal(listed.profiles[0].conversations.length, 1);
    assert.equal(listed.profiles[0].conversations[0].id, 'c1');

    const upgraded = await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: sam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(upgraded.status, 200);
    const plusListed = await (await fetch(`${app.base}/api/chats`, { headers: { cookie: sam } })).json();
    const texts = plusListed.profiles[0].conversations.map((c) => c.messages[0].content).sort();
    assert.deepEqual(texts, ['hello from yesterday, edited', 'second chat']);
    await fetch(`${app.base}/api/billing/dev-set`, {
      method: 'POST',
      headers: { cookie: sam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'none' }),
    });

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

test('forget drops only that account and ignores a missing user', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-forget-'));
  try {
    const file = path.join(dir, 'chats.json');
    const chats = createChatStore(file);
    chats.merge('user-a', 'p1', { name: 'A', conversations: [convo('c1', 1, 'from A')] });
    chats.merge('user-b', 'p2', { name: 'B', conversations: [convo('c1', 2, 'from B')] });
    assert.equal(chats.forget(''), false);
    assert.equal(chats.forget('missing'), false);
    assert.equal(chats.forget('user-a'), true);
    assert.equal(chats.forget('user-a'), false);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(disk.users['user-a'], undefined);
    assert.equal(disk.users['user-b'].profiles.p2.conversations[0].messages[0].content, 'from B');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleting an account erases that account’s saved chats and leaves the other', async () => {
  const app = await boot();
  try {
    const cookieA = await signIn(app.base, 'ada@example.com');
    const cookieB = await signIn(app.base, 'beau@example.com');
    const meA = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: cookieA } })).json();
    const meB = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: cookieB } })).json();
    assert.ok(meA.id);
    assert.notEqual(meA.id, meB.id);

    async function save(cookie, profileId, text) {
      const res = await fetch(`${app.base}/api/chats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          profileId,
          name: profileId,
          conversations: [convo('c1', 20, text)],
        }),
      });
      assert.equal(res.status, 200);
    }
    await save(cookieA, 'ada1', 'chat from Ada');
    await save(cookieB, 'beau1', 'chat from Beau');

    const unconfirmed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'delete' }),
    });
    assert.equal(unconfirmed.status, 400);
    let disk = JSON.parse(fs.readFileSync(app.chatsPath, 'utf8'));
    assert.ok(disk.users[meA.id]);
    assert.ok(disk.users[meB.id]);

    const removed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(removed.status, 200);
    const body = await removed.json();
    assert.equal(body.deleted.includes('Saved chats on this server for this account'), true);
    assert.equal(body.deleted.includes('Check-ins and weekly goals on this server for this account'), true);
    assert.equal(body.deleted.some((line) => /sign-in/i.test(line)), true);
    assert.equal(body.kept.some((line) => /browser/i.test(line)), true);
    assert.equal(body.kept.some((line) => /invoice/i.test(line)), true);
    assert.equal(body.kept.some((line) => /disk snapshot/i.test(line) && /not been tested/i.test(line) && !/not confirmed/i.test(line)), true);
    assert.equal(body.kept.some((line) => /chat/i.test(line) && /server/i.test(line)), false);

    disk = JSON.parse(fs.readFileSync(app.chatsPath, 'utf8'));
    assert.equal(Object.hasOwn(disk.users, meA.id), false);
    assert.equal(disk.users[meB.id].profiles.beau1.conversations[0].messages[0].content, 'chat from Beau');

    const listed = await (await fetch(`${app.base}/api/chats`, { headers: { cookie: cookieB } })).json();
    const texts = listed.profiles.flatMap((profile) => profile.conversations.flatMap((c) => c.messages.map((m) => m.content)));
    assert.deepEqual(texts, ['chat from Beau']);
    const gone = await fetch(`${app.base}/api/chats`, { headers: { cookie: cookieA } });
    assert.equal(gone.status, 401);
  } finally {
    await app.close();
  }
});
