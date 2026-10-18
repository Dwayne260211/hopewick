/**
 * Hopewick 2.0 Stage 4: recovery tracker and learning progress.
 *
 * Same contract against both storage backends (JSON fallback always; Postgres
 * only when DATABASE_URL is set, Neon 'dev' branch, throwaway wbtest_* users),
 * then the HTTP API end to end, including the free / Plus split.
 * Run: node --test --test-concurrency=1 server/recovery.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadLocalEnv } from './db/migrate.js';
import { createJsonWellbeingStore } from './wellbeing/json-store.js';
import { createWellbeingStore } from './wellbeing/index.js';
import { ValidationError } from './wellbeing/validate.js';
import {
  normalizeRecoveryGoal, normalizeRecoveryLog, normalizeLearning, goalStats, recoveryInsights, mergeLearning, MILESTONES,
} from './wellbeing/recovery.js';
import { encryptionStatus, encryptionStartupLine } from './db/crypto.js';
import { createReleaseCatalog, statusFor } from './content-releases.js';
import { loadModules, normalizeModules } from './learning.js';

loadLocalEnv();
const PG_URL = String(process.env.DATABASE_URL || '').trim();
const pgSkip = PG_URL ? false : 'DATABASE_URL not set; Postgres backend tests skipped';
const run = crypto.randomBytes(4).toString('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-rc-'));
const KEY = crypto.randomBytes(32).toString('base64');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date());
const daysAgo = (n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const SECRET = 'my private trigger words';

/* ---------------- pure rules ---------------- */

test('day counts are gentle: a lapse takes one day out, never resets, milestones stay reached', () => {
  const g = { id: 'g1', startDate: '2026-09-01' };
  const today = '2026-10-18';
  const none = goalStats(g, [], today);
  assert.equal(none.daysOnPath, 48);
  assert.equal(none.daysToPlan, 48);
  assert.equal(none.sinceLastLapse, null);
  assert.deepEqual(none.milestones.reached, MILESTONES.filter((m) => m <= 48));
  assert.equal(none.milestones.next, 60);
  const logs = [
    { goalId: 'g1', kind: 'lapse', date: '2026-10-10' },
    { goalId: 'g1', kind: 'lapse', date: '2026-10-10' }, // two logs on one day = one day
    { goalId: 'g1', kind: 'lapse', date: '2026-10-15' },
    { goalId: 'other', kind: 'lapse', date: '2026-10-16' },
    { goalId: 'g1', kind: 'craving', date: '2026-10-17', outcome: 'passed' },
    { goalId: 'g1', kind: 'craving', date: '2026-10-17', outcome: 'used' },
    { goalId: 'g1', kind: 'lapse', date: '2026-08-01' }, // before the start: not counted
  ];
  const s = goalStats(g, logs, today);
  assert.equal(s.daysOnPath, 48, 'days on this path never reset');
  assert.equal(s.lapseDays, 2);
  assert.equal(s.daysToPlan, 46);
  assert.equal(s.lastLapse, '2026-10-15');
  assert.equal(s.sinceLastLapse, 3);
  assert.equal(s.cravingsLogged, 2);
  assert.equal(s.cravingsPassed, 1);
  assert.ok(s.milestones.reached.includes(30), 'the 30-day milestone is kept after a lapse');
  assert.equal(goalStats({ id: 'n', startDate: today }, [], today).daysOnPath, 1, 'starting today is day 1');
});

