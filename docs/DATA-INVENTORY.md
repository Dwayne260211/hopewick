# Data inventory (Stage 6 check, 18 Oct 2026)

What the server actually stores, checked against the code (`server/store.js`, `server/chats.js`,
`server/checkins.js`, `server/visits.js`, `server/wellbeing/*`, `server/fitness/store.js`,
`migrations/001–007`). This is an engineering draft **for the founder and a privacy adviser** to update
`privacy.html` and `data.html`. It is not legal text and the public pages were not changed.

## Where

| Today | After the database cut-over |
|---|---|
| Render web service, **Singapore** region, persistent disk `/var/data` (JSON files) | Accounts, billing, chats, legacy check-ins, page counter: still the Render disk (Singapore). Wellbeing + Move & Recover: **Neon Postgres** (the project is in **AWS Sydney** today; see the region recommendation in the QA report). |
| The person's own browser (localStorage) | unchanged |

Sub-processors seen in code: Render (hosting), Cloudflare (Render's edge), Stripe (cards, invoices),
Google (sign-in; Google Play billing), OpenAI (Hope replies), Resend (sign-in emails), Neon (after cut-over).

## What, per store

| Store | Fields | Sensitive? | Encrypted at rest by the app |
|---|---|---|---|
| `users.json` | id, email, name, phone (optional), created time, password hash (scrypt), pending password, magic-link hash + expiry, session hash, Stripe customer / subscription ids, subscription status (the trial is a Stripe `trialing` status), period end, cancel flag, billing provider, Google Play purchase token, Hope daily counter (`hopeUsage`: day, count). Google sign-in matches by verified email; no Google id is stored. | email, phone | no (hashes for secrets) |
| `chats.json` | per account → profile → conversations (title, messages, timestamps). 24-month retention by last use. | **yes** (health, substance use in free text) | no |
| `checkins.json` (Hopewick 1 sync) | per profile: daily mood + craving labels, gratitude items, weekly SMART goals | yes | no |
| `wellbeing.json` / Postgres | settings + **consent records** (Hope may read check-ins, journal AI, next-step follow-ups, journal / plan import), check-ins v2 (mood, craving, feelings, triggers, intensity, note), coping tool history, personal goals, journal (title, body, refined text, emotions, prompts), relapse plan, **safety plan + up to 20 saved versions** (warning signs, people, professionals, reasons), next steps + reflections, weekly plans, recovery goals + lapse / craving logs, module progress + reflections, **preferences incl. the faith answer and tradition** | **yes**: health, substance use, suicide risk planning, **religious belief** (sensitive information under the Privacy Act 1988) | **yes**, AES-256-GCM (`HOPEWICK_DATA_KEY`, key id `k1` in production) for the free-text and plan fields |
| `fitness.json` / Postgres (Move & Recover) | safety screen **result** (per area, dates, doctor's-OK tick; never the answers), pause after reported substance use, preferences, session log + mood before/after | **yes** (health) | **yes** (screen, pause, prefs, detail) |
| `visits.json` | one page counter | no | no |

## Gaps on the public pages (for the founder)

* `privacy.html` / `data.html` (last updated 16 Oct 2026) do not mention: the safety plan and its
  history, the faith preference (religious belief), Move & Recover screening results and the substance
  use pause, consent records, journal and recovery tracker storage on the server, app-level encryption.
* `data.html` says data is "on a private server in Singapore". After the cut-over, wellbeing and
  Move & Recover data would be in Neon (AWS Sydney unless a Singapore project is chosen). Neon must be
  listed as a sub-processor.
* Retention for the Stage 3–5 data is "until you delete it or delete your account" in code; the page
  only lists chats, check-ins and goals.
* Export (My data → Export) and per-area delete exist in the app; the page could say so.
