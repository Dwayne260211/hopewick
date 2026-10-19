/**
 * Suicide prevention safety plan (Stanley-Brown steps) inside "My safety plan".
 *
 *  - The seven steps are in order and the browser builder matches the server fields.
 *  - The prefilled services (step 5) carry the verified numbers, and every tel: link
 *    dials exactly the digits shown.
 *  - It is free: an account without Hopewick Plus saves and loads the full plan.
 *  - It is private: encrypted at rest, and never put into what Hope (the AI) is sent.
 * Run: node --test --test-concurrency=1 tests/suicide-safety-plan.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Load app/hw-stage5.js with a minimal stand-in for the Stage 3 kit (no DOM needed for the data). */
function loadStage5() {
  const noop = () => {};
  const kit = new Proxy({ readSafety: () => ({}), saveSafety: async (d) => d, demo: () => false, online: () => false, signedIn: () => false, pid: () => 'main' }, { get: (o, k) => (k in o ? o[k] : noop) });
  const window = { HW3: { kit, ext: {}, state: {}, views: [], ACCOUNT_ONLY: [], render: noop } };
  const ctx = { window, document: { getElementById: () => null, querySelector: () => null, body: { classList: { add: noop, remove: noop } } }, navigator: {}, console, setTimeout, Date, Blob: class {}, URL };
  vm.createContext(ctx);
  vm.runInContext(read('app/hw-stage5.js'), ctx, { filename: 'hw-stage5.js' });
  assert.ok(window.HW5, 'HW5 loaded');
  // Plain copies of the data (objects from the vm realm fail deepEqual on prototype).
  const plain = (x) => JSON.parse(JSON.stringify(x));
  return { ...window.HW5, STEPS: plain(window.HW5.STEPS), SERVICES: plain(window.HW5.SERVICES), PLAN_SERVICES: plain(window.HW5.PLAN_SERVICES) };
}
const HW5 = loadStage5();

/* Verified 19 Oct 2026 on each service's own website (see docs/CONTENT-SOURCES.md). */
const VERIFIED = [
  ['Emergency (Triple Zero)', '000', '000'],
  ['Lifeline', '13 11 14', '131114'],
  ['Suicide Call Back Service', '1300 659 467', '1300659467'],
  ['13YARN', '13 92 76', '139276'],
  ['Kids Helpline', '1800 55 1800', '1800551800'],
  ['Beyond Blue', '1300 22 4636', '1300224636'],
];

test('seven Stanley-Brown steps, in order, matching the server fields and the brief', async () => {
  const { SAFETY_FIELDS } = await import('../server/wellbeing/validate.js');
  assert.deepEqual(HW5.STEPS.map((s) => s.id), [...SAFETY_FIELDS]);
  assert.deepEqual(HW5.STEPS.map((s) => s.title), [
    'My warning signs',
    'Things I can do on my own to cope or distract',
    'People and places that help take my mind off things',
    'People I can ask for help',
    'Professionals and services',
    'Making my space safer',
    'My reasons for living and what matters to me',
  ]);
  const people = HW5.STEPS.find((s) => s.id === 'people');
  assert.ok(people.quickAdd && people.quickAdd.length === 1, 'step 4 has name + phone fields');
  const pro = HW5.STEPS.find((s) => s.id === 'professionals');
  assert.deepEqual(pro.quickAdd.map((q) => q.id), ['gp', 'case'], 'step 5 has GP and caseworker fields');
});

test('step 5 is prefilled with the verified services, and every tel: link dials the number shown', () => {
  assert.deepEqual(HW5.PLAN_SERVICES.map((s) => [s.name, s.num, s.tel]), VERIFIED);
  for (const sv of HW5.SERVICES) {
    assert.match(sv.tel, /^\d{3,10}$/, `${sv.name}: tel is digits only`);
    assert.equal(sv.num.replace(/\s/g, ''), sv.tel, `${sv.name}: shown number and tel: link agree`);
  }
  assert.match(HW5.PLAN_SERVICES.find((s) => s.tel === '1800551800').note, /25/, 'Kids Helpline says it is for under-25s');
});

test('the printed / text / offline copies carry the services and the 000 notice', () => {
  const plan = { warningSigns: ['Not sleeping'], copingThings: [], safePlaces: [], people: ['Sam, 0400 111 222'], professionals: ['GP: Dr Lee, 07 3000 1234'], safeEnvironment: [], reasons: ['My dog'] };
  const text = HW5.planText(plan);
  for (const [name, num] of VERIFIED) assert.ok(text.includes(`${name}: ${num}`), `${name} in the text copy`);
  assert.match(text, /Call 000 if you are in immediate danger/);
  const html = HW5.offlineHtml(plan);
  for (const [, , tel] of VERIFIED) assert.ok(html.includes(`href="tel:${tel}"`), `tel:${tel} in the offline copy`);
  assert.ok(html.includes('href="tel:0400111222"') && html.includes('href="tel:0730001234"'), 'own numbers become tap-to-call');
  assert.match(html, /immediate danger/);
  assert.ok(!html.includes('<script'), 'offline copy has no script');
  const evil = HW5.offlineHtml({ ...plan, reasons: ['<img src=x onerror=alert(1)>'] });
  assert.ok(!evil.includes('<img src=x'), 'plan text is escaped');
});