test('insights describe what was logged and never diagnose', () => {
  const g = [{ id: 'g1', startDate: '2026-09-01', status: 'active', label: 'Alcohol', kind: 'abstain' }];
  const logs = [
    { goalId: 'g1', kind: 'craving', date: '2026-10-17', intensity: 6, outcome: 'passed', triggers: ['Payday', 'Friday'] },
    { goalId: 'g1', kind: 'craving', date: '2026-10-12', intensity: 8, outcome: 'used', triggers: ['Payday'] },
    { goalId: 'g1', kind: 'lapse', date: '2026-10-12', triggers: ['Payday'] },
    { goalId: 'g1', kind: 'craving', date: '2026-06-01', intensity: 3, triggers: ['Old'] },
  ];
  const i = recoveryInsights(g, logs, { days: 30, today: '2026-10-18' });
  assert.equal(i.cravings, 2);
  assert.equal(i.cravingsPassed, 1);
  assert.equal(i.lapses, 1);
  assert.deepEqual(i.topTriggers[0], { name: 'Payday', count: 3 });
  assert.ok(!i.topTriggers.some((t) => t.name === 'Old'), 'outside the range');
  assert.equal(i.weeks.length, 5);
  assert.equal(i.weeks.at(-1).averageStrength, 7);
  for (const line of i.lines) assert.doesNotMatch(line, /diagnos|disorder|addict|fail|relapsed/i);
  assert.match(i.note, /not an assessment or a diagnosis/);
});

test('validation: goals, logs and learning notes', () => {
  assert.throws(() => normalizeRecoveryGoal({ kind: 'binge' }), ValidationError);
  assert.throws(() => normalizeRecoveryGoal({ kind: 'abstain', startDate: '2099-01-01' }), /future/);
  assert.throws(() => normalizeRecoveryGoal({ kind: 'abstain', label: 'x'.repeat(81) }), /longer/);
  const g = normalizeRecoveryGoal({ kind: 'reduce' });
  assert.equal(g.startDate, TODAY);
  assert.equal(g.label, '', 'labels are optional');
  assert.equal(g.status, 'active');
  assert.throws(() => normalizeRecoveryLog({ kind: 'relapse' }), ValidationError);
  assert.throws(() => normalizeRecoveryLog({ kind: 'craving', intensity: 11 }), /0 to 10/);
  assert.throws(() => normalizeRecoveryLog({ kind: 'craving', outcome: 'gave in' }), ValidationError);
  assert.throws(() => normalizeRecoveryLog({ kind: 'craving', triggers: Array.from({ length: 13 }, (_, i) => `t${i}`) }), /up to 12/);
  const l = normalizeRecoveryLog({ kind: 'craving', intensity: '7', triggers: [' Payday ', 'Payday', ''], outcome: 'passed' });
  assert.deepEqual(l.triggers, ['Payday']);
  assert.equal(l.intensity, 7);
  assert.throws(() => normalizeLearning({ step: 99 }), ValidationError);
  assert.throws(() => normalizeLearning({ quiz: { correct: 3, total: 2 } }), ValidationError);
  const n = normalizeLearning({ step: 2, reflection: 'mine', values: ['Family', 'family', 'Family'], thoughtRecord: { situation: 'work', balanced: 'it was one meeting' }, quiz: { correct: 1, total: 2 } });
  assert.deepEqual(n.values, ['Family', 'family']);
  assert.equal(n.thoughtRecord.feeling, '');
  const m1 = mergeLearning(null, { step: 3 }, 'a');
  const m2 = mergeLearning(m1, { step: 1, completed: true, reflection: 'kept' }, 'b');
  assert.equal(m2.step, 3, 'going back a step never loses progress');
  assert.equal(m2.completedAt, 'b');
  assert.equal(mergeLearning(m2, { reflection: '' }, 'c').notes.reflection, undefined, 'clearing a note removes it');
});

test('encryption status for the startup log never contains key material', () => {
  assert.equal(encryptionStatus({}).state, 'off');
  assert.match(encryptionStartupLine({}), /Wellbeing encryption: OFF/);
  const on = encryptionStartupLine({ HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'k1' });
  assert.match(on, /Wellbeing encryption: on \(aes-256-gcm-v1, key id k1\)/);
  assert.match(on, /JSON file store/);
  assert.ok(!on.includes(KEY) && !on.includes(KEY.slice(0, 12)), 'the key is never printed');
  const bad = encryptionStartupLine({ HOPEWICK_DATA_KEY: 'c2hvcnQ=' });
  assert.match(bad, /MISCONFIGURED \(HOPEWICK_DATA_KEY must be base64 of exactly 32 bytes\.\)/);
  assert.ok(!bad.includes('c2hvcnQ='));
});

