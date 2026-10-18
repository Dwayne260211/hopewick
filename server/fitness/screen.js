/**
 * Move & Recover safety screen and pre-session check.
 *
 * Clinically reviewed (founder confirmed, 18 Oct 2026). Part A (Move) follows the principles of the
 * ESSA / Fitness Australia / SMA Adult Pre-Exercise Screening System (2019),
 * paraphrased, not copied. Part B (Heat and cold) covers the contraindications
 * in docs/FITNESS-PROTOCOLS.md.
 *
 * Privacy: the answers are evaluated here and thrown away. Only the outcome
 * per area (green / amber / red), the dates, any re-check date and the
 * doctor's-OK tick are stored (encrypted). The reasons are returned once so the
 * person can read them, and are never saved.
 */
import { FITNESS_RULES as R, SCREEN_AREAS } from './rules.js';
import { ValidationError } from '../wellbeing/validate.js';

export const SCREEN_VERSION = 'fit-screen-v1';
const RANK = { green: 0, amber: 1, red: 2 };

/**
 * effects: { area: 'amber' | 'red' }. temp: days until a temporary red can be
 * re-checked. Text is plain language; "why" is shown with the result only.
 */
export function screenQuestions(rules = R) {
  const heart = rules.stableHeartOutcome === 'red' ? 'red' : 'amber';
  const withdrawal = rules.withdrawalLocksHeatCold ? 'red' : 'amber';
  return {
    move: [
      { id: 'A1', text: 'Has a doctor ever told you that you have a heart condition, or have you had a stroke?', effects: { move: 'amber' }, why: 'A heart condition or past stroke means it is worth checking your plan with your doctor first.' },
      { id: 'A2', text: 'Do you get pain or discomfort in your chest, at rest or when you are active?', effects: { move: 'red' }, why: 'Chest pain needs a doctor’s check before you start an exercise program.' },
      { id: 'A3', text: 'Do you faint, black out, get very dizzy or lose your balance when you are active?', effects: { move: 'red' }, why: 'Fainting or dizziness with activity needs a doctor’s check first.' },
      { id: 'A4', text: 'In the last 12 months, have you had an asthma attack that needed urgent medical care?', effects: { move: 'amber' }, why: 'Check your asthma plan with your doctor before you start.' },
      { id: 'A5', text: 'Is your diabetes hard to control, or have you had a low (a hypo) in the last 3 months?', effects: { move: 'amber' }, why: 'Your doctor can help you plan exercise around blood sugar.' },
      { id: 'A6', text: 'Do you have an injury, ongoing pain, or a bone, joint or other condition that might affect exercise (including a work injury)?', effects: { move: 'amber' }, suggestTrack: true, why: 'Check the plan with your GP, physio or exercise physiologist, and try an adapted track.' },
      { id: 'A7', text: 'Are you pregnant, or have you had a baby in the last 6 months?', effects: { move: 'amber' }, why: 'Your antenatal or postnatal team can tell you what suits you right now.' },
      { id: 'A8', text: 'Do you have, or are you being treated for, an eating disorder, or do you feel you have to exercise to make up for eating?', effects: { move: 'amber' }, why: 'Please plan movement with your treating team. The Butterfly Foundation can help on 1800 33 4673.' },
      { id: 'A9', text: 'Are you going through alcohol or other drug withdrawal or detox right now?', effects: { move: 'red' }, temp: rules.withdrawalRecheckDays, why: 'During withdrawal, stick to gentle walking and stretching your treatment team is happy with. We will ask again in two weeks.' },
    ],
    heatCold: [
      { id: 'B1', text: 'In the last 6 months, have you had a heart attack, heart surgery or a stent, been told your heart condition is unstable, or do you have heart failure or an implanted defibrillator (ICD)?', effects: { sauna: 'red', cold: 'red', contrast: 'red' }, why: 'Heat and cold put real strain on the heart. Please talk to your cardiologist or GP.' },
      { id: 'B2', text: 'Do you have a stable heart condition that is managed by your doctor (for example a controlled rhythm problem or a pacemaker)?', effects: { sauna: heart, cold: heart, contrast: heart }, why: 'Many people with a stable heart condition can use heat or cold, but only with their doctor’s OK.' },
      { id: 'B3', text: 'Have you been told you have long QT, or do you take methadone or another medicine your doctor said affects your heart rhythm?', effects: { sauna: 'amber', cold: 'red', contrast: 'red' }, why: 'Cold water can trigger heart rhythm problems in people with a long QT. Ask your doctor about heat.' },
      { id: 'B4', text: 'Do you get chest pain or unexplained breathlessness, or have you fainted without a clear reason?', effects: { sauna: 'red', cold: 'red', contrast: 'red' }, why: 'These need a doctor’s check before any heat or cold.' },
      { id: 'B5', text: 'Is your blood pressure high and not well controlled, or do you often feel faint when you stand up?', effects: { sauna: 'amber', cold: 'red', contrast: 'red' }, why: 'Cold water sharply raises blood pressure, and heat can make you faint. Talk to your doctor.' },
      { id: 'B6', text: 'Have you had a stroke or mini-stroke (TIA), or been told you have an aneurysm?', effects: { sauna: 'red', cold: 'red', contrast: 'red' }, why: 'Please talk to your doctor before any heat or cold.' },
      { id: 'B7', text: 'Are you pregnant or trying to get pregnant?', effects: { sauna: 'red', cold: 'red', contrast: 'red' }, why: 'High body temperature is a concern in early pregnancy. Please talk to your antenatal team.' },
      { id: 'B8', text: 'Do you have Raynaud’s, cold urticaria (hives from cold), cryoglobulinaemia or sickle cell disease?', effects: { cold: 'red', contrast: 'red' }, why: 'Cold water can set off serious reactions with these conditions.' },
      { id: 'B9', text: 'Do you have epilepsy or seizures?', effects: { sauna: 'amber', cold: 'red', contrast: 'red' }, why: 'A seizure in water can lead to drowning. Ask your doctor about heat, and never sauna alone.' },
      { id: 'B10', text: 'Do you have diabetes with nerve damage in your feet, or kidney or liver disease?', effects: { sauna: 'amber', cold: 'amber', contrast: 'amber' }, why: 'These can change how your body handles heat, cold and fluids. Check with your doctor.' },
      { id: 'B11', text: 'Do you take any of these: antipsychotics (such as clozapine, olanzapine or quetiapine), lithium, antidepressants, benzodiazepines, opioids or opioid treatment, stimulant ADHD medicines, beta-blockers, fluid tablets (diuretics) or other blood pressure medicines?', effects: { sauna: 'amber', cold: 'amber', contrast: 'amber' }, why: 'Some medicines change how your body handles heat and cold. Ask your GP or pharmacist.' },
      { id: 'B12', text: 'Are you in alcohol or other drug withdrawal or detox now, or were you in the last 2 weeks?', effects: { sauna: withdrawal, cold: withdrawal, contrast: withdrawal }, temp: rules.withdrawalRecheckDays, why: 'Withdrawal affects your heart, blood pressure and fluids. Heat and cold stay locked for now, and we will ask again in two weeks.' },
      { id: 'B13', text: 'Do you have an eating disorder, or are you underweight?', effects: { sauna: 'amber', cold: 'red', contrast: 'red' }, why: 'Low body weight makes cold risky and heat dehydrating. Please talk to your treating team.' },
      { id: 'B14', text: 'Have you had surgery, open wounds or a serious skin problem in the last 6 weeks?', effects: { sauna: 'red', cold: 'red', contrast: 'red' }, temp: rules.temporaryRecheckDays, why: 'Let things heal first. We will ask again in six weeks.' },
      { id: 'B15', text: 'Do you have multiple sclerosis or another condition that heat makes worse?', effects: { sauna: 'amber', contrast: 'amber' }, why: 'Heat can bring on symptoms. Check with your doctor.' },
      { id: 'B16', text: 'Are you 65 or older?', effects: { cold: 'amber', contrast: 'amber' }, why: 'Cold water is a bigger strain on the heart as we get older. Check with your GP first.' },
      { id: 'B17', text: 'Will you have someone with you every time you use a cold plunge or ice bath?', invert: true, effects: { cold: 'red', contrast: 'red' }, support: true, why: 'Cold plunges stay locked until you can always have someone with you. A cold finish to your shower is fine on your own.' },
    ],
    agreement: 'I have read the Hopewick heat and cold rules and I agree to follow them.',
  };
}

