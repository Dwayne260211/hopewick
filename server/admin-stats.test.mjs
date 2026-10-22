import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import { isTestAccount, accountStats, tokenMatches } from './admin-stats.js';
import { brisbaneDay, utmKey, createDailyVisits } from './visit-stats.js';

const TOKEN = 'a'.repeat(20) + 'b'.repeat(30);

async function boot({ token, users = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-stats-'));
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify({ users }));
  const prev = process.env.HOPEWICK_STATS_TOKEN;
  if (token) process.env.HOPEWICK_STATS_TOKEN = token; else delete process.env.HOPEWICK_STATS_TOKEN;
  const server = await startServer({ port: 0, host: '127.0.0.1', storePath: path.join(dir, 'users.json') });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, dir,
    async close() {
      await new Promise((r) => server.close(r));
      if (prev === undefined) delete process.env.HOPEWICK_STATS_TOKEN; else process.env.HOPEWICK_STATS_TOKEN = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const now = new Date().toISOString();
const USERS = [
  { id: '1', email: 'real.person@example.com', createdAt: now, subscriptionStatus: 'active', stripeCustomerId: 'cus_1' },
  { id: '2', email: 'other@example.com', createdAt: '2020-01-01T00:00:00Z', subscriptionStatus: 'trialing', billingProvider: 'google_play' },
  { id: '3', email: 'admin+hwtest1@bridge-bite-co.com', createdAt: now, subscriptionStatus: 'active' },
  { id: '4', email: 'ADMIN+x@Bridge-Bite-Co.com', createdAt: now },
  { id: '5', email: 'admin@bridge-bite-co.com', createdAt: now },
];

test('test-account rule matches only admin+*@bridge-bite-co.com', () => {
  assert.equal(isTestAccount('admin+abc@bridge-bite-co.com'), true);
  assert.equal(isTestAccount('admin@bridge-bite-co.com'), false);
  assert.equal(isTestAccount('admin+abc@bridge-bite-co.com.evil.com'), false);
  assert.equal(isTestAccount('xadmin+abc@bridge-bite-co.com'), false);
});

test('accountStats excludes test accounts and counts Plus by provider', () => {
  const s = accountStats(USERS);
  assert.equal(s.totalAccounts, 3);
  assert.equal(s.testAccountsExcluded, 2);
  assert.equal(s.signupsPerDay.at(-1).day, brisbaneDay());
  assert.equal(s.signupsPerDay.at(-1).count, 2);
  assert.deepEqual(s.plus.stripe, { paid: 1, trial: 0 });
  assert.deepEqual(s.plus.googlePlay, { paid: 0, trial: 1 });
});

test('Brisbane day boundary and utm key', () => {
  assert.equal(brisbaneDay(new Date('2026-10-21T14:30:00Z')), '2026-10-22');
  assert.equal(brisbaneDay(new Date('2026-10-21T13:59:00Z')), '2026-10-21');
  assert.equal(utmKey(new URLSearchParams('utm_source=FB&utm_campaign=test_oct26')), 'fb||test_oct26');
  assert.equal(utmKey(new URLSearchParams('x=1')), '');
  assert.equal(tokenMatches('abc', 'abc'), true);
  assert.equal(tokenMatches('abd', 'abc'), false);
  assert.equal(tokenMatches('', 'abc'), false);
});

test('daily visits persist counts only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-daily-'));
  const f = path.join(dir, 'visits-daily.json');
  const d = createDailyVisits(f, { flushMs: 0 });
  d.record('/our-story.html', new URLSearchParams('utm_source=ig&utm_medium=social&utm_campaign=test_oct26'));
  d.record('/index.html', new URLSearchParams(''));
  const today = d.days(1)[0];
  assert.equal(today.total, 2);
  assert.equal(today.pages['/our-story.html'], 1);
  assert.deepEqual(today.utm, [{ source: 'ig', medium: 'social', campaign: 'test_oct26', count: 1 }]);
  const again = createDailyVisits(f, { flushMs: 0 }).days(1)[0];
  assert.equal(again.total, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('stats endpoint is 404 when the token env var is unset', async () => {
  const app = await boot({ users: USERS });
  try {
    const r = await fetch(`${app.base}/api/admin/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(r.status, 404);
  } finally { await app.close(); }
});

test('stats endpoint: 401 without/with wrong token, 200 counts-only with token, no CORS', async () => {
  const app = await boot({ token: TOKEN, users: USERS });
  try {
    assert.equal((await fetch(`${app.base}/api/admin/stats`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/admin/stats`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    const ua = { 'User-Agent': 'Mozilla/5.0 test' };
    await fetch(`${app.base}/our-story.html?utm_source=ig&utm_campaign=test_oct26`, { headers: ua });
    await fetch(`${app.base}/`, { headers: ua });
    await fetch(`${app.base}/nope.html`, { headers: ua });
    await fetch(`${app.base}/`, { headers: { 'User-Agent': 'Googlebot' } });
    const r = await fetch(`${app.base}/api/admin/stats`, { headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'capacitor://localhost' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    const text = await r.text();
    assert.ok(!/example\.com|hwtest1|cus_1|"id"|email/i.test(text), 'no emails or ids');
    const body = JSON.parse(text);
    assert.equal(body.totalAccounts, 3);
    assert.equal(body.testAccountsExcluded, 2);
    const today = body.visitsPerDay.at(-1);
    assert.equal(today.total, 2);
    assert.equal(today.pages['/our-story.html'], 1);
    assert.equal(today.pages['/index.html'], 1);
    assert.equal(today.utm[0].campaign, 'test_oct26');
  } finally { await app.close(); }
});

test('stats endpoint is rate limited', async () => {
  process.env.HOPEWICK_STATS_LIMIT = '3';
  const app = await boot({ token: TOKEN });
  try {
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await fetch(`${app.base}/api/admin/stats`, { headers: { Authorization: `Bearer ${TOKEN}`, 'X-Forwarded-For': '198.51.100.9' } })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  } finally { delete process.env.HOPEWICK_STATS_LIMIT; await app.close(); }
});
