/**
 * Store safety: a store file that exists but does not parse is never treated
 * as empty or overwritten; the server fails its health check and the account
 * API instead. Writes are atomic and keep a rolling .bak.
 * Run: node --test --test-concurrency=1 server/store-safety.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { createStore } from './store.js';
import { createChatStore } from './chats.js';
import { createCheckinStore } from './checkins.js';
import { createVisitCounter } from './visits.js';
import { loadJsonFile, writeFileAtomic, createJsonFile, backupPath, StoreUnavailableError } from './json-file.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-store-'));
}

function quiet(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(' ')); };
  try { return { value: fn(), lines }; } finally { console.error = orig; }
}

async function quietAsync(fn) {
  const orig = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(' ')); };
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
}

const GOOD_USERS = { users: [{ id: 'u1', email: 'keep@example.com', createdAt: '2026-01-01T00:00:00.000Z', session: null, magic: null }] };

test('a corrupt users.json is left untouched, copied aside, and the store refuses writes', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'users.json');
    const broken = '{"users": [ {"id": "u1", "email": "keep@example.com"} '; // truncated
    fs.writeFileSync(file, broken);
    const { value: store, lines } = quiet(() => createStore(file));
    assert.equal(store.health().ok, false);
    assert.match(lines.join('\n'), /HOPEWICK STORE ERROR: users\.json/);
    assert.match(lines.join('\n'), /NOT changed/);
    assert.throws(() => store.createUser('new@example.com'), (err) => err instanceof StoreUnavailableError && err.status === 503);
    assert.throws(() => store.remove('u1'), StoreUnavailableError);
    assert.equal(fs.readFileSync(file, 'utf8'), broken);
    const copies = fs.readdirSync(dir).filter((n) => n.startsWith('users.json.corrupt-'));
    assert.equal(copies.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, copies[0]), 'utf8'), broken);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('valid JSON with the wrong shape is also refused, not reset', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, '{"accounts": []}');
    const { value: store } = quiet(() => createStore(file));
    assert.equal(store.health().ok, false);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"accounts": []}');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('chats.json, checkins.json and visits.json fail safe the same way', () => {
  const dir = tmpDir();
  try {
    for (const [name, make] of [['chats.json', createChatStore], ['checkins.json', createCheckinStore], ['visits.json', createVisitCounter]]) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, '{not json');
      const { value: s } = quiet(() => make(file));
      assert.equal(s.health().ok, false, name);
      assert.equal(fs.readFileSync(file, 'utf8'), '{not json', name);
    }
    const { value: chats } = quiet(() => createChatStore(path.join(dir, 'chats.json')));
    assert.throws(() => chats.merge('u1', 'p1', { conversations: [] }), StoreUnavailableError);
    const { value: visits } = quiet(() => createVisitCounter(path.join(dir, 'visits.json')));
    assert.throws(() => visits.increment(), StoreUnavailableError);
    assert.equal(fs.readFileSync(path.join(dir, 'visits.json'), 'utf8'), '{not json');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing file still starts empty (first run) and is healthy', () => {
  const dir = tmpDir();
  try {
    const store = createStore(path.join(dir, 'users.json'));
    assert.equal(store.health().ok, true);
    assert.equal(store.list().length, 0);
    store.createUser('first@example.com');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')).users.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the server fails its health check and account API on a corrupt store, but keeps static pages', async () => {
  const dir = tmpDir();
  const prevDev = process.env.HOPEWICK_DEV;
  process.env.HOPEWICK_DEV = '1';
  try {
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, 'garbage');
    const before = fs.readFileSync(file);
    const { value: server, lines } = await quietAsync(() => startServer({ port: 0, host: '127.0.0.1', storePath: file }));
    try {
      assert.match(lines.join('\n'), /users\.json could not be loaded/);
      const base = `http://127.0.0.1:${server.address().port}`;
      const health = await fetch(`${base}/api/health`);
      assert.equal(health.status, 503);
      const body = await health.json();
      assert.equal(body.ok, false);
      assert.deepEqual(body.stores, ['users.json']);
      const magic = await fetch(`${base}/api/auth/magic-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com' }),
      });
      assert.equal(magic.status, 503);
      assert.match((await magic.json()).error, /000/);
      const me = await fetch(`${base}/api/auth/me`);
      assert.equal(me.status, 503);
      const page = await fetch(`${base}/`);
      assert.equal(page.status, 200);
      assert.deepEqual(fs.readFileSync(file), before);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    if (prevDev == null) delete process.env.HOPEWICK_DEV; else process.env.HOPEWICK_DEV = prevDev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a healthy start refreshes a last-known-good .bak, and writes leave no temp files', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, JSON.stringify(GOOD_USERS, null, 2));
    const store = createStore(file);
    assert.equal(store.health().ok, true);
    assert.equal(store.findByEmail('keep@example.com').id, 'u1');
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath(file), 'utf8')), GOOD_USERS);
    store.createUser('second@example.com');
    const names = fs.readdirSync(dir);
    assert.equal(names.some((n) => n.endsWith('.tmp')), false);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).users.length, 2);
    // The format is unchanged: pretty JSON with a users array.
    assert.match(fs.readFileSync(file, 'utf8'), /^\{\n {2}"users": \[/);
    // .bak still holds the previous good copy until the next refresh.
    assert.equal(JSON.parse(fs.readFileSync(backupPath(file), 'utf8')).users.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the rolling backup refreshes from the previous good file once the interval passes', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'data.json');
    const jf = createJsonFile(file, {
      isValid: (p) => p && typeof p.n === 'number', empty: () => ({ n: 0 }), serialize: (v) => JSON.stringify(v), backupIntervalMs: 0,
    });
    jf.write({ n: 1 });
    jf.write({ n: 2 });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).n, 2);
    assert.equal(JSON.parse(fs.readFileSync(backupPath(file), 'utf8')).n, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeFileAtomic replaces the file in one step and cleans up after a failure', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'x.json');
    writeFileAtomic(file, '{"a":1}');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}');
    assert.equal((fs.statSync(file).mode & 0o777), 0o600);
    // Renaming onto a directory fails; the original directory and no temp file remain.
    const blocked = path.join(dir, 'blocked');
    fs.mkdirSync(blocked);
    fs.writeFileSync(path.join(blocked, 'keep'), 'x');
    assert.throws(() => writeFileAtomic(blocked, '{}'));
    assert.equal(fs.readdirSync(dir).some((n) => n.endsWith('.tmp')), false);
    assert.equal(loadJsonFile(path.join(dir, 'missing.json')).status, 'missing');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
