# Hopewick 2.0 — Stage 6 QA report

Branch `hopewick-2.0/stage6-qa-migration` from `main` at `4660413`. Date: 18 Oct 2026 (AEST).
Everything was tested **locally** (JSON store, temp data folder, developer magic links, fake AI key,
no Stripe or Resend keys) or on **Neon `dev` / a child branch of `dev`**. No production data was read,
copied or written. Production was only loaded signed out for Lighthouse and response headers.
Screenshots: `/workspace/hopewick-2.0/stage6-screens/` on the build box (54 PNGs, mobile 390 px and
desktop 1366 px). Raw results: `/workspace/hopewick-2.0/stage6-qa/`.

## Summary

| Area | Result |
|---|---|
| Regression | Node 314/314 (the Postgres suites on Neon dev), pytest 101 passed / 1 skipped (Playwright). New: 6 authorisation + caching tests, 2 migration tests. Final re-run on the finished branch: see the PR. |
| End-to-end flows (local) | 43/43: magic link, password, Google (clean "not configured" locally), onboarding + faith question, check-in, journal, coping, next step, recovery tracker, modules, safety plan + history, Move & Recover, Hope daily cap, plan gates (free, trial, paid, past_due, lapsed, founder comp), export, area delete, account delete with re-auth |
| Accessibility | axe-core 4.14 with WCAG 2.0/2.1/2.2 A + AA tags on 52 page states (11 public pages light/dark, sign-up, the faith question, 13 app screens, mobile + desktop): **4 rules failed before, 0 after**. Keyboard: visible focus on every stop of 9 public pages, skip links work. |
| Performance | Landing mobile LCP 4.05 s → 2.33 s and 634 KB → 322 KB (local, same machine). Lighthouse below. |
| Security | Headers and CSP present, cookie HttpOnly + SameSite=Lax + Secure, Origin check on writes, rate limits on sign-in / magic links / password / delete, cross-user sweep of every `/api` read and by-id write: no leaks, no secrets client-side, no source files served, `npm audit` 0 vulnerabilities |
| Privacy | Stored data matches the code; the public privacy and data pages are behind (High, founder) |
| Content | Crisis numbers correct and tap-to-call text matches the number on every link (0 mismatches); pricing copy consistent (AU$20/month, 7-day trial, 15 Hope messages a day); founder "Dwayne Stevens" everywhere; tagline fixed in the app |
| B2B pages | `how-it-fits.html`, `pilot-pricing.html` restyled to the design system; the page text was checked word for word before and after (identical), so no pricing fact changed |
| Migration | Script + runbook done; rehearsed on synthetic data on a child branch of `dev`: clean, idempotent, resumable |

## Findings by severity

Status: **Fixed** on this branch, **Founder** (needs a decision or content), **Open** (follow-up).

### Critical
None.

### High
| # | Finding | Status |
|---|---|---|
| H1 | `privacy.html` and `data.html` (16 Oct) do not cover Stage 3–5 data: safety plan + history, the faith answer (religious belief is *sensitive information* under the Privacy Act), Move & Recover screening results and the substance-use pause, consent records, app-level encryption. After the cut-over they would also be wrong about location (Neon) and miss Neon as a sub-processor. Draft facts in `docs/DATA-INVENTORY.md`. | Founder (legal copy) |
| H2 | Neon is on the **Free** plan. Production would exceed the 100 CU-hours/month compute allowance (0.25 CU awake all month = 182.5 CU-h), after which Neon suspends the compute until next month, i.e. the app's database goes down. Also only a 6-hour restore window, 1 snapshot, no protected branches. | Founder (plan, see below) |
| H3 | Region mismatch: Render runs in **Singapore**, the Neon project is in **AWS Sydney**. Every query pays the Singapore–Sydney round trip, and each API call is 4+ round trips (BEGIN, set user + role, query, COMMIT). | Partly fixed (one round trip removed from every request); Founder (region) |

