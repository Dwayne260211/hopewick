// Without DATABASE_URL the database layer stays off: pg is never loaded and the
// app keeps the JSON store. Always runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbEnabled, getPool, assertUserId, databaseHost, probeDatabase } from './db/index.js';
import { listMigrations } from './db/migrate.js';

import { createRequire } from 'node:module';
let pgInstalled = true;
try { createRequire(import.meta.url).resolve('pg'); } catch { pgInstalled = false; }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dbEnabled is false without DATABASE_URL and getPool refuses', async () => {
  assert.equal(dbEnabled({}), false);
  assert.equal(dbEnabled({ DATABASE_URL: '  ' }), false);
  await assert.rejects(() => getPool({}), /DATABASE_URL is not set/);
  const probe = await probeDatabase({});
  assert.equal(probe.enabled, false);
});

test('importing the server db module does not load pg', { skip: pgInstalled ? false : 'pg is not installed' }, () => {
  // A resolve hook reports any attempt to load 'pg' (or the dev WebSocket driver).
  const code = `
    import { register } from 'node:module';
    const hook = "export async function resolve(s, c, next) { if (s === 'pg' || s === '@neondatabase/serverless') process.stderr.write('DRIVER_LOADED '); return next(s, c); }";
    register('data:text/javascript,' + encodeURIComponent(hook));
    const m = await import('./server/db/index.js');
    if (process.env.MAKE_POOL) await m.getPool({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' });
    console.log(JSON.stringify({ enabled: m.dbEnabled() }));`;
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_DRIVER;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout.trim()), { enabled: false });
  assert.ok(!out.stderr.includes('DRIVER_LOADED'), 'pg must not load without DATABASE_URL');

  // Control: the hook does see pg once a pool is created (no connection is made).
  const out2 = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env: { ...env, MAKE_POOL: '1' }, encoding: 'utf8' });
  assert.equal(out2.status, 0, out2.stderr);
  assert.ok(out2.stderr.includes('DRIVER_LOADED'));
});

test('databaseHost never returns the password', () => {
  assert.equal(databaseHost({ DATABASE_URL: 'postgresql://u:supersecret@db.example.com/x?sslmode=require' }), 'db.example.com');
});

test('user ids are validated before any query', () => {
  for (const bad of ['', 'a b', "x'; drop table", null, 42, 'x'.repeat(129)]) assert.throws(() => assertUserId(bad));
  assert.equal(assertUserId('u_123-abc'), 'u_123-abc');
});

test('migrations are numbered, contiguous and cover every planned table', () => {
  const list = listMigrations();
  assert.ok(list.length >= 2);
  list.forEach((m, i) => assert.equal(m.version, i + 1, `${m.file} out of sequence`));
  const sql = list.map((m) => m.sql).join('\n');
  for (const t of ['app_users', 'user_profiles', 'consent_preferences', 'mood_entries', 'recovery_milestones', 'goals',
    'journal_entries', 'guided_activity_history', 'learning_progress', 'safety_plans', 'next_step_items',
    'ai_conversations', 'ai_messages', 'notification_preferences']) {
    assert.match(sql, new RegExp(`CREATE TABLE ${t} \\(`), `${t} missing`);
  }
  // every user table is keyed by user_id and has RLS forced
  const tables = [...sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)];
  for (const [, name, body] of tables) {
    if (name === 'app_users') continue;
    assert.match(body, /user_id\s+text (NOT NULL|PRIMARY KEY)/, `${name} must have NOT NULL user_id`);
    // In the RLS loop of 001 ('name'), or forced explicitly in a later migration.
    const listed = new RegExp(`'${name}'`).test(sql);
    const forced = new RegExp(`ALTER TABLE ${name} FORCE ROW LEVEL SECURITY`).test(sql) && new RegExp(`CREATE POLICY \\w+ ON ${name}\\b`).test(sql);
    assert.ok(listed || forced, `${name} must have row level security forced`);
  }
});

test('migrations, server code and .env are never served over HTTP', () => {
  const src = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  assert.match(src, /PRIVATE_DIRS = new Set\(\[[^\]]*'migrations'/);
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /\.env/);
});
