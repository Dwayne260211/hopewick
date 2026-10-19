import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-wellknown-'));
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    storePath: path.join(dir, 'users.json'),
    chatsPath: path.join(dir, 'chats.json'),
    checkinsPath: path.join(dir, 'checkins.json'),
    visitsPath: path.join(dir, 'visits.json'),
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('/.well-known/assetlinks.json is served as JSON with the Play signing and upload keys', async () => {
  const app = await boot();
  try {
    const res = await fetch(`${app.base}/.well-known/assetlinks.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^application\/json/);
    const body = await res.json();
    assert.equal(body[0].target.namespace, 'android_app');
    assert.equal(body[0].target.package_name, 'com.bridgebite.hopewick');
    assert.deepEqual(body[0].relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(body[0].target.sha256_cert_fingerprints.length, 2);
  } finally {
    await app.close();
  }
});

test('every other dot-path stays blocked', async () => {
  const app = await boot();
  try {
    for (const p of [
      '/.env',
      '/.env.example',
      '/.git/config',
      '/.dockerignore',
      '/.github/',
      '/.well-known/',
      '/.well-known/other.json',
      '/.well-known/../.env',
      '/.well-known/%2e%2e/.env',
      '/app/.hidden',
    ]) {
      const res = await fetch(`${app.base}${p}`);
      assert.equal(res.status, 404, p);
    }
  } finally {
    await app.close();
  }
});
