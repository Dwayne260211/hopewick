/**
 * Pure state changes shared by both storage backends, so "complete",
 * "archive", "pause" etc. behave the same in JSON and Postgres.
 */
import { ValidationError, HELPFUL } from './validate.js';

const nowIso = () => new Date().toISOString();

/** Activity: started <-> paused -> completed. A completed activity stays completed (revisit starts a new one). */
export function applyActivityPatch(prev, patch, now = nowIso()) {
  const next = { ...prev };
  if (patch.status && patch.status !== prev.status) {
    if (prev.status === 'completed') throw new ValidationError('That activity is already complete. Start it again to revisit it.', 'status');
    next.status = patch.status;
    if (patch.status === 'completed') next.completedAt = now;
  }
  if (patch.stepIndex != null) next.stepIndex = patch.stepIndex;
  if (patch.durationSeconds != null) next.durationSeconds = patch.durationSeconds;
  if (patch.helpful !== undefined) next.helpful = patch.helpful;
  if (patch.note !== undefined) next.note = patch.note;
  next.updatedAt = now;
  return next;
}
export function helpfulToScore(h) { return h == null ? null : HELPFUL[h]; }
export function scoreToHelpful(n) {
  if (n == null) return null;
  if (n >= 4) return 'yes';
  if (n >= 2) return 'somewhat';
  return 'no';
}

/** Goal: completing sets completedAt (and progress 100); reopening or archiving clears it. */
export function applyGoalPatch(prev, patch, now = nowIso()) {
  // An undefined field in the patch must not wipe the previous value (a goal created without a status stays 'active').
  const next = { ...prev, ...Object.fromEntries(Object.entries(patch || {}).filter(([, v]) => v !== undefined)) };
  if (patch.status && patch.status !== prev.status) {
    if (patch.status === 'completed') { next.completedAt = now; next.progress = 100; }
    else next.completedAt = null;
  }
  next.updatedAt = now;
  return next;
}

/** Next step: open -> done (completedAt) or dismissed; reopen allowed. */
export function applyStepPatch(prev, patch, now = nowIso()) {
  const next = { ...prev, ...patch };
  if (patch.status && patch.status !== prev.status) next.completedAt = patch.status === 'done' ? now : null;
  next.updatedAt = now;
  return next;
}

/** Weekly plan: steps carry done/doneAt; a plan is done when every step is done (or when set). */
export function applyWeeklyPlanPatch(prev, patch, now = nowIso()) {
  const next = { ...prev };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.weekStart !== undefined) next.weekStart = patch.weekStart;
  if (patch.steps !== undefined) {
    const before = new Map((prev.steps || []).map((s) => [s.id, s]));
    next.steps = patch.steps.map((s) => {
      const old = before.get(s.id);
      const doneAt = s.done ? (old && old.done ? old.doneAt : now) : null;
      return { id: s.id, title: s.title, day: s.day ?? null, done: !!s.done, doneAt };
    });
  }
  if (patch.status !== undefined && patch.status !== prev.status) {
    next.status = patch.status;
    next.completedAt = patch.status === 'done' ? now : null;
  }
  next.updatedAt = now;
  return next;
}
