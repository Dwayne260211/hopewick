/**
 * Hopewick 2.0 Stage 5: safety plan builder + history, optional faith layer, personalisation.
 *
 * Runs the store contract on the JSON backend (always) and on Postgres (only when
 * DATABASE_URL is set; Neon 'dev' only, never 'main'; throwaway users s5test_*),
 * then the HTTP API end to end for each backend, with the model call stubbed.
 * Run: node --test --test-concurrency=1 server/stage5.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadLocalEnv, listMigrations } from './db/migrate.js';
import { createJsonWellbeingStore } from './wellbeing/json-store.js';
import { createWellbeingStore } from './wellbeing/index.js';
import { normalizeSafety, SAFETY_FIELDS, SAFETY_VERSIONS_KEPT, ValidationError } from './wellbeing/validate.js';
import {
  defaultPreferences, normalizePreferencesPatch, mergePreferences, readPreferences, faithOn, christianLayerOn,
  normalizeFaithContent, pickForDay, faithPromptDue, FAITH_ASK_AGAIN_DAYS,
} from './wellbeing/personal.js';
import { createReleaseCatalog } from './content-releases.js';
import { buildHopeMessages, normalizeContext, CRISIS_INSTRUCTION } from './hope-prompts.js';
import { CRISIS_FALLBACK } from './hope-chat.js';

loadLocalEnv();
const PG_URL = String(process.env.DATABASE_URL || '').trim();
const pgSkip = PG_URL ? false : 'DATABASE_URL not set; Postgres backend tests skipped';
const run = crypto.randomBytes(4).toString('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-s5-'));
const KEY = crypto.randomBytes(32).toString('base64');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FAITH_WORDS = /\b(god|jesus|christ|lord|pray|prayer|scripture|bible|psalm|church|faith|gospel|amen)\b/i;

/* ---------------- units ---------------- */

test('safety plan has the seven Stanley-Brown style steps, in order, and old plans still load', () => {
  assert.deepEqual(SAFETY_FIELDS, ['warningSigns', 'copingThings', 'safePlaces', 'people', 'professionals', 'safeEnvironment', 'reasons']);
  const s = normalizeSafety({ warningSigns: ['not sleeping'], people: ['Sam 0400 000 000'], professionals: ['GP Dr Lee 07 3000 0000'], safeEnvironment: ['Meds with Mum'], reasons: ['my kids'] });
  assert.deepEqual(s.professionals, ['GP Dr Lee 07 3000 0000']);
  assert.deepEqual(s.safeEnvironment, ['Meds with Mum']);
  const old = normalizeSafety({ warningSigns: ['a'], copingThings: ['b'], safePlaces: ['c'], people: ['d'], reasons: ['e'] });
  assert.deepEqual(old.professionals, []);
  assert.throws(() => normalizeSafety({ professionals: 'not a list' }), ValidationError);
  assert.equal(SAFETY_VERSIONS_KEPT, 20);
});

test('preferences: strict types, nothing inferred, faith off by default, reset clears', () => {
  const d = defaultPreferences();
  assert.equal(d.faithOptIn, false);
  assert.deepEqual(d.focusAreas, []);
  assert.equal(faithOn(d), false);
  assert.equal(faithOn(null), false);
  const patch = normalizePreferencesPatch({ preferredName: '  Jo \n', focusAreas: ['sleep', 'mood', 'sleep'], tone: 'direct', onboarded: true, inferredReligion: 'x' });
  assert.equal(patch.preferredName, 'Jo');
  assert.deepEqual([...patch.focusAreas].sort(), ['mood', 'sleep']);
  assert.equal('inferredReligion' in patch, false);
  const merged = mergePreferences(d, patch);
  assert.ok(merged.onboardedAt);
  assert.equal(merged.faithOptIn, false, 'faith is never switched on implicitly');
  for (const bad of [{ tone: 'loud' }, { focusAreas: ['depression'] }, { faithOptIn: 'yes' }, { preferredName: 7 }, { faithTradition: 'unknown' }, { preferredName: 'x'.repeat(41) }]) {
    assert.throws(() => normalizePreferencesPatch(bad), ValidationError, JSON.stringify(bad));
  }
  const on = mergePreferences(d, normalizePreferencesPatch({ faithOptIn: true, faithTradition: 'christian' }));
  assert.equal(faithOn(on), true);
  assert.equal(christianLayerOn(on), true);
  assert.equal(christianLayerOn(mergePreferences(d, normalizePreferencesPatch({ faithOptIn: true, faithTradition: 'buddhist' }))), false, 'Christian content only for a Christian tradition');
  assert.equal(readPreferences({ faithOptIn: 'true' }).faithOptIn, false);
});

