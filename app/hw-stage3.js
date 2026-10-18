/* Hopewick 2.0 Stage 3: daily check-in, coping toolkit, personal goals,
 * journal sync, plans sync, My Next Step.
 *
 * Loaded before the main app script. Every function reads the app's globals
 * (profile, billingState, isDemo, setAppTab, ...) only when it runs.
 * Data lives on the server per account (/api/me/*). Demo mode keeps
 * everything in memory and says so. Nothing here sends anything to Hope
 * unless the person turned that on or said yes for one use.
 */
(function () {
  'use strict';

  const HW3 = {};
  window.HW3 = HW3;

  /* ------------------------------------------------------------------ */
  /* Small DOM helpers                                                   */
  /* ------------------------------------------------------------------ */
  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
  function btn(label, onclick, { kind = 'secondary', size = 'sm', attrs = {} } = {}) {
    return h('button', Object.assign({ type: 'button', class: `hw-btn ${size === 'sm' ? 'hw-btn--sm ' : ''}hw-btn--${kind}`, onclick }, attrs), label);
  }
  function uidLocal() { return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function say(msg, bad) { try { toast(msg, !!bad); } catch (_) { /* toast not ready */ } }
  function announce(msg) {
    const live = document.getElementById('hw3Live');
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }
  }
  const icon = (name, size) => {
    try { return h('span', { class: 'hw3-ico', 'aria-hidden': 'true', html: dashSvg(name, size || 20) }); } catch (_) { return h('span', { 'aria-hidden': 'true' }); }
  };
  function todayIso() { try { return brisbaneDateISO(); } catch (_) { return new Date().toISOString().slice(0, 10); } }
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }
  function dayLabel(iso, opts) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-AU', Object.assign({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }, opts || {})).format(new Date(Date.UTC(y, m - 1, d)));
  }
  function whenLabel(isoTime) {
    if (!isoTime) return '';
    try { return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Brisbane' }).format(new Date(isoTime)); } catch (_) { return ''; }
  }

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */
  const MOODS = [
    { score: 1, label: 'Struggling', e: '😞', legacyE: '😞' },
    { score: 2, label: 'Low', e: '😔', legacyE: '😔' },
    { score: 3, label: 'Okay', e: '😐', legacyE: '😐' },
    { score: 4, label: 'Good', e: '🙂', legacyE: '🙂' },
    { score: 5, label: 'Great', e: '😄', legacyE: '😄' },
  ];
  HW3.MOODS = MOODS;
  const TRIGGERS = ['Work or study', 'Money', 'Relationships', 'Family', 'Loneliness', 'Tiredness', 'Health', 'Conflict', 'Boredom', 'Hunger', 'People or places linked to using', 'Social media or news'];
  const CRAVING_LEVELS = ['None', 'Mild', 'Moderate', 'Strong'];
  const GOAL_CATS = [
    { id: 'wellbeing', label: 'Wellbeing' },
    { id: 'recovery', label: 'Recovery' },
    { id: 'emotional', label: 'Emotional growth' },
    { id: 'other', label: 'Other' },
  ];
  const JOURNAL_KINDS = [
    { id: 'free', label: 'Free writing' },
    { id: 'prompt', label: 'Daily reflection' },
    { id: 'gratitude', label: 'Gratitude' },
    { id: 'recovery', label: 'Recovery reflection' },
  ];
  const PROMPTS = {
    prompt: [
      'What is one thing that went okay today, even a small thing?',
      'What took most of my energy today?',
      'What do I need more of this week, and less of?',
      'When did I feel most like myself today?',
      'What would I like to tell myself from a week ago?',
      'What is something I am learning about myself lately?',
      'What helped me get through a hard moment recently?',
    ],
    gratitude: [
      'Three things I am grateful for today are…',
      'Someone who made my day a little easier was…',
      'Something about my body or health I appreciate today is…',
      'A small comfort I enjoyed today was…',
    ],
    recovery: [
      'What has helped my recovery this week?',
      'What warning signs did I notice, and what did I do?',
      'Who has supported me lately, and how?',
      'What is one reason I want to keep going?',
      'If I had a slip, what can I learn from it without blaming myself?',
    ],
  };
  HW3.PROMPTS = PROMPTS;
  const TOOL_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'anxiety', label: 'Anxiety' },
    { id: 'cravings', label: 'Cravings' },
    { id: 'stress', label: 'Stress' },
    { id: 'hard', label: 'Hard moments' },
    { id: 'low', label: 'Low mood' },
  ];
  const tools = () => (Array.isArray(window.HW_COPING_TOOLS) ? window.HW_COPING_TOOLS : []);
  const toolByKey = (k) => tools().find((t) => t.key === k) || null;
  HW3.toolByKey = toolByKey;

  /* ------------------------------------------------------------------ */
  /* State and storage                                                   */
  /* ------------------------------------------------------------------ */
  const st = {
    key: '', loading: null, loaded: false, error: '',
    settings: { shareCheckinsWithHope: false, journalAiAlways: false, nextStepFollowUps: false, journalImport: 'pending', plansImport: 'pending' },
    checkins: [], legacy: [], activities: [], goals: [], steps: [], journal: [], journalTotal: 0, plans: null,
  };
  HW3.state = st;
  const demo = () => { try { return !!isDemo; } catch (_) { return false; } };
  const signedIn = () => { try { return !!(billingState && billingState.signedIn); } catch (_) { return false; } };
  const online = () => signedIn() && !demo();
  const plus = () => { try { return !!subscriptionPlus(); } catch (_) { return false; } };
  const pid = () => { try { return chatProfileId() || 'main'; } catch (_) { return 'main'; } };
  HW3.online = online;

  async function api(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = method === 'GET' || method === 'DELETE' ? `${path}${sep}profileId=${encodeURIComponent(pid())}` : path;
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(Object.assign({ profileId: pid() }, body)) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) {
      const err = new Error((data && (data.error && data.error.message ? data.error.message : data.error)) || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = (data && (data.code || (data.error && data.error.code))) || '';
      throw err;
    }
    return data;
  }
  HW3.api = api;
  function failMessage(err) {
    if (err && err.code === 'plus') return err.message;
    if (err && err.status === 401) return 'Sign in again to save this. Nothing you typed has been lost on this screen.';
    if (err && err.status === 400) return err.message;
    return 'Hopewick could not save that just now. Please try again in a moment.';
  }

  /** Load everything for this account + profile once; refresh on demand. */
  async function sync(force) {
    if (demo()) {
      if (!st.loaded) {
        // Demo: show the sample check-ins in the trend (nothing is saved).
        const score = { Great: 5, Good: 4, Okay: 3, Tired: 3, Low: 2, Stressed: 2, Struggling: 1 };
        try { st.legacy = moods.filter((m) => m && m.mood && score[m.mood.l]).map((m) => ({ date: m.date, mood: score[m.mood.l], moodLabel: m.mood.l, craving: m.craving || null })); } catch (_) { st.legacy = []; }
      }
      st.loaded = true;
      return st;
    }
    if (!online()) { reset(); return st; }
    let acct = '';
    try { acct = billingState.id || ''; } catch (_) { acct = ''; }
    const key = `${acct}:${pid()}`;
    if (!force && st.loaded && st.key === key) return st;
    if (st.loading && st.key === key) return st.loading;
    if (st.key !== key) reset();
    st.key = key;
    st.loading = (async () => {
      try {
        const [settings, checkins, activities, goals, steps, journal, plans] = await Promise.all([
          api('GET', '/api/me/settings'), api('GET', '/api/me/checkins'), api('GET', '/api/me/activities'),
          api('GET', '/api/me/goals'), api('GET', '/api/me/next-steps'), api('GET', '/api/me/journal'), api('GET', '/api/me/plans'),
        ]);
        if (st.key !== key) return st;
        st.settings = Object.assign({}, st.settings, settings.settings || {});
        st.checkins = checkins.checkins || [];
        st.legacy = checkins.legacy || [];
        st.activities = activities.activities || [];
        st.goals = goals.goals || [];
        st.steps = steps.steps || [];
        st.journal = journal.entries || [];
        st.journalTotal = journal.total || 0;
        st.plans = plans.plans || null;
        st.loaded = true;
        st.error = '';
        adoptJournal();
        adoptPlans();
      } catch (err) {
        st.error = err && err.status === 401 ? 'auth' : 'load';
        st.loaded = false;
      } finally {
        st.loading = null;
      }
      repaint();
      return st;
    })();
    return st.loading;
  }
  HW3.sync = (force) => sync(force).catch(() => st);
  function reset() {
    st.key = ''; st.loaded = false; st.error = ''; st.loading = null;
    st.checkins = []; st.legacy = []; st.activities = []; st.goals = []; st.steps = []; st.journal = []; st.journalTotal = 0; st.plans = null;
    st.settings = { shareCheckinsWithHope: false, journalAiAlways: false, nextStepFollowUps: false, journalImport: 'pending', plansImport: 'pending' };
  }
  HW3.reset = reset;

  /** Re-render whatever Stage 3 screen or dashboard card is visible. */
  function repaint() {
    try {
      if (typeof appTab !== 'undefined') {
        if (appTab === 'home' && document.getElementById('dashGrid')) paintDashSlots();
        if (HW3.views.includes(appTab)) render(appTab);
        if (appTab === 'journal') { try { renderJournalList(); } catch (_) { /* journal not mounted */ } }
      }
    } catch (_) { /* the app is still booting */ }
  }
  HW3.repaint = repaint;

  const latestCheckin = (date) => st.checkins.find((c) => c.date === date) || null;
  const currentStep = () => st.steps.find((s) => s.status === 'open') || null;
  const inProgress = () => st.activities.find((a) => a.status !== 'completed') || null;
  HW3.currentStep = currentStep;
  HW3.latestCheckin = latestCheckin;

  /** Keep the app's older check-in list (Hope context, dashboard basics) in step with a saved check-in. */
  function mirrorLegacy(date, checkin) {
    try {
      let entry = moods.find((m) => m.date === date && checkinOwnedHere(m));
      if (!entry) { entry = { date, mood: null, craving: null, updated: 0 }; moods.push(entry); }
      const m = checkin ? MOODS.find((x) => x.score === checkin.mood) : null;
      entry.mood = m ? { e: m.legacyE, l: m.label } : null;
      entry.craving = checkin ? (checkin.craving || null) : null;
      entry.updated = Date.now();
      tagCheckinEntry(entry);
      saveMoods();
    } catch (_) { /* older list not ready */ }
  }

  /* ------------------------------------------------------------------ */
  /* Writes (server when signed in; memory only in demo)                 */
  /* ------------------------------------------------------------------ */
  const nowIso = () => new Date().toISOString();
  function demoId() { return 'demo-' + uidLocal(); }

  async function saveCheckin(date, payload) {
    let saved;
    if (demo()) {
      const m = MOODS.find((x) => x.score === payload.mood);
      const prev = latestCheckin(date);
      saved = Object.assign({ id: prev ? prev.id : demoId(), date, moodLabel: m.label, createdAt: prev ? prev.createdAt : nowIso() }, payload, { updatedAt: nowIso() });
    } else {
      saved = (await api('PUT', `/api/me/checkins/${date}`, payload)).checkin;
    }
    st.checkins = [saved].concat(st.checkins.filter((c) => c.date !== date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    st.legacy = st.legacy.filter((l) => l.date !== date);
    mirrorLegacy(date, saved);
    return saved;
  }
  async function deleteCheckin(date) {
    if (!demo()) await api('DELETE', `/api/me/checkins/${date}`);
    st.checkins = st.checkins.filter((c) => c.date !== date);
    mirrorLegacy(date, null);
  }
  async function patchSettings(patch) {
    if (demo()) { Object.assign(st.settings, patch); return st.settings; }
    const out = await api('PATCH', '/api/me/settings', patch);
    st.settings = Object.assign({}, st.settings, out.settings || {});
    return st.settings;
  }
  HW3.patchSettings = patchSettings;
  async function startActivity(toolKey) {
    let a;
    if (demo()) a = { id: demoId(), toolKey, toolType: (toolByKey(toolKey) || {}).type, status: 'started', stepIndex: 0, startedAt: nowIso(), updatedAt: nowIso(), completedAt: null, helpful: null, note: '' };
    else a = (await api('POST', '/api/me/activities', { toolKey })).activity;
    st.activities = [a].concat(st.activities);
    return a;
  }
  async function patchActivity(id, patch) {
    let a;
    if (demo()) {
      const prev = st.activities.find((x) => x.id === id);
      a = Object.assign({}, prev, patch, { updatedAt: nowIso() });
      if (patch.status === 'completed') a.completedAt = nowIso();
    } else a = (await api('PATCH', `/api/me/activities/${id}`, patch)).activity;
    st.activities = [a].concat(st.activities.filter((x) => x.id !== id));
    return a;
  }
  async function goalWrite(method, id, body) {
    if (demo()) {
      if (method === 'POST') { const g = Object.assign({ id: demoId(), status: 'active', progress: 0, createdAt: nowIso(), updatedAt: nowIso(), completedAt: null }, body); st.goals.unshift(g); return g; }
      if (method === 'DELETE') { st.goals = st.goals.filter((g) => g.id !== id); return null; }
      const g = Object.assign({}, st.goals.find((x) => x.id === id), body, { updatedAt: nowIso() });
      if (body.status === 'completed') { g.completedAt = nowIso(); g.progress = 100; } else if (body.status) g.completedAt = null;
      st.goals = [g].concat(st.goals.filter((x) => x.id !== id));
      return g;
    }
    if (method === 'POST') { const g = (await api('POST', '/api/me/goals', body)).goal; st.goals.unshift(g); return g; }
    if (method === 'DELETE') { await api('DELETE', `/api/me/goals/${id}`); st.goals = st.goals.filter((g) => g.id !== id); return null; }
    const g = (await api('PATCH', `/api/me/goals/${id}`, body)).goal;
    st.goals = [g].concat(st.goals.filter((x) => x.id !== id));
    return g;
  }
  async function stepWrite(method, id, body) {
    if (demo()) {
      if (method === 'POST') { const s = Object.assign({ id: demoId(), status: 'open', reflection: '', followUpOptIn: false, source: 'user', createdAt: nowIso(), updatedAt: nowIso(), completedAt: null }, body); st.steps.unshift(s); return s; }
      if (method === 'DELETE') { st.steps = st.steps.filter((s) => s.id !== id); return null; }
      const s = Object.assign({}, st.steps.find((x) => x.id === id), body, { updatedAt: nowIso() });
      if (body.status) s.completedAt = body.status === 'done' ? nowIso() : null;
      st.steps = st.steps.map((x) => (x.id === id ? s : x));
      return s;
    }
    if (method === 'POST') { const s = (await api('POST', '/api/me/next-steps', body)).step; st.steps.unshift(s); return s; }
    if (method === 'DELETE') { await api('DELETE', `/api/me/next-steps/${id}`); st.steps = st.steps.filter((s) => s.id !== id); return null; }
    const s = (await api('PATCH', `/api/me/next-steps/${id}`, body)).step;
    st.steps = st.steps.map((x) => (x.id === id ? s : x));
    return s;
  }
  HW3.stepWrite = stepWrite;

  /* ------------------------------------------------------------------ */
  /* Views                                                               */
  /* ------------------------------------------------------------------ */
  HW3.views = ['checkin', 'coping', 'mygoals', 'nextstep'];
  const ui = { checkinDate: null, draft: null, trendRange: 'week', toolFilter: 'all', player: null, goalFilter: 'active', goalEdit: null, stepEdit: false };
  HW3.ui = ui;

  function viewRoot() { return document.getElementById('hw3Inner'); }
  function header(title, lede) {
    return h('div', { class: 'home-hero hw3-hero' }, h('h1', { id: 'hw3Title', tabindex: '-1', text: title }), lede ? h('p', { text: lede }) : null);
  }
  function stateNote() {
    if (demo()) return h('p', { class: 'hw3-note', role: 'note', text: 'Demo mode: nothing you do here is saved.' });
    if (!signedIn()) return h('p', { class: 'hw3-note', role: 'note', text: 'Sign in to save this with your account.' });
    if (st.error === 'load') {
      return h('div', { class: 'hw3-note hw3-note--warn', role: 'status' }, 'Hopewick could not load your saved data just now. ', btn('Try again', () => HW3.sync(true)));
    }
    if (!st.loaded) return h('p', { class: 'hw3-note', role: 'status', text: 'Loading your saved data…' });
    return null;
  }
  function crisisLine() {
    return h('p', { class: 'hw3-crisis-line' },
      'Need to talk to someone now? Call Lifeline on ', h('a', { href: 'tel:131114', text: '13 11 14' }), ' (24/7). In an emergency call ', h('a', { href: 'tel:000', text: '000' }), '. ',
      h('button', { type: 'button', class: 'hw3-link', onclick: () => { try { openHelp(); } catch (_) { /* help dialog missing */ } }, text: 'More help' }), '.');
  }

  /** Called by setAppTab for one of HW3.views. */
  function show(tab, opts) {
    const root = viewRoot();
    if (!root) return;
    if (tab === 'checkin' && opts && opts.date) ui.checkinDate = opts.date;
    if (tab === 'coping' && opts && opts.tool) openTool(opts.tool, { render: false });
    render(tab);
    if (!(opts && opts.skipFocus)) setTimeout(() => { const t = document.getElementById('hw3Title'); if (t) t.focus(); }, 60);
    HW3.sync(false);
  }
  HW3.show = show;
  function render(tab) {
    const root = viewRoot();
    if (!root) return;
    const scroller = document.getElementById('hwFeatureView') || document.scrollingElement;
    const keepScroll = root.dataset.tab === tab && scroller ? scroller.scrollTop : 0;
    root.dataset.tab = tab;
    root.replaceChildren();
    if (tab === 'checkin') renderCheckin(root);
    else if (tab === 'coping') renderCoping(root);
    else if (tab === 'mygoals') renderGoals(root);
    else if (tab === 'nextstep') renderSteps(root);
    root.appendChild(crisisLine());
    if (scroller) scroller.scrollTop = keepScroll;
  }
  HW3.render = render;

  /* ------------------------------------------------------------------ */
  /* 1. Daily check-in                                                   */
  /* ------------------------------------------------------------------ */
  function blankDraft(date) {
    const c = latestCheckin(date);
    return c
      ? { date, mood: c.mood, feelings: c.feelings || '', triggers: (c.triggers || []).slice(), intensity: c.intensity, craving: c.craving || null, notes: c.notes || '', existing: true }
      : { date, mood: null, feelings: '', triggers: [], intensity: null, craving: null, notes: '', existing: false };
  }
  function draftFor(date) {
    if (!ui.draft || ui.draft.date !== date) ui.draft = blankDraft(date);
    return ui.draft;
  }
  HW3.startCheckin = (patch) => {
    const date = todayIso();
    ui.checkinDate = date;
    ui.draft = Object.assign(blankDraft(date), patch || {});
    try { setAppTab('checkin'); } catch (_) { /* tab not wired */ }
  };

  function moodPicker(selected, onPick, labelId) {
    const row = h('div', { class: 'hw3-moods', role: 'radiogroup', 'aria-labelledby': labelId });
    MOODS.forEach((m) => {
      const on = selected === m.score;
      const b = h('button', {
        type: 'button', role: 'radio', class: `hw3-mood hw3-mood--${m.score}`, 'aria-checked': on ? 'true' : 'false', tabindex: on || (!selected && m.score === 1) ? '0' : '-1',
        dataset: { mood: String(m.score) }, onclick: () => {
          [...row.children].forEach((x) => { const sel = x.dataset.mood === String(m.score); x.setAttribute('aria-checked', sel ? 'true' : 'false'); x.tabIndex = sel ? 0 : -1; });
          onPick(m.score);
        },
      }, h('span', { class: 'hw3-mood__face', 'aria-hidden': 'true', text: m.e }), h('span', { class: 'hw3-mood__label', text: m.label }));
      row.appendChild(b);
    });
    // Arrow keys move between options (radio group pattern).
    row.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const list = [...row.querySelectorAll('[role="radio"]')];
      const i = list.indexOf(document.activeElement);
      const next = list[(i + keys[e.key] + list.length) % list.length];
      next.focus();
      next.click();
    });
    return row;
  }
  HW3.moodPicker = moodPicker;

  function chipToggle(label, on, onToggle) {
    return h('button', { type: 'button', class: 'hw-chip', 'aria-pressed': on ? 'true' : 'false', onclick: onToggle }, label);
  }

  function renderCheckin(root) {
    const date = ui.checkinDate || todayIso();
    const d = draftFor(date);
    const isToday = date === todayIso();
    root.appendChild(header('Daily check-in', 'A private moment to notice how you are. It is not a test, and it does not diagnose anything.'));
    const note = stateNote();
    if (note) root.appendChild(note);

    const form = h('form', { class: 'hw-card hw3-card', id: 'hw3CheckinForm', 'aria-labelledby': 'hw3MoodQ', novalidate: true });
    form.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3MoodQ', tabindex: '-1', text: isToday ? 'How are you feeling today?' : `How were you feeling on ${dayLabel(date, { weekday: 'long' })}?` }));
    if (!isToday) form.appendChild(h('p', { class: 'hw-hint', text: 'You are editing an earlier check-in.' }));
    const support = h('div', { class: 'hw3-support', role: 'note', hidden: d.mood !== 1 },
        h('p', { text: 'Thank you for being honest about how you are. You do not have to manage this alone.' }),
        h('p', {}, 'If things feel like too much, Lifeline is there 24/7 on ', h('a', { href: 'tel:131114', text: '13 11 14' }), '. If you or someone else is in danger, call ', h('a', { href: 'tel:000', text: '000' }), '.'));
    form.appendChild(moodPicker(d.mood, (score) => { d.mood = score; support.hidden = score !== 1; const er = document.getElementById('hw3CheckinErr'); if (er) er.textContent = ''; }, 'hw3MoodQ'));
    form.appendChild(support);

    const feel = h('textarea', { class: 'hw-textarea', id: 'hw3Feelings', maxlength: '1000', rows: '3', placeholder: 'For example: tired but hopeful' });
    feel.value = d.feelings;
    feel.addEventListener('input', () => { d.feelings = feel.value; });
    form.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3Feelings', text: 'In your own words (optional)' }), feel));

    // Triggers: presets + custom.
    const trigWrap = h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: 'Anything adding to it? (optional)' }));
    const chips = h('div', { class: 'hw-chips', id: 'hw3Triggers' });
    const all = [...new Set(TRIGGERS.concat(d.triggers))];
    for (const t of all) {
      chips.appendChild(chipToggle(t, d.triggers.includes(t), () => {
        d.triggers = d.triggers.includes(t) ? d.triggers.filter((x) => x !== t) : d.triggers.concat(t);
        const b = [...chips.children].find((c) => c.textContent === t);
        if (b) b.setAttribute('aria-pressed', d.triggers.includes(t) ? 'true' : 'false');
      }));
    }
    trigWrap.appendChild(chips);
    const custom = h('input', { class: 'hw-input', id: 'hw3TriggerCustom', type: 'text', maxlength: '40', placeholder: 'Add your own' });
    const addCustom = () => {
      const v = custom.value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      if (d.triggers.length >= 12) { say('You can choose up to 12.', true); return; }
      if (!d.triggers.some((x) => x.toLowerCase() === v.toLowerCase())) d.triggers.push(v);
      custom.value = '';
      render('checkin');
      setTimeout(() => { const c = document.getElementById('hw3TriggerCustom'); if (c) c.focus(); }, 0);
      announce(`Added ${v}`);
    };
    custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
    trigWrap.appendChild(h('div', { class: 'hw3-inline' }, h('label', { class: 'hw-sr-only', for: 'hw3TriggerCustom', text: 'Add your own trigger' }), custom, btn('Add', addCustom, { attrs: { id: 'hw3TriggerAdd' } })));
    form.appendChild(trigWrap);

    // Intensity 0-10 (optional).
    const val = d.intensity == null ? 5 : d.intensity;
    const range = h('input', { type: 'range', id: 'hw3Intensity', min: '0', max: '10', step: '1', value: String(val), 'aria-describedby': 'hw3IntensityOut' });
    const out = h('output', { id: 'hw3IntensityOut', for: 'hw3Intensity', class: 'hw3-out', text: d.intensity == null ? 'Not set' : `${d.intensity} out of 10` });
    range.setAttribute('aria-valuetext', d.intensity == null ? 'Not set' : `${d.intensity} out of 10`);
    range.addEventListener('input', () => { d.intensity = Number(range.value); out.textContent = `${d.intensity} out of 10`; range.setAttribute('aria-valuetext', out.textContent); });
    const clearI = h('button', { type: 'button', class: 'hw3-link', onclick: () => { d.intensity = null; out.textContent = 'Not set'; range.value = '5'; range.setAttribute('aria-valuetext', 'Not set'); }, text: 'Clear' });
    form.appendChild(h('div', { class: 'hw-field' },
      h('label', { class: 'hw-label', for: 'hw3Intensity', text: 'How strong are these feelings? (optional)' }),
      h('div', { class: 'hw3-range' }, h('span', { class: 'hw-hint', 'aria-hidden': 'true', text: 'Mild' }), range, h('span', { class: 'hw-hint', 'aria-hidden': 'true', text: 'Very strong' })),
      h('div', { class: 'hw3-inline' }, out, clearI)));

    // Cravings (optional).
    const crav = h('div', { class: 'hw-chips', role: 'group', 'aria-labelledby': 'hw3CravLbl' });
    for (const lvl of CRAVING_LEVELS) {
      crav.appendChild(chipToggle(lvl, d.craving === lvl, () => {
        d.craving = d.craving === lvl ? null : lvl;
        [...crav.children].forEach((c) => c.setAttribute('aria-pressed', c.textContent === d.craving ? 'true' : 'false'));
      }));
    }
    form.appendChild(h('div', { class: 'hw-field' }, h('span', { class: 'hw-label', id: 'hw3CravLbl', text: 'Cravings (optional)' }), crav));

    const notes = h('textarea', { class: 'hw-textarea', id: 'hw3Notes', maxlength: '2000', rows: '3' });
    notes.value = d.notes;
    notes.addEventListener('input', () => { d.notes = notes.value; });
    form.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3Notes', text: 'Notes (optional, never shared with Hope)' }), notes));

    const err = h('p', { class: 'hw3-error', id: 'hw3CheckinErr', role: 'alert' });
    form.appendChild(err);
    const saveBtn = h('button', { type: 'submit', class: 'hw-btn hw-btn--primary', id: 'hw3CheckinSave' }, d.existing ? 'Update check-in' : 'Save check-in');
    const actions = h('div', { class: 'hw-card__actions' }, saveBtn);
    if (d.existing) {
      actions.appendChild(btn('Delete this check-in', async () => {
        if (!confirm('Delete this check-in? This cannot be undone.')) return;
        try { await deleteCheckin(date); ui.draft = null; say('Check-in deleted'); announce('Check-in deleted'); render('checkin'); } catch (e) { say(failMessage(e), true); }
      }, { kind: 'ghost', attrs: { id: 'hw3CheckinDelete' } }));
    }
    if (!isToday) actions.appendChild(btn('Back to today', () => { ui.checkinDate = todayIso(); ui.draft = null; render('checkin'); }, { kind: 'ghost' }));
    form.appendChild(actions);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!d.mood) { err.textContent = 'Choose how you are feeling first.'; const first = form.querySelector('[role="radio"]'); if (first) first.focus(); return; }
      err.textContent = '';
      saveBtn.disabled = true;
      try {
        const saved = await saveCheckin(date, { mood: d.mood, feelings: d.feelings, triggers: d.triggers, intensity: d.intensity, craving: d.craving, notes: d.notes });
        ui.draft = null;
        ui.justSaved = saved.date;
        say(d.existing ? 'Check-in updated' : 'Check-in saved');
        render('checkin');
        announce('Check-in saved.');
        const next = document.getElementById('hw3AfterSave');
        if (next) next.focus();
      } catch (ex) {
        err.textContent = failMessage(ex);
        saveBtn.disabled = false;
      }
    });
    root.appendChild(form);

    const saved = latestCheckin(date);
    if (saved && ui.justSaved === date) root.appendChild(afterSaveCard(saved));
    root.appendChild(shareCard());
    root.appendChild(trendsCard());
    root.appendChild(historyCard());
  }

  /** A gentle, rule-based suggestion. Not a judgement about the person. */
  function suggestTool(c) {
    if (!c) return { key: 'breathing-calm', why: 'A slow breath is a good place to start.' };
    if (c.craving === 'Strong' || c.craving === 'Moderate') return { key: 'urge-surfing', why: 'You noted cravings today. Urge surfing can help you ride them out.' };
    if (c.intensity != null && c.intensity >= 8) return { key: 'tipp', why: 'Your feelings are strong right now. TIPP uses your body to bring the intensity down.' };
    if (c.mood === 1) return { key: 'grounding-54321', why: 'Grounding can help when things feel like a lot.' };
    const t = (c.triggers || []).map((x) => x.toLowerCase()).join(' ');
    if (/work|money|study|conflict|news/.test(t)) return { key: 'stress-reset', why: 'A short reset can help with the pressure you noted.' };
    if (c.mood === 2) return { key: 'name-it', why: 'Naming a feeling can make it a little easier to hold.' };
    if (c.mood === 3) return { key: 'mindful-minute', why: 'A mindful minute is a small way to look after yourself.' };
    return { key: 'breathing-calm', why: 'A calm breath can help you keep a good day steady.' };
  }
  HW3.suggestTool = suggestTool;

  function afterSaveCard(saved) {
    const s = suggestTool(saved);
    const tool = toolByKey(s.key);
    return h('section', { class: 'hw-card hw-card--tinted hw3-card', 'aria-labelledby': 'hw3AfterSaveTitle' },
      h('h2', { class: 'hw3-h2', id: 'hw3AfterSaveTitle', text: 'Thanks for checking in' }),
      h('p', { text: `Saved: ${saved.moodLabel}${saved.intensity != null ? `, ${saved.intensity}/10` : ''}.` }),
      tool ? h('p', { text: `${s.why} Would you like to try ${tool.title.toLowerCase()}?` }) : null,
      h('div', { class: 'hw-card__actions' },
        tool ? btn('Suggest a coping exercise', () => { try { setAppTab('coping'); } catch (_) { /* */ } openTool(tool.key); }, { kind: 'primary', attrs: { id: 'hw3AfterSave' } }) : null,
        btn('Talk to Hope', () => { try { setAppTab('chat'); } catch (_) { /* */ } }),
        btn('Done', () => { ui.justSaved = null; render('checkin'); }, { kind: 'ghost' })));
  }

  function switchEl(id, label, on, onChange, desc) {
    const b = h('button', { type: 'button', role: 'switch', class: 'hw-toggle', id, 'aria-checked': on ? 'true' : 'false', 'aria-describedby': desc ? `${id}Desc` : null },
      h('span', { class: 'hw-toggle__track', 'aria-hidden': 'true' }), h('span', { text: label }));
    b.addEventListener('click', async () => {
      const next = b.getAttribute('aria-checked') !== 'true';
      b.disabled = true;
      try { await onChange(next); b.setAttribute('aria-checked', next ? 'true' : 'false'); } catch (e) { say(failMessage(e), true); } finally { b.disabled = false; }
    });
    return h('div', { class: 'hw3-switch' }, b, desc ? h('p', { class: 'hw-hint', id: `${id}Desc`, text: desc }) : null);
  }
  HW3.switchEl = switchEl;

  function shareCard() {
    return h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hw3ShareTitle' },
      h('h2', { class: 'hw3-h2', id: 'hw3ShareTitle', text: 'Sharing with Hope' }),
      switchEl('hw3ShareSwitch', 'Share my check-ins with Hope', st.settings.shareCheckinsWithHope === true, async (on) => {
        await patchSettings({ shareCheckinsWithHope: on });
        say(on ? 'Hope can now see your recent check-ins' : 'Hope will no longer see your check-ins');
      }, 'Off unless you turn it on. When on, Hope sees your mood, feelings, triggers, intensity and cravings from the last 7 check-ins (never your notes), so replies can fit how you are going. Turn it off any time.'));
  }

  /* ----- trends ----- */
  function trendDays(range) {
    const n = range === 'month' ? 30 : 7;
    const end = todayIso();
    const byDate = new Map();
    for (const l of st.legacy) if (l.mood) byDate.set(l.date, { date: l.date, score: l.mood, label: l.moodLabel, legacy: true, craving: l.craving });
    for (const c of st.checkins) byDate.set(c.date, { date: c.date, score: c.mood, label: c.moodLabel, intensity: c.intensity, triggers: c.triggers || [], craving: c.craving });
    const out = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const date = addDays(end, -i);
      out.push(byDate.get(date) || { date, score: null });
    }
    return out;
  }
  HW3.trendDays = trendDays;
  function trendSummary(days, range) {
    const have = days.filter((d) => d.score != null);
    const span = range === 'month' ? 'last 30 days' : 'last 7 days';
    if (!have.length) return `No check-ins in the ${span} yet. When you check in, they will show here.`;
    const scale = (s) => (MOODS.find((m) => m.score === s) || {}).label;
    const lo = Math.min(...have.map((d) => d.score));
    const hi = Math.max(...have.map((d) => d.score));
    const last = have[have.length - 1];
    const parts = [`You checked in on ${have.length} of the ${span}.`];
    parts.push(lo === hi ? `Each check-in was around ${scale(lo)}.` : `Check-ins ranged from ${scale(lo)} to ${scale(hi)}.`);
    parts.push(`The most recent was ${last.label} on ${dayLabel(last.date)}.`);
    const counts = {};
    for (const d of have) for (const t of d.triggers || []) counts[t] = (counts[t] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) parts.push(`Things you noted most: ${top.map(([t, n]) => `${t} (${n})`).join(', ')}.`);
    return parts.join(' ');
  }
  HW3.trendSummary = trendSummary;
  function trendChart(days, range) {
    const W = 320; const H = 170; const L = 78; const R = 10; const T = 12; const B = 30;
    const x = (i) => L + (days.length === 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
    const y = (s) => T + ((5 - s) * (H - T - B)) / 4;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'hw3-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', 'hw3ChartTitle hw3ChartDesc');
    const title = document.createElementNS(ns, 'title'); title.id = 'hw3ChartTitle'; title.textContent = `Mood check-ins, ${range === 'month' ? 'last 30 days' : 'last 7 days'}`;
    const desc = document.createElementNS(ns, 'desc'); desc.id = 'hw3ChartDesc'; desc.textContent = trendSummary(days, range);
    svg.append(title, desc);
    const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.appendChild(n); return n; };
    for (const m of MOODS) {
      add('line', { x1: L, x2: W - R, y1: y(m.score), y2: y(m.score), class: 'hw3-chart__grid' });
      add('text', { x: L - 8, y: y(m.score) + 4, 'text-anchor': 'end', class: 'hw3-chart__ylab' }, m.label);
    }
    let path = '';
    let pen = false;
    days.forEach((d, i) => {
      if (d.score == null) { pen = false; return; }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.score).toFixed(1)} `;
      pen = true;
    });
    if (path) add('path', { d: path.trim(), class: 'hw3-chart__line' });
    days.forEach((d, i) => {
      if (d.score != null) add('circle', { cx: x(i), cy: y(d.score), r: range === 'month' ? 3 : 5, class: d.legacy ? 'hw3-chart__dot hw3-chart__dot--legacy' : 'hw3-chart__dot' });
      const every = range === 'month' ? 7 : 1;
      if (i % every === 0 || i === days.length - 1) {
        add('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'hw3-chart__xlab' }, range === 'month' ? dayLabel(d.date, { weekday: undefined }) : dayLabel(d.date, { day: undefined, month: undefined }));
      }
    });
    return svg;
  }
  function trendsCard() {
    const range = ui.trendRange;
    const days = trendDays(range);
    const tabs = h('div', { class: 'hw-chips hw3-seg', role: 'group', 'aria-label': 'Trend range' },
      chipToggle('Week', range === 'week', () => { ui.trendRange = 'week'; render('checkin'); focusId('hw3TrendWeek'); }),
      chipToggle('Month', range === 'month', () => { ui.trendRange = 'month'; render('checkin'); focusId('hw3TrendMonth'); }));
    tabs.children[0].id = 'hw3TrendWeek';
    tabs.children[1].id = 'hw3TrendMonth';
    const have = days.some((d) => d.score != null);
    const table = h('table', { class: 'hw3-table' },
      h('caption', { class: 'hw-sr-only', text: 'Check-ins by day' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Day' }), h('th', { scope: 'col', text: 'Mood' }), h('th', { scope: 'col', text: 'Intensity' }), h('th', { scope: 'col', text: 'Noted' }))),
      h('tbody', {}, days.slice().reverse().map((d) => h('tr', {},
        h('th', { scope: 'row', text: dayLabel(d.date) }),
        h('td', { text: d.score == null ? 'No check-in' : `${d.label}${d.legacy ? ' (earlier check-in)' : ''}` }),
        h('td', { text: d.intensity == null ? '–' : `${d.intensity}/10` }),
        h('td', { text: [(d.triggers || []).join(', '), d.craving ? `Cravings: ${d.craving}` : ''].filter(Boolean).join('; ') || '–' })))));
    return h('section', { class: 'hw-card hw3-card', id: 'hw3Trends', 'aria-labelledby': 'hw3TrendsTitle' },
      h('div', { class: 'hw3-row-between' }, h('h2', { class: 'hw3-h2', id: 'hw3TrendsTitle', text: 'Your trends' }), tabs),
      h('p', { class: 'hw3-summary', id: 'hw3TrendSummary', text: trendSummary(days, range) }),
      have ? trendChart(days, range) : null,
      have ? h('details', { class: 'hw3-details' }, h('summary', { text: 'Show as a table' }), table) : null,
      h('p', { class: 'hw-hint', text: 'Trends show what you recorded. They are not a diagnosis and do not predict anything.' }));
  }
  function scrollTop() { const v = document.getElementById('hwFeatureView'); if (v) v.scrollTop = 0; }
  function focusId(id) { setTimeout(() => { const n = document.getElementById(id); if (n) n.focus(); }, 0); }
  HW3.focusId = focusId;

  function historyCard() {
    const list = st.checkins.slice(0, 14);
    const sec = h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hw3HistTitle' }, h('h2', { class: 'hw3-h2', id: 'hw3HistTitle', text: 'Recent check-ins' }));
    if (!list.length) {
      sec.appendChild(h('div', { class: 'hw-empty hw-empty--inline' }, h('p', { class: 'hw-empty__title', text: 'No check-ins saved yet' }), h('p', { class: 'hw-empty__body', text: 'Your saved check-ins will be listed here so you can look back, edit or delete them.' })));
      if (st.legacy.length) sec.appendChild(h('p', { class: 'hw-hint', text: `Your ${st.legacy.length} earlier quick check-ins are included in the trends above.` }));
      return sec;
    }
    const ul = h('ul', { class: 'hw3-list' });
    for (const c of list) {
      ul.appendChild(h('li', { class: 'hw3-list__item' },
        h('div', {}, h('p', { class: 'hw3-list__title', text: `${dayLabel(c.date)} · ${c.moodLabel}${c.intensity != null ? ` · ${c.intensity}/10` : ''}` }),
          c.feelings ? h('p', { class: 'hw-hint', text: c.feelings }) : null,
          (c.triggers || []).length ? h('p', { class: 'hw-hint', text: `Noted: ${c.triggers.join(', ')}` }) : null),
        h('div', { class: 'hw3-list__actions' },
          btn('Edit', () => { ui.checkinDate = c.date; ui.draft = null; ui.justSaved = null; render('checkin'); focusId('hw3MoodQ'); scrollTop(); }, { attrs: { 'aria-label': `Edit check-in for ${dayLabel(c.date)}` } }),
          btn('Delete', async () => {
            if (!confirm('Delete this check-in? This cannot be undone.')) return;
            try { await deleteCheckin(c.date); say('Check-in deleted'); render('checkin'); } catch (e) { say(failMessage(e), true); }
          }, { kind: 'ghost', attrs: { 'aria-label': `Delete check-in for ${dayLabel(c.date)}` } }))));
    }
    sec.appendChild(ul);
    return sec;
  }
  HW3.historyCard = historyCard;

  /* ------------------------------------------------------------------ */
  /* 2. Coping toolkit                                                   */
  /* ------------------------------------------------------------------ */
  const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const timers = { breath: null, step: null };
  function stopTimers() {
    if (timers.breath) clearInterval(timers.breath);
    if (timers.step) clearInterval(timers.step);
    timers.breath = null; timers.step = null;
  }
  HW3.stopTimers = stopTimers;

  /** Open a tool's intro screen (or resume an activity that is in progress). */
  function openTool(key, { activity = null, render: doRender = true } = {}) {
    const tool = toolByKey(key);
    if (!tool) return;
    stopTimers();
    ui.player = { key, activity, step: activity ? Math.min(activity.stepIndex || 0, tool.steps.length - 1) : -1, paused: activity ? activity.status === 'paused' : false, done: false, textMode: reducedMotion(), inputs: {}, startedMs: Date.now(), elapsed: 0 };
    if (doRender) { render('coping'); focusId('hw3PlayerTitle'); scrollTop(); }
  }
  HW3.openTool = openTool;
  function closePlayer() { stopTimers(); ui.player = null; render('coping'); focusId('hw3Title'); }

  function renderCoping(root) {
    if (ui.player) { renderPlayer(root); return; }
    root.appendChild(header('Coping toolkit', 'Short, practical exercises for hard moments. They are free, they are general self-help, and they are not a replacement for professional care.'));
    const note = stateNote();
    if (note) root.appendChild(note);
    const open = inProgress();
    if (open && toolByKey(open.toolKey)) {
      const t = toolByKey(open.toolKey);
      root.appendChild(h('section', { class: 'hw-card hw-card--tinted hw3-card', 'aria-labelledby': 'hw3ResumeTitle' },
        h('h2', { class: 'hw3-h2', id: 'hw3ResumeTitle', text: `Pick up where you left off: ${t.title}` }),
        h('p', { class: 'hw-hint', text: `${open.status === 'paused' ? 'Paused' : 'Started'} ${whenLabel(open.updatedAt)}, step ${(open.stepIndex || 0) + 1} of ${t.steps.length}.` }),
        h('div', { class: 'hw-card__actions' }, btn('Resume', () => openTool(t.key, { activity: open }), { kind: 'primary', attrs: { id: 'hw3ResumeBtn' } }))));
    }
    const filters = h('div', { class: 'hw-chips', role: 'group', 'aria-label': 'Show tools for' },
      TOOL_FILTERS.map((f) => chipToggle(f.label, ui.toolFilter === f.id, () => { ui.toolFilter = f.id; render('coping'); focusId(`hw3Filter-${f.id}`); })));
    [...filters.children].forEach((c, i) => { c.id = `hw3Filter-${TOOL_FILTERS[i].id}`; });
    root.appendChild(filters);
    const list = tools().filter((t) => ui.toolFilter === 'all' || (t.tags || []).includes(ui.toolFilter));
    const grid = h('ul', { class: 'hw3-tools', id: 'hw3ToolList' });
    for (const t of list) {
      const lastDone = st.activities.find((a) => a.toolKey === t.key && a.status === 'completed');
      grid.appendChild(h('li', { class: 'hw-card hw3-tool' },
        h('div', { class: 'hw3-tool__head' }, h('span', { class: 'hw-icon-badge' }, icon(t.icon)),
          h('div', {}, h('h2', { class: 'hw3-tool__title', text: t.title }),
            h('p', { class: 'hw-hint', text: `About ${t.minutes} min${t.badge ? ' · ' : ''}` }, t.badge ? h('span', { class: 'hw3-badge', text: t.badge }) : null))),
        h('p', { class: 'hw3-tool__short', text: t.short }),
        lastDone ? h('p', { class: 'hw-hint', text: `Last done ${whenLabel(lastDone.completedAt)}` }) : null,
        h('div', { class: 'hw-card__actions' }, btn(lastDone ? 'Do it again' : 'Start', () => openTool(t.key), { kind: 'primary', attrs: { 'aria-label': `${lastDone ? 'Do again' : 'Start'}: ${t.title}`, dataset: undefined } }))));
    }
    root.appendChild(grid);
    root.appendChild(h('p', { class: 'hw-hint', text: 'Tools marked "DBT-informed" draw on skills from dialectical behaviour therapy. Using them here is not therapy.' }));
    root.appendChild(activityHistory());
  }

  function activityHistory() {
    const done = st.activities.filter((a) => a.status === 'completed').slice(0, 12);
    const sec = h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hw3ActHist' }, h('h2', { class: 'hw3-h2', id: 'hw3ActHist', text: 'Your history' }));
    if (!done.length) {
      sec.appendChild(h('div', { class: 'hw-empty hw-empty--inline' }, h('p', { class: 'hw-empty__title', text: 'Nothing completed yet' }), h('p', { class: 'hw-empty__body', text: 'Exercises you finish are saved here, with whether they helped if you tell us.' })));
      return sec;
    }
    const helpedText = { yes: 'Helped', somewhat: 'Helped a bit', no: 'Did not help this time' };
    const ul = h('ul', { class: 'hw3-list' });
    for (const a of done) {
      const t = toolByKey(a.toolKey);
      ul.appendChild(h('li', { class: 'hw3-list__item' },
        h('div', {}, h('p', { class: 'hw3-list__title', text: t ? t.title : a.toolKey }),
          h('p', { class: 'hw-hint', text: [whenLabel(a.completedAt), a.helpful ? helpedText[a.helpful] : ''].filter(Boolean).join(' · ') }),
          a.note ? h('p', { class: 'hw-hint', text: a.note }) : null),
        t ? h('div', { class: 'hw3-list__actions' }, btn('Revisit', () => openTool(t.key), { attrs: { 'aria-label': `Revisit ${t.title}` } })) : null));
    }
    sec.appendChild(ul);
    return sec;
  }

  let stepSaveTimer = null;
  function saveStepIndex() {
    const p = ui.player;
    if (!p || !p.activity) return;
    clearTimeout(stepSaveTimer);
    const id = p.activity.id;
    const stepIndex = Math.max(0, p.step);
    stepSaveTimer = setTimeout(() => { patchActivity(id, { stepIndex }).then((a) => { if (ui.player && ui.player.activity && ui.player.activity.id === id) ui.player.activity = a; }).catch(() => { /* step position is a convenience */ }); }, 400);
  }

  async function beginTool() {
    const p = ui.player;
    try {
      p.activity = await startActivity(p.key);
      p.step = 0;
      p.paused = false;
      p.startedMs = Date.now();
      render('coping');
      focusId('hw3StepTitle');
    } catch (e) { say(failMessage(e), true); }
  }
  async function setPaused(paused) {
    const p = ui.player;
    p.paused = paused;
    if (paused) stopTimers();
    render('coping');
    focusId(paused ? 'hw3ResumeStep' : 'hw3PauseStep');
    announce(paused ? 'Paused' : 'Resumed');
    if (p.activity) { try { p.activity = await patchActivity(p.activity.id, { status: paused ? 'paused' : 'started', stepIndex: Math.max(0, p.step) }); } catch (e) { say(failMessage(e), true); } }
  }
  async function completeTool() {
    const p = ui.player;
    stopTimers();
    const secs = Math.round((Date.now() - p.startedMs) / 1000);
    try {
      if (p.activity) p.activity = await patchActivity(p.activity.id, { status: 'completed', stepIndex: Math.max(0, p.step), durationSeconds: Math.min(secs, 86400) });
      p.done = true;
      render('coping');
      focusId('hw3DoneTitle');
    } catch (e) { say(failMessage(e), true); }
  }

  function breathingGuide(tool) {
    const b = tool.breath;
    const phases = [['Breathe in', b.in, 'in'], ['Hold', b.hold, 'hold'], ['Breathe out', b.out, 'out'], ['Hold', b.hold2, 'hold']].filter((x) => x[1] > 0);
    const p = ui.player;
    const wrap = h('div', { class: 'hw3-breath' + (p.textMode ? ' hw3-breath--text' : '') });
    const circle = h('div', { class: 'hw3-breath__circle', 'aria-hidden': 'true' }, h('span', { class: 'hw3-breath__count' }));
    const label = h('p', { class: 'hw3-breath__label', id: 'hw3BreathPhase', 'aria-live': 'polite', text: 'Press Start when you are ready' });
    const round = h('p', { class: 'hw-hint', id: 'hw3BreathRound', text: `${b.rounds} rounds, about ${Math.round((phases.reduce((s, x) => s + x[1], 0) * b.rounds) / 6) / 10} minutes` });
    const pattern = h('p', { class: 'hw-hint', text: `Pattern: ${phases.map((x) => `${x[0].toLowerCase()} ${x[1]}`).join(', ')}.` });
    let running = false;
    const startBtn = btn('Start breathing', () => (running ? stop() : start()), { kind: 'primary', attrs: { id: 'hw3BreathStart' } });
    function setPhase(i, left, r) {
      const [name, , kind] = phases[i];
      circle.dataset.phase = kind;
      circle.style.setProperty('--hw3-dur', `${phases[i][1]}s`);
      circle.firstChild.textContent = String(left);
      if (label.textContent !== name) label.textContent = name;
      round.textContent = `Round ${r + 1} of ${b.rounds}`;
    }
    function start() {
      if (p.paused) return;
      running = true;
      startBtn.textContent = 'Stop breathing';
      let i = 0; let left = phases[0][1]; let r = 0;
      setPhase(i, left, r);
      timers.breath = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          i += 1;
          if (i >= phases.length) { i = 0; r += 1; }
          if (r >= b.rounds) { stop(); label.textContent = 'All rounds done. Breathe normally.'; return; }
          left = phases[i][1];
          setPhase(i, left, r);
        } else circle.firstChild.textContent = String(left);
      }, 1000);
    }
    function stop() {
      running = false;
      if (timers.breath) clearInterval(timers.breath);
      timers.breath = null;
      startBtn.textContent = 'Start breathing';
      delete circle.dataset.phase;
      circle.firstChild.textContent = '';
    }
    const textToggle = h('button', { type: 'button', class: 'hw3-link', 'aria-pressed': p.textMode ? 'true' : 'false', onclick: () => { p.textMode = !p.textMode; wrap.classList.toggle('hw3-breath--text', p.textMode); textToggle.setAttribute('aria-pressed', p.textMode ? 'true' : 'false'); textToggle.textContent = p.textMode ? 'Show the animation' : 'Text only (no animation)'; }, text: p.textMode ? 'Show the animation' : 'Text only (no animation)' });
    wrap.append(circle, label, round, pattern, h('div', { class: 'hw-card__actions' }, startBtn, textToggle));
    return wrap;
  }

  function stepTimer(seconds) {
    const wrap = h('div', { class: 'hw3-timer' });
    const out = h('span', { class: 'hw3-timer__out', role: 'timer', 'aria-live': 'off', text: `${seconds}s` });
    const doneMsg = h('span', { class: 'hw-hint', 'aria-live': 'polite' });
    let left = seconds;
    const b = btn(`Start ${seconds}s timer`, () => {
      if (timers.step) { clearInterval(timers.step); timers.step = null; b.textContent = `Start ${seconds}s timer`; return; }
      if (left <= 0) left = seconds;
      doneMsg.textContent = '';
      b.textContent = 'Stop timer';
      timers.step = setInterval(() => {
        left -= 1;
        out.textContent = `${left}s`;
        if (left <= 0) { clearInterval(timers.step); timers.step = null; b.textContent = `Start ${seconds}s timer`; doneMsg.textContent = 'Time is up. Move on when you are ready.'; }
      }, 1000);
    });
    wrap.append(out, b, doneMsg);
    return wrap;
  }

  function renderPlayer(root) {
    const p = ui.player;
    const tool = toolByKey(p.key);
    if (!tool) { ui.player = null; renderCoping(root); return; }
    const back = h('button', { type: 'button', class: 'hw3-link hw3-back', onclick: closePlayer, text: '← All coping tools' });
    root.appendChild(back);
    const card = h('section', { class: 'hw-card hw3-card hw3-player', 'aria-labelledby': 'hw3PlayerTitle' });
    card.appendChild(h('div', { class: 'hw3-tool__head' }, h('span', { class: 'hw-icon-badge' }, icon(tool.icon)),
      h('div', {}, h('h1', { class: 'hw3-h1', id: 'hw3PlayerTitle', tabindex: '-1', text: tool.title }), tool.badge ? h('span', { class: 'hw3-badge', text: tool.badge }) : null)));
    const note = stateNote();
    if (note) card.appendChild(note);

    if (p.done) {
      renderFeedback(card, tool);
      root.appendChild(card);
      return;
    }
    if (p.step < 0) {
      card.appendChild(h('p', { text: tool.intro }));
      card.appendChild(h('p', { class: 'hw-hint', text: `${tool.steps.length} steps, about ${tool.minutes} minutes. You can pause at any time.` }));
      card.appendChild(h('div', { class: 'hw-card__actions' }, btn('Begin', beginTool, { kind: 'primary', size: 'md', attrs: { id: 'hw3BeginTool' } }), btn('Not now', closePlayer, { kind: 'ghost' })));
      root.appendChild(card);
      return;
    }
    const step = tool.steps[p.step];
    const prog = h('div', { class: 'hw-progress', role: 'progressbar', 'aria-label': 'Exercise progress', 'aria-valuemin': '0', 'aria-valuemax': String(tool.steps.length), 'aria-valuenow': String(p.step + 1), 'aria-valuetext': `Step ${p.step + 1} of ${tool.steps.length}` },
      h('span', { class: 'hw-progress__bar', style: `width:${Math.round(((p.step + 1) / tool.steps.length) * 100)}%` }));
    card.appendChild(h('p', { class: 'hw-hint', text: `Step ${p.step + 1} of ${tool.steps.length}${p.paused ? ' · Paused' : ''}` }));
    card.appendChild(prog);
    card.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3StepTitle', tabindex: '-1', text: step.title }));
    card.appendChild(h('p', { class: 'hw3-step-text', text: step.text }));
    if (p.paused) {
      card.appendChild(h('p', { class: 'hw3-note', role: 'status', text: 'Paused. Take whatever time you need.' }));
    } else {
      if (step.breathe && tool.breath) card.appendChild(breathingGuide(tool));
      if (step.seconds) card.appendChild(stepTimer(step.seconds));
      if (step.input) {
        const id = `hw3Input${p.step}`;
        const ta = h('textarea', { class: 'hw-textarea', id, rows: '3', maxlength: '1000', 'aria-describedby': `${id}Hint` });
        ta.value = p.inputs[p.step] || '';
        ta.addEventListener('input', () => { p.inputs[p.step] = ta.value; });
        card.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: id, text: step.input }), ta, h('p', { class: 'hw-hint', id: `${id}Hint`, text: 'Just for you right now. This is not saved.' })));
      }
    }
    const last = p.step === tool.steps.length - 1;
    const nav = h('div', { class: 'hw-card__actions hw3-player__nav' });
    if (p.step > 0) nav.appendChild(btn('Back', () => { stopTimers(); p.step -= 1; saveStepIndex(); render('coping'); focusId('hw3StepTitle'); }, { kind: 'ghost' }));
    if (p.paused) nav.appendChild(btn('Resume', () => setPaused(false), { kind: 'primary', attrs: { id: 'hw3ResumeStep' } }));
    else {
      nav.appendChild(btn('Pause', () => setPaused(true), { attrs: { id: 'hw3PauseStep' } }));
      nav.appendChild(last
        ? btn('Finish', completeTool, { kind: 'primary', attrs: { id: 'hw3FinishTool' } })
        : btn('Next step', () => { stopTimers(); p.step += 1; saveStepIndex(); render('coping'); focusId('hw3StepTitle'); }, { kind: 'primary', attrs: { id: 'hw3NextStep' } }));
    }
    card.appendChild(nav);
    root.appendChild(card);
  }

  function renderFeedback(card, tool) {
    const p = ui.player;
    card.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3DoneTitle', tabindex: '-1', text: 'You finished it. Well done for taking the time.' }));
    if (p.activity && p.activity.helpful) {
      card.appendChild(h('p', { role: 'status', text: 'Thanks. Your answer is saved in your history.' }));
    } else {
      const fs = h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: 'Did this help? (optional)' }));
      const chips = h('div', { class: 'hw-chips' });
      let choice = null;
      [['yes', 'Yes'], ['somewhat', 'A bit'], ['no', 'Not this time']].forEach(([v, l]) => {
        chips.appendChild(chipToggle(l, false, () => { choice = choice === v ? null : v; [...chips.children].forEach((c, i) => c.setAttribute('aria-pressed', ['yes', 'somewhat', 'no'][i] === choice ? 'true' : 'false')); }));
      });
      fs.appendChild(chips);
      const ta = h('textarea', { class: 'hw-textarea', id: 'hw3ActNote', rows: '2', maxlength: '2000' });
      card.appendChild(fs);
      card.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3ActNote', text: 'Anything you want to remember about it? (optional, saved)' }), ta));
      card.appendChild(h('div', { class: 'hw-card__actions' }, btn('Save', async () => {
        if (!choice && !ta.value.trim()) { closePlayer(); return; }
        try { if (p.activity) p.activity = await patchActivity(p.activity.id, { helpful: choice, note: ta.value }); say('Saved'); closePlayer(); } catch (e) { say(failMessage(e), true); }
      }, { kind: 'primary', attrs: { id: 'hw3FeedbackSave' } }), btn('Skip', closePlayer, { kind: 'ghost' })));
    }
    card.appendChild(h('div', { class: 'hw-card__actions' },
      btn('Do it again', () => openTool(tool.key)),
      btn('Talk to Hope about it', () => { stopTimers(); ui.player = null; try { setAppTab('chat'); } catch (_) { /* */ } }, { kind: 'ghost' })));
  }

  /* ------------------------------------------------------------------ */
  /* 3. Personal goals                                                   */
  /* ------------------------------------------------------------------ */
  const catLabel = (id) => (GOAL_CATS.find((c) => c.id === id) || GOAL_CATS[3]).label;
  function goalForm(goal) {
    const g = goal || { title: '', detail: '', category: 'wellbeing', progress: 0 };
    const form = h('form', { class: 'hw-card hw3-card', id: 'hw3GoalForm', 'aria-labelledby': 'hw3GoalFormTitle', novalidate: true });
    form.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3GoalFormTitle', text: goal ? 'Edit goal' : 'Add a goal' }));
    const title = h('input', { class: 'hw-input', id: 'hw3GoalTitle', type: 'text', maxlength: '120', required: true, 'aria-describedby': 'hw3GoalErr', placeholder: 'For example: walk for 15 minutes three times this week' });
    title.value = g.title;
    const detail = h('textarea', { class: 'hw-textarea', id: 'hw3GoalDetail', rows: '2', maxlength: '1000' });
    detail.value = g.detail || '';
    const cat = h('select', { class: 'hw-input', id: 'hw3GoalCat' }, GOAL_CATS.map((c) => h('option', { value: c.id, text: c.label })));
    cat.value = g.category;
    const prog = h('input', { type: 'range', id: 'hw3GoalProg', min: '0', max: '100', step: '10', value: String(g.progress || 0) });
    const out = h('output', { for: 'hw3GoalProg', class: 'hw3-out', text: `${g.progress || 0}%` });
    prog.setAttribute('aria-valuetext', `${g.progress || 0} percent`);
    prog.addEventListener('input', () => { out.textContent = `${prog.value}%`; prog.setAttribute('aria-valuetext', `${prog.value} percent`); });
    const err = h('p', { class: 'hw3-error', id: 'hw3GoalErr', role: 'alert' });
    form.append(
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3GoalTitle', text: 'Goal' }), title),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3GoalDetail', text: 'Why it matters or how you will do it (optional)' }), detail),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3GoalCat', text: 'Category' }), cat),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3GoalProg', text: 'Progress so far' }), h('div', { class: 'hw3-inline' }, prog, out)),
      err,
      h('div', { class: 'hw-card__actions' },
        h('button', { type: 'submit', class: 'hw-btn hw-btn--primary', id: 'hw3GoalSave' }, goal ? 'Save changes' : 'Add goal'),
        btn('Cancel', () => { ui.goalEdit = null; render('mygoals'); }, { kind: 'ghost' })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!title.value.trim()) { err.textContent = 'Give your goal a short name.'; title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
      err.textContent = '';
      title.removeAttribute('aria-invalid');
      const body = { title: title.value, detail: detail.value, category: cat.value, progress: Number(prog.value) };
      try {
        await goalWrite(goal ? 'PATCH' : 'POST', goal ? goal.id : null, body);
        ui.goalEdit = null;
        ui.goalFilter = 'active';
        say(goal ? 'Goal updated' : 'Goal added');
        render('mygoals');
        announce(goal ? 'Goal updated' : 'Goal added');
      } catch (ex) { err.textContent = failMessage(ex); }
    });
    return form;
  }
  function goalItem(g, canEdit) {
    const li = h('li', { class: 'hw-card hw3-goal', dataset: { goal: g.id } });
    li.appendChild(h('div', { class: 'hw3-row-between' }, h('h3', { class: 'hw3-goal__title', text: g.title }), h('span', { class: 'hw3-tag', text: catLabel(g.category) })));
    if (g.detail) li.appendChild(h('p', { class: 'hw-hint', text: g.detail }));
    li.appendChild(h('div', { class: 'hw-progress', role: 'progressbar', 'aria-label': `Progress for ${g.title}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(g.progress || 0) },
      h('span', { class: 'hw-progress__bar', style: `width:${g.progress || 0}%` })));
    li.appendChild(h('p', { class: 'hw-hint', text: g.status === 'completed' ? `Completed ${whenLabel(g.completedAt)}` : `${g.progress || 0}% of the way` }));
    const acts = h('div', { class: 'hw-card__actions' });
    const write = async (method, patch, msg) => {
      try { await goalWrite(method, g.id, patch); say(msg); render('mygoals'); announce(msg); } catch (e) { say(failMessage(e), true); }
    };
    if (canEdit && g.status === 'active') {
      const step = Math.min(100, (g.progress || 0) + 10);
      if (step < 100) acts.appendChild(btn(`+10% (to ${step}%)`, () => write('PATCH', { progress: step }, `Progress ${step}%`), { attrs: { 'aria-label': `Add 10 percent progress to ${g.title}` } }));
      acts.appendChild(btn('Mark complete', () => write('PATCH', { status: 'completed' }, 'Goal completed. Nice work.'), { kind: 'primary', attrs: { 'aria-label': `Mark ${g.title} complete` } }));
      acts.appendChild(btn('Edit', () => { ui.goalEdit = g.id; render('mygoals'); focusId('hw3GoalTitle'); }, { attrs: { 'aria-label': `Edit ${g.title}` } }));
      acts.appendChild(btn('Archive', () => write('PATCH', { status: 'archived' }, 'Goal archived'), { kind: 'ghost', attrs: { 'aria-label': `Archive ${g.title}` } }));
    } else if (canEdit) {
      acts.appendChild(btn('Make active again', () => write('PATCH', { status: 'active' }, 'Goal is active again'), { attrs: { 'aria-label': `Make ${g.title} active again` } }));
      if (g.status === 'completed') acts.appendChild(btn('Archive', () => write('PATCH', { status: 'archived' }, 'Goal archived'), { kind: 'ghost', attrs: { 'aria-label': `Archive ${g.title}` } }));
    }
    acts.appendChild(btn('Delete', async () => { if (!confirm(`Delete the goal "${g.title}"? This cannot be undone.`)) return; await write('DELETE', null, 'Goal deleted'); }, { kind: 'ghost', attrs: { 'aria-label': `Delete ${g.title}` } }));
    li.appendChild(acts);
    return li;
  }
  function renderGoals(root) {
    root.appendChild(header('Personal goals', 'Goals for your wellbeing, recovery and growth. Go at your own pace: there are no streaks to keep and nothing to fall behind on.'));
    const note = stateNote();
    if (note) root.appendChild(note);
    const canEdit = plus() || demo();
    if (!canEdit) {
      const gate = h('div', { class: 'nut-gate plus-feature-gate', id: 'hw3GoalsGate' });
      root.appendChild(gate);
      try {
        renderPlusFeatureGate(gate, {
          lead: 'Personal goals are part of Hopewick Plus. Daily check-ins, coping tools and crisis support stay free.',
          items: ['Set goals in your own words', 'Track progress at your pace', 'Complete or archive goals when you are ready'],
          listLabel: 'Goal tools with Hopewick Plus', buttonId: 'hw3GoalsPlusBtn',
          help: '7 days free, then AU$20/month. Cancel anytime.',
        });
      } catch (_) { gate.textContent = 'Personal goals are part of Hopewick Plus.'; }
    } else if (ui.goalEdit === 'new' || ui.goalEdit) {
      root.appendChild(goalForm(ui.goalEdit === 'new' ? null : st.goals.find((g) => g.id === ui.goalEdit)));
    } else {
      root.appendChild(h('div', { class: 'hw-card__actions' }, btn('Add a goal', () => { ui.goalEdit = 'new'; render('mygoals'); focusId('hw3GoalTitle'); }, { kind: 'primary', size: 'md', attrs: { id: 'hw3GoalAdd' } })));
    }
    if (!canEdit && !st.goals.length) return;
    const counts = { active: 0, completed: 0, archived: 0 };
    for (const g of st.goals) counts[g.status] = (counts[g.status] || 0) + 1;
    const tabs = h('div', { class: 'hw-chips', role: 'group', 'aria-label': 'Show goals' },
      [['active', 'Active'], ['completed', 'Completed'], ['archived', 'Archived']].map(([id, l]) => {
        const b = chipToggle(`${l} (${counts[id]})`, ui.goalFilter === id, () => { ui.goalFilter = id; render('mygoals'); focusId(`hw3GoalTab-${id}`); });
        b.id = `hw3GoalTab-${id}`;
        return b;
      }));
    root.appendChild(tabs);
    const list = st.goals.filter((g) => g.status === ui.goalFilter);
    if (!list.length) {
      const msg = { active: ['No active goals', canEdit ? 'Add one small goal when you are ready. One is plenty.' : 'Your goals will show here.'], completed: ['Nothing completed yet', 'Goals you finish are kept here.'], archived: ['Nothing archived', 'Archive a goal to set it aside without deleting it.'] }[ui.goalFilter];
      root.appendChild(h('div', { class: 'hw-empty' }, h('p', { class: 'hw-empty__title', text: msg[0] }), h('p', { class: 'hw-empty__body', text: msg[1] })));
      return;
    }
    root.appendChild(h('ul', { class: 'hw3-goals', id: 'hw3GoalList' }, list.map((g) => goalItem(g, canEdit))));
  }

  /* ------------------------------------------------------------------ */
  /* 5. My Next Step                                                     */
  /* ------------------------------------------------------------------ */
  function stepEditor(onDone, initial) {
    const form = h('form', { class: 'hw3-stepform', id: 'hw3StepForm', novalidate: true });
    const t = h('input', { class: 'hw-input', id: 'hw3StepTitle', type: 'text', maxlength: '140', 'aria-describedby': 'hw3StepErr' });
    t.value = initial || '';
    const err = h('p', { class: 'hw3-error', id: 'hw3StepErr', role: 'alert' });
    form.append(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3StepTitle', text: 'One small, doable next step' }), t), err,
      h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: 'hw3StepSave' }, 'Save step'), btn('Cancel', () => { ui.stepEdit = false; render('nextstep'); }, { kind: 'ghost' })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!t.value.trim()) { err.textContent = 'Write a short step first.'; t.focus(); return; }
      try { await onDone(t.value.trim()); } catch (ex) { err.textContent = failMessage(ex); }
    });
    return form;
  }
  async function replaceOpenStep(body) {
    const cur = currentStep();
    if (cur) await stepWrite('PATCH', cur.id, { status: 'dismissed' });
    return stepWrite('POST', null, body);
  }
  HW3.replaceOpenStep = replaceOpenStep;

  function renderSteps(root) {
    root.appendChild(header('My next step', 'One small thing you have chosen to do next. Hopewick keeps it here for you. It does not contact anyone or send reminders.'));
    const note = stateNote();
    if (note) root.appendChild(note);
    const cur = currentStep();
    const card = h('section', { class: 'hw-card hw-card--tinted hw3-card', 'aria-labelledby': 'hw3CurStep' });
    if (cur && !ui.stepEdit) {
      card.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3CurStep', text: 'Your step' }));
      card.appendChild(h('p', { class: 'hw3-step-now', id: 'hw3StepNow', tabindex: '-1', text: cur.title }));
      card.appendChild(h('p', { class: 'hw-hint', text: `${cur.source === 'hope' ? 'Suggested in a chat with Hope and saved by you' : 'Added by you'}, ${whenLabel(cur.createdAt)}` }));
      const tool = cur.copingKey ? toolByKey(cur.copingKey) : null;
      const refl = h('textarea', { class: 'hw-textarea', id: 'hw3StepRefl', rows: '2', maxlength: '1000' });
      refl.value = cur.reflection || '';
      card.appendChild(h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3StepRefl', text: 'How did it go? (optional)' }), refl));
      card.appendChild(switchEl('hw3StepFollow', 'I would like a follow-up about this step', !!cur.followUpOptIn, async (on) => {
        await stepWrite('PATCH', cur.id, { followUpOptIn: on });
      }, 'Hopewick only saves this choice for now. It does not send messages or reminders yet, and nobody is contacted.'));
      card.appendChild(h('div', { class: 'hw-card__actions' },
        btn('Mark as done', async () => {
          try { await stepWrite('PATCH', cur.id, { status: 'done', reflection: refl.value }); say('Step done. Well done.'); render('nextstep'); announce('Step marked as done'); focusId('hw3StepAdd'); } catch (e) { say(failMessage(e), true); }
        }, { kind: 'primary', attrs: { id: 'hw3StepDone' } }),
        tool ? btn(`Open ${tool.title}`, () => { try { setAppTab('coping'); } catch (_) { /* */ } openTool(tool.key); }) : null,
        btn('Change step', () => { ui.stepEdit = true; render('nextstep'); focusId('hw3StepTitle'); }, { attrs: { id: 'hw3StepChange' } }),
        btn('Save note', async () => { try { await stepWrite('PATCH', cur.id, { reflection: refl.value }); say('Saved'); } catch (e) { say(failMessage(e), true); } }, { kind: 'ghost' }),
        btn('Delete', async () => { if (!confirm('Delete this step?')) return; try { await stepWrite('DELETE', cur.id); say('Step deleted'); render('nextstep'); } catch (e) { say(failMessage(e), true); } }, { kind: 'ghost', attrs: { id: 'hw3StepDelete' } })));
    } else {
      card.appendChild(h('h2', { class: 'hw3-h2', id: 'hw3CurStep', text: cur ? 'Change your step' : 'No step saved right now' }));
      if (!cur && !ui.stepEdit) {
        card.appendChild(h('p', { text: 'You can add one yourself, or Hope may offer one in a chat. Hope always asks before anything is saved.' }));
        card.appendChild(h('div', { class: 'hw-card__actions' },
          btn('Add my own step', () => { ui.stepEdit = true; render('nextstep'); focusId('hw3StepTitle'); }, { kind: 'primary', attrs: { id: 'hw3StepAdd' } }),
          btn('Talk to Hope', () => { try { setAppTab('chat'); } catch (_) { /* */ } })));
      } else {
        card.appendChild(stepEditor(async (title) => {
          await replaceOpenStep({ title, source: 'user' });
          ui.stepEdit = false;
          say('Step saved');
          render('nextstep');
          focusId('hw3StepNow');
        }, cur ? cur.title : ''));
      }
    }
    root.appendChild(card);
    const past = st.steps.filter((s) => s.status !== 'open').slice(0, 15);
    const sec = h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hw3PastSteps' }, h('h2', { class: 'hw3-h2', id: 'hw3PastSteps', text: 'Earlier steps' }));
    if (!past.length) sec.appendChild(h('p', { class: 'hw-hint', text: 'Steps you finish or change are kept here.' }));
    else {
      sec.appendChild(h('ul', { class: 'hw3-list' }, past.map((s) => h('li', { class: 'hw3-list__item' },
        h('div', {}, h('p', { class: 'hw3-list__title', text: s.title }),
          h('p', { class: 'hw-hint', text: `${s.status === 'done' ? `Done ${whenLabel(s.completedAt)}` : `Set aside ${whenLabel(s.updatedAt)}`}` }),
          s.reflection ? h('p', { class: 'hw-hint', text: `Note: ${s.reflection}` }) : null),
        h('div', { class: 'hw3-list__actions' }, btn('Delete', async () => { try { await stepWrite('DELETE', s.id); render('nextstep'); say('Deleted'); } catch (e) { say(failMessage(e), true); } }, { kind: 'ghost', attrs: { 'aria-label': `Delete step: ${s.title}` } }))))));
    }
    root.appendChild(sec);
  }

  /** Chat: the "Save as my next step?" card under a Hope reply. Nothing is saved until they say yes. */
  HW3.nextStepCard = function nextStepCard(msg, onChange) {
    const s = msg && msg.nextStep;
    if (!s || !s.title) return null;
    const box = h('div', { class: 'hw3-suggest', role: 'group', 'aria-label': 'Suggested next step' });
    if (s.state === 'saved') { box.append(h('p', { class: 'hw3-suggest__done', text: `Saved as your next step: ${s.title}` }), btn('Open My next step', () => { try { setAppTab('nextstep'); } catch (_) { /* */ } })); return box; }
    if (s.state === 'dismissed') return null;
    const canSave = online() || demo();
    const input = h('input', { class: 'hw-input', type: 'text', maxlength: '140', 'aria-label': 'Next step (you can edit it)' });
    input.value = s.title;
    const tool = s.copingKey ? toolByKey(s.copingKey) : null;
    box.append(
      h('p', { class: 'hw3-suggest__q', text: 'Save as my next step?' }),
      input,
      tool ? h('p', { class: 'hw-hint', text: `Linked tool: ${tool.title}` }) : null,
      h('div', { class: 'hw-card__actions' },
        canSave ? btn('Save', async (ev) => {
          const title = input.value.trim();
          if (!title) { input.focus(); return; }
          ev.currentTarget.disabled = true;
          try {
            await replaceOpenStep({ title, source: 'hope', copingKey: s.copingKey || null });
            s.state = 'saved'; s.title = title;
            say('Saved as your next step');
            if (onChange) onChange();
          } catch (e) { ev.currentTarget.disabled = false; say(failMessage(e), true); }
        }, { kind: 'primary' }) : h('p', { class: 'hw-hint', text: 'Sign in to save steps.' }),
        btn('Not now', () => { s.state = 'dismissed'; if (onChange) onChange(); }, { kind: 'ghost' })));
    return box;
  };

  /* ------------------------------------------------------------------ */
  /* Dashboard cards (filled after renderHome builds the grid)           */
  /* ------------------------------------------------------------------ */
  function clearBody(card) { if (!card) return null; [...card.children].forEach((c) => { if (!c.classList.contains('hw-card__head')) c.remove(); }); return card; }
  function actions(...b) { return h('div', { class: 'hw-card__actions' }, b.filter(Boolean)); }
  function paintDashSlots() {
    if (!(online() || demo())) return;
    const checkOn = (() => { try { return settings.moodCheck !== false; } catch (_) { return true; } })();
    const today = latestCheckin(todayIso());
    const check = document.getElementById('dashCheckin');
    if (check && checkOn) {
      const grat = check.querySelector('.grat-card');
      const gratText = [...check.querySelectorAll('p.help')].find((p) => /grateful/.test(p.textContent));
      clearBody(check);
      if (today) {
        check.appendChild(h('p', { class: 'home-checkin-done', id: 'hw3DashToday', text: `Today: ${MOODS[today.mood - 1].e} ${today.moodLabel}${today.intensity != null ? ` · ${today.intensity}/10` : ''}${today.craving && today.craving !== 'None' ? ` · ${today.craving} cravings` : ''}` }));
        check.appendChild(actions(btn('Edit today', () => HW3.startCheckin(), { attrs: { id: 'hw3DashEdit' } }), btn('Suggest a coping exercise', () => { const s = suggestTool(today); try { setAppTab('coping'); } catch (_) { /* */ } openTool(s.key); })));
      } else {
        check.appendChild(h('p', { class: 'hw3-h3', id: 'hw3DashMoodQ', text: 'How are you feeling today?' }));
        check.appendChild(moodPicker(null, (score) => HW3.startCheckin({ mood: score }), 'hw3DashMoodQ'));
        check.appendChild(h('p', { class: 'hw-hint', text: 'Choose one to continue. You can add feelings, triggers and notes on the next screen.' }));
      }
      if (grat) check.appendChild(grat);
      if (gratText) check.appendChild(gratText);
    }
    const cur = currentStep();
    const next = document.getElementById('dashNextStep');
    if (next && cur) {
      clearBody(next);
      const meta = next.querySelector('.hw-card__meta');
      if (meta) meta.textContent = 'The step you saved.';
      next.appendChild(h('p', { class: 'hw-card__body', id: 'hw3DashStep', text: cur.title }));
      next.appendChild(actions(btn('Open my next step', () => setAppTab('nextstep'), { kind: 'primary', attrs: { dataset: undefined } })));
    } else if (next) {
      const a = next.querySelector('.hw-card__actions');
      if (a && !a.querySelector('[data-hw3="steps"]')) { const b = btn('My saved steps', () => setAppTab('nextstep')); b.dataset.hw3 = 'steps'; a.appendChild(b); }
    }
    const mood = document.getElementById('dashMood');
    if (mood) {
      const days = trendDays('week');
      clearBody(mood);
      if (days.some((d) => d.score != null)) {
        mood.appendChild(h('p', { class: 'hw-card__body', text: trendSummary(days, 'week') }));
        const svg = trendChart(days, 'week');
        svg.querySelector('title').id = 'hw3DashChartT'; svg.querySelector('desc').id = 'hw3DashChartD';
        svg.setAttribute('aria-labelledby', 'hw3DashChartT hw3DashChartD');
        mood.appendChild(svg);
      } else mood.appendChild(h('div', { class: 'hw-empty hw-empty--inline' }, h('p', { class: 'hw-empty__title', text: 'No check-ins this week yet' }), h('p', { class: 'hw-empty__body', text: 'When you check in, your last 7 days will show here.' })));
      mood.appendChild(actions(btn('See trends', () => { setAppTab('checkin'); setTimeout(() => { const t = document.getElementById('hw3Trends'); if (t) t.scrollIntoView({ block: 'start' }); }, 80); })));
    }
    const goals = document.getElementById('dashGoals');
    if (goals) {
      const active = st.goals.filter((g) => g.status === 'active');
      const box = h('div', { class: 'hw3-dash-goals', id: 'hw3DashGoals' }, h('p', { class: 'hw3-h3', text: 'Personal goals' }));
      if (active.length) box.appendChild(h('ul', { class: 'dash-list' }, active.slice(0, 3).map((g) => h('li', { text: `${g.title} (${g.progress || 0}%)` }))));
      else box.appendChild(h('p', { class: 'hw-hint', text: plus() || demo() ? 'No personal goals yet.' : 'Personal goals are part of Hopewick Plus.' }));
      box.appendChild(actions(btn(active.length ? 'Open personal goals' : 'Personal goals', () => setAppTab('mygoals'))));
      const old = document.getElementById('hw3DashGoals'); if (old) old.remove();
      goals.appendChild(box);
    }
    const jr = document.getElementById('dashJournal');
    if (jr && online()) {
      clearBody(jr);
      const n = st.journal.length;
      if (n) {
        const last = st.journal.map((e) => e.updatedAt).sort().pop();
        jr.appendChild(h('p', { class: 'hw-card__body', text: `${n} ${n === 1 ? 'entry' : 'entries'} saved to your account. Last written ${whenLabel(last)}.` }));
      } else jr.appendChild(h('div', { class: 'hw-empty hw-empty--inline' }, h('p', { class: 'hw-empty__title', text: 'No journal entries yet' }), h('p', { class: 'hw-empty__body', text: 'Write whatever is on your mind. Entries are saved privately to your account.' })));
      jr.appendChild(actions(btn(n ? 'Open journal' : 'Write an entry', () => { try { openJournal(); } catch (_) { setAppTab('journal'); } })));
    }
    const cope = document.getElementById('dashCoping');
    if (cope) {
      const open = inProgress();
      const old = document.getElementById('hw3DashCope'); if (old) old.remove();
      const box = h('div', { id: 'hw3DashCope' });
      if (open && toolByKey(open.toolKey)) box.appendChild(h('p', { class: 'hw-card__body', text: `In progress: ${toolByKey(open.toolKey).title}` }));
      box.appendChild(actions(btn(open ? 'Resume' : 'Open coping toolkit', () => { setAppTab('coping'); if (open) openTool(open.toolKey, { activity: open }); }, { kind: 'primary' })));
      const head = cope.querySelector('.hw-card__head');
      if (head) head.after(box); else cope.prepend(box);
    }
    paintImportCard();
  }
  HW3.paintDashSlots = paintDashSlots;

  /* ------------------------------------------------------------------ */
  /* 4. Journal: server-backed when signed in, device copy never lost    */
  /* ------------------------------------------------------------------ */
  const jKey = () => { try { return pk(profile.id, 'journal'); } catch (_) { return null; } };
  const localJournal = () => { const k = jKey(); if (!k) return []; try { const v = load(k, []); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  function fromServer(e) {
    return { id: e.id, clientId: e.clientId || null, title: e.title || '', body: e.body || '', refined: e.refined || '', emotions: e.emotions || '', kind: e.kind || 'free', prompt: e.prompt || '', entryDate: e.entryDate || '', created: Date.parse(e.createdAt) || Date.now(), updated: Date.parse(e.updatedAt) || Date.now(), server: true };
  }
  const serverMode = () => online() && st.loaded;
  HW3.journalServerMode = serverMode;
  function adoptJournal() {
    if (!online()) return;
    const ids = new Set(st.journal.map((e) => e.clientId).filter(Boolean));
    const localOnly = st.settings.journalImport === 'done' ? [] : localJournal().filter((e) => e && e.id && !ids.has(e.id)).map((e) => Object.assign({}, e, { localOnly: true }));
    try { journal = st.journal.map(fromServer).concat(localOnly); } catch (_) { /* app not booted */ }
  }
  HW3.adoptJournal = adoptJournal;
  /** saveJournal() in server mode: only the device-only entries are written back, and only while the import is undecided or declined. */
  HW3.saveLocalJournal = function saveLocalJournal() {
    const k = jKey();
    if (!k || st.settings.journalImport === 'done') return;
    const imported = new Set(st.journal.map((e) => e.clientId).filter(Boolean));
    const keep = localJournal().filter((e) => imported.has(e.id));
    const mine = journal.filter((e) => e.localOnly).map((e) => { const c = Object.assign({}, e); delete c.localOnly; return c; });
    save(k, keep.concat(mine));
  };
  function forgetLocalCopy(clientId) {
    const k = jKey();
    if (!k || !clientId) return;
    const list = localJournal();
    const next = list.filter((e) => e.id !== clientId);
    if (next.length !== list.length) save(k, next);
  }
  /** Save (create or update) one entry. Returns the entry in the app's journal shape. */
  HW3.journalSave = async function journalSave(fields, existing) {
    if (!serverMode() || (existing && existing.localOnly)) return null; // caller uses the device path
    const body = { title: fields.title || '', body: fields.body, kind: fields.kind || 'free', prompt: fields.prompt || '', entryDate: fields.entryDate || todayIso() };
    if (fields.refined !== undefined) body.refined = fields.refined;
    if (fields.emotions !== undefined) body.emotions = fields.emotions;
    const out = existing && existing.server
      ? (await api('PATCH', `/api/me/journal/${existing.id}`, body)).entry
      : (await api('POST', '/api/me/journal', body)).entry;
    st.journal = [out].concat(st.journal.filter((e) => e.id !== out.id));
    const mapped = fromServer(out);
    journal = [mapped].concat(journal.filter((e) => e.id !== out.id));
    return mapped;
  };
  HW3.journalDelete = async function journalDelete(entry) {
    if (!serverMode() || entry.localOnly) return false;
    await api('DELETE', `/api/me/journal/${entry.id}`);
    st.journal = st.journal.filter((e) => e.id !== entry.id);
    journal = journal.filter((e) => e.id !== entry.id);
    forgetLocalCopy(entry.clientId);
    return true;
  };
  HW3.journalExport = function journalExport(format) {
    const fmt = format === 'md' ? 'md' : 'json';
    if (serverMode() && !journal.some((e) => e.localOnly)) {
      const a = h('a', { href: `/api/me/journal/export?format=${fmt}&profileId=${encodeURIComponent(pid())}`, download: '' });
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const list = [...journal].sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || '') || b.created - a.created);
    let text;
    if (fmt === 'md') {
      text = '# Hopewick journal\n\n' + list.map((e) => `## ${e.title || 'Untitled entry'}\n\n_${e.entryDate || new Date(e.created).toISOString().slice(0, 10)} · ${(JOURNAL_KINDS.find((k) => k.id === e.kind) || JOURNAL_KINDS[0]).label}_\n\n${e.prompt ? `> ${e.prompt}\n\n` : ''}${e.body}\n${e.refined ? `\n**Deepened reflection:** ${e.refined}\n` : ''}`).join('\n---\n\n');
    } else {
      text = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Hopewick', entries: list.map((e) => { const c = Object.assign({}, e); delete c.localOnly; delete c.server; return c; }) }, null, 2);
    }
    const blob = new Blob([text], { type: fmt === 'md' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `hopewick-journal-${todayIso()}.${fmt}` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  HW3.journalKinds = JOURNAL_KINDS;
  HW3.journalPrompt = function journalPrompt(kind, i) {
    const list = PROMPTS[kind] || PROMPTS.prompt;
    const day = Number(todayIso().replace(/-/g, '')) || 0;
    return list[((i == null ? day : i) % list.length + list.length) % list.length];
  };

  /** Ask before a journal entry goes to Hope. Resolves 'once', 'always' or null. */
  HW3.askJournalAi = function askJournalAi() {
    if (st.settings.journalAiAlways) return Promise.resolve('always');
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'hw3-dialog', 'aria-labelledby': 'hw3AiAskTitle', 'aria-describedby': 'hw3AiAskBody' });
      const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      const remember = h('input', { type: 'checkbox', id: 'hw3AiRemember' });
      dlg.append(
        h('h2', { class: 'hw3-h2', id: 'hw3AiAskTitle', text: 'Send this entry to Hope?' }),
        h('p', { id: 'hw3AiAskBody', text: 'To deepen a reflection, this entry is sent to Hope (an AI) to write a reply. It is not used for anything else and is not shared with a person.' }),
        h('label', { class: 'hw3-check', for: 'hw3AiRemember' }, remember, ' Do not ask again (you can change this in the journal)'),
        h('div', { class: 'hw-card__actions' },
          btn('Yes, send it', async () => {
            if (remember.checked && online()) { try { await patchSettings({ journalAiAlways: true }); } catch (_) { /* ask again next time */ } }
            done(remember.checked ? 'always' : 'once');
          }, { kind: 'primary', attrs: { id: 'hw3AiYes' } }),
          btn('No, keep it private', () => done(null), { kind: 'ghost', attrs: { id: 'hw3AiNo' } })));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  };

  /** Journal tools row: search, filters, export, AI setting, import banner. */
  HW3.journalFilter = { q: '', kind: '', from: '', to: '' };
  HW3.filterJournal = function filterJournal(list) {
    const f = HW3.journalFilter;
    const q = f.q.trim().toLowerCase();
    return list.filter((e) => {
      const d = e.entryDate || new Date(e.created).toISOString().slice(0, 10);
      if (f.kind && (e.kind || 'free') !== f.kind) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (q && !`${e.title} ${e.body} ${e.refined || ''} ${e.prompt || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  };
  HW3.paintJournalTools = function paintJournalTools(host, onFilter) {
    if (!host) return;
    host.replaceChildren();
    const f = HW3.journalFilter;
    const banner = importBanner('journal');
    if (banner) host.appendChild(banner);
    const q = h('input', { class: 'hw-input', type: 'search', id: 'hw3JSearch', maxlength: '100', placeholder: 'Search your entries' });
    q.value = f.q;
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; onFilter(); }, 200); });
    const kind = h('select', { class: 'hw-input', id: 'hw3JKind' }, h('option', { value: '', text: 'All kinds' }), JOURNAL_KINDS.map((k) => h('option', { value: k.id, text: k.label })));
    kind.value = f.kind;
    kind.addEventListener('change', () => { f.kind = kind.value; onFilter(); });
    const from = h('input', { class: 'hw-input', type: 'date', id: 'hw3JFrom', max: todayIso() });
    const to = h('input', { class: 'hw-input', type: 'date', id: 'hw3JTo', max: todayIso() });
    from.value = f.from; to.value = f.to;
    from.addEventListener('change', () => { f.from = from.value; onFilter(); });
    to.addEventListener('change', () => { f.to = to.value; onFilter(); });
    host.appendChild(h('div', { class: 'hw3-jtools', role: 'search', 'aria-label': 'Find journal entries' },
      h('div', { class: 'hw-field hw3-jtools__q' }, h('label', { class: 'hw-label', for: 'hw3JSearch', text: 'Search' }), q),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3JKind', text: 'Kind' }), kind),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3JFrom', text: 'From' }), from),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw3JTo', text: 'To' }), to),
      h('div', { class: 'hw-field hw3-jtools__clear' }, btn('Clear', () => { Object.assign(f, { q: '', kind: '', from: '', to: '' }); HW3.paintJournalTools(host, onFilter); onFilter(); }, { kind: 'ghost' }))));
    const any = Array.isArray(journal) && journal.length;
    host.appendChild(h('div', { class: 'hw-card__actions hw3-jexport' },
      any ? btn('Export as JSON', () => HW3.journalExport('json'), { attrs: { id: 'hw3JExportJson' } }) : null,
      any ? btn('Export as Markdown', () => HW3.journalExport('md'), { attrs: { id: 'hw3JExportMd' } }) : null));
    if (online()) {
      host.appendChild(switchEl('hw3JAiAlways', 'Allow Hope to read an entry when I choose "Deepen reflection" without asking each time', st.settings.journalAiAlways === true, async (on) => {
        await patchSettings({ journalAiAlways: on });
      }, 'Off: Hopewick asks every time. Entries are only sent when you press Deepen reflection.'));
    }
    host.appendChild(h('p', { class: 'hw-hint', id: 'hw3JWhere', text: demo() ? 'Demo mode: nothing is saved.' : serverMode() ? `Saved privately to your account${st.settings.journalImport === 'done' ? '' : '. Entries marked "On this device only" are not on your account yet'}.` : 'Signed out: entries stay in this browser only. Sign in to keep them with your account.' }));
  };

  /* ------------------------------------------------------------------ */
  /* Relapse and exit plans                                              */
  /* ------------------------------------------------------------------ */
  function plansHaveContent(p) {
    if (!p) return false;
    const r = p.relapse || {};
    const text = (v) => String(v || '').trim();
    return !!(text(r.warnings) || text(r.helps) || text(r.avoid) || text(r.ifSlip) || text(r.firstTenNote)
      || (Array.isArray(r.firstTen) && r.firstTen.some((x) => text(x)))
      || (Array.isArray(r.people) && r.people.some((x) => x && text(x.name)))
      || (p.exits && Object.values(p.exits).some((x) => x && JSON.stringify(x).replace(/[{}[\]",:0]|null|false|true/g, '').trim()))
      || (Array.isArray(p.custom) && p.custom.length));
  }
  HW3.plansHaveContent = plansHaveContent;
  function adoptPlans() {
    if (!online()) return;
    try {
      if (st.plans) {
        // Keep the device copy as a backup before showing the account copy.
        const local = load(pk(profile.id, 'plans'), null);
        if (local && plansHaveContent(local) && JSON.stringify(normalizePlans(local)) !== JSON.stringify(normalizePlans(st.plans))) save(pk(profile.id, 'plans.device-backup'), local);
        plansState = normalizePlans(st.plans);
        save(pk(profile.id, 'plans'), plansState);
      }
    } catch (_) { /* plans UI not ready */ }
  }
  let plansTimer = null;
  /** Called from savePlans(): push to the account (Plus only), debounced. */
  HW3.pushPlans = function pushPlans() {
    if (!serverMode() || !plus()) return;
    if (!st.plans && st.settings.plansImport === 'pending' && plansHaveContent(plansState)) return; // waiting for the import answer
    clearTimeout(plansTimer);
    plansTimer = setTimeout(async () => {
      try { st.plans = (await api('PUT', '/api/me/plans', { plans: plansState })).plans; } catch (e) { say(failMessage(e), true); }
    }, 600);
  };

  /* ------------------------------------------------------------------ */
  /* One-time import of this browser's journal and plans (asks first)    */
  /* ------------------------------------------------------------------ */
  function pendingImports() {
    if (!serverMode()) return { journal: [], plans: null };
    const ids = new Set(st.journal.map((e) => e.clientId).filter(Boolean));
    const j = st.settings.journalImport === 'pending' ? localJournal().filter((e) => e && e.id && String(e.body || '').trim() && !ids.has(e.id)) : [];
    let p = null;
    try { const local = load(pk(profile.id, 'plans'), null); if (st.settings.plansImport === 'pending' && !st.plans && plansHaveContent(local)) p = local; } catch (_) { p = null; }
    return { journal: j, plans: p };
  }
  async function runImport(yes) {
    const pend = pendingImports();
    try {
      if (pend.journal.length || st.settings.journalImport === 'pending') {
        const r = await api('POST', '/api/me/journal/import', yes ? { consent: true, entries: pend.journal.slice(0, 1000) } : { consent: false });
        st.settings.journalImport = r.status;
      }
      if (pend.plans || st.settings.plansImport === 'pending') {
        const r = await api('POST', '/api/me/plans/import', yes && pend.plans ? { consent: true, plans: normalizePlans(pend.plans) } : { consent: false });
        st.settings.plansImport = yes && pend.plans ? r.status : 'declined';
        if (r.plans) st.plans = r.plans;
      }
      await HW3.sync(true);
      say(yes ? 'Copied to your account. The copy in this browser is still here too.' : 'Okay. They stay in this browser only.');
    } catch (e) { say(failMessage(e), true); }
  }
  HW3.runImport = runImport;
  function importBanner(where) {
    const pend = pendingImports();
    const n = pend.journal.length;
    if (!n && !pend.plans) return null;
    const what = [n ? `${n} journal ${n === 1 ? 'entry' : 'entries'}` : '', pend.plans ? 'your relapse and exit plans' : ''].filter(Boolean).join(' and ');
    return h('section', { class: 'hw-card hw-card--tinted hw3-card hw3-import', id: where === 'home' ? 'hw3ImportHome' : 'hw3ImportJournal', 'aria-labelledby': `hw3ImportT-${where}` },
      h('h2', { class: 'hw3-h2', id: `hw3ImportT-${where}`, text: 'Keep your writing with your account?' }),
      h('p', { text: `This browser has ${what} that are not on your account yet. Copy them to your account so they are there on any device? They are stored privately${(() => { try { return billingState && billingState.dataEncrypted ? ' and encrypted' : ''; } catch (_) { return ''; } })()}. The copy in this browser stays where it is.` }),
      h('div', { class: 'hw-card__actions' },
        btn('Yes, copy them', () => runImport(true), { kind: 'primary', attrs: { id: `hw3ImportYes-${where}` } }),
        btn('No, keep them on this device', () => runImport(false), { kind: 'ghost', attrs: { id: `hw3ImportNo-${where}` } })));
  }
  function paintImportCard() {
    const old = document.getElementById('hw3ImportHome');
    if (old) old.remove();
    const card = importBanner('home');
    const grid = document.getElementById('dashGrid');
    if (card && grid) grid.before(card);
  }
})();
