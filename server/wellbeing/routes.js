/**
 * /api/me/* routes for Stage 3 (check-ins, coping activities, personal goals,
 * journal, plans, safety plan essentials, My Next Step, weekly plans, monthly
 * insights, printable report, export, delete, consent settings, one-time
 * browser import).
 *
 * - The account id always comes from the session, never from the request.
 * - Always free, never capped: the daily check-in, basic coping tools, My Next
 *   Step, safety plan essentials, basic journal entries, settings, and
 *   reading, exporting and deleting everything you saved.
 * - Free accounts see the last HISTORY_WINDOW_DAYS days in the app; older
 *   items are counted, kept, exported and deletable (server/wellbeing/plan-rules.js).
 * - Hopewick Plus: full history, monthly insights, the printable report,
 *   weekly multi-step plans, journal refinements (gratitude and recovery entry
 *   types, guided series and prompt packs, Deepen with Hope), personal goals
 *   (with SMART goals), relapse/exit plan editing, and early access to new
 *   content (server/content-releases.js). All checked here, on the server.
 * - Plan status never deletes anything. Lapsed Plus keeps all its data.
 * - Crisis help never depends on any of this.
 */
import {
  ValidationError, NotFoundError, LIMITS, LEGACY_MOOD_SCORE, profileOf, assertDate, validDate, assertId,
  normalizeCheckin, normalizeActivityStart, normalizeActivityPatch, normalizeGoal, normalizeJournal,
  normalizeLegacyJournal, normalizePlans, normalizeStep, normalizeSettingsPatch,
  normalizeWeeklyPlan, normalizeSafety, brisbaneToday,
} from './validate.js';
import {
  FREE_JOURNAL_KINDS, applyWindow, checkinDate, journalDate, activityDate, stepDate, brisbaneDateOf,
} from './plan-rules.js';
import { addIsoDays } from '../checkins.js';

const PLUS_MESSAGES = {
  journal: 'Writing in the journal stays free. Gratitude and recovery entry types, guided series and prompt packs, and Deepen with Hope are part of Hopewick Plus.',
  pack: 'This guided series or prompt pack is in Hopewick Plus first. It comes to the free plan later.',
  coping: 'This coping tool is in Hopewick Plus first. It comes to the free plan later. Every other tool in the toolkit is free.',
  weekly: 'Weekly multi-step plans are part of Hopewick Plus. Your single next step stays free, and you can still read, export and delete plans you already made.',
  insights: 'Monthly insights are part of Hopewick Plus. Your check-ins, export and the last 7 days of history stay free.',
  report: 'The printable mood and recovery report is part of Hopewick Plus. You can always export all of your data for free.',
  goals: 'Personal goals are part of Hopewick Plus, like SMART goals. You can still see and delete goals you already saved.',
};

async function readJsonBody(req, readBody, limit) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw new ValidationError('Send the data as JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Send the data as a JSON object.');
  return body;
}