test('faith question: Yes / No thanks / Decide later, asked again at most once, never after an answer', () => {
  const t0 = new Date('2026-10-18T09:00:00Z');
  const fresh = readPreferences(null);
  assert.equal(fresh.faithAnswer, null);
  assert.equal(faithPromptDue(fresh, t0), true, 'a new or existing account that never answered is asked');
  assert.throws(() => normalizePreferencesPatch({ faithAnswer: 'maybe' }), ValidationError);
  const yes = readPreferences(mergePreferences(fresh, normalizePreferencesPatch({ faithAnswer: 'yes' }), t0));
  assert.equal(yes.faithOptIn, true);
  assert.equal(yes.faithTradition, 'christian');
  assert.equal(faithOn(yes), true);
  assert.equal(faithPromptDue(yes, t0), false);
  const no = readPreferences(mergePreferences(fresh, normalizePreferencesPatch({ faithAnswer: 'no' }), t0));
  assert.equal(no.faithOptIn, false);
  assert.equal(faithPromptDue(no, new Date('2030-01-01')), false, 'No thanks is never asked again');
  const later1 = readPreferences(mergePreferences(fresh, normalizePreferencesPatch({ faithAnswer: 'later' }), t0));
  assert.equal(later1.faithOptIn, false, 'Decide later means faith is off');
  assert.equal(later1.faithLaterCount, 1);
  assert.equal(faithPromptDue(later1, new Date(t0.getTime() + 86400000)), false, 'not straight away');
  const back = new Date(t0.getTime() + FAITH_ASK_AGAIN_DAYS * 86400000);
  assert.equal(faithPromptDue(later1, back), true, 'comes back once, gently, later');
  const later2 = readPreferences(mergePreferences(later1, normalizePreferencesPatch({ faithAnswer: 'later' }), back));
  assert.equal(later2.faithLaterCount, 2);
  assert.equal(faithPromptDue(later2, new Date('2030-01-01')), false, 'two dismissals end the asking');
  // Switching faith on or off in About you also counts as an answer.
  const viaSettings = readPreferences(mergePreferences(fresh, normalizePreferencesPatch({ faithOptIn: false }), t0));
  assert.equal(viaSettings.faithAnswer, 'no');
  assert.equal(faithPromptDue(viaSettings, t0), false);
  // A later "Decide later" never undoes an earlier answer.
  const keep = readPreferences(mergePreferences(no, normalizePreferencesPatch({ faithAnswer: 'later' }), t0));
  assert.equal(keep.faithAnswer, 'no');
});

test('faith content: public-domain translation only, original reflections, pending review', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'server/library/faith-content.json'), 'utf8'));
  const items = normalizeFaithContent(raw);
  assert.ok(items.length >= 7);
  for (const it of items) {
    assert.match(it.scripture.translation, /^(WEB|KJV)$/);
    assert.ok(it.scripture.ref && it.scripture.text);
    assert.equal(it.review, 'pending');
    assert.ok(it.reflection.length > 40 && it.reflection.length <= 700);
    assert.ok(it.prayer.length > 20 && it.prayer.length <= 400);
    assert.doesNotMatch(it.reflection + it.prayer, /instead of (your )?(gp|doctor|counsell?or|medication|treatment)|(is|means|shows) a lack of faith|not enough faith|sin(ful)? to feel|if you (just )?prayed/i, 'never shaming or replacing care');
  }
  assert.throws(() => normalizeFaithContent({ items: [{ ...raw.items[0], scripture: { ...raw.items[0].scripture, translation: 'NIV' } }] }), /public-domain|WEB|KJV/);
  assert.equal(pickForDay(items, '2026-10-18').id, pickForDay(items, '2026-10-18').id);
  const sources = fs.readFileSync(path.join(root, 'docs/CONTENT-SOURCES.md'), 'utf8');
  assert.match(sources, /World English Bible/);
  assert.match(sources, /public domain/i);
});

