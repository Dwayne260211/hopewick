/**
 * Anger and Relationships focus areas, recovery stage preference, Body basics and
 * Share with my worker (app/hw-care.js). Data and server rules only; the browser
 * flows are covered by tests/test_recovery_stage_care.py.
 * Run: node --test tests/recovery-stage-care.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FOCUS_AREAS, RECOVERY_STAGES, normalizePreferencesPatch, mergePreferences, readPreferences, defaultPreferences } from '../server/wellbeing/personal.js';
import { applyPreferences, chatSystemPrompt, normalizeContext } from '../server/hope-prompts.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('anger and relationships are focus areas, and the stage is a saved preference', () => {
  assert.ok(FOCUS_AREAS.includes('anger') && FOCUS_AREAS.includes('relationships'));
  assert.deepEqual([...RECOVERY_STAGES], ['week', 'month', 'early', 'later', 'unsure']);
  assert.equal(defaultPreferences().recoveryStage, '');
  const patch = normalizePreferencesPatch({ focusAreas: ['relationships', 'anger'], recoveryStage: 'week' });
  assert.deepEqual(patch.focusAreas, ['anger', 'relationships']);
  const merged = mergePreferences(null, patch);
  assert.equal(readPreferences(merged).recoveryStage, 'week');
  assert.equal(readPreferences({ recoveryStage: 'bogus' }).recoveryStage, '');
  assert.throws(() => normalizePreferencesPatch({ recoveryStage: 'year' }));
  assert.equal(normalizePreferencesPatch({ recoveryStage: '' }).recoveryStage, '');
});

test('Hope is told the chosen topics and stage, and the safety footer stays', () => {
  const ctx = applyPreferences(normalizeContext({ mode: 'friend' }), { focusAreas: ['anger', 'relationships'], recoveryStage: 'week', tone: 'gentle' });
  const p = chatSystemPrompt(ctx);
  assert.match(p, /anger/);
  assert.match(p, /relationships/);
  assert.match(p, /first week of recovery/);
  assert.match(p, /13 11 14/);
});

test('the browser lists the same focus areas and stages as the server', () => {
  const s5 = read('app/hw-stage5.js');
  for (const id of FOCUS_AREAS) assert.match(s5, new RegExp(`id: '${id}'`));
  for (const id of RECOVERY_STAGES) assert.match(s5, new RegExp(`id: '${id}'`));
});

test('new screens carry the safety line, the GP note and the share privacy wording', () => {
  const c = read('app/hw-care.js');
  assert.match(c, /'Not a crisis service\. In crisis\? Call ', h\('a', \{ href: 'tel:000'/);
  assert.match(c, /Talk to your GP or a health professional for advice that fits you\./);
  assert.match(c, /Only you choose what to share\. Nothing is sent unless you send it\./);
  assert.match(c, /journal: false/, 'journal entries are off by default');
  assert.doesNotMatch(c, /fetch\(|api\('(POST|PATCH|PUT)'/, 'share and body basics never send data');
});
