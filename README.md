# Hopewick — AOD recovery support & AI recovery companion 🕯️

**Hopewick** (a small light that keeps burning) is a warm, non-judgemental **AI recovery companion** that runs in your browser. The product tagline is **AOD recovery support between sessions**. Faith content is optional (Preferences / About). It can also switch to an everyday **Friend** mode.
The marketing site and companion are static HTML (no build step, no external CDNs). **Hopewick Plus** (AU$20/month) adds a small Node account server for email sign-in and Stripe — see [SETUP.md](SETUP.md). Chats stay in the browser.

**Live:**
- Website (landing page): https://dwayne260211.github.io/hopewick/
- App: https://dwayne260211.github.io/hopewick/app/
- Demo (no API key needed, nothing saved): https://dwayne260211.github.io/hopewick/app/?demo=1

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Marketing landing page for rehabs, AOD services and clinicians |
| `app/index.html` | The app itself (one self-contained file) |
| `og-image.png` | Social share image (1200×630), made by `tools/make_og.py` |
| `LICENSE` | Proprietary licence (all rights reserved) |
| `tests/` | Headless Playwright tests |

The companion inside the app is called **Hope** by default. Each person can rename it in Settings. Profiles that still had the old default name "Eden" switch to Hope automatically, and custom names are kept.

The old addresses (`https://dwayne260211.github.io/eden/` and `/eden/app/`) redirect to the matching Hopewick pages, keeping any `?demo=1`. If you open the site you'll see the landing page. It shows a **Welcome back** banner with a button to reopen the app. Your chats and settings are still there, because they live in this browser under the same site and the same `eden.*` storage keys.

## Rebranding (name, tagline, company)

The product name, the companion's default name, the tagline and the company live in **one** `BRAND` constant at the top of each page:

```js
const BRAND = { name:'Hopewick', companion:'Hope', tagline:'AOD recovery support between sessions', company:'BRIDGE&BITE.CO PTY LTD', abn:'83 692 080 792', year:2026, ... };
```

