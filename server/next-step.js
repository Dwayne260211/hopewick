/**
 * My Next Step: Hope can propose ONE small, achievable step as a tagged block
 * at the very end of a reply (the instruction lives in server/hope-prompts.js):
 *
 *   [[hopewick-next-step]]{"step":"...","why":"...","tool":"breathing-box"}[[/hopewick-next-step]]
 *
 * The server removes the block from the text the person sees and returns the
 * parsed suggestion separately (`hopewick.nextStep`). The app then shows a
 * "Save as my next step?" card; nothing is saved unless the person says yes.
 * If the latest message looked like a crisis, any suggestion is dropped so
 * crisis contacts always come first.
 */
import { COPING_TOOLS, LIMITS } from './wellbeing/validate.js';

export const NEXT_STEP_OPEN = '[[hopewick-next-step]]';
export const NEXT_STEP_CLOSE = '[[/hopewick-next-step]]';

function oneLine(value, max) {
  const t = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

/** Validate a parsed suggestion. Returns null for anything unusable. */
export function cleanSuggestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const step = oneLine(raw.step || raw.title, LIMITS.stepTitle);
  if (step.length < 3) return null;
  // The step is something the person does. Hopewick never contacts anyone.
  if (/https?:\/\//i.test(step)) return null;
  const why = oneLine(raw.why || raw.detail, 300);
  const tool = Object.prototype.hasOwnProperty.call(COPING_TOOLS, raw.tool) ? raw.tool : null;
  return { title: step, detail: why, copingKey: tool };
}

/** Non-streaming: split a full reply into { text, suggestion }. */
export function extractNextStep(text) {
  const s = String(text || '');
  const start = s.indexOf(NEXT_STEP_OPEN);
  if (start < 0) return { text: s, suggestion: null };
  const end = s.indexOf(NEXT_STEP_CLOSE, start);
  const inner = s.slice(start + NEXT_STEP_OPEN.length, end < 0 ? undefined : end).trim();
  const rest = end < 0 ? '' : s.slice(end + NEXT_STEP_CLOSE.length);
  let parsed = null;
  try { parsed = JSON.parse(inner); } catch { parsed = null; }
  return { text: (s.slice(0, start) + rest).replace(/\s+$/, ''), suggestion: cleanSuggestion(parsed) };
}

/**
 * Streaming: feed text deltas in, get back the text that is safe to show.
 * Holds back a possible partial "[[hopewick-next-step]]" at a chunk boundary,
 * and swallows everything after the opening tag.
 */
export function createNextStepFilter() {
  let pending = '';
  let inTag = false;
  let tagBody = '';
  return {
    push(delta) {
      if (inTag) { tagBody += delta; return ''; }
      pending += delta;
      const at = pending.indexOf(NEXT_STEP_OPEN);
      if (at >= 0) {
        const out = pending.slice(0, at);
        tagBody = pending.slice(at + NEXT_STEP_OPEN.length);
        pending = '';
        inTag = true;
        return out;
      }
      // Keep back the longest suffix that could start the tag.
      let keep = 0;
      for (let k = Math.min(NEXT_STEP_OPEN.length - 1, pending.length); k > 0; k -= 1) {
        if (NEXT_STEP_OPEN.startsWith(pending.slice(-k))) { keep = k; break; }
      }
      const out = pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      return out;
    },
    /** Call once at the end. Returns { text, suggestion }. */
    finish() {
      if (!inTag) { const out = pending; pending = ''; return { text: out, suggestion: null }; }
      const end = tagBody.indexOf(NEXT_STEP_CLOSE);
      const inner = (end < 0 ? tagBody : tagBody.slice(0, end)).trim();
      let parsed = null;
      try { parsed = JSON.parse(inner); } catch { parsed = null; }
      return { text: '', suggestion: cleanSuggestion(parsed) };
    },
  };
}
