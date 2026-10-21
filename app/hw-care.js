/* Hopewick: help topics (Anger, Relationships), recovery stage tips and
 * first-week mode, Body basics, and Share with my worker.
 *
 * Loaded after hw-stage5.js. Uses HW3.kit and registers through HW3.ext:
 *   topic       A calm, plain-English help topic (anger or relationships).
 *   bodybasics  Water, sleep, food, movement, caffeine. Optional daily ticks.
 *   share       Build a summary on this device, preview it, then print / save
 *               as PDF, copy, or hand it to the phone's share sheet.
 * The recovery stage is an About you preference (server/wellbeing/personal.js).
 * Body basics ticks stay in this browser only. Share never sends anything to
 * Hopewick or anyone else: the person chooses what to do with the text.
 * General self-help only. Not medical advice and not a crisis service.
 */
(function () {
  'use strict';
  const HW3 = window.HW3;
  if (!HW3 || !HW3.kit) return;
  const K = HW3.kit;
  const { h, btn, say, announce, header, demo, pid, focusId, todayIso, addDays } = K;
  const HWC = {};
  window.HWC = HWC;
  const ui = { topic: 'anger', share: null };
  HWC.ui = ui;

  /** The exact safety line used across Hopewick, with tap-to-call numbers. */
  function safetyLine() {
    return h('p', { class: 'hwc-safety', role: 'note' }, 'Not a crisis service. In crisis? Call ', h('a', { href: 'tel:000', text: '000' }), ' or Lifeline ', h('a', { href: 'tel:131114', text: '13 11 14' }), '.');
  }
  HWC.safetyLine = safetyLine;
  const go = (tab, opts) => { try { setAppTab(tab, opts || {}); } catch (_) { /* app not booted */ } };

  /* ------------------------------------------------------------------ */
  /* Recovery stage                                                      */
  /* ------------------------------------------------------------------ */
  function stage() { try { return (window.HW5 && HW5.prefs && HW5.prefs().recoveryStage) || ''; } catch (_) { return ''; } }
  function focusAreas() { try { return (window.HW5 && HW5.prefs && HW5.prefs().focusAreas) || []; } catch (_) { return []; } }
  HWC.stage = stage;
  function firstWeek() { return stage() === 'week'; }
  HWC.firstWeek = firstWeek;
  function syncMode() {
    const on = firstWeek();
    document.body.classList.toggle('hwc-firstweek', on);
  }
  HWC.syncMode = syncMode;

  const STAGE_TIPS = {
    week: [
      'Keep water nearby today. Small sips count.',
      'Try to eat something, even if it is small. Toast, fruit or soup is fine.',
      'Tea, coffee and energy drinks can make sleep and nerves worse. Go easy on them later in the day.',
      'Sleep may be patchy for a while. Resting with your eyes closed still helps.',
      'If reading or concentrating is hard right now, that is normal. Short is fine.',
      'Send one message to a person you trust. “Hi, thinking of you” is enough.',
      'Today only needs to be today. One small step counts.',
    ],
    month: [
      'A simple routine helps: wake, eat, move a little, wind down at the same times.',
      'Notice what time of day is hardest, and plan something for that time.',
      'Keep one person in the loop about how you are really going.',
      'Tired, hungry or lonely can feel like a craving. Check the basics first.',
      'Write down one thing that went okay today, even if it is small.',
      'It is okay to say no to people and places that make things harder right now.',
      'Feelings can be louder in early recovery. They rise and they pass.',
    ],
    early: [
      'Look back at a hard moment that passed. What helped? Do more of that.',
      'Plan ahead for paydays, weekends and celebrations.',
      'Add one thing you enjoy back into your week.',
      'Check your relapse plan still fits your life now.',
      'Sleep, food and movement are still the foundation. Keep them steady.',
      'Some days will feel flat. Flat days pass too.',
      'Who could you call on a bad night? Make sure their number is saved.',
    ],
    later: [
      'Keep doing what is working, even when things feel good.',
      'Notice small slips in routine: skipped meals, late nights, pulling away from people.',
      'Think about one relationship you would like to strengthen.',
      'Is there something you used to do that you could pick up again?',
      'Your experience may help someone else. Share it only if and when you want to.',
      'Stress still counts. Check in with yourself honestly this week.',
      'Celebrate how far you have come, in a way that is safe for you.',
    ],
    unsure: [
      'You do not have to know where you are. Today is a fine place to start.',
      'Look after the basics today: water, food, rest.',
      'One small step counts.',
      'Reach out to one person today, even with a short message.',
      'Notice one feeling today and give it a name.',
      'Be as kind to yourself as you would be to a mate.',
      'If today is hard, try a short breathing exercise.',
    ],
  };
  const FOCUS_TIPS = {
    anger: [
      'Anger often starts in the body: hot face, tight jaw, fast heart. Noticing early gives you more choice.',
      'If you feel it building, pause. Breathe out slowly. You can walk away and come back later.',
      'HALT: am I Hungry, Angry, Lonely or Tired? Sorting one of these can take the heat out.',
      'After a blow-up, repair is possible: calm down first, then own your part simply.',
    ],
    relationships: [
      'A boundary is about what you will do, not controlling others: “If the shouting starts, I will leave the room.”',
      'Asking for support is a strength. Be specific: “Can you check in with me Friday night?”',
      'Trust is rebuilt slowly, through small things done again and again.',
      'Feeling lonely is common in recovery. One small contact today counts.',
    ],
  };
  HWC.STAGE_TIPS = STAGE_TIPS;
  HWC.FOCUS_TIPS = FOCUS_TIPS;
  function dayIndex() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  /** Today's tip: the stage list, mixed with anger or relationships tips when chosen. */
  function tipForToday() {
    const s = stage() || 'unsure';
    const pool = (STAGE_TIPS[s] || STAGE_TIPS.unsure).slice();
    if (s !== 'week') focusAreas().forEach((f) => (FOCUS_TIPS[f] || []).forEach((t) => pool.push(t)));
    return pool[dayIndex() % pool.length];
  }
  HWC.tipForToday = tipForToday;
  const STAGE_LABEL = { week: 'first week', month: 'first month', early: '1 to 3 months', later: '3 months or more', unsure: '' };

  /* ------------------------------------------------------------------ */
  /* Home: tip for today and first-week mode                             */
  /* ------------------------------------------------------------------ */
  HWC.paintHome = function (box, grid) {
    syncMode();
    if (!box || !grid) return;
    const s = stage();
    const tip = h('section', { class: 'hw-card dash-card hwc-tip', id: 'dashTip', 'aria-labelledby': 'dashTipT' },
      h('h2', { class: 'hw-card__title', id: 'dashTipT', text: 'Tip for today' }),
      h('p', { class: 'hwc-tip__text', text: tipForToday() }),
      s && STAGE_LABEL[s] ? h('p', { class: 'hw-hint', text: `For your ${STAGE_LABEL[s]}. Change this in About you.` }) : h('p', { class: 'hw-hint' }, 'Tell us where you are in recovery in ', h('button', { type: 'button', class: 'hw3-link', onclick: () => window.HW5 && HW5.openPreferences(), text: 'About you' }), ' and tips will fit.'));
    const today = document.getElementById('todayCard');
    if (firstWeek()) {
      const basics = h('section', { class: 'hw-card dash-card hwc-week', id: 'dashFirstWeek', 'aria-labelledby': 'dashFirstWeekT' },
        h('h2', { class: 'hw-card__title', id: 'dashFirstWeekT', text: 'First week: just the basics' }),
        h('ul', { class: 'hwc-week__list' },
          h('li', { text: 'Keep water nearby.' }),
          h('li', { text: 'Eat something, even small.' }),
          h('li', { text: 'Go easy on tea and coffee later in the day.' }),
          h('li', { text: 'Rest when you can.' }),
          h('li', { text: 'Hard to read or focus? That’s normal right now.' }),
          h('li', { text: 'Reach out to a person today.' })),
        h('div', { class: 'hwc-big-actions' },
          btn('Get help now', () => { try { openHelp(); } catch (_) { /* */ } }, { kind: 'primary', size: 'md', attrs: { id: 'hwcWeekHelp' } }),
          btn('Body basics', () => go('bodybasics'), { size: 'md', attrs: { id: 'hwcWeekBody' } }),
          btn('Talk to Hope', () => go('chat'), { size: 'md', attrs: { id: 'hwcWeekHope' } })),
        safetyLine());
      if (today && today.parentNode === box) box.insertBefore(basics, today); else box.insertBefore(basics, grid);
      box.insertBefore(tip, basics.nextSibling);
    } else if (today && today.parentNode === box) today.after(tip);
    else box.insertBefore(tip, grid);
  };

  /* Check-in: a gentle prompt that fits the stage and chosen topics. */
  const CHECKIN_PROMPTS = {
    anger: 'Did anything make you angry or tense today? Where did you feel it in your body?',
    relationships: 'Who did you connect with today, even briefly? Is there someone you would like to reach out to?',
    week: 'Have you had some water and something to eat today?',
  };
  HWC.CHECKIN_PROMPTS = CHECKIN_PROMPTS;
  const prevAfter = HW3.afterRender;
  HW3.afterRender = function (root, tab) {
    if (prevAfter) { try { prevAfter(root, tab); } catch (_) { /* */ } }
    if (tab !== 'checkin' || root.querySelector('.hwc-prompt')) return;
    const qs = [];
    if (firstWeek()) qs.push(CHECKIN_PROMPTS.week);
    focusAreas().forEach((f) => { if (CHECKIN_PROMPTS[f]) qs.push(CHECKIN_PROMPTS[f]); });
    if (!qs.length) return;
    root.appendChild(h('section', { class: 'hw-card hw3-card hwc-prompt', 'aria-labelledby': 'hwcPromptT' },
      h('h2', { class: 'hw3-h2', id: 'hwcPromptT', text: 'Something to notice' }),
      h('ul', { class: 'hwc-list' }, qs.map((q) => h('li', { text: q }))),
      h('p', { class: 'hw-hint', text: 'Just for you to think about. You can add it to your notes above if you like.' })));
  };
  // Journal reflection prompts for the two new topics.
  if (HW3.PROMPTS && HW3.PROMPTS.prompt) {
    HW3.PROMPTS.prompt.push(
      'When did I feel anger building today, and what did I do with it?',
      'Is there someone I would like to repair things with? What is one small first step?',
      'Who is someone I can ask for support this week, and what would I ask for?');
  }

  /* ------------------------------------------------------------------ */
  /* Help topics                                                         */
  /* ------------------------------------------------------------------ */
  const TOPICS = {
    anger: {
      title: 'Anger',
      lede: 'Anger is a normal feeling. It often shows up more in recovery. These ideas can help you stay steady and keep people (including you) safe.',
      sections: [
        { t: 'Notice the early signs', items: ['Body: hot face, tight jaw or fists, fast heart, loud voice.', 'Thoughts: “That’s not fair”, “They always…”, wanting to win.', 'The earlier you notice, the more choice you have.'] },
        { t: 'Pause, breathe, walk away', items: ['Stop talking for a moment. Breathe out slowly, longer than you breathe in.', 'Say “I need a few minutes. I’ll come back.” Then leave the room or go for a walk.', 'Come back once your body has calmed down, usually 20 minutes or more.'] },
        { t: 'Check HALT', items: ['Hungry, Angry, Lonely, Tired. Any of these make anger bigger.', 'Eat something, rest, or talk to someone before a hard conversation.'] },
        { t: 'Repair afterwards', items: ['Wait until you are calm.', 'Own your part simply: “I raised my voice. I’m sorry.”', 'Skip the “but”. Ask what would help next time.', 'Be kind to yourself too. One hard moment does not undo your progress.'] },
      ],
      tools: [['Calm breathing', () => go('coping', { tool: 'breathing-calm' })], ['Grounding 5-4-3-2-1', () => go('coping', { tool: 'grounding-54321' })]],
      note: 'If anger is leading to hurting someone or being hurt, or you feel unsafe at home, please get help. 1800RESPECT (1800 737 732) is there 24/7. Men’s Referral Service (1300 766 491) helps men who want to change how they act.',
    },
    relationships: {
      title: 'Relationships',
      lede: 'People can be a big support in recovery, and sometimes a big strain. Small, honest steps help.',
      sections: [
        { t: 'Boundaries', items: ['A boundary is what you will do to look after yourself, not a rule for someone else.', 'Keep it short and calm: “I’m not drinking, so I’ll head off at 8.”', 'It is okay to step back from people or places that make recovery harder.'] },
        { t: 'Asking for support', items: ['Pick one person you trust.', 'Be specific: “Can you text me on Friday night?” or “Can I call you if it gets hard?”', 'It is okay to ask more than once, and okay to ask a few different people.'] },
        { t: 'Rebuilding trust', items: ['Trust comes back slowly, through small things done again and again.', 'Keep promises small so you can keep them.', 'Let others go at their own pace. Their feelings make sense too.'] },
        { t: 'Loneliness', items: ['Feeling lonely is common, especially early on.', 'One small contact counts: a text, a wave to a neighbour, a meeting or group.', 'Peer support groups and community activities are good places to start.'] },
      ],
      tools: [['My safety plan: people I can ask', () => { try { HW5.openSafety(); } catch (_) { go('safety'); } }], ['Talk it through with Hope', () => go('chat')]],
      note: 'If you do not feel safe with someone, 1800RESPECT (1800 737 732) is there 24/7.',
    },
  };
  HWC.TOPICS = TOPICS;
  function renderTopic(root) {
    syncMode();
    const tp = TOPICS[ui.topic] || TOPICS.anger;
    root.appendChild(header(tp.title, tp.lede));
    root.appendChild(safetyLine());
    const short = firstWeek();
    tp.sections.forEach((sec, i) => {
      root.appendChild(h('section', { class: 'hw-card hw3-card hwc-sec', 'aria-labelledby': `hwcSec${i}` },
        h('h2', { class: 'hw3-h2', id: `hwcSec${i}`, text: sec.t }),
        h('ul', { class: 'hwc-list' }, (short ? sec.items.slice(0, 2) : sec.items).map((x) => h('li', { text: x })))));
    });
    root.appendChild(h('div', { class: 'hw-card__actions hwc-big-actions' }, tp.tools.map(([l, fn], i) => btn(l, fn, { kind: i === 0 ? 'primary' : 'secondary', size: 'md' }))));
    var noteParts = String(tp.note).split(/(1800 737 732|1300 766 491)/).map(function (part) {
      return /^1[38]00 \d{3} \d{3}$/.test(part) ? h('a', { href: 'tel:' + part.replace(/ /g, ''), text: part }) : part;
    });
    root.appendChild(h.apply(null, ['p', { class: 'hw-hint' }].concat(noteParts)));
    root.appendChild(h('p', { class: 'hw-hint', text: 'This is general self-help information, not professional advice. A counsellor, AOD worker or GP can help with what fits you.' }));
  }
  HW3.ext.topic = { render: renderTopic, busy: () => false };

  /* ------------------------------------------------------------------ */
  /* Body basics                                                         */
  /* ------------------------------------------------------------------ */
  const BODY = [
    { id: 'water', label: 'Water', tick: 'I had some water', text: 'Keep a glass or bottle nearby and sip through the day.' },
    { id: 'food', label: 'Food', tick: 'I ate something', text: 'Regular meals or snacks help mood and energy. Simple is fine.' },
    { id: 'sleep', label: 'Sleep', tick: 'I rested or slept', text: 'Try similar sleep and wake times. A wind-down without screens can help. Rest counts even if sleep is patchy.' },
    { id: 'move', label: 'Movement', tick: 'I moved a little', text: 'A short walk, stretch or time outside. Whatever feels okay for your body.' },
    { id: 'caffeine', label: 'Caffeine', tick: 'I went easy on caffeine later in the day', text: 'Tea, coffee, cola and energy drinks can affect sleep and nerves. Notice how much you have, especially in the afternoon and evening.' },
  ];
  HWC.BODY = BODY;
  const mem = {};
  const bodyKey = () => { let a = ''; try { a = billingState.id || 'local'; } catch (_) { a = 'local'; } return `hopewick.bodybasics.v1:${a}:${pid()}`; };
  function readBody() {
    if (demo()) return mem[bodyKey()] || {};
    try { const v = JSON.parse(localStorage.getItem(bodyKey()) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }
  function writeBody(all) {
    const keep = {}; const cut = addDays(todayIso(), -90);
    Object.keys(all).filter((d) => d >= cut).forEach((d) => { keep[d] = all[d]; });
    if (demo()) { mem[bodyKey()] = keep; return; }
    try { localStorage.setItem(bodyKey(), JSON.stringify(keep)); } catch (_) { say('Could not save on this device.', true); }
  }
  HWC.readBody = readBody;
  function renderBody(root) {
    syncMode();
    root.appendChild(header('Body basics', 'Looking after your body can make the rest a little easier. Small things count.'));
    root.appendChild(safetyLine());
    const day = todayIso();
    const all = readBody();
    const t = all[day] || {};
    const list = firstWeek() ? BODY.filter((b) => ['water', 'food', 'sleep', 'caffeine'].includes(b.id)) : BODY;
    const card = h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwcBodyT' },
      h('h2', { class: 'hw3-h2', id: 'hwcBodyT', text: 'Today (optional)' }),
      h('p', { class: 'hw-hint', text: 'Tick what you managed, if you like. This stays on this device only.' }),
      h('div', { class: 'hwc-ticks' }, list.map((b) => {
        const box = h('input', { type: 'checkbox', id: `hwcTick-${b.id}`, checked: !!t[b.id], onchange: () => {
          const cur = readBody(); cur[day] = Object.assign({}, cur[day] || {}, { [b.id]: box.checked }); writeBody(cur); announce(box.checked ? `${b.label} ticked` : `${b.label} unticked`);
        } });
        return h('label', { class: 'hwc-tick', for: `hwcTick-${b.id}` }, box, h('span', { text: b.tick }));
      })));
    root.appendChild(card);
    list.forEach((b) => root.appendChild(h('section', { class: 'hw-card hw3-card hwc-sec', 'aria-labelledby': `hwcB-${b.id}` },
      h('h2', { class: 'hw3-h2', id: `hwcB-${b.id}`, text: b.label }), h('p', { text: b.text }))));
    if (firstWeek()) root.appendChild(h('p', { class: 'hw-hint', text: 'If reading or concentrating is hard this week, that is normal. Come back any time.' }));
    root.appendChild(h('p', { class: 'hwc-gp', text: 'This is general wellbeing information, not medical or dietary advice. Talk to your GP or a health professional for advice that fits you.' }));
  }
  HW3.ext.bodybasics = { render: renderBody, busy: () => false };

  /* ------------------------------------------------------------------ */
  /* Share with my worker                                                */
  /* ------------------------------------------------------------------ */
  const shareDefaults = () => ({ checkins: true, safety: true, body: true, journal: false, from: addDays(todayIso(), -13), to: todayIso() });
  function inRange(d, s) { return d && d >= s.from && d <= s.to; }
  function isoOf(ts) { try { const d = new Date(ts); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); } catch (_) { return ''; } }
  function checkinsFor(s) {
    const st = HW3.state || {};
    const by = new Map();
    (st.legacy || []).forEach((c) => by.set(c.date, { date: c.date, label: c.moodLabel, craving: c.craving }));
    (st.checkins || []).forEach((c) => by.set(c.date, { date: c.date, label: c.moodLabel, intensity: c.intensity, feelings: c.feelings, triggers: c.triggers, craving: c.craving }));
    return [...by.values()].filter((c) => inRange(c.date, s)).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function journalFor(s) {
    let list = [];
    try { list = Array.isArray(journal) ? journal : []; } catch (_) { list = []; }
    return list.map((e) => ({ date: e.entryDate || isoOf(e.created), title: e.title || '', body: e.body || '' })).filter((e) => inRange(e.date, s)).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function safetyText() {
    try {
      const c = K.readSafety() || {};
      const steps = (window.HW5 && HW5.STEPS) || [];
      if (!steps.some((x) => Array.isArray(c[x.id]) && c[x.id].length)) return '';
      const plan = {}; steps.forEach((x) => { plan[x.id] = Array.isArray(c[x.id]) ? c[x.id] : []; });
      return HW5.planText(plan);
    } catch (_) { return ''; }
  }
  /** The plain-text summary. Built only on this device. */
  function buildShare(s) {
    const out = ['Hopewick summary to share with my worker', `${s.from} to ${s.to}`, ''];
    if (s.checkins) {
      const cs = checkinsFor(s);
      out.push('CHECK-INS AND MOOD');
      if (!cs.length) out.push('No check-ins in these dates.');
      cs.forEach((c) => out.push(`- ${c.date}: ${c.label || 'mood noted'}${c.intensity != null ? `, ${c.intensity}/10` : ''}${c.craving ? `, cravings: ${c.craving}` : ''}${c.feelings ? `. Feelings: ${c.feelings}` : ''}${c.triggers && c.triggers.length ? `. Triggers: ${c.triggers.join(', ')}` : ''}`));
      out.push('');
    }
    if (s.body) {
      const all = readBody();
      const days = Object.keys(all).filter((d) => inRange(d, s)).sort();
      out.push('BODY BASICS (days ticked)');
      if (!days.length) out.push('No body basics ticked in these dates.');
      else BODY.forEach((b) => out.push(`- ${b.label}: ${days.filter((d) => all[d] && all[d][b.id]).length} of ${days.length} days with ticks`));
      out.push('');
    }
    if (s.safety) {
      const t = safetyText();
      out.push('SAFETY PLAN');
      out.push(t || 'No safety plan saved yet.');
      out.push('');
    }
    if (s.journal) {
      const js = journalFor(s);
      out.push('JOURNAL ENTRIES');
      if (!js.length) out.push('No journal entries in these dates.');
      js.forEach((e) => { out.push(`- ${e.date}${e.title ? `: ${e.title}` : ''}`); if (e.body) out.push(`  ${e.body.replace(/\n+/g, '\n  ')}`); });
      out.push('');
    }
    out.push('Shared by me from Hopewick. Not a crisis service. In crisis? Call 000 or Lifeline 13 11 14.');
    return out.join('\n');
  }
  HWC.buildShare = buildShare;
  function printShare() {
    document.body.classList.add('hwc-printing');
    const done = () => { document.body.classList.remove('hwc-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (_) { /* */ }
  }
  function renderShare(root) {
    syncMode();
    const s = ui.share || (ui.share = shareDefaults());
    root.appendChild(header('Share with my worker', 'Make a summary for your counsellor, caseworker, AOD worker or GP. You choose what goes in.'));
    root.appendChild(h('p', { class: 'hwc-privacy', id: 'hwcPrivacy', text: 'Only you choose what to share. Nothing is sent unless you send it. The summary is made on this device; Hopewick does not send it anywhere.' }));
    root.appendChild(safetyLine());
    const opt = (id, label, hint) => h('label', { class: 'hwc-tick', for: `hwcInc-${id}` },
      h('input', { type: 'checkbox', id: `hwcInc-${id}`, checked: !!s[id], onchange: (e) => { s[id] = e.target.checked; HW3.render('share'); focusId(`hwcInc-${id}`); } }),
      h('span', {}, label, hint ? h('span', { class: 'hw-hint', text: ` ${hint}` }) : null));
    const date = (id, label) => { const i = h('input', { class: 'hw-input', type: 'date', id: `hwc-${id}`, value: s[id], max: todayIso(), onchange: (e) => { if (e.target.value) { s[id] = e.target.value; if (s.from > s.to) { const x = s.from; s.from = s.to; s.to = x; } HW3.render('share'); focusId(`hwc-${id}`); } } }); return h('div', { class: 'hw-field' }, h('label', { class: 'hw-label', for: `hwc-${id}`, text: label }), i); };
    const quick = (n) => btn(`Last ${n} days`, () => { s.from = addDays(todayIso(), -(n - 1)); s.to = todayIso(); HW3.render('share'); focusId(`hwcLast${n}`); }, { attrs: { id: `hwcLast${n}` } });
    root.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwcPickT' },
      h('h2', { class: 'hw3-h2', id: 'hwcPickT', text: '1. What to include' }),
      h('div', { class: 'hwc-ticks' },
        opt('checkins', 'Recent check-ins and mood'),
        opt('safety', 'My safety plan'),
        opt('body', 'Body basics'),
        opt('journal', 'Journal entries', '(off unless you turn it on, as they can be very personal)')),
      h('h2', { class: 'hw3-h2', text: '2. Dates' }),
      h('div', { class: 'hw-card__actions' }, quick(7), quick(14), quick(30)),
      h('div', { class: 'hwc-dates' }, date('from', 'From'), date('to', 'To'))));
    const text = buildShare(s);
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    root.appendChild(h('section', { class: 'hw-card hw3-card', 'aria-labelledby': 'hwcPrevT' },
      h('h2', { class: 'hw3-h2', id: 'hwcPrevT', text: '3. Preview' }),
      h('p', { class: 'hw-hint', text: 'Check it says only what you want to share.' }),
      h('div', { id: 'hwcPrintable', class: 'hwc-preview' }, h('pre', { id: 'hwcPreview', tabindex: '0', 'aria-label': 'Summary preview', text: text })),
      h('h2', { class: 'hw3-h2', text: '4. Share it your way' }),
      h('div', { class: 'hw-card__actions hwc-big-actions' },
        btn('Print or save as PDF', () => printShare(), { kind: 'primary', size: 'md', attrs: { id: 'hwcPrint' } }),
        btn('Copy text', async () => {
          try { await navigator.clipboard.writeText(text); say('Copied. Paste it into a message or email when you are ready.'); announce('Summary copied'); }
          catch (_) { const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(document.getElementById('hwcPreview')); sel.removeAllRanges(); sel.addRange(r); say('Text selected. Use your device to copy it.'); }
        }, { size: 'md', attrs: { id: 'hwcCopy' } }),
        canShare ? btn('Share…', async () => { try { await navigator.share({ title: 'My Hopewick summary', text }); } catch (_) { /* person closed the share sheet */ } }, { size: 'md', attrs: { id: 'hwcShare' } }) : null),
      h('p', { class: 'hw-hint', text: 'To save a PDF, choose “Save as PDF” as the printer. Share opens your phone’s own share options; you pick who gets it.' })));
  }
  HW3.ext.share = { render: renderShare, busy: () => false };

  ['topic', 'bodybasics', 'share'].forEach((v) => { if (!HW3.views.includes(v)) HW3.views.push(v); });
  // Keep first-week mode in step with the saved preference.
  const prevLoad = window.HW5 && HW5.load;
  if (prevLoad) HW5.load = (force) => prevLoad(force).then((r) => { syncMode(); return r; });
})();