To rename the product, edit `BRAND` in **both** `index.html` and `app/index.html`, then run `python3 tools/make_og.py` to redraw the share image. Also update the static fallback text in the `<head>` meta tags of `index.html` (social-media crawlers don't run JavaScript). Storage keys stay `eden.*` on purpose, so existing users keep their data.

## Sample conversations

`app/?demo=1` still plays scripted sample conversations for a look around (including organisation trials). It is not a button on the public site. The landing page and the person picker open the app. The sample:
- makes **no API calls** and needs no key;
- uses a sample person ("Alex") with a sample recovery counter and a week of check-ins;
- plays scripted conversations with a streaming animation: a craving (HALT and urge surfing), a slip-up, cutting down, *Pray with me*, and a crisis example that shows the crisis card;
- gives a scripted reply to anything you type;
- never reads or writes your real data, and everything resets when you leave (**Exit demo**).

A **DEMO** badge and banner are always visible.

## Pilot with us

The landing page has a "Pilot with us" section for services. Organisation and clinic enquiries go to **admin@bridge-bite-co.com**. That address is the business contact for organisations and clinics. It is not the founder’s email. Hopewick was founded by **Dwayne Stevens**.

> ⚠️ Hope is an **AI recovery companion, not a registered counsellor, doctor or clinician**. It can't diagnose or advise on withdrawal, detox or medications. Stopping alcohol or benzodiazepines suddenly can be dangerous, so talk to a doctor first. **In an emergency call 000.**

## Getting help (Australia)

The **Get help now** button is always at the top of the screen. First-run onboarding is Welcome, what brings you here, a faith preference, then **Start talking to Hope**. Theme, voice, model, PIN, and export stay in Settings. The demo, and **More → Preferences**, still open the longer preferences screen. The header no longer carries the settings gear, theme toggle, memories button or auto-speak button — those stay in Settings. All numbers were verified against official sites in September 2026.

| Service | Number |
|---|---|
| Emergency (police, ambulance, fire) | **000** |
| Lifeline (24/7 crisis support) | **13 11 14**, text 0477 13 11 14 |
| Suicide Call Back Service | **1300 659 467** |
| National Alcohol and Other Drug Hotline | **1800 250 015** |
| Adis 24/7 Alcohol and Drug Support (QLD) | **1800 177 833** |
| 1800RESPECT (domestic, family and sexual violence) | **1800 737 732** |
| 13YARN (Aboriginal and Torres Strait Islander crisis support) | **13 92 76** |

**News & resources** (More → News & resources) lists trusted drug-alert links. The tab bar is **Home · Chat · Domestic & family violence · Journal · More**. **Domestic & family violence** stays its own destination in the sidebar and the tab bar — not inside Get help. **Get help** stays in the header. National crisis line: **1800RESPECT 1800 737 732** (text **0458 737 732**). Queensland, when that state is selected: **DVConnect Womensline 1800 811 811** (24/7) and **Mensline 1800 600 636** (9am–midnight). Shelter placement is via those services and [Ask Izzy](https://askizzy.org.au/search/domestic-violence) — refuge addresses are not listed in the app. Legal information: [Family Violence Law Help](https://familyviolencelaw.gov.au/), [Legal Aid Queensland](https://www.legalaid.qld.gov.au/Find-legal-information/Relationships-and-children/Domestic-and-family-violence) **1300 65 11 88**, [Women’s Legal Service Queensland](https://wlsq.org.au/) **1800 957 957**, [QIFVLS](https://qifvls.com.au/) **1800 887 700**. Get help stays the crisis and AOD list, including 1800RESPECT on the crisis card.

## Hopewick Plus (AU$20/month)

**Hopewick Plus — 3 days free, then AU$20/month** unlocks the full Hopewick experience: SMART goals, the journal, the resume builder, nutrition notes, relapse and exit plans, clean time tracker, SOAP reflections, Going Deeper study tracks (Christian, Islamic, Hindu, Buddhist, and a values path), 12 Steps practice, the full year of readings, and saved chat history. Education libraries stay with Plus: nutrition, gut health, neuroplasticity, and ice baths and recovery spas. Cancel anytime. One subscription per person.

Essential support stays free: Today’s Readings, crisis support, domestic and family violence resources, Get Help, and Hope chat. **Daily message limits:** Free is 5 messages/day. Hopewick Plus, including a 3-day trial and complimentary founder access, has no daily message limit. The account server enforces the free cap on hosted Hope (`POST /api/hope/chat`). The browser never sees the model key. Organisation plans are coming soon (the pilot sheet is still the conversation for services). New Plus Checkout sessions send `subscription_data[trial_period_days]=3` with the existing monthly price. See [SETUP.md](SETUP.md).

Sign-in is email and password. You stay signed in on that browser until you sign out. A one-time email link is still there for a first visit or a forgotten password (the screen says “Email me a sign-in link”). In the companion the screen is **Hopewick Plus**. Checkout needs a signed-in account. Chats are not uploaded — the account stores email, a scrypt password hash when you set one, and subscription status. Complimentary Plus for the founder uses `FOUNDER_PLUS_EMAILS` (see [SETUP.md](SETUP.md)); when that variable is unset, the only address is the founder’s Plus email, not the organisations inbox.

Configure Stripe and run the account server with [SETUP.md](SETUP.md) (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and in production `RESEND_API_KEY` plus `MAGIC_LINK_FROM`). Locally: `npm start`, then open http://127.0.0.1:8787/ .

GitHub Pages cannot run that server, so `https://hopewick.com.au/api/billing/*` 404s until DNS points at it. Production is one Render web service (`render.yaml`, `Dockerfile`) that serves the site and `/api` on `https://hopewick.com.au`. The cutover steps, the test price `price_1UKDd4PoYudRr3bcBe7IIdTH`, and the webhook URL are in [SETUP.md](SETUP.md). Hosted Hope uses `OPENAI_API_KEY` on that service. The older invite-code proxy remains at `https://hopewick-api.azurewebsites.net/api` for Developer / pilot use.

Add Hopewick to your home screen as a web app today (`app/manifest.webmanifest` and the icons in `app/`). The Play Store app isn’t ready yet. A service worker is still not included — see [SETUP.md](SETUP.md).

## Open it

- Go to the live site, or double-click `app/index.html` to open the app from disk.
- Or serve it locally (this is best for voice input, because browsers only allow the microphone on localhost or HTTPS):
  ```bash
  python3 -m http.server 8765   # then visit http://localhost:8765 (landing) or http://localhost:8765/app/
  ```

## First run

1. **Who's chatting?** Add your profile. Each person has their own private chats, memories, check-ins, recovery counter and mode, faith and personality settings. A new device starts with no profiles — nothing is named for you.
2. Read the short one-time disclaimer.
3. **Sign in** (email and password, or a one-time email link) and chat with Hope. You stay signed in on that browser until you sign out. Free is 5 messages a day. Hopewick Plus, including a 3-day trial and complimentary founder access, has no daily message limit. No personal API key. Settings → Developer (own API key, model endpoint, own provider, and invite redeem when that entry is turned on) is visible only when the signed-in account email is on `FOUNDER_PLUS_EMAILS`. A profile name does not unlock it. Guest, free, other Plus accounts, and `admin@bridge-bite-co.com` do not see it and cannot paste a key. A key already in this browser does not replace hosted Hope for those accounts.

## Features

- **Today on Home.** Home opens with **What do you need right now?** — chips for Get help (crisis and AOD), domestic and family violence, a craving, chat, today’s reading, journal, Bible & SOAP (hidden when faith is “none”), the resume builder, and a meeting. Under that, a prominent card with a full **Word for the day** and a full **Just for today** reading. There are 365 original entries of each (`app/data/word-for-the-day.js`, `app/data/just-for-today.js`), chosen by the Australia/Brisbane calendar date — the same pair for everyone that day, including offline, with no API. Optional fellowship-style reflection, not clinical advice. Expand the card to read the whole text. 29 February reuses the 28 February readings. Journal is on the tab bar. News & resources is under More. Domestic & family violence stays its own tab, not inside Get help. Journal, SMART goals, and the resume builder open a Plus trial screen until Hopewick Plus is active.
- **Product copy + crisis UX (v5.10).** Tagline **AOD recovery support between sessions**; Hope standardised as an **AI recovery companion**; About uses progressive disclosure; crisis card leads with moment-first actions (incl. **1800RESPECT**).
- **Find a church (v5.8).** Official Australian denominational finders (ACC, Catholic free parish lookup, Anglican dioceses, Uniting, Baptist state unions, Salvation Army, Presbyterian, Lutheran, Churches of Christ) plus AusChurches directory and maps. Hopewick does **not** scrape or host a church database — link-outs only. Soft-hidden when faith preference is “none” (same pattern as Bible); chat chip if someone asks for a church.
- **Find AOD services (v5.11).** Curated QLD-first community AOD NGOs (QuIHN, Drug ARM, Lives Lived Well, Brisbane Youth Service, Anglicare SQ, plus QNADA) with plain-language offer chips from their public sites — Visit site / Call link-outs. Different from Find treatment / rehab (state helplines + official finders only). Hopewick does **not** run these services.
- **Find treatment / rehab (v5.7).** Official Australian AOD helplines and service finders by state/territory (National Hotline **1800 250 015**, Adis/ADIS/DirectLine/ADSL and peak-body directories). Hopewick does **not** scrape or host facility lists — we link out so contacts stay current. Faith-independent; visible in demo.
- **In-app Bible (WEB).** Full Protestant canon reader using the public-domain **World English Bible**. SOAP Day 1 (Matthew 1:1–25) is embedded for offline demo; other chapters load from bible-api.com with graceful offline messaging. **Diving Deeper Finding Jesus** covers all 66 books with daily main readings, Going Deeper cross-refs, checkboxes, and original Hopewick “Finding Jesus” notes — WEB only, no commercial translation pitches.


- **Two modes.** *AOD faith counsellor* (the default) or *Friend*. The counsellor draws on motivational interviewing (OARS, working with mixed feelings, stages of change), harm reduction, relapse prevention (triggers, HALT, urge surfing, coping plans), CBT-style reframing and SMART goals. Its approach is strengths-based, trauma-informed and culturally safe. It also encourages real-world support: a GP, your local AOD service, your faith community, SMART Recovery, AA/NA or Celebrate Recovery.
- **Faith settings.** Choose Faith-inclusive / general spirituality (the default), Christian, Catholic, Islamic, Jewish, Buddhist, Hindu, Sikh, Indigenous spirituality (respectful, and defers to Elders and community) or No faith content. You can also set how much faith content you want: *Only when I ask*, *Gently woven in* (the default) or *Central*. Hope is never preachy or shaming, and it paraphrases sacred texts, saying so, rather than risk misquoting them.
- **Safety first.** Words that suggest risk (suicide, self-harm, overdose, about to use / extreme craving, domestic violence, feeling unsafe, someone in danger) instantly show a crisis card that leads with **what to do in this moment**, call buttons, and **Open Get help** (plus **Open domestic & family violence** when that is the risk). Hope is an AI recovery companion, not a crisis service, and does not diagnose. This works even offline or without an API key. Hope is also told to give those contacts first.
- **Recovery counter.** Set a start date and a label (e.g. "alcohol-free") and the day count shows in the sidebar.
- **Daily check-in.** Pick a mood and rate your cravings, with a strip showing the last 7 days. Quick-start chips include *I'm having a craving*, *I slipped up*, *Help me make a plan*, *Pray with me* and *I want to cut down*.
- **Resume builder (Hopewick Plus).** Home → Resume, or More → Resume. Free sees the steps and a 3-day trial button. Plus opens guided steps for contact details, a short summary, work / volunteering / caring, education or training, skills, and optional references. The draft stays in this browser (`eden.p.<id>.resume`). Download a plain PDF.
- **SMART goals (Hopewick Plus).** More → SMART goals, or Hope’s **Open SMART goals** button. Free can open the screen and see what a goal includes. Plus edits two goals for the current Sunday–Saturday week, with Specific, Measurable, Achievable, Relevant, and Time-bound in plain language. Edit, check off, or clear. Saved on this device (`eden.p.<id>.goals`). Not a Home chip. This is your own plan — not **Find a meeting** for SMART Recovery.
- **Journal on the tab bar.** Home · Chat · Domestic & family violence · Journal · More. The Journal tab stays for everyone. Free sees an upgrade on that tab. Plus is the private journal (write, edit, deepen). News & resources moved to More. Get help stays in the header.
- **Nutrition (Hopewick Plus).** Sidebar → Nutrition, or Hope’s **Open nutrition** button. Recovery as a rebuild: meals, fluids, protein, fruit, vegetables, and fibre, then plain-language notes on approaches people explore (higher-protein eating, vitamins, magnesium, omega-3, NAC, ashwagandha, ketogenic and carnivore diets, methylene blue). Each note separates established nutrition, limited research, and personal experience. One education disclaimer up front. Stronger cautions stay on withdrawal, interactions, restrictive diets, and methylene blue — no doses. A **My experiment** note records what changed, why, how it felt, side effects, and whether to keep it. Questions for a GP or pharmacist are specific, not a warning on every card. Free accounts see the names and an upgrade path, not the notes. It is not a Home chip, so today’s reading stays where it is. Not a substitute for a GP, pharmacist, dietitian, or crisis support.
- **Gut health (Hopewick Plus).** More → Gut health, or Hope’s **Open gut health** button. Short cards on the gut–brain link, serotonin and dopamine named carefully, probiotics and fermented foods, fibre, and how stress, sleep, and alcohol can affect the gut. Free accounts see the card titles and an upgrade path, not the notes. Not a Home chip. Not medical advice — talk to a GP or dietitian, especially on medicine or with a gut condition.
- **Brain habits (Hopewick Plus).** More → Brain habits, or Hope’s **Open brain habits** button. Easy-read neuroplasticity: the brain can change with practice, early recovery can feel hard because the old path is worn, small repeats and rest matter, and SMART goals, the journal, or Hope chat can hold one next step. Free accounts see the titles only. Not a treatment and not a promise. Not a Home chip.
- **Ice baths & recovery spas (Hopewick Plus).** More → Ice baths & spas, or Hope’s **Open ice baths & spas** button. Optional practice notes: recovery can mean meeting discomfort on purpose instead of escaping it. An ice bath is one way to step in, control your breathing, stay present, and follow through on a commitment. The win is the follow-through, not how long you stay in. Some people describe feeling alert, refreshed, grounded, or reset afterwards; experiences vary. Research notes separate physiological responses to cold from evidence about addiction recovery. No temperature, no time, and no venue. Free accounts see the opening, the safety note, where the practice sits beside other supports, and the topic names — not the full notes. Cold-water immersion stresses the heart and breathing. Not for heart or cardiovascular conditions, rhythm problems, an implanted cardiac device, uncontrolled blood pressure, respiratory disease, circulation problems, pregnancy, or significant medical conditions — talk to a GP or treating clinician. Never while intoxicated or impaired. Not alone. Enter gradually. Stop for chest pain, severe shortness of breath, faintness, confusion, unusual heart symptoms, or anything that feels medically wrong. Not a treatment for substance dependence, withdrawal, trauma, depression, or any medical condition, and not a replacement for meetings, counselling, or medical care. Not a Home chip.
- **Hopewick on mobile (coming soon, landing page).** The marketing site has a **Hopewick is coming to mobile** section. The app is coming soon to iPhone and Android, with recovery support, check-ins, tools, journalling and more from the phone. Store listing: coming soon to the Apple App Store and Google Play. There are no store links yet. Add to home screen still works today as a web app.
- **Hope opens tools.** When a message is about a journal, SMART goals, today’s readings, nutrition, gut health, brain habits, ice baths or a recovery spa, Get help, domestic and family violence, Bible study, a resume, a meeting, treatment, or Hopewick Plus, chat shows **Open in the app** buttons that go there in the app. **Open SMART goals** is the weekly plan; **Find a meeting** is AA, NA, or SMART Recovery. A crisis message puts Get help first and does not offer Plus, nutrition, gut health, brain habits, ice baths, or SMART goals. Hope is asked to end a fitting reply with a hidden `TOOLS:` line; the app also matches plain language if that line is missing.
- **Memory.** After each exchange Hope notes useful facts for each person, such as goals, triggers, supports, what helps and faith preferences. It never stores crisis details. You can view, edit, add or delete memories in the **Memories** panel.
- **Profiles and privacy.** Each person's data is stored separately, and Hope only ever sees the active person's chats and memories. There's an optional **4-digit PIN** per person, which is a *light privacy lock, not strong security*. Use **Switch person** in the header or sidebar to change who's chatting.
- **Chat.** Replies stream in (falling back to normal requests if streaming isn't supported), with a safe markdown renderer, an animated orb, a typing indicator, and stop/retry/copy/read-aloud buttons.
- **Voice.** Talk to Hope (Web Speech API, en-AU), have replies read aloud (pick the voice, rate and pitch, or turn on auto-speak), or use hands-free conversation mode.
- **Light and dark mode**, and it works on desktop and mobile.
- **Your data.** Export and import **per person** (never includes the API key or PIN). You can clear one person's data or everything on the device.
- **Accessible.** Labelled controls, a skip link, focus rings, keyboard support and reduced-motion support.

## Upgrading from v1

If you used the earlier single-user version, your chats, memories and settings move into a profile named **Person 1** automatically, and your API key becomes the shared device key. You can rename that profile. Everyone is switched to counsellor mode **once**. After that, you can pick Friend mode in Settings and it will stay.

## Tests

- `tests/test_eden.py` runs headless Chromium (Playwright) checks against a fake API. It covers profiles, PINs, privacy, migration, mode and faith, the crisis path, the help panel, the counter, check-ins, streaming, memory, export/import, mobile, loading from file://, demo mode (no network calls, no storage changes, scenarios, crisis card), central branding, and the landing page (links, welcome-back banner, copyright, meta tags).
- `tests/test_profiles.py` checks that a new device starts with no named profiles, that unused factory profiles are not shown, and that demo mode still uses the Alex sample without writing storage.
- `tests/test_real_e2e.py` runs a live test using `OPENAI_API_KEY` from the environment. The key goes into the headless browser only and is never written to a file.

## Copyright and licence

© 2026 BRIDGE&BITE.CO PTY LTD (ABN 83 692 080 792). All rights reserved.

This is proprietary software. It is published for demonstration purposes only. You may not copy, modify, distribute or use it without written permission from BRIDGE&BITE.CO PTY LTD. See [LICENSE](LICENSE).




### Find a church (v5.8)
Open **Demo** → sidebar **Find a church** (near Find a meeting / Find treatment). Cards by tradition + maps near me + AusChurches. Or tap the chip when chat asks for a church/parish. Hidden when faith preference is **No faith content**. Also under **Get help now**.

### Find treatment / rehab (v5.7)
Open **Demo** → sidebar **Find treatment / rehab** (near Find a meeting / Find nearby help). Pick a state for the helpline + Open service finder. Or tap the chip when chat mentions rehab/detox/treatment. Also under **Get help now**.

### In-app Bible (v5.6)
Open **Demo** → sidebar **Bible & SOAP**. Tabs: **SOAP daily** | **Diving Deeper Finding Jesus** | **Read Bible**.

- SOAP Day 1 shows Matthew 1 embedded (WEB).
- **Diving Deeper Finding Jesus**: 483 days / 97 weeks across all 66 Protestant books. Genesis opens with the founder’s photo plan (25 days); then Exodus → Revelation. Pick a **section** (Genesis, Law, History, Wisdom, Prophets, Gospels, Church letters, Revelation), tick days, open a row for main + Going Deeper WEB text, expand **Finding Jesus**, or **Talk with Hope**.
- **Read Bible**: full Protestant canon (WEB via bible-api.com, cached).
