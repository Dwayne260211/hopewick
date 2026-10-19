/**
 * Move & Recover (FEATURE_FITNESS_PROTOCOLS): rules, store parity and the HTTP API.
 *
 * Runs against the JSON fallback always, and against Postgres when DATABASE_URL
 * is set (env or the untracked local .env; Neon 'dev' branch only, throwaway users fittest_*).
 * Run: node --test --test-concurrency=1 server/fitness.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadLocalEnv } from './db/migrate.js';
import { createFitnessStore, createJsonFitnessStore } from './fitness/store.js';
import { fitnessFlagMode, fitnessEnabledFor } from './fitness/flag.js';
import { evaluateScreen, evaluateCheck, mergeScreen, areaStatus, applyClearance, screenQuestions } from './fitness/screen.js';
import { FITNESS_RULES } from './fitness/rules.js';
import { openUnlocks, isOpen, EXERCISES, WORKOUTS, TRACK_SWAPS, WARMUP, COOLDOWN } from './fitness/content.js';

loadLocalEnv();
const PG_URL = String(process.env.DATABASE_URL || '').trim();
const pgSkip = PG_URL ? false : 'DATABASE_URL not set; Postgres backend tests skipped';
const run = crypto.randomBytes(4).toString('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-fit-'));
const KEY = crypto.randomBytes(32).toString('base64');

const qs = screenQuestions();
const allNo = (list) => Object.fromEntries(list.map((q) => [q.id, false]));
const MOVE_OK = allNo(qs.move);
const HC_OK = { ...allNo(qs.heatCold), B17: true };
const CHECK_OK = { usedSubstances: false, unwell: false, hadWaterFood: true, supportPerson: true, waterTempC: 14 };

/* ---------------- pure rules ---------------- */

test('flag: off by default; on / founder modes; founder mode never includes the Play reviewer', () => {
  assert.equal(fitnessFlagMode({}), 'off');
  assert.equal(fitnessFlagMode({ FEATURE_FITNESS_PROTOCOLS: '0' }), 'off');
  assert.equal(fitnessFlagMode({ FEATURE_FITNESS_PROTOCOLS: 'nonsense' }), 'off');
  for (const v of ['1', 'on', 'TRUE', 'yes']) assert.equal(fitnessFlagMode({ FEATURE_FITNESS_PROTOCOLS: v }), 'on');
  assert.equal(fitnessFlagMode({ FEATURE_FITNESS_PROTOCOLS: 'founder' }), 'founder');
  assert.equal(fitnessEnabledFor(null, {}), false);
  assert.equal(fitnessEnabledFor({ email: 'a@b.c' }, { FEATURE_FITNESS_PROTOCOLS: 'on' }), true);
});

test('content: every workout, swap, warm-up and cool-down move exists, with steps and cues', () => {
  const refs = [...WORKOUTS.flatMap((w) => w.main.flatMap((m) => [m.id, m.alt].filter(Boolean))), ...WARMUP.items.map((i) => i.id), ...COOLDOWN.items.map((i) => i.id), ...Object.values(TRACK_SWAPS).flatMap((s) => Object.values(s))];
  for (const id of refs) assert.ok(EXERCISES[id], `missing exercise ${id}`);
  for (const [id, e] of Object.entries(EXERCISES)) { assert.ok(e.steps.length >= 2, `${id} steps`); assert.ok(e.cues.length >= 1, `${id} cues`); }
});

test('screen: all clear is green; chest pain is red for movement; stable heart is amber (D5)', () => {
  const g = evaluateScreen('move', MOVE_OK);
  assert.equal(g.areas.move.outcome, 'green');
  assert.equal(evaluateScreen('move', { ...MOVE_OK, A2: true }).areas.move.outcome, 'red');
  const h = evaluateScreen('heat-cold', { ...HC_OK, B2: true }, { agree: true });
  for (const a of ['sauna', 'cold', 'contrast']) assert.equal(h.areas[a].outcome, 'amber');
  const strict = evaluateScreen('heat-cold', { ...HC_OK, B2: true }, { agree: true, rules: { ...FITNESS_RULES, stableHeartOutcome: 'red' } });
  assert.equal(strict.areas.sauna.outcome, 'red', 'the default is one switch in rules.js');
});

