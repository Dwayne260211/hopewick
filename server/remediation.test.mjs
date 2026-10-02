import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, REPO_ROOT } from './index.js';
import { createStore } from './store.js';
import { isCrisisText } from './hope-chat.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function crisisPattern(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/const CRISIS_RE = \/(.+)\/i;/);
  assert.ok(match, `CRISIS_RE not found in ${file}`);
  return match[1];
}

test('server crisis pattern matches the client pattern', () => {
  const client = crisisPattern(path.join(REPO_ROOT, 'app', 'index.html'));
  const server = crisisPattern(path.join(here, 'hope-chat.js'));
  assert.equal(server, client);
});

test('server crisis pattern covers the audit gap phrases', () => {
  const hits = [
    'I want to die',
    'no reason to live',
    'I might overdose',
    "I od'd last night",
    'I am oding',
    'about to relapse',
    'going to use',
    'extreme craving',
    'the craving is so bad',
    'domestic violence',
    'family violence',
    "he's hurting me",
    'my partner hit me',
    'going to hurt',
    'I will hurt someone',
    'someone is in danger',
    'I am not safe',
  ];
  for (const phrase of hits) {
    assert.equal(isCrisisText(phrase), true, phrase);
  }
  assert.equal(isCrisisText('I had a quiet day and drank water'), false);
});

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function cspFor(nodeEnv) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-csp-'));
  const app = createApp({ store: createStore(path.join(dir, 'users.json')) });
  const server = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    return res.headers.get('content-security-policy') || '';
  } finally {
    process.env.NODE_ENV = previous;
    await new Promise((resolve) => server.close(resolve));
  }
}

test('production CSP drops localhost Azure ports and keeps Google and https', async () => {
  const csp = await cspFor('production');
  assert.equal(csp.includes('localhost:7071'), false);
  assert.equal(csp.includes('127.0.0.1:7071'), false);
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com/);
  assert.match(csp, /frame-src https:\/\/accounts\.google\.com/);
  assert.match(csp, /connect-src 'self' https:/);
  assert.match(csp, /unsafe-inline/);
});

test('non-production CSP still allows the local Azure proxy', async () => {
  const csp = await cspFor('test');
  assert.match(csp, /http:\/\/127\.0\.0\.1:7071/);
  assert.match(csp, /http:\/\/localhost:7071/);
  assert.match(csp, /https:\/\/accounts\.google\.com/);
});