test('release catalog: faith modules are invisible and locked unless the faith layer is on', () => {
  const cat = createReleaseCatalog();
  const off = cat.list({ plus: true });
  assert.equal(off.some((i) => /faith/.test(i.id)), false, 'no faith items, not even locked teasers');
  const on = cat.list({ plus: false, faith: true });
  const core = on.find((i) => i.id === 'module-faith-hope-hard-days');
  assert.ok(core && core.available, 'a small faith core is free');
  assert.equal(cat.allows('module', 'faith-hope-hard-days', { plus: true }), false);
  assert.equal(cat.allows('module', 'faith-hope-hard-days', { plus: false, faith: true }), true);
});

test('Hope prompt: faith off by default, server preferences win over the browser, crisis help kept whole', () => {
  assert.equal(normalizeContext({}).faith, 'none');
  const turns = [{ role: 'user', content: 'hi' }];
  // Browser asks for Christian content; the saved preference says faith is off.
  const off = buildHopeMessages({ turns, context: { mode: 'counsellor', faith: 'christian', faithLevel: 'central', focus: { kind: 'soap', ref: 'Psalm 23' } }, preferences: { ...defaultPreferences(), preferredName: 'Jo', tone: 'direct', focusAreas: ['sleep', 'aod'] } })[0].content;
  assert.match(off, /Faith content is OFF/);
  assert.match(off, /Tradition: No faith/);
  assert.doesNotMatch(off, /Celebrate Recovery|faith leader|Psalm 23/);
  assert.match(off, /You are talking with Jo/);
  assert.match(off, /direct tone/);
  assert.match(off, /focus on: sleep, alcohol and other drug recovery/);
  assert.match(off, /Do not guess, infer or label sensitive things/);
  const on = buildHopeMessages({ turns, context: { mode: 'friend' }, preferences: { ...defaultPreferences(), faithOptIn: true, faithTradition: 'christian' } })[0].content;
  assert.match(on, /opted in to faith content/);
  assert.match(on, /never suggest faith replaces professional care/);
  // Signed out (no saved preferences): nothing sent means no faith.
  assert.match(buildHopeMessages({ turns, context: {} })[0].content, /Faith content is OFF/);
  // Crisis: every number is still there, and the safety plan is pointed to.
  for (const n of ['000', '13 11 14', '1300 659 467', '1800 250 015', '1800 177 833', '1800 737 732', '13 92 76']) {
    assert.ok(CRISIS_INSTRUCTION.includes(n) || buildHopeMessages({ turns, context: {}, crisis: true }).some((m) => m.content.includes(n)), n);
  }
  assert.match(CRISIS_INSTRUCTION, /safety plan/i);
  assert.match(CRISIS_INSTRUCTION, /TOOLS: help, safety/);
  assert.match(CRISIS_FALLBACK, /000/);
  assert.match(CRISIS_FALLBACK, /13 11 14/);
  const crisis = buildHopeMessages({ turns, context: {}, crisis: true });
  assert.equal(crisis.at(-1).content, CRISIS_INSTRUCTION);
});

