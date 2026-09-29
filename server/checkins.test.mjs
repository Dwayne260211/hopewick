import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from './index.js';
import {
  createCheckinStore,
  mergeByDate,
  mergeWeeks,
  halfwayWindow,
  MAX_MOOD_DAYS,
  MAX_GOAL_WEEKS,
} from './checkins.js';

function mood(date, label, craving, updated) {
  const emoji = {
    Great: '😄', Good: '🙂', Okay: '😐', Low: '😔', Stressed: '😣', Tired: '😴',
  }[label];
  return { date, mood: label ? { e: emoji, l: label } : null, craving: craving || null, updated };
}

function goal(text) {
  return { specific: text, measurable: '', achievable: '', relevant: '', timebound: '', done: false };
}

test('halfway window is Wednesday to Saturday in Brisbane', () => {
  const tuesday = halfwayWindow(new Date('2026-09-29T02:00:00.000Z'));
  assert.equal(tuesday.show, false);
  assert.equal(tuesday.iso, '2026-09-29');
  assert.equal(tuesday.weekday, 2);
  assert.equal(tuesday.sunday, '2026-09-27');
  assert.equal(tuesday.saturday, '2026-10-03');

  const lateTuesday = halfwayWindow(new Date('2026-09-29T13:00:00.000Z'));
  assert.equal(lateTuesday.show, false);
  assert.equal(lateTuesday.iso, '2026-09-29');

  const wednesday = halfwayWindow(new Date('2026-09-29T15:00:00.000Z'));
  assert.equal(wednesday.show, true);
  assert.equal(wednesday.iso, '2026-09-30');
  assert.equal(wednesday.weekday, 3);
  assert.equal(wednesday.sunday, '2026-09-27');

  const saturday = halfwayWindow(new Date('2026-10-03T10:00:00.000Z'));
  assert.equal(saturday.show, true);
  assert.equal(saturday.iso, '2026-10-03');
  assert.equal(saturday.weekday, 6);

  const sunday = halfwayWindow(new Date('2026-10-03T14:30:00.000Z'));
  assert.equal(sunday.show, false);
  assert.equal(sunday.iso, '2026-10-04');
  assert.equal(sunday.weekday, 0);
  assert.equal(sunday.sunday, '2026-10-04');

  for (const iso of ['2026-09-27', '2026-09-28', '2026-09-29']) {
    const quiet = halfwayWindow(new Date(`${iso}T02:00:00.000Z`));
    assert.equal(quiet.show, false, iso);
  }
});

test('same calendar day keeps the later save, and weeks keep a newer goal with a newer midweek answer', () => {
  const moods = mergeByDate(
    [mood('2026-09-28', 'Low', 'Mild', 2), mood('2026-09-29', 'Good', 'None', 5)],
    [mood('2026-09-28', 'Okay', 'Strong', 4), mood('2026-09-27', 'Tired', 'None', 1)],
    'mood',
  );
  const byDate = Object.fromEntries(moods.map((row) => [row.date, row]));
  assert.equal(byDate['2026-09-28'].mood.l, 'Okay');
  assert.equal(byDate['2026-09-28'].craving, 'Strong');
  assert.equal(byDate['2026-09-29'].mood.l, 'Good');
  assert.equal(byDate['2026-09-27'].mood.l, 'Tired');

  const cleared = mergeByDate(
    [mood('2026-09-29', null, null, 9)],
    [mood('2026-09-29', 'Good', 'Mild', 4)],
    'mood',
  );
  assert.deepEqual(cleared, []);

  const weeks = mergeWeeks(
    {
      '2026-09-27': {
        goals: [goal('local newer walk'), goal('second goal')],
        updated: 20,
        midweek: { answers: ['', ''], updated: 1 },
      },
    },
    {
      '2026-09-27': {
        goals: [goal('remote older walk'), goal('second goal')],
        updated: 10,
        midweek: { answers: ['still', 'letgo'], updated: 30 },
      },
      '2026-09-30': { goals: [goal('not a sunday')], updated: 50 },
    },
  );
  assert.equal(weeks['2026-09-27'].goals[0].specific, 'local newer walk');
  assert.deepEqual(weeks['2026-09-27'].midweek.answers, ['still', 'letgo']);
  assert.equal(weeks['2026-09-30'], undefined);

  const many = {};
  const sunday = new Date(Date.UTC(2024, 0, 7));
  for (let i = 0; i < MAX_GOAL_WEEKS + 8; i++) {
    const iso = sunday.toISOString().slice(0, 10);
    many[iso] = { goals: [goal('week ' + iso), goal('')], updated: i + 1 };
    sunday.setUTCDate(sunday.getUTCDate() + 7);
  }
  const capped = mergeWeeks(many, {});
  const keys = Object.keys(capped).sort();
  assert.equal(keys.length, MAX_GOAL_WEEKS);
  assert.ok(keys.length >= 12);
  assert.equal(keys[0] in many, true);
  assert.equal(Object.keys(many).sort()[0] in capped, false);
});