test('learning modules: valid, short, sourced, pending clinical review, with one practical step each', () => {
  const mods = loadModules();
  const ids = Object.keys(mods);
  assert.ok(ids.length >= 10);
  for (const m of Object.values(mods)) {
    assert.equal(m.review, 'pending');
    assert.ok(m.minutes <= 8);
    assert.ok(m.sources.length >= 1);
    assert.equal(m.steps.filter((s) => s.type === 'try').length, 1, `${m.id}: one try-this-today step`);
    const text = JSON.stringify(m.steps);
    assert.doesNotMatch(text, /\b(cure|guarantee|clinically proven|diagnos)/i, `${m.id}: no clinical claims`);
  }
  // Interactions the founder asked for are all present somewhere.
  const types = new Set(Object.values(mods).flatMap((m) => m.steps.map((s) => s.type)));
  for (const t of ['cards', 'quiz', 'defusion', 'timer', 'values', 'thought-record', 'reflect', 'try']) assert.ok(types.has(t), t);
  assert.throws(() => normalizeModules({ modules: [{ ...mods['cbt-basics'], steps: mods['cbt-basics'].steps.filter((s) => s.type !== 'try') }] }), /try this today/);
  assert.throws(() => normalizeModules({ modules: [{ ...mods['cbt-basics'], minutes: 20 }] }), /short/);
  const q = mods['cbt-basics'].steps.find((s) => s.type === 'quiz');
  assert.throws(() => normalizeModules({ modules: [{ ...mods['cbt-basics'], steps: [q, { ...q, questions: [{ ...q.questions[0], answer: 9 }, q.questions[1]] }, mods['cbt-basics'].steps.at(-1)] }] }), /answer must point/);
});

test('module schedule: a small free core (about 6, with one ACT module), the rest are weekly Plus drops free 6 months later', () => {
  const cat = createReleaseCatalog();
  const mods = cat.all().filter((i) => i.kind === 'module');
  // Faith modules (Stage 5) are opt-in and hidden by default, so they are counted separately.
  const core = mods.filter((i) => i.core && !(i.meta && i.meta.faith));
  assert.ok(core.length >= 5 && core.length <= 7, `core size ${core.length}`);
  assert.equal(mods.filter((i) => i.core && i.meta && i.meta.faith).length, 1, 'one small free faith module');
  for (const k of ['cravings-triggers', 'sleep-basics', 'stress-anxiety', 'harm-reduction', 'support-australia', 'cbt-basics', 'act-unhooking']) assert.ok(core.some((c) => c.key === k), k);
  assert.equal(core.filter((c) => c.content.approach === 'ACT').length, 1, 'one ACT module in the free core');
  const later = mods.filter((i) => !i.core).sort((a, b) => (a.plusReleaseDate < b.plusReleaseDate ? -1 : 1));
  for (const k of ['dbt-skills', 'thought-record', 'behavioural-activation', 'act-values', 'act-acceptance']) assert.ok(later.some((c) => c.key === k), k);
  assert.ok(later.filter((c) => c.content.approach === 'ACT').length >= 2, 'further ACT modules on the Plus schedule');
  for (let i = 1; i < later.length; i++) {
    const gap = (Date.parse(later[i].plusReleaseDate) - Date.parse(later[i - 1].plusReleaseDate)) / 86400000;
    assert.equal(gap, 7, 'one a week');
  }
  for (const m of later) {
    const free = statusFor(m, { plus: false, today: m.plusReleaseDate });
    assert.equal(free.available, false);
    assert.equal(statusFor(m, { plus: true, today: m.plusReleaseDate }).available, true);
    assert.equal(statusFor(m, { plus: false, today: m.freeReleaseDate }).available, true);
  }
  // Locked modules never carry their text.
  const lockedForFree = cat.list({ plus: false, today: later[0].plusReleaseDate }).find((x) => x.key === later[0].key);
  assert.equal(lockedForFree.available, false);
  assert.equal(lockedForFree.content, undefined);
  assert.equal(lockedForFree.meta.review, 'pending');
  assert.equal(cat.list({ plus: true, today: '2026-10-01' }).some((x) => x.kind === 'module' && !x.core), false, 'nothing before its Plus date');
});

