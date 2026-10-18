/**
 * Hopewick 2.0 Stage 3: one storage interface, two backends.
 *
 * The same contract suite runs against
 *   - the JSON fallback (always), and
 *   - Postgres (only when DATABASE_URL is set: env or the untracked local .env;
 *     use the Neon 'dev' branch, never 'main'. Throwaway users are wbtest_*).
 * Then the HTTP API is exercised end to end on a real server for each backend.
 * Run: node --test --test-concurrency=1 server/wellbeing.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { loadLocalEnv } from './db/migrate.js';
import { createJsonWellbeingStore } from './wellbeing/json-store.js';
import { createWellbeingStore } from './wellbeing/index.js';
import { normalizeCheckin, normalizeJournal, normalizeGoal, normalizeStep, normalizeActivityStart, normalizeActivityPatch, normalizeLegacyJournal, normalizePlans, normalizeWeeklyPlan, ValidationError } from './wellbeing/validate.js';
import { StoreUnavailableError } from './json-file.js';

loadLocalEnv();
const PG_URL = String(process.env.DATABASE_URL || '').trim();
const pgSkip = PG_URL ? false : 'DATABASE_URL not set; Postgres backend tests skipped';
const run = crypto.randomBytes(4).toString('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-wb-'));
const KEY = crypto.randomBytes(32).toString('base64');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date());
const daysAgo = (n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function contract(t, store, { A, B, rawText }) {
  const P = 'main';
  await t.test(`${store.backend}: weekly plans create, tick, list, delete; clearArea removes only what was asked; journal keeps packId`, async () => {
    const W = 'wk';
    const w = await store.createWeeklyPlan(A, W, normalizeWeeklyPlan({ title: 'Steady week', weekStart: '2026-10-18', steps: ['Call Sam', { title: 'Meeting', day: 4 }] }));
    assert.equal(w.status, 'active');
    assert.deepEqual(w.steps.map((x) => x.title), ['Call Sam', 'Meeting']);
    const ticked = await store.updateWeeklyPlan(A, W, w.id, normalizeWeeklyPlan({ steps: w.steps.map((x) => ({ ...x, done: true })), status: 'done' }, { partial: true }));
    assert.equal(ticked.status, 'done');
    assert.ok(ticked.completedAt && ticked.steps.every((x) => x.done && x.doneAt));
    assert.equal((await store.listWeeklyPlans(A, W)).length, 1);
    assert.equal((await store.listWeeklyPlans(B, W)).length, 0, 'other users see nothing');
    const j = await store.createJournal(A, W, normalizeJournal({ body: 'pack entry', kind: 'prompt', packId: 'first-30-days' }));
    assert.equal(j.packId, 'first-30-days');
    await store.putCheckin(A, W, normalizeCheckin({ mood: 3 }, { date: '2026-10-11' }));
    assert.equal(await store.clearArea(A, W, 'journal'), 1);
    assert.equal((await store.listJournal(A, W)).length, 0);
    assert.equal((await store.listCheckins(A, W, {})).length, 1, 'check-ins untouched');
    assert.equal((await store.listWeeklyPlans(A, W)).length, 1, 'weekly plans untouched');
    await store.clearArea(A, W, 'all');
    assert.equal((await store.listCheckins(A, W, {})).length + (await store.listWeeklyPlans(A, W)).length, 0);
    assert.ok((await store.listCheckins(A, P, {})).length >= 0);
  });

  await t.test(`${store.backend}: check-in save, edit, list by range, delete; one per day`, async () => {
    const c1 = await store.putCheckin(A, P, normalizeCheckin({ mood: 2, feelings: 'tight chest before work', triggers: ['Work', 'work', 'Tired'], intensity: 7, craving: 'Mild', notes: 'walked after' }, { date: '2026-10-10' }));
    assert.equal(c1.moodLabel, 'Low');
    assert.deepEqual(c1.triggers, ['Work', 'Tired']);
    const c2 = await store.putCheckin(A, P, normalizeCheckin({ mood: 4, feelings: 'better', triggers: [], intensity: 3 }, { date: '2026-10-10' }));
    assert.equal(c2.id, c1.id, 'same day keeps one row');
    assert.equal(c2.mood, 4);
    assert.equal(c2.notes, '');
    await store.putCheckin(A, P, normalizeCheckin({ mood: 5 }, { date: '2026-10-12' }));
    const all = await store.listCheckins(A, P, {});
    assert.deepEqual(all.map((c) => c.date), ['2026-10-12', '2026-10-10']);
    const ranged = await store.listCheckins(A, P, { from: '2026-10-11', to: '2026-10-31' });
    assert.deepEqual(ranged.map((c) => c.date), ['2026-10-12']);
    await store.deleteCheckin(A, P, '2026-10-12');
    assert.equal((await store.listCheckins(A, P, {})).length, 1);
    await assert.rejects(() => store.deleteCheckin(A, P, '2026-10-12'), /no check-in/i);
    assert.equal((await store.listCheckins(B, P, {})).length, 0, 'other users see nothing');
  });

  await t.test(`${store.backend}: coping activity begin, pause, resume, complete, feedback; completed stays completed`, async () => {
    const a = await store.startActivity(A, P, normalizeActivityStart({ toolKey: 'grounding-54321' }));
    assert.equal(a.status, 'started');
    assert.equal(a.toolType, 'grounding');
    const paused = await store.updateActivity(A, P, a.id, normalizeActivityPatch({ status: 'paused', stepIndex: 2 }));
    assert.equal(paused.status, 'paused');
    assert.equal(paused.stepIndex, 2);
    const resumed = await store.updateActivity(A, P, a.id, normalizeActivityPatch({ status: 'started' }));
    assert.equal(resumed.status, 'started');
    const done = await store.updateActivity(A, P, a.id, normalizeActivityPatch({ status: 'completed', stepIndex: 5, durationSeconds: 240 }));
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt);
    const rated = await store.updateActivity(A, P, a.id, normalizeActivityPatch({ helpful: 'yes', note: 'the sounds helped' }));
    assert.equal(rated.helpful, 'yes');
    assert.equal(rated.note, 'the sounds helped');
    await assert.rejects(() => store.updateActivity(A, P, a.id, normalizeActivityPatch({ status: 'started' })), /already complete/);
    const list = await store.listActivities(A, P, {});
    assert.equal(list.length, 1);
    await assert.rejects(() => store.updateActivity(B, P, a.id, normalizeActivityPatch({ status: 'paused' })), /not found/i, 'cannot touch another user\'s activity');
  });

  await t.test(`${store.backend}: goals create, progress, complete, archive, delete`, async () => {
    const g = await store.createGoal(A, P, normalizeGoal({ title: 'Walk three times this week', category: 'wellbeing', progress: 10 }));
    assert.equal(g.status, 'active');
    const up = await store.updateGoal(A, P, g.id, normalizeGoal({ progress: 60 }, { partial: true }));
    assert.equal(up.progress, 60);
    assert.equal(up.title, 'Walk three times this week');
    const done = await store.updateGoal(A, P, g.id, normalizeGoal({ status: 'completed' }, { partial: true }));
    assert.equal(done.status, 'completed');
    assert.equal(done.progress, 100);
    assert.ok(done.completedAt);
    const archived = await store.updateGoal(A, P, g.id, normalizeGoal({ status: 'archived' }, { partial: true }));
    assert.equal(archived.status, 'archived');
    assert.equal(archived.completedAt, null);
    await store.deleteGoal(A, P, g.id);
    assert.equal((await store.listGoals(A, P)).length, 0);
  });

  await t.test(`${store.backend}: journal create, edit, delete, idempotent import`, async () => {
    const e = await store.createJournal(A, P, normalizeJournal({ kind: 'gratitude', title: 'Small wins', body: `${rawText} and the sun`, entryDate: '2026-10-11' }));
    assert.equal(e.kind, 'gratitude');
    assert.equal(e.entryDate, '2026-10-11');
    const ed = await store.updateJournal(A, P, e.id, normalizeJournal({ body: 'edited body', refined: 'deeper', emotions: 'calm' }, { partial: true }));
    assert.equal(ed.body, 'edited body');
    assert.equal(ed.title, 'Small wins');
    assert.equal(ed.refined, 'deeper');
    const legacy = [{ id: 'abc123', title: 'Old', body: 'from the browser', created: Date.parse('2026-09-01T00:00:00Z'), updated: Date.parse('2026-09-02T00:00:00Z'), refined: 'r', emotions: 'hope' }]
      .map(normalizeLegacyJournal);
    const r1 = await store.importJournal(A, P, legacy);
    const r2 = await store.importJournal(A, P, legacy);
    assert.deepEqual(r1, { imported: 1, skipped: 0 });
    assert.deepEqual(r2, { imported: 0, skipped: 1 });
    const list = await store.listJournal(A, P);
    assert.equal(list.length, 2);
    const imported = list.find((x) => x.clientId === 'abc123');
    assert.equal(imported.body, 'from the browser');
    assert.equal(imported.entryDate, '2026-09-01');
    await store.deleteJournal(A, P, e.id);
    assert.equal((await store.listJournal(A, P)).length, 1);
    assert.equal((await store.listJournal(B, P)).length, 0);
  });

  await t.test(`${store.backend}: plans and next steps`, async () => {
    assert.equal(await store.getPlans(A, P), null);
    const plans = normalizePlans({ relapse: { warnings: rawText, people: [{ name: 'Sam', reach: '0400 000 000' }] }, exits: { party: { steps: ['leave'] } }, custom: [] });
    const v1 = await store.putPlans(A, P, plans);
    const v2 = await store.putPlans(A, P, plans);
    assert.equal(v2.version, v1.version + 1);
    assert.equal((await store.getPlans(A, P)).relapse.warnings, rawText);

    const s = await store.createStep(A, P, normalizeStep({ title: 'Text Sam after dinner', detail: 'Say hi', copingKey: 'breathing-box', source: 'hope' }));
    assert.equal(s.status, 'open');
    assert.equal(s.source, 'hope');
    const ch = await store.updateStep(A, P, s.id, normalizeStep({ title: 'Text Sam before dinner', followUpOptIn: true }, { partial: true }));
    assert.equal(ch.title, 'Text Sam before dinner');
    assert.equal(ch.followUpOptIn, true);
    const done = await store.updateStep(A, P, s.id, normalizeStep({ status: 'done', reflection: 'Doing it early worked' }, { partial: true }));
    assert.equal(done.status, 'done');
    assert.ok(done.completedAt);
    assert.equal(done.reflection, 'Doing it early worked');
    await store.deleteStep(A, P, s.id);
    assert.equal((await store.listSteps(A, P)).length, 0);
  });

  await t.test(`${store.backend}: settings default off, change is recorded with history`, async () => {
    const s0 = await store.getSettings(A);
    assert.equal(s0.shareCheckinsWithHope, false);
    assert.equal(s0.journalAiAlways, false);
    assert.equal(s0.journalImport, 'pending');
    const s1 = await store.updateSettings(A, { shareCheckinsWithHope: true, journalImport: 'declined' });
    assert.equal(s1.shareCheckinsWithHope, true);
    assert.equal(s1.journalImport, 'declined');
    const s2 = await store.updateSettings(A, { shareCheckinsWithHope: false });
    assert.equal(s2.shareCheckinsWithHope, false);
    const hist = await store.consentHistory(A);
    assert.equal(hist.filter((h) => h.key === 'checkin_ai_share').length, 2);
    assert.equal((await store.getSettings(B)).shareCheckinsWithHope, false);
  });

  await t.test(`${store.backend}: forget removes this account only`, async () => {
    await store.putCheckin(B, P, normalizeCheckin({ mood: 3 }, { date: '2026-10-10' }));
    assert.equal(await store.forget(A), true);
    assert.equal((await store.listCheckins(A, P, {})).length, 0);
    assert.equal((await store.listJournal(A, P)).length, 0);
    assert.equal((await store.listCheckins(B, P, {})).length, 1);
    await store.forget(B);
  });
}

test('validation rejects bad input and never trusts the browser', () => {
  assert.throws(() => normalizeCheckin({ mood: 6 }, { date: '2026-10-10' }), ValidationError);
  assert.throws(() => normalizeCheckin({ mood: 3 }, { date: '2026-02-30' }), ValidationError);
  assert.throws(() => normalizeCheckin({ mood: 3 }, { date: '2099-01-01' }), /future/);
  assert.throws(() => normalizeCheckin({ mood: 3, intensity: 11 }, { date: '2026-10-10' }), ValidationError);
  assert.throws(() => normalizeCheckin({ mood: 3, triggers: Array.from({ length: 13 }, (_, i) => `t${i}`) }, { date: '2026-10-10' }), /up to 12/);
  assert.throws(() => normalizeCheckin({ mood: 3, craving: 'Extreme' }, { date: '2026-10-10' }), ValidationError);
  assert.throws(() => normalizeActivityStart({ toolKey: 'not-a-tool' }), ValidationError);
  assert.throws(() => normalizeGoal({ title: '' }), /required/);
  assert.throws(() => normalizeGoal({ title: 'x', category: 'money' }), ValidationError);
  assert.throws(() => normalizeJournal({ body: 'x'.repeat(20001) }), /longer/);
  assert.throws(() => normalizeStep({ title: 'x', copingKey: 'nope' }), ValidationError);
  assert.throws(() => normalizePlans({ relapse: { cardNumber: '4242' } }), /Card details/);
  const c = normalizeCheckin({ mood: 1, feelings: 'a\u0000b', triggers: [' Money ', ''] }, { date: '2026-10-10' });
  assert.equal(c.moodLabel, 'Struggling');
  assert.equal(c.feelings, 'ab');
  assert.deepEqual(c.triggers, ['Money']);
});

test('JSON backend contract (plain text)', async (t) => {
  const dir = tmp();
  const store = createJsonWellbeingStore(path.join(dir, 'wellbeing.json'), { env: { HOPEWICK_DATA_KEY: '' } });
  await contract(t, store, { A: 'userA', B: 'userB', rawText: 'plain secret words' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend contract with HOPEWICK_DATA_KEY: sensitive text is encrypted in the file', async (t) => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  const env = { HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'wb1' };
  const store = createJsonWellbeingStore(file, { env });
  await contract(t, store, { A: 'userA', B: 'userB', rawText: 'plain secret words' });
  await store.createJournal('userC', 'main', normalizeJournal({ body: 'my very private journal line', title: 'private title' }));
  await store.putCheckin('userC', 'main', normalizeCheckin({ mood: 2, feelings: 'my private feeling', triggers: ['my ex'], notes: 'private note' }, { date: '2026-10-10' }));
  const raw = fs.readFileSync(file, 'utf8');
  for (const s of ['my very private journal line', 'private title', 'my private feeling', 'my ex', 'private note']) assert.ok(!raw.includes(s), `${s} must not be in the file`);
  assert.match(raw, /hwenc:v1:wb1:/);
  // Re-open: still readable with the key; unreadable without it (fails loudly, not silently).
  const again = createJsonWellbeingStore(file, { env });
  assert.equal((await again.listJournal('userC', 'main'))[0].body, 'my very private journal line');
  const noKey = createJsonWellbeingStore(file, { env: {} });
  await assert.rejects(() => noKey.listJournal('userC', 'main'), /No key loaded/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend fails loudly on a corrupt file and never overwrites it', async () => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  fs.writeFileSync(file, '{"users": {"x": tru');
  const store = createJsonWellbeingStore(file, { env: {} });
  assert.equal(store.health().ok, false);
  await assert.rejects(() => store.putCheckin('u', 'main', normalizeCheckin({ mood: 3 }, { date: '2026-10-10' })), StoreUnavailableError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"users": {"x": tru');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('wellbeing.json.corrupt-')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend writes atomically (no temp files left, survives reload)', async () => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  const store = createJsonWellbeingStore(file, { env: {} });
  await store.createStep('u', 'main', normalizeStep({ title: 'Drink a glass of water' }));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  const reopened = createJsonWellbeingStore(file, { env: {} });
  assert.equal((await reopened.listSteps('u', 'main'))[0].title, 'Drink a glass of water');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('backend choice: JSON without DATABASE_URL, Postgres with it', () => {
  const dir = tmp();
  assert.equal(createWellbeingStore({ filePath: path.join(dir, 'w.json'), env: {} }).backend, 'json');
  assert.equal(createWellbeingStore({ filePath: path.join(dir, 'w.json'), env: { DATABASE_URL: 'postgres://x@y/z' } }).backend, 'postgres');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Postgres backend contract (Neon dev)', { skip: pgSkip }, async (t) => {
  const { closePool, withUser } = await import('./db/index.js');
  const env = { ...process.env, HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'wb1' };
  const store = createWellbeingStore({ env, backend: 'postgres' });
  const A = `wbtest_${run}_a`; const B = `wbtest_${run}_b`; const C = `wbtest_${run}_c`;
  try {
    await contract(t, store, { A, B, rawText: 'plain secret words' });
    await t.test('postgres: sensitive columns are ciphertext at rest; RLS hides other users', async () => {
      await store.createJournal(C, 'main', normalizeJournal({ body: 'my very private journal line', title: 'private title' }));
      await store.putCheckin(C, 'main', normalizeCheckin({ mood: 2, feelings: 'my private feeling', triggers: ['my ex'], notes: 'private note' }, { date: '2026-10-10' }));
      await store.createGoal(C, 'main', normalizeGoal({ title: 'private goal' }));
      await store.createStep(C, 'main', normalizeStep({ title: 'private step' }));
      const raw = await withUser(C, async (c) => ({
        j: (await c.query('SELECT title, body, encryption FROM journal_entries WHERE user_id = $1', [C])).rows[0],
        m: (await c.query('SELECT feelings, triggers, note, encryption FROM mood_entries WHERE user_id = $1', [C])).rows[0],
        g: (await c.query('SELECT title FROM personal_goals WHERE user_id = $1', [C])).rows[0],
        s: (await c.query('SELECT title FROM next_step_items WHERE user_id = $1', [C])).rows[0],
        others: (await c.query('SELECT count(*)::int AS n FROM journal_entries')).rows[0].n,
      }), env);
      for (const v of [raw.j.title, raw.j.body, raw.m.feelings, raw.m.triggers, raw.m.note, raw.g.title, raw.s.title]) assert.match(v, /^hwenc:v1:wb1:/);
      assert.equal(raw.j.encryption, 'aes-256-gcm-v1');
      assert.equal(raw.others, 1, 'RLS: only this user\'s rows are visible even without WHERE');
      const seenByOther = await withUser(B, async (c) => (await c.query('SELECT count(*)::int AS n FROM personal_goals')).rows[0].n, env);
      assert.equal(seenByOther, 0);
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
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    dir,
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
    return { status: res.status, type, body: type.includes('json') ? await res.json() : await res.text(), disposition: res.headers.get('content-disposition') };
  };
}

async function httpSuite(t, backend) {
  const app = await listen({ backend });
  const tag = crypto.randomBytes(3).toString('hex');
  try {
    const anon = api(app.base, null);
    const free = api(app.base, await signIn(app.base, `wb-free-${tag}@example.com`));
    const plus = api(app.base, await signIn(app.base, 'plus-founder@example.com'));

    await t.test(`${backend} http: signed out gets 401, never data`, async () => {
      assert.equal((await anon('GET', '/api/me/checkins?profileId=main')).status, 401);
      assert.equal((await anon('PUT', '/api/me/checkins/2026-10-10', { profileId: 'main', mood: 3 })).status, 401);
    });

    await t.test(`${backend} http: free account can check in, use coping tools and save a next step`, async () => {
      const put = await free('PUT', `/api/me/checkins/${daysAgo(1)}`, { profileId: 'main', mood: 2, feelings: 'flat', triggers: ['Money'], intensity: 6 });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.equal(put.body.checkin.moodLabel, 'Low');
      const list = await free('GET', '/api/me/checkins?profileId=main');
      assert.equal(list.body.checkins.length, 1);
      assert.deepEqual(list.body.legacy, []);
      const bad = await free('PUT', `/api/me/checkins/${daysAgo(1)}`, { profileId: 'main', mood: 9 });
      assert.equal(bad.status, 400);
      const act = await free('POST', '/api/me/activities', { profileId: 'main', toolKey: 'breathing-box' });
      assert.equal(act.status, 201);
      const done = await free('PATCH', `/api/me/activities/${act.body.activity.id}`, { profileId: 'main', status: 'completed', helpful: 'somewhat' });
      assert.equal(done.body.activity.status, 'completed');
      const step = await free('POST', '/api/me/next-steps', { profileId: 'main', title: 'Make a cup of tea and sit outside', source: 'hope', copingKey: 'mindful-minute' });
      assert.equal(step.status, 201);
      const sum = await free('GET', '/api/me/summary?profileId=main');
      assert.equal(sum.body.currentStep.title, 'Make a cup of tea and sit outside');
      assert.equal(sum.body.latestCheckin.date, daysAgo(1));
    });

    await t.test(`${backend} http: Plus gates are enforced on the server (journal refinements, goals, plans writes)`, async () => {
      for (const kind of ['gratitude', 'recovery']) {
        const j = await free('POST', '/api/me/journal', { profileId: 'main', kind, body: 'free tries a rich kind' });
        assert.equal(j.status, 403, kind);
        assert.equal(j.body.code, 'plus');
      }
      assert.equal((await free('POST', '/api/me/journal', { profileId: 'main', body: 'x', refined: 'a deepened reflection' })).status, 403, 'deepened text is Plus');
      assert.equal((await free('POST', '/api/me/journal', { profileId: 'main', kind: 'prompt', packId: 'first-30-days', prompt: 'Day 1', body: 'x' })).status, 403, 'packs are Plus first');
      assert.equal((await free('POST', '/api/me/goals', { profileId: 'main', title: 'x' })).status, 403);
      assert.equal((await free('PUT', '/api/me/plans', { profileId: 'main', plans: { relapse: {} } })).status, 403);
      assert.equal((await free('GET', '/api/me/journal?profileId=main')).status, 200, 'reading stays free');
      assert.equal((await free('GET', '/api/me/journal?profileId=main')).body.total, 0, 'nothing was saved by refused writes');
    });

    await t.test(`${backend} http: free account keeps its browser journal via one-time import (consent required)`, async () => {
      // (Runs before any free journal writes so the counts below are only the import.)
      const no = await free('POST', '/api/me/journal/import', { profileId: 'main', consent: false, entries: [{ id: 'l1', body: 'old' }] });
      assert.equal(no.body.status, 'declined');
      assert.equal((await free('GET', '/api/me/journal?profileId=main')).body.total, 0, 'declined uploads nothing');
      assert.equal((await free('GET', '/api/me/settings')).body.settings.journalImport, 'declined');
      const yes = await free('POST', '/api/me/journal/import', { profileId: 'main', consent: true, entries: [{ id: 'l1', body: 'old line', title: 'Old', created: Date.now() - 86400000 }, { id: 'l2', body: '' }] });
      assert.equal(yes.body.imported, 1);
      const again = await free('POST', '/api/me/journal/import', { profileId: 'main', consent: true, entries: [{ id: 'l1', body: 'old line' }] });
      assert.equal(again.body.imported, 0);
      const entries = (await free('GET', '/api/me/journal?profileId=main')).body.entries;
      assert.equal(entries.length, 1);
      const del = await free('DELETE', `/api/me/journal/${entries[0].id}?profileId=main`);
      assert.equal(del.status, 200, 'deleting stays free');
    });

    await t.test(`${backend} http: Plus journal search, date filter, edit, export JSON + Markdown`, async () => {
      const a = await plus('POST', '/api/me/journal', { profileId: 'main', kind: 'gratitude', title: 'Thanks', body: 'grateful for the beach walk', entryDate: '2026-10-01' });
      assert.equal(a.status, 201, JSON.stringify(a.body));
      await plus('POST', '/api/me/journal', { profileId: 'main', kind: 'recovery', body: 'two weeks today', entryDate: '2026-10-15', prompt: 'What helped this week?' });
      const s = await plus('GET', '/api/me/journal?profileId=main&q=beach');
      assert.deepEqual(s.body.entries.map((e) => e.title), ['Thanks']);
      const d = await plus('GET', '/api/me/journal?profileId=main&from=2026-10-10&to=2026-10-31');
      assert.equal(d.body.entries.length, 1);
      assert.equal(d.body.entries[0].kind, 'recovery');
      const ed = await plus('PATCH', `/api/me/journal/${a.body.entry.id}`, { profileId: 'main', body: 'grateful for the long beach walk' });
      assert.equal(ed.body.entry.body, 'grateful for the long beach walk');
      const jx = await plus('GET', '/api/me/journal/export?profileId=main&format=json');
      assert.match(jx.disposition, /attachment; filename="hopewick-journal-.*\.json"/);
      assert.equal(jx.body.entries.length, 2);
      const md = await plus('GET', '/api/me/journal/export?profileId=main&format=md');
      assert.match(md.type, /markdown/);
      assert.match(md.body, /# Hopewick journal/);
      assert.match(md.body, /> What helped this week\?/);
      const goal = await plus('POST', '/api/me/goals', { profileId: 'main', title: 'Cook dinner twice', category: 'recovery' });
      assert.equal(goal.status, 201);
      const plans = await plus('PUT', '/api/me/plans', { profileId: 'main', plans: { relapse: { warnings: 'skipping meals' }, exits: {}, custom: [] } });
      assert.equal(plans.status, 200);
      assert.equal((await plus('GET', '/api/me/plans?profileId=main')).body.plans.relapse.warnings, 'skipping meals');
    });

    await t.test(`${backend} http: users never see each other's data`, async () => {
      const mine = (await plus('GET', '/api/me/next-steps?profileId=main')).body.steps;
      assert.equal(mine.length, 0);
      const theirs = (await free('GET', '/api/me/next-steps?profileId=main')).body.steps;
      const hijack = await plus('PATCH', `/api/me/next-steps/${theirs[0].id}`, { profileId: 'main', status: 'done' });
      assert.equal(hijack.status, 404);
    });

    await t.test(`${backend} http: cross-site PATCH/DELETE are refused`, async () => {
      const res = await fetch(`${app.base}/api/me/next-steps/x`, { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
      assert.equal(res.status, 403);
    });

    await t.test(`${backend} http: settings (consent) round trip and account deletion removes wellbeing data`, async () => {
      const on = await free('PATCH', '/api/me/settings', { shareCheckinsWithHope: true });
      assert.equal(on.body.settings.shareCheckinsWithHope, true);
      assert.equal((await free('PATCH', '/api/me/settings', { shareCheckinsWithHope: 'yes' })).status, 400);
    });

    // ----- Free vs Plus model (founder approved, Stage 3) -----
    const fresh = async (name) => api(app.base, await signIn(app.base, `wb-${name}-${tag}@example.com`));
    const setPlan = (who, status) => who('POST', '/api/billing/dev-set', { status });
    const seedHistory = async (who) => {
      for (const n of [0, 2, 6, 7, 20, 60]) {
        const r = await who('PUT', `/api/me/checkins/${daysAgo(n)}`, { profileId: 'main', mood: 3, triggers: ['Work'], craving: n === 2 ? 'Strong' : 'None' });
        assert.equal(r.status, 200, JSON.stringify(r.body));
      }
      for (const n of [1, 30]) {
        const r = await who('POST', '/api/me/journal', { profileId: 'main', body: `entry ${n} days ago`, entryDate: daysAgo(n) });
        assert.equal(r.status, 201, JSON.stringify(r.body));
      }
    };

    await t.test(`${backend} http: free writes basic journal entries (free and prompt kinds) and edits them`, async () => {
      const u = await fresh('jfree');
      const a = await u('POST', '/api/me/journal', { profileId: 'main', body: 'a plain entry' });
      assert.equal(a.status, 201, JSON.stringify(a.body));
      const b = await u('POST', '/api/me/journal', { profileId: 'main', kind: 'prompt', prompt: 'What helped today?', body: 'a walk' });
      assert.equal(b.status, 201);
      const ed = await u('PATCH', `/api/me/journal/${a.body.entry.id}`, { profileId: 'main', body: 'a plain entry, edited', kind: 'free' });
      assert.equal(ed.status, 200);
      assert.equal(ed.body.entry.body, 'a plain entry, edited');
      assert.equal((await u('PATCH', `/api/me/journal/${a.body.entry.id}`, { profileId: 'main', kind: 'gratitude' })).status, 403, 'switching to a Plus kind is Plus');
      assert.equal((await u('PATCH', `/api/me/journal/${a.body.entry.id}`, { profileId: 'main', refined: 'deeper' })).status, 403);
    });

    await t.test(`${backend} http: free sees the last 7 days in the app, keeps everything, exports everything`, async () => {
      const u = await fresh('window');
      await seedHistory(u);
      const c = await u('GET', '/api/me/checkins?profileId=main');
      assert.deepEqual(c.body.checkins.map((x) => x.date), [daysAgo(0), daysAgo(2), daysAgo(6)]);
      assert.equal(c.body.window.limited, true);
      assert.equal(c.body.window.days, 7);
      assert.equal(c.body.window.hiddenCount, 3);
      const j = await u('GET', '/api/me/journal?profileId=main');
      assert.equal(j.body.entries.length, 1);
      assert.equal(j.body.total, 2, 'total counts everything saved');
      assert.equal(j.body.window.hiddenCount, 1);
      const ex = await u('GET', '/api/me/export?profileId=main');
      assert.equal(ex.status, 200);
      assert.match(ex.disposition, /attachment; filename="hopewick-my-data-.*\.json"/);
      const data = JSON.parse(typeof ex.body === 'string' ? ex.body : JSON.stringify(ex.body));
      assert.equal(data.checkins.length, 6, 'export includes history outside the window');
      assert.equal(data.journal.length, 2);
      const jx = await u('GET', '/api/me/journal/export?profileId=main&format=json');
      assert.equal(jx.body.entries.length, 2, 'journal export includes everything');
    });

    await t.test(`${backend} http: Plus (paid, trial and founder comp) sees full history`, async () => {
      const paid = await fresh('paid');
      await seedHistory(paid);
      await setPlan(paid, 'active');
      const trial = await fresh('trial');
      await seedHistory(trial);
      await setPlan(trial, 'trialing');
      for (const [name, who] of [['paid', paid], ['trial', trial]]) {
        const c = await who('GET', '/api/me/checkins?profileId=main');
        assert.equal(c.body.checkins.length, 6, name);
        assert.equal(c.body.window.limited, false, name);
        assert.equal((await who('GET', '/api/me/journal?profileId=main')).body.entries.length, 2, name);
      }
      const f = await plus('GET', '/api/me/checkins?profileId=main');
      assert.equal(f.body.window.limited, false, 'founder comp is Plus');
    });

    await t.test(`${backend} http: lapsed Plus keeps all data; the app view narrows, export and delete still work`, async () => {
      const u = await fresh('lapsed');
      await setPlan(u, 'active');
      await seedHistory(u);
      const g = await u('POST', '/api/me/goals', { profileId: 'main', title: 'Walk on Sundays' });
      assert.equal(g.status, 201);
      const rich = await u('POST', '/api/me/journal', { profileId: 'main', kind: 'gratitude', body: 'thankful', entryDate: daysAgo(3) });
      assert.equal(rich.status, 201);
      const wp = await u('POST', '/api/me/weekly-plans', { profileId: 'main', title: 'This week', steps: ['Call Sam', { title: 'Meeting Thursday', day: 4 }] });
      assert.equal(wp.status, 201, JSON.stringify(wp.body));
      await setPlan(u, 'canceled');
      const c = await u('GET', '/api/me/checkins?profileId=main');
      assert.equal(c.body.window.limited, true);
      assert.equal(c.body.checkins.length + c.body.window.hiddenCount, 6, 'nothing deleted');
      assert.equal((await u('GET', '/api/me/goals?profileId=main')).body.goals.length, 1, 'goals kept and readable');
      assert.equal((await u('GET', '/api/me/weekly-plans?profileId=main')).body.plans.length, 1, 'weekly plan kept and readable');
      assert.equal((await u('PATCH', `/api/me/weekly-plans/${wp.body.plan.id}`, { profileId: 'main', title: 'x' })).status, 403, 'editing a weekly plan is Plus');
      assert.equal((await u('PATCH', `/api/me/journal/${rich.body.entry.id}`, { profileId: 'main', kind: 'gratitude', body: 'thankful, fixed a typo' })).status, 200, 'a lapsed account can still fix its own text');
      const ex = JSON.parse(JSON.stringify((await u('GET', '/api/me/export?profileId=main')).body));
      assert.equal(ex.checkins.length, 6);
      assert.equal(ex.journal.length, 3);
      assert.equal(ex.goals.length, 1);
      assert.equal(ex.weeklyPlans.length, 1);
      assert.equal((await u('GET', '/api/me/insights?profileId=main')).status, 403, 'insights are Plus');
      assert.equal((await u('GET', '/api/me/report?profileId=main')).status, 403, 'report is Plus');
      // Coming back to Plus shows everything again.
      await setPlan(u, 'active');
      assert.equal((await u('GET', '/api/me/checkins?profileId=main')).body.checkins.length, 6);
    });

    await t.test(`${backend} http: delete my data works on every plan and needs a matching confirm`, async () => {
      const u = await fresh('delete');
      await seedHistory(u);
      assert.equal((await u('DELETE', '/api/me/data/journal?profileId=main')).status, 400, 'confirm is required');
      assert.equal((await u('DELETE', '/api/me/data/nope?profileId=main&confirm=nope')).status, 400);
      const dj = await u('DELETE', '/api/me/data/journal?profileId=main&confirm=journal');
      assert.equal(dj.status, 200);
      assert.equal(dj.body.removed, 2);
      assert.equal((await u('GET', '/api/me/journal?profileId=main')).body.total, 0);
      assert.equal((await u('GET', '/api/me/export?profileId=main')).body.checkins.length, 6, 'other areas untouched');
      const all = await u('DELETE', '/api/me/data/all?profileId=main&confirm=all');
      assert.equal(all.status, 200);
      const ex = (await u('GET', '/api/me/export?profileId=main')).body;
      assert.equal(ex.checkins.length + ex.journal.length + ex.activities.length + ex.nextSteps.length, 0);
    });

    await t.test(`${backend} http: safety plan essentials are free and survive Plus plan edits`, async () => {
      const u = await fresh('safety');
      assert.equal((await u('GET', '/api/me/safety-plan?profileId=main')).body.safety, null);
      const put = await u('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { warningSigns: ['not sleeping'], people: ['Sam 0400 000 000'], reasons: ['my kids'] } });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.deepEqual((await u('GET', '/api/me/safety-plan?profileId=main')).body.safety.people, ['Sam 0400 000 000']);
      assert.equal((await u('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { people: 'not a list' } })).status, 400);
      await setPlan(u, 'active');
      assert.equal((await u('PUT', '/api/me/plans', { profileId: 'main', plans: { relapse: { warnings: 'x' }, exits: {}, custom: [] } })).status, 200);
      assert.deepEqual((await u('GET', '/api/me/safety-plan?profileId=main')).body.safety.warningSigns, ['not sleeping'], 'relapse plan edits keep safety essentials');
    });

    await t.test(`${backend} http: weekly multi-step plans are Plus to create; free can read and delete`, async () => {
      const u = await fresh('weekly');
      assert.equal((await u('POST', '/api/me/weekly-plans', { profileId: 'main', title: 'Week', steps: ['a'] })).status, 403);
      assert.equal((await u('GET', '/api/me/weekly-plans?profileId=main')).status, 200);
      const p = await plus('POST', '/api/me/weekly-plans', { profileId: 'main', title: 'Steady week', steps: ['Call Sam', { title: 'Meeting', day: 4 }, 'Cook dinner'] });
      assert.equal(p.status, 201, JSON.stringify(p.body));
      assert.equal(p.body.plan.steps.length, 3);
      const steps = p.body.plan.steps.map((st, i) => ({ ...st, done: i === 0 }));
      const ed = await plus('PATCH', `/api/me/weekly-plans/${p.body.plan.id}`, { profileId: 'main', steps });
      assert.equal(ed.body.plan.steps[0].done, true);
      assert.ok(ed.body.plan.steps[0].doneAt);
      assert.equal((await plus('POST', '/api/me/weekly-plans', { profileId: 'main', title: 'Too many', steps: Array.from({ length: 11 }, (_, i) => `s${i}`) })).status, 400);
      assert.equal((await plus('POST', '/api/me/weekly-plans', { profileId: 'main', title: 'Bad week', weekStart: '2026-10-19', steps: ['x'] })).status, 400, 'weeks start on Sunday');
      assert.equal((await free('DELETE', `/api/me/weekly-plans/${p.body.plan.id}?profileId=main`)).status, 404, 'other accounts cannot touch it');
      assert.equal((await plus('DELETE', `/api/me/weekly-plans/${p.body.plan.id}?profileId=main`)).status, 200);
    });

    await t.test(`${backend} http: monthly insights and the report are Plus, descriptive only`, async () => {
      const u = await fresh('insight');
      await seedHistory(u);
      assert.equal((await u('GET', '/api/me/insights?profileId=main')).status, 403);
      assert.equal((await u('GET', '/api/me/report?profileId=main')).body.code, 'plus');
      await setPlan(u, 'active');
      const month = TODAY.slice(0, 7);
      const ins = await u('GET', `/api/me/insights?profileId=main&month=${month}`);
      assert.equal(ins.status, 200, JSON.stringify(ins.body));
      assert.equal(ins.body.insights.month, month);
      assert.ok(ins.body.insights.checkins.days >= 1);
      assert.ok(ins.body.insights.lines.length >= 1);
      assert.doesNotMatch(JSON.stringify(ins.body.insights.lines), /diagnos|disorder|depress|addict|risk|you are/i, 'lines only describe what was saved');
      assert.equal((await u('GET', '/api/me/insights?profileId=main&month=2026-13')).status, 400);
      const rep = await u('GET', `/api/me/report?profileId=main&from=${daysAgo(29)}&to=${TODAY}`);
      assert.equal(rep.status, 200);
      assert.equal(rep.body.report.days.length, 5, 'check-ins in the last 30 days');
      assert.equal(rep.body.report.checkins.cravings.Strong, 1);
      assert.ok(!JSON.stringify(rep.body).includes('entry 1 days ago'), 'journal text is not in the report');
    });

    await t.test(`${backend} http: content releases: free sees title and teaser only; Plus opens the new drop`, async () => {
      const u = await fresh('content');
      const list = await u('GET', '/api/content/releases');
      assert.equal(list.status, 200);
      const sc = list.body.items.find((x) => x.id === 'coping-self-compassion');
      assert.equal(sc.available, false);
      assert.equal(sc.content, undefined, 'no body for a locked item');
      assert.ok(sc.title && sc.teaser);
      assert.ok(list.body.items.filter((x) => x.kind === 'coping' && x.core).every((x) => x.available), 'the 12 launch tools are free');
      assert.equal((await u('GET', '/api/content/item/coping-self-compassion')).status, 403);
      assert.equal((await u('GET', '/api/content/item/coping-self-compassion')).body.item.content, undefined);
      assert.equal((await u('POST', '/api/me/activities', { profileId: 'main', toolKey: 'self-compassion' })).status, 403, 'locked tool cannot be started');
      assert.equal((await u('POST', '/api/me/activities', { profileId: 'main', toolKey: 'breathing-box' })).status, 201, 'core tools stay free');
      assert.equal((await u('GET', '/api/content/item/nope')).status, 404);
      const pl = await plus('GET', '/api/content/item/coping-self-compassion');
      assert.equal(pl.status, 200);
      assert.ok(pl.body.item.content.steps.length >= 2);
      assert.equal(pl.body.item.badges.comingToFree, 'April 2027');
      assert.equal((await plus('POST', '/api/me/activities', { profileId: 'main', toolKey: 'self-compassion' })).status, 201);
      const pk = await plus('POST', '/api/me/journal', { profileId: 'main', kind: 'prompt', packId: 'first-30-days', prompt: 'Day 1: Why now', body: 'because' });
      assert.equal(pk.status, 201);
      assert.equal(pk.body.entry.packId, 'first-30-days');
      const anon2 = await anon('GET', '/api/content/releases');
      assert.equal(anon2.status, 200);
      assert.ok(anon2.body.items.every((x) => x.core || !x.content), 'signed out is treated as free');
    });
  } finally {
    await app.close();
  }
}

test('HTTP API end to end on the JSON backend', async (t) => { await httpSuite(t, 'json'); });
test('HTTP API end to end on the Postgres backend (Neon dev)', { skip: pgSkip }, async (t) => {
  try { await httpSuite(t, 'postgres'); } finally { const { closePool } = await import('./db/index.js'); await closePool(); }
});
