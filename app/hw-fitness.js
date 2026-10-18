/* Hopewick Move & Recover: 30-Minute Move, sauna, cold and contrast.
 *
 * Behind the server flag FEATURE_FITNESS_PROTOCOLS (default off). While the
 * flag is off for this person every /api/fitness/* route answers 404, so
 * HWFIT.enabled() stays false and nothing renders: no hub card, no tab, no teaser.
 *
 * The server decides everything that matters (Plus, release drops, the safety
 * screen outcome, the 24-hour pause, the pre-session check). This file only
 * shows what the server returns. Screen answers are sent once and never kept here.
 *
 * Content has been clinically reviewed (founder confirmed, 18 Oct 2026).
 */
(function () {
  'use strict';

  const F = {};
  window.HWFIT = F;

  /* ---------------- helpers ---------------- */
  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
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
  function btn(label, onclick, { kind = 'secondary', attrs = {} } = {}) {
    return h('button', Object.assign({ type: 'button', class: `hw-btn hw-btn--sm hw-btn--${kind}`, onclick }, attrs), label);
  }
  function announce(msg) {
    const live = document.getElementById('hw3Live');
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }
  }
  function say(msg, bad) { try { toast(msg, !!bad); } catch (_) { announce(msg); } }
  const pid = () => { try { return chatProfileId() || 'main'; } catch (_) { return 'main'; } };
  const signedIn = () => { try { return !!(billingState && billingState.signedIn); } catch (_) { return false; } };
  const demo = () => { try { return !!isDemo; } catch (_) { return false; } };
  const plusNow = () => { try { return !!subscriptionPlus(); } catch (_) { return false; } };
  const curTab = () => { try { return appTab; } catch (_) { return ''; } };
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const spoken = (s) => { const m = Math.floor(s / 60); const r = s % 60; return [m ? `${m} minute${m === 1 ? '' : 's'}` : '', r ? `${r} second${r === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || '0 seconds'; };
  const when = (iso) => { try { return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' }).format(new Date(iso)); } catch (_) { return iso; } };
  const focusId = (id) => setTimeout(() => { const n = document.getElementById(id); if (n) n.focus(); }, 60);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MOODS = [
    { score: 1, label: 'Struggling', e: '😞' }, { score: 2, label: 'Low', e: '😔' }, { score: 3, label: 'Okay', e: '😐' },
    { score: 4, label: 'Good', e: '🙂' }, { score: 5, label: 'Great', e: '😄' },
  ];

  async function api(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = method === 'GET' || method === 'DELETE' ? `${path}${sep}profileId=${encodeURIComponent(pid())}` : path;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(Object.assign({ profileId: pid() }, body)) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status; err.code = data.code || ''; err.data = data;
      throw err;
    }
    return data;
  }
  function failMessage(err) {
    if (err && (err.status === 400 || err.status === 403 || err.status === 409)) return err.message;
    if (err && err.status === 401) return 'Sign in again to keep going.';
    return 'Hopewick could not do that just now. Please try again in a moment.';
  }

  /* ---------------- state ---------------- */
  const st = { key: null, loading: null, enabled: false, status: null, safety: null, program: null, protocols: null, questions: null, view: 'week', result: null, player: null, hc: null };
  F.state = st;

  /** Is Move & Recover switched on for this person? (Server flag; false until known.) */
  F.enabled = () => st.enabled;
  function whoKey() { let id = ''; try { id = billingState.id || ''; } catch (_) { id = ''; } return `${signedIn() && !demo() ? id : 'anon'}:${plusNow() ? 'plus' : 'free'}:${pid()}`; }

  async function refresh(force) {
    const key = whoKey();
    if (!force && st.key === key && !st.loading) return st;
    if (st.loading && st.key === key) return st.loading;
    st.key = key;
    st.loading = (async () => {
      const was = st.enabled;
      try {
        if (signedIn() && !demo()) {
          st.status = await api('GET', '/api/fitness/status');
          st.enabled = true;
        } else {
          st.status = null;
          st.safety = await api('GET', '/api/fitness/safety');
          st.enabled = true;
        }
      } catch (err) {
        // 404 = the flag is off for this person: show nothing at all.
        st.enabled = false; st.status = null;
      } finally { st.loading = null; }
      if (was !== st.enabled) {
        try { if (curTab() === 'tools') renderToolsHub(); } catch (_) { /* hub not ready */ }
        if (!st.enabled && curTab() === 'move') { try { setAppTab('home'); } catch (_) { /* */ } }
      }
      if (st.enabled && curTab() === 'move') render();
      return st;
    })();
    return st.loading;
  }
  F.refresh = (force) => refresh(force).catch(() => st);

  /** Tools hub card, or null (flag off). Called by renderToolsHub. */
  F.hubItem = () => {
    if (st.key !== whoKey()) F.refresh(false);
    if (!st.enabled) return null;
    return { id: 'move', title: 'Move & Recover', desc: '30-Minute Move, plus sauna and cold water with safety checks. The safety rules are free.', icon: 'sprout', plus: true, action: () => setAppTab('move') };
  };

  /** Called by setAppTab('move'). */
  F.show = (opts) => {
    if (!st.enabled) { try { setAppTab('home'); } catch (_) { /* */ } return; }
    render();
    if (!(opts && opts.skipFocus)) focusId('hwfTitle');
    F.refresh(true);
  };
  F.stop = () => { if (st.player) pausePlayer(); };

  const root = () => document.getElementById('hw3Inner');
  function render() {
    const r = root();
    if (!r || curTab() !== 'move') return;
    const scroller = document.getElementById('hwFeatureView') || document.scrollingElement;
    const keep = r.dataset.tab === 'move' && scroller ? scroller.scrollTop : 0;
    r.dataset.tab = 'move';
    r.replaceChildren();
    const s = st.status;
    r.appendChild(h('div', { class: 'home-hero hw3-hero' },
      h('h1', { id: 'hwfTitle', tabindex: '-1', text: 'Move & Recover' }),
      h('p', { text: '30 minutes a day of movement you can do at home, plus sauna and cold water done safely. Movement is tracked on its own and never touches your clean time.' })));
    if (s && s.preview) r.appendChild(h('p', { class: 'hw3-note hw3-note--warn', role: 'note', id: 'hwfPreview', text: 'Founder preview for Dwayne: members cannot see this yet. Content has been clinically reviewed.' }));
    else r.appendChild(h('p', { class: 'hw3-note', role: 'note', text: 'Clinically reviewed. General information, not personal medical advice. If you are unsure, check with your GP.' }));
    if (!s || !s.plus) renderFree(r);
    else renderPlus(r);
    r.appendChild(h('p', { class: 'hw3-crisis-line' }, 'Chest pain or fainting? Call ', h('a', { href: 'tel:000', text: '000' }), '. Need to talk? Lifeline ', h('a', { href: 'tel:131114', text: '13 11 14' }), '.'));
    if (scroller) scroller.scrollTop = keep;
  }
  F.render = render;

  /* ---------------- free: safety and info, plus one Plus card ---------------- */
  async function needSafety() {
    if (!st.safety) { try { st.safety = await api('GET', '/api/fitness/safety'); } catch (_) { return null; } render(); }
    return st.safety;
  }
  function renderFree(r) {
    r.appendChild(h('section', { class: 'hw-card hw3-card hwf-plus', id: 'hwfPlusCard', 'aria-labelledby': 'hwfPlusT' },
      h('h2', { class: 'hw3-h2', id: 'hwfPlusT', text: 'Part of Hopewick Plus' }),
      h('p', { text: 'Plus includes the full 30-Minute Move program with adapted options for back, knee, hip and shoulder injuries and seated workouts, and the sauna, cold water and contrast guides after a short safety check. The safety rules below are free for everyone.' }),
      h('div', { class: 'hw-card__actions' },
        signedIn() ? btn('See Hopewick Plus', () => { try { HW3.upgrade(); } catch (_) { /* */ } }, { kind: 'primary', attrs: { id: 'hwfUpgrade' } })
          : btn('Sign in', () => { try { openAccountDlg(); } catch (_) { /* */ } }, { kind: 'primary', attrs: { id: 'hwfSignIn' } }))));
    if (!st.safety) { needSafety(); r.appendChild(h('p', { class: 'hw-hint', text: 'Loading the safety rules…' })); return; }
    safetyBlocks(r, st.safety);
  }

  function safetyBlocks(r, data) {
    const S = data.safety;
    r.appendChild(h('section', { class: 'hw-card hw3-card', id: 'hwfRules', 'aria-labelledby': 'hwfRulesT' },
      h('h2', { class: 'hw3-h2', id: 'hwfRulesT', text: S.title }),
      h('ol', { class: 'hwf-rules' }, S.rules.map((x) => h('li', null, h('strong', { text: x.title }), h('span', { text: ` ${x.text}` })))),
      h('h3', { class: 'hw3-h3', text: 'Stop and get out if you notice' }),
      h('ul', { class: 'hwf-bullets' }, S.stopSigns.map((x) => h('li', { text: x }))),
      h('p', { class: 'hw3-support', role: 'note' }, h('span', { text: S.emergency })),
      h('p', { class: 'hw-hint', text: S.footer })));
    const I = data.info;
    if (I) r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfInfoT' },
      h('h2', { class: 'hw3-h2', id: 'hwfInfoT', text: I.title }), I.paragraphs.map((p) => h('p', { text: p }))));
  }

  /* ---------------- Plus ---------------- */
  const VIEWS = [{ id: 'week', label: 'This week' }, { id: 'exercises', label: 'Exercises' }, { id: 'heatcold', label: 'Heat & cold' }, { id: 'safety', label: 'Safety' }];
  function renderPlus(r) {
    const s = st.status;
    if (st.player) { renderPlayer(r); return; }
    const nav = h('div', { class: 'hw-chips hwf-nav', role: 'group', 'aria-label': 'Move & Recover sections' },
      VIEWS.map((v) => h('button', { type: 'button', class: 'hw-chip', id: `hwfNav-${v.id}`, 'aria-pressed': String(st.view === v.id), onclick: () => { st.view = v.id; st.result = null; render(); focusId(`hwfNav-${v.id}`); } }, v.label)));
    r.appendChild(nav);
    if (s.pausedUntil) r.appendChild(h('p', { class: 'hw3-note hw3-note--warn', role: 'note', id: 'hwfPaused', text: `Heat and cold are paused until ${when(s.pausedUntil)}. That’s okay. A walk or some stretching is a great choice today.` }));
    if (st.view === 'week') renderWeek(r);
    else if (st.view === 'exercises') renderExercises(r);
    else if (st.view === 'heatcold') renderHeatCold(r);
    else { if (!st.safety) needSafety(); else safetyBlocks(r, st.safety); }
  }

  async function needProgram() {
    try { st.program = await api('GET', '/api/fitness/program'); } catch (err) { st.program = { error: failMessage(err) }; }
    render();
  }

  /* ----- the safety screen (Part A or Part B) ----- */
  async function needQuestions() {
    try { st.questions = await api('GET', '/api/fitness/screen/questions'); } catch (err) { st.questions = { error: failMessage(err) }; }
    render();
  }
  function screenForm(part) {
    const q = st.questions;
    if (!q) { needQuestions(); return h('p', { class: 'hw-hint', text: 'Loading the safety questions…' }); }
    if (q.error) return h('p', { class: 'hw3-error', role: 'alert', text: q.error });
    const list = part === 'move' ? q.move : q.heatCold;
    if (!list) return h('p', { class: 'hw3-note', text: 'The heat and cold safety questions open in a coming weekly drop.' });
    const id = part === 'move' ? 'hwfScreenA' : 'hwfScreenB';
    const err = h('p', { class: 'hw3-error', id: `${id}Err`, role: 'alert' });
    const form = h('form', { class: 'hw-card hw3-card', id, 'aria-labelledby': `${id}T`, novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      const answers = {};
      for (const x of list) {
        const pick = form.querySelector(`input[name="${id}-${x.id}"]:checked`);
        if (!pick) { err.textContent = 'Please answer every question with yes or no.'; const first = form.querySelector(`input[name="${id}-${x.id}"]`); if (first) first.focus(); return; }
        answers[x.id] = pick.value === 'yes';
      }
      const agree = part === 'heat-cold' ? form.querySelector('#hwfAgree').checked : undefined;
      if (part === 'heat-cold' && !agree) { err.textContent = 'Please read and agree to the heat and cold rules.'; form.querySelector('#hwfAgree').focus(); return; }
      try {
        const out = await api('POST', '/api/fitness/screen', { part, answers, agree });
        st.result = Object.assign({ part }, out);
        st.protocols = null; st.program = null;
        await refresh(true);
        render();
        focusId('hwfResultT');
      } catch (e) { err.textContent = failMessage(e); }
    } },
    h('h2', { class: 'hw3-h2', id: `${id}T`, tabindex: '-1', text: part === 'move' ? 'Before you start: movement safety questions' : 'Heat and cold safety questions' }),
    h('p', { text: part === 'move' ? 'A few yes or no questions so the plan suits you. Hopewick keeps only the result, never your answers.' : 'Sauna and cold water put real strain on the body. These questions decide what is safe to unlock. Hopewick keeps only the result, never your answers.' }),
    list.map((x, i) => h('fieldset', { class: 'hw3-fieldset hwf-q' },
      h('legend', { class: 'hwf-q__text' }, h('span', { class: 'hwf-q__num', text: `${i + 1}. ` }), x.text),
      h('div', { class: 'hwf-yn' },
        h('label', { class: 'hwf-radio' }, h('input', { type: 'radio', name: `${id}-${x.id}`, value: 'yes', id: `${id}-${x.id}-y` }), h('span', { text: 'Yes' })),
        h('label', { class: 'hwf-radio' }, h('input', { type: 'radio', name: `${id}-${x.id}`, value: 'no', id: `${id}-${x.id}-n` }), h('span', { text: 'No' }))))),
    part === 'heat-cold' ? h('label', { class: 'hwf-check' }, h('input', { type: 'checkbox', id: 'hwfAgree' }), h('span', { text: q.agreement })) : null,
    err,
    h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: `${id}Submit`, text: 'See my result' })));
    return form;
  }
  const OUT_LABEL = { green: 'Good to go', amber: 'Check first', red: 'Not for now' };
  const AREA_LABEL = { move: '30-Minute Move', sauna: 'Sauna', cold: 'Cold water', contrast: 'Contrast' };
  function resultCard() {
    const res = st.result;
    if (!res) return null;
    const areas = res.part === 'move' ? ['move'] : ['sauna', 'cold', 'contrast'];
    return h('section', { class: 'hw-card hw3-card hwf-result', 'aria-labelledby': 'hwfResultT' },
      h('h2', { class: 'hw3-h2', id: 'hwfResultT', tabindex: '-1', text: 'Your result' }),
      h('ul', { class: 'hwf-areas' }, areas.map((a) => { const x = res.areas[a]; const o = x.outcome || 'green'; return h('li', { class: `hwf-area hwf-area--${o}` }, h('span', { class: 'hwf-dot', 'aria-hidden': 'true' }), h('strong', { text: AREA_LABEL[a] }), h('span', { text: ` ${OUT_LABEL[o]}` })); })),
      res.reasons.length ? h('ul', { class: 'hwf-bullets' }, res.reasons.map((x) => h('li', { text: x.text }))) : h('p', { text: 'Nothing in your answers needs a check first. Start slowly and listen to your body.' }),
      res.suggestTrack ? h('p', { class: 'hw3-note', text: 'You mentioned an injury or ongoing pain. Pick an adapted track below, and check the plan with your GP, physio or exercise physiologist.' }) : null,
      h('p', { class: 'hw-hint', text: 'Only the result is saved, not your answers. We will ask again in 6 months, or any time your health or medicines change.' }));
  }
  function clearanceForm(areas) {
    const err = h('p', { class: 'hw3-error', role: 'alert' });
    const box = h('input', { type: 'checkbox', id: `hwfClear-${areas.join('-')}` });
    return h('form', { class: 'hwf-clear', onsubmit: async (ev) => {
      ev.preventDefault();
      if (!box.checked) { err.textContent = 'Tick the box once your doctor or pharmacist has said this is OK for you.'; box.focus(); return; }
      try { await api('POST', '/api/fitness/screen/clearance', { confirm: true, areas }); say('Saved. Thanks for checking.'); await refresh(true); st.protocols = null; render(); } catch (e) { err.textContent = failMessage(e); }
    } }, h('label', { class: 'hwf-check' }, box, h('span', { text: 'My doctor or pharmacist has said this is OK for me.' })), err,
    h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--secondary hw-btn--sm', text: 'Save' })));
  }

  /* ----- This week ----- */
  function renderWeek(r) {
    const s = st.status;
    const move = s.screen.areas.move;
    const res = st.result && st.result.part === 'move' ? resultCard() : null;
    if (res) r.appendChild(res);
    if (move.status === 'unscreened' || move.status === 'expired' || move.status === 'needs-rescreen') {
      if (move.status !== 'unscreened') r.appendChild(h('p', { class: 'hw3-note', role: 'note', text: move.status === 'expired' ? 'It has been 6 months. Please answer the movement safety questions again.' : 'You stopped a session early because something did not feel right. Please check with your GP, then answer the questions again.' }));
      r.appendChild(screenForm('move'));
      return;
    }
    if (move.status === 'red') {
      r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfRedT' }, h('h2', { class: 'hw3-h2', id: 'hwfRedT', text: 'Not for now' }),
        h('p', { text: 'Please see your GP before starting the program. Gentle walking and stretching your treatment team is happy with are still a great choice.' }),
        move.recheckAfter ? h('p', { class: 'hw-hint', text: `We will ask again from ${when(move.recheckAfter)}.` }) : null,
        move.canRecheck || !move.recheckAfter ? btn('Answer the questions again', () => { st.result = null; s.screen.areas.move = { status: 'unscreened' }; render(); }) : null));
      return;
    }
    if (move.status === 'needs-clearance') {
      r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfAmberT' }, h('h2', { class: 'hw3-h2', id: 'hwfAmberT', text: 'Check with your doctor first' }),
        h('p', { text: 'Something in your answers is worth checking with your GP, physio or exercise physiologist before you start. Once they say it is OK, tick the box.' }), clearanceForm(['move'])));
      return;
    }
    const P = st.program;
    if (!P) { needProgram(); r.appendChild(h('p', { class: 'hw-hint', text: 'Loading your week…' })); return; }
    if (P.error) { r.appendChild(h('p', { class: 'hw3-error', role: 'alert', text: P.error })); return; }
    const today = P.workouts.find((w) => w.id === (s.today && s.today.suggestion)) || P.workouts.find((w) => w.id === P.suggestion);
    const wk = s.week;
    const pct = (a, b) => Math.min(100, Math.round((a / Math.max(1, b)) * 100));
    r.appendChild(h('section', { class: 'hw-card hw3-card hwf-today', 'aria-labelledby': 'hwfTodayT' },
      h('p', { class: 'hw-hint', text: `Today, ${DAYS[today ? today.day : 0]}` }),
      h('h2', { class: 'hw3-h2', id: 'hwfTodayT', tabindex: '-1', text: today ? today.title : 'Gentle Recovery' }),
      today && today.purpose ? h('p', { text: today.purpose }) : null,
      h('p', { class: 'hw-hint', text: '5 minutes warm-up, 20 minutes main block, 5 minutes cool-down.' }),
      h('div', { class: 'hw-card__actions' },
        today && today.released !== false ? btn('Start today’s 30 minutes', () => startWorkout(today), { kind: 'primary', attrs: { id: 'hwfStart' } }) : null,
        btn('Add to My Next Step', async () => { try { await api('POST', '/api/fitness/next-step', { planKey: today.id }); say('Added to My Next Step'); try { HW3.sync(true); } catch (_) { /* */ } } catch (e) { say(failMessage(e), true); } }, { attrs: { id: 'hwfNextStep' } }))));
    r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfRingT' },
      h('h2', { class: 'hw3-h2', id: 'hwfRingT', text: 'This week so far' }),
      h('div', { class: 'hwf-stats' },
        h('div', { class: 'hwf-stat' }, h('p', { class: 'hwf-stat__num', text: `${wk.movementMinutes} of ${wk.minutesTarget}` }), h('p', { class: 'hwf-stat__label', id: 'hwfMinL', text: 'minutes of movement' }),
          h('div', { class: 'hw-progress', role: 'progressbar', 'aria-labelledby': 'hwfMinL', 'aria-valuemin': '0', 'aria-valuemax': String(wk.minutesTarget), 'aria-valuenow': String(Math.min(wk.movementMinutes, wk.minutesTarget)) }, h('span', { style: `width:${pct(wk.movementMinutes, wk.minutesTarget)}%` }))),
        h('div', { class: 'hwf-stat' }, h('p', { class: 'hwf-stat__num', text: `${wk.strengthDays} of ${wk.strengthDaysTarget}` }), h('p', { class: 'hwf-stat__label', id: 'hwfStrL', text: 'strength days' }),
          h('div', { class: 'hw-progress', role: 'progressbar', 'aria-labelledby': 'hwfStrL', 'aria-valuemin': '0', 'aria-valuemax': String(wk.strengthDaysTarget), 'aria-valuenow': String(Math.min(wk.strengthDays, wk.strengthDaysTarget)) }, h('span', { style: `width:${pct(wk.strengthDays, wk.strengthDaysTarget)}%` })))),
      wk.moodPairs ? h('p', { class: 'hw-hint', text: `Your mood went up after ${wk.moodLifted} of ${wk.moodPairs} sessions this week.` }) : null,
      h('p', { class: 'hw-hint', text: wk.note })));
    // Level and track.
    const pick = (label, id, list, cur, key) => h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: label }),
      h('div', { class: 'hw-chips' }, list.map((x) => h('button', { type: 'button', class: 'hw-chip', id: `${id}-${x.id}`, 'aria-pressed': String(cur === x.id), disabled: x.released === false ? true : null, title: x.desc || x.note || null,
        onclick: async () => { try { await api('PUT', '/api/fitness/prefs', { [key]: x.id }); st.program = null; await refresh(true); render(); focusId(`${id}-${x.id}`); announce(`${x.label} chosen`); } catch (e) { say(failMessage(e), true); } } }, x.released === false ? `${x.label} (soon)` : x.label))));
    const L = P.levels.find((x) => x.id === P.level);
    const T = P.tracks.find((x) => x.id === P.track);
    r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfSetT' },
      h('h2', { class: 'hw3-h2', id: 'hwfSetT', text: 'Your level and track' }),
      pick('Level', 'hwfLevel', P.levels, P.level, 'level'), L ? h('p', { class: 'hw-hint', text: `${L.rounds} rounds, ${L.reps} reps, ${L.restSeconds} seconds rest. Effort ${L.effort}. ${L.note}` }) : null,
      pick('Track', 'hwfTrack', P.tracks, P.track, 'track'), T ? h('p', { class: 'hw-hint', text: T.desc }) : null,
      P.track !== 'standard' ? h('p', { class: 'hw3-note', text: P.trackNote }) : null));
    // The week.
    const order = [1, 2, 3, 4, 5, 6, 0];
    r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfWeekT' },
      h('h2', { class: 'hw3-h2', id: 'hwfWeekT', text: 'The week' }),
      h('ul', { class: 'hw3-list' }, order.map((d) => {
        const w = P.workouts.find((x) => x.day === d && !(x.id === 'strength-c' && P.level !== 'advanced'));
        if (!w) return null;
        return h('li', { class: 'hw3-list__item' }, h('div', null, h('p', { class: 'hw3-list__title', text: `${DAYS[d]}: ${w.title}` }), w.purpose ? h('p', { class: 'hw-hint', text: w.purpose }) : h('p', { class: 'hw-hint', text: 'Coming in a weekly drop.' })),
          w.released === false ? null : h('div', { class: 'hw3-list__actions' }, btn('Start', () => startWorkout(w), { attrs: { 'aria-label': `Start ${w.title}` } })));
      })),
      h('ul', { class: 'hwf-bullets' }, P.rotationRules.map((x) => h('li', { text: x }))),
      h('div', { class: 'hw-card__actions' }, btn('Make a “Move this week” plan', async () => { try { await api('POST', '/api/fitness/weekly-plan', {}); say('Added to My Next Step as a weekly plan'); try { HW3.sync(true); } catch (_) { /* */ } } catch (e) { say(failMessage(e), true); } }, { attrs: { id: 'hwfWeekly' } }))));
    r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwfCareT' },
      h('h2', { class: 'hw3-h2', id: 'hwfCareT', text: P.overdoingIt.title }), h('p', { text: P.overdoingIt.text }),
      h('details', { class: 'hw3-details' }, h('summary', { text: P.painGuide.title || 'Pain: what is okay' }), painGuide(P.painGuide)),
      h('p', { class: 'hw-hint', text: P.sleepTip })));
  }
  function painGuide(g) {
    const items = Array.isArray(g.levels) ? g.levels : [];
    return h('div', null, g.intro ? h('p', { text: g.intro }) : null, h('ul', { class: 'hwf-bullets' }, items.map((x) => h('li', null, h('strong', { text: `${x.label}: ` }), x.text))));
  }

  /* ----- Exercises ----- */
  function renderExercises(r) {
    const P = st.program;
    if (!P) { needProgram(); r.appendChild(h('p', { class: 'hw-hint', text: 'Loading the exercises…' })); return; }
    if (P.error) { r.appendChild(h('p', { class: 'hw3-error', role: 'alert', text: P.error })); return; }
    const groups = {};
    for (const [id, e] of Object.entries(P.exercises)) (groups[e.group] = groups[e.group] || []).push([id, e]);
    r.appendChild(h('p', { class: 'hw-hint', text: `Showing how-to steps for the ${P.tracks.find((t) => t.id === P.track).label.toLowerCase()} track. Easier and harder options are on every move.` }));
    for (const [g, list] of Object.entries(groups)) {
      const title = g.charAt(0).toUpperCase() + g.slice(1);
      r.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-label': title },
        h('h2', { class: 'hw3-h2', text: title }),
        list.map(([id, e]) => exerciseDetails(id, e, P.track))));
    }
  }
  function exerciseDetails(id, e, track, open, summary) {
    const adapted = e.adapted && e.adapted[track];
    return h('details', { class: 'hw3-details hwf-ex', id: `hwfEx-${id}`, open: open || null },
      h('summary', { text: summary || e.name }),
      h('h3', { class: 'hw3-h3', text: 'How to' }), h('ol', { class: 'hwf-steps' }, e.steps.map((x) => h('li', { text: x }))),
      h('h3', { class: 'hw3-h3', text: 'Form cues' }), h('ul', { class: 'hwf-bullets' }, e.cues.map((x) => h('li', { text: x }))),
      e.easier ? h('p', null, h('strong', { text: 'Easier: ' }), e.easier) : null,
      e.harder ? h('p', null, h('strong', { text: 'Harder: ' }), e.harder) : null,
      adapted ? h('p', { class: 'hw3-note' }, h('strong', { text: 'For your track: ' }), adapted) : null,
      e.caution ? h('p', { class: 'hw3-note hw3-note--warn', text: e.caution }) : null);
  }

  /* ----- Heat & cold ----- */
  async function needProtocols() {
    try { st.protocols = await api('GET', '/api/fitness/protocols'); } catch (err) { st.protocols = { error: failMessage(err) }; }
    render();
  }
  function renderHeatCold(r) {
    const s = st.status;
    const P = st.protocols;
    if (!P) { needProtocols(); r.appendChild(h('p', { class: 'hw-hint', text: 'Loading…' })); return; }
    if (P.error) { r.appendChild(h('p', { class: 'hw3-error', role: 'alert', text: P.error })); return; }
    if (s.today && s.today.heatColdNotSuggested) r.appendChild(h('p', { class: 'hw3-note hw3-note--warn', role: 'note', id: 'hwfNotToday', text: 'Today might be a day for a gentle walk, a coping tool, or a chat with Hope or someone you trust. Heat and cold aren’t suggested today.' }));
    if (st.result && st.result.part === 'heat-cold') r.appendChild(resultCard());
    const released = P.protocols.some((p) => p.released);
    const hc = s.screen.parts && s.screen.parts['heat-cold'];
    const states = P.protocols.map((p) => p.screen.status);
    if (!released) { r.appendChild(h('p', { class: 'hw3-note', text: 'The heat and cold guides open in a coming weekly Plus drop. The safety rules are on the Safety tab now.' })); return; }
    if (!hc || states.some((x) => x === 'expired') || states.every((x) => x === 'unscreened')) { r.appendChild(screenForm('heat-cold')); return; }
    if (st.hc) { renderCheck(r); return; }
    for (const p of P.protocols) r.appendChild(protocolCard(p));
    if (states.some((x) => x === 'needs-rescreen')) r.appendChild(h('div', { class: 'hw-card__actions' }, btn('Answer the heat and cold questions again', () => { st.status.screen.parts['heat-cold'] = null; render(); })));
    r.appendChild(h('p', { class: 'hw-hint', text: P.sleepTip }));
  }
  function protocolCard(p) {
    const sc = p.screen;
    const id = `hwfProt-${p.id}`;
    const card = h('section', { class: `hw-card hw3-card hwf-prot hwf-prot--${sc.status}`, id, 'aria-labelledby': `${id}T` },
      h('div', { class: 'hw3-row-between' }, h('h2', { class: 'hw3-h2', id: `${id}T`, text: p.title }), h('span', { class: `hwf-pill hwf-pill--${sc.status === 'ok' ? 'green' : sc.status === 'red' ? 'red' : 'amber'}`, text: sc.status === 'ok' ? 'Unlocked' : sc.status === 'red' ? 'Not for now' : sc.status === 'needs-clearance' ? 'Check first' : sc.status === 'needs-rescreen' ? 'Answer again' : 'Locked' })));
    if (!p.released) { card.appendChild(h('p', { text: 'Coming in a weekly Plus drop.' })); return card; }
    if (sc.status === 'red') {
      card.appendChild(h('p', { text: 'Based on your answers this is not safe for you right now. Please talk to your doctor. Gentle movement is still a great choice.' }));
      if (sc.recheckAfter) card.appendChild(h('p', { class: 'hw-hint', text: `We will ask again from ${when(sc.recheckAfter)}.` }));
      return card;
    }
    if (sc.status === 'needs-clearance') { card.appendChild(h('p', { text: 'Something in your answers is worth checking with your GP or pharmacist first.' })); card.appendChild(clearanceForm([p.id])); return card; }
    if (sc.status === 'needs-rescreen') { card.appendChild(h('p', { text: 'You stopped a session because something did not feel right. Please check with your GP, then answer the questions again.' })); return card; }
    if (!p.protocol) return card;
    const pr = p.protocol;
    card.appendChild(h('p', { text: pr.intro }));
    card.appendChild(h('h3', { class: 'hw3-h3', text: 'Choose a stage' }));
    card.appendChild(h('ul', { class: 'hw3-list' }, pr.stages.map((sg) => h('li', { class: 'hw3-list__item' },
      h('div', null, h('p', { class: 'hw3-list__title', text: sg.label }), h('p', { class: 'hw-hint', text: [sg.temp, sg.minutes ? `${sg.minutes[0]}–${sg.minutes[1]} min${sg.rounds ? `, up to ${sg.rounds} round${sg.rounds === 1 ? '' : 's'}` : ''}` : sg.seconds ? `${sg.seconds[0]}–${sg.seconds[1]} seconds` : '', sg.frequency].filter(Boolean).join(' · ') }), h('p', { class: 'hw-hint', text: `Move on when: ${sg.next}` })),
      h('div', { class: 'hw3-list__actions' }, btn('Safety check and start', () => { st.result = null; st.hc = { kind: p.id, stage: sg, protocol: pr }; render(); focusId('hwfCheckT'); }, { kind: 'primary', attrs: { 'aria-label': `Safety check and start: ${sg.label}` } }))))));
    card.appendChild(h('details', { class: 'hw3-details' }, h('summary', { text: 'Step by step' }), h('ol', { class: 'hwf-steps' }, pr.steps.map((x) => h('li', { text: x })))));
    card.appendChild(h('p', { class: 'hw-hint', text: pr.timing }));
    if (pr.supportScript) card.appendChild(h('p', { class: 'hw3-note', text: pr.supportScript }));
    return card;
  }
  function moodRadios(name, legend) {
    return h('fieldset', { class: 'hw3-fieldset' }, h('legend', { class: 'hw-label', text: legend }),
      h('div', { class: 'hwf-moods' }, MOODS.map((m) => h('label', { class: 'hwf-mood' }, h('input', { type: 'radio', name, value: String(m.score) }), h('span', { class: 'hwf-mood__e', 'aria-hidden': 'true', text: m.e }), h('span', { text: m.label })))));
  }
  const pickedMood = (form, name) => { const x = form.querySelector(`input[name="${name}"]:checked`); return x ? Number(x.value) : null; };
  function renderCheck(r) {
    const { kind, stage } = st.hc;
    const P = st.protocols;
    const needSupport = (kind === 'cold' && !stage.solo) || kind === 'contrast';
    const err = h('div', { class: 'hw3-error', id: 'hwfCheckErr', role: 'alert', tabindex: '-1' });
    if (st.hc.blocks) err.append(h('p', { class: 'hw3-h3', text: 'Not today, and that’s okay.' }), h('ul', { class: 'hwf-bullets' }, st.hc.blocks.map((b) => h('li', { text: b.text }))));
    const yn = (id, text) => h('fieldset', { class: 'hw3-fieldset hwf-q' }, h('legend', { class: 'hwf-q__text', text }),
      h('div', { class: 'hwf-yn' }, h('label', { class: 'hwf-radio' }, h('input', { type: 'radio', name: `hwfC-${id}`, value: 'yes' }), h('span', { text: 'Yes' })), h('label', { class: 'hwf-radio' }, h('input', { type: 'radio', name: `hwfC-${id}`, value: 'no' }), h('span', { text: 'No' }))));
    const qs = P.checkQuestions.filter((q) => !q.kinds || (needSupport && q.kinds.includes(kind)));
    const form = h('form', { class: 'hw-card hw3-card', id: 'hwfCheck', 'aria-labelledby': 'hwfCheckT', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      const check = {};
      for (const q of qs) {
        if (q.number) { const v = form.querySelector('#hwfTemp').value; check.waterTempC = v === '' ? null : Number(v); continue; }
        const x = form.querySelector(`input[name="hwfC-${q.id}"]:checked`);
        if (!x) { err.textContent = 'Please answer every question.'; return; }
        check[q.id] = x.value === 'yes';
      }
      if (!needSupport) { check.supportPerson = false; check.waterTempC = null; }
      try {
        const out = await api('POST', '/api/fitness/sessions', { kind, planKey: stage.id, check, moodBefore: pickedMood(form, 'hwfMoodB') });
        st.hc = null;
        startPlayer({ session: out.session, kind, title: `${st.protocols.protocols.find((p) => p.id === kind).title}: ${stage.label}`, segments: heatColdSegments(kind, stage, st.protocols.protocols.find((p) => p.id === kind).protocol), warnings: out.warnings });
      } catch (e) {
        if (e.code === 'check' && e.data && e.data.blocks) {
          st.hc.blocks = e.data.blocks;
          await refresh(true);
          render();
          focusId('hwfCheckErr');
          return;
        }
        err.textContent = failMessage(e);
        err.focus();
      }
    } },
    h('h2', { class: 'hw3-h2', id: 'hwfCheckT', tabindex: '-1', text: `Safety check: ${stage.label}` }),
    h('p', { text: 'Every time, before every session. It takes 20 seconds.' }),
    qs.map((q) => (q.number ? h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: 'hwfTemp', text: q.text }), h('input', { class: 'hw-input hwf-temp', id: 'hwfTemp', type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '40', 'aria-describedby': 'hwfTempH' }), h('p', { class: 'hw-hint', id: 'hwfTempH', text: `Hopewick will not guide water colder than ${st.status.rules.coldFloorC} °C.` })) : yn(q.id, q.text))),
    moodRadios('hwfMoodB', 'How are you feeling right now? (optional)'),
    err,
    h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: 'hwfCheckGo', text: 'Check and start' }), btn('Back', () => { st.hc = null; render(); }, { kind: 'ghost' })));
    r.appendChild(form);
  }
  function heatColdSegments(kind, stage, pr) {
    const rules = st.status.rules;
    if (kind === 'sauna') {
      const mins = Math.min(stage.minutes[0], rules.saunaMaxMinutesPerRound);
      const segs = [];
      for (let i = 0; i < (stage.rounds || 1); i++) {
        segs.push({ label: `Sauna, round ${i + 1}`, seconds: mins * 60, cue: 'Breathe normally. Too hot? Move down a bench or leave. Leaving early still counts.' });
        segs.push({ label: 'Cool down, sitting', seconds: 300, cue: 'Sit for 30 seconds, stand slowly holding the rail, then cool off in fresh air or under a cool shower. Sip water.' });
      }
      return segs;
    }
    if (kind === 'cold') {
      const secs = Math.min(stage.seconds[0], rules.coldMaxMinutes * 60);
      return [{ label: 'Get in slowly', seconds: 30, cue: 'Feet first. Expect a gasp. Breathe out slowly, like blowing through a straw.' },
        { label: 'Cold water', seconds: secs, cue: 'Head and face out. Get out early if you shiver hard, go numb or feel dizzy or panicky.' },
        { label: 'Warm up gently', seconds: 300, cue: 'Dry off, dress warmly and move gently. Sit down if you feel light-headed.' }];
    }
    const segs = [];
    for (let i = 0; i < Math.min(stage.rounds || 2, rules.contrastMaxRounds); i++) {
      segs.push({ label: `Sauna, round ${i + 1}`, seconds: 600, cue: 'Breathe normally. Leave early if anything feels wrong.' });
      segs.push({ label: 'Stand slowly and walk to the cool area', seconds: 60, cue: 'Sit for 30 seconds first. Hold the rail.' });
      segs.push({ label: 'Cool water', seconds: 30, cue: 'Cool shower, or plunge with your support person right there.' });
      segs.push({ label: 'Rest and sip water', seconds: 300, cue: 'Let your body warm up naturally.' });
    }
    return segs;
  }

  /* ----- workout and session player (accessible timer) ----- */
  /** Workouts ask the mood question first; the session is created with it. */
  function startWorkout(w) {
    startPlayer({ session: null, kind: 'workout', title: w.title, segments: workoutSegments(w), workout: w, askMoodBefore: true });
  }
  function workoutSegments(w) {
    const segs = [];
    const add = (phase, it, seconds) => segs.push({ phase, label: it.exercise ? it.exercise.name : it.id, exId: it.id, exercise: it.exercise, seconds, reps: it.reps || null });
    for (const it of w.warmup.items) add('Warm-up', it, it.seconds || 45);
    if (w.kind === 'strength') {
      for (let r = 1; r <= w.rounds; r++) {
        for (const it of w.main) { add(`Round ${r} of ${w.rounds}`, Object.assign({}, it, { reps: it.hold ? null : w.level.reps }), it.hold ? 30 : null); }
        if (r < w.rounds) segs.push({ phase: `Round ${r} of ${w.rounds}`, label: 'Rest', seconds: w.restSeconds, rest: true });
      }
    } else if (w.intervals) {
      const iv = w.intervals;
      const it = w.main[0];
      for (let i = 1; i <= iv.rounds; i++) { add(`Interval ${i} of ${iv.rounds}`, Object.assign({}, it), iv.work); segs.push({ phase: `Interval ${i} of ${iv.rounds}`, label: 'Easy', seconds: iv.rest, rest: true }); }
    } else {
      for (let r = 1; r <= (w.rounds || 1); r++) for (const it of w.main) add(w.rounds > 1 ? `Round ${r} of ${w.rounds}` : 'Main block', it, it.seconds || 60);
    }
    for (const it of w.cooldown.items) add('Cool-down', it, it.seconds || 45);
    return segs;
  }
  function startPlayer(p) {
    pausePlayer();
    st.player = Object.assign({ i: 0, left: null, running: false, timer: null, startedAt: Date.now(), elapsed: 0, done: false, moodBeforeAsked: !p.askMoodBefore }, p);
    st.player.left = st.player.segments[0].seconds;
    render();
    focusId('hwfPlayerT');
    if (p.warnings && p.warnings.length) announce(p.warnings.map((w) => w.text).join(' '));
  }
  function pausePlayer() { const P = st.player; if (!P) return; P.running = false; if (P.timer) clearInterval(P.timer); P.timer = null; }
  function tick() {
    const P = st.player;
    if (!P || !P.running) return;
    if (curTab() !== 'move') { pausePlayer(); return; }
    P.elapsed += 1;
    if (P.left == null) { paintTimer(); return; }
    P.left -= 1;
    if (P.left === 10) announce('10 seconds left');
    if (P.left <= 0) { nextSeg(true); return; }
    paintTimer();
  }
  function playPause() {
    const P = st.player;
    if (P.running) { pausePlayer(); announce('Paused'); } else { P.running = true; P.timer = setInterval(tick, 1000); announce(`Started. ${P.segments[P.i].label}${P.left ? `, ${spoken(P.left)}` : ''}`); }
    paintTimer();
  }
  function nextSeg(auto) {
    const P = st.player;
    if (P.i >= P.segments.length - 1) { pausePlayer(); P.done = true; render(); focusId('hwfDoneT'); announce('Session complete. Well done.'); return; }
    P.i += 1;
    const s = P.segments[P.i];
    P.left = s.seconds;
    render();
    announce(`${auto ? 'Time. ' : ''}Next: ${s.label}${s.reps ? `, ${s.reps} reps` : ''}${s.seconds ? `, ${spoken(s.seconds)}` : ''}`);
    focusId('hwfPlay');
  }
  function paintTimer() {
    const P = st.player;
    const t = document.getElementById('hwfClock');
    if (t) t.textContent = P.left == null ? 'Your pace' : mmss(P.left);
    const b = document.getElementById('hwfPlay');
    if (b) { b.textContent = P.running ? 'Pause' : (P.elapsed ? 'Resume' : 'Start'); b.setAttribute('aria-pressed', String(P.running)); }
    const bar = document.getElementById('hwfSegBar');
    if (bar) { const s = P.segments[P.i]; bar.style.width = s.seconds ? `${Math.round(((s.seconds - P.left) / s.seconds) * 100)}%` : '0%'; }
  }
  async function finish(status, symptoms) {
    const P = st.player;
    pausePlayer();
    const form = document.getElementById('hwfDone');
    const moodAfter = form ? pickedMood(form, 'hwfMoodA') : null;
    if (!P.session) { st.player = null; render(); return; }
    try {
      const out = await api('PATCH', `/api/fitness/sessions/${P.session.id}`, Object.assign({ status, durationSeconds: Math.min(P.elapsed, 14400) }, moodAfter ? { moodAfter } : {}, symptoms ? { stoppedForSymptoms: true } : {}));
      if (out.needsRescreen) say(out.message);
      else say(status === 'completed' ? 'Saved. Nice work.' : 'Saved. Stopping early is always okay.');
    } catch (e) { say(failMessage(e), true); }
    st.player = null; st.protocols = null;
    await refresh(true);
    render();
    focusId('hwfTitle');
  }
  function renderPlayer(r) {
    const P = st.player;
    if (P.done) {
      const form = h('form', { class: 'hw-card hw3-card', id: 'hwfDone', 'aria-labelledby': 'hwfDoneT', onsubmit: (ev) => { ev.preventDefault(); finish('completed'); } },
        h('h2', { class: 'hw3-h2', id: 'hwfDoneT', tabindex: '-1', text: 'Done. Well done for showing up.' }),
        h('p', { text: `${P.title}: ${Math.round(P.elapsed / 60)} minutes.` }),
        moodRadios('hwfMoodA', 'How do you feel now? (optional)'),
        P.kind !== 'workout' ? h('p', { class: 'hw-hint', text: 'Drink one or two glasses of water. Sit down if you feel light-headed.' }) : null,
        h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: 'hwfSave', text: 'Save' })));
      r.appendChild(form);
      return;
    }
    const s = P.segments[P.i];
    if (!P.moodBeforeAsked) {
      const f = h('form', { class: 'hw-card hw3-card', id: 'hwfBefore', 'aria-labelledby': 'hwfPlayerT', onsubmit: async (ev) => {
        ev.preventDefault();
        const m = pickedMood(f, 'hwfMoodB');
        try { P.session = (await api('POST', '/api/fitness/sessions', Object.assign({ kind: 'workout', planKey: P.workout.id }, m ? { moodBefore: m } : {}))).session; } catch (e) { say(failMessage(e), true); st.player = null; render(); return; }
        P.moodBeforeAsked = true; P.startedAt = Date.now();
        render(); focusId('hwfPlay');
      } }, h('h2', { class: 'hw3-h2', id: 'hwfPlayerT', tabindex: '-1', text: P.title }), moodRadios('hwfMoodB', 'Quick check: how are you feeling before you start? (optional)'),
      h('div', { class: 'hw-card__actions' }, h('button', { type: 'submit', class: 'hw-btn hw-btn--primary hw-btn--sm', id: 'hwfGo', text: 'Let’s go' }), btn('Back', () => { st.player = null; render(); focusId('hwfTitle'); }, { kind: 'ghost' })));
      r.appendChild(f);
      return;
    }
    const ex = s.exercise;
    r.appendChild(h('section', { class: 'hw-card hw3-card hwf-player', 'aria-labelledby': 'hwfPlayerT' },
      h('p', { class: 'hw-hint', text: `${P.title} · ${s.phase || ''} · step ${P.i + 1} of ${P.segments.length}` }),
      h('h2', { class: 'hw3-h2', id: 'hwfPlayerT', tabindex: '-1', text: s.label }),
      s.reps ? h('p', { class: 'hwf-reps', text: `${s.reps} reps, at your own pace` }) : null,
      h('p', { class: 'hwf-clock', id: 'hwfClock', role: 'timer', 'aria-live': 'off', 'aria-label': 'Time left in this step' }, s.seconds == null ? 'Your pace' : mmss(P.left)),
      h('div', { class: 'hw-progress hwf-segbar', 'aria-hidden': 'true' }, h('span', { id: 'hwfSegBar', style: 'width:0%' })),
      s.cue ? h('p', { text: s.cue }) : null,
      ex ? h('ul', { class: 'hwf-bullets' }, ex.cues.map((c) => h('li', { text: c }))) : null,
      h('div', { class: 'hw-card__actions hwf-controls' },
        s.seconds != null ? h('button', { type: 'button', class: 'hw-btn hw-btn--primary', id: 'hwfPlay', 'aria-pressed': String(P.running), onclick: playPause }, P.running ? 'Pause' : (P.elapsed ? 'Resume' : 'Start')) : h('button', { type: 'button', class: 'hw-btn hw-btn--primary', id: 'hwfPlay', onclick: () => { if (!P.running) { P.running = true; P.timer = setInterval(tick, 1000); } nextSeg(false); } }, 'Done, next'),
        btn('Skip', () => nextSeg(false), { attrs: { id: 'hwfSkip' } }),
        btn('Finish now', () => { pausePlayer(); P.done = true; render(); focusId('hwfDoneT'); }, { kind: 'ghost', attrs: { id: 'hwfFinish' } })),
      ex ? exerciseDetails(s.exId, ex, (st.program && st.program.track) || 'standard', false, `How to do it: ${ex.name}`) : null,
      h('div', { class: 'hwf-stop' }, btn('Stop: something doesn’t feel right', () => finish('stopped', true), { kind: 'danger', attrs: { id: 'hwfStop' } }),
        h('p', { class: 'hw-hint', text: 'Chest pain, fainting or trouble breathing? Call 000.' }))));
    paintTimer();
  }

  // First look once the app has booted (no-op when the flag is off: the server says 404).
  window.addEventListener('load', () => setTimeout(() => F.refresh(false), 300));
})();