test('screen: withdrawal locks heat and cold (D2) with a 14-day re-check; no support person locks cold only', () => {
  const w = evaluateScreen('heat-cold', { ...HC_OK, B12: true }, { agree: true });
  for (const a of ['sauna', 'cold', 'contrast']) { assert.equal(w.areas[a].outcome, 'red'); assert.ok(w.areas[a].recheckAfter); }
  const days = (Date.parse(w.areas.sauna.recheckAfter) - Date.now()) / 86400000;
  assert.ok(days > 13.9 && days < 14.1);
  const both = evaluateScreen('heat-cold', { ...HC_OK, B12: true, B1: true }, { agree: true });
  assert.equal(both.areas.sauna.recheckAfter, null, 'a permanent red is not made temporary');
  const solo = evaluateScreen('heat-cold', { ...HC_OK, B17: false }, { agree: true });
  assert.equal(solo.areas.sauna.outcome, 'green');
  assert.equal(solo.areas.cold.outcome, 'red');
  assert.equal(solo.areas.contrast.outcome, 'red');
  assert.throws(() => evaluateScreen('heat-cold', HC_OK, {}), /agree/);
  assert.throws(() => evaluateScreen('move', { A1: false }), /every question/);
});

test('screen: red never clears with a tick; amber does; result keeps no answers', () => {
  const s = mergeScreen(null, 'heat-cold', evaluateScreen('heat-cold', { ...HC_OK, B3: true }, { agree: true }));
  assert.equal(areaStatus(s, 'sauna').status, 'needs-clearance');
  assert.equal(areaStatus(s, 'cold').status, 'red');
  assert.throws(() => applyClearance(s, ['cold']), /cannot be unlocked/);
  const { screen } = applyClearance(s, ['sauna']);
  assert.equal(areaStatus(screen, 'sauna').status, 'ok');
  const text = JSON.stringify(screen);
  assert.ok(!/B3|B1|answers|methadone/i.test(text), 'only outcomes and dates are kept');
});

test('pre-session check: substances lock for 24 h (D1); cold floor 10 °C (D3); support person; struggling day is a warning (D4)', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const used = evaluateCheck('sauna', { ...CHECK_OK, usedSubstances: true }, { now });
  assert.equal(used.ok, false);
  assert.equal(used.setLockUntil, '2026-10-19T00:00:00.000Z');
  const later = evaluateCheck('sauna', CHECK_OK, { now: new Date('2026-10-18T23:00:00Z'), lockUntil: used.setLockUntil });
  assert.deepEqual(later.blocks.map((b) => b.code), ['lock'], 'still paused 23 h later, even answering no');
  assert.equal(evaluateCheck('sauna', CHECK_OK, { now: new Date('2026-10-19T00:00:01Z'), lockUntil: used.setLockUntil }).ok, true, 'open again after 24 h');
  assert.deepEqual(evaluateCheck('cold', { ...CHECK_OK, waterTempC: 9.5 }).blocks.map((b) => b.code), ['too-cold']);
  assert.equal(evaluateCheck('cold', { ...CHECK_OK, waterTempC: 10 }).ok, true);
  assert.deepEqual(evaluateCheck('cold', { ...CHECK_OK, waterTempC: null }).blocks.map((b) => b.code), ['temp-unknown']);
  assert.deepEqual(evaluateCheck('contrast', { ...CHECK_OK, supportPerson: false }).blocks.map((b) => b.code), ['support']);
  assert.equal(evaluateCheck('cold', { ...CHECK_OK, supportPerson: false, waterTempC: null }, { stage: 'cold-shower' }).ok, true, 'a cold shower finish is fine alone');
  const low = evaluateCheck('sauna', CHECK_OK, { todayCheckin: { mood: 1, craving: 'None' } });
  assert.equal(low.ok, true);
  assert.deepEqual(low.warnings.map((w) => w.code), ['not-suggested-today']);
  assert.deepEqual(evaluateCheck('sauna', CHECK_OK, { todayCheckin: { mood: 4, craving: 'Strong' } }).warnings.map((w) => w.code), ['not-suggested-today']);
  const gap = evaluateCheck('cold', CHECK_OK, { now, lastStrengthAt: '2026-10-17T22:00:00Z' });
  assert.deepEqual(gap.warnings.map((w) => w.code), ['strength-gap']);
});