/* ---------------- storage contract ---------------- */

async function contract(t, store, { A, B }) {
  const P = 'main';
  await t.test(`${store.backend}: recovery goals and logs: create, edit, list, isolate, delete cascades`, async () => {
    const g = await store.createRecoveryGoal(A, P, normalizeRecoveryGoal({ kind: 'abstain', label: 'Alcohol', why: 'for my kids', startDate: daysAgo(10) }));
    assert.equal(g.kind, 'abstain');
    assert.equal(g.label, 'Alcohol');
    assert.equal(g.startDate, daysAgo(10));
    const g2 = await store.createRecoveryGoal(A, P, normalizeRecoveryGoal({ kind: 'reduce', target: 'two nights a week' }));
    const edited = await store.updateRecoveryGoal(A, P, g2.id, normalizeRecoveryGoal({ status: 'paused', label: 'Weed' }, { partial: true }));
    assert.equal(edited.status, 'paused');
    assert.equal(edited.target, 'two nights a week', 'untouched fields kept');
    const lapse = await store.createRecoveryLog(A, P, normalizeRecoveryLog({ kind: 'lapse', goalId: g.id, date: daysAgo(3), note: 'party' }));
    const crav = await store.createRecoveryLog(A, P, normalizeRecoveryLog({ kind: 'craving', goalId: g.id, intensity: 7, outcome: 'passed', triggers: [SECRET], helped: 'walked' }));
    await store.createRecoveryLog(A, P, normalizeRecoveryLog({ kind: 'craving', intensity: 2 }));
    assert.deepEqual(crav.triggers, [SECRET]);
    const logs = await store.listRecoveryLogs(A, P);
    assert.equal(logs.length, 3);
    assert.equal(logs[2].id, lapse.id, 'newest first');
    const fixed = await store.updateRecoveryLog(A, P, crav.id, normalizeRecoveryLog({ intensity: 5 }, { partial: true }));
    assert.equal(fixed.intensity, 5);
    assert.equal(fixed.kind, 'craving');
    assert.deepEqual(fixed.triggers, [SECRET]);
    await assert.rejects(() => store.createRecoveryLog(A, P, normalizeRecoveryLog({ kind: 'lapse', goalId: crypto.randomUUID() })), /not found/);
    assert.equal((await store.listRecoveryGoals(B, P)).length, 0, 'other users see nothing');
    assert.equal((await store.listRecoveryLogs(B, P)).length, 0);
    await assert.rejects(() => store.deleteRecoveryGoal(B, P, g.id), /not found/i);
    await assert.rejects(() => store.createRecoveryLog(B, P, normalizeRecoveryLog({ kind: 'lapse', goalId: g.id })), /not found/i, 'cannot log against another account\'s goal');
    await store.deleteRecoveryGoal(A, P, g.id);
    const left = await store.listRecoveryLogs(A, P);
    assert.equal(left.length, 1, 'deleting a goal deletes its logs only');
    assert.equal(left[0].goalId, null);
    await store.deleteRecoveryLog(A, P, left[0].id);
    assert.equal((await store.listRecoveryGoals(A, P)).length, 1);
  });

  await t.test(`${store.backend}: learning progress merges, keeps private notes, deletes`, async () => {
    const a = await store.saveLearning(A, P, 'act-unhooking', normalizeLearning({ step: 2 }));
    assert.equal(a.step, 2);
    const b = await store.saveLearning(A, P, 'act-unhooking', normalizeLearning({ step: 4, completed: true, reflection: SECRET, quiz: { correct: 2, total: 2 } }));
    assert.equal(b.step, 4);
    assert.ok(b.completedAt);
    assert.equal(b.notes.reflection, SECRET);
    const c = await store.saveLearning(A, P, 'act-values', normalizeLearning({ values: ['Family', 'Health'] }));
    assert.deepEqual(c.notes.values, ['Family', 'Health']);
    const list = await store.listLearning(A, P);
    assert.equal(list.length, 2);
    const u = list.find((x) => x.moduleId === 'act-unhooking');
    assert.deepEqual(u.quiz, { correct: 2, total: 2 });
    assert.equal(u.notes.reflection, SECRET);
    assert.equal((await store.listLearning(B, P)).length, 0);
    await store.deleteLearning(A, P, 'act-values');
    assert.equal((await store.listLearning(A, P)).length, 1);
    await assert.rejects(() => store.deleteLearning(A, P, 'act-values'), /not found/i);
  });

  await t.test(`${store.backend}: clearArea recovery / learning removes only what was asked`, async () => {
    const W = 'rc';
    const g = await store.createRecoveryGoal(A, W, normalizeRecoveryGoal({ kind: 'other', label: 'Gambling' }));
    await store.createRecoveryLog(A, W, normalizeRecoveryLog({ kind: 'craving', goalId: g.id }));
    await store.createRecoveryLog(A, W, normalizeRecoveryLog({ kind: 'craving' }));
    await store.saveLearning(A, W, 'sleep-basics', normalizeLearning({ step: 1 }));
    assert.equal(await store.clearArea(A, W, 'recovery'), 3);
    assert.equal((await store.listRecoveryGoals(A, W)).length + (await store.listRecoveryLogs(A, W)).length, 0);
    assert.equal((await store.listLearning(A, W)).length, 1, 'learning untouched');
    assert.equal(await store.clearArea(A, W, 'learning'), 1);
    assert.ok((await store.profileIds(A)).includes(P));
  });

  await t.test(`${store.backend}: forget removes tracker and learning for this account only`, async () => {
    await store.createRecoveryGoal(B, P, normalizeRecoveryGoal({ kind: 'abstain' }));
    await store.forget(A);
    assert.equal((await store.listRecoveryGoals(A, P)).length, 0);
    assert.equal((await store.listLearning(A, P)).length, 0);
    assert.equal((await store.listRecoveryGoals(B, P)).length, 1);
    await store.forget(B);
  });
}

