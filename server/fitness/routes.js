/**
 * /api/fitness/* : Move & Recover (30-Minute Move, sauna, cold and contrast).
 *
 * Gates, in order, all on the server:
 *   1. Feature flag (server/fitness/flag.js). Off for this request -> 404 for
 *      every route, exactly like an unknown URL.
 *   2. Sign-in (401), except GET /safety, which is public while the flag is on.
 *   3. Hopewick Plus (403 code "plus") for the program, protocols, screen,
 *      sessions and plans. Trial and founder comp count as Plus (publicUser().plus).
 *      The safety rules and research info (GET /safety) stay free.
 *   4. Release schedule (FITNESS_PLUS_START): content not dropped yet -> 403 code "not_released".
 *   5. Safety screen per area (move / sauna / cold / contrast): red never
 *      unlocks; amber unlocks only after the doctor's-OK tick.
 *   6. Pre-session check for every heat, cold or contrast session, re-run on
 *      the server when the session starts. Reporting alcohol or other drug
 *      use stores a 24-hour pause (rules.substanceLockHours).
 *
 * Only the screen RESULT is stored, never the answers.
 */
import { ValidationError, NotFoundError, profileOf, brisbaneToday, brisbaneWeekStart, LEGACY_MOOD_SCORE, normalizeStep, normalizeWeeklyPlan } from '../wellbeing/validate.js';
import { FITNESS_RULES, PENDING_DECISIONS, SESSION_KINDS, HEAT_COLD, SCREEN_AREAS } from './rules.js';
import { fitnessEnabledFor, fitnessFlagMode } from './flag.js';
import * as C from './content.js';
import {
  screenQuestions, evaluateScreen, mergeScreen, allAreaStatus, areaStatus, applyClearance, flagRescreen,
  CHECK_QUESTIONS, evaluateCheck, SCREEN_PARTS, SCREEN_VERSION,
} from './screen.js';

const PLUS_MESSAGE = 'Move & Recover is part of Hopewick Plus. The heat and cold safety rules stay free for everyone.';
const NOT_RELEASED = 'This part of Move & Recover has not been released yet. It is coming in a weekly Plus drop.';
const CORRECTION_MINUTES = 15; // a just-finished screen can be redone to fix a mis-tap
const MOODS = [1, 2, 3, 4, 5];

async function readJsonBody(req, readBody, limit = 50_000) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw new ValidationError('Send the data as JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Send the data as a JSON object.');
  return body;
}

const brisbaneDay = (now = new Date()) => new Date(now.getTime() + 10 * 3600000).getUTCDay();
const workoutById = (id) => C.WORKOUTS.find((w) => w.id === id) || null;
const stageOf = (kind, id) => (C.PROTOCOLS[kind] ? C.PROTOCOLS[kind].stages.find((s) => s.id === id) || null : null);
const moodIn = (v, field) => {
  if (v == null) return null;
  if (!MOODS.includes(v)) throw new ValidationError('Choose a mood from 1 to 5.', field);
  return v;
};

/** Today's suggested workout for the person's level. */
export function suggestionFor(level, now = new Date()) {
  const day = brisbaneDay(now);
  const list = C.WORKOUTS.filter((w) => w.day === day && (!w.advancedOnly || level === 'advanced'));
  return list[0] ? list[0].id : 'gentle-recovery';
}

/** The workout with the person's level, track swaps and interval pattern applied. */
export function buildWorkout(w, level, track) {
  const L = C.LEVELS.find((x) => x.id === level) || C.LEVELS[0];
  const swaps = C.TRACK_SWAPS[track] || {};
  const ex = (item) => {
    const id = swaps[item.id] || item.id;
    const e = C.EXERCISES[id];
    return { ...item, id, swappedFrom: id !== item.id ? item.id : null, exercise: e ? { id, ...e, adaptedNote: e.adapted ? e.adapted[track] || null : null } : null };
  };
  const out = {
    id: w.id, title: w.title, purpose: w.purpose, kind: w.kind, day: w.day, totalMinutes: 30,
    level: L, track, warmup: { ...C.WARMUP, items: C.WARMUP.items.map(ex) }, cooldown: { ...C.COOLDOWN, items: C.COOLDOWN.items.map(ex) },
    main: w.main.map(ex), rounds: w.kind === 'strength' ? L.rounds : (w.rounds || 1), restSeconds: w.kind === 'strength' ? L.restSeconds : 15,
    options: w.options || null, reviewNote: C.REVIEW_NOTE,
  };
  if (w.intervals) out.intervals = w.intervals[L.id] || w.intervals.beginner;
  return out;
}