test('migration 007: new tables keyed by user, RLS forced, sensitive columns sealed', () => {
  const m = listMigrations().find((x) => x.version === 7);
  assert.ok(m, '007 present');
  assert.ok(listMigrations().some((x) => x.version === 6 && /fitness/.test(x.file)), '006 is Move & Recover (fitness); Stage 5 is 007');
  for (const t of ['safety_plan_versions', 'user_preferences']) {
    assert.match(m.sql, new RegExp(`CREATE TABLE ${t} \\(`));
    assert.match(m.sql, new RegExp(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`));
    assert.match(m.sql, new RegExp(`CREATE POLICY \\w+ ON ${t}\\b`));
  }
});

/* ---------------- store contract, both backends ---------------- */

async function contract(t, store, { A, B }) {
  const P = 'main';
  await t.test(`${store.backend}: preferences save, merge, isolate, reset`, async () => {
    assert.deepEqual(await store.getPreferences(A, P), readPreferences(null));
    const saved = await store.putPreferences(A, P, mergePreferences(readPreferences(null), normalizePreferencesPatch({ preferredName: 'Jo', focusAreas: ['anxiety'], tone: 'direct', faithOptIn: true, onboarded: true })));
    assert.equal(saved.preferredName, 'Jo');
    assert.equal((await store.getPreferences(A, P)).faithOptIn, true);
    assert.equal((await store.getPreferences(B, P)).faithOptIn, false, 'other users see defaults');
    assert.equal((await store.getPreferences(A, 'other')).preferredName, '', 'per profile');
    await store.deletePreferences(A, P);
    assert.deepEqual(await store.getPreferences(A, P), readPreferences(null));
  });
  await t.test(`${store.backend}: safety plan versions save, list newest first, keep the last 20`, async () => {
    for (let i = 1; i <= SAFETY_VERSIONS_KEPT + 3; i++) {
      const v = await store.addSafetyVersion(A, P, normalizeSafety({ reasons: [`reason ${i}`] }), { reason: i === 23 ? 'restore' : 'save' });
      assert.equal(v.version, i);
    }
    const list = await store.listSafetyVersions(A, P);
    assert.equal(list.length, SAFETY_VERSIONS_KEPT);
    assert.equal(list[0].version, 23);
    assert.equal(list[0].reason, 'restore');
    assert.deepEqual(list[0].safety.reasons, ['reason 23']);
    assert.equal(list.at(-1).version, 4);
    assert.equal((await store.listSafetyVersions(B, P)).length, 0);
    await store.clearArea(A, P, 'plans');
    assert.equal((await store.listSafetyVersions(A, P)).length, 0, 'deleting plans removes the history too');
  });
}

test('JSON backend: Stage 5 contract, and sensitive fields are sealed in the file', async (t) => {
  const dir = tmp();
  const file = path.join(dir, 'wellbeing.json');
  const store = createJsonWellbeingStore(file, { env: { HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 's5' } });
  await contract(t, store, { A: 'userA', B: 'userB' });
  await store.putPreferences('userC', 'main', mergePreferences(readPreferences(null), normalizePreferencesPatch({ preferredName: 'Private Name', focusAreas: ['aod'] })));
  await store.addSafetyVersion('userC', 'main', normalizeSafety({ reasons: ['my private reason'] }));
  const raw = fs.readFileSync(file, 'utf8');
  for (const s of ['Private Name', 'my private reason', '"aod"']) assert.ok(!raw.includes(s), `${s} must not be in the file`);
  assert.match(raw, /hwenc:v1:s5:/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Postgres backend: Stage 5 contract, ciphertext at rest, RLS (Neon dev)', { skip: pgSkip }, async (t) => {
  const { closePool, withUser } = await import('./db/index.js');
  const env = { ...process.env, HOPEWICK_DATA_KEY: KEY, HOPEWICK_DATA_KEY_ID: 's5' };
  const store = createWellbeingStore({ env, backend: 'postgres' });
  const A = `s5test_${run}_a`; const B = `s5test_${run}_b`; const C = `s5test_${run}_c`;
  try {
    await contract(t, store, { A, B });
    await t.test('postgres: preferences and versions are ciphertext; other users see no rows', async () => {
      await store.putPreferences(C, 'main', mergePreferences(readPreferences(null), normalizePreferencesPatch({ preferredName: 'Private Name' })));
      await store.addSafetyVersion(C, 'main', normalizeSafety({ reasons: ['my private reason'] }));
      const raw = await withUser(C, async (c) => ({
        p: (await c.query('SELECT prefs, encryption FROM user_preferences WHERE user_id = $1', [C])).rows[0],
        v: (await c.query('SELECT plan, encryption FROM safety_plan_versions WHERE user_id = $1', [C])).rows[0],
        others: (await c.query('SELECT count(*)::int AS n FROM safety_plan_versions')).rows[0].n,
      }), env);
      assert.match(raw.p.prefs, /^hwenc:v1:s5:/);
      assert.match(raw.v.plan, /^hwenc:v1:s5:/);
      assert.equal(raw.v.encryption, 'aes-256-gcm-v1');
      assert.equal(raw.others, 1, 'RLS: only this user\'s rows');
      const seen = await withUser(B, async (c) => (await c.query('SELECT count(*)::int AS n FROM user_preferences')).rows[0].n, env);
      assert.equal(seen, 0);
    });
  } finally {
    for (const u of [A, B, C]) { try { await store.forget(u); } catch { /* gone */ } }
    await closePool();
  }
});

/* ---------------- HTTP, end to end ---------------- */

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'FOUNDER_PLUS_EMAILS', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'HOPEWICK_DATA_KEY', 'DATABASE_URL'];
const realFetch = globalThis.fetch;

async function listen({ backend }) {
  const dir = tmp();
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test-hope', HOPEWICK_DATA_KEY: KEY });
  if (backend === 'postgres') process.env.DATABASE_URL = PG_URL;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/chat/completions')) {
      calls.push(JSON.parse(String(opts.body)));
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello from Hope' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
  const { startServer } = await import('./index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    calls,
    async close() {
      globalThis.fetch = realFetch;
      await new Promise((resolve) => server.close(resolve));
      for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function signIn(base, email) {
  const data = await (await realFetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).json();
  const verified = await realFetch(data.devLink, { redirect: 'manual' });
  return (verified.headers.get('set-cookie') || '').split(';')[0];
}
function api(base, cookie) {
  return async (method, route, body) => {
    const res = await realFetch(`${base}${route}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

async function httpSuite(t, backend) {
  const app = await listen({ backend });
  const tag = crypto.randomBytes(3).toString('hex');
  const emails = [];
  const fresh = async (name) => { const e = `s5-${name}-${tag}@example.com`; emails.push(e); return api(app.base, await signIn(app.base, e)); };
  try {
    const anon = api(app.base, null);

    await t.test(`${backend} http: /app redirects to /app/ (301) and keeps the query string`, async () => {
      for (const [from, to] of [['/app', '/app/'], ['/app?tab=safety&demo=1', '/app/?tab=safety&demo=1']]) {
        const r = await realFetch(`${app.base}${from}`, { redirect: 'manual' });
        assert.equal(r.status, 301, from);
        assert.equal(r.headers.get('location'), to);
      }
      const head = await realFetch(`${app.base}/app`, { method: 'HEAD', redirect: 'manual' });
      assert.equal(head.status, 301);
      const page = await realFetch(`${app.base}/app/`, { redirect: 'manual' });
      assert.equal(page.status, 200);
      assert.match(await page.text(), /hw-stage5\.js/);
      assert.equal((await realFetch(`${app.base}/appx`, { redirect: 'manual' })).status, 404, 'only /app itself');
    });

    await t.test(`${backend} http: signed out gets 401 for preferences, faith and history`, async () => {
      for (const r of ['/api/me/preferences?profileId=main', '/api/me/faith?profileId=main', '/api/me/safety-plan/versions?profileId=main']) assert.equal((await anon('GET', r)).status, 401, r);
      const rel = await anon('GET', '/api/content/releases');
      assert.equal(rel.body.items.some((i) => /faith/.test(i.id)), false);
    });

    await t.test(`${backend} http: faith OFF by default shows nothing anywhere`, async () => {
      const u = await fresh('off');
      assert.equal((await u('GET', '/api/me/preferences?profileId=main')).body.preferences.faithOptIn, false);
      for (const c of ['home', 'checkin', 'coping', 'journal']) assert.deepEqual((await u('GET', `/api/me/faith?profileId=main&context=${c}`)).body, { enabled: false, items: [] });
      const rel = await u('GET', '/api/content/releases?profileId=main');
      assert.equal(rel.status, 200);
      assert.doesNotMatch(JSON.stringify(rel.body), FAITH_WORDS, 'no faith words in the free catalog');
      assert.equal((await u('PUT', '/api/me/learning/faith-hope-hard-days', { profileId: 'main', step: 1 })).status >= 400, true, 'faith module progress refused while off');
    });

    await t.test(`${backend} http: opt in shows reflections and faith modules; opt out hides them again`, async () => {
      const u = await fresh('on');
      const put = await u('PATCH', '/api/me/preferences', { profileId: 'main', faithOptIn: true, faithTradition: 'christian', preferredName: 'Jo', focusAreas: ['mood'], tone: 'gentle', onboarded: true });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      const f = await u('GET', '/api/me/faith?profileId=main&context=checkin');
      assert.equal(f.body.enabled, true);
      assert.ok(f.body.today && f.body.today.scripture.ref && f.body.today.prayer);
      assert.equal(f.body.review, 'pending');
      assert.equal((await u('GET', '/api/me/faith?profileId=main&context=nowhere')).status, 400);
      const rel = await u('GET', '/api/content/releases?profileId=main');
      assert.ok(rel.body.items.some((i) => i.id === 'module-faith-hope-hard-days' && i.available));
      // module-faith-grace-after-lapse joins the Plus schedule on 2026-11-22, so it is not listed yet.
      assert.equal((await u('GET', '/api/content/releases?profileId=other')).body.items.some((i) => /faith/.test(i.id)), false, 'per profile');
      await u('PATCH', '/api/me/preferences', { profileId: 'main', faithOptIn: false });
      assert.equal((await u('GET', '/api/me/faith?profileId=main&context=home')).body.enabled, false);
      await u('PATCH', '/api/me/preferences', { profileId: 'main', faithOptIn: true, faithTradition: 'islamic' });
      assert.equal((await u('GET', '/api/me/faith?profileId=main&context=home')).body.enabled, false, 'no Christian content for another tradition');
      const reset = await u('DELETE', '/api/me/preferences?profileId=main');
      assert.equal(reset.body.preferences.preferredName, '');
      assert.equal(reset.body.preferences.faithOptIn, false);
      assert.equal((await u('PATCH', '/api/me/preferences', { profileId: 'main', tone: 'shouty' })).status, 400);
    });

    await t.test(`${backend} http: the faith question is due until answered, and each answer saves`, async () => {
      for (const [answer, on] of [['yes', true], ['no', false], ['later', false]]) {
        const u = await fresh(`ask-${answer}`);
        const g = await u('GET', '/api/me/preferences?profileId=main');
        assert.equal(g.body.faithPromptDue, true, 'never answered: ask');
        const r = await u('PATCH', '/api/me/preferences', { profileId: 'main', faithAnswer: answer });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.preferences.faithOptIn, on, answer);
        assert.equal(r.body.faithPromptDue, false, `${answer}: not asked again straight away`);
        assert.equal((await u('GET', '/api/me/faith?profileId=main&context=home')).body.enabled, on, `${answer}: faith content follows the answer`);
        const again = await u('GET', '/api/me/preferences?profileId=main');
        assert.equal(again.body.preferences.faithAnswer, answer);
        assert.equal(again.body.faithPromptDue, false);
        // Reset in About you does not bring the question back.
        const reset = await u('DELETE', '/api/me/preferences?profileId=main');
        assert.equal(reset.body.preferences.faithOptIn, false);
        assert.equal(reset.body.faithPromptDue, false);
      }
      const u = await fresh('ask-bad');
      assert.equal((await u('PATCH', '/api/me/preferences', { profileId: 'main', faithAnswer: 'perhaps' })).status, 400);
    });

    await t.test(`${backend} http: Hope uses saved preferences, not what the browser claims`, async () => {
      const u = await fresh('hope');
      await u('PATCH', '/api/me/preferences', { profileId: 'main', preferredName: 'Jo', tone: 'direct' });
      app.calls.length = 0;
      const r = await u('POST', '/api/hope/chat', { messages: [{ role: 'user', content: 'Hello' }], context: { profileId: 'main', userName: 'Someone', mode: 'counsellor', faith: 'christian', faithLevel: 'central' } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const sys = app.calls[0].messages[0].content;
      assert.match(sys, /You are talking with Jo/);
      assert.match(sys, /Faith content is OFF/);
      assert.match(sys, /direct tone/);
      assert.match(sys, /Lifeline: 13 11 14/);
      await u('PATCH', '/api/me/preferences', { profileId: 'main', faithOptIn: true, faithTradition: 'christian' });
      app.calls.length = 0;
      await u('POST', '/api/hope/chat', { messages: [{ role: 'user', content: 'Hello' }], context: { profileId: 'main', mode: 'counsellor' } });
      assert.match(app.calls[0].messages[0].content, /opted in to faith content/);
      app.calls.length = 0;
      await u('POST', '/api/hope/chat', { messages: [{ role: 'user', content: 'I want to kill myself' }], context: { profileId: 'main' } });
      const sent = app.calls[0].messages;
      assert.equal(sent.at(-1).content, CRISIS_INSTRUCTION, 'crisis path unchanged by preferences');
    });

    await t.test(`${backend} http: safety plan saves keep a history; restore makes a new version; free forever`, async () => {
      const u = await fresh('safety');
      const a = await u('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { warningSigns: ['not sleeping'], reasons: ['my kids'] } });
      assert.equal(a.status, 200);
      assert.equal(a.body.version, 1);
      const b = await u('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { warningSigns: ['not sleeping', 'skipping meals'], professionals: ['Lifeline 13 11 14'], safeEnvironment: ['Car keys with Sam'], reasons: ['my kids'] } });
      assert.equal(b.body.version, 2);
      const list = (await u('GET', '/api/me/safety-plan/versions?profileId=main')).body.versions;
      assert.deepEqual(list.map((v) => v.version), [2, 1]);
      assert.equal(list[0].items, 5);
      assert.deepEqual((await u('GET', '/api/me/safety-plan/versions/1?profileId=main')).body.safety.warningSigns, ['not sleeping']);
      const r = await u('POST', '/api/me/safety-plan/versions/1/restore', { profileId: 'main' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.version, 3);
      assert.deepEqual((await u('GET', '/api/me/safety-plan?profileId=main')).body.safety.warningSigns, ['not sleeping']);
      assert.equal((await u('GET', '/api/me/safety-plan/versions/99?profileId=main')).status, 404);
      const other = await fresh('safety-other');
      assert.equal((await other('GET', '/api/me/safety-plan/versions/1?profileId=main')).status, 404, 'other accounts cannot see it');
      const exp = await u('GET', '/api/me/export?profileId=main');
      assert.equal(exp.status, 200);
      assert.equal(JSON.stringify(exp.body).includes('Car keys with Sam'), true, 'export includes the history');
      const del = await u('DELETE', '/api/me/data/plans?profileId=main&confirm=plans');
      assert.ok(del.status === 200, JSON.stringify(del.body));
      assert.equal((await u('GET', '/api/me/safety-plan/versions?profileId=main')).body.versions.length, 0);
    });
  } finally {
    await app.close();
    if (backend === 'postgres') {
      try { const { closePool } = await import('./db/index.js'); await closePool(); } catch { /* closed */ }
    }
  }
}

test('HTTP (JSON backend)', async (t) => { await httpSuite(t, 'json'); });
test('HTTP (Postgres backend, Neon dev)', { skip: pgSkip }, async (t) => { await httpSuite(t, 'postgres'); });