test('JSON backend contract (plain text)', async (t) => {
  const dir = tmp();
  const store = createJsonWellbeingStore(path.join(dir, 'wellbeing.json'), { env: { HOPEWICK_DATA_KEY: '' } });
  await contract(t, store, { A: 'userA', B: 'userB' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend with HOPEWICK_DATA_KEY: tracker labels, notes, triggers and module notes are encrypted in the file', async (t) => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  const env = { HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'rc1' };
  const store = createJsonWellbeingStore(file, { env });
  await contract(t, store, { A: 'userA', B: 'userB' });
  const g = await store.createRecoveryGoal('userC', 'main', normalizeRecoveryGoal({ kind: 'abstain', label: 'secret-substance-label', target: 'secret target', why: 'secret why' }));
  await store.createRecoveryLog('userC', 'main', normalizeRecoveryLog({ kind: 'craving', goalId: g.id, triggers: ['secret-trigger'], helped: 'secret helped', note: 'secret note' }));
  await store.saveLearning('userC', 'main', 'thought-record', normalizeLearning({ reflection: 'secret reflection', values: ['secret-value'], thoughtRecord: { thought: 'secret thought' } }));
  const raw = fs.readFileSync(file, 'utf8');
  for (const s of ['secret-substance-label', 'secret target', 'secret why', 'secret-trigger', 'secret helped', 'secret note', 'secret reflection', 'secret-value', 'secret thought']) {
    assert.ok(!raw.includes(s), `${s} must not be in the file`);
  }
  assert.match(raw, /hwenc:v1:rc1:/);
  const again = createJsonWellbeingStore(file, { env });
  assert.equal((await again.listRecoveryGoals('userC', 'main'))[0].label, 'secret-substance-label');
  assert.equal((await again.listLearning('userC', 'main'))[0].notes.thoughtRecord.thought, 'secret thought');
  const noKey = createJsonWellbeingStore(file, { env: {} });
  await assert.rejects(() => noKey.listRecoveryGoals('userC', 'main'), /No key loaded/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend reads files saved before Stage 4', async () => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, users: { u: { settings: {}, consentEvents: [], profiles: { main: { checkins: {}, activities: [], goals: [], journal: [], plans: null, nextSteps: [] } } } } }));
  const store = createJsonWellbeingStore(file, { env: {} });
  assert.deepEqual(await store.listRecoveryGoals('u', 'main'), []);
  assert.deepEqual(await store.listLearning('u', 'main'), []);
  const g = await store.createRecoveryGoal('u', 'main', normalizeRecoveryGoal({ kind: 'abstain' }));
  assert.ok(g.id);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Postgres backend contract (Neon dev)', { skip: pgSkip }, async (t) => {
  const { closePool, withUser } = await import('./db/index.js');
  const env = { ...process.env, HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'rc1' };
  const store = createWellbeingStore({ env, backend: 'postgres' });
  const A = `wbtest_${run}_ra`; const B = `wbtest_${run}_rb`; const C = `wbtest_${run}_rc`;
  try {
    await contract(t, store, { A, B });
    await t.test('postgres: tracker and learning columns are ciphertext at rest; RLS hides other users', async () => {
      const g = await store.createRecoveryGoal(C, 'main', normalizeRecoveryGoal({ kind: 'abstain', label: 'secret label', why: 'secret why' }));
      await store.createRecoveryLog(C, 'main', normalizeRecoveryLog({ kind: 'craving', goalId: g.id, triggers: ['secret trigger'], note: 'secret note', helped: 'secret helped' }));
      await store.saveLearning(C, 'main', 'cbt-basics', normalizeLearning({ step: 1, reflection: 'secret reflection' }));
      const raw = await withUser(C, async (c) => ({
        g: (await c.query('SELECT label, why, encryption FROM recovery_goals WHERE user_id = $1', [C])).rows[0],
        l: (await c.query('SELECT triggers, note, helped, encryption FROM recovery_logs WHERE user_id = $1', [C])).rows[0],
        p: (await c.query('SELECT notes, encryption FROM module_progress WHERE user_id = $1', [C])).rows[0],
        others: (await c.query('SELECT (SELECT count(*) FROM recovery_goals)::int + (SELECT count(*) FROM recovery_logs)::int + (SELECT count(*) FROM module_progress)::int AS n')).rows[0].n,
      }), env);
      for (const v of [raw.g.label, raw.g.why, raw.l.triggers, raw.l.note, raw.l.helped, raw.p.notes]) assert.match(v, /^hwenc:v1:rc1:/);
      for (const e of [raw.g.encryption, raw.l.encryption, raw.p.encryption]) assert.equal(e, 'aes-256-gcm-v1');
      assert.equal(raw.others, 3, 'RLS: only this user\'s rows are visible even without WHERE');
      const seen = await withUser(B, async (c) => (await c.query('SELECT (SELECT count(*) FROM recovery_goals)::int + (SELECT count(*) FROM module_progress)::int AS n')).rows[0].n, env);
      assert.equal(seen, 0);
      // RLS also blocks writing a row for someone else.
      await assert.rejects(() => withUser(B, (c) => c.query("INSERT INTO recovery_goals (user_id, kind, start_date) VALUES ($1, 'abstain', current_date)", [C]), env), /row-level security/);
    });
  } finally {
    for (const u of [A, B, C]) { try { await store.forget(u); } catch { /* already gone */ } }
    await closePool();
  }
});

/* ---------------- HTTP API, end to end ---------------- */

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'OPENAI_API_KEY', 'FOUNDER_PLUS_EMAILS', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'HOPEWICK_DATA_KEY', 'DATABASE_URL'];
async function listen({ backend }) {
  const dir = tmp();
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test', FOUNDER_PLUS_EMAILS: 'plus-founder@example.com', HOPEWICK_DATA_KEY: KEY });
  if (backend === 'postgres') process.env.DATABASE_URL = PG_URL;
  const { startServer } = await import('./index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function signIn(base, email) {
  const sent = await fetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const data = await sent.json();
  const verified = await fetch(data.devLink, { redirect: 'manual' });
  return (verified.headers.get('set-cookie') || '').split(';')[0];
}
function api(base, cookie) {
  return async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), csp: res.headers.get('content-security-policy') };
  };
}