### Medium
| # | Finding | Status |
|---|---|---|
| M1 | Safety plan / support card "Call 000" button: dark text on red failed contrast (axe `color-contrast`). A crisis button. | Fixed (`hw-stage3.css`) |
| M2 | Theme toggle on 8 public pages: accessible name "Dark mode" did not contain the visible word "Light" / "Dark" (WCAG 2.5.3, axe `label-content-name-mismatch`). | Fixed (`theme.js` keeps the name in step with the visible word) |
| M3 | App: profile switch button name mismatch; chat history list scrollable but not reachable by keyboard (axe `scrollable-region-focusable`, 13 screens). | Fixed |
| M4 | Landing hero loaded two ~190 KB PNG lockups; the app loaded a 442 KB mark for a 116 px circle. | Fixed: WebP lockups (60 KB), dark lockup lazy, 256 px mark (20 KB WebP / PNG fallback) |
| M5 | Static files had no validators, so every visit re-downloaded the 1 MB app shell; images cached only 5 minutes. | Fixed: weak ETag + Last-Modified with 304s, images/icons/fonts 1 day + stale-while-revalidate, CSS/JS 5 min + SWR, HTML/manifest `no-cache` (revalidate) |
| M6 | The app shell is a 1 MB HTML file with a large inline script (233 KB with Brotli); mobile Lighthouse performance 71 on production. Not an "obvious" fix: it needs the inline script split and deferred, with care for load order. | Open (post-launch) |
| M7 | A goal created without a status had its default wiped (`applyGoalPatch` spread `undefined`), so the JSON store could hold status-less goals that Postgres (NOT NULL) refuses. Found by the migration rehearsal. | Fixed (patch ignores `undefined`; the migration maps a missing status to `active`, which is how the app already shows it, and reports how many) |
| M8 | An interrupted migration run left the temporary copy of the stores in `/tmp`. | Fixed (signal handler removes it; state file keeps progress) |

### Low
| # | Finding | Status |
|---|---|---|
| L1 | App title and meta used old taglines ("AI recovery companion", "AOD recovery support between sessions"). | Fixed: "Hopewick · Support for your next step" |
| L2 | Price shown as "AU$20" everywhere (consistent), not literally "AUD $20". Same meaning; only `pilot-pricing.html` says "AUD". | Founder (wording preference) |
| L3 | `past_due` (failed payment) removes Plus immediately; no grace period. | Founder (product decision), behaviour unchanged |
| L4 | External links: 68 of 80 answered 200/30x directly; NA meetings, The Know, Churches of Christ and the Catholic church finder were confirmed with a second fetcher. Not verifiable automatically: `aadant.org.au` + its service directory (timed out from two networks), `health.gov.au` naloxone pages, Legal Aid QLD DFV page and Lives Lived Well (bot protection, 403/500), plus `buv.com.au` find-a-church (timeout). The Catholic finder link is `http://`. (4 API base URLs excluded.) | Founder (manual check in a browser) |
| L5 | CSP still allows `'unsafe-inline'` scripts and styles (recorded debt; removing it needs the inline scripts moved out). | Open |
| L6 | The legacy invite proxy `hopewick-api.azurewebsites.net/api` answers 404 at its root (developer pilots only). | Founder (confirm whether still used) |
| L7 | Neon branch `stage6-migration-rehearsal` (synthetic data) left in place for review. | Founder (approve deletion) |

### Info (checked, no change needed)
* Session cookie `hopewick_session`: HttpOnly, SameSite=Lax, Secure on HTTPS, one session per account
  (a new sign-in signs the old one out). Account delete needs typed `DELETE` + current password.
* Rate limits: 8 bad password sign-ins → 429; magic links 8 per email / 80 per IP per window; password
  change and delete attempts limited.
* Every state-changing request checks `Origin` (Stripe webhook excepted, it is signature-checked).
* Production headers: HSTS 180 days, CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy,
  Permissions-Policy (camera off; microphone/geolocation self), `X-Permitted-Cross-Domain-Policies`.
* Static serving is an allow-list: `/.env`, `/server/…`, `/.git/…`, `/package.json`, `/docs/…`,
  `/migrations/…`, `/tools/…`, path traversal all 404 (local and production).
* No API keys, Stripe secrets, database URLs or private keys in any client file; no secret files tracked.
* `npm audit`: 0 vulnerabilities (prod and dev).
* Faith content is off by default; the faith question (Yes / No thanks / Decide later) shows after
  sign-up with "Get help" reachable on the same screen (mobile and desktop).
* Hope replies and the crisis path are covered by `server/next-step.test.mjs` and
  `server/hope-safety.test.mjs` (model stubbed); the local server only accepts an https AI endpoint, so
  the browser run did not call a model.

## Authorisation

