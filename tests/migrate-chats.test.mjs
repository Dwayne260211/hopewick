// Chat encryption and the JSON -> Postgres migration tool. Synthetic data only.
// The Postgres part runs only with DATABASE_URL (the untracked .env, Neon dev); never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createChatStore, chatSealer } from '../server/chats.js';
import { loadLocalEnv } from '../server/db/migrate.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const key = crypto.randomBytes(32).toString('base64');
const keyEnv = { HOPEWICK_DATA_KEY: key, HOPEWICK_DATA_KEY_ID: 'tc' };
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ...keyEnv };
const sum = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (args, env = baseEnv) => spawnSync(process.execPath, ['tools/migrate-json-to-postgres.mjs', ...args], { cwd: root, env, encoding: 'utf8' });

test('dry run reports plain-text chats, never rewrites chats.json, and sees them sealed after the server writes them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-migchat-'));
  const out = path.join(dir, 'data');
  try {
    execFileSync(process.execPath, ['tools/db/make-synthetic-store.mjs', '--out', out, '--users', '8', '--seed', '11'], { cwd: root, env: baseEnv, stdio: 'pipe' });
    const chatsFile = path.join(out, 'chats.json');
    const h0 = sum(chatsFile);
    const r1 = run(['--data-dir', out, '--mode', 'dry-run', '--report', path.join(dir, 'r1.json')]);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    const rep1 = JSON.parse(fs.readFileSync(path.join(dir, 'r1.json'), 'utf8'));
    assert.ok(rep1.chatsJson.conversations > 0);
    assert.equal(rep1.chatsJson.withPlainText, rep1.chatsJson.conversations, 'synthetic legacy chats start as plain text');
    assert.equal(sum(chatsFile), h0, 'the tool never rewrites chats.json');
    assert.match(r1.stdout, /Chat encryption: chats\.json 0 of \d+ chats sealed/);

    // The server's own chat store seals each account on its next write.
    const plainBefore = fs.readFileSync(chatsFile, 'utf8');
    const store = createChatStore(chatsFile, { env: keyEnv });
    for (const u of Object.keys(JSON.parse(plainBefore).users)) {
      for (const p of store.list(u, { plus: true })) store.merge(u, p.id, { name: p.name, conversations: p.conversations }, { plus: true });
    }
    const sealedText = fs.readFileSync(chatsFile, 'utf8');
    for (const c of Object.values(JSON.parse(plainBefore).users).flatMap((u) => Object.values(u.profiles)).flatMap((p) => p.conversations)) {
      for (const m of c.messages) assert.ok(!sealedText.includes(m.content), 'no plain message text left on disk');
    }
    const r2 = run(['--data-dir', out, '--mode', 'dry-run', '--report', path.join(dir, 'r2.json')]);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    const rep2 = JSON.parse(fs.readFileSync(path.join(dir, 'r2.json'), 'utf8'));
    assert.equal(rep2.chatsJson.withPlainText, 0);
    assert.equal(rep2.chatsJson.sealed, rep1.chatsJson.conversations);
    assert.doesNotMatch(r2.stdout, /hwenc:|@/, 'no ciphertext or emails in the output');
    // Idempotent: a second run reports the same.
    const r3 = run(['--data-dir', out, '--mode', 'dry-run', '--report', path.join(dir, 'r3.json')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'r3.json'), 'utf8')).chatsJson, rep2.chatsJson);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

loadLocalEnv();
const dbEnv = { ...process.env };
const skip = String(dbEnv.DATABASE_URL || '').trim() ? false : 'DATABASE_URL not set; Postgres chat check skipped';

test('verify on Postgres: plain-text chat content in ai_conversations / ai_messages makes the run NOT CLEAN', { skip }, async () => {
  const db = await import('../server/db/index.js');
  const repo = await import('../server/db/repo.js');
  const u = `dbtest_chat_${crypto.randomBytes(4).toString('hex')}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-migchat-pg-'));
  const envFile = path.join(dir, 'tool.env');
  // Only the variable names the tool needs, copied from the local dev .env. Never printed.
  fs.writeFileSync(envFile, ['DATABASE_URL', 'DATABASE_DRIVER'].filter((k) => dbEnv[k]).map((k) => `${k}=${dbEnv[k]}`).join('\n') + '\n', { mode: 0o600 });
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'users.json'), JSON.stringify({ users: [{ id: u, createdAt: new Date().toISOString() }] }));
  const sealer = chatSealer(keyEnv);
  let convoId;
  try {
    await db.withUser(u, async (c) => {
      await c.query('INSERT INTO app_users (id) VALUES ($1) ON CONFLICT DO NOTHING', [u]);
      convoId = (await c.query("INSERT INTO ai_conversations (user_id, client_id, title) VALUES ($1, 'c1', $2) RETURNING id", [u, sealer.sealConversation(u, { title: 'sealed title' }).title])).rows[0].id;
      await c.query("INSERT INTO ai_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'user', 'plain text that must be caught')", [convoId, u]);
    }, dbEnv);
    const bad = run(['--data-dir', data, '--mode', 'dry-run', '--env-file', envFile, '--report', path.join(dir, 'bad.json'), '--concurrency', '1']);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /Plain-text chat content found in Postgres \(0 title\(s\), 1 message\(s\)\)/);
    assert.doesNotMatch(bad.stdout, /must be caught/, 'the content itself is never printed');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'bad.json'), 'utf8')).chatsInPostgres, { conversations: 1, messages: 1, plainTextTitles: 0, plainTextMessages: 1 });

    await db.withUser(u, async (c) => {
      const sealed = sealer.sealConversation(u, { messages: [{ content: 'now sealed' }] }).messages[0].content;
      await c.query('UPDATE ai_messages SET content = $1 WHERE user_id = $2', [sealed, u]);
    }, dbEnv);
    const good = run(['--data-dir', data, '--mode', 'dry-run', '--env-file', envFile, '--report', path.join(dir, 'good.json'), '--concurrency', '1']);
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /Chats in Postgres: 1 conversations, 1 messages, plain-text fields 0 \(must be 0\)/);
  } finally {
    try { await repo.deleteAllUserData(u, dbEnv); } catch { /* best effort */ }
    try { await db.withUser(u, (c) => c.query('DELETE FROM app_users WHERE id = $1', [u]), dbEnv); } catch { /* best effort */ }
    await db.closePool();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
