# Changelog

## Hopewick 2.0 — "Support for your next step." (October 2026)

Hopewick 2.0 was built in six stages, each reviewed by the founder before it went live.

### Stage 2a — Safety and brand (PR #37)
* New logo (variant F), light and dark lockups, app icons; design system (`assets/hopewick-tokens.css`,
  `assets/hopewick-ui.css`) with WCAG 2.2 AA colour checks; light/dark theme on every page.
* Crisis help (000, Lifeline 13 11 14) on every screen, never behind Plus.

### Stage 2b — Foundation (PR #38)
* Optional Postgres layer (Neon): migrations, per-user row level security, AES-256-GCM encryption of
  sensitive text (`HOPEWICK_DATA_KEY`). Production stays on the JSON files until the cut-over.

### Stage 3 — Core (PR #39)
* Daily check-in with feelings, triggers and intensity; guided coping tools; personal goals; journal;
  My next step; consent controls for what Hope may read; export and delete by area.
* Free and Plus: AU$20/month with a 7-day free trial on the first subscription, 15 free Hope messages a
  day, founder comp; free history window of 7 days (nothing is deleted).

### Stage 4 — Recovery and education (PR #40)
* Recovery tracker (goals, Day N, cravings and lapses, after-a-lapse card), learning modules with
  private reflections, weekly plans, monthly insights and a printable report for Plus.

### Move & Recover (PR #41)
* Clinically reviewed movement, heat and cold protocols behind a safety screen, a pause after reported
  substance use, and Plus gates. Behind `FEATURE_FITNESS_PROTOCOLS`.

### Stage 5 — Safety plan, faith and personalisation (PRs #42, #43)
* Seven-step safety plan with tap-to-call services, print, offline copy and the last 20 versions.
* Optional faith layer, off by default; asked once at sign-up (Yes / No thanks / Decide later).
* "About you" preferences used by Hope.

### Suicide prevention safety plan (feature/suicide-safety-plan)
* "My safety plan" is now clearly the person's suicide prevention safety plan (Stanley-Brown steps):
  a calm intro card, "Call 000 if you are in immediate danger", step titles in plain words, name and
  phone fields for people (step 4) and for a GP and caseworker (step 5), and Lifeline, Suicide Call
  Back Service, 13YARN, Kids Helpline (under-25s), Beyond Blue and 000 prefilled in step 5 with
  tap-to-call (numbers re-checked 19 Oct 2026). "Print or save as PDF". Same saved data, same
  privacy, free on every plan, never sent to Hope.
* Reached from Get help ("My safety plan (suicide prevention)"), the chat crisis card, Tools and Home.

### Stage 6 — QA, migration and release readiness (this release, PR #44)
* Full QA pass: `docs/STAGE6-QA-REPORT.md`.
* Accessibility: "Call 000" button contrast, theme toggle and profile button names, keyboard access to
  chat history (axe: 0 violations on 52 page states).
* Performance: WebP hero lockups, a 256 px app mark instead of 442 KB, ETag/304 revalidation and longer
  image caching; one fewer database round trip per request.
* Security: cross-user authorisation sweep test over every `/api` route; static caching test.
* B2B pages (`how-it-fits.html`, `pilot-pricing.html`) restyled to the design system, wording unchanged.
* App title uses the tagline "Support for your next step".
* JSON → Postgres migration tool (`tools/migrate-json-to-postgres.mjs`, dry-run / apply / verify,
  idempotent and resumable), synthetic store generator, cut-over runbook, data inventory, release
  checklist. Rehearsed on synthetic data only; not run on production.
* Fix: a goal saved without a status no longer loses its default "active" status.