`server/stage6-authz.test.mjs`: user A creates one of every record type (check-in, coping history,
goal, journal, plan, next step, weekly plan, recovery goal + log, module progress, safety plan + 2
versions, preferences, chat, Move & Recover screen + session). User B (also Plus) then calls 31 read
routes (every `/api/me/*` area, export, report, chats, legacy check-ins, account, invoices, Hope usage,
Plus library, Move & Recover) — all 200, none contains A's text or ids — and 15 by-id PATCH / DELETE /
GET attempts on A's records — all refused (404), A's data unchanged. B's "delete all my data" leaves A
intact. Signed out, every personal route answers 401 (Move & Recover safety information is public by
design). On Postgres, row level security was re-checked inside `withUser`: role `hopewick_rls`, only
the user's own rows visible.

## Lighthouse (Lighthouse 12.8, mobile = simulated Moto G / slow 4G)

| Page | Production now (`main`), perf / a11y / BP / SEO | Local `main` → this branch, perf | Local LCP | Bytes |
|---|---|---|---|---|
| Landing, mobile | 93 / 100 / 100 / 100 (LCP 3.1 s) | 87 → **98** | 4.05 s → 2.33 s | 634 → 322 KB |
| Landing, desktop | 99 / 100 / 100 / 100 | 100 → 100 | 0.82 → 0.52 s | |
| `/app/`, mobile | 71 / 100 / 100 / 100 (LCP 4.8 s) | 58 → 58 | 11.3 → 9.3 s | 1,906 → 1,497 KB |
| `/app/`, desktop | 94 / 100 / 100 / 100 | 88 → **91** | 1.99 → 1.66 s | |

Local runs have no Brotli (Cloudflare adds it in production), so local numbers are lower than
production for the 1 MB app shell. Accessibility, Best Practices and SEO were 100 in every run.

## axe

| | Before | After |
|---|---|---|
| Page states scanned | 50 | 52 |
| Rules failing | 4 (`color-contrast`, `label-content-name-mismatch` ×2 sources, `scrollable-region-focusable`) | **0** |
| Pages with a violation | 24 | 0 |

Screen reader: names, roles and states were checked through the accessibility tree (axe + manual
review of the fixed controls). A full VoiceOver / TalkBack pass on real phones is on the release
checklist for the founder.

## Neon recommendation

* **Current:** project `hopewick`, AWS Sydney (`aws-ap-southeast-2`), Postgres 17, Free plan
  (`free_v3`), compute fixed 0.25 CU, scale to zero after 5 min (cannot be changed on Free; confirmed:
  changing it was refused for this account), 1 GB per branch, 10 branches, 6-hour history.
* **Enough for production?** Storage and connections yes (the data is small; the app uses a pool of 5
  through Neon's pooler). **Compute no**: see H2. Cold starts add a few hundred ms after 5 idle minutes
  (Neon docs), on top of the Singapore–Sydney distance.
* **Recommended: Launch plan** (pay as you go, USD, no minimum; prices from neon.com/pricing, 18 Oct 2026):
  compute $0.106 per CU-hour, storage $0.35/GB-month, instant restore $0.20/GB-month, 500 GB egress
  included, history up to 7 days, protected branches, spend alerts, scale to zero can be turned off.
  * Always on at 0.25 CU: 0.25 × 730 h × $0.106 ≈ **US$19.35/month**; with scale to zero on and
    evening-heavy traffic, roughly US$5–10. Storage and restore history: well under US$1 at today's
    size. **Expect about US$6–21/month (roughly AU$9–33).**
  * Scale ($0.222/CU-hour, ≈ US$40.50/month always on at 0.25 CU) adds an uptime SLA, 30-day history,
    SOC 2 / HIPAA options. Not needed at launch.
* **Region:** Neon cannot move a project between regions. Two options for the founder:
  1. New Neon project in **AWS Singapore** (`aws-ap-southeast-1`) next to Render: lowest latency,
     data stays in Singapore as the privacy page says today. Recommended.
  2. Keep Sydney (Australian residency) and accept ~4 × the Singapore–Sydney round trip on each API
     call, or move hosting closer later.
* **Which branch:** production uses the project's **root branch `main`**, marked protected, with its
  own compute (0.25–1 CU autoscaling, scale to zero off). `dev` stays a child branch for tests; never
  run tests against `main`. If option 1 is chosen, create `main` + `dev` in the new project and apply
  migrations 001–007 there.
* No billing or plan change was made.
