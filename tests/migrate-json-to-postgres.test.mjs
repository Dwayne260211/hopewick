// Stage 6: the JSON -> Postgres migration tool, offline parts (no database needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyGoalPatch } from '../server/wellbeing/model.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const key = crypto.randomBytes(32).toString('base64');
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, HOPEWICK_DATA_KEY: key, HOPEWICK_DATA_KEY_ID: 'tt' };

test('applyGoalPatch ignores undefined fields (a goal created without a status stays active)', () => {
  const g = applyGoalPatch({ status: 'active', progress: 10, completedAt: null }, { status: undefined });
  assert.equal(g.status, 'active');
  assert.equal(applyGoalPatch({ status: 'active' }, { status: 'completed' }).progress, 100);
});

test('synthetic store + migration dry run: clean, read-only, prints no content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-mig-test-'));
  const out = path.join(dir, 'data');
  try {
    execFileSync(process.execPath, ['tools/db/make-synthetic-store.mjs', '--out', out, '--users', '6', '--seed', '7'], { cwd: root, env: baseEnv, stdio: 'pipe' });
    const before = fs.readdirSync(out).sort();
    const sum = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(out, f))).digest('hex');
    const hashes = Object.fromEntries(before.map((f) => [f, sum(f)]));
    const r = spawnSync(process.execPath, ['tools/migrate-json-to-postgres.mjs', '--data-dir', out, '--mode', 'dry-run', '--report', path.join(dir, 'r.json')], { cwd: root, env: baseEnv, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /dry run clean \(nothing written\)/);
    assert.match(r.stdout, /Source files unchanged: yes/);
    assert.doesNotMatch(r.stdout, /@|hwenc:|Goal: /, 'no emails, ciphertext or content in the output');
    assert.deepEqual(fs.readdirSync(out).sort(), before, 'no .bak or other files appear in the source folder');
    for (const f of before) assert.equal(sum(f), hashes[f], `${f} unchanged`);
    const rep = JSON.parse(fs.readFileSync(path.join(dir, 'r.json'), 'utf8'));
    assert.equal(rep.accounts.usersJson, 6);
    assert.ok(rep.tables.app_users.source === 6);
    // apply refuses without a database, and without --confirm-host
    const a = spawnSync(process.execPath, ['tools/migrate-json-to-postgres.mjs', '--data-dir', out, '--mode', 'apply'], { cwd: root, env: baseEnv, encoding: 'utf8' });
    assert.notEqual(a.status, 0);
    assert.match(a.stdout, /needs DATABASE_URL/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