const PART_AREAS = { move: ['move'], 'heat-cold': ['sauna', 'cold', 'contrast'] };
export const SCREEN_PARTS = Object.freeze(Object.keys(PART_AREAS));

function addDays(iso, n) { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString(); }
function addMonths(iso, n) { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); }

/**
 * Evaluate one part. answers: { A1: true|false, ... } (every question must be
 * answered). Returns { areas: {area: {outcome, recheckAfter}}, reasons: [...], suggestTrack }.
 */
export function evaluateScreen(part, answers, { rules = R, now = new Date(), agree } = {}) {
  if (!PART_AREAS[part]) throw new ValidationError('Choose part "move" or "heat-cold".', 'part');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new ValidationError('Answer every question.', 'answers');
  const qs = screenQuestions(rules);
  const list = part === 'move' ? qs.move : qs.heatCold;
  if (part === 'heat-cold' && agree !== true) throw new ValidationError('Please read and agree to the heat and cold rules.', 'agree');
  const at = now.toISOString();
  const areas = Object.fromEntries(PART_AREAS[part].map((a) => [a, { outcome: 'green', recheckAfter: null }]));
  const reasons = [];
  let suggestTrack = false;
  for (const q of list) {
    const v = answers[q.id];
    if (typeof v !== 'boolean') throw new ValidationError('Answer every question with yes or no.', q.id);
    const triggered = q.invert ? v === false : v === true;
    if (!triggered) continue;
    if (q.suggestTrack) suggestTrack = true;
    for (const [area, outcome] of Object.entries(q.effects)) {
      if (!areas[area]) continue;
      const cur = areas[area];
      if (RANK[outcome] > RANK[cur.outcome]) cur.outcome = outcome;
      if (outcome === 'red' && q.temp) {
        const until = addDays(at, q.temp);
        if (!cur.recheckAfter || until > cur.recheckAfter) cur.recheckAfter = until;
      }
      reasons.push({ area, outcome, text: q.why, support: Boolean(q.support) });
    }
  }
  // A temporary red is only temporary if no permanent red applies to the same area.
  for (const [area, cur] of Object.entries(areas)) {
    if (cur.outcome !== 'red') { cur.recheckAfter = null; continue; }
    const permanent = list.some((q) => {
      const v = answers[q.id];
      const triggered = q.invert ? v === false : v === true;
      return triggered && q.effects[area] === 'red' && !q.temp;
    });
    if (permanent) cur.recheckAfter = null;
  }
  // De-duplicate reasons (same text across areas) for display.
  const seen = new Set();
  const shown = reasons.filter((r) => { const k = `${r.outcome}|${r.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((r) => ({ outcome: r.outcome, text: r.text, areas: reasons.filter((x) => x.text === r.text).map((x) => x.area) }));
  return { areas, reasons: shown, suggestTrack, completedAt: at, expiresAt: addMonths(at, rules.rescreenMonths) };
}

/** Merge a part result into the stored screen record (outcomes and dates only). */
export function mergeScreen(prev, part, result) {
  const base = prev && typeof prev === 'object' ? prev : { version: SCREEN_VERSION, parts: {}, areas: {} };
  const next = { version: SCREEN_VERSION, parts: { ...(base.parts || {}) }, areas: { ...(base.areas || {}) } };
  next.parts[part] = { completedAt: result.completedAt, expiresAt: result.expiresAt };
  for (const [area, v] of Object.entries(result.areas)) {
    next.areas[area] = { outcome: v.outcome, recheckAfter: v.recheckAfter || null, cleared: false, clearedAt: null, needsRescreen: false };
  }
  return next;
}

/**
 * What an area allows right now.
 * status: unscreened | expired | needs-rescreen | red | needs-clearance | ok
 */
export function areaStatus(screen, area, now = new Date()) {
  const part = area === 'move' ? 'move' : 'heat-cold';
  const p = screen && screen.parts ? screen.parts[part] : null;
  const a = screen && screen.areas ? screen.areas[area] : null;
  if (!p || !a) return { area, status: 'unscreened', unlocked: false };
  const nowIso = now.toISOString();
  if (p.expiresAt && p.expiresAt < nowIso) return { area, status: 'expired', unlocked: false, outcome: a.outcome };
  if (a.needsRescreen) return { area, status: 'needs-rescreen', unlocked: false, outcome: a.outcome };
  if (a.outcome === 'red') {
    const canRecheck = Boolean(a.recheckAfter && a.recheckAfter <= nowIso);
    return { area, status: 'red', unlocked: false, outcome: 'red', recheckAfter: a.recheckAfter || null, canRecheck };
  }
  if (a.outcome === 'amber' && !a.cleared) return { area, status: 'needs-clearance', unlocked: false, outcome: 'amber' };
  return { area, status: 'ok', unlocked: true, outcome: a.outcome, cleared: Boolean(a.cleared), clearedAt: a.clearedAt || null };
}
export function allAreaStatus(screen, now = new Date()) {
  return Object.fromEntries(SCREEN_AREAS.map((a) => [a, areaStatus(screen, a, now)]));
}

/** The doctor's-OK tick. Only amber areas can be cleared; red never can. */
export function applyClearance(screen, areas, now = new Date()) {
  if (!screen || !screen.areas) throw new ValidationError('Answer the safety questions first.', 'screen');
  const next = { ...screen, areas: { ...screen.areas } };
  let changed = 0;
  for (const area of areas) {
    const a = next.areas[area];
    if (!a) continue;
    if (a.outcome === 'red') throw new ValidationError('A red result cannot be unlocked with a tick. Please see your doctor, then answer the questions again if things have changed.', area);
    if (a.outcome === 'amber' && !a.cleared) { next.areas[area] = { ...a, cleared: true, clearedAt: now.toISOString() }; changed += 1; }
  }
  return { screen: next, changed };
}

/** Stopping a session for symptoms asks for a fresh screen before that area unlocks again. */
export function flagRescreen(screen, areas) {
  if (!screen || !screen.areas) return screen;
  const next = { ...screen, areas: { ...screen.areas } };
  for (const area of areas) if (next.areas[area]) next.areas[area] = { ...next.areas[area], needsRescreen: true };
  return next;
}

/* ------------------------------------------------------------------ */
/* Pre-session check (every heat, cold or contrast session)            */
/* ------------------------------------------------------------------ */
export const CHECK_QUESTIONS = Object.freeze([
  { id: 'usedSubstances', text: 'In the last 24 hours, have you had any alcohol or other drugs (including cannabis, or medicines not taken as prescribed)?' },
  { id: 'unwell', text: 'Are you feeling unwell (fever, cold or flu, vomiting or diarrhoea), or exhausted from no sleep?' },
  { id: 'hadWaterFood', text: 'Have you had some water and a little food in the last few hours?' },
  { id: 'supportPerson', text: 'Is someone who can help you right there with you now?', kinds: ['cold', 'contrast'] },
  { id: 'waterTempC', text: 'What is the water temperature (°C)? Check with a thermometer.', kinds: ['cold', 'contrast'], number: true },
]);

/**
 * Returns { ok, blocks: [{code, text}], warnings: [{code, text}], setLockUntil }.
 * lockUntil: the current stored lock (ISO) or null. todayCheckin: { mood, craving } or null.
 * lastStrengthAt: ISO time of the most recent completed strength workout, or null.
 */
export function evaluateCheck(kind, answers, { rules = R, now = new Date(), lockUntil = null, todayCheckin = null, lastStrengthAt = null, stage = null } = {}) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const blocks = [];
  const warnings = [];
  let setLockUntil = null;
  const nowIso = now.toISOString();
  const need = (id) => { if (typeof a[id] !== 'boolean') throw new ValidationError('Answer every safety check question.', id); return a[id]; };
  if (need('usedSubstances')) {
    setLockUntil = new Date(now.getTime() + rules.substanceLockHours * 3600 * 1000).toISOString();
    blocks.push({ code: 'substances', text: `Not today, and that’s okay. Heat and cold with alcohol or other drugs in your system can be really dangerous, even the next day. Sessions are paused for ${rules.substanceLockHours} hours.` });
  } else if (lockUntil && lockUntil > nowIso) {
    blocks.push({ code: 'lock', text: 'Heat and cold are paused for now after a recent safety check. They will open again soon.', until: lockUntil });
  }
  if (need('unwell')) blocks.push({ code: 'unwell', text: 'Give heat and cold a miss while you’re unwell. Rest up and try another day.' });
  if (!need('hadWaterFood')) blocks.push({ code: 'fuel', text: 'Have a glass of water and a little food first, then come back.' });
  const coldSolo = kind === 'cold' && stage === 'cold-shower';
  if ((kind === 'cold' && !coldSolo) || kind === 'contrast') {
    if (!need('supportPerson')) blocks.push({ code: 'support', text: 'Cold water can take your breath away, and that gasp is what catches people out. Please only get in with someone right there. A cold finish to your shower is fine on your own.' });
    const t = a.waterTempC;
    if (t == null || t === '' || !Number.isFinite(Number(t))) blocks.push({ code: 'temp-unknown', text: 'Please check the water temperature with a thermometer first.' });
    else if (Number(t) < rules.coldFloorC) blocks.push({ code: 'too-cold', text: `That’s colder than Hopewick guides. Let it warm up to ${rules.coldFloorC} °C or more.` });
    else if (Number(t) > 20) warnings.push({ code: 'not-cold', text: 'That water is on the mild side, which is fine for building up.' });
  }
  if (rules.notSuggestedOnStruggling && todayCheckin && (todayCheckin.mood === 1 || todayCheckin.craving === 'Strong')) {
    warnings.push({ code: 'not-suggested-today', text: 'Today might be a day for a gentle walk, a coping tool, or a chat with Hope or someone you trust. Heat and cold aren’t suggested today.' });
  }
  if ((kind === 'cold' || kind === 'contrast') && lastStrengthAt) {
    const hours = (now.getTime() - Date.parse(lastStrengthAt)) / 3600000;
    if (hours >= 0 && hours < rules.strengthColdGapHours) warnings.push({ code: 'strength-gap', text: `You did a strength session less than ${rules.strengthColdGapHours} hours ago. Cold water now may reduce your strength gains, so later today or tomorrow is better.` });
  }
  return { ok: blocks.length === 0, blocks, warnings, setLockUntil };
}
