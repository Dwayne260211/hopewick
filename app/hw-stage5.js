/* Hopewick 2.0 Stage 5: safety plan builder, optional faith layer, personalisation.
 *
 * Loaded after hw-stage4.js. Uses HW3.kit and registers through HW3.ext:
 *   safety       Step-by-step suicide prevention safety plan (always free), in the
 *                seven Stanley-Brown steps, with services, print / save as PDF, an
 *                offline copy, share (only when the person taps it) and history.
 *   preferences  "About you": preferred name, focus areas, tone, faith opt-in.
 * The faith layer is OFF unless the person switches it on. With it off, no faith
 * content is shown anywhere. The server decides (GET /api/me/preferences, /api/me/faith).
 */
(function () {
  'use strict';
  const HW3 = window.HW3;
  if (!HW3 || !HW3.kit) return;
  const K = HW3.kit;
  const { h, btn, say, announce, header, demo, online, signedIn, pid, api, failMessage, focusId, chipToggle } = K;
  const HW5 = {};
  window.HW5 = HW5;

  /* ------------------------------------------------------------------ */
  /* Australian services (re-checked 19 Oct 2026 on each service's own site;  */
  /* sources in docs/CONTENT-SOURCES.md). `plan: true` = prefilled in step 5. */
  /* ------------------------------------------------------------------ */
  const HW5_SERVICES = [
    { name: 'Emergency (Triple Zero)', num: '000', tel: '000', note: 'Police, ambulance or fire, if you or someone else is in immediate danger', urgent: true, plan: true },
    { name: 'Lifeline', num: '13 11 14', tel: '131114', note: '24/7 crisis support. You can also text 0477 13 11 14', plan: true },
    { name: 'Suicide Call Back Service', num: '1300 659 467', tel: '1300659467', note: '24/7 phone counselling for anyone affected by suicide', plan: true },
    { name: '13YARN', num: '13 92 76', tel: '139276', note: '24/7 crisis support for Aboriginal and Torres Strait Islander people', plan: true },
    { name: 'Kids Helpline', num: '1800 55 1800', tel: '1800551800', note: '24/7, for young people aged 5 to 25 (under-25s)', plan: true },
    { name: 'Beyond Blue', num: '1300 22 4636', tel: '1300224636', note: '24/7 support for anxiety, depression and feeling low', plan: true },
    { name: 'QLife', num: '1800 184 527', tel: '1800184527', note: 'LGBTIQ+ peer support, 3pm to 9pm local time, daily' },
    { name: 'Adis 24/7 Alcohol and Drug Support (QLD)', num: '1800 177 833', tel: '1800177833', note: '24/7 alcohol and other drug support' },
  ];
  HW5.SERVICES = HW5_SERVICES;
  /** Prefilled on every plan (step 5). Kept here, not in the saved plan, so a number change reaches every plan. */
  const PLAN_SERVICES = HW5_SERVICES.filter((sv) => sv.plan);
  const MORE_SERVICES = HW5_SERVICES.filter((sv) => !sv.plan);
  HW5.PLAN_SERVICES = PLAN_SERVICES;

  /* Seven steps in the Stanley-Brown order. All wording here is original. */
  const STEPS = [
    { id: 'warningSigns', title: 'My warning signs', prompt: 'What tells you a hard time might be starting?', hint: 'Thoughts, feelings, moods, situations or things you do.', examples: ['Not sleeping', 'Pulling away from people', 'Thinking "what’s the point"', 'Payday'] },
    { id: 'copingThings', title: 'Things I can do on my own to cope or distract', prompt: 'What can you do by yourself to take the edge off or take your mind off things, even a little?', hint: 'Small, doable things. They don’t have to fix it.', examples: ['Box breathing', 'A walk around the block', 'A cold shower', 'Music with headphones'] },
    { id: 'safePlaces', title: 'People and places that help take my mind off things', prompt: 'Where can you go, or who can you be around, for a change of scene?', hint: 'You don’t need to talk about how you feel. Just be around others.', examples: ['The library', 'A café', 'My cousin’s place', 'The gym'] },
    { id: 'people', title: 'People I can ask for help', prompt: 'Who could you tell that you’re having a hard time?', hint: 'Add a name and a phone number. Numbers become tap-to-call on your plan.', examples: ['My sponsor', 'Mum', 'My best mate'], quickAdd: [{ id: 'person', legend: 'Add a person', nameLabel: 'Their name', prefix: '' }] },
    { id: 'professionals', title: 'Professionals and services', prompt: 'Which professionals or services can you contact?', hint: 'Your GP, caseworker, counsellor, AOD worker or mental health team. The national services are already on your plan.', examples: ['My AOD worker', 'My counsellor', 'My mental health team'], quickAdd: [{ id: 'gp', legend: 'My GP', nameLabel: 'GP or clinic name', prefix: 'GP: ' }, { id: 'case', legend: 'My caseworker or counsellor', nameLabel: 'Their name', prefix: 'Caseworker: ' }] },
    { id: 'safeEnvironment', title: 'Making my space safer', prompt: 'What can you do to make things safer around you in a hard moment?', hint: 'For example, asking someone to hold onto things for a while.', examples: ['Medicines kept by someone I trust', 'No alcohol at home', 'Car keys with a friend'] },
    { id: 'reasons', title: 'My reasons for living and what matters to me', prompt: 'What matters to you, and what keeps you going?', hint: 'People, pets, plans, hopes, beliefs. Big or small.', examples: ['My kids', 'My dog', 'Seeing the ocean again'] },
  ];
  HW5.STEPS = STEPS;

  const FOCUS = [
    { id: 'mood', label: 'Mood' },
    { id: 'anxiety', label: 'Anxiety and worry' },
    { id: 'aod', label: 'Alcohol and other drug recovery' },
    { id: 'sleep', label: 'Sleep' },
    { id: 'anger', label: 'Anger' },
    { id: 'relationships', label: 'Relationships' },
  ];
  HW5.FOCUS = FOCUS;
  /* Where the person says they are in recovery (server/wellbeing/personal.js RECOVERY_STAGES). */
  const STAGES = [
    { id: 'week', label: 'First week', hint: 'Extra simple screens and the basics.' },
    { id: 'month', label: 'First month', hint: '' },
    { id: 'early', label: '1 to 3 months', hint: '' },
    { id: 'later', label: '3 months or more', hint: '' },
    { id: 'unsure', label: 'Not sure', hint: 'That’s okay.' },
  ];
  HW5.STAGES = STAGES;
  const TRADITIONS = [
    { id: 'christian', label: 'Christian' },
    { id: 'catholic', label: 'Catholic' },
    { id: 'general', label: 'Faith-inclusive or general spirituality (Hope only)' },
    { id: 'islamic', label: 'Islamic (Hope only)' },
    { id: 'jewish', label: 'Jewish (Hope only)' },
    { id: 'buddhist', label: 'Buddhist (Hope only)' },
    { id: 'hindu', label: 'Hindu (Hope only)' },
    { id: 'sikh', label: 'Sikh (Hope only)' },
    { id: 'indigenous', label: 'Indigenous spirituality (Hope only)' },
  ];
  const CHRISTIAN = ['christian', 'catholic'];
  const defaults = () => ({ preferredName: '', focusAreas: [], recoveryStage: '', tone: 'gentle', faithOptIn: false, faithTradition: 'christian', faithAnswer: null, faithAskedAt: null, faithLaterCount: 0, onboardedAt: null, updatedAt: null });

  /* ------------------------------------------------------------------ */
  /* Preferences and faith state                                         */
  /* ------------------------------------------------------------------ */
  const s5 = { faithDue: false, key: '', prefs: null, loading: null, pending: null, demoPrefs: null, faith: {}, faithLoading: {}, versions: null, versionsKey: '' };
  HW5.state = s5;
  const ui = { step: 0, view: 'guided', draft: null, viewing: null, share: false, prefsDraft: null };
  HW5.ui = ui;
  const acctKey = () => { let a = ''; try { a = billingState.id || ''; } catch (_) { a = ''; } return `${demo() ? 'demo' : a}:${pid()}`; };

  function prefs() { return s5.prefs || defaults(); }
  HW5.prefs = prefs;
  /** Faith is on only when the person switched it on (account preference; demo keeps it in memory). */
  function faithOn() { return (online() || demo()) && !!(s5.prefs && s5.prefs.faithOptIn === true); }
  function christianOn() { return faithOn() && CHRISTIAN.includes(prefs().faithTradition); }
  HW5.faithOn = faithOn;
  HW5.christianOn = christianOn;

  async function load(force) {
    if (demo()) { s5.prefs = s5.demoPrefs || defaults(); s5.key = acctKey(); applyFaith(); return s5.prefs; }
    if (!online()) { s5.prefs = null; s5.key = ''; applyFaith(); return null; }
    const key = acctKey();
    if (!force && s5.key === key && s5.prefs) return s5.prefs;
    if (s5.loading && s5.key === key) return s5.loading;
    s5.key = key;
    s5.loading = (async () => {
      try {
        if (s5.pending) await s5.pending.catch(() => {});
        const d = await api('GET', '/api/me/preferences');
        if (s5.key !== key) return s5.prefs;
        s5.prefs = Object.assign(defaults(), d.preferences || {});
        s5.faithDue = d.faithPromptDue === true;
        s5.faith = {};
      } catch (_) {
        s5.prefs = s5.prefs || null;
      } finally { s5.loading = null; }
      applyFaith();
      return s5.prefs;
    })();
    return s5.loading;
  }
  HW5.load = (force) => load(force).catch(() => null);

  async function savePrefs(patch) {
    if (demo()) { s5.demoPrefs = Object.assign(prefs(), patch, { updatedAt: new Date().toISOString() }); if (patch.onboarded) s5.demoPrefs.onboardedAt = s5.demoPrefs.onboardedAt || new Date().toISOString(); delete s5.demoPrefs.onboarded; s5.prefs = s5.demoPrefs; applyFaith(); return s5.prefs; }
    const p = api('PATCH', '/api/me/preferences', patch);
    s5.pending = p;
    try {
      const d = await p;
      s5.prefs = Object.assign(defaults(), d.preferences || {});
      s5.faithDue = d.faithPromptDue === true;
      s5.faith = {};
      applyFaith();
      return s5.prefs;
    } finally { if (s5.pending === p) s5.pending = null; }
  }
  async function resetPrefs() {
    if (demo()) { s5.demoPrefs = defaults(); s5.prefs = s5.demoPrefs; applyFaith(); return s5.prefs; }
    const d = await api('DELETE', '/api/me/preferences');
    s5.prefs = Object.assign(defaults(), d.preferences || {});
    s5.faithDue = d.faithPromptDue === true;
    s5.faith = {};
    applyFaith();
    return s5.prefs;
  }

  /** Settings (or onboarding) changed the faith select: keep the account preference in step. */
  HW5.faithFromSettings = function (value, opts) {
    if (!online() && !demo()) return;
    const want = value && value !== 'none';
    const cur = prefs();
    const patch = {};
    if (want !== (cur.faithOptIn === true)) patch.faithOptIn = want;
    if (want && TRADITIONS.some((t) => t.id === value) && value !== cur.faithTradition) patch.faithTradition = value;
    if (opts && opts.onboarding) patch.onboarded = true;
    if (!Object.keys(patch).length) return;
    savePrefs(patch).catch((e) => say(failMessage(e), true));
  };

  /*
   * The faith question ("Would you like Christian encouragement?"). New accounts see it
   * in onboarding; anyone who has not answered sees it once as a card on Home. The server
   * decides when it is due (faithPromptDue): never after Yes or No, and never after two
   * "Decide later" answers or dismissals. Until answered, faith stays off.
   */
  const ANSWER_SAID = {
    yes: 'Christian encouragement is on. You can change this any time in About you.',
    no: 'No worries. Faith content stays off. You can change this any time in About you.',
    later: 'That’s fine. Faith content stays off for now. You can choose any time in About you.',
  };
  HW5.answerFaith = async function (answer, opts) {
    if (!['yes', 'no', 'later'].includes(answer)) return null;
    if (demo() || !online()) return null;
    try {
      const out = await savePrefs({ faithAnswer: answer });
      if (!(opts && opts.quiet)) say(ANSWER_SAID[answer]);
      try { if (appTab === 'home') renderHome(); } catch (_) { /* */ }
      return out;
    } catch (e) { say(failMessage(e), true); return null; }
  };
  const priorKey = () => `hopewick.hw5.priorFaith.${acctKey()}`;
  /** Before the account preference first overrides this device's settings, remember what was chosen here. */
  function stashPrior() {
    try {
      if (demo() || !online() || !s5.prefs || s5.prefs.faithAnswer || s5.prefs.faithOptIn) return;
      if (localStorage.getItem(priorKey()) !== null) return;
      let onboard = null;
      try { onboard = typeof window.hwOnboardingRecord === 'function' ? window.hwOnboardingRecord() : null; } catch (_) { onboard = null; }
      localStorage.setItem(priorKey(), JSON.stringify({ faith: typeof settings.faith === 'string' ? settings.faith : null, choice: onboard && onboard.continued ? onboard.faithChoice || null : null }));
    } catch (_) { /* storage off */ }
  }
  /** The earlier on-device choice, as yes/no, or null when there was none to go on. */
  function priorAnswer() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(priorKey()) || 'null'); } catch (_) { d = null; }
    if (!d) return null;
    // A Christian tradition was picked on this device: that was a choice.
    if (CHRISTIAN.includes(d.faith)) return 'yes';
    // "No faith" counts only when they actually chose it in the old onboarding; on a new profile it is just the default.
    if (d.choice && d.faith === 'none') return 'no';
    return null;
  }
  HW5.priorAnswer = priorAnswer;
  function faithAskCard() {
    if (demo() || !online() || !s5.faithDue) return null;
    const prior = priorAnswer();
    const name = 'hw5FaithAsk';
    const opts = [['yes', 'Yes, include it'], ['no', 'No thanks'], ['later', 'Decide later']];
    const radios = opts.map(([v, label]) => {
      const input = h('input', { type: 'radio', name, value: v, id: `${name}-${v}` });
      if (prior === v) input.checked = true;
      return h('label', { for: `${name}-${v}` }, input, ` ${label}`);
    });
    const close = h('button', { class: 'btn btn-ghost btn-sm hw5-faithask__close', type: 'button', 'aria-label': 'Close, and decide later', text: '✕' });
    close.addEventListener('click', () => HW5.answerFaith('later'));
    const save = btn('Save my choice', () => {
      const pick = card.querySelector(`input[name="${name}"]:checked`);
      if (!pick) { say('Choose one of the three options, or close this card to decide later.', true); return; }
      HW5.answerFaith(pick.value);
    }, { kind: 'secondary', attrs: { id: 'hw5FaithAskSave' } });
    const card = h('section', { class: 'hw-card dash-card hw5-faithask', id: 'dashFaithAsk', 'aria-labelledby': 'dashFaithAskT' },
      h('div', { class: 'hw-card__head' },
        h('div', { class: 'dash-head-text' }, h('h2', { class: 'hw-card__title', id: 'dashFaithAskT', text: 'A quick question, if you’re happy to answer' })),
        close),
      h('p', { id: 'dashFaithAskQ', text: 'Hopewick can include optional Christian encouragement, such as short Bible reflections and prayers. Would you like that?' }),
      h('p', { class: 'hw-hint', text: 'It’s completely up to you, and there’s no right answer. Faith content stays off until you say yes. You can change this any time in About you.' }),
      prior ? h('p', { class: 'hw-hint', id: 'dashFaithAskPrior', text: 'We’ve ticked what you chose on this device before. Check it’s still right, then save.' }) : null,
      h('div', { class: 'onboard-choices hw5-faithask__choices', role: 'radiogroup', 'aria-labelledby': 'dashFaithAskQ' }, radios),
      h('div', { class: 'hw-card__actions' }, save));
    return card;
  }
  HW5.faithAskCard = faithAskCard;

  const ORIGINAL = { compare: null };
  /** Make the whole app follow the faith preference. Off means nothing faith-related shows. */
  function applyFaith() {
    stashPrior();
    const on = faithOn();
    const desired = on ? prefs().faithTradition : 'none';
    let changed = false;
    try {
      if ((online() || demo()) && (s5.prefs || demo()) && settings.faith !== desired) {
        settings.faith = desired;
        if (!on && settings.faithLevel === 'central') settings.faithLevel = 'woven';
        try { saveSettings(); } catch (_) { /* demo or not ready */ }
        changed = true;
      }
    } catch (_) { /* app not booted */ }
    try { syncFaithBibleVisibility(); } catch (_) { /* */ }
    try {
      const opt = document.querySelector('#setMode option[value="counsellor"]');
      if (opt) opt.textContent = settings.faith === 'none' ? 'AOD recovery counsellor — support with alcohol & other drugs' : 'AOD faith counsellor — support with alcohol & other drugs';
    } catch (_) { /* */ }
    patchCompare(on);
    if (changed) {
      try { HW3.state.releasesFor = null; } catch (_) { /* */ }
      try { if (appTab === 'home') renderHome(); } catch (_) { /* */ }
      try { if (HW3.views && HW3.views.includes(appTab)) HW3.render(appTab); } catch (_) { /* */ }
      try { HW3.loadReleases().then(() => { try { if (HW3.views.includes(appTab)) HW3.render(appTab); } catch (_) { /* */ } }); } catch (_) { /* */ }
    }
  }
  HW5.applyFaith = applyFaith;

  function patchCompare(on) {
    const secs = HW3.COMPARE_SECTIONS;
    if (!Array.isArray(secs)) return;
    if (!ORIGINAL.compare) {
      ORIGINAL.compare = secs.map((s) => s.rows.slice());
      const free = secs.find((s) => s.id === 'free');
      if (free) {
        free.rows.splice(2, 0, ['Step-by-step suicide prevention safety plan: services, print or PDF, offline copy, share and history', 'Yes', 'Yes']);
        free.rows.push(['About you: your name, focus areas and tone, used by Hope', 'Yes', 'Yes']);
        ORIGINAL.compare = secs.map((s) => s.rows.slice());
      }
    }
    secs.forEach((s, i) => {
      s.rows = ORIGINAL.compare[i].filter((r) => on || !/devotional|prayer journal/i.test(r[0]))
        .map((r) => (on || !/Bible & SOAP/.test(r[0]) ? r : [r[0].replace(', Bible & SOAP,', ' and').replace(', Bible & SOAP', ''), r[1], r[2]]));
      if (on && s.id === 'free' && !s.rows.some((r) => /Faith reflections/.test(r[0]))) s.rows.push(['Faith reflections and prayers (you turned faith on)', 'Yes', 'Yes']);
    });
  }

  /** Faith reflection for one place (home, checkin, coping, journal). Cached per day. */
  function faithFor(context) {
    if (!christianOn()) return null;
    const c = s5.faith[context];
    if (c !== undefined) return c;
    if (!s5.faithLoading[context]) {
      if (demo()) { s5.faith[context] = DEMO_FAITH; return DEMO_FAITH; }
      s5.faithLoading[context] = api('GET', `/api/me/faith?context=${context}`).then((d) => {
        s5.faith[context] = d && d.enabled ? d : null;
      }).catch(() => { s5.faith[context] = null; }).finally(() => {
        s5.faithLoading[context] = null;
        repaintFaith(context);
      });
    }
    return null;
  }
  const DEMO_FAITH = { enabled: true, today: { id: 'demo', title: 'Close to the brokenhearted', scripture: { ref: 'Psalm 34:18', text: 'Yahweh is near to those who have a broken heart, and saves those who have a crushed spirit.', translation: 'WEB' }, reflection: 'On a heavy day it can feel like you are on your own. This verse says the opposite: hurting is not a sign that God has left.', prayer: 'God, I am tired and sore inside. Stay close to me today. Amen.' }, translation: 'World English Bible (public domain)', review: 'pending' };
  function repaintFaith(context) {
    try {
      if (context === 'home' && appTab === 'home') renderHome();
      else if ((context === 'checkin' || context === 'coping') && appTab === context) HW3.render(context);
      else if (context === 'journal') paintJournal();
    } catch (_) { /* */ }
  }
  function faithCard(context, idSuffix) {
    const d = faithFor(context);
    if (!d || !d.today) return null;
    const t = d.today;
    const id = `hw5Faith${idSuffix || context}`;
    return h('section', { class: 'hw-card hw3-card hw5-faith', id, 'aria-labelledby': `${id}T`, dataset: { faith: '1' } },
      h('p', { class: 'hw5-faith__kicker', text: 'A moment of faith (you turned this on)' }),
      h('h2', { class: 'hw3-h2', id: `${id}T`, text: t.title }),
      h('blockquote', { class: 'hw5-faith__verse' }, h('p', { text: t.scripture.text }), h('footer', { text: `${t.scripture.ref} (World English Bible)` })),
      h('p', { text: t.reflection }),
      h('p', { class: 'hw5-faith__prayer' }, h('strong', { text: 'A short prayer: ' }), t.prayer),
      h('p', { class: 'hw-hint', text: 'Faith is one support among many. It never replaces your GP, counsellor or crisis help. Draft: pending founder and pastoral review.' }));
  }
  HW5.faithCard = faithCard;

  /* ------------------------------------------------------------------ */
  /* Sign in first (account-only forms)                                  */
  /* ------------------------------------------------------------------ */
  const TAB_TITLES = { checkin: 'Daily check-in', mygoals: 'Personal goals', nextstep: 'My next step', recovery: 'Recovery tracker', preferences: 'About you' };
  HW3.signInFirst = function (root, tab) {
    let loaded = true;
    try { loaded = !!billingState.loaded; } catch (_) { loaded = true; }
    root.appendChild(header(TAB_TITLES[tab] || 'Sign in', ''));
    if (!loaded) {
      root.appendChild(h('p', { class: 'hw3-note', role: 'status', id: 'hw5Checking', text: 'Checking your account…' }));
      setTimeout(() => { try { if (appTab === tab) HW3.render(tab); } catch (_) { /* */ } }, 700);
      return;
    }
    root.appendChild(h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw5SignInFirst', 'aria-labelledby': 'hw5SignInFirstT' },
      h('h2', { class: 'hw3-h2', id: 'hw5SignInFirstT', text: 'Please sign in first' }),
      h('p', { text: 'This is saved privately to your Hopewick account, so sign in before you start. That way nothing you type gets lost.' }),
      h('div', { class: 'hw-card__actions' },
        btn('Sign in', () => { try { showSignInGate(); } catch (_) { /* */ } }, { kind: 'primary', attrs: { id: 'hw5SignInBtn' } }),
        btn('My safety plan', () => { try { setAppTab('safety'); } catch (_) { /* */ } }, { attrs: { id: 'hw5SignInSafety' } }),
        btn('Get help now', () => { try { openHelp(); } catch (_) { /* */ } }, { kind: 'ghost' })),
      h('p', { class: 'hw-hint', text: 'Your safety plan, coping tools and the crisis numbers work without an account.' })));
  };

  /* ------------------------------------------------------------------ */
  /* Safety plan builder                                                 */
  /* ------------------------------------------------------------------ */
  function telOf(text) {
    const m = String(text).match(/(?:\+61\s?)?(?:\(?0\d\)?[\s-]?)?\d[\d\s-]{5,12}\d/);
    if (!m) return null;
    const digits = m[0].replace(/[^\d+]/g, '');
    if (digits.replace('+', '').length < 3) return null;
    if (!/^(\+61|0|1[38]|000)/.test(digits) && digits.length < 8) return null;
    return { match: m[0], tel: digits };
  }
  function itemEl(text, linkCalls) {
    const t = linkCalls ? telOf(text) : null;
    if (!t) return h('li', { text });
    const i = text.indexOf(t.match);
    return h('li', {}, text.slice(0, i), h('a', { href: `tel:${t.tel}`, class: 'hw5-tel', text: t.match.trim() }), text.slice(i + t.match.length));
  }
  function emptyPlan() { const o = {}; STEPS.forEach((s) => { o[s.id] = []; }); return o; }
  function current() { const c = K.readSafety() || {}; const o = emptyPlan(); STEPS.forEach((s) => { o[s.id] = Array.isArray(c[s.id]) ? c[s.id].slice() : []; }); return o; }
  function draft() { if (!ui.draft) ui.draft = current(); return ui.draft; }
  const filled = (plan) => STEPS.filter((s) => (plan[s.id] || []).length).length;

  function servicesCard(id, list, title) {
    return h('section', { class: 'hw-card hw3-card hw5-services', id: id || 'hw5Services', 'aria-labelledby': `${id || 'hw5Services'}T` },
      h('h2', { class: 'hw3-h2', id: `${id || 'hw5Services'}T`, text: title || 'Services you can call' }),
      h('p', { class: 'hw-hint', text: 'Free, confidential Australian services. Tap to call.' }),
      h('ul', { class: 'hw5-services__list' }, (list || HW5_SERVICES).map((sv) => h('li', {},
        h('a', { class: `hw5-call${sv.urgent ? ' hw5-call--urgent' : ''}`, href: `tel:${sv.tel}`, 'aria-label': `Call ${sv.name} on ${sv.num}` },
          h('span', { class: 'hw5-call__name', text: sv.name }), h('span', { class: 'hw5-call__num', text: sv.num })),
        h('span', { class: 'hw-hint', text: sv.note })))));
  }
  HW5.servicesCard = servicesCard;

  function urgentBox() {
    return h('div', { class: 'hw3-support', role: 'note', id: 'hw5Urgent' },
      h('p', { class: 'hw3-h3', text: 'Call 000 if you are in immediate danger.' }),
      h('p', { text: 'That includes if you feel you might act on thoughts of suicide. Lifeline is there any time on 13 11 14.' }),
      h('div', { class: 'hw-card__actions' }, h('a', { class: 'hw-btn hw-btn--danger hw-btn--sm', href: 'tel:000', text: 'Call 000' }), h('a', { class: 'hw-btn hw-btn--sm', href: 'tel:131114', text: 'Lifeline 13 11 14' }),
        btn('Get help now', () => { try { openHelp(); } catch (_) { /* */ } })));
  }
  /** Calm entry: what this plan is, in plain words. Shown at the top of the plan. */
  function aboutCard(open) {
    // Open the first time; once the plan has something in it, it folds away (one tap to reopen).
    return h('details', { class: 'hw-card hw-card--tinted hw3-card hw5-about', id: 'hw5About', open: open !== false },
      h('summary', { class: 'hw5-about__summary' }, h('h2', { class: 'hw3-h2', id: 'hw5AboutT', text: 'A plan for when things feel too much' })),
      h('p', { text: 'This is your suicide prevention safety plan. Lots of people have thoughts of suicide or of not wanting to be here, especially when things pile up. Writing a plan while things feel a bit steadier means it’s ready if a hard moment comes.' }),
      h('p', { text: 'It follows the seven steps of the Stanley-Brown Safety Planning Intervention, which research shows can help people stay safe. Work through them in order when you need to: if one step doesn’t help, move to the next.' }),
      h('p', { class: 'hw-hint', text: 'Every part is optional. Go at your own pace, save and come back. Hopewick is not a crisis service, and Hope (the AI) never reads this plan.' }));
  }
  HW5.aboutCard = aboutCard;

  /** Name + phone fields that add one line to the step's list (stored as text, so saved plans stay compatible). */
  function quickAdd(step, ta) {
    return (step.quickAdd || []).map((q) => {
      const nid = `hw5QA-${q.id}-name`;
      const tid = `hw5QA-${q.id}-phone`;
      const fs = h('fieldset', { class: 'hw5-quick', id: `hw5QA-${q.id}` },
        h('legend', { class: 'hw-label', text: q.legend }),
        h('div', { class: 'hw5-quick__row' },
          h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: nid, text: q.nameLabel }), h('input', { class: 'hw-input', id: nid, type: 'text', maxlength: '120', autocomplete: 'off' })),
          h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: tid, text: 'Phone' }), h('input', { class: 'hw-input', id: tid, type: 'tel', inputmode: 'tel', maxlength: '20', autocomplete: 'off' }))),
        btn(`Add to my list`, () => {
          const n = document.getElementById(nid); const t = document.getElementById(tid);
          const name = (n.value || '').trim(); const phone = (t.value || '').replace(/[^\d+\s()-]/g, '').trim();
          if (!name && !phone) { say('Add a name or a phone number first.', true); n.focus(); return; }
          const line = `${q.prefix}${[name, phone].filter(Boolean).join(', ')}`.slice(0, 300);
          const lines = ta.value.split('\n').map((v) => v.trim()).filter(Boolean);
          if (lines.length >= 10) { say('You can keep up to 10 in each step.', true); return; }
          if (!lines.includes(line)) lines.push(line);
          ta.value = lines.join('\n');
          n.value = ''; t.value = '';
          announce(`Added ${line}`);
          n.focus();
        }, { attrs: { id: `hw5QA-${q.id}-add`, 'aria-label': `Add to my list: ${q.legend}` } }));
      return fs;
    });
  }
  function planServicesList(id, cls) {
    return h('ul', { class: cls || 'hw5-plan__services', id }, PLAN_SERVICES.map((sv) => h('li', {},
      h('a', { href: `tel:${sv.tel}`, class: 'hw5-tel', 'aria-label': `Call ${sv.name} on ${sv.num}`, text: `${sv.name}: ${sv.num}` }),
      h('span', { class: 'hw-hint', text: ` ${sv.note}` }))));
  }

  function savedWhere() {
    return online() ? 'Saved privately to your account. Free on every plan, forever.' : demo() ? 'Demo mode: nothing is saved.' : 'Signed out: saved in this browser only. Sign in to keep it with your account and get version history.';
  }
  async function saveDraft(msg) {
    const doc = draft();
    try {
      await K.saveSafety(doc);
      ui.draft = null;
      s5.versions = null;
      say(msg || (online() ? 'Safety plan saved to your account' : demo() ? 'Saved for this demo only' : 'Saved in this browser'));
      announce('Safety plan saved');
      return true;
    } catch (e) { say(failMessage(e), true); return false; }
  }
  function readStep() {
    const s = STEPS[ui.step];
    const ta = document.getElementById(`hw5Step-${s.id}`);
    if (ta) draft()[s.id] = ta.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 300));
  }

  function modeTabs(root) {
    const tabs = [['guided', 'Step by step'], ['summary', 'My whole plan']];
    if (online()) tabs.push(['history', 'History']);
    root.appendChild(h('div', { class: 'hw5-tabs', role: 'group', 'aria-label': 'Safety plan views' }, tabs.map(([id, label]) => h('button', {
      type: 'button', class: 'hw-chip', id: `hw5Tab-${id}`, 'aria-pressed': ui.view === id ? 'true' : 'false',
      onclick: () => { if (ui.view === 'guided') readStep(); ui.view = id; ui.viewing = null; ui.share = false; HW3.render('safety'); focusId(`hw5Tab-${id}`); },
    }, label))));
  }

  function guided(root) {
    const s = STEPS[ui.step];
    const d = draft();
    const n = ui.step + 1;
    const form = h('form', { class: 'hw-card hw3-card hw3-form hw5-step', id: 'hw5StepForm', 'aria-labelledby': 'hw5StepT', onsubmit: (e) => e.preventDefault() },
      h('p', { class: 'hw5-progress-label', id: 'hw5StepCount', text: `Step ${n} of ${STEPS.length}` }),
      h('div', { class: 'hw5-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(STEPS.length), 'aria-valuenow': String(n), 'aria-labelledby': 'hw5StepCount' },
        h('span', { class: 'hw5-progress__bar', style: `width:${Math.round((n / STEPS.length) * 100)}%` })),
      h('h2', { class: 'hw3-h2', id: 'hw5StepT', tabindex: '-1', text: s.title }),
      h('p', { class: 'hw5-step__prompt', text: s.prompt }));
    const ta = h('textarea', { class: 'hw-textarea', id: `hw5Step-${s.id}`, rows: '5', 'aria-labelledby': 'hw5StepT', 'aria-describedby': 'hw5StepHint' });
    ta.value = (d[s.id] || []).join('\n');
    form.appendChild(h('div', { class: 'hw-field' }, h('p', { class: 'hw-hint', id: 'hw5StepHint', text: `${s.hint} One per line, up to 10.` }), ta));
    form.appendChild(h('div', { class: 'hw5-examples' }, h('span', { class: 'hw-hint', text: 'Ideas (tap to add): ' }), s.examples.map((x) => h('button', {
      type: 'button', class: 'hw-chip hw5-example', onclick: () => { const lines = ta.value.split('\n').map((v) => v.trim()).filter(Boolean); if (!lines.includes(x)) lines.push(x); ta.value = lines.join('\n'); ta.focus(); },
    }, x))));
    quickAdd(s, ta).forEach((fs) => form.appendChild(fs));
    if (s.id === 'professionals') {
      form.appendChild(h('div', { class: 'hw5-prefilled', id: 'hw5StepServices' },
        h('p', { class: 'hw-label', text: 'Already on your plan (tap to call)' }),
        planServicesList('hw5StepServicesList', 'hw5-plan__services'),
        h('p', { class: 'hw-hint', text: 'Kids Helpline is for young people up to 25. Call 000 in an emergency.' })));
    }
    const last = ui.step === STEPS.length - 1;
    form.appendChild(h('div', { class: 'hw-card__actions hw5-nav' },
      ui.step > 0 ? btn('Back', () => { readStep(); ui.step -= 1; HW3.render('safety'); focusId('hw5StepT'); }, { attrs: { id: 'hw5Back' } }) : null,
      !last ? btn('Next', () => { readStep(); ui.step += 1; HW3.render('safety'); focusId('hw5StepT'); }, { kind: 'primary', attrs: { id: 'hw5Next' } }) : null,
      btn(last ? 'Save my safety plan' : 'Save for now', async () => { readStep(); if (await saveDraft()) { if (last) ui.view = 'summary'; HW3.render('safety'); focusId(last ? 'hw5PlanT' : 'hw5StepT'); } }, { kind: last ? 'primary' : 'secondary', attrs: { id: 'hw5Save' } })));
    form.appendChild(h('ol', { class: 'hw5-steps', 'aria-label': 'All steps' }, STEPS.map((x, i) => h('li', {},
      h('button', { type: 'button', class: `hw5-steps__btn${i === ui.step ? ' is-current' : ''}`, 'aria-current': i === ui.step ? 'step' : 'false', onclick: () => { readStep(); ui.step = i; HW3.render('safety'); focusId('hw5StepT'); } },
        `${i + 1}. ${x.title}${(d[x.id] || []).length ? ' ✓' : ''}`)))));
    form.appendChild(h('p', { class: 'hw-hint', text: savedWhere() }));
    root.appendChild(form);
  }

  function planBlock(plan, { id = 'hw5Plan', title = 'My safety plan', when = '' } = {}) {
    let name = '';
    try { name = (prefs().preferredName || (profile && profile.name) || '').trim(); } catch (_) { name = ''; }
    return h('section', { class: 'hw-card hw3-card hw5-plan', id, 'aria-labelledby': `${id}T` },
      h('h2', { class: 'hw3-h2', id: `${id}T`, tabindex: '-1', text: name ? `${title}: ${name}` : title }),
      when ? h('p', { class: 'hw-hint', text: when }) : null,
      STEPS.map((s, i) => h('div', { class: 'hw5-plan__part' },
        h('h3', { class: 'hw3-h3', text: `${i + 1}. ${s.title}` }),
        (plan[s.id] || []).length ? h('ul', {}, plan[s.id].map((x) => itemEl(x, s.id === 'people' || s.id === 'professionals'))) : (s.id === 'professionals' ? null : h('p', { class: 'hw-hint', text: 'Nothing here yet.' })),
        s.id === 'professionals' ? planServicesList(`${id}Services`) : null)),
      h('div', { class: 'hw5-plan__urgent' }, h('strong', { text: 'Call 000 if you are in immediate danger. ' }), 'Lifeline 13 11 14, any time.'));
  }

  function planText(plan) {
    const lines = ['My safety plan (Hopewick)', ''];
    STEPS.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.title}`);
      (plan[s.id] || []).forEach((x) => lines.push(`   - ${x}`));
      if (s.id === 'professionals') PLAN_SERVICES.forEach((sv) => lines.push(`   - ${sv.name}: ${sv.num} (${sv.note})`));
      else if (!(plan[s.id] || []).length) lines.push('   -');
      lines.push('');
    });
    lines.push('More services:');
    MORE_SERVICES.forEach((sv) => lines.push(`   ${sv.name}: ${sv.num} (${sv.note})`));
    lines.push('', 'Call 000 if you are in immediate danger.');
    return lines.join('\n');
  }
  HW5.planText = planText;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function offlineHtml(plan) {
    const svc = (sv) => `<li><a href="tel:${sv.tel}">${esc(sv.name)}: ${esc(sv.num)}</a> (${esc(sv.note)})</li>`;
    const mine = (s) => (plan[s.id] || []).map((x) => { const t = (s.id === 'people' || s.id === 'professionals') ? telOf(x) : null; return `<li>${t ? esc(x.slice(0, x.indexOf(t.match))) + `<a href="tel:${esc(t.tel)}">${esc(t.match.trim())}</a>` + esc(x.slice(x.indexOf(t.match) + t.match.length)) : esc(x)}</li>`; }).join('');
    const part = (s, i) => {
      const items = mine(s) + (s.id === 'professionals' ? PLAN_SERVICES.map(svc).join('') : '');
      return `<h2>${i + 1}. ${esc(s.title)}</h2>${items ? `<ul>${items}</ul>` : '<p class="e">Nothing here yet.</p>'}`;
    };
    return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My safety plan</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:1rem auto;padding:0 1rem;color:#1d2a26;background:#fff}h1{font-size:1.5rem}h2{font-size:1.05rem;margin:1.2rem 0 .3rem}a{color:#0b5e4a;font-weight:600}.u{border:2px solid #b3261e;border-radius:10px;padding:.6rem .8rem}.e{color:#5b6b66}li{margin:.2rem 0}@media (prefers-color-scheme:dark){body{background:#101614;color:#e7efec}a{color:#7fd6bd}.e{color:#a6b5b0}}</style></head><body>
<h1>My safety plan</h1><p>My suicide prevention safety plan. When things feel too much, work through the steps in order.</p><p class="u"><strong>Call <a href="tel:000">000</a> if you are in immediate danger.</strong> Lifeline <a href="tel:131114">13 11 14</a>, any time.</p>
${STEPS.map(part).join('\n')}
<h2>More services</h2><ul>${MORE_SERVICES.map(svc).join('')}</ul>
<p class="e">Saved from Hopewick on ${esc(new Date().toLocaleDateString('en-AU'))}. Keep it somewhere you can find it. This plan does not replace crisis support or care from a clinician.</p></body></html>`;
  }
  HW5.offlineHtml = offlineHtml;

  function printPlan() {
    document.body.classList.add('hw5-printing');
    const done = () => { document.body.classList.remove('hw5-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (_) { /* */ }
    setTimeout(done, 1500);
  }
  function downloadPlan(plan) {
    const blob = new Blob([offlineHtml(plan)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'my-safety-plan.html', id: 'hw5DownloadLink' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    say('Downloaded. Open the file any time, even without internet.');
  }

  function sharePanel(plan) {
    const text = planText(plan);
    const ta = h('textarea', { class: 'hw-textarea', id: 'hw5ShareText', rows: '8', readonly: true, 'aria-label': 'Your plan as text' });
    ta.value = text;
    return h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw5Share', 'aria-labelledby': 'hw5ShareT' },
      h('h2', { class: 'hw3-h2', id: 'hw5ShareT', tabindex: '-1', text: 'Share with someone you trust' }),
      h('p', { text: 'Only share your plan with someone you trust. Hopewick never sends it anywhere: you choose who gets it, using your own messages or email.' }),
      ta,
      h('div', { class: 'hw-card__actions' },
        typeof navigator.share === 'function' ? btn('Share…', async () => { try { await navigator.share({ title: 'My safety plan', text }); } catch (_) { /* cancelled */ } }, { kind: 'primary', attrs: { id: 'hw5ShareNow' } }) : null,
        btn('Copy text', async () => { try { await navigator.clipboard.writeText(text); say('Copied. Paste it into a message to someone you trust.'); } catch (_) { ta.select(); say('Select the text and copy it.'); } }, { attrs: { id: 'hw5Copy' } }),
        btn('Close', () => { ui.share = false; HW3.render('safety'); focusId('hw5ShareBtn'); }, { kind: 'ghost' })));
  }

  function summary(root) {
    const plan = current();
    const n = filled(plan);
    if (!n) {
      root.appendChild(h('section', { class: 'hw-card hw-card--tinted hw3-card', id: 'hw5Empty', 'aria-labelledby': 'hw5EmptyT' },
        h('h2', { class: 'hw3-h2', id: 'hw5EmptyT', text: 'Your plan is empty' }),
        h('p', { text: 'It takes about 10 minutes, one step at a time. You can stop and come back.' }),
        h('div', { class: 'hw-card__actions' }, btn('Start step by step', () => { ui.view = 'guided'; ui.step = 0; HW3.render('safety'); focusId('hw5StepT'); }, { kind: 'primary', attrs: { id: 'hw5Start' } }))));
      return;
    }
    const wrap = h('div', { id: 'hw5Printable' }, planBlock(plan), servicesCard('hw5PrintServices', MORE_SERVICES, 'More services you can call'));
    root.appendChild(wrap);
    root.appendChild(h('div', { class: 'hw-card__actions hw5-actions' },
      btn('Edit step by step', () => { ui.view = 'guided'; ui.step = 0; ui.draft = null; HW3.render('safety'); focusId('hw5StepT'); }, { attrs: { id: 'hw5Edit' } }),
      btn('Print or save as PDF', () => printPlan(), { attrs: { id: 'hw5Print', 'aria-describedby': 'hw5PrintHint' } }),
      btn('Download offline copy', () => downloadPlan(plan), { attrs: { id: 'hw5Download' } }),
      btn('Share with someone I trust', () => { ui.share = true; HW3.render('safety'); focusId('hw5ShareT'); }, { attrs: { id: 'hw5ShareBtn' } })));
    root.appendChild(h('p', { class: 'hw-hint', id: 'hw5PrintHint', text: 'To save a PDF, choose “Save as PDF” as the printer. Keep a copy on your phone or on the fridge.' }));
    if (ui.share) root.appendChild(sharePanel(plan));
    root.appendChild(h('p', { class: 'hw-hint', text: `${n} of ${STEPS.length} steps filled in. ${savedWhere()}` }));
  }

  function loadVersions() {
    const key = acctKey();
    if (s5.versions && s5.versionsKey === key) return;
    s5.versionsKey = key;
    s5.versions = 'loading';
    api('GET', '/api/me/safety-plan/versions').then((d) => { s5.versions = d.versions || []; }).catch((e) => { s5.versions = { error: failMessage(e) }; })
      .finally(() => { try { if (appTab === 'safety' && ui.view === 'history') HW3.render('safety'); } catch (_) { /* */ } });
  }
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_) { return iso; } };
  function history(root) {
    loadVersions();
    const sec = h('section', { class: 'hw-card hw3-card', id: 'hw5History', 'aria-labelledby': 'hw5HistoryT' },
      h('h2', { class: 'hw3-h2', id: 'hw5HistoryT', tabindex: '-1', text: 'Earlier versions' }),
      h('p', { class: 'hw-hint', text: 'Every save keeps a copy (the last 20). Restoring an older copy saves it as a new version, so nothing is lost.' }));
    const v = s5.versions;
    if (v === 'loading' || v == null) sec.appendChild(h('p', { role: 'status', text: 'Loading…' }));
    else if (v.error) sec.appendChild(h('p', { class: 'hw3-note hw3-note--warn', role: 'status', text: v.error }));
    else if (!v.length) sec.appendChild(h('p', { text: 'No saved versions yet. Your first save will show here.' }));
    else {
      sec.appendChild(h('ul', { class: 'hw3-list' }, v.map((x, i) => h('li', { class: 'hw3-list__item' },
        h('div', {}, h('p', { class: 'hw3-list__title', text: `Version ${x.version}${i === 0 ? ' (current)' : ''}` }),
          h('p', { class: 'hw-hint', text: `${when(x.savedAt)} · ${x.reason === 'restore' ? 'restored' : 'saved'} · ${x.items} ${x.items === 1 ? 'item' : 'items'}` })),
        h('div', { class: 'hw3-list__actions' },
          btn('View', async () => {
            try { const d = await api('GET', `/api/me/safety-plan/versions/${x.version}`); ui.viewing = d; HW3.render('safety'); focusId('hw5ViewT'); } catch (e) { say(failMessage(e), true); }
          }, { kind: 'ghost', attrs: { id: `hw5View-${x.version}`, 'aria-label': `View version ${x.version}` } }),
          i > 0 ? btn('Restore', async () => {
            if (!confirm(`Restore version ${x.version}? Your current plan stays in the history.`)) return;
            try {
              const d = await api('POST', `/api/me/safety-plan/versions/${x.version}/restore`, {});
              HW3.state.safety = d.safety; s5.versions = null; ui.viewing = null; ui.draft = null;
              say(`Version ${x.version} restored`); announce(`Version ${x.version} restored`); HW3.render('safety'); focusId('hw5HistoryT');
            } catch (e) { say(failMessage(e), true); }
          }, { kind: 'ghost', attrs: { id: `hw5Restore-${x.version}`, 'aria-label': `Restore version ${x.version}` } }) : null)))));
    }
    root.appendChild(sec);
    if (ui.viewing) {
      const o = emptyPlan(); STEPS.forEach((s) => { o[s.id] = (ui.viewing.safety && ui.viewing.safety[s.id]) || []; });
      root.appendChild(planBlock(o, { id: 'hw5View', title: `Version ${ui.viewing.version}`, when: when(ui.viewing.savedAt) }));
    }
  }

  function renderSafety(root) {
    root.appendChild(header('My safety plan', 'Your suicide prevention safety plan, one step at a time. Always free. It does not replace crisis support or a plan made with a clinician.'));
    root.appendChild(urgentBox());
    root.appendChild(aboutCard(!filled(current())));
    const note = K.stateNote();
    if (note && online()) root.appendChild(note);
    if (ui.view === 'history' && !online()) ui.view = 'summary';
    if (!ui.draft && ui.view === 'guided' && !filled(current()) && ui.step === 0) { /* fresh start */ }
    modeTabs(root);
    if (ui.view === 'guided') guided(root);
    else if (ui.view === 'history') history(root);
    else summary(root);
    if (ui.view !== 'summary' || !filled(current())) root.appendChild(servicesCard());
  }
  HW3.ext.safety = { render: renderSafety, busy: () => {
    // Do not wipe what the person is typing on a background repaint.
    const a = document.activeElement;
    return !!(a && a.id && a.id.startsWith('hw5Step-') && appTab === 'safety' && a.value !== (draft()[a.id.slice(8)] || []).join('\n'));
  } };
  HW5.openSafety = (view) => { ui.view = view || (filled(current()) ? 'summary' : 'guided'); try { setAppTab('safety'); } catch (_) { /* */ } };

  /* ------------------------------------------------------------------ */
  /* About you (preferences)                                             */
  /* ------------------------------------------------------------------ */
  function renderPreferences(root) {
    root.appendChild(header('About you', 'Choose what Hopewick shows you and how Hope talks with you. Nothing here is guessed: you choose all of it, and you can change or reset it any time.'));
    if (online() && !s5.prefs) { root.appendChild(h('p', { class: 'hw3-note', role: 'status', text: 'Loading your preferences…' })); load(false).then(() => { try { if (appTab === 'preferences') HW3.render('preferences'); } catch (_) { /* */ } }); return; }
    if (demo()) root.appendChild(h('p', { class: 'hw3-note', role: 'note', text: 'Demo mode: nothing you do here is saved.' }));
    const p = ui.prefsDraft || (ui.prefsDraft = JSON.parse(JSON.stringify(prefs())));
    const name = h('input', { class: 'hw-input', id: 'hw5Name', type: 'text', maxlength: '40', autocomplete: 'nickname', 'aria-describedby': 'hw5NameH' });
    name.value = p.preferredName || '';
    name.addEventListener('input', () => { p.preferredName = name.value; });
    const tone = (id, label, hint) => h('label', { class: 'hw5-radio' }, h('input', { type: 'radio', name: 'hw5Tone', value: id, id: `hw5Tone-${id}`, checked: p.tone === id, onchange: () => { p.tone = id; } }), h('span', {}, h('strong', { text: label }), ' ', h('span', { class: 'hw-hint', text: hint })));
    const faithSwitch = h('button', { type: 'button', role: 'switch', class: 'hw5-switch', id: 'hw5FaithSwitch', 'aria-checked': p.faithOptIn ? 'true' : 'false', 'aria-describedby': 'hw5FaithH',
      onclick: () => { p.faithOptIn = !p.faithOptIn; HW3.render('preferences'); focusId('hw5FaithSwitch'); } }, h('span', { class: 'hw5-switch__knob', 'aria-hidden': 'true' }), h('span', { text: p.faithOptIn ? 'On' : 'Off' }));
    const trad = h('select', { class: 'hw-input', id: 'hw5Tradition', onchange: (e) => { p.faithTradition = e.target.value; HW3.render('preferences'); focusId('hw5Tradition'); } }, TRADITIONS.map((t) => h('option', { value: t.id, selected: p.faithTradition === t.id, text: t.label })));
    const form = h('form', { class: 'hw-card hw3-card hw3-form', id: 'hw5PrefsForm', 'aria-labelledby': 'hw5PrefsT', onsubmit: async (e) => {
      e.preventDefault();
      try {
        await savePrefs({ preferredName: p.preferredName || '', focusAreas: p.focusAreas || [], recoveryStage: p.recoveryStage || '', tone: p.tone, faithOptIn: !!p.faithOptIn, faithTradition: p.faithTradition, onboarded: true });
        ui.prefsDraft = null; say('Saved'); announce('Preferences saved'); HW3.render('preferences'); focusId('hw5PrefsT');
      } catch (ex) { say(failMessage(ex), true); }
    } },
      h('h2', { class: 'hw3-h2', id: 'hw5PrefsT', tabindex: '-1', text: 'Your preferences' }),
      h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw5Name', text: 'What would you like to be called?' }), h('p', { class: 'hw-hint', id: 'hw5NameH', text: 'Optional. Hope uses it in conversation.' }), name),
      h('fieldset', { class: 'hw-field hw5-fieldset' }, h('legend', { class: 'hw-label', text: 'What would you like help with?' }), h('p', { class: 'hw-hint', text: 'Pick any. Your dashboard and Hope will suggest tools for these.' }),
        h('div', { class: 'hw5-chips' }, FOCUS.map((f) => {
          const on = (p.focusAreas || []).includes(f.id);
          const c = chipToggle(f.label, on, () => { const set = new Set(p.focusAreas || []); if (set.has(f.id)) set.delete(f.id); else set.add(f.id); p.focusAreas = FOCUS.map((x) => x.id).filter((x) => set.has(x)); c.setAttribute('aria-pressed', set.has(f.id) ? 'true' : 'false'); });
          c.id = `hw5Focus-${f.id}`;
          return c;
        }))),
      h('fieldset', { class: 'hw-field hw5-fieldset', id: 'hw5StageSet' }, h('legend', { class: 'hw-label', text: 'Where are you in recovery?' }),
        h('p', { class: 'hw-hint', text: 'Optional. Your daily tips fit where you are. First week keeps things extra simple.' }),
        STAGES.map((sg) => h('label', { class: 'hw5-radio' }, h('input', { type: 'radio', name: 'hw5Stage', value: sg.id, id: `hw5Stage-${sg.id}`, checked: p.recoveryStage === sg.id, onchange: () => { p.recoveryStage = sg.id; } }), h('span', {}, h('strong', { text: sg.label }), sg.hint ? ' ' : '', sg.hint ? h('span', { class: 'hw-hint', text: sg.hint }) : null)))),
      h('fieldset', { class: 'hw-field hw5-fieldset' }, h('legend', { class: 'hw-label', text: 'How should Hope talk with you?' }),
        tone('gentle', 'Gentle', 'Soft, warm and unhurried.'), tone('direct', 'Direct', 'Clear and to the point, still kind.')),
      h('fieldset', { class: 'hw-field hw5-fieldset', id: 'hw5FaithSet' }, h('legend', { class: 'hw-label', text: 'Faith content' }),
        h('div', { class: 'hw5-switch-row' }, h('span', { id: 'hw5FaithL', text: 'Show faith content' }), faithSwitch),
        h('p', { class: 'hw-hint', id: 'hw5FaithH', text: 'Off unless you turn it on. With Christian faith on you get short Bible reflections and prayers beside check-ins, coping tools and your journal, and faith modules. Hope only brings up faith if you turn this on. Faith never replaces professional care.' }),
        p.faithOptIn ? h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hw5Tradition', text: 'Your tradition' }), trad,
          CHRISTIAN.includes(p.faithTradition) ? null : h('p', { class: 'hw-hint', id: 'hw5TradNote', text: 'Hope will respect your tradition. The reflections and faith modules are Christian, so they stay hidden.' })) : null),
      h('div', { class: 'hw-card__actions' },
        h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: 'hw5PrefsSave', text: 'Save' }),
        btn('Reset to defaults', async () => {
          if (!confirm('Reset your preferences? Faith content turns off and your focus areas are cleared.')) return;
          try { await resetPrefs(); ui.prefsDraft = null; say('Preferences reset'); announce('Preferences reset'); HW3.render('preferences'); focusId('hw5PrefsT'); } catch (e) { say(failMessage(e), true); }
        }, { kind: 'ghost', attrs: { id: 'hw5PrefsReset' } })),
      h('p', { class: 'hw-hint', text: 'Hopewick never works out your health, faith or anything else about you from what you write. Only what you choose here is used.' }));
    root.appendChild(form);
  }
  HW3.ext.preferences = { render: renderPreferences, busy: () => false };
  if (!HW3.views.includes('preferences')) HW3.views.push('preferences');
  HW5.openPreferences = () => { ui.prefsDraft = null; try { setAppTab('preferences'); } catch (_) { /* */ } };

  /* ------------------------------------------------------------------ */
  /* Dashboard: For you, onboarding nudge, faith reflection             */
  /* ------------------------------------------------------------------ */
  const FOR_YOU = {
    mood: [['Daily check-in', () => setAppTab('checkin')], ['Self-compassion and mood tools', () => setAppTab('coping')]],
    anxiety: [['Calm breathing', () => setAppTab('coping', { tool: 'breathing-calm' })], ['Stress and anxiety module', () => HW3.openModule('stress-anxiety')]],
    aod: [['Recovery tracker', () => setAppTab('recovery')], ['Cravings and triggers module', () => HW3.openModule('cravings-triggers')], ['Relapse and exit plans', () => openPlans()]],
    anger: [['Anger: steady in the moment', () => setAppTab('topic', { topic: 'anger' })], ['Calm breathing', () => setAppTab('coping', { tool: 'breathing-calm' })]],
    relationships: [['Relationships: people and boundaries', () => setAppTab('topic', { topic: 'relationships' })]],
    sleep: [['Body basics', () => setAppTab('bodybasics')], ['Sleep basics module', () => HW3.openModule('sleep-basics')], ['Muscle relaxation', () => setAppTab('coping', { tool: 'muscle-relaxation' })]],
  };
  HW5.paintHome = function (box, grid) {
    if (!box || !grid) return;
    if (!online() && !demo()) return;
    if (online() && !s5.prefs) { load(false).then(() => { try { if (appTab === 'home' && s5.prefs) renderHome(); } catch (_) { /* */ } }); return; }
    const p = prefs();
    const card = h('section', { class: 'hw-card dash-card hw5-foryou', id: 'dashForYou', 'aria-labelledby': 'dashForYouT' },
      h('div', { class: 'hw-card__head' }, h('div', { class: 'dash-head-text' }, h('h2', { class: 'hw-card__title', id: 'dashForYouT', text: p.preferredName ? `For you, ${p.preferredName}` : 'For you' }))));
    if (!p.onboardedAt) {
      card.appendChild(h('p', { text: 'Tell Hopewick what you’d like help with, and how Hope should talk with you. It takes a minute, and you can change it any time.' }));
      card.appendChild(h('div', { class: 'hw-card__actions' }, btn('Set up About you', () => HW5.openPreferences(), { kind: 'primary', attrs: { id: 'dashForYouSetup' } })));
    } else {
      const picks = [];
      (p.focusAreas || []).forEach((f) => (FOR_YOU[f] || []).forEach((x) => { if (!picks.some((y) => y[0] === x[0])) picks.push(x); }));
      card.appendChild(h('p', { class: 'hw-hint', text: p.focusAreas && p.focusAreas.length ? `Based on what you chose: ${p.focusAreas.map((f) => (FOCUS.find((x) => x.id === f) || {}).label).join(', ').toLowerCase()}.` : 'You haven’t picked any focus areas. Add some in About you.' }));
      card.appendChild(h('div', { class: 'hw-card__actions' }, picks.slice(0, 5).map(([label, fn], i) => btn(label, () => { try { fn(); } catch (_) { /* */ } }, { kind: i === 0 ? 'primary' : 'secondary' })),
        btn('My safety plan', () => HW5.openSafety(), { kind: 'secondary', attrs: { id: 'dashForYouSafety' } }),
        btn('Edit About you', () => HW5.openPreferences(), { kind: 'ghost', attrs: { id: 'dashForYouEdit' } })));
    }
    grid.insertBefore(card, grid.firstChild);
    const ask = faithAskCard();
    if (ask) grid.insertBefore(ask, grid.firstChild);
    const f = faithCard('home', 'Home');
    if (f) { const today = document.getElementById('todayCard'); if (today && today.parentNode === box) today.after(f); else box.insertBefore(f, grid); }
  };

  /* Faith reflection beside the check-in and coping tools (only when on). Called by HW3 render. */
  HW3.afterRender = function (root, tab) {
    if (tab !== 'checkin' && tab !== 'coping') return;
    if (!christianOn() || root.querySelector('.hw5-faith')) return;
    const f = faithCard(tab);
    if (f) root.appendChild(f);
  };
  function paintJournal() {
    const hero = document.querySelector('#journalView .home-hero');
    if (!hero) return;
    let mount = document.getElementById('hw5JournalFaith');
    if (!mount) { mount = h('div', { id: 'hw5JournalFaith' }); hero.after(mount); }
    mount.replaceChildren();
    const f = faithCard('journal', 'Journal');
    if (f) mount.appendChild(f);
  }
  HW5.paintJournal = paintJournal;
})();
