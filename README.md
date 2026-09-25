# Hopewick — faith-based AOD support & AI companion 🕯️

**Hopewick** (a small light that keeps burning) is a warm, non-judgemental AI companion that runs entirely in your browser. By default it acts as a **faith-sensitive Alcohol and Other Drugs (AOD) support companion**. It can also switch to an everyday **Friend** mode.
There's no build step, no server and no external CDNs.

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
const BRAND = { name:'Hopewick', companion:'Hope', tagline:'Faith-sensitive AOD support, between sessions', company:'BRIDGE&BITE.CO PTY LTD', abn:'83 692 080 792', year:2026, ... };
```

To rename the product, edit `BRAND` in **both** `index.html` and `app/index.html`, then run `python3 tools/make_og.py` to redraw the share image. Also update the static fallback text in the `<head>` meta tags of `index.html` (social-media crawlers don't run JavaScript). Storage keys stay `eden.*` on purpose, so existing users keep their data.

## Demo mode

Open `app/?demo=1`, or click **Try the demo** on the landing page or the person picker. The demo:
- makes **no API calls** and needs no key;
- uses a sample person ("Alex") with a sample recovery counter and a week of check-ins;
- plays scripted conversations with a streaming animation: a craving (HALT and urge surfing), a slip-up, cutting down, *Pray with me*, and a crisis example that shows the crisis card;
- gives a scripted reply to anything you type;
- never reads or writes your real data, and everything resets when you leave (**Exit demo**).

A **DEMO** badge and banner are always visible.

## Pilot with us

The landing page has a "Pilot with us" section for services. **TODO:** the contact details there are a clearly marked placeholder. Add the real contact method in `index.html` (search for `TODO`).

> ⚠️ Hope is an **AI support tool, not a registered counsellor, doctor or clinician**. It can't diagnose or advise on withdrawal, detox or medications. Stopping alcohol or benzodiazepines suddenly can be dangerous, so talk to a doctor first. **In an emergency call 000.**

## Getting help (Australia)

The **Get help now** button is always at the top of the screen. All numbers were verified against official sites in September 2026.

| Service | Number |
|---|---|
| Emergency (police, ambulance, fire) | **000** |
| Lifeline (24/7 crisis support) | **13 11 14**, text 0477 13 11 14 |
| Suicide Call Back Service | **1300 659 467** |
| National Alcohol and Other Drug Hotline | **1800 250 015** |
| Adis 24/7 Alcohol and Drug Support (QLD) | **1800 177 833** |
| 13YARN (Aboriginal and Torres Strait Islander crisis support) | **13 92 76** |

## Open it

- Go to the live site, or double-click `app/index.html` to open the app from disk.
- Or serve it locally (this is best for voice input, because browsers only allow the microphone on localhost or HTTPS):
  ```bash
  python3 -m http.server 8765   # then visit http://localhost:8765 (landing) or http://localhost:8765/app/
  ```

## First run

1. **Who's chatting?** Pick **Dwayne** or **Abbey**, or add a person. Each person has their own private chats, memories, check-ins, recovery counter and mode, faith and personality settings.
2. Read the short one-time disclaimer.
3. **Visitors:** use **Try the demo** (no key, nothing sent) or **Get early access**. **Advanced (optional):** Settings → Advanced → *Use my own API key* still accepts an OpenAI-compatible key in this browser for testing (`eden.*` localStorage keys unchanged). Default provider `https://api.openai.com/v1` / `gpt-4o-mini`.

## Features

- **Find a church (v5.8).** Official Australian denominational finders (ACC, Catholic free parish lookup, Anglican dioceses, Uniting, Baptist state unions, Salvation Army, Presbyterian, Lutheran, Churches of Christ) plus AusChurches directory and maps. Hopewick does **not** scrape or host a church database — link-outs only. Soft-hidden when faith preference is “none” (same pattern as Bible); chat chip if someone asks for a church.
- **Info & training (v5.9).** Curated official Australian AOD **workforce training** and public information sites (Insight eLearning & webinars first, plus Dovetail, NCETA, Cracks in the Ice worker resources, ADF, Positive Choices, AIHW, Counselling Online). Hopewick **does not** run these courses — link-outs only. Useful for rehab/AOD workers exploring Hopewick as a pilot tool. Faith-independent; visible in demo.
- **Find treatment / rehab (v5.7).** Official Australian AOD helplines and service finders by state/territory (National Hotline **1800 250 015**, Adis/ADIS/DirectLine/ADSL and peak-body directories). Hopewick does **not** scrape or host facility lists — we link out so contacts stay current. Faith-independent; visible in demo.
- **In-app Bible (WEB).** Full Protestant canon reader using the public-domain **World English Bible**. SOAP Day 1 (Matthew 1:1–25) is embedded for offline demo; other chapters load from bible-api.com with graceful offline messaging. **Diving Deeper Finding Jesus** covers all 66 books with daily main readings, Going Deeper cross-refs, checkboxes, and original Hopewick “Finding Jesus” notes — WEB only, no commercial translation pitches.