async function httpSuite(t, backend) {
  const app = await listen({ backend });
  const tag = crypto.randomBytes(3).toString('hex');
  const fresh = async (name) => api(app.base, await signIn(app.base, `rc-${name}-${tag}@example.com`));
  const setPlan = (who, status) => who('POST', '/api/billing/dev-set', { status });
  const catalog = createReleaseCatalog();
  const plusFirst = catalog.list({ plus: true }).find((x) => x.kind === 'module' && !x.core && x.plusOnly);
  const unreleased = catalog.all().find((x) => x.kind === 'module' && x.plusReleaseDate > TODAY);
  try {
    const anon = api(app.base, null);
    const free = await fresh('free');
    const plus = api(app.base, await signIn(app.base, 'plus-founder@example.com'));

    await t.test(`${backend} http: signed out gets 401 for the tracker and learning`, async () => {
      assert.equal((await anon('GET', '/api/me/recovery?profileId=main')).status, 401);
      assert.equal((await anon('PUT', '/api/me/learning/cbt-basics', { profileId: 'main', step: 1 })).status, 401);
    });

    await t.test(`${backend} http: free account gets the whole basic tracker: goals, day counts, milestones, lapse and craving logs`, async () => {
      const g = await free('POST', '/api/me/recovery/goals', { profileId: 'main', kind: 'abstain', label: 'Alcohol', startDate: daysAgo(40) });
      assert.equal(g.status, 201, JSON.stringify(g.body));
      for (const n of [1, 20]) {
        const l = await free('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'lapse', goalId: g.body.goal.id, date: daysAgo(n) });
        assert.equal(l.status, 201, JSON.stringify(l.body));
      }
      const c = await free('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'craving', goalId: g.body.goal.id, intensity: 6, triggers: ['Payday'], outcome: 'passed' });
      assert.equal(c.status, 201);
      const r = await free('GET', '/api/me/recovery?profileId=main');
      assert.equal(r.status, 200);
      const s = r.body.goals[0].stats;
      assert.equal(s.daysOnPath, 41);
      assert.equal(s.daysToPlan, 39, 'counts use every log, even ones outside the 7-day view');
      assert.ok(s.milestones.reached.includes(30));
      assert.equal(r.body.logs.length, 2, 'free sees the last 7 days of logs');
      assert.equal(r.body.window.hiddenCount, 1);
      assert.equal(r.body.window.limited, true);
      const bad = await free('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'lapse', intensity: 40 });
      assert.equal(bad.status, 400);
    });

    await t.test(`${backend} http: tracker trends are Plus; free gets a kind 403 and nothing else`, async () => {
      const f = await free('GET', '/api/me/recovery/insights?profileId=main&days=30');
      assert.equal(f.status, 403);
      assert.equal(f.body.code, 'plus');
      assert.match(f.body.error, /day counts, milestones and logging stay free/);
      await plus('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'craving', intensity: 4, triggers: ['Stress'] });
      const p = await plus('GET', '/api/me/recovery/insights?profileId=main&days=90');
      assert.equal(p.status, 200);
      assert.equal(p.body.insights.cravings, 1);
      assert.equal((await plus('GET', '/api/me/recovery/insights?profileId=main&days=12')).status, 400);
    });

    await t.test(`${backend} http: Plus sees the full log history; lapsed Plus keeps everything and narrows only the view`, async () => {
      const u = await fresh('lapsed');
      await setPlan(u, 'active');
      for (const n of [0, 30]) assert.equal((await u('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'craving', date: daysAgo(n) })).status, 201);
      assert.equal((await u('GET', '/api/me/recovery?profileId=main')).body.logs.length, 2);
      await setPlan(u, 'canceled');
      const after = await u('GET', '/api/me/recovery?profileId=main');
      assert.equal(after.body.logs.length, 1);
      assert.equal(after.body.window.hiddenCount, 1);
      const exp = await u('GET', '/api/me/export?profileId=main');
      assert.equal(exp.body.recoveryTracker.logs.length, 2, 'export always has everything');
    });

    await t.test(`${backend} http: core modules are free; Plus-first modules are Plus; unreleased modules do not exist yet`, async () => {
      const ok = await free('PUT', '/api/me/learning/act-unhooking', { profileId: 'main', step: 3, reflection: 'my own words' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.progress.notes.reflection, 'my own words');
      if (plusFirst) {
        const locked = await free('PUT', `/api/me/learning/${plusFirst.key}`, { profileId: 'main', step: 1 });
        assert.equal(locked.status, 403);
        assert.equal(locked.body.code, 'plus');
        assert.equal((await plus('PUT', `/api/me/learning/${plusFirst.key}`, { profileId: 'main', step: 1 })).status, 200);
        const item = await free('GET', `/api/content/item/module-${plusFirst.key}`);
        assert.equal(item.status, 403);
        assert.equal(item.body.item.content, undefined, 'a locked module never sends its text');
      }
      if (unreleased) {
        assert.equal((await plus('PUT', `/api/me/learning/${unreleased.key}`, { profileId: 'main', step: 1 })).status, 404, 'even Plus waits for the Plus date');
        assert.equal((await plus('GET', `/api/content/item/${unreleased.id}`)).status, 404);
      }
      assert.equal((await free('PUT', '/api/me/learning/not-a-module', { profileId: 'main', step: 1 })).status, 404);
      assert.equal((await free('PUT', '/api/me/learning/BAD!', { profileId: 'main', step: 1 })).status, 400);
      const list = await free('GET', '/api/me/learning?profileId=main');
      assert.equal(list.body.progress.length, 1);
      const rel = await free('GET', '/api/content/releases');
      const core = rel.body.items.filter((x) => x.kind === 'module' && x.core);
      assert.ok(core.length >= 6 && core.every((x) => x.available && x.content && x.meta.review === 'pending'));
    });

    await t.test(`${backend} http: export includes tracker and learning; delete areas recovery and learning work on every plan`, async () => {
      const exp = await free('GET', '/api/me/export?profileId=main');
      assert.equal(exp.body.recoveryTracker.goals.length, 1);
      assert.equal(exp.body.recoveryTracker.logs.length, 3);
      assert.equal(exp.body.learning[0].notes.reflection, 'my own words');
      assert.equal((await free('DELETE', '/api/me/data/recovery?profileId=main')).status, 400, 'needs confirm');
      const del = await free('DELETE', '/api/me/data/recovery?profileId=main&confirm=recovery');
      assert.equal(del.status, 200, JSON.stringify(del.body));
      assert.equal((await free('GET', '/api/me/recovery?profileId=main')).body.goals.length, 0);
      assert.equal((await free('DELETE', '/api/me/data/learning?profileId=main&confirm=learning')).status, 200);
      assert.equal((await free('GET', '/api/me/learning?profileId=main')).body.progress.length, 0);
    });

    await t.test(`${backend} http: CSP allows the Google sign-in stylesheet host`, async () => {
      const r = await anon('GET', '/app/');
      assert.match(r.csp, /style-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com(;|$)/);
    });
  } finally {
    await app.close();
  }
}

test('HTTP API on the JSON backend', async (t) => { await httpSuite(t, 'json'); });
test('HTTP API on the Postgres backend (Neon dev)', { skip: pgSkip }, async (t) => { await httpSuite(t, 'postgres'); });
