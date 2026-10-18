# Hopewick 2.0 release checklist

Updated 18 Oct 2026 (Stage 6). Live today: everything through Stage 5 plus Move & Recover (`main` at
`4660413`). Stage 6 is PR #44 (not merged).

## Done (engineering)

- [x] Stages 2a, 2b, 3, 4, 5 and Move & Recover merged and live; Stage 5 faith-button fix live (#43).
- [x] Regression: Node and Playwright suites green (numbers in PR #44).
- [x] End-to-end flows locally: all sign-in methods available locally, onboarding + faith question,
      check-in, journal, coping, next step, recovery tracker, modules, safety plan, Move & Recover,
      Hope cap, export, delete; plan gates free / trial / paid / past_due / lapsed / founder comp.
- [x] Accessibility: axe WCAG 2.2 AA tags, 0 violations on 52 page states; keyboard focus visible.
- [x] Performance quick wins (images, caching); Lighthouse recorded.
- [x] Security review: headers, CSP, cookies, rate limits, cross-user authorisation test, no client
      secrets, no source files served, `npm audit` clean.
- [x] Content: crisis numbers and tap-to-call, pricing copy, founder name, tagline.
- [x] B2B pages restyled (wording unchanged).
- [x] Migration tool, synthetic rehearsal on a child of Neon `dev`, cut-over runbook, data inventory.

## Needs the founder

- [ ] **Review and merge PR #44** (then watch the Render deploy; it changes no env or billing).
- [ ] **Clinical review** of the learning modules, coping tools, recovery tracker copy, safety plan
      wording and Move & Recover protocols, by a qualified AOD / mental health clinician; record the
      reviewer and date in `docs/CONTENT-SOURCES.md`.
- [ ] **Faith content review** (reflections, prayers, faith modules) by someone the founder trusts for
      Christian content, plus a check that opt-out hides everything.
- [ ] **Privacy and legal pages** (`privacy.html`, `data.html`, `terms.html`): add the Stage 3–5 data,
      the faith answer as sensitive information, Move & Recover screening, consent records, encryption,
      export/delete, and (before the cut-over) Neon and its region. Facts in `docs/DATA-INVENTORY.md`.
      Ideally checked by a privacy adviser.
- [ ] **Neon plan**: upgrade to Launch (≈ US$6–21/month) before any production database use. The Free
      plan's compute allowance is not enough for production.
- [ ] **Neon region / project**: new project in AWS Singapore next to Render (recommended), or keep
      Sydney and accept the latency. Production uses the root branch `main` (protected).
- [ ] **Database cut-over go-ahead and date** (`docs/DB-CUTOVER-RUNBOOK.md`), including adding
      `DATABASE_URL` on Render, and who keeps the JSON backup.
- [ ] Manually open the links the checker could not verify (QA report L4) and the legacy invite proxy (L6).
- [ ] Pricing wording: keep "AU$20" or change to "AUD $20" (L2). Grace period for failed payments (L3).
- [ ] A real-phone screen reader pass (VoiceOver on iPhone, TalkBack on Android) on sign-up, check-in,
      safety plan and Get help.
- [ ] Approve deleting the Neon branch `stage6-migration-rehearsal` (synthetic data only).

## Follow-ups (after launch)

- Split and defer the app's 1 MB inline script (mobile performance 71 → target 85+).
- Move inline scripts out so CSP can drop `'unsafe-inline'`.
- Postgres → JSON back-fill tool for late rollbacks (runbook "Rollback").
- Move users, chats and legacy check-ins to Postgres so the Render disk can be retired.
