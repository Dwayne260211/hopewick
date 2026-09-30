import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer, REPO_ROOT } from './index.js';
import { createVisitCounter } from './visits.js';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-visits-'));
  const visitsPath = path.join(dir, 'visits.json');
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    storePath: path.join(dir, 'users.json'),
    chatsPath: path.join(dir, 'chats.json'),
    checkinsPath: path.join(dir, 'checkins.json'),
    visitsPath,
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    visitsPath,
    async close() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('POST /api/visit counts from zero and stores only the number', async () => {
  const app = await boot();
  try {
    assert.deepEqual(JSON.parse(fs.readFileSync(app.visitsPath, 'utf8')), { visits: 0 });

    const first = await fetch(`${app.base}/api/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: app.base },
      body: JSON.stringify({ email: 'person@example.com', name: 'Pat', ip: '203.0.113.5' }),
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { visits: 1 });

    const second = await fetch(`${app.base}/api/visit`, { method: 'POST' });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { visits: 2 });

    const stored = JSON.parse(fs.readFileSync(app.visitsPath, 'utf8'));
    assert.deepEqual(stored, { visits: 2 });
    const raw = fs.readFileSync(app.visitsPath, 'utf8');
    assert.equal(raw.includes('example.com'), false);
    assert.equal(raw.includes('203.0.113.5'), false);
    assert.equal(raw.includes('Pat'), false);

    const ignored = await fetch(`${app.base}/api/visit`);
    assert.equal(ignored.status, 404);
    assert.equal(JSON.parse(fs.readFileSync(app.visitsPath, 'utf8')).visits, 2);

    const blocked = await fetch(`${app.base}/api/visit`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(blocked.status, 403);
    assert.equal(JSON.parse(fs.readFileSync(app.visitsPath, 'utf8')).visits, 2);

    const home = await fetch(`${app.base}/`);
    const appPage = await fetch(`${app.base}/app/`);
    assert.equal(home.status, 200);
    assert.equal(appPage.status, 200);
    const homeHtml = await home.text();
    const appHtml = await appPage.text();
    assert.match(homeHtml, /hopewick\.visit\.home/);
    assert.match(appHtml, /hopewick\.visit\.app/);
    assert.equal(homeHtml.includes('id="visit'), false);
    assert.equal(appHtml.includes('id="visit'), false);
    assert.equal(JSON.parse(fs.readFileSync(app.visitsPath, 'utf8')).visits, 2);
  } finally {
    await app.close();
  }
});

test('the count survives a restart of the counter on the same file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-visits-restart-'));
  const file = path.join(dir, 'visits.json');
  try {
    const first = createVisitCounter(file);
    assert.equal(first.count(), 0);
    assert.equal(first.increment(), 1);
    const again = createVisitCounter(file);
    assert.equal(again.count(), 1);
    assert.equal(again.increment(), 2);
    fs.writeFileSync(file, '{}\n');
    const reset = createVisitCounter(file);
    assert.equal(reset.count(), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('homepage and app count a landing once per tab and do not show the number', () => {
  const pages = [
    [path.join(REPO_ROOT, 'index.html'), 'hopewick.visit.home'],
    [path.join(REPO_ROOT, 'app', 'index.html'), 'hopewick.visit.app'],
  ];
  for (const [file, key] of pages) {
    const html = fs.readFileSync(file, 'utf8');
    const snippet = html.split('First-party visit count')[1].split('</script>')[0];
    assert.match(snippet, /sessionStorage\.getItem\(key\)/);
    assert.match(snippet, /sessionStorage\.setItem\(key, '1'\)/);
    assert.ok(snippet.includes(key));
    assert.match(snippet, /fetch\('\/api\/visit', \{ method: 'POST'/);
    assert.equal(snippet.includes('textContent'), false);
    assert.equal(snippet.includes('innerHTML'), false);
    assert.equal(snippet.includes('.visits'), false);
  }
});