test('entry points: Get help and the chat crisis card name the suicide prevention plan', () => {
  const html = read('app/index.html');
  assert.match(html, /id="helpSafetyPlanBtn"[^>]*>My safety plan \(suicide prevention\)</);
  assert.match(html, /plan\.textContent = 'My safety plan \(suicide prevention\)'/);
  assert.match(html, /Not a crisis service|crisis/i);
});

test('the plan is never part of what the browser sends to Hope', () => {
  const html = read('app/index.html');
  const start = html.indexOf('function hopeContext(');
  const body = html.slice(start, html.indexOf('\n}\n', start));
  assert.ok(start > 0 && body.length > 100);
  assert.doesNotMatch(body, /safety|readSafety|warningSigns|reasons/i, 'hopeContext has no safety plan data');
  for (const f of ['server/hope-chat.js', 'server/hope-prompts.js']) assert.doesNotMatch(read(f), /getPlans|listSafetyVersions|warningSigns/, `${f} never reads the plan`);
});

test('the safety plan builder never asks for Plus', () => {
  const js = read('app/hw-stage5.js');
  const start = js.indexOf('/* Safety plan builder');
  const end = js.indexOf('/* About you (preferences)');
  const part = js.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(part, /upgrade\(|plusInfo|subscriptionPlus|isPlus|plus\(\)/, 'no Plus gate in the builder');
});

/* ---------------- HTTP, end to end, on the JSON backend ---------------- */

const KEY = crypto.randomBytes(32).toString('base64');
const ENV_KEYS = ['HOPEWICK_DEV', 'NODE_ENV', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'FOUNDER_PLUS_EMAILS', 'PUBLIC_BASE_URL', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'HOPEWICK_DATA_KEY', 'DATABASE_URL'];
const realFetch = globalThis.fetch;

test('free account: the full plan saves and loads, encrypted at rest, and Hope is never sent it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-ssp-'));
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { HOPEWICK_DEV: '1', NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test-hope', HOPEWICK_DATA_KEY: KEY });
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/chat/completions')) {
      calls.push(String(opts.body));
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello from Hope' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
  const { startServer } = await import('../server/index.js');
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const link = await (await realFetch(`${base}/api/auth/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `ssp-${Date.now()}@example.com` }) })).json();
    const cookie = ((await realFetch(link.devLink, { redirect: 'manual' })).headers.get('set-cookie') || '').split(';')[0];
    const u = async (method, route, body) => {
      const res = await realFetch(`${base}${route}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text() };
    };
    const me = await u('GET', '/api/auth/me');
    assert.equal(me.body.signedIn, true);
    assert.equal(me.body.plus, false, 'this account is on the free plan (no Plus, no trial)');
    const plan = {
      warningSigns: ['Thinking "what is the point" sspsecret'],
      copingThings: ['Box breathing'],
      safePlaces: ['The library'],
      people: ['Sam, 0400 111 222'],
      professionals: ['GP: Dr Lee, 07 3000 1234', 'Caseworker: Ana, 0400 333 444'],
      safeEnvironment: ['Medicines with Mum'],
      reasons: ['My dog sspreason'],
    };
    const put = await u('PUT', '/api/me/safety-plan', { profileId: 'main', safety: plan });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const got = (await u('GET', '/api/me/safety-plan?profileId=main')).body.safety;
    for (const [k, v] of Object.entries(plan)) assert.deepEqual(got[k], v, `${k} loads back`);
    const raw = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    assert.ok(!raw.includes('sspsecret') && !raw.includes('Dr Lee'), 'encrypted at rest');
    const chat = await u('POST', '/api/hope/chat', { messages: [{ role: 'user', content: 'Hello' }], context: { profileId: 'main' } });
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    const crisis = await u('POST', '/api/hope/chat', { messages: [{ role: 'user', content: 'I want to kill myself' }], context: { profileId: 'main' } });
    assert.equal(crisis.status, 200);
    assert.ok(calls.length >= 1, 'the model was called');
    for (const c of calls) assert.ok(!c.includes('sspsecret') && !c.includes('sspreason') && !c.includes('Dr Lee'), 'no plan text in any model request');
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => server.close(resolve));
    for (const [k, v] of Object.entries(previous)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