function journalMatches(e, { q, from, to, kind }) {
  if (kind && e.kind !== kind) return false;
  const d = e.entryDate || String(e.createdAt || '').slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  if (q) {
    const hay = `${e.title}\n${e.body}\n${e.refined}\n${e.prompt}\n${e.emotions}`.toLowerCase();
    if (!q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function journalMarkdown(entries, { name = '' } = {}) {
  const lines = [`# Hopewick journal${name ? ` — ${name}` : ''}`, '', `Exported ${new Date().toISOString().slice(0, 10)}. Private: keep this file somewhere safe.`, ''];
  const kinds = { free: 'Entry', prompt: 'Reflection prompt', gratitude: 'Gratitude', recovery: 'Recovery reflection' };
  for (const e of entries) {
    lines.push(`## ${e.entryDate || String(e.createdAt).slice(0, 10)} · ${e.title || kinds[e.kind] || 'Entry'}`, '');
    lines.push(`_${kinds[e.kind] || 'Entry'}_`, '');
    if (e.prompt) lines.push(`> ${e.prompt}`, '');
    lines.push(e.body, '');
    if (e.refined) lines.push('**Deepened reflection**', '', e.refined, '');
    if (e.emotions) lines.push(`Emotions noticed: ${e.emotions}`, '');
  }
  return lines.join('\n');
}

/** Legacy check-ins from checkins.json for days that have no new-style check-in. */
function legacyDays(checkins, userId, profileId, haveDates) {
  if (!checkins || typeof checkins.list !== 'function') return [];
  const row = (checkins.list(userId) || []).find((p) => p && p.id === profileId);
  if (!row) return [];
  return (row.moods || [])
    .filter((m) => m && validDate(m.date) && !haveDates.has(m.date) && (m.mood || m.craving))
    .map((m) => ({
      date: m.date,
      moodLabel: m.mood ? m.mood.l : null,
      mood: m.mood ? (LEGACY_MOOD_SCORE[m.mood.l] ?? null) : null,
      craving: m.craving || null,
      legacy: true,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

const DELETE_AREAS = Object.freeze(['checkins', 'journal', 'activities', 'goals', 'steps', 'weekly-plans', 'plans', 'all']);

async function exportAll(ctx, uid, profileId) {
  const w = ctx.wellbeing;
  const [settings, checkins, activities, goals, journal, plans, steps, weeklyPlans] = await Promise.all([
    w.getSettings(uid), w.listCheckins(uid, profileId, {}), w.listActivities(uid, profileId, { limit: LIMITS.activities }), w.listGoals(uid, profileId),
    w.listJournal(uid, profileId), w.getPlans(uid, profileId), w.listSteps(uid, profileId), w.listWeeklyPlans(uid, profileId),
  ]);
  const have = new Set(checkins.map((c) => c.date));
  return {
    app: 'Hopewick', exportedAt: new Date().toISOString(), profileId,
    note: 'Everything Hopewick has saved for this profile. Private: keep this file somewhere safe.',
    settings, checkins, olderCheckins: legacyDays(ctx.checkins, uid, profileId, have),
    activities, goals, journal, plans: plans || null, nextSteps: steps, weeklyPlans,
  };
}

const inRange = (d, from, to) => d && d >= from && d <= to;
function countBy(list, fn) {
  const out = {};
  for (const x of list) { const k = fn(x); if (k != null && k !== '') out[k] = (out[k] || 0) + 1; }
  return out;
}
const avg = (nums) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null);

/** Descriptive counts over a date range. No scores about the person, no diagnosis. */
async function summarise(wellbeing, uid, profileId, from, to) {
  const [checkins, activities, goals, journal, steps, weekly] = await Promise.all([
    wellbeing.listCheckins(uid, profileId, { from, to }), wellbeing.listActivities(uid, profileId, { limit: LIMITS.activities }),
    wellbeing.listGoals(uid, profileId), wellbeing.listJournal(uid, profileId), wellbeing.listSteps(uid, profileId), wellbeing.listWeeklyPlans(uid, profileId),
  ]);
  const done = activities.filter((a) => a.status === 'completed' && inRange(brisbaneDateOf(a.completedAt), from, to));
  const triggers = {};
  for (const c of checkins) for (const t of c.triggers || []) triggers[t] = (triggers[t] || 0) + 1;
  const weeklyStepsDone = weekly.reduce((n, p) => n + (p.steps || []).filter((s) => s.done && inRange(brisbaneDateOf(s.doneAt), from, to)).length, 0);
  return {
    from, to,
    checkins: {
      days: checkins.length,
      moods: countBy(checkins, (c) => c.moodLabel),
      averageMood: avg(checkins.map((c) => c.mood).filter((n) => Number.isFinite(n))),
      averageIntensity: avg(checkins.map((c) => c.intensity).filter((n) => Number.isFinite(n))),
      cravings: countBy(checkins, (c) => c.craving),
      topTriggers: Object.entries(triggers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count })),
    },
    coping: {
      completed: done.length,
      helpful: done.filter((a) => a.helpful === 'yes').length,
      somewhat: done.filter((a) => a.helpful === 'somewhat').length,
      byTool: Object.entries(countBy(done, (a) => a.toolKey)).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
    },
    journal: { entries: journal.filter((e) => inRange(journalDate(e), from, to)).length },
    goals: { completed: goals.filter((g) => g.status === 'completed' && inRange(brisbaneDateOf(g.completedAt), from, to)).length, active: goals.filter((g) => g.status === 'active').length },
    nextSteps: { done: steps.filter((s) => s.status === 'done' && inRange(brisbaneDateOf(s.completedAt), from, to)).length },
    weeklyPlans: { stepsDone: weeklyStepsDone },
    _checkins: checkins,
  };
}

function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

/** Plain sentences that only describe what was saved. */
export function insightLines(s) {
  const lines = [];
  if (!s.checkins.days) lines.push('No check-ins saved in this period yet. A check-in takes about a minute whenever you are ready.');
  else {
    lines.push(`You checked in on ${plural(s.checkins.days, 'day')}.`);
    const top = Object.entries(s.checkins.moods).sort((a, b) => b[1] - a[1])[0];
    if (top) lines.push(`The mood you picked most often was "${top[0]}" (${plural(top[1], 'day')}).`);
    if (s.checkins.topTriggers.length) lines.push(`What came up most: ${s.checkins.topTriggers.slice(0, 3).map((t) => `${t.name} (${t.count})`).join(', ')}.`);
    const strong = (s.checkins.cravings.Strong || 0) + (s.checkins.cravings.Moderate || 0);
    if (strong) lines.push(`You noted moderate or strong cravings on ${plural(strong, 'day')}.`);
  }
  if (s.coping.completed) lines.push(`You finished ${plural(s.coping.completed, 'coping tool')}${s.coping.helpful ? `, and marked ${s.coping.helpful} as helpful` : ''}.`);
  if (s.journal.entries) lines.push(`You wrote ${plural(s.journal.entries, 'journal entry', 'journal entries')}.`);
  if (s.nextSteps.done || s.weeklyPlans.stepsDone) lines.push(`You marked ${plural(s.nextSteps.done + s.weeklyPlans.stepsDone, 'step')} done.`);
  if (s.goals.completed) lines.push(`You completed ${plural(s.goals.completed, 'goal')}.`);
  return lines;
}

async function monthlyInsights(wellbeing, uid, profileId, month) {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const s = await summarise(wellbeing, uid, profileId, from, to);
  delete s._checkins;
  return {
    month, ...s, lines: insightLines(s),
    note: 'A summary of what you saved. It describes, it does not assess or diagnose. A GP, counsellor or AOD worker can help you make sense of it.',
  };
}

async function recoveryReport(wellbeing, uid, profileId, from, to) {
  const s = await summarise(wellbeing, uid, profileId, from, to);
  const days = s._checkins.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((c) => ({
    date: c.date, moodLabel: c.moodLabel, mood: c.mood, craving: c.craving, intensity: c.intensity, triggers: c.triggers,
  }));
  delete s._checkins;
  return {
    ...s, days, lines: insightLines(s), generatedAt: new Date().toISOString(),
    note: 'Made by you in Hopewick. Self-reported and descriptive only, not a clinical assessment. Journal text and notes are not included; export your data for those.',
  };
}

/**
 * Returns true when the route was handled.
 * ctx: { wellbeing, checkins, user, plus, profileAllowed(profileId) -> Promise<boolean>, readBody, json }
 */
export async function handleWellbeingApi(ctx, req, res, url) {
  const route = url.pathname;
  if (!route.startsWith('/api/me/')) return false;
  const { wellbeing, user, plus, json } = ctx;
  if (!user) {
    json(res, 401, { error: 'Sign in to open your saved check-ins, tools and notes.', code: 'auth' });
    return true;
  }
  const uid = user.id;
  const parts = route.slice('/api/me/'.length).split('/').filter(Boolean);
  const [area, sub] = parts;
  const method = req.method;
  const q = url.searchParams;
  const needPlus = (what) => {
    if (plus) return false;
    json(res, 403, { error: PLUS_MESSAGES[what], code: 'plus' });
    return true;
  };
  /**
   * Basic entries (free writing, a reflection prompt) are free. Plus adds the
   * richer entry types, packs and a deepened reflection. On edit only a change
   * counts, so a lapsed Plus account can still fix the text of an older entry.
   */
  const journalGate = (entry, prev) => {
    if (plus) return false;
    const changed = (k) => entry[k] !== undefined && (!prev || (entry[k] || '') !== (prev[k] || ''));
    if (changed('kind') && !FREE_JOURNAL_KINDS.includes(entry.kind)) return needPlus('journal');
    if (changed('refined') && entry.refined) return needPlus('journal');
    if (changed('packId') && entry.packId) {
      if (!ctx.releases || !ctx.releases.allows('journal-pack', entry.packId, { plus })) return needPlus('pack');
    }
    return false;
  };

  try {
    if (area === 'settings' && !sub) {
      if (method === 'GET') { json(res, 200, { settings: await wellbeing.getSettings(uid) }); return true; }
      if (method === 'PATCH') {
        const body = await readJsonBody(req, ctx.readBody, 20_000);
        const patch = normalizeSettingsPatch(body);
        json(res, 200, { settings: await wellbeing.updateSettings(uid, patch) });
        return true;
      }
    }

    // Everything else is per profile.
    let body = null;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      body = await readJsonBody(req, ctx.readBody, area === 'import' || sub === 'import' ? 3_000_000 : 300_000);
    }
    const profileId = profileOf(body && body.profileId != null ? body.profileId : q.get('profileId'));
    if (!(await ctx.profileAllowed(profileId))) {
      json(res, 403, { error: 'Adding another profile is part of Hopewick Plus. Your first profile stays free.', code: 'plus' });
      return true;
    }

    if (area === 'summary' && method === 'GET') {
      const [steps, checkins, goals, journal, activities] = await Promise.all([
        wellbeing.listSteps(uid, profileId), wellbeing.listCheckins(uid, profileId, {}), wellbeing.listGoals(uid, profileId),
        wellbeing.listJournal(uid, profileId), wellbeing.listActivities(uid, profileId, { limit: 50 }),
      ]);
      json(res, 200, {
        currentStep: steps.find((s) => s.status === 'open') || null,
        latestCheckin: checkins[0] || null,
        goals: { active: goals.filter((g) => g.status === 'active').length, completed: goals.filter((g) => g.status === 'completed').length, top: goals.filter((g) => g.status === 'active').slice(0, 3) },
        journal: { count: journal.length, lastAt: journal[0] ? journal[0].updatedAt : null },
        activities: { recent: activities.slice(0, 3), completed: activities.filter((a) => a.status === 'completed').length, inProgress: activities.find((a) => a.status !== 'completed') || null },
      });
      return true;
    }

    if (area === 'checkins') {
      if (method === 'GET' && !sub) {
        const from = q.get('from') ? assertDate(q.get('from'), 'from') : undefined;
        const to = q.get('to') ? assertDate(q.get('to'), 'to') : undefined;
        const list = await wellbeing.listCheckins(uid, profileId, { from, to });
        const have = new Set(list.map((c) => c.date));
        const legacy = legacyDays(ctx.checkins, uid, profileId, have).filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
        const a = applyWindow(list, { plus, dateOf: checkinDate });
        const b = applyWindow(legacy, { plus, dateOf: checkinDate });
        json(res, 200, { checkins: a.items, legacy: b.items, window: { ...a.window, hiddenCount: a.window.hiddenCount + b.window.hiddenCount }, plus });
        return true;
      }
      if (sub && method === 'PUT') {
        const entry = normalizeCheckin(body, { date: sub });
        json(res, 200, { checkin: await wellbeing.putCheckin(uid, profileId, entry) });
        return true;
      }
      if (sub && method === 'DELETE') {
        await wellbeing.deleteCheckin(uid, profileId, assertDate(sub));
        json(res, 200, { ok: true });
        return true;
      }
    }

    if (area === 'activities') {
      if (method === 'GET' && !sub) {
        const w = applyWindow(await wellbeing.listActivities(uid, profileId, { limit: 200 }), { plus, dateOf: activityDate, keep: (x) => x.status !== 'completed' });
        json(res, 200, { activities: w.items, window: w.window, plus });
        return true;
      }
      if (method === 'POST' && !sub) {
        const start = normalizeActivityStart(body);
        if (ctx.releases && !ctx.releases.allows('coping', start.toolKey, { plus })) { json(res, 403, { error: PLUS_MESSAGES.coping, code: 'plus' }); return true; }
        json(res, 201, { activity: await wellbeing.startActivity(uid, profileId, start) });
        return true;
      }
      if (sub && method === 'PATCH') { json(res, 200, { activity: await wellbeing.updateActivity(uid, profileId, assertId(sub), normalizeActivityPatch(body)) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteActivity(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    if (area === 'goals') {
      if (method === 'GET' && !sub) { json(res, 200, { goals: await wellbeing.listGoals(uid, profileId), plus }); return true; }
      if (method === 'POST' && !sub) { if (needPlus('goals')) return true; json(res, 201, { goal: await wellbeing.createGoal(uid, profileId, normalizeGoal(body)) }); return true; }
      if (sub && method === 'PATCH') { if (needPlus('goals')) return true; json(res, 200, { goal: await wellbeing.updateGoal(uid, profileId, assertId(sub), normalizeGoal(body, { partial: true })) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteGoal(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    if (area === 'journal') {
      if (method === 'GET' && !sub) {
        const filter = {
          q: String(q.get('q') || '').slice(0, 100).trim(),
          from: q.get('from') ? assertDate(q.get('from'), 'from') : '',
          to: q.get('to') ? assertDate(q.get('to'), 'to') : '',
          kind: q.get('kind') || '',
        };
        const all = await wellbeing.listJournal(uid, profileId);
        const w = applyWindow(all.filter((e) => journalMatches(e, filter)), { plus, dateOf: journalDate });
        json(res, 200, { entries: w.items, total: all.length, window: w.window, plus });
        return true;
      }
      if (sub === 'export' && method === 'GET') {
        const all = await wellbeing.listJournal(uid, profileId);
        const stamp = new Date().toISOString().slice(0, 10);
        if (q.get('format') === 'md') {
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="hopewick-journal-${stamp}.md"` });
          res.end(journalMarkdown(all));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="hopewick-journal-${stamp}.json"` });
          res.end(JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Hopewick', profileId, entries: all }, null, 2));
        }
        return true;
      }
      if (sub === 'import' && method === 'POST') {
        // One-time upload of the browser's journal. Only with an explicit yes.
        if (body.consent !== true) {
          await wellbeing.updateSettings(uid, { journalImport: 'declined' }, { source: 'import' });
          json(res, 200, { imported: 0, skipped: 0, status: 'declined' });
          return true;
        }
        if (!Array.isArray(body.entries)) throw new ValidationError('entries must be a list.', 'entries');
        if (body.entries.length > LIMITS.journalEntries) throw new ValidationError('Too many entries in one import.', 'entries');
        const items = body.entries.map(normalizeLegacyJournal).filter(Boolean);
        const result = await wellbeing.importJournal(uid, profileId, items);
        await wellbeing.updateSettings(uid, { journalImport: 'done' }, { source: 'import' });
        json(res, 200, { ...result, status: 'done' });
        return true;
      }
      if (method === 'POST' && !sub) {
        const entry = normalizeJournal(body);
        if (journalGate(entry, null)) return true;
        json(res, 201, { entry: await wellbeing.createJournal(uid, profileId, entry) });
        return true;
      }
      if (sub && method === 'PATCH') {
        const patch = normalizeJournal(body, { partial: true });
        const prev = (await wellbeing.listJournal(uid, profileId)).find((e) => e.id === sub);
        if (!prev) throw new NotFoundError();
        if (journalGate(patch, prev)) return true;
        json(res, 200, { entry: await wellbeing.updateJournal(uid, profileId, assertId(sub), patch) });
        return true;
      }
      if (sub && method === 'DELETE') { await wellbeing.deleteJournal(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    // Relapse prevention and exit plans are free forever, on every plan (founder decision 2026-10-18).
    if (area === 'plans') {
      if (method === 'GET' && !sub) { json(res, 200, { plans: await wellbeing.getPlans(uid, profileId), plus }); return true; }
      if (method === 'PUT' && !sub) {
        const existing = await wellbeing.getPlans(uid, profileId);
        const doc = normalizePlans(body.plans);
        if (existing && existing.safety) doc.safety = existing.safety; // safety plan essentials are saved on their own (free)
        json(res, 200, { plans: await wellbeing.putPlans(uid, profileId, doc) });
        return true;
      }
      if (sub === 'import' && method === 'POST') {
        if (body.consent !== true) {
          await wellbeing.updateSettings(uid, { plansImport: 'declined' }, { source: 'import' });
          json(res, 200, { imported: false, status: 'declined' });
          return true;
        }
        const existing = await wellbeing.getPlans(uid, profileId);
        let imported = false;
        if (!existing || (!existing.relapse && !Object.keys(existing.exits || {}).length && !(existing.custom || []).length)) {
          const doc = normalizePlans(body.plans);
          if (existing && existing.safety) doc.safety = existing.safety;
          await wellbeing.putPlans(uid, profileId, doc);
          imported = true;
        }
        await wellbeing.updateSettings(uid, { plansImport: 'done' }, { source: 'import' });
        json(res, 200, { imported, status: 'done', plans: await wellbeing.getPlans(uid, profileId) });
        return true;
      }
    }

    if (area === 'next-steps') {
      if (method === 'GET' && !sub) {
        const w = applyWindow(await wellbeing.listSteps(uid, profileId), { plus, dateOf: stepDate, keep: (x) => x.status === 'open' });
        json(res, 200, { steps: w.items, window: w.window, plus });
        return true;
      }
      if (method === 'POST' && !sub) { json(res, 201, { step: await wellbeing.createStep(uid, profileId, normalizeStep(body)) }); return true; }
      if (sub && method === 'PATCH') { json(res, 200, { step: await wellbeing.updateStep(uid, profileId, assertId(sub), normalizeStep(body, { partial: true })) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteStep(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    if (area === 'safety-plan' && !sub) {
      // Safety plan essentials: always free, never capped.
      if (method === 'GET') {
        const plans = await wellbeing.getPlans(uid, profileId);
        json(res, 200, { safety: (plans && plans.safety) || null });
        return true;
      }
      if (method === 'PUT') {
        const safety = normalizeSafety(body.safety);
        const existing = await wellbeing.getPlans(uid, profileId);
        const doc = existing ? { relapse: existing.relapse || null, exits: existing.exits || {}, custom: existing.custom || [] } : { relapse: null, exits: {}, custom: [] };
        doc.safety = safety;
        await wellbeing.putPlans(uid, profileId, doc);
        json(res, 200, { safety });
        return true;
      }
    }

    if (area === 'weekly-plans') {
      if (method === 'GET' && !sub) {
        const w = applyWindow(await wellbeing.listWeeklyPlans(uid, profileId), { plus, dateOf: (x) => brisbaneDateOf(x.updatedAt), keep: (x) => x.status === 'active' });
        json(res, 200, { plans: w.items, window: w.window, plus });
        return true;
      }
      if (method === 'POST' && !sub) { if (needPlus('weekly')) return true; json(res, 201, { plan: await wellbeing.createWeeklyPlan(uid, profileId, normalizeWeeklyPlan(body)) }); return true; }
      if (sub && method === 'PATCH') { if (needPlus('weekly')) return true; json(res, 200, { plan: await wellbeing.updateWeeklyPlan(uid, profileId, assertId(sub), normalizeWeeklyPlan(body, { partial: true })) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteWeeklyPlan(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    if (area === 'insights' && method === 'GET' && !sub) {
      if (needPlus('insights')) return true;
      const month = q.get('month') || brisbaneToday().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ValidationError('Use a month like 2026-10.', 'month');
      json(res, 200, { insights: await monthlyInsights(wellbeing, uid, profileId, month) });
      return true;
    }

    if (area === 'report' && method === 'GET' && !sub) {
      if (needPlus('report')) return true;
      const to = q.get('to') ? assertDate(q.get('to'), 'to') : brisbaneToday();
      const from = q.get('from') ? assertDate(q.get('from'), 'from') : addIsoDays(to, -29);
      if (from > to) throw new ValidationError('The start date is after the end date.', 'from');
      json(res, 200, { report: await recoveryReport(wellbeing, uid, profileId, from, to) });
      return true;
    }

    if (area === 'export' && method === 'GET' && !sub) {
      // Everything for this profile, on every plan. The history window never applies here.
      const out = await exportAll(ctx, uid, profileId);
      const stamp = brisbaneToday();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="hopewick-my-data-${stamp}.json"` });
      res.end(JSON.stringify(out, null, 2));
      return true;
    }

    if (area === 'data' && sub && method === 'DELETE') {
      // The person asked to delete this. Allowed on every plan.
      if (!DELETE_AREAS.includes(sub)) throw new ValidationError(`Choose one of: ${DELETE_AREAS.join(', ')}.`, 'area');
      if (q.get('confirm') !== sub) throw new ValidationError('Confirm the delete by sending confirm=<area>.', 'confirm');
      const removed = await wellbeing.clearArea(uid, profileId, sub);
      if (sub === 'all' && ctx.checkins && typeof ctx.checkins.merge === 'function') {
        // Older device-synced mood days, gratitude and weekly SMART goals for this profile.
        try { ctx.checkins.merge(uid, profileId, { clearedAt: Date.now() }); } catch { /* nothing synced for this profile */ }
      }
      json(res, 200, { ok: true, area: sub, removed });
      return true;
    }

    json(res, 404, { error: 'Not found.' });
    return true;
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) {
      json(res, err.status, { error: err.message, code: err.code, field: err.field });
      return true;
    }
    if (err && err.code === 'store_unavailable') {
      json(res, 503, { error: err.message, code: 'store_unavailable' });
      return true;
    }
    if (err && err.status === 413) {
      json(res, 413, { error: 'That is too much to save at once.' });
      return true;
    }
    console.error('Hopewick wellbeing API error:', err && err.name ? err.name : 'error', err && err.code ? err.code : '');
    json(res, 500, { error: 'Hopewick could not save that just now. Nothing was lost on this device. Please try again.', code: 'server' });
    return true;
  }
}