test('mood history keeps about 400 days', () => {
  const rows = [];
  const start = new Date(Date.UTC(2024, 0, 1));
  for (let i = 0; i < MAX_MOOD_DAYS + 25; i++) {
    const iso = start.toISOString().slice(0, 10);
    rows.push(mood(iso, 'Okay', 'None', i + 1));
    start.setUTCDate(start.getUTCDate() + 1);
  }
  const merged = mergeByDate(rows, [], 'mood');
  assert.equal(merged.length, MAX_MOOD_DAYS);
  assert.equal(merged[0].date, rows[rows.length - MAX_MOOD_DAYS].date);
  assert.equal(merged.at(-1).date, rows.at(-1).date);
});

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-checkins-'));
  const previous = process.env.HOPEWICK_DEV;
  process.env.HOPEWICK_DEV = '1';
  process.env.NODE_ENV = 'test';
  const storePath = path.join(dir, 'users.json');
  const checkinsPath = path.join(dir, 'checkins.json');
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    storePath,
    chatsPath: path.join(dir, 'chats.json'),
    checkinsPath,
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    storePath,
    checkinsPath,
    async close() {
      if (previous == null) delete process.env.HOPEWICK_DEV;
      else process.env.HOPEWICK_DEV = previous;
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function signIn(base, email) {
  const sent = await fetch(`${base}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await sent.json();
  assert.equal(sent.status, 200);
  const verified = await fetch(data.devLink, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  return (verified.headers.get('set-cookie') || '').split(';')[0];
}

const sampleGoals = {
  weeks: {
    '2026-09-27': {
      goals: [goal('Walk after dinner'), goal('Text one mate')],
      updated: 40,
      midweek: { answers: ['still', 'change'], updated: 41 },
    },
  },
};

test('signed-in check-ins stay on that account and a second profile is separate', async () => {
  const app = await boot();
  try {
    const bare = await fetch(`${app.base}/api/checkins`);
    assert.equal(bare.status, 401);

    const ada = await signIn(app.base, 'ada@example.com');
    const put = await fetch(`${app.base}/api/checkins`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: ada },
      body: JSON.stringify({
        profileId: 'ada1',
        name: 'Ada',
        moods: [mood('2026-09-28', 'Good', 'Mild', 3)],
        gratitude: [{ date: '2026-09-28', items: ['Quiet morning'], ts: 3, updated: 3 }],
        goals: sampleGoals,
      }),
    });
    assert.equal(put.status, 200);
    const saved = await put.json();
    assert.equal(saved.profile.moods[0].mood.l, 'Good');
    assert.equal(saved.profile.goals.weeks['2026-09-27'].midweek.answers[1], 'change');

    const later = await fetch(`${app.base}/api/checkins`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: ada },
      body: JSON.stringify({
        profileId: 'ada1',
        name: 'Ada',
        moods: [mood('2026-09-28', 'Low', 'Strong', 8)],
        gratitude: [],
        goals: { weeks: {} },
      }),
    });
    const merged = await later.json();
    assert.equal(merged.profile.moods[0].mood.l, 'Low');
    assert.equal(merged.profile.moods[0].craving, 'Strong');
    assert.equal(merged.profile.gratitude[0].items[0], 'Quiet morning');
    assert.equal(merged.profile.goals.weeks['2026-09-27'].goals[0].specific, 'Walk after dinner');

    const otherProfile = await fetch(`${app.base}/api/checkins`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: ada },
      body: JSON.stringify({
        profileId: 'ada2',
        name: 'Ada two',
        moods: [mood('2026-09-28', 'Tired', 'None', 2)],
        gratitude: [],
        goals: { weeks: {} },
      }),
    });
    assert.equal(otherProfile.status, 200);

    const listed = await (await fetch(`${app.base}/api/checkins`, { headers: { cookie: ada } })).json();
    const ada1 = listed.profiles.find((profile) => profile.id === 'ada1');
    const ada2 = listed.profiles.find((profile) => profile.id === 'ada2');
    assert.equal(ada1.moods[0].mood.l, 'Low');
    assert.equal(ada2.moods[0].mood.l, 'Tired');
    assert.equal(JSON.stringify(ada2).includes('Walk after dinner'), false);

    const beau = await signIn(app.base, 'beau@example.com');
    const hidden = await (await fetch(`${app.base}/api/checkins`, { headers: { cookie: beau } })).json();
    assert.deepEqual(hidden.profiles, []);
    const stolen = await fetch(`${app.base}/api/checkins`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: beau },
      body: JSON.stringify({ profileId: 'ada1', name: 'Beau', moods: [], gratitude: [], goals: { weeks: {} } }),
    });
    const beauSaved = await stolen.json();
    assert.equal(beauSaved.profile.moods.length, 0);
    const stillAda = await (await fetch(`${app.base}/api/checkins`, { headers: { cookie: ada } })).json();
    assert.equal(stillAda.profiles.find((profile) => profile.id === 'ada1').moods[0].mood.l, 'Low');

    const card = await fetch(`${app.base}/api/checkins`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: ada },
      body: JSON.stringify({ profileId: 'ada1', cvc: '123', cardNumber: '4242424242424242' }),
    });
    assert.equal(card.status, 400);

    const users = fs.readFileSync(app.storePath, 'utf8');
    assert.equal(users.includes('Walk after dinner'), false);
    assert.equal(users.includes('Quiet morning'), false);
  } finally {
    await app.close();
  }
});

test('forget drops only that account', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopewick-checkin-forget-'));
  try {
    const file = path.join(dir, 'checkins.json');
    const store = createCheckinStore(file);
    store.merge('user-a', 'p1', {
      name: 'A',
      moods: [mood('2026-09-28', 'Good', 'None', 1)],
      goals: sampleGoals,
    });
    store.merge('user-b', 'p2', {
      name: 'B',
      moods: [mood('2026-09-28', 'Low', 'Mild', 2)],
      goals: { weeks: { '2026-09-27': { goals: [goal('Beau goal'), goal('Second')], updated: 3 } } },
    });
    assert.equal(store.forget(''), false);
    assert.equal(store.forget('missing'), false);
    assert.equal(store.forget('user-a'), true);
    assert.equal(store.forget('user-a'), false);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(disk.users['user-a'], undefined);
    assert.equal(disk.users['user-b'].profiles.p2.goals.weeks['2026-09-27'].goals[0].specific, 'Beau goal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleting an account erases that account’s check-ins and goals and leaves the other', async () => {
  const app = await boot();
  try {
    const cookieA = await signIn(app.base, 'ada@example.com');
    const cookieB = await signIn(app.base, 'beau@example.com');
    const meA = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: cookieA } })).json();
    const meB = await (await fetch(`${app.base}/api/auth/me`, { headers: { cookie: cookieB } })).json();

    async function save(cookie, profileId, text) {
      const res = await fetch(`${app.base}/api/checkins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          profileId,
          name: profileId,
          moods: [mood('2026-09-29', 'Okay', 'Moderate', 12)],
          gratitude: [{ date: '2026-09-29', items: [text], updated: 12 }],
          goals: { weeks: { '2026-09-27': { goals: [goal(text), goal('Other ' + text)], updated: 12 } } },
        }),
      });
      assert.equal(res.status, 200);
    }
    await save(cookieA, 'ada1', 'gratitude from Ada');
    await save(cookieB, 'beau1', 'gratitude from Beau');

    const unconfirmed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'delete' }),
    });
    assert.equal(unconfirmed.status, 400);
    let disk = JSON.parse(fs.readFileSync(app.checkinsPath, 'utf8'));
    assert.ok(disk.users[meA.id]);
    assert.ok(disk.users[meB.id]);

    const removed = await fetch(`${app.base}/api/account/delete`, {
      method: 'POST',
      headers: { cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(removed.status, 200);
    const body = await removed.json();
    assert.equal(body.deleted.includes('Check-ins and weekly goals on this server for this account'), true);
    assert.equal(body.kept.some((line) => /check-in/i.test(line) && /server/i.test(line)), false);

    disk = JSON.parse(fs.readFileSync(app.checkinsPath, 'utf8'));
    assert.equal(Object.hasOwn(disk.users, meA.id), false);
    assert.equal(disk.users[meB.id].profiles.beau1.goals.weeks['2026-09-27'].goals[0].specific, 'gratitude from Beau');
    assert.equal(disk.users[meB.id].profiles.beau1.gratitude[0].items[0], 'gratitude from Beau');

    const listed = await (await fetch(`${app.base}/api/checkins`, { headers: { cookie: cookieB } })).json();
    const texts = listed.profiles.flatMap((profile) => [
      ...profile.gratitude.flatMap((row) => row.items),
      ...Object.values(profile.goals.weeks).flatMap((week) => week.goals.map((item) => item.specific)),
    ]);
    assert.deepEqual(texts.filter((text) => text.includes('Ada')), []);
    assert.ok(texts.includes('gratitude from Beau'));
    const gone = await fetch(`${app.base}/api/checkins`, { headers: { cookie: cookieA } });
    assert.equal(gone.status, 401);
  } finally {
    await app.close();
  }
});