- **Two modes.** *AOD faith counsellor* (the default) or *Friend*. The counsellor draws on motivational interviewing (OARS, working with mixed feelings, stages of change), harm reduction, relapse prevention (triggers, HALT, urge surfing, coping plans), CBT-style reframing and SMART goals. Its approach is strengths-based, trauma-informed and culturally safe. It also encourages real-world support: a GP, your local AOD service, your faith community, SMART Recovery, AA/NA or Celebrate Recovery.
- **Faith settings.** Choose Faith-inclusive / general spirituality (the default), Christian, Catholic, Islamic, Jewish, Buddhist, Hindu, Sikh, Indigenous spirituality (respectful, and defers to Elders and community) or No faith content. You can also set how much faith content you want: *Only when I ask*, *Gently woven in* (the default) or *Central*. Hope is never preachy or shaming, and it paraphrases sacred texts, saying so, rather than risk misquoting them.
- **Safety first.** Words that suggest risk (suicide, self-harm, overdose, feeling unsafe, someone in danger) instantly show a crisis card with the contacts above. This works even offline or without an API key. Hope is also told to give those contacts first.
- **Recovery counter.** Set a start date and a label (e.g. "alcohol-free") and the day count shows in the sidebar.
- **Daily check-in.** Pick a mood and rate your cravings, with a strip showing the last 7 days. Quick-start chips include *I'm having a craving*, *I slipped up*, *Help me make a plan*, *Pray with me* and *I want to cut down*.
- **Memory.** After each exchange Hope notes useful facts for each person, such as goals, triggers, supports, what helps and faith preferences. It never stores crisis details. You can view, edit, add or delete memories in the **Memories** panel.
- **Profiles and privacy.** Each person's data is stored separately, and Hope only ever sees the active person's chats and memories. There's an optional **4-digit PIN** per person, which is a *light privacy lock, not strong security*. Use **Switch person** in the header or sidebar to change who's chatting.
- **Chat.** Replies stream in (falling back to normal requests if streaming isn't supported), with a safe markdown renderer, an animated orb, a typing indicator, and stop/retry/copy/read-aloud buttons.
- **Voice.** Talk to Hope (Web Speech API, en-AU), have replies read aloud (pick the voice, rate and pitch, or turn on auto-speak), or use hands-free conversation mode.
- **Light and dark mode**, and it works on desktop and mobile.
- **Your data.** Export and import **per person** (never includes the API key or PIN). You can clear one person's data or everything on the device.
- **Accessible.** Labelled controls, a skip link, focus rings, keyboard support and reduced-motion support.

## Upgrading from v1

If you used the earlier single-user version, your chats, memories and settings move into the **Dwayne** profile automatically, and your API key becomes the shared device key. Everyone is switched to counsellor mode **once**. After that, you can pick Friend mode in Settings and it will stay.

## Tests

- `tests/test_eden.py` runs headless Chromium (Playwright) checks against a fake API. It covers profiles, PINs, privacy, migration, mode and faith, the crisis path, the help panel, the counter, check-ins, streaming, memory, export/import, mobile, loading from file://, demo mode (no network calls, no storage changes, scenarios, crisis card), central branding, and the landing page (links, welcome-back banner, TODO contact, copyright, meta tags).
- `tests/test_real_e2e.py` runs a live test using `OPENAI_API_KEY` from the environment. The key goes into the headless browser only and is never written to a file.

## Copyright and licence

© 2026 BRIDGE&BITE.CO PTY LTD (ABN 83 692 080 792). All rights reserved.

This is proprietary software. It is published for demonstration purposes only. You may not copy, modify, distribute or use it without written permission from BRIDGE&BITE.CO PTY LTD. See [LICENSE](LICENSE).



### Info & training (v5.9)
Open **Demo** → sidebar **Info & training** (near Find treatment / Nutrition). Groups: **For AOD staff & students** (Insight featured, Dovetail, NCETA, Cracks in the Ice worker training) and **For everyone** (ADF, Positive Choices, AIHW, Counselling Online). Educational link-outs only — not medical advice; crisis → **Get help now**.

### Find a church (v5.8)
Open **Demo** → sidebar **Find a church** (near Find a meeting / Find treatment). Cards by tradition + maps near me + AusChurches. Or tap the chip when chat asks for a church/parish. Hidden when faith preference is **No faith content**. Also under **Get help now**.

### Find treatment / rehab (v5.7)
Open **Demo** → sidebar **Find treatment / rehab** (near Find a meeting / Find nearby help). Pick a state for the helpline + Open service finder. Or tap the chip when chat mentions rehab/detox/treatment. Also under **Get help now**.

### In-app Bible (v5.6)
Open **Demo** → sidebar **Bible & SOAP**. Tabs: **SOAP daily** | **Diving Deeper Finding Jesus** | **Read Bible**.

- SOAP Day 1 shows Matthew 1 embedded (WEB).
- **Diving Deeper Finding Jesus**: 483 days / 97 weeks across all 66 Protestant books. Genesis opens with the founder’s photo plan (25 days); then Exodus → Revelation. Pick a **section** (Genesis, Law, History, Wisdom, Prophets, Gospels, Church letters, Revelation), tick days, open a row for main + Going Deeper WEB text, expand **Finding Jesus**, or **Talk with Hope**.
- **Read Bible**: full Protestant canon (WEB via bible-api.com, cached).
