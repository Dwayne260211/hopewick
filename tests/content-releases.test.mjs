// Content release schedule: free dates, badges, and what a free account may see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, normalizeReleases, statusFor, publicItem, createReleaseCatalog, loadReleases } from '../server/content-releases.js';

const base = { kind: 'journal-pack', key: 'p', title: 'Pack', teaser: 'A teaser', content: { prompts: [{ title: 'a', text: 'b' }] } };

test('the shipped schedule is valid', () => {
  const items = loadReleases();
  assert.ok(items.length >= 13);
  for (const it of items.filter((x) => !x.core)) {
    assert.ok(it.freeReleaseDate >= addMonths(it.plusReleaseDate, 6) && it.freeReleaseDate <= addMonths(it.plusReleaseDate, 12), it.id);
  }
});

test('free date defaults to Plus + 6 months and must be 6 to 12 months later', () => {
  const [a] = normalizeReleases({ items: [{ ...base, id: 'p-a', plusReleaseDate: '2026-08-31' }] });
  assert.equal(a.freeReleaseDate, '2027-02-28', 'end of a short month is clamped');
  assert.equal(normalizeReleases({ items: [{ ...base, id: 'p-b', plusReleaseDate: '2026-10-18', freeReleaseDate: '2027-10-18' }] })[0].freeReleaseDate, '2027-10-18');
  assert.throws(() => normalizeReleases({ items: [{ ...base, id: 'p-c', plusReleaseDate: '2026-10-18', freeReleaseDate: '2027-01-18' }] }), /6 to 12 months/);
  assert.throws(() => normalizeReleases({ items: [{ ...base, id: 'p-d', plusReleaseDate: '2026-10-18', freeReleaseDate: '2027-10-19' }] }), /6 to 12 months/);
  assert.throws(() => normalizeReleases({ items: [{ ...base, id: 'p-e', plusReleaseDate: '2026-10-18' }, { ...base, id: 'p-e', plusReleaseDate: '2026-10-18' }] }), /twice/);
  assert.throws(() => normalizeReleases({ items: [{ ...base, kind: 'coping', key: 'not-a-tool', id: 'c-x', plusReleaseDate: '2026-10-18', content: { steps: [{}, {}] } }] }), /COPING_TOOLS/);
});

test('Plus from the Plus date, free from the free date, nobody before; badges', () => {
  const [it] = normalizeReleases({ items: [{ ...base, id: 'p-f', plusReleaseDate: '2026-10-20' }] });
  assert.equal(statusFor(it, { plus: true, today: '2026-10-19' }).visible, false);
  assert.equal(publicItem(it, { plus: true, today: '2026-10-19' }), null, 'unreleased items are not listed');
  const plusDay = statusFor(it, { plus: true, today: '2026-10-20' });
  assert.equal(plusDay.available, true);
  assert.equal(plusDay.newForPlus, true);
  assert.equal(plusDay.comingToFree, 'April 2027');
  assert.equal(statusFor(it, { plus: true, today: '2026-10-27' }).newForPlus, false, 'new for one week');
  const free = publicItem(it, { plus: false, today: '2026-10-21' });
  assert.equal(free.available, false);
  assert.deepEqual(Object.keys(free).filter((k) => k === 'content'), [], 'locked: title and teaser only');
  assert.equal(statusFor(it, { plus: false, today: '2027-04-20' }).available, true);
  assert.equal(statusFor(it, { plus: false, today: '2027-04-20' }).comingToFree, null);
});

test('core items are free from day one and carry no badges', () => {
  const cat = createReleaseCatalog({ items: [{ id: 'coping-box', kind: 'coping', key: 'breathing-box', title: 'Box', teaser: 't', plusReleaseDate: '2026-10-18', core: true }] });
  const [x] = cat.list({ plus: false, today: '2026-10-18' });
  assert.equal(x.available, true);
  assert.deepEqual(x.badges, { newForPlus: false, comingToFree: null });
  assert.equal(cat.allows('coping', 'breathing-box', { plus: false, today: '2026-10-18' }), true);
  assert.equal(cat.allows('coping', 'urge-surfing', { plus: false }), true, 'tools not on the schedule are core');
  assert.equal(cat.allows('journal-pack', 'unknown', { plus: true }), false);
});