async function todayCheckin(ctx, uid, profileId) {
  const today = brisbaneToday();
  try {
    const list = await ctx.wellbeing.listCheckins(uid, profileId, { from: today, to: today });
    if (list[0]) return { mood: list[0].mood, craving: list[0].craving || null };
  } catch { /* fall through */ }
  if (ctx.checkins && typeof ctx.checkins.list === 'function') {
    const row = (ctx.checkins.list(uid) || []).find((p) => p && p.id === profileId);
    const m = row && (row.moods || []).find((x) => x && x.date === today);
    if (m) return { mood: m.mood ? (LEGACY_MOOD_SCORE[m.mood.l] ?? null) : null, craving: m.craving || null };
  }
  return null;
}

function weekSummary(sessions, now = new Date()) {
  const weekStart = brisbaneWeekStart(now);
  const startIso = new Date(`${weekStart}T00:00:00+10:00`).toISOString();
  const done = sessions.filter((s) => s.status === 'completed' && s.startedAt >= startIso);
  const workouts = done.filter((s) => s.kind === 'workout');
  const minutes = Math.round(workouts.reduce((a, s) => a + (s.durationSeconds || 0), 0) / 60);
  const strengthDays = new Set(workouts.filter((s) => (workoutById(s.planKey) || {}).kind === 'strength').map((s) => brisbaneToday(new Date(s.startedAt)))).size;
  const moodPairs = done.filter((s) => s.detail && s.detail.moodBefore && s.detail.moodAfter);
  const lifted = moodPairs.filter((s) => s.detail.moodAfter > s.detail.moodBefore).length;
  return {
    weekStart, movementMinutes: minutes, minutesTarget: FITNESS_RULES.weeklyMinutesTarget,
    strengthDays, strengthDaysTarget: FITNESS_RULES.weeklyStrengthDaysTarget,
    sessions: { workout: workouts.length, sauna: done.filter((s) => s.kind === 'sauna').length, cold: done.filter((s) => s.kind === 'cold').length, contrast: done.filter((s) => s.kind === 'contrast').length },
    moodPairs: moodPairs.length, moodLifted: lifted,
    note: 'Movement is tracked on its own. It never affects your clean-time count.',
  };
}

function lastStrength(sessions) {
  const s = sessions.find((x) => x.kind === 'workout' && x.status === 'completed' && (workoutById(x.planKey) || {}).kind === 'strength');
  return s ? (s.completedAt || s.startedAt) : null;
}

export function fitnessExportFor(fitness) {
  return async (uid, profileId) => {
    const [p, sessions] = await Promise.all([fitness.getProfile(uid, profileId), fitness.listSessions(uid, profileId)]);
    return { screenResult: p.screen, pausedUntil: p.lockUntil, preferences: p.prefs, sessions };
  };
}