test('weekly drops: unset start opens everything; week 1 opens the program only', () => {
  assert.equal(openUnlocks({}, '2026-10-18'), null);
  const w1 = openUnlocks({ FITNESS_PLUS_START: '2026-10-18' }, '2026-10-18');
  assert.ok(isOpen(w1, 'program') && isOpen(w1, 'workout:strength-a') && isOpen(w1, 'level:beginner'));
  assert.ok(!isOpen(w1, 'workout:mobility') && !isOpen(w1, 'protocol:sauna') && !isOpen(w1, 'screen:heat-cold') && !isOpen(w1, 'level:advanced'));
  const w8 = openUnlocks({ FITNESS_PLUS_START: '2026-08-01' }, '2026-10-18');
  assert.ok(isOpen(w8, 'protocol:contrast'));
});

/* ---------------- store contract (both backends) ---------------- */

async function contract(t, store, { A, B }) {
  const P = 'main';
  await t.test(`${store.backend}: profile defaults, screen, lock and prefs round trip; other users see nothing`, async () => {
    const empty = await store.getProfile(A, P);
    assert.deepEqual(empty, { screen: null, lockUntil: null, prefs: { level: 'beginner', track: 'standard' } });
    const screen = mergeScreen(null, 'move', evaluateScreen('move', MOVE_OK));
    await store.saveScreen(A, P, screen);
    await store.setLock(A, P, '2026-10-19T00:00:00.000Z');
    await store.savePrefs(A, P, { level: 'intermediate', track: 'knee' });
    const got = await store.getProfile(A, P);
    assert.deepEqual(got.screen, screen);
    assert.equal(got.lockUntil, '2026-10-19T00:00:00.000Z');
    assert.deepEqual(got.prefs, { level: 'intermediate', track: 'knee' });
    assert.equal((await store.getProfile(B, P)).screen, null);
    await store.setLock(A, P, null);
    assert.equal((await store.getProfile(A, P)).lockUntil, null);
  });
  await t.test(`${store.backend}: sessions start, complete with moods, cannot finish twice, list, clear, forget`, async () => {
    const s = await store.createSession(A, P, { kind: 'workout', planKey: 'strength-a', detail: { moodBefore: 2 } });
    assert.equal(s.status, 'started');
    assert.equal(s.detail.moodBefore, 2);
    const done = await store.updateSession(A, P, s.id, { status: 'completed', durationSeconds: 1800, detail: { moodAfter: 4 } });
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt);
    assert.deepEqual(done.detail, { moodBefore: 2, moodAfter: 4 });
    await assert.rejects(() => store.updateSession(A, P, s.id, { status: 'stopped' }), /already finished/);
    await assert.rejects(() => store.updateSession(B, P, s.id, { status: 'stopped' }), /not found/i);
    await store.createSession(A, P, { kind: 'sauna', planKey: 'sauna-start', detail: {} });
    const list = await store.listSessions(A, P);
    assert.deepEqual(list.map((x) => x.kind), ['sauna', 'workout']);
    assert.equal((await store.listSessions(B, P)).length, 0);
    await store.createSession(A, 'second', { kind: 'workout', planKey: 'mobility', detail: {} });
    assert.ok((await store.clear(A, P)) >= 2);
    assert.equal((await store.listSessions(A, P)).length, 0);
    assert.equal((await store.getProfile(A, P)).screen, null);
    assert.equal((await store.listSessions(A, 'second')).length, 1, 'other profile untouched');
    await store.forget(A);
    assert.equal((await store.listSessions(A, 'second')).length, 0);
  });
}

