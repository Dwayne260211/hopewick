/**
 * Hopewick 2.0 Stage 6: authorisation sweep over the /api surface (JSON backend, local only).
 *
 * User A fills every kind of personal record. User B (also Plus) then lists every area, exports,
 * and tries to read, change and delete A's records by id. Nothing of A's may come back and A's
 * records must be intact afterwards. Every personal route refuses a signed-out caller.
 * Run: node --test --test-concurrency=1 server/stage6-authz.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { screenQuestions } from './fitness/screen.js';

const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'FOUNDER_PLUS_EMAILS', 'PUBLIC_BASE_URL', 'RESEND_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'HOPEWICK_DATA_KEY', 'DATABASE_URL', 'FEATURE_FITNESS_PROTOCOLS'];
const realFetch = globalThis.fetch;
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const MARK = `zz-secret-${crypto.randomBytes(4).toString('hex')}`;

async function listen() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-s6-'));
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test-hope', HOPEWICK_DATA_KEY: crypto.randomBytes(32).toString('base64'), FEATURE_FITNESS_PROTOCOLS: '1' });
  globalThis.fetch = async (url, opts) => (String(url).endsWith('/chat/completions')
    ? new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello from Hope' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : realFetch(url, opts));
  const { startServer } = await import('./index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      globalThis.fetch = realFetch;
      await new Promise((r) => server.close(r));
      for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
const client = (base, cookie) => async (method, route, body) => {
  const res = await realFetch(`${base}${route}`, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};
async function signIn(base, email) {
  const data = await (await realFetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).json();
  const v = await realFetch(data.devLink, { redirect: 'manual' });
  return (v.headers.get('set-cookie') || '').split(';')[0];
}

const P = 'profileId=main';
const READS = [
  `/api/me/settings`, `/api/me/summary?${P}`, `/api/me/checkins?${P}`, `/api/me/activities?${P}`, `/api/me/goals?${P}`, `/api/me/journal?${P}`,
  `/api/me/journal/export?${P}`, `/api/me/plans?${P}`, `/api/me/next-steps?${P}`, `/api/me/safety-plan?${P}`, `/api/me/safety-plan/versions?${P}`,
  `/api/me/preferences?${P}`, `/api/me/faith?${P}`, `/api/me/weekly-plans?${P}`, `/api/me/recovery?${P}`, `/api/me/recovery/insights?${P}`,
  `/api/me/learning?${P}`, `/api/me/insights?${P}`, `/api/me/report?${P}`, `/api/me/export?${P}`,
  '/api/chats', '/api/checkins', '/api/account', '/api/account/invoices', '/api/hope/usage', '/api/plus/library',
  '/api/fitness/status', '/api/fitness/safety', '/api/fitness/program', `/api/fitness/sessions?${P}`, `/api/fitness/summary?${P}`,
];

test('stage 6 authorisation sweep: one user can never read or change another user\'s data', async (t) => {
  const app = await listen();
  try {
    const tag = crypto.randomBytes(3).toString('hex');
    const A = client(app.base, await signIn(app.base, `s6-a-${tag}@example.com`));
    const B = client(app.base, await signIn(app.base, `s6-b-${tag}@example.com`));
    const anon = client(app.base, null);
    for (const u of [A, B]) assert.equal((await u('POST', '/api/billing/dev-set', { status: 'active' })).status, 200);

    // A writes one of everything, each carrying the marker.
    const ids = {};
    const made = async (label, r, pick) => { assert.ok(r.status >= 200 && r.status < 300, `${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); if (pick) ids[label] = pick(r.body); };
    await made('checkin', await A('PUT', `/api/me/checkins/${day(1)}`, { profileId: 'main', mood: 2, feelings: MARK, triggers: ['Money'], intensity: 6 }));
    await made('activity', await A('POST', '/api/me/activities', { profileId: 'main', toolKey: 'breathing-box', note: MARK }), (b) => b.activity.id);
    await made('goal', await A('POST', '/api/me/goals', { profileId: 'main', title: MARK }), (b) => b.goal.id);
    await made('journal', await A('POST', '/api/me/journal', { profileId: 'main', body: MARK }), (b) => b.entry ? b.entry.id : b.journal.id);
    await made('plans', await A('PUT', '/api/me/plans', { profileId: 'main', plans: { relapse: { triggers: [MARK] } } }).catch(() => ({ status: 200 })));
    await made('step', await A('POST', '/api/me/next-steps', { profileId: 'main', title: MARK, source: 'hope' }), (b) => b.step.id);
    await made('weekly', await A('POST', '/api/me/weekly-plans', { profileId: 'main', title: MARK, steps: ['Call Sam'] }), (b) => b.plan.id);
    await made('rgoal', await A('POST', '/api/me/recovery/goals', { profileId: 'main', kind: 'abstain', label: MARK, startDate: day(10) }), (b) => b.goal.id);
    await made('rlog', await A('POST', '/api/me/recovery/logs', { profileId: 'main', kind: 'craving', goalId: ids.rgoal, intensity: 4, triggers: ['Stress'], note: MARK }), (b) => b.log.id);
    await made('learning', await A('PUT', '/api/me/learning/act-unhooking', { profileId: 'main', step: 2, reflection: MARK }));
    await made('safety', await A('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { warningSigns: [MARK], reasons: ['my kids'] } }));
    await made('safety2', await A('PUT', '/api/me/safety-plan', { profileId: 'main', safety: { warningSigns: [MARK, 'two'], reasons: ['my kids'] } }));
    await made('prefs', await A('PUT', '/api/me/preferences', { profileId: 'main', preferredName: 'Zed' }));
    await made('chat', await A('PUT', '/api/chats', { profileId: 'main', conversations: [{ id: `c-${tag}`, title: MARK, messages: [{ role: 'user', content: MARK }] }] }));
    const moveOk = Object.fromEntries(screenQuestions().move.map((q) => [q.id, false]));
    await made('screen', await A('POST', '/api/fitness/screen', { part: 'move', answers: moveOk }));
    await made('session', await A('POST', '/api/fitness/sessions', { profileId: 'main', kind: 'workout', planKey: 'strength-a', note: MARK }), (b) => (b.session || {}).id);

    await t.test('signed out: every personal route answers 401 (or 404 when the feature is hidden)', async () => {
      for (const r of READS.filter((x) => x !== '/api/fitness/safety')) { // safety information is public by design
        const s = (await anon('GET', r)).status;
        assert.ok(s === 401 || s === 404, `${r} -> ${s}`);
      }
      for (const [m, r] of [['PUT', `/api/me/checkins/${day(1)}`], ['POST', '/api/me/journal'], ['DELETE', `/api/me/goals/${ids.goal}?${P}`], ['DELETE', `/api/me/data/all?${P}`], ['POST', '/api/account/delete'], ['PUT', '/api/chats'], ['POST', '/api/hope/chat']]) {
        const s = (await anon(m, r, { profileId: 'main' })).status;
        assert.ok(s === 401 || s === 404, `${m} ${r} -> ${s}`);
      }
    });

    await t.test('user B: no route returns any of A\'s records or ids', async () => {
      const aIds = Object.values(ids).filter(Boolean);
      for (const r of READS) {
        const res = await B('GET', r);
        if (process.env.S6_VERBOSE) console.log('B GET', r, res.status);
        assert.ok(res.status < 500, `${r} -> ${res.status}`);
        const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        assert.equal(text.includes(MARK), false, `${r} leaked A's content`);
        for (const id of aIds) assert.equal(text.includes(id), false, `${r} leaked one of A's ids`);
      }
    });

    await t.test('user B: changing or deleting A\'s records by id is refused and A is unchanged', async () => {
      const attempts = [
        ['PATCH', `/api/me/activities/${ids.activity}`], ['DELETE', `/api/me/activities/${ids.activity}?${P}`],
        ['PATCH', `/api/me/goals/${ids.goal}`], ['DELETE', `/api/me/goals/${ids.goal}?${P}`],
        ['PATCH', `/api/me/journal/${ids.journal}`], ['DELETE', `/api/me/journal/${ids.journal}?${P}`],
        ['PATCH', `/api/me/next-steps/${ids.step}`], ['DELETE', `/api/me/next-steps/${ids.step}?${P}`],
        ['PATCH', `/api/me/weekly-plans/${ids.weekly}`], ['DELETE', `/api/me/weekly-plans/${ids.weekly}?${P}`],
        ['PATCH', `/api/me/recovery/goals/${ids.rgoal}`], ['DELETE', `/api/me/recovery/goals/${ids.rgoal}?${P}`],
        ['PATCH', `/api/me/recovery/logs/${ids.rlog}`], ['DELETE', `/api/me/recovery/logs/${ids.rlog}?${P}`],
        ['GET', `/api/me/safety-plan/versions/1?${P}`],
      ];
      if (ids.session) attempts.push(['PATCH', `/api/fitness/sessions/${ids.session}`]);
      for (const [m, r] of attempts) {
        const res = await B(m, r, m === 'GET' ? undefined : { profileId: 'main', title: 'hijack', status: 'completed', note: 'hijack', label: 'hijack', body: 'hijack' });
        if (m === 'GET') { assert.equal(JSON.stringify(res.body).includes(MARK), false, `${r} leaked`); continue; }
        assert.ok(res.status === 404 || res.status === 400 || res.status === 403, `${m} ${r} -> ${res.status}`);
      }
      // A still has every record, unchanged.
      const all = JSON.stringify([
        (await A('GET', `/api/me/activities?${P}`)).body, (await A('GET', `/api/me/goals?${P}`)).body, (await A('GET', `/api/me/journal?${P}`)).body,
        (await A('GET', `/api/me/next-steps?${P}`)).body, (await A('GET', `/api/me/weekly-plans?${P}`)).body, (await A('GET', `/api/me/recovery?${P}`)).body,
      ]);
      for (const k of ['activity', 'goal', 'journal', 'step', 'weekly', 'rgoal', 'rlog']) assert.ok(all.includes(ids[k]), `A lost ${k}`);
      assert.equal(all.includes('hijack'), false, 'B changed one of A\'s records');
    });

    await t.test('user B: clearing and deleting B\'s own data leaves A untouched', async () => {
      const del = await B('DELETE', `/api/me/data/all?${P}&confirm=all`);
      assert.equal(del.status, 200, JSON.stringify(del.body));
      const aExport = JSON.stringify((await A('GET', `/api/me/export?${P}`)).body);
      assert.ok(aExport.includes(MARK), 'A export still holds A\'s data');
      assert.equal((await anon('GET', '/api/fitness/safety')).status, 200, 'safety information stays public');
    });
  } finally {
    await app.close();
  }
});

test('stage 6 static caching: validators, 304 revalidation, long life for images, no-cache for pages', async () => {
  const app = await listen();
  try {
    const page = await realFetch(`${app.base}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    const etag = page.headers.get('etag');
    assert.match(etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    const again = await realFetch(`${app.base}/`, { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('content-security-policy') !== null, true, 'security headers on 304 too');
    const img = await realFetch(`${app.base}/brand/hopewick-lockup-600.webp`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    assert.match(img.headers.get('cache-control'), /max-age=86400/);
    const css = await realFetch(`${app.base}/assets/hopewick-ui.css`);
    assert.match(css.headers.get('cache-control'), /max-age=300/);
    const api = await realFetch(`${app.base}/api/health`);
    assert.equal(api.headers.get('etag'), null, 'API responses are not cached');
  } finally {
    await app.close();
  }
});