export async function handleFitnessApi(ctx, req, res, url) {
  const route = url.pathname;
  if (!route.startsWith('/api/fitness/') && route !== '/api/fitness') return false;
  const { fitness, user, plus, json } = ctx;
  const env = ctx.env || process.env;
  if (!fitnessEnabledFor(user, env)) { json(res, 404, { error: 'Not found.' }); return true; }
  const parts = route.slice('/api/fitness'.length).split('/').filter(Boolean);
  const [area, sub] = parts;
  const method = req.method;
  const q = url.searchParams;
  const today = brisbaneToday();
  const unlocks = C.openUnlocks(env, today);
  const open = (key) => C.isOpen(unlocks, key);

  try {
    if (area === 'safety' && !sub && method === 'GET') {
      // Free for everyone, signed in or not, on every plan.
      json(res, 200, { safety: C.SAFETY, info: C.INFO, rules: FITNESS_RULES, overdoingIt: C.OVERDOING_IT, painGuide: C.PAIN_GUIDE, reviewNote: C.REVIEW_NOTE });
      return true;
    }
    if (!user) { json(res, 401, { error: 'Sign in to open Move & Recover.', code: 'auth' }); return true; }
    if (!fitness) { json(res, 503, { error: 'Move & Recover could not load just now.', code: 'store_unavailable' }); return true; }
    const h = fitness.health ? fitness.health() : { ok: true };
    if (!h.ok) { json(res, 503, { error: 'Move & Recover could not load just now. Your saved data is safe.', code: 'store_unavailable' }); return true; }

    const uid = user.id;
    let body = null;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') body = await readJsonBody(req, ctx.readBody);
    const profileId = profileOf(body && body.profileId != null ? body.profileId : q.get('profileId'));
    if (ctx.profileAllowed && !(await ctx.profileAllowed(profileId))) {
      json(res, 403, { error: 'Adding another profile is part of Hopewick Plus. Your first profile stays free.', code: 'plus' });
      return true;
    }

    if (area === 'status' && !sub && method === 'GET') {
      const out = {
        enabled: true, preview: fitnessFlagMode(env) === 'founder', plus, rules: FITNESS_RULES, pendingDecisions: PENDING_DECISIONS,
        reviewNote: C.REVIEW_NOTE, contentVersion: C.CONTENT_VERSION, releases: C.releaseSchedule(env, today),
      };
      if (plus) {
        const p = await fitness.getProfile(uid, profileId);
        const sessions = await fitness.listSessions(uid, profileId, { since: new Date(Date.now() - 14 * 86400000).toISOString() });
        const checkin = await todayCheckin(ctx, uid, profileId);
        out.screen = { areas: allAreaStatus(p.screen), parts: (p.screen && p.screen.parts) || {} };
        out.pausedUntil = p.lockUntil && p.lockUntil > new Date().toISOString() ? p.lockUntil : null;
        out.prefs = p.prefs;
        out.today = { suggestion: suggestionFor(p.prefs.level), heatColdNotSuggested: Boolean(FITNESS_RULES.notSuggestedOnStruggling && checkin && (checkin.mood === 1 || checkin.craving === 'Strong')) };
        out.week = weekSummary(sessions);
      }
      json(res, 200, out);
      return true;
    }

    if (area === 'data' && !sub && method === 'DELETE') {
      // Free on every plan (a lapsed Plus account can always delete). Account delete and "delete all" also clear it.
      if (q.get('confirm') !== 'fitness') throw new ValidationError('Confirm the delete by sending confirm=fitness.', 'confirm');
      json(res, 200, { ok: true, removed: await fitness.clear(uid, profileId) });
      return true;
    }

    if (!plus) { json(res, 403, { error: PLUS_MESSAGE, code: 'plus' }); return true; }

    if (area === 'program' && !sub && method === 'GET') {
      if (!open('program')) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
      const p = await fitness.getProfile(uid, profileId);
      const level = open(`level:${p.prefs.level}`) ? p.prefs.level : 'beginner';
      const track = open(`track:${p.prefs.track}`) ? p.prefs.track : 'standard';
      const workouts = C.WORKOUTS.map((w) => (open(`workout:${w.id}`) ? buildWorkout(w, level, track) : { id: w.id, title: w.title, day: w.day, released: false }));
      json(res, 200, {
        level, track, levels: C.LEVELS.map((l) => ({ ...l, released: open(`level:${l.id}`) })), tracks: C.TRACKS.map((t) => ({ ...t, released: open(`track:${t.id}`) })),
        trackNote: C.TRACK_NOTE, painGuide: C.PAIN_GUIDE, rotationRules: C.ROTATION_RULES, overdoingIt: C.OVERDOING_IT, sleepTip: C.SLEEP_TIP,
        suggestion: suggestionFor(level), workouts, exercises: C.EXERCISES, moveScreen: areaStatus((await fitness.getProfile(uid, profileId)).screen, 'move'),
        reviewNote: C.REVIEW_NOTE,
      });
      return true;
    }

    if (area === 'protocols' && !sub && method === 'GET') {
      const p = await fitness.getProfile(uid, profileId);
      const status = allAreaStatus(p.screen);
      const list = HEAT_COLD.map((k) => {
        const released = open(`protocol:${k}`) && open('screen:heat-cold');
        const st = status[k];
        const unlocked = released && st.unlocked;
        return { id: k, title: C.PROTOCOLS[k].title, released, screen: st, unlocked, ...(unlocked ? { protocol: C.PROTOCOLS[k] } : {}) };
      });
      json(res, 200, { protocols: list, safety: C.SAFETY, checkQuestions: CHECK_QUESTIONS, sleepTip: C.SLEEP_TIP, pausedUntil: p.lockUntil && p.lockUntil > new Date().toISOString() ? p.lockUntil : null, reviewNote: C.REVIEW_NOTE });
      return true;
    }

    if (area === 'screen') {
      if (sub === 'questions' && method === 'GET') {
        const qs = screenQuestions(FITNESS_RULES);
        const strip = (list) => list.map(({ id, text }) => ({ id, text }));
        json(res, 200, { version: SCREEN_VERSION, move: strip(qs.move), heatCold: open('screen:heat-cold') ? strip(qs.heatCold) : null, agreement: qs.agreement, safety: C.SAFETY });
        return true;
      }
      if (!sub && method === 'POST') {
        const part = body.part;
        if (!SCREEN_PARTS.includes(part)) throw new ValidationError('Choose part "move" or "heat-cold".', 'part');
        if (part === 'heat-cold' && !open('screen:heat-cold')) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
        const p = await fitness.getProfile(uid, profileId);
        // A temporary red (withdrawal, recent surgery) holds until its re-check date,
        // except a quick correction straight after finishing.
        const areas = part === 'move' ? ['move'] : ['sauna', 'cold', 'contrast'];
        const done = p.screen && p.screen.parts && p.screen.parts[part];
        const justDone = done && Date.now() - Date.parse(done.completedAt) < CORRECTION_MINUTES * 60000;
        const held = areas.map((a) => p.screen && p.screen.areas && p.screen.areas[a]).find((a) => a && a.outcome === 'red' && a.recheckAfter && a.recheckAfter > new Date().toISOString());
        if (held && !justDone) {
          json(res, 409, { error: 'These questions open again on your re-check date. Until then, gentle walking and stretching your treatment team is happy with are a great choice.', code: 'recheck_later', recheckAfter: held.recheckAfter });
          return true;
        }
        const result = evaluateScreen(part, body.answers, { rules: FITNESS_RULES, agree: body.agree });
        await fitness.saveScreen(uid, profileId, mergeScreen(p.screen, part, result));
        // The answers are not stored anywhere. Reasons are shown once.
        json(res, 200, { part, areas: allAreaStatus(mergeScreen(p.screen, part, result)), reasons: result.reasons, suggestTrack: result.suggestTrack, expiresAt: result.expiresAt });
        return true;
      }
      if (sub === 'clearance' && method === 'POST') {
        if (body.confirm !== true) throw new ValidationError('Tick the box to confirm your doctor or pharmacist has said this is OK for you.', 'confirm');
        const list = Array.isArray(body.areas) ? body.areas : [];
        if (!list.length || list.some((a) => !SCREEN_AREAS.includes(a))) throw new ValidationError('Choose which areas your doctor has OK’d.', 'areas');
        const p = await fitness.getProfile(uid, profileId);
        const { screen } = applyClearance(p.screen, list);
        await fitness.saveScreen(uid, profileId, screen);
        json(res, 200, { areas: allAreaStatus(screen) });
        return true;
      }
    }

    if (area === 'check' && !sub && method === 'POST') {
      const kind = body.kind;
      if (!HEAT_COLD.includes(kind)) throw new ValidationError('Choose sauna, cold or contrast.', 'kind');
      const p = await fitness.getProfile(uid, profileId);
      const recent = await fitness.listSessions(uid, profileId, { since: new Date(Date.now() - 86400000).toISOString() });
      const verdict = evaluateCheck(kind, body.answers, { rules: FITNESS_RULES, lockUntil: p.lockUntil, todayCheckin: await todayCheckin(ctx, uid, profileId), lastStrengthAt: lastStrength(recent), stage: body.stage || null });
      if (verdict.setLockUntil) await fitness.setLock(uid, profileId, verdict.setLockUntil);
      json(res, 200, { ok: verdict.ok, blocks: verdict.blocks, warnings: verdict.warnings, pausedUntil: verdict.setLockUntil || (p.lockUntil && p.lockUntil > new Date().toISOString() ? p.lockUntil : null) });
      return true;
    }

    if (area === 'sessions') {
      if (!sub && method === 'GET') {
        json(res, 200, { sessions: await fitness.listSessions(uid, profileId, { since: q.get('since') || undefined }) });
        return true;
      }
      if (!sub && method === 'POST') {
        const kind = body.kind;
        if (!SESSION_KINDS.includes(kind)) throw new ValidationError('Choose workout, sauna, cold or contrast.', 'kind');
        const p = await fitness.getProfile(uid, profileId);
        const screenArea = kind === 'workout' ? 'move' : kind;
        const st = areaStatus(p.screen, screenArea);
        const detail = { moodBefore: moodIn(body.moodBefore, 'moodBefore') };
        let warnings = [];
        if (kind === 'workout') {
          const w = workoutById(body.planKey);
          if (!w) throw new ValidationError('Choose a workout from this week’s plan.', 'planKey');
          if (!open('program') || !open(`workout:${w.id}`)) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
          if (!st.unlocked) { json(res, 409, { error: 'Answer the movement safety questions first.', code: 'screen', screen: st }); return true; }
          detail.level = p.prefs.level; detail.track = p.prefs.track;
        } else {
          const stage = stageOf(kind, body.planKey);
          if (!stage) throw new ValidationError('Choose a stage from the protocol.', 'planKey');
          if (!open('screen:heat-cold') || !open(`protocol:${kind}`)) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
          if (!st.unlocked) { json(res, 409, { error: 'This stays locked until the heat and cold safety questions say it is OK for you.', code: 'screen', screen: st }); return true; }
          const recent = await fitness.listSessions(uid, profileId, { since: new Date(Date.now() - 86400000).toISOString() });
          const verdict = evaluateCheck(kind, body.check, { rules: FITNESS_RULES, lockUntil: p.lockUntil, todayCheckin: await todayCheckin(ctx, uid, profileId), lastStrengthAt: lastStrength(recent), stage: stage.id });
          if (verdict.setLockUntil) await fitness.setLock(uid, profileId, verdict.setLockUntil);
          if (!verdict.ok) { json(res, 409, { error: verdict.blocks[0].text, code: 'check', blocks: verdict.blocks, warnings: verdict.warnings }); return true; }
          warnings = verdict.warnings;
          if (body.check && Number.isFinite(Number(body.check.waterTempC))) detail.waterTempC = Number(body.check.waterTempC);
        }
        const session = await fitness.createSession(uid, profileId, { kind, planKey: body.planKey, detail });
        json(res, 201, { session, warnings });
        return true;
      }
      if (sub && method === 'PATCH') {
        const patch = {};
        if (body.status !== undefined) {
          if (!['completed', 'stopped'].includes(body.status)) throw new ValidationError('status must be completed or stopped.', 'status');
          patch.status = body.status;
        }
        if (body.durationSeconds !== undefined) {
          const d = Number(body.durationSeconds);
          if (!Number.isInteger(d) || d < 0 || d > 4 * 3600) throw new ValidationError('durationSeconds must be a whole number of seconds (up to 4 hours).', 'durationSeconds');
          patch.durationSeconds = d;
        }
        const det = {};
        if (body.moodAfter !== undefined) det.moodAfter = moodIn(body.moodAfter, 'moodAfter');
        if (body.stoppedForSymptoms !== undefined) {
          if (typeof body.stoppedForSymptoms !== 'boolean') throw new ValidationError('stoppedForSymptoms must be true or false.', 'stoppedForSymptoms');
          det.stoppedForSymptoms = body.stoppedForSymptoms;
        }
        if (Object.keys(det).length) patch.detail = det;
        const session = await fitness.updateSession(uid, profileId, sub, patch);
        let needsRescreen = false;
        if (det.stoppedForSymptoms === true) {
          const p = await fitness.getProfile(uid, profileId);
          const areas = session.kind === 'workout' ? ['move'] : [session.kind];
          await fitness.saveScreen(uid, profileId, flagRescreen(p.screen, areas));
          needsRescreen = true;
        }
        json(res, 200, { session, needsRescreen, ...(needsRescreen ? { message: 'Thanks for stopping. If you had chest pain, fainting or trouble breathing, call 000. Please check with your GP before trying this again, then answer the safety questions again.' } : {}) });
        return true;
      }
    }

    if (area === 'summary' && !sub && method === 'GET') {
      const sessions = await fitness.listSessions(uid, profileId, { since: new Date(Date.now() - 8 * 86400000).toISOString() });
      json(res, 200, { week: weekSummary(sessions) });
      return true;
    }

    if (area === 'prefs' && !sub && method === 'PUT') {
      const level = body.level == null ? undefined : String(body.level);
      const track = body.track == null ? undefined : String(body.track);
      const p = await fitness.getProfile(uid, profileId);
      const next = { ...p.prefs };
      if (level !== undefined) {
        if (!C.LEVELS.some((l) => l.id === level)) throw new ValidationError('Choose beginner, intermediate or advanced.', 'level');
        if (!open(`level:${level}`)) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
        next.level = level;
      }
      if (track !== undefined) {
        if (!C.TRACKS.some((t) => t.id === track)) throw new ValidationError('Choose a track from the list.', 'track');
        if (!open(`track:${track}`)) { json(res, 403, { error: NOT_RELEASED, code: 'not_released' }); return true; }
        next.track = track;
      }
      json(res, 200, { prefs: await fitness.savePrefs(uid, profileId, next) });
      return true;
    }

    if (area === 'next-step' && !sub && method === 'POST') {
      // My Next Step tie-in: today's suggestion becomes a single next step (always a Plus-only button here).
      const w = workoutById(body.planKey) || workoutById(suggestionFor((await fitness.getProfile(uid, profileId)).prefs.level));
      const step = normalizeStep({ title: `Move: ${w.title} (30 minutes)`, detail: w.purpose, source: 'user' });
      json(res, 201, { step: await ctx.wellbeing.createStep(uid, profileId, step) });
      return true;
    }

    if (area === 'weekly-plan' && !sub && method === 'POST') {
      // "Move this week": a weekly multi-step plan in My Next Step.
      const p = await fitness.getProfile(uid, profileId);
      const st = allAreaStatus(p.screen);
      const level = p.prefs.level;
      const days = [1, 2, 3, 4, 5, 6, 0];
      const steps = days.map((d) => {
        const w = C.WORKOUTS.find((x) => x.day === d && (!x.advancedOnly || level === 'advanced')) || C.WORKOUTS[0];
        return { title: `${w.title} (30 min)`, day: d };
      });
      if (st.sauna.unlocked && open('protocol:sauna')) steps.push({ title: 'Sauna, after the safety check', day: 3 });
      else if (st.cold.unlocked && open('protocol:cold')) steps.push({ title: 'Cold finish to a shower, after the safety check', day: 2 });
      const plan = normalizeWeeklyPlan({ title: 'Move this week', steps: steps.slice(0, 10) });
      json(res, 201, { plan: await ctx.wellbeing.createWeeklyPlan(uid, profileId, plan) });
      return true;
    }

    json(res, 404, { error: 'Not found.' });
    return true;
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) {
      json(res, err.status, { error: err.message, code: err.code, field: err.field });
      return true;
    }
    if (err && err.code === 'store_unavailable') { json(res, 503, { error: err.message, code: 'store_unavailable' }); return true; }
    if (err && err.status === 413) { json(res, 413, { error: 'That is too much to save at once.' }); return true; }
    console.error('Hopewick fitness API error:', err && err.name ? err.name : 'error', err && err.code ? err.code : '');
    json(res, 500, { error: 'Hopewick could not save that just now. Please try again.', code: 'server' });
    return true;
  }
}