test('JSON backend contract, encrypted at rest (no answers, no plain lock time)', async (t) => {
  const dir = tmp();
  const file = path.join(dir, 'fitness.json');
  const env = { HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'fit1' };
  const store = createJsonFitnessStore(file, { env });
  await contract(t, store, { A: 'ua', B: 'ub' });
  await store.saveScreen('uc', 'main', mergeScreen(null, 'heat-cold', evaluateScreen('heat-cold', { ...HC_OK, B12: true }, { agree: true })));
  await store.setLock('uc', 'main', '2027-03-01T00:00:00.000Z');
  await store.createSession('uc', 'main', { kind: 'workout', planKey: 'strength-a', detail: { moodBefore: 1 } });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!/red|amber|green|2027-03-01|moodBefore|withdraw/i.test(raw), 'sensitive values are ciphertext');
  assert.match(raw, /hwenc:v1:fit1:/);
  const reopened = createJsonFitnessStore(file, { env });
  assert.equal((await reopened.getProfile('uc', 'main')).screen.areas.sauna.outcome, 'red');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('JSON backend fails loudly on a corrupt file and never overwrites it', async () => {
  const dir = tmp();
  const file = path.join(dir, 'fitness.json');
  fs.writeFileSync(file, '{not json');
  const store = createJsonFitnessStore(file, { env: {} });
  assert.equal(store.health().ok, false);
  await assert.rejects(() => store.savePrefs('u', 'main', { level: 'beginner', track: 'standard' }), /unavailable|could not/i);
  assert.equal(fs.readFileSync(file, 'utf8'), '{not json');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('backend choice: JSON without DATABASE_URL, Postgres with it', () => {
  const dir = tmp();
  assert.equal(createFitnessStore({ filePath: path.join(dir, 'f.json'), env: {} }).backend, 'json');
  assert.equal(createFitnessStore({ filePath: path.join(dir, 'f.json'), env: { DATABASE_URL: 'postgres://x@y/z' } }).backend, 'postgres');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Postgres backend contract (Neon dev): ciphertext at rest, RLS', { skip: pgSkip }, async (t) => {
  const { closePool, withUser } = await import('./db/index.js');
  const env = { ...process.env, HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 'fit1' };
  const store = createFitnessStore({ env, backend: 'postgres' });
  const A = `fittest_${run}_a`; const B = `fittest_${run}_b`; const C = `fittest_${run}_c`;
  try {
    await contract(t, store, { A, B });
    await t.test('postgres: screen, lock and detail are ciphertext; RLS hides other users', async () => {
      await store.saveScreen(C, 'main', mergeScreen(null, 'move', evaluateScreen('move', MOVE_OK)));
      await store.setLock(C, 'main', '2026-10-19T00:00:00.000Z');
      await store.createSession(C, 'main', { kind: 'cold', planKey: 'cold-step', detail: { moodBefore: 3, waterTempC: 14 } });
      const raw = await withUser(C, async (c) => ({
        p: (await c.query('SELECT screen, lock_until, prefs, encryption FROM fitness_profiles WHERE user_id = $1', [C])).rows[0],
        s: (await c.query('SELECT detail, encryption FROM fitness_sessions WHERE user_id = $1', [C])).rows[0],
        others: (await c.query('SELECT count(*)::int AS n FROM fitness_sessions')).rows[0].n,
      }), env);
      assert.match(raw.p.screen, /^hwenc:v1:fit1:/);
      assert.match(raw.p.lock_until, /^hwenc:v1:fit1:/);
      assert.match(raw.s.detail, /^hwenc:v1:fit1:/);
      assert.equal(raw.p.encryption, 'aes-256-gcm-v1');
      assert.equal(raw.others, 1, 'RLS: only this user\'s rows even without WHERE');
      const seen = await withUser(B, async (c) => (await c.query('SELECT count(*)::int AS n FROM fitness_profiles')).rows[0].n, env);
      assert.equal(seen, 0);
    });
  } finally {
    for (const u of [A, B, C]) { try { await store.forget(u); } catch { /* gone */ } }
    await closePool();
  }
});

/* ---------------- HTTP API, end to end ---------------- */

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'OPENAI_API_KEY', 'FOUNDER_PLUS_EMAILS', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'HOPEWICK_DATA_KEY', 'DATABASE_URL', 'FEATURE_FITNESS_PROTOCOLS', 'FITNESS_PLUS_START'];

async function listen({ backend }) {
  const dir = tmp();
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test', FOUNDER_PLUS_EMAILS: 'plus-founder@example.com', HOPEWICK_DATA_KEY: KEY });
  if (backend === 'postgres') process.env.DATABASE_URL = PG_URL;
  const { startServer } = await import('./index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`, dir,
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
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}
const setFlag = (v) => { if (v == null) delete process.env.FEATURE_FITNESS_PROTOCOLS; else process.env.FEATURE_FITNESS_PROTOCOLS = v; };

async function httpSuite(t, backend) {
  const app = await listen({ backend });
  const tag = crypto.randomBytes(3).toString('hex');
  const ROUTES = [['GET', '/api/fitness/status'], ['GET', '/api/fitness/safety'], ['GET', '/api/fitness/program'], ['GET', '/api/fitness/protocols'], ['GET', '/api/fitness/screen/questions'], ['POST', '/api/fitness/screen'], ['POST', '/api/fitness/check'], ['POST', '/api/fitness/sessions'], ['GET', '/api/fitness/summary']];
  const users = [];
  try {
    const anon = api(app.base, null);
    const free = api(app.base, await signIn(app.base, `fit-free-${tag}@example.com`));
    const trialCookie = await signIn(app.base, `fit-trial-${tag}@example.com`);
    const trial = api(app.base, trialCookie);
    const founder = api(app.base, await signIn(app.base, 'plus-founder@example.com'));
    const paidCookie = await signIn(app.base, `fit-paid-${tag}@example.com`);
    const paid = api(app.base, paidCookie);
    users.push(free, trial, founder, paid);
    assert.equal((await trial('POST', '/api/billing/dev-set', { status: 'trialing' })).status, 200);
    assert.equal((await paid('POST', '/api/billing/dev-set', { status: 'active' })).status, 200);

    await t.test(`${backend} http: flag OFF (default) -> every fitness route is 404 for everyone, including Plus`, async () => {
      setFlag(null);
      for (const who of [anon, free, trial, founder]) {
        for (const [m, r] of ROUTES) {
          const res = await who(m, r, m === 'GET' ? undefined : { profileId: 'main' });
          assert.equal(res.status, 404, `${m} ${r}`);
          assert.deepEqual(res.body, { error: 'Not found.' });
        }
      }
      setFlag('0');
      assert.equal((await founder('GET', '/api/fitness/status')).status, 404);
    });

    await t.test(`${backend} http: founder preview mode shows only founder accounts`, async () => {
      setFlag('founder');
      assert.equal((await founder('GET', '/api/fitness/status')).status, 200);
      assert.equal((await trial('GET', '/api/fitness/status')).status, 404);
      assert.equal((await anon('GET', '/api/fitness/safety')).status, 404);
      const s = await founder('GET', '/api/fitness/status');
      assert.equal(s.body.preview, true);
    });

    setFlag('1');

    await t.test(`${backend} http: flag ON -> safety is free (even signed out); free gets 403 for Plus parts`, async () => {
      const safe = await anon('GET', '/api/fitness/safety');
      assert.equal(safe.status, 200);
      assert.ok(safe.body.safety.rules.length >= 5);
      assert.equal(safe.body.rules.coldFloorC, 10);
      assert.equal((await free('GET', '/api/fitness/safety')).status, 200);
      assert.equal((await anon('GET', '/api/fitness/status')).status, 401);
      const st = await free('GET', '/api/fitness/status');
      assert.equal(st.status, 200);
      assert.equal(st.body.plus, false);
      assert.equal(st.body.screen, undefined, 'no Plus data for free');
      for (const [m, r] of [['GET', '/api/fitness/program'], ['GET', '/api/fitness/protocols'], ['GET', '/api/fitness/screen/questions'], ['POST', '/api/fitness/screen'], ['POST', '/api/fitness/check'], ['POST', '/api/fitness/sessions'], ['PUT', '/api/fitness/prefs'], ['POST', '/api/fitness/weekly-plan']]) {
        const res = await free(m, r, m === 'GET' ? undefined : { profileId: 'main' });
        assert.equal(res.status, 403, `${m} ${r}`);
        assert.equal(res.body.code, 'plus');
      }
      assert.equal((await free('DELETE', '/api/fitness/data?confirm=fitness')).status, 200, 'deleting stays free');
    });

    await t.test(`${backend} http: trial, paid and founder comp all count as Plus`, async () => {
      for (const who of [trial, paid, founder]) {
        const st = await who('GET', '/api/fitness/status');
        assert.equal(st.body.plus, true);
        assert.equal(st.body.screen.areas.move.status, 'unscreened');
        assert.equal((await who('GET', '/api/fitness/program')).status, 200);
      }
    });

    await t.test(`${backend} http: workouts need the movement screen; protocol content stays hidden until unlocked`, async () => {
      const blocked = await trial('POST', '/api/fitness/sessions', { kind: 'workout', planKey: 'strength-a' });
      assert.equal(blocked.status, 409);
      assert.equal(blocked.body.code, 'screen');
      const pr = await trial('GET', '/api/fitness/protocols');
      assert.ok(pr.body.protocols.every((p) => !p.unlocked && !p.protocol), 'no protocol steps before the screen');
      const qsRes = await trial('GET', '/api/fitness/screen/questions');
      assert.ok(qsRes.body.move.every((q) => !q.effects && !q.why), 'outcome logic stays on the server');
      const ok = await trial('POST', '/api/fitness/screen', { part: 'move', answers: MOVE_OK });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.areas.move.status, 'ok');
      const s = await trial('POST', '/api/fitness/sessions', { kind: 'workout', planKey: 'strength-a', moodBefore: 2 });
      assert.equal(s.status, 201);
      const done = await trial('PATCH', `/api/fitness/sessions/${s.body.session.id}`, { status: 'completed', durationSeconds: 1800, moodAfter: 4 });
      assert.equal(done.status, 200);
      const sum = await trial('GET', '/api/fitness/summary');
      assert.equal(sum.body.week.movementMinutes, 30);
      assert.equal(sum.body.week.strengthDays, 1);
      assert.equal(sum.body.week.moodLifted, 1);
      assert.match(sum.body.week.note, /clean-time/);
    });

    await t.test(`${backend} http: a red heat/cold result keeps protocols locked, rejects the tick and holds until re-check`, async () => {
      const red = await paid('POST', '/api/fitness/screen', { part: 'heat-cold', answers: { ...HC_OK, B12: true }, agree: true });
      assert.equal(red.status, 200);
      for (const a of ['sauna', 'cold', 'contrast']) assert.equal(red.body.areas[a].status, 'red');
      assert.ok(red.body.reasons.length >= 1);
      const pr = await paid('GET', '/api/fitness/protocols');
      assert.ok(pr.body.protocols.every((p) => !p.unlocked && !p.protocol));
      const tick = await paid('POST', '/api/fitness/screen/clearance', { confirm: true, areas: ['sauna'] });
      assert.equal(tick.status, 400);
      const start = await paid('POST', '/api/fitness/sessions', { kind: 'sauna', planKey: 'sauna-start', check: CHECK_OK });
      assert.equal(start.status, 409);
      assert.equal(start.body.code, 'screen');
      // A quick correction is allowed straight after; the answers themselves were never stored.
      const fix = await paid('POST', '/api/fitness/screen', { part: 'heat-cold', answers: { ...HC_OK, B3: true }, agree: true });
      assert.equal(fix.status, 200);
      assert.equal(fix.body.areas.cold.status, 'red');
      assert.equal(fix.body.areas.sauna.status, 'needs-clearance');
      const cleared = await paid('POST', '/api/fitness/screen/clearance', { confirm: true, areas: ['sauna'] });
      assert.equal(cleared.body.areas.sauna.status, 'ok');
      const prs = await paid('GET', '/api/fitness/protocols');
      assert.ok(prs.body.protocols.find((p) => p.id === 'sauna').protocol, 'sauna steps now shown');
      assert.equal(prs.body.protocols.find((p) => p.id === 'cold').protocol, undefined);
    });

    await t.test(`${backend} http: reporting alcohol or drug use pauses heat and cold for 24 h, server-side`, async () => {
      await founder('POST', '/api/fitness/screen', { part: 'heat-cold', answers: HC_OK, agree: true });
      const used = await founder('POST', '/api/fitness/check', { kind: 'sauna', answers: { ...CHECK_OK, usedSubstances: true } });
      assert.equal(used.status, 200);
      assert.equal(used.body.ok, false);
      const hours = (Date.parse(used.body.pausedUntil) - Date.now()) / 3600000;
      assert.ok(hours > 23.9 && hours <= 24, `paused ~24 h, got ${hours}`);
      // Answering "no" afterwards does not undo it, and the session start re-checks on the server.
      const again = await founder('POST', '/api/fitness/sessions', { kind: 'sauna', planKey: 'sauna-start', check: CHECK_OK });
      assert.equal(again.status, 409);
      assert.equal(again.body.code, 'check');
      assert.deepEqual(again.body.blocks.map((b) => b.code), ['lock']);
      const st = await founder('GET', '/api/fitness/status');
      assert.ok(st.body.pausedUntil);
      const cold = await founder('POST', '/api/fitness/check', { kind: 'cold', answers: { ...CHECK_OK, waterTempC: 6 } });
      assert.ok(cold.body.blocks.some((b) => b.code === 'too-cold'));
    });

    await t.test(`${backend} http: green screen + clean check starts a cold session; a client cannot skip the check`, async () => {
      await trial('POST', '/api/fitness/screen', { part: 'heat-cold', answers: HC_OK, agree: true });
      const noCheck = await trial('POST', '/api/fitness/sessions', { kind: 'cold', planKey: 'cold-step' });
      assert.equal(noCheck.status, 400);
      const cold = await trial('POST', '/api/fitness/sessions', { kind: 'cold', planKey: 'cold-step', check: { ...CHECK_OK, waterTempC: 9 } });
      assert.equal(cold.status, 409);
      const ok = await trial('POST', '/api/fitness/sessions', { kind: 'cold', planKey: 'cold-step', check: CHECK_OK, moodBefore: 3 });
      assert.equal(ok.status, 201);
      assert.ok(ok.body.warnings.some((w) => w.code === 'strength-gap'), 'strength session done minutes ago');
      const stop = await trial('PATCH', `/api/fitness/sessions/${ok.body.session.id}`, { status: 'stopped', stoppedForSymptoms: true, durationSeconds: 40 });
      assert.equal(stop.body.needsRescreen, true);
      const st = await trial('GET', '/api/fitness/status');
      assert.equal(st.body.screen.areas.cold.status, 'needs-rescreen');
      assert.equal(st.body.screen.areas.sauna.status, 'ok');
    });

    await t.test(`${backend} http: My Next Step and weekly plan tie-ins; export and delete-all include fitness`, async () => {
      const step = await trial('POST', '/api/fitness/next-step', { planKey: 'mobility' });
      assert.equal(step.status, 201);
      assert.match(step.body.step.title, /Mobility/);
      const plan = await trial('POST', '/api/fitness/weekly-plan', {});
      assert.equal(plan.status, 201);
      assert.equal(plan.body.plan.title, 'Move this week');
      assert.ok(plan.body.plan.steps.some((s) => /Sauna/.test(s.title)), 'heat step only because sauna is unlocked');
      const ex = await trial('GET', '/api/me/export?profileId=main');
      const data = typeof ex.body === 'string' ? JSON.parse(ex.body) : ex.body;
      assert.ok(data.moveAndRecover && data.moveAndRecover.sessions.length >= 2);
      assert.equal(JSON.stringify(data.moveAndRecover).includes('B12'), false);
      assert.equal((await trial('DELETE', '/api/me/data/all?profileId=main&confirm=all')).status, 200);
      assert.equal((await trial('GET', '/api/fitness/sessions')).body.sessions.length, 0);
      assert.equal((await trial('GET', '/api/fitness/status')).body.screen.areas.move.status, 'unscreened');
    });

    await t.test(`${backend} http: weekly drops gate content by FITNESS_PLUS_START`, async () => {
      process.env.FITNESS_PLUS_START = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(new Date());
      try {
        assert.equal((await founder('GET', '/api/fitness/program')).status, 200);
        const pr = await founder('GET', '/api/fitness/protocols');
        assert.ok(pr.body.protocols.every((p) => !p.released && !p.protocol));
        assert.equal((await founder('POST', '/api/fitness/screen', { part: 'heat-cold', answers: HC_OK, agree: true })).body.code, 'not_released');
        assert.equal((await founder('PUT', '/api/fitness/prefs', { level: 'advanced' })).body.code, 'not_released');
        assert.equal((await founder('POST', '/api/fitness/sessions', { kind: 'workout', planKey: 'mobility' })).body.code, 'not_released');
      } finally { delete process.env.FITNESS_PLUS_START; }
    });
  } finally {
    for (const who of users) { try { await who('DELETE', '/api/fitness/data?confirm=fitness'); } catch { /* ignore */ } }
    setFlag(null);
    await app.close();
  }
}

test('HTTP API on the JSON backend', async (t) => { await httpSuite(t, 'json'); });
test('HTTP API on the Postgres backend (Neon dev)', { skip: pgSkip }, async (t) => {
  try { await httpSuite(t, 'postgres'); } finally { const { closePool } = await import('./db/index.js'); await closePool(); }
});
