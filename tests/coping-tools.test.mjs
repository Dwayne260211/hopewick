// The coping toolkit content (app/data/coping-tools.js) must match the server's
// allowed tool keys and activity types, and keep its safety wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { COPING_TOOLS } from '../server/wellbeing/validate.js';

const src = fs.readFileSync(new URL('../app/data/coping-tools.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const tools = sandbox.window.HW_COPING_TOOLS;

test('every toolkit entry is a server-known key with the same type', () => {
  assert.ok(Array.isArray(tools) && tools.length === Object.keys(COPING_TOOLS).length);
  for (const t of tools) {
    assert.equal(COPING_TOOLS[t.key], t.type, t.key);
    assert.ok(t.title && t.intro && t.steps.length >= 2, t.key);
    for (const s of t.steps) assert.ok(s.title && s.text, `${t.key} step`);
  }
  assert.deepEqual(new Set(tools.map((t) => t.key)), new Set(Object.keys(COPING_TOOLS)));
});

test('DBT-informed tools are labelled, breathing tools have a pattern, no therapy or diagnosis claims', () => {
  const byKey = Object.fromEntries(tools.map((t) => [t.key, t]));
  assert.equal(byKey.tipp.badge, 'DBT-informed');
  assert.equal(byKey['stop-skill'].badge, 'DBT-informed');
  for (const k of ['breathing-box', 'breathing-calm']) assert.ok(byKey[k].breath && byKey[k].breath.rounds > 0);
  const all = JSON.stringify(tools).toLowerCase();
  assert.ok(!/\bdiagnos/.test(all));
  assert.ok(!/this is therapy|cure/.test(all));
});
