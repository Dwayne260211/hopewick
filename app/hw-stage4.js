/* Hopewick 2.0 Stage 4: recovery tracker and learning modules.
 *
 * Loaded after hw-stage3.js and before the main app script. Uses HW3.kit for
 * shared helpers and registers two screens through HW3.ext:
 *   recovery  Recovery tracker (Tools)
 *   modules   Learning modules (Learn)
 * Data lives on the server per account (/api/me/recovery, /api/me/learning).
 * Demo mode keeps everything in memory and says so. Module text comes from the
 * content release schedule (/api/content/releases): a free account only ever
 * receives the title and teaser of a Plus-first module.
 */
(function () {
  'use strict';
  const HW3 = window.HW3;
  if (!HW3 || !HW3.kit) return;
  const K = HW3.kit;
  const { h, btn, say, announce, todayIso, addDays, dayLabel, header, stateNote, demo, online, plus, api, failMessage, focusId, reducedMotion, chipToggle } = K;

  const GOAL_KINDS = [
    { id: 'abstain', label: 'Stop', long: 'Stopping', hint: 'Not drinking or using at all.' },
    { id: 'reduce', label: 'Cut down', long: 'Cutting down', hint: 'Using less, less often, or more safely.' },
    { id: 'other', label: 'Another habit', long: 'Changing a habit', hint: 'Gambling, smoking, vaping, screen time or anything else.' },
  ];
  const kindOf = (id) => GOAL_KINDS.find((k) => k.id === id) || GOAL_KINDS[2];
  const TRIGGERS = ['Stress', 'Payday', 'Boredom', 'Loneliness', 'Tired', 'Conflict', 'Celebrating', 'Certain people', 'Certain places', 'Time of day', 'Pain', 'Saw or smelled it'];
  const OUTCOMES = [
    { id: 'passed', label: 'It passed' },
    { id: 'used', label: 'I drank or used' },
    { id: 'unsure', label: 'Not sure yet' },
  ];
  /** Same list as MILESTONES in server/wellbeing/recovery.js (the server decides; this is for wording). */
  function milestoneLabel(n) {
    if (n === 1) return '1 day';
    if (n === 7) return '1 week';
    if (n === 14) return '2 weeks';
    if (n === 365) return '1 year';
    if (n === 730) return '2 years';
    if (n === 1095) return '3 years';
    if (n === 1461) return '4 years';
    if (n === 1826) return '5 years';
    if (n === 180) return '6 months';
    if (n === 270) return '9 months';
    if (n === 90) return '3 months';
    return `${n} days`;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
  const CRISIS_RE = /\b(kill(ing)? myself|suicid|end (it|my life)|want(ed)? to die|better off dead|hurt(ing)? myself|self[- ]?harm|no reason to live|not want to be here|don'?t want to be here)\b/i;

  /* ------------------------------------------------------------------ */
  /* State and writes                                                    */
  /* ------------------------------------------------------------------ */
  const s4 = { key: '', loaded: false, loading: null, error: '', goals: [], logs: [], window: null, milestones: [], today: '', progress: {}, insights: null, insightDays: 30 };
  HW3.s4 = s4;
  const ui = {
    goalForm: null, logForm: null, afterLapse: null, menu: null,
    module: null, step: 0, cards: {}, quiz: {}, defusion: { text: '', stage: 0 }, values: {}, tr: null, saved: {}, timer: null,
  };
  HW3.s4ui = ui;
  const nowIso = () => new Date().toISOString();
  const demoId = () => `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

  /** Same rules as goalStats() in server/wellbeing/recovery.js, for demo mode only. */
  function localStats(goal, logs, today) {
    const MS = s4.milestones.length ? s4.milestones : [1, 3, 7, 14, 30, 60, 90, 180, 270, 365, 500, 730, 1000, 1095, 1461, 1826];
    const daysOnPath = Math.max(0, dayNum(today) - dayNum(goal.startDate) + 1);
    const mine = logs.filter((l) => l.goalId === goal.id && l.date >= goal.startDate && l.date <= today);
    const lapseDates = [...new Set(mine.filter((l) => l.kind === 'lapse').map((l) => l.date))].sort();
    const daysToPlan = Math.max(0, daysOnPath - lapseDates.length);
    const last = lapseDates.length ? lapseDates[lapseDates.length - 1] : null;
    const next = MS.find((m) => daysToPlan < m) || null;
    return {
      daysOnPath, daysToPlan, lapseDays: lapseDates.length, lastLapse: last, sinceLastLapse: last ? dayNum(today) - dayNum(last) : null,
      cravingsLogged: mine.filter((l) => l.kind === 'craving').length, cravingsPassed: mine.filter((l) => l.kind === 'craving' && l.outcome === 'passed').length,
      milestones: { reached: MS.filter((m) => daysToPlan >= m), next, toNext: next ? next - daysToPlan : null },
    };
  }
  function restat() { const t = s4.today || todayIso(); s4.goals = s4.goals.map((g) => Object.assign({}, g, { stats: localStats(g, s4.logs, t) })); }

  async function load(force) {
    if (demo()) { if (!s4.loaded) { s4.loaded = true; s4.today = todayIso(); } return s4; }
    if (!online()) { Object.assign(s4, { key: '', loaded: false, goals: [], logs: [], progress: {}, insights: null }); return s4; }
    let acct = '';
    try { acct = billingState.id || ''; } catch (_) { acct = ''; }
    const key = `${acct}:${K.pid()}:${plus() ? 'p' : 'f'}`;
    if (!force && s4.loaded && s4.key === key) return s4;
    if (s4.loading && s4.key === key) return s4.loading;
    if (s4.key !== key) Object.assign(s4, { loaded: false, goals: [], logs: [], progress: {}, insights: null });
    s4.key = key;
    s4.loading = (async () => {
      try {
        const [rec, learn] = await Promise.all([api('GET', '/api/me/recovery'), api('GET', '/api/me/learning'), HW3.loadReleases()]);
        if (s4.key !== key) return s4;
        s4.goals = rec.goals || []; s4.logs = rec.logs || []; s4.window = rec.window || null; s4.milestones = rec.milestones || []; s4.today = rec.today || todayIso();
        s4.progress = {};
        for (const p of learn.progress || []) s4.progress[p.moduleId] = p;
        s4.loaded = true; s4.error = '';
      } catch (err) {
        s4.error = err && err.status === 401 ? 'auth' : 'load';
        s4.loaded = false;
      } finally { s4.loading = null; }
      repaint();
      return s4;
    })();
    return s4.loading;
  }
  HW3.s4load = load;
  function repaint() { try { if (appTab === 'recovery' || appTab === 'modules') HW3.render(appTab); } catch (_) { /* app booting */ } }

  async function goalWrite(method, id, body) {
    if (demo()) {
      if (method === 'POST') s4.goals.push(Object.assign({ id: demoId(), label: '', target: '', why: '', status: 'active', startDate: todayIso(), createdAt: nowIso(), updatedAt: nowIso() }, body));
      else if (method === 'DELETE') { s4.goals = s4.goals.filter((g) => g.id !== id); s4.logs = s4.logs.filter((l) => l.goalId !== id); }
      else s4.goals = s4.goals.map((g) => (g.id === id ? Object.assign({}, g, body, { updatedAt: nowIso() }) : g));
      restat();
      return;
    }
    if (method === 'POST') await api('POST', '/api/me/recovery/goals', body);
    else if (method === 'DELETE') await api('DELETE', `/api/me/recovery/goals/${id}`);
    else await api('PATCH', `/api/me/recovery/goals/${id}`, body);
    await load(true);
  }
  async function logWrite(method, id, body) {
    if (demo()) {
      if (method === 'POST') s4.logs.unshift(Object.assign({ id: demoId(), goalId: null, intensity: null, triggers: [], outcome: null, helped: '', note: '', date: todayIso(), createdAt: nowIso(), updatedAt: nowIso() }, body));
      else if (method === 'DELETE') s4.logs = s4.logs.filter((l) => l.id !== id);
      restat();
      return;
    }
    if (method === 'POST') await api('POST', '/api/me/recovery/logs', body);
    else if (method === 'DELETE') await api('DELETE', `/api/me/recovery/logs/${id}`);
    await load(true);
  }
  let progressTimer = null;
  let entered = false; // set on every tab change (see stopTimers below)
  const pendingPatch = {};
  /** Save module progress or private notes. Notes are encrypted on the server when the data key is set. */
  async function saveProgress(moduleId, patch, { now = false } = {}) {
    const prev = s4.progress[moduleId] || { moduleId, step: 0, completedAt: null, quiz: null, notes: {} };
    const merged = Object.assign({}, prev, { notes: Object.assign({}, prev.notes) });
    if (patch.step !== undefined) merged.step = Math.max(prev.step || 0, patch.step);
    if (patch.completed) merged.completedAt = merged.completedAt || nowIso();
    if (patch.quiz) merged.quiz = patch.quiz;
    for (const k of ['reflection', 'values', 'thoughtRecord']) {
      if (patch[k] === undefined) continue;
      if (patch[k] === null || patch[k] === '' || (Array.isArray(patch[k]) && !patch[k].length)) delete merged.notes[k];
      else merged.notes[k] = patch[k];
    }
    s4.progress[moduleId] = merged;
    if (!online()) return merged;
    // Writes to one module are batched: a quiz result and the next step a moment later go in one request.
    const pending = pendingPatch[moduleId] = Object.assign(pendingPatch[moduleId] || {}, patch);
    if (patch.step !== undefined && pending.step !== undefined) pending.step = Math.max(pending.step, patch.step);
    const send = async () => {
      const body = pendingPatch[moduleId];
      delete pendingPatch[moduleId];
      if (!body) return s4.progress[moduleId];
      const out = await api('PUT', `/api/me/learning/${moduleId}`, body);
      s4.progress[moduleId] = out.progress;
      return out.progress;
    };
    clearTimeout(progressTimer);
    if (now) return send();
    progressTimer = setTimeout(() => { send().catch(() => {}); }, 400);
    return merged;
  }

  /* ------------------------------------------------------------------ */
  /* Recovery tracker                                                    */
  /* ------------------------------------------------------------------ */
  function goalName(g) { return g.label || kindOf(g.kind).long; }
  function bigStat(value, label, id) {
    return h('div', { class: 'hw4-stat', id }, h('span', { class: 'hw4-stat__n', text: String(value) }), h('span', { class: 'hw4-stat__l', text: label }));
  }
  function goalCard(g) {
    const s = g.stats || localStats(g, s4.logs, s4.today || todayIso());
    const id = `hw4G-${g.id}`;
    const paused = g.status === 'paused';
    const sec = h('section', { class: 'hw-card hw3-card hw4-goal', id, 'aria-labelledby': `${id}T` },
      h('div', { class: 'hw3-row-between' },
        h('h2', { class: 'hw3-h2', id: `${id}T`, text: goalName(g) }),
        h('p', { class: 'hw3-badges' }, h('span', { class: 'hw3-tag', text: kindOf(g.kind).long }), paused ? h('span', { class: 'hw3-tag', text: 'Paused' }) : null)),
      g.target ? h('p', { class: 'hw-hint', text: `Your aim: ${g.target}` }) : null);
    sec.appendChild(h('div', { class: 'hw4-stats' },
      bigStat(`Day ${s.daysOnPath}`, `on this path, since ${dayLabel(g.startDate, { year: 'numeric' })}`, `${id}Days`),
      bigStat(s.daysToPlan, s.daysToPlan === 1 ? 'day went to plan' : 'days went to plan', `${id}Plan`),
      s.lastLapse ? bigStat(s.sinceLastLapse, s.sinceLastLapse === 1 ? 'day since your last lapse' : 'days since your last lapse', `${id}Since`) : null));
    if (s.lapseDays) sec.appendChild(h('p', { class: 'hw-hint', text: `A lapse takes that one day out of "went to plan". It never resets your count.` }));
    const reached = s.milestones.reached || [];
    sec.appendChild(h('div', { class: 'hw4-miles', role: 'group', 'aria-label': 'Milestones' },
      h('p', { class: 'hw3-h3', text: reached.length ? 'Milestones reached' : 'Your first milestone is 1 day' }),
      reached.length ? h('ul', { class: 'hw4-chips' }, reached.map((m) => h('li', { class: 'hw4-mile', text: milestoneLabel(m) }))) : null,
      s.milestones.next ? h('p', { class: 'hw-hint', text: `Next: ${milestoneLabel(s.milestones.next)}, ${s.milestones.toNext === 1 ? 'tomorrow if today goes to plan' : `in ${s.milestones.toNext} days`}.` }) : null));
    if (g.why) sec.appendChild(h('p', { class: 'hw4-why' }, h('span', { class: 'hw3-h3', text: 'Why this matters to you: ' }), g.why));
    sec.appendChild(h('div', { class: 'hw-card__actions' },
      btn('Log a craving', () => openLog('craving', g.id), { kind: 'primary', attrs: { id: `${id}Crave` } }),
      btn('Log a lapse', () => openLog('lapse', g.id), { attrs: { id: `${id}Lapse` } }),
      btn('Edit', () => { ui.goalForm = g.id; HW3.render('recovery'); focusId('hw4GoalLabel'); }, { kind: 'ghost', attrs: { id: `${id}Edit` } }),
      btn(paused ? 'Resume' : 'Pause', () => run(() => goalWrite('PATCH', g.id, { status: paused ? 'active' : 'paused' }), paused ? 'Resumed' : 'Paused'), { kind: 'ghost' }),
      btn('Delete', () => {
        if (!confirm(`Delete "${goalName(g)}" and its craving and lapse logs? This cannot be undone.`)) return;
        run(() => goalWrite('DELETE', g.id), 'Goal deleted');
      }, { kind: 'ghost', attrs: { id: `${id}Del` } })));
    return sec;
  }
  async function run(fn, done) {
    try { await fn(); if (done) { say(done); announce(done); } HW3.render(appTab); } catch (e) { say(failMessage(e), true); }
  }
  function goalForm() {
    const g = ui.goalForm && ui.goalForm !== 'new' ? s4.goals.find((x) => x.id === ui.goalForm) : null;
    const draft = { kind: g ? g.kind : 'abstain' };
    const sec = h('section', { class: 'hw-card hw3-card', id: 'hw4GoalForm', 'aria-labelledby': 'hw4GoalFormT' },
      h('h2', { class: 'hw3-h2', id: 'hw4GoalFormT', tabindex: '-1', text: g ? 'Edit your goal' : 'Add a goal' }),
      h('p', { class: 'hw-hint', text: 'Use any words you like. A label is optional, and only you see it.' }));
    const kinds = h('div', { class: 'hw4-kinds', role: 'radiogroup', 'aria-labelledby': 'hw4KindL' });
    const paintKinds = () => kinds.querySelectorAll('[role=radio]').forEach((b) => { const on = b.dataset.k === draft.kind; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    GOAL_KINDS.forEach((k, i) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'hw4-kind', dataset: { k: k.id }, id: `hw4Kind-${k.id}`,
        onclick: () => { draft.kind = k.id; paintKinds(); },
        onkeydown: (e) => {
          if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
          e.preventDefault();
          const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : GOAL_KINDS.length - 1)) % GOAL_KINDS.length;
          draft.kind = GOAL_KINDS[n].id; paintKinds(); kinds.querySelector(`[data-k="${draft.kind}"]`).focus();
        } }, h('span', { class: 'hw3-h3', text: k.label }), h('span', { class: 'hw-hint', text: k.hint }));
      kinds.appendChild(b);
    });
    paintKinds();
    sec.appendChild(h('div', { class: 'hw-field' }, h('span', { class: 'hw-label', id: 'hw4KindL', text: 'What kind of goal?' }), kinds));
    const label = h('input', { class: 'hw-input', id: 'hw4GoalLabel', maxlength: '80', autocomplete: 'off', placeholder: 'For example: Alcohol, Ice, Pokies, Vaping', value: g ? g.label : '' });
    const target = h('input', { class: 'hw-input', id: 'hw4GoalTarget', maxlength: '200', autocomplete: 'off', placeholder: 'For example: no more than 2 drinks, 3 nights a week', value: g ? g.target : '' });
    const start = h('input', { class: 'hw-input', id: 'hw4GoalStart', type: 'date', max: todayIso(), value: g ? g.startDate : todayIso() });
    const why = h('textarea', { class: 'hw-textarea', id: 'hw4GoalWhy', rows: '2', maxlength: '500' });
    why.value = g ? g.why : '';
    const err = h('p', { class: 'hw3-error', id: 'hw4GoalErr', role: 'alert' });
    sec.append(
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4GoalLabel', text: 'Label (optional)' }), label),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4GoalTarget', text: 'Your aim in your words (optional)' }), target),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4GoalStart', text: 'Start date' }), start,
        h('p', { class: 'hw-hint', text: 'Already on your way? Pick the day you started. Day counts include today.' })),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4GoalWhy', text: 'Why this matters to you (optional)' }), why),
      err,
      h('div', { class: 'hw-card__actions' },
        btn(g ? 'Save changes' : 'Add goal', async () => {
          err.textContent = '';
          if (!start.value || start.value > todayIso()) { err.textContent = 'Choose a start date that is today or earlier.'; start.focus(); return; }
          const body = { kind: draft.kind, label: label.value, target: target.value, why: why.value, startDate: start.value };
          try {
            await goalWrite(g ? 'PATCH' : 'POST', g ? g.id : null, body);
            ui.goalForm = null; say(g ? 'Goal saved' : 'Goal added'); announce(g ? 'Goal saved' : 'Goal added');
            HW3.render('recovery'); focusId('hw3Title');
          } catch (e) { err.textContent = failMessage(e); }
        }, { kind: 'primary', attrs: { id: 'hw4GoalSave' } }),
        btn('Cancel', () => { ui.goalForm = null; HW3.render('recovery'); focusId('hw3Title'); }, { kind: 'ghost' })));
    return sec;
  }
  function openLog(kind, goalId) {
    ui.logForm = { kind, goalId: goalId || (s4.goals.find((g) => g.status === 'active') || {}).id || '', triggers: [], outcome: kind === 'craving' ? '' : null, intensity: 5 };
    ui.afterLapse = null;
    HW3.render('recovery');
    focusId('hw4LogT');
  }
  HW3.openRecoveryLog = openLog;
  function logForm() {
    const f = ui.logForm;
    const craving = f.kind === 'craving';
    const sec = h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw4LogForm', 'aria-labelledby': 'hw4LogT' },
      h('h2', { class: 'hw3-h2', id: 'hw4LogT', tabindex: '-1', text: craving ? 'Log a craving' : 'Log a lapse' }),
      h('p', { class: 'hw-hint', text: craving ? 'Noticing a craving is a skill. Logging it helps you see your patterns over time.' : 'Thank you for being honest with yourself. A lapse is information you can learn from, not a verdict.' }));
    const active = s4.goals.filter((g) => g.status !== 'archived');
    let goalSel = null;
    if (active.length) {
      goalSel = h('select', { class: 'hw-input', id: 'hw4LogGoal' }, active.map((g) => h('option', { value: g.id, text: goalName(g) })), h('option', { value: '', text: 'Not linked to a goal' }));
      goalSel.value = f.goalId || '';
      sec.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4LogGoal', text: 'Goal' }), goalSel));
    }
    const date = h('input', { class: 'hw-input', id: 'hw4LogDate', type: 'date', max: todayIso(), value: todayIso() });
    sec.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4LogDate', text: 'When' }), date));
    let range = null;
    if (craving) {
      const out = h('output', { class: 'hw3-out', for: 'hw4LogStrength', id: 'hw4LogStrengthOut', text: `${f.intensity} of 10` });
      range = h('input', { type: 'range', id: 'hw4LogStrength', min: '0', max: '10', step: '1', value: String(f.intensity), 'aria-valuetext': `${f.intensity} of 10`,
        oninput: () => { f.intensity = Number(range.value); out.textContent = `${range.value} of 10`; range.setAttribute('aria-valuetext', `${range.value} of 10`); } });
      sec.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4LogStrength', text: 'How strong was it? (0 is barely there, 10 is the strongest)' }), h('div', { class: 'hw3-range' }, range, out)));
    }
    const trig = h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: craving ? 'What set it off? (optional)' : 'What was going on? (optional)' }));
    const chips = h('div', { class: 'hw-chips' });
    const paintChips = () => {
      chips.replaceChildren(...TRIGGERS.concat(f.triggers.filter((t) => !TRIGGERS.includes(t))).map((t) => chipToggle(t, f.triggers.includes(t), () => {
        f.triggers = f.triggers.includes(t) ? f.triggers.filter((x) => x !== t) : f.triggers.concat(t).slice(0, 12);
        paintChips();
        const again = [...chips.querySelectorAll('button')].find((b) => b.textContent === t); if (again) again.focus();
      })));
    };
    paintChips();
    const own = h('input', { class: 'hw-input', id: 'hw4LogOwn', maxlength: '40', autocomplete: 'off', placeholder: 'Add your own' });
    trig.append(chips, h('div', { class: 'hw3-inline' }, h('label', { class: 'sr-only', for: 'hw4LogOwn', text: 'Add your own trigger' }), own,
      btn('Add', () => { const t = own.value.trim(); if (t && !f.triggers.includes(t)) { f.triggers = f.triggers.concat(t).slice(0, 12); own.value = ''; paintChips(); } own.focus(); })));
    sec.appendChild(trig);
    if (craving) {
      const grp = h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: 'How did it go? (optional)' }));
      OUTCOMES.forEach((o) => {
        const r = h('input', { type: 'radio', name: 'hw4Outcome', id: `hw4Out-${o.id}`, value: o.id, onchange: () => { f.outcome = o.id; } });
        if (f.outcome === o.id) r.checked = true;
        grp.appendChild(h('label', { class: 'hw3-check', for: `hw4Out-${o.id}` }, r, o.label));
      });
      sec.appendChild(grp);
    }
    const helped = h('textarea', { class: 'hw-textarea', id: 'hw4LogHelped', rows: '2', maxlength: '300' });
    const note = h('textarea', { class: 'hw-textarea', id: 'hw4LogNote', rows: '2', maxlength: '1000' });
    sec.append(
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4LogHelped', text: craving ? 'What helped, or might help next time? (optional)' : 'What might help next time? (optional)' }), helped),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4LogNote', text: 'Anything else (optional, private to you)' }), note));
    const err = h('p', { class: 'hw3-error', id: 'hw4LogErr', role: 'alert' });
    sec.append(err, h('div', { class: 'hw-card__actions' },
      btn('Save', async () => {
        err.textContent = '';
        if (!date.value || date.value > todayIso()) { err.textContent = 'Choose today or an earlier date.'; date.focus(); return; }
        const body = { kind: f.kind, goalId: goalSel ? goalSel.value || null : null, date: date.value, triggers: f.triggers, helped: helped.value, note: note.value };
        if (craving) { body.intensity = f.intensity; body.outcome = f.outcome || null; }
        try {
          await logWrite('POST', null, body);
          ui.logForm = null;
          if (!craving) ui.afterLapse = { goalId: body.goalId };
          const msg = craving ? 'Craving logged' : 'Lapse logged';
          say(msg); announce(msg);
          HW3.render('recovery');
          focusId(craving ? 'hw3Title' : 'hw4AfterLapseT');
        } catch (e) { err.textContent = failMessage(e); }
      }, { kind: 'primary', attrs: { id: 'hw4LogSave' } }),
      btn('Cancel', () => { ui.logForm = null; HW3.render('recovery'); focusId('hw3Title'); }, { kind: 'ghost' }),
      craving ? btn('Try urge surfing now', () => { try { setAppTab('coping', { tool: 'urge-surfing' }); } catch (_) { /* */ } }, { kind: 'ghost', attrs: { id: 'hw4LogSurf' } }) : null));
    return sec;
  }
  function afterLapseCard() {
    const g = ui.afterLapse.goalId ? s4.goals.find((x) => x.id === ui.afterLapse.goalId) : null;
    const s = g ? (g.stats || localStats(g, s4.logs, todayIso())) : null;
    return h('section', { class: 'hw-card hw3-card hw4-kind-card', id: 'hw4AfterLapse', 'aria-labelledby': 'hw4AfterLapseT' },
      h('h2', { class: 'hw3-h2', id: 'hw4AfterLapseT', tabindex: '-1', text: 'Thank you for logging that' }),
      h('p', { text: 'Lapses are a common part of recovery. They do not wipe out what you have built.' }),
      s ? h('p', { class: 'hw3-h3', text: `You still have ${plural(s.daysToPlan, 'day')} that went to plan, and you are on day ${s.daysOnPath} of this path.` }) : null,
      h('p', { class: 'hw-hint', text: 'If you used after a break, your tolerance may be lower than before. If someone is very drowsy, hard to wake or breathing strangely, call 000.' }),
      h('div', { class: 'hw-card__actions' },
        btn('Open my relapse plan', () => { try { openPlans(); } catch (_) { /* */ } }, { kind: 'primary', attrs: { id: 'hw4AfterPlans' } }),
        btn('Choose a next step', () => { try { setAppTab('nextstep'); } catch (_) { /* */ } }),
        btn('Try urge surfing', () => { try { setAppTab('coping', { tool: 'urge-surfing' }); } catch (_) { /* */ } }, { kind: 'ghost' }),
        btn('Done', () => { ui.afterLapse = null; HW3.render('recovery'); focusId('hw3Title'); }, { kind: 'ghost' })));
  }
  function logsCard() {
    const sec = h('section', { class: 'hw-card hw3-card', id: 'hw4Logs', 'aria-labelledby': 'hw4LogsT' },
      h('h2', { class: 'hw3-h2', id: 'hw4LogsT', text: 'Recent logs' }));
    if (!s4.logs.length) { sec.appendChild(h('p', { class: 'hw-hint', text: 'Nothing logged yet. When a craving or lapse happens, logging it takes about a minute.' })); }
    else {
      sec.appendChild(h('ul', { class: 'hw3-list' }, s4.logs.slice(0, 40).map((l) => {
        const g = s4.goals.find((x) => x.id === l.goalId);
        const bits = [];
        if (l.kind === 'craving' && l.intensity != null) bits.push(`strength ${l.intensity} of 10`);
        if (l.outcome) bits.push((OUTCOMES.find((o) => o.id === l.outcome) || {}).label);
        if (l.triggers && l.triggers.length) bits.push(l.triggers.join(', '));
        return h('li', { class: 'hw3-list__item' },
          h('div', {},
            h('p', { class: 'hw3-list__title', text: `${l.kind === 'craving' ? 'Craving' : 'Lapse'} · ${dayLabel(l.date)}${g ? ` · ${goalName(g)}` : ''}` }),
            bits.length ? h('p', { class: 'hw-hint', text: bits.join(' · ') }) : null,
            l.helped ? h('p', { class: 'hw-hint', text: `Helped: ${l.helped}` }) : null),
          h('div', { class: 'hw3-list__actions' }, btn('Delete', () => { if (confirm('Delete this log?')) run(() => logWrite('DELETE', l.id), 'Log deleted'); }, { kind: 'ghost', attrs: { 'aria-label': `Delete ${l.kind} log from ${dayLabel(l.date)}` } })));
      })));
    }
    const note = K.windowNote(s4.window, 'log', 'logs', 'hw4LogsWindow');
    if (note) sec.appendChild(note);
    return sec;
  }
  function insightsCard() {
    const sec = h('section', { class: 'hw-card hw3-card', id: 'hw4Insights', 'aria-labelledby': 'hw4InsightsT' },
      h('h2', { class: 'hw3-h2', id: 'hw4InsightsT', text: 'Trends and insights' }));
    if (!plus()) {
      sec.appendChild(K.plusInfo('hw4InsPlus', 'Trends over 30 and 90 days, your most common triggers and what helped are part of Hopewick Plus. Your goals, day counts, milestones and logging stay free.', 'See Hopewick Plus'));
      return sec;
    }
    if (demo()) { sec.appendChild(h('p', { class: 'hw-hint', text: 'Demo: insights describe what you logged over 30 or 90 days. Nothing is saved in the demo.' })); return sec; }
    const days = s4.insightDays;
    sec.appendChild(h('div', { class: 'hw-chips hw3-seg', role: 'group', 'aria-label': 'Time range' },
      [30, 90].map((d) => h('button', { type: 'button', class: 'hw-chip', id: `hw4Ins${d}`, 'aria-pressed': d === days ? 'true' : 'false',
        onclick: () => { s4.insightDays = d; s4.insights = null; HW3.render('recovery'); focusId(`hw4Ins${d}`); } }, `${d} days`))));
    const ins = s4.insights && s4.insights.days === days ? s4.insights : null;
    if (!ins) {
      sec.appendChild(h('p', { class: 'hw-hint', role: 'status', text: 'Loading…' }));
      api('GET', `/api/me/recovery/insights?days=${days}`).then((r) => { s4.insights = r.insights; HW3.render('recovery'); }).catch(() => {});
      return sec;
    }
    sec.appendChild(h('ul', { class: 'hw4-lines' }, ins.lines.map((l) => h('li', { text: l }))));
    const max = Math.max(1, ...ins.weeks.map((w) => w.cravings));
    sec.appendChild(h('table', { class: 'hw3-table hw4-weeks', id: 'hw4Weeks' },
      h('caption', { class: 'sr-only', text: 'Cravings and lapses logged each week' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Week ending' }), h('th', { scope: 'col', text: 'Cravings' }), h('th', { scope: 'col', text: 'Lapses' }), h('th', { scope: 'col', text: 'Average strength' }))),
      h('tbody', {}, ins.weeks.map((w) => h('tr', {},
        h('th', { scope: 'row', text: dayLabel(w.to) }),
        h('td', {}, h('span', { class: 'hw4-bar', 'aria-hidden': 'true', style: `width:${Math.round((w.cravings / max) * 100)}%` }), h('span', { text: String(w.cravings) })),
        h('td', { text: String(w.lapses) }),
        h('td', { text: w.averageStrength == null ? '–' : `${w.averageStrength} of 10` }))))));
    sec.appendChild(h('p', { class: 'hw-hint', text: ins.note }));
    return sec;
  }
  function helpLinks() {
    return h('section', { class: 'hw-card hw3-card', id: 'hw4Helps', 'aria-labelledby': 'hw4HelpsT' },
      h('h2', { class: 'hw3-h2', id: 'hw4HelpsT', text: 'Tools that can help' }),
      h('div', { class: 'hw-card__actions' },
        btn('Urge surfing', () => { try { setAppTab('coping', { tool: 'urge-surfing' }); } catch (_) { /* */ } }),
        btn('Relapse and exit plans', () => { try { openPlans(); } catch (_) { /* */ } }),
        btn('My safety plan', () => { try { setAppTab('safety'); } catch (_) { /* */ } }),
        btn('My next step', () => { try { setAppTab('nextstep'); } catch (_) { /* */ } }),
        btn('Cravings and triggers module', () => openModule('cravings-triggers'), { kind: 'ghost' }),
        btn('Get help now', () => { try { openHelp(); } catch (_) { /* */ } }, { kind: 'ghost' })));
  }
  function renderRecovery(root) {
    root.appendChild(header('Recovery tracker', 'Track what you are working on, in your own words. Every day counts, and a lapse never wipes out your progress.'));
    const note = stateNote();
    if (note) root.appendChild(note);
    if (s4.error === 'load' && !demo()) root.appendChild(h('div', { class: 'hw3-note hw3-note--warn', role: 'status' }, 'Hopewick could not load your tracker just now. ', btn('Try again', () => load(true))));
    if (ui.afterLapse) root.appendChild(afterLapseCard());
    if (ui.logForm) root.appendChild(logForm());
    const shown = s4.goals.filter((g) => g.status !== 'archived');
    if (ui.goalForm) root.appendChild(goalForm());
    else if (!shown.length && (online() ? s4.loaded : true)) {
      root.appendChild(h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw4Empty', 'aria-labelledby': 'hw4EmptyT' },
        h('h2', { class: 'hw3-h2', id: 'hw4EmptyT', text: 'Start with one goal' }),
        h('p', { text: 'Stopping, cutting down or changing another habit all count. You choose the words, and you can change them any time.' }),
        h('div', { class: 'hw-card__actions' }, btn('Add a goal', () => { ui.goalForm = 'new'; HW3.render('recovery'); focusId('hw4GoalFormT'); }, { kind: 'primary', attrs: { id: 'hw4AddFirst' } }))));
    }
    shown.forEach((g) => root.appendChild(goalCard(g)));
    if (shown.length && !ui.goalForm) {
      root.appendChild(h('div', { class: 'hw-card__actions' },
        btn('Add another goal', () => { ui.goalForm = 'new'; HW3.render('recovery'); focusId('hw4GoalFormT'); }, { attrs: { id: 'hw4AddGoal' } }),
        !ui.logForm ? btn('Log a craving (no goal)', () => openLog('craving', ''), { kind: 'ghost' }) : null));
    }
    if (s4.logs.length || shown.length) root.appendChild(logsCard());
    if (shown.length) root.appendChild(insightsCard());
    root.appendChild(helpLinks());
    root.appendChild(h('p', { class: 'hw-hint', text: 'The Clean time counter in Tools still works as before, from the sober start date in Settings. This tracker is saved to your account, with your own goals and logs.' }));
    root.appendChild(K.myDataCard());
    // Fresh data each time the screen is opened (another device may have logged something); cached while on it.
    if (online()) { const fresh = entered; entered = false; load(fresh); }
  }

  /* ------------------------------------------------------------------ */
  /* Learning modules                                                    */
  /* ------------------------------------------------------------------ */
  /** Repaint the modules screen even while a guided timer is running (background repaints wait). */
  function rerender() { ui.forcing = true; try { HW3.render('modules'); } finally { ui.forcing = false; } }
  const modules = () => (HW3.state.releases || []).filter((r) => r.kind === 'module');
  const moduleByKey = (k) => modules().find((m) => m.key === k) || null;
  function metaLine(r) {
    const m = r.meta || {};
    return [m.minutes ? `${m.minutes} min` : null, m.topic, m.approach].filter(Boolean).join(' · ');
  }
  function progressLabel(r) {
    const p = s4.progress[r.key];
    const n = r.content ? r.content.steps.length : 0;
    if (!p) return 'Not started';
    if (p.completedAt) return 'Done';
    return `Step ${Math.min((p.step || 0) + 1, n || 1)} of ${n || '?'}`;
  }
  function openModule(key) {
    stopTimer();
    ui.module = key;
    const p = s4.progress[key];
    const r = moduleByKey(key);
    const n = r && r.content ? r.content.steps.length : 1;
    ui.step = p && !p.completedAt ? Math.min(p.step || 0, n - 1) : 0;
    ui.cards = {}; ui.quiz = {}; ui.defusion = { text: '', stage: 0 }; ui.values = {}; ui.tr = null; ui.saved = {};
    if (p && p.notes && Array.isArray(p.notes.values)) for (const v of p.notes.values) ui.values[v] = 0;
    try { if (appTab !== 'modules') { setAppTab('modules'); setTimeout(() => { const t = document.getElementById('hw4ModT'); if (t) t.focus(); }, 120); return; } } catch (_) { /* */ }
    rerender();
    focusId('hw4ModT');
  }
  HW3.openModule = openModule;
  function moduleCard(r) {
    const id = `hw4M-${r.key}`;
    const status = r.available ? progressLabel(r) : null;
    return h('li', { class: 'hw-card hw3-card hw4-mod', id },
      h('div', { class: 'hw3-row-between' },
        h('h3', { class: 'hw3-h3 hw4-mod__title', id: `${id}T`, text: r.title }),
        status ? h('span', { class: `hw3-tag${status === 'Done' ? ' hw4-done' : ''}`, text: status }) : null),
      h('p', { class: 'hw-hint', text: metaLine(r) }),
      h('p', { text: r.teaser }),
      K.releaseBadges(r),
      r.available
        ? h('div', { class: 'hw-card__actions' }, btn(status === 'Not started' ? 'Start' : status === 'Done' ? 'Go through it again' : 'Continue', () => openModule(r.key), { kind: 'primary', attrs: { id: `${id}Go`, 'aria-describedby': `${id}T` } }))
        : (plus() ? null : h('div', { class: 'hw-card__actions' }, btn('See Hopewick Plus', () => K.upgrade(), { attrs: { id: `${id}Plus`, 'aria-describedby': `${id}T` } }))));
  }
  function renderModuleList(root) {
    root.appendChild(header('Learning modules', 'Short, practical modules of about 5 minutes. Tap through, try an exercise, and take one small step today.'));
    const note = stateNote();
    if (note && !demo()) root.appendChild(note);
    root.appendChild(h('p', { class: 'hw3-note', role: 'note', id: 'hw4Review' },
      h('strong', { text: 'Pending clinical review. ' }),
      'These modules are general information in Hopewick\'s own words, drawn from Australian public health sources. They are not medical advice or therapy, and they work best alongside support from a GP, counsellor or AOD worker.'));
    const all = modules();
    if (!all.length) { root.appendChild(h('p', { class: 'hw-hint', role: 'status', text: 'Loading modules…' })); HW3.loadReleases().then(() => rerender()); return; }
    const core = all.filter((r) => r.core);
    const extra = all.filter((r) => !r.core);
    root.appendChild(h('section', { class: 'hw4-mods', 'aria-labelledby': 'hw4CoreT' },
      h('h2', { class: 'hw3-h2', id: 'hw4CoreT', text: 'Core modules · always free' }),
      h('ul', { class: 'hw4-modlist' }, core.map(moduleCard))));
    if (extra.length) {
      root.appendChild(h('section', { class: 'hw4-mods', 'aria-labelledby': 'hw4ExtraT' },
        h('h2', { class: 'hw3-h2', id: 'hw4ExtraT', text: plus() ? 'New in Hopewick Plus' : 'In Hopewick Plus first' }),
        h('p', { class: 'hw-hint', text: 'New modules arrive in Hopewick Plus each week and come to the free plan about 6 months later.' }),
        h('ul', { class: 'hw4-modlist' }, extra.map(moduleCard))));
    }
    // Fresh data each time the screen is opened (another device may have logged something); cached while on it.
    if (online()) { const fresh = entered; entered = false; load(fresh); }
  }

  /* ----- module player ----- */
  function stepTitleId() { return 'hw4StepT'; }
  function renderCards(step, idx) {
    const i = ui.cards[idx] || 0;
    const card = step.cards[i];
    const wrap = h('div', { class: 'hw4-cards' });
    const live = h('div', { class: 'hw4-card', id: 'hw4Card', role: 'group', 'aria-roledescription': 'card', 'aria-label': `Card ${i + 1} of ${step.cards.length}`, tabindex: '-1' },
      h('p', { class: 'hw-hint hw4-card__n', text: `${i + 1} of ${step.cards.length}` }),
      h('h3', { class: 'hw3-h3 hw4-card__t', text: card.title }),
      h('p', { class: 'hw4-card__b', text: card.body }));
    const dots = h('div', { class: 'hw4-dots', 'aria-hidden': 'true' }, step.cards.map((_, j) => h('span', { class: `hw4-dot${j === i ? ' is-on' : ''}` })));
    // Keep focus on the button that was pressed so keyboard users can keep tapping; the live region reads the new card.
    const go = (n, from) => {
      ui.cards[idx] = n; rerender();
      const b = document.getElementById(from);
      focusId(b && !b.disabled ? from : 'hw4Card');
      announce(`Card ${n + 1} of ${step.cards.length}. ${step.cards[n].title}. ${step.cards[n].body}`);
    };
    wrap.append(live, dots, h('div', { class: 'hw3-row-between' },
      btn('Previous card', () => go(i - 1, 'hw4CardPrev'), { kind: 'ghost', attrs: { id: 'hw4CardPrev', disabled: i === 0 } }),
      i < step.cards.length - 1 ? btn('Next card', () => go(i + 1, 'hw4CardNext'), { attrs: { id: 'hw4CardNext' } }) : h('span', { class: 'hw-hint', text: 'That\'s all the cards. Tap Next to keep going.' })));
    return wrap;
  }
  function renderQuiz(step, idx, r) {
    const state = ui.quiz[idx] || (ui.quiz[idx] = { picks: {}, checked: false });
    const form = h('form', { class: 'hw4-quiz', id: 'hw4Quiz', onsubmit: (e) => e.preventDefault() });
    step.questions.forEach((q, qi) => {
      const fs = h('fieldset', { class: 'hw3-fieldset hw4-q' }, h('legend', { class: 'hw3-h3', text: `${qi + 1}. ${q.q}` }));
      q.options.forEach((o, oi) => {
        const id = `hw4Q${qi}o${oi}`;
        const inp = h('input', { type: 'radio', name: `hw4Q${qi}`, id, value: String(oi), onchange: () => { state.picks[qi] = oi; } });
        if (state.picks[qi] === oi) inp.checked = true;
        const cls = state.checked ? (oi === q.answer ? ' is-right' : (state.picks[qi] === oi ? ' is-wrong' : '')) : '';
        fs.appendChild(h('label', { class: `hw3-check hw4-opt${cls}`, for: id }, inp, o));
      });
      if (state.checked) {
        const right = state.picks[qi] === q.answer;
        fs.appendChild(h('p', { class: `hw4-fb ${right ? 'hw4-fb--right' : 'hw4-fb--kind'}`, id: `hw4Fb${qi}`, text: `${right ? '✓ ' : ''}${right ? q.right : q.wrong}` }));
      }
      form.appendChild(fs);
    });
    const result = h('p', { class: 'hw4-result', id: 'hw4QuizResult', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
    if (state.checked) {
      const n = step.questions.filter((q, qi) => state.picks[qi] === q.answer).length;
      result.textContent = n === step.questions.length ? `You got all ${n}. Nice work.` : `You got ${n} of ${step.questions.length}. Every answer above has a short explanation.`;
    }
    form.append(result, h('div', { class: 'hw-card__actions' },
      btn(state.checked ? 'Try again' : 'Check my answers', () => {
        if (state.checked) { ui.quiz[idx] = { picks: {}, checked: false }; rerender(); focusId('hw4Q0o0'); return; }
        if (Object.keys(state.picks).length < step.questions.length) { result.textContent = 'Choose an answer for each question first. There is no penalty for guessing.'; return; }
        state.checked = true;
        const n = step.questions.filter((q, qi) => state.picks[qi] === q.answer).length;
        saveProgress(r.key, { quiz: { correct: n, total: step.questions.length } }).catch(() => {});
        rerender(); focusId('hw4QuizResult');
      }, { kind: 'primary', attrs: { id: 'hw4QuizCheck' } })));
    return form;
  }
  function privateSaveNote() {
    if (demo()) return 'Demo mode: nothing is saved.';
    if (!online()) return 'Sign in to save this privately to your account. What you type stays on this screen until you leave.';
    return 'Saved privately to your account and encrypted. It is in your export, and you can delete it any time.';
  }
  function renderReflect(step, idx, r) {
    const p = s4.progress[r.key];
    const ta = h('textarea', { class: 'hw-textarea', id: 'hw4Reflect', rows: '4', maxlength: '2000', 'aria-describedby': 'hw4ReflectHint' });
    ta.value = ui.saved.reflectDraft != null ? ui.saved.reflectDraft : (p && p.notes && p.notes.reflection) || '';
    ta.addEventListener('input', () => { ui.saved.reflectDraft = ta.value; });
    const status = h('p', { class: 'hw-hint', id: 'hw4ReflectStatus', role: 'status' });
    const has = p && p.notes && p.notes.reflection;
    return h('div', { class: 'hw-field' },
      h('label', { class: 'hw-label', for: 'hw4Reflect', text: step.prompt }), ta,
      h('p', { class: 'hw-hint', id: 'hw4ReflectHint', text: `Optional. ${privateSaveNote()}` }),
      online() || demo() ? h('div', { class: 'hw-card__actions' },
        btn('Save privately', async () => {
          try { await saveProgress(r.key, { reflection: ta.value }, { now: true }); ui.saved.reflectDraft = null; status.textContent = ta.value.trim() ? 'Saved privately.' : 'Cleared.'; } catch (e) { status.textContent = failMessage(e); }
        }, { attrs: { id: 'hw4ReflectSave' } }),
        has ? btn('Delete my note', async () => {
          try { await saveProgress(r.key, { reflection: '' }, { now: true }); ui.saved.reflectDraft = ''; rerender(); focusId('hw4Reflect'); announce('Note deleted'); } catch (e) { status.textContent = failMessage(e); }
        }, { kind: 'ghost', attrs: { id: 'hw4ReflectDel' } }) : null) : null,
      status);
  }
  /** "I'm noticing I'm having the thought that …" Nothing typed here is saved or sent anywhere. */
  function defuse(text) {
    let t = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.!?…]+$/, '');
    if (!t) return null;
    if (/^(that|the thought that)\s/i.test(t)) t = t.replace(/^(the thought that|that)\s+/i, '');
    if (!/^I\b|^I'/.test(t)) t = t.charAt(0).toLowerCase() + t.slice(1);
    return { one: `I'm having the thought that ${t}.`, two: `I'm noticing I'm having the thought that ${t}.` };
  }
  HW3.defuse = defuse;
  function renderDefusion(step) {
    const d = ui.defusion;
    const inp = h('input', { class: 'hw-input', id: 'hw4Defuse', maxlength: '200', autocomplete: 'off', placeholder: 'For example: I can\'t cope', value: d.text, 'aria-describedby': 'hw4DefuseHint' });
    inp.addEventListener('input', () => { d.text = inp.value; });
    const out = h('div', { class: 'hw4-defuse-out', id: 'hw4DefuseOut', 'aria-live': 'polite' });
    const r = defuse(d.text);
    if (d.stage > 0 && r) {
      if (CRISIS_RE.test(d.text)) {
        out.appendChild(h('div', { class: 'hw3-support', id: 'hw4DefuseCrisis', role: 'note', tabindex: '-1' },
          h('p', { text: 'That sounds really heavy. You don\'t have to carry it alone.' }),
          h('p', {}, 'Call Lifeline on ', h('a', { href: 'tel:131114', text: '13 11 14' }), ' any time, or ', h('a', { href: 'tel:000', text: '000' }), ' if you are in danger. 13YARN: ', h('a', { href: 'tel:139276', text: '13 92 76' }), '.'),
          h('p', { class: 'hw-hint', text: 'Exercises like this one are not meant for thoughts about ending your life. Please reach out to someone now.' })));
      } else {
        out.appendChild(h('p', { class: 'hw4-thought hw4-thought--raw', text: d.text.trim() }));
        out.appendChild(h('p', { class: 'hw4-thought', id: 'hw4DefuseOne', tabindex: '-1', text: r.one }));
        if (d.stage > 1) {
          out.appendChild(h('p', { class: 'hw4-thought hw4-thought--far', id: 'hw4DefuseTwo', tabindex: '-1', text: r.two }));
          out.appendChild(h('p', { class: 'hw-hint', text: 'Same words, a little more space. Did the thought feel any different, even slightly? There is no right answer.' }));
        }
      }
    }
    const err = h('p', { class: 'hw3-error', role: 'alert' });
    return h('div', { class: 'hw4-defuse' },
      h('p', { text: step.intro }),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw4Defuse', text: step.prompt }), inp,
        h('p', { class: 'hw-hint', id: 'hw4DefuseHint', text: 'Just for you right now. This is not saved.' })),
      err,
      h('div', { class: 'hw-card__actions' },
        btn(d.stage === 0 ? 'Step back from it' : d.stage === 1 ? 'Step back a bit further' : 'Try another thought', () => {
          if (d.stage >= 2) { d.text = ''; d.stage = 0; rerender(); focusId('hw4Defuse'); return; }
          if (!defuse(d.text)) { err.textContent = 'Type a thought first. A few words is plenty.'; inp.focus(); return; }
          d.stage += 1; rerender(); focusId(CRISIS_RE.test(d.text) ? 'hw4DefuseCrisis' : (d.stage === 1 ? 'hw4DefuseOne' : 'hw4DefuseTwo'));
        }, { kind: 'primary', attrs: { id: 'hw4DefuseGo' } })),
      out);
  }
  /* Guided timer (dropping anchor, breathing, expansion). Text-led, so it works with reduced motion and screen readers. */
  function stopTimer() { if (ui.timer && ui.timer.int) clearInterval(ui.timer.int); if (ui.timer) ui.timer.int = null; }
  function renderTimer(step, idx) {
    const t = ui.timer && ui.timer.idx === idx ? ui.timer : (ui.timer = { idx, phase: 0, rep: 0, left: step.phases[0].seconds, int: null, done: false });
    const ph = step.phases[t.phase];
    const total = step.phases.length * step.repeat;
    const pos = t.rep * step.phases.length + t.phase + 1;
    const wrap = h('div', { class: `hw4-timer${reducedMotion() ? ' hw4-timer--still' : ''}`, id: 'hw4Timer' });
    const circle = h('div', { class: 'hw4-timer__circle', 'aria-hidden': 'true', dataset: { phase: /in/i.test(ph.label) && !/out/i.test(ph.label) ? 'in' : /out/i.test(ph.label) ? 'out' : 'steady' }, style: `--hw4-dur:${ph.seconds}s` },
      h('span', { class: 'hw4-timer__count', id: 'hw4TimerCount', text: t.done ? '✓' : String(t.left) }));
    const label = h('p', { class: 'hw4-timer__label', id: 'hw4TimerLabel', text: t.done ? 'Done' : ph.label });
    const text = h('p', { class: 'hw4-timer__text', id: 'hw4TimerText', text: t.done ? 'Well done. Notice how you feel now, and move on when you are ready.' : ph.text });
    const live = h('p', { class: 'sr-only', id: 'hw4TimerLive', 'aria-live': 'polite' });
    const count = () => document.getElementById('hw4TimerCount');
    const tick = () => {
      t.left -= 1;
      if (t.left > 0) { const c = count(); if (c) c.textContent = String(t.left); return; }
      if (t.phase < step.phases.length - 1) t.phase += 1;
      else if (t.rep < step.repeat - 1) { t.rep += 1; t.phase = 0; }
      else { stopTimer(); t.done = true; t.phase = 0; t.rep = 0; t.left = step.phases[0].seconds; rerender(); const l = document.getElementById('hw4TimerLive'); if (l) l.textContent = 'Exercise finished.'; focusId('hw4TimerGo'); return; }
      t.left = step.phases[t.phase].seconds;
      const keep = document.activeElement && document.activeElement.id;
      rerender();
      const l = document.getElementById('hw4TimerLive'); if (l) l.textContent = `${step.phases[t.phase].label}. ${step.phases[t.phase].text}`;
      if (keep) focusId(keep);
    };
    const go = btn(t.int ? 'Pause' : (t.done ? 'Start again' : (pos > 1 || t.left < ph.seconds ? 'Resume' : 'Start')), () => {
      if (t.int) { stopTimer(); rerender(); focusId('hw4TimerGo'); return; }
      if (t.done) { t.done = false; }
      t.int = setInterval(tick, 1000);
      rerender(); focusId('hw4TimerGo');
      const l = document.getElementById('hw4TimerLive'); if (l) l.textContent = `${ph.label}. ${ph.text}`;
    }, { kind: 'primary', attrs: { id: 'hw4TimerGo' } });
    const reset = btn('Reset', () => { stopTimer(); ui.timer = null; rerender(); focusId('hw4TimerGo'); }, { kind: 'ghost', attrs: { id: 'hw4TimerReset' } });
    wrap.append(h('p', { text: step.intro }), circle, label, text,
      h('p', { class: 'hw-hint', id: 'hw4TimerPos', text: t.done ? '' : `Prompt ${pos} of ${total}` }), live,
      h('div', { class: 'hw-card__actions' }, go, reset));
    return wrap;
  }
  function renderValues(step, idx, r) {
    const bins = step.bins || ['Very important', 'Important', 'Not now'];
    const list = h('ul', { class: 'hw4-values', id: 'hw4Values' });
    step.items.forEach((v, vi) => {
      const grp = h('div', { class: 'hw4-value__opts', role: 'group', 'aria-labelledby': `hw4V${vi}` },
        bins.map((b, bi) => h('button', { type: 'button', class: 'hw-chip', id: `hw4V${vi}b${bi}`, 'aria-pressed': ui.values[v] === bi ? 'true' : 'false',
          onclick: () => { if (ui.values[v] === bi) delete ui.values[v]; else ui.values[v] = bi; rerender(); focusId(`hw4V${vi}b${bi}`); } }, b)));
      list.appendChild(h('li', { class: `hw4-value${ui.values[v] === 0 ? ' is-top' : ''}` }, h('span', { class: 'hw3-h3', id: `hw4V${vi}`, text: v }), grp));
    });
    const top = step.items.filter((v) => ui.values[v] === 0);
    const sorted = Object.keys(ui.values).filter((v) => step.items.includes(v)).length;
    const status = h('p', { class: 'hw-hint', id: 'hw4ValuesStatus', role: 'status' });
    const summary = h('div', { class: 'hw4-values__sum', id: 'hw4ValuesSum', 'aria-live': 'polite' },
      h('p', { class: 'hw3-h3', text: `${bins[0]}: ${top.length ? top.join(', ') : 'none yet'}` }),
      h('p', { class: 'hw-hint', text: `${sorted} of ${step.items.length} sorted. You don't need to sort them all.` }));
    return h('div', {}, h('p', { text: step.intro }), list, summary,
      step.saveAs === 'values' && (online() || demo()) ? h('div', { class: 'hw-card__actions' },
        btn('Save my values privately', async () => {
          try { await saveProgress(r.key, { values: top }, { now: true }); status.textContent = top.length ? 'Saved privately.' : 'Cleared.'; } catch (e) { status.textContent = failMessage(e); }
        }, { attrs: { id: 'hw4ValuesSave', disabled: !top.length && !(s4.progress[r.key] && s4.progress[r.key].notes && s4.progress[r.key].notes.values) } })) : null,
      step.saveAs === 'values' ? h('p', { class: 'hw-hint', text: privateSaveNote() }) : h('p', { class: 'hw-hint', text: 'Just for you right now. This is not saved.' }),
      status);
  }
  const TR_FIELDS = [
    { k: 'situation', label: 'What happened? (where, when, who with)', rows: 2 },
    { k: 'thought', label: 'What went through your mind?', rows: 2 },
    { k: 'feeling', label: 'What did you feel, and how strongly? (for example: anxious, 7 out of 10)', rows: 2 },
    { k: 'helpful', label: 'What supports the thought?', rows: 2 },
    { k: 'unhelpful', label: 'What doesn\'t fit with it, or what would you say to a friend?', rows: 2 },
    { k: 'balanced', label: 'A more balanced way to see it', rows: 2 },
  ];
  function renderThoughtRecord(step, idx, r) {
    const saved = (s4.progress[r.key] && s4.progress[r.key].notes && s4.progress[r.key].notes.thoughtRecord) || null;
    if (!ui.tr) ui.tr = Object.assign({}, saved || {});
    const form = h('form', { class: 'hw4-tr', id: 'hw4TR', onsubmit: (e) => e.preventDefault() }, h('p', { text: step.intro }));
    TR_FIELDS.forEach((f, i) => {
      const ta = h('textarea', { class: 'hw-textarea', id: `hw4TR-${f.k}`, rows: String(f.rows), maxlength: '600' });
      ta.value = ui.tr[f.k] || '';
      ta.addEventListener('input', () => { ui.tr[f.k] = ta.value; });
      form.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: `hw4TR-${f.k}`, text: `${i + 1}. ${f.label}` }), ta));
    });
    const status = h('p', { class: 'hw-hint', id: 'hw4TRStatus', role: 'status' });
    form.append(h('p', { class: 'hw-hint', text: privateSaveNote() }),
      online() || demo() ? h('div', { class: 'hw-card__actions' },
        btn('Save privately', async () => {
          try { await saveProgress(r.key, { thoughtRecord: ui.tr }, { now: true }); status.textContent = 'Saved privately.'; } catch (e) { status.textContent = failMessage(e); }
        }, { kind: 'primary', attrs: { id: 'hw4TRSave' } }),
        btn('Clear', async () => {
          if (!confirm('Clear this thought record?')) return;
          ui.tr = {};
          try { if (saved) await saveProgress(r.key, { thoughtRecord: null }, { now: true }); } catch (_) { /* */ }
          rerender(); focusId('hw4TR-situation');
        }, { kind: 'ghost', attrs: { id: 'hw4TRClear' } })) : null,
      status);
    return form;
  }
  function renderTry(step, idx, r) {
    const s = step.step;
    const status = h('p', { class: 'hw-hint', id: 'hw4TryStatus', role: 'status' });
    const tool = s.copingKey && HW3.toolByKey ? HW3.toolByKey(s.copingKey) : null;
    return h('div', { class: 'hw4-try' },
      h('div', { class: 'hw4-try__card' }, h('p', { class: 'hw3-step-now', id: 'hw4TryTitle', text: s.title }), s.detail ? h('p', { text: s.detail }) : null),
      h('div', { class: 'hw-card__actions' },
        btn('Add to My next step', async () => {
          try {
            await HW3.sync(false);
            const cur = HW3.currentStep();
            if (cur && cur.title === s.title) { status.textContent = 'This is already your next step.'; return; }
            if (cur && !confirm(`Your next step is "${cur.title}". Replace it with this one? The old one is kept in your history.`)) return;
            await HW3.replaceOpenStep({ title: s.title, detail: s.detail || '', copingKey: s.copingKey || null });
            status.textContent = 'Added to My next step.';
            say('Added to My next step');
          } catch (e) { status.textContent = failMessage(e); }
        }, { kind: 'primary', attrs: { id: 'hw4TryAdd' } }),
        tool ? btn(`Open ${tool.title}`, () => { try { setAppTab('coping', { tool: s.copingKey }); } catch (_) { /* */ } }, { attrs: { id: 'hw4TryTool' } }) : null),
      status);
  }
  function sourcesBlock(m) {
    return h('details', { class: 'hw3-details hw4-sources', id: 'hw4Sources' },
      h('summary', { text: 'Sources, credits and clinical review' }),
      h('p', { class: 'hw-hint', text: 'Written in Hopewick\'s own words from these sources. No text, scripts or worksheets are copied. Pending review by a qualified clinician.' }),
      h('ul', {}, m.sources.map((s) => h('li', {}, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: `${s.org}: ${s.title}` }) : `${s.org}: ${s.title}`))));
  }
  function renderPlayer(root, r) {
    const m = r.content;
    const n = m.steps.length;
    const i = Math.max(0, Math.min(ui.step, n - 1));
    const step = m.steps[i];
    root.appendChild(btn('← All modules', () => { stopTimer(); ui.module = null; rerender(); focusId('hw3Title'); }, { kind: 'ghost', attrs: { id: 'hw4ModBack', class: 'hw-btn hw-btn--sm hw-btn--ghost hw3-back' } }));
    const sec = h('section', { class: 'hw-card hw3-card hw4-player', 'aria-labelledby': 'hw4ModT' },
      h('p', { class: 'hw-hint', text: `${metaLine(r)} · Pending clinical review` }),
      h('h1', { class: 'hw3-h1', id: 'hw4ModT', tabindex: '-1', text: m.title }),
      h('div', { class: 'hw-progress', role: 'progressbar', 'aria-label': 'Module progress', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(i + 1), 'aria-valuetext': `Step ${i + 1} of ${n}` },
        h('span', { class: 'hw-progress__bar', style: `width:${Math.round(((i + 1) / n) * 100)}%` })),
      h('h2', { class: 'hw3-h2', id: stepTitleId(), tabindex: '-1' }, h('span', { class: 'hw4-stepnum', text: `Step ${i + 1} of ${n}: ` }), step.title));
    const body = h('div', { class: 'hw4-step', id: 'hw4Step', dataset: { type: step.type } });
    if (step.type === 'cards') body.appendChild(renderCards(step, i));
    else if (step.type === 'quiz') body.appendChild(renderQuiz(step, i, r));
    else if (step.type === 'reflect') body.appendChild(renderReflect(step, i, r));
    else if (step.type === 'defusion') body.appendChild(renderDefusion(step, i));
    else if (step.type === 'timer') body.appendChild(renderTimer(step, i));
    else if (step.type === 'values') body.appendChild(renderValues(step, i, r));
    else if (step.type === 'thought-record') body.appendChild(renderThoughtRecord(step, i, r));
    else if (step.type === 'try') body.appendChild(renderTry(step, i, r));
    sec.appendChild(body);
    if (i === n - 1 && m.note) sec.appendChild(h('p', { class: 'hw3-note', role: 'note', text: m.note }));
    const last = i === n - 1;
    sec.appendChild(h('div', { class: 'hw3-row-between hw4-nav' },
      btn('Back', () => { stopTimer(); ui.step = i - 1; rerender(); focusId(stepTitleId()); }, { kind: 'ghost', attrs: { id: 'hw4Prev', disabled: i === 0 } }),
      btn(last ? 'Finish' : 'Next', async () => {
        stopTimer();
        if (last) {
          try { await saveProgress(r.key, { step: i, completed: true }, { now: true }); } catch (_) { /* progress is a nice-to-have */ }
          ui.step = n; ui.done = r.key;
          rerender(); focusId('hw4DoneT');
          return;
        }
        ui.step = i + 1;
        saveProgress(r.key, { step: i + 1 }).catch(() => {});
        rerender(); focusId(stepTitleId());
      }, { kind: 'primary', attrs: { id: 'hw4Next' } })));
    sec.appendChild(sourcesBlock(m));
    root.appendChild(sec);
  }
  function renderDone(root, r) {
    const next = modules().find((x) => x.available && x.key !== r.key && !(s4.progress[x.key] && s4.progress[x.key].completedAt));
    root.appendChild(h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw4Done', 'aria-labelledby': 'hw4DoneT' },
      h('h1', { class: 'hw3-h1', id: 'hw4DoneT', tabindex: '-1', text: 'Module finished' }),
      h('p', { text: `You finished "${r.title}". Small steps like this add up.` }),
      h('p', { class: 'hw-hint', text: online() ? 'Your progress is saved to your account.' : (demo() ? 'Demo mode: nothing is saved.' : 'Sign in to keep track of your progress.') }),
      h('div', { class: 'hw-card__actions' },
        next ? btn(`Next: ${next.title}`, () => openModule(next.key), { kind: 'primary', attrs: { id: 'hw4DoneNext' } }) : null,
        btn('All modules', () => { ui.module = null; ui.done = null; rerender(); focusId('hw3Title'); }, { attrs: { id: 'hw4DoneAll' } }),
        btn('Go through it again', () => { ui.done = null; ui.step = 0; rerender(); focusId('hw4ModT'); }, { kind: 'ghost' }))));
  }
  function renderModules(root) {
    const r = ui.module ? moduleByKey(ui.module) : null;
    if (ui.module && !r && !modules().length) { root.appendChild(h('p', { class: 'hw-hint', role: 'status', text: 'Loading…' })); HW3.loadReleases().then(() => rerender()); return; }
    if (r && !r.available) {
      root.appendChild(header(r.title, r.teaser));
      root.appendChild(K.plusInfo('hw4ModLocked', 'This module is in Hopewick Plus first. It comes to the free plan later. The core modules are always free.', 'See Hopewick Plus') || h('p', { class: 'hw-hint', text: 'This module opens soon.' }));
      root.appendChild(btn('All modules', () => { ui.module = null; rerender(); }, { attrs: { id: 'hw4LockedBack' } }));
      return;
    }
    if (r && ui.done === r.key && ui.step >= r.content.steps.length) { renderDone(root, r); return; }
    if (r) { ui.done = null; renderPlayer(root, r); return; }
    ui.module = null;
    renderModuleList(root);
  }

  /* ------------------------------------------------------------------ */
  /* Register                                                            */
  /* ------------------------------------------------------------------ */
  HW3.views.push('recovery', 'modules');
  HW3.ext.recovery = { render: renderRecovery, busy: () => false };
  HW3.ext.modules = { render: renderModules, busy: () => !!(ui.timer && ui.timer.int) && !ui.forcing };
  HW3.DELETE_AREAS.push({ id: 'recovery', label: 'recovery tracker goals and logs' }, { id: 'learning', label: 'learning progress and module notes' });
  const baseStop = HW3.stopTimers;
  HW3.stopTimers = function stopAll() { try { baseStop(); } catch (_) { /* */ } stopTimer(); entered = true; };
  const baseReset = HW3.reset;
  HW3.reset = function resetAll() { baseReset(); Object.assign(s4, { key: '', loaded: false, goals: [], logs: [], progress: {}, insights: null, window: null }); };
})();
