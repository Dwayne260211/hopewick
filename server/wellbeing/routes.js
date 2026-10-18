/**
 * /api/me/* routes for Stage 3 (check-ins, coping activities, personal goals,
 * journal, plans, My Next Step, consent settings, one-time browser import).
 *
 * - The account id always comes from the session, never from the request.
 * - Free: check-ins, coping toolkit, My Next Step, settings, and reading,
 *   exporting and deleting anything you already saved.
 * - Hopewick Plus (unchanged rules): writing journal entries, personal goals
 *   (goals sit with SMART goals), and editing relapse/exit plans. Checked here,
 *   on the server.
 * - Crisis help never depends on any of this.
 */
import {
  ValidationError, NotFoundError, LIMITS, LEGACY_MOOD_SCORE, profileOf, assertDate, validDate, assertId,
  normalizeCheckin, normalizeActivityStart, normalizeActivityPatch, normalizeGoal, normalizeJournal,
  normalizeLegacyJournal, normalizePlans, normalizeStep, normalizeSettingsPatch,
} from './validate.js';

const PLUS_MESSAGES = {
  journal: 'Writing in the journal is part of Hopewick Plus. You can still read, export and delete what you already wrote.',
  goals: 'Personal goals are part of Hopewick Plus, like SMART goals. You can still see and delete goals you already saved.',
  plans: 'Editing relapse and exit plans is part of Hopewick Plus. You can still read what you already saved.',
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
        json(res, 200, { checkins: list, legacy });
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
      if (method === 'GET' && !sub) { json(res, 200, { activities: await wellbeing.listActivities(uid, profileId, { limit: 200 }) }); return true; }
      if (method === 'POST' && !sub) { json(res, 201, { activity: await wellbeing.startActivity(uid, profileId, normalizeActivityStart(body)) }); return true; }
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
        json(res, 200, { entries: all.filter((e) => journalMatches(e, filter)), total: all.length, plus });
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
      if (method === 'POST' && !sub) { if (needPlus('journal')) return true; json(res, 201, { entry: await wellbeing.createJournal(uid, profileId, normalizeJournal(body)) }); return true; }
      if (sub && method === 'PATCH') { if (needPlus('journal')) return true; json(res, 200, { entry: await wellbeing.updateJournal(uid, profileId, assertId(sub), normalizeJournal(body, { partial: true })) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteJournal(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
    }

    if (area === 'plans') {
      if (method === 'GET' && !sub) { json(res, 200, { plans: await wellbeing.getPlans(uid, profileId), plus }); return true; }
      if (method === 'PUT' && !sub) { if (needPlus('plans')) return true; json(res, 200, { plans: await wellbeing.putPlans(uid, profileId, normalizePlans(body.plans)) }); return true; }
      if (sub === 'import' && method === 'POST') {
        if (body.consent !== true) {
          await wellbeing.updateSettings(uid, { plansImport: 'declined' }, { source: 'import' });
          json(res, 200, { imported: false, status: 'declined' });
          return true;
        }
        const existing = await wellbeing.getPlans(uid, profileId);
        let imported = false;
        if (!existing) { await wellbeing.putPlans(uid, profileId, normalizePlans(body.plans)); imported = true; }
        await wellbeing.updateSettings(uid, { plansImport: 'done' }, { source: 'import' });
        json(res, 200, { imported, status: 'done', plans: await wellbeing.getPlans(uid, profileId) });
        return true;
      }
    }

    if (area === 'next-steps') {
      if (method === 'GET' && !sub) { json(res, 200, { steps: await wellbeing.listSteps(uid, profileId) }); return true; }
      if (method === 'POST' && !sub) { json(res, 201, { step: await wellbeing.createStep(uid, profileId, normalizeStep(body)) }); return true; }
      if (sub && method === 'PATCH') { json(res, 200, { step: await wellbeing.updateStep(uid, profileId, assertId(sub), normalizeStep(body, { partial: true })) }); return true; }
      if (sub && method === 'DELETE') { await wellbeing.deleteStep(uid, profileId, assertId(sub)); json(res, 200, { ok: true }); return true; }
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
