# Eden — faith-based AOD support & AI companion 🌿

Eden is a warm, non-judgemental AI companion that runs entirely in your browser. By default it acts as a **faith-sensitive Alcohol and Other Drugs (AOD) support companion**. It can also switch to an everyday **Friend** mode.
Everything is in one self-contained file, `index.html`. There's no build step, no server and no external CDNs.

**Live:** https://dwayne260211.github.io/eden/

> ⚠️ Eden is an **AI support tool, not a registered counsellor, doctor or clinician**. It can't diagnose or advise on withdrawal, detox or medications. Stopping alcohol or benzodiazepines suddenly can be dangerous, so talk to a doctor first. **In an emergency call 000.**

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

- Go to the live site, or double-click `index.html` to open it from disk.
- Or serve it locally (this is best for voice input, because browsers only allow the microphone on localhost or HTTPS):
  ```bash
  python3 -m http.server 8765   # then visit http://localhost:8765
  ```

## First run

1. **Who's chatting?** Pick **Dwayne** or **Abbey**, or add a person. Each person has their own private chats, memories, check-ins, recovery counter and mode, faith and personality settings.
2. Read the short one-time disclaimer.
3. Open **Settings** (the sliders icon), add your **API key** under *Connection*, then click **Test connection** and **Save**. The provider settings and key are shared by everyone on the device and stored only in this browser. The default provider is `https://api.openai.com/v1` with model `gpt-4o-mini`. Any OpenAI-compatible endpoint that allows browser (CORS) requests works.

## Features

- **Two modes.** *AOD faith counsellor* (the default) or *Friend*. The counsellor draws on motivational interviewing (OARS, working with mixed feelings, stages of change), harm reduction, relapse prevention (triggers, HALT, urge surfing, coping plans), CBT-style reframing and SMART goals. Its approach is strengths-based, trauma-informed and culturally safe. It also encourages real-world support: a GP, your local AOD service, your faith community, SMART Recovery, AA/NA or Celebrate Recovery.
- **Faith settings.** Choose Faith-inclusive / general spirituality (the default), Christian, Catholic, Islamic, Jewish, Buddhist, Hindu, Sikh, Indigenous spirituality (respectful, and defers to Elders and community) or No faith content. You can also set how much faith content you want: *Only when I ask*, *Gently woven in* (the default) or *Central*. Eden is never preachy or shaming, and it paraphrases sacred texts, saying so, rather than risk misquoting them.
- **Safety first.** Words that suggest risk (suicide, self-harm, overdose, feeling unsafe, someone in danger) instantly show a crisis card with the contacts above. This works even offline or without an API key. Eden is also told to give those contacts first.
- **Recovery counter.** Set a start date and a label (e.g. "alcohol-free") and the day count shows in the sidebar.
- **Daily check-in.** Pick a mood and rate your cravings, with a strip showing the last 7 days. Quick-start chips include *I'm having a craving*, *I slipped up*, *Help me make a plan*, *Pray with me* and *I want to cut down*.
- **Memory.** After each exchange Eden notes useful facts for each person, such as goals, triggers, supports, what helps and faith preferences. It never stores crisis details. You can view, edit, add or delete memories in the **Memories** panel.
- **Profiles and privacy.** Each person's data is stored separately, and Eden only ever sees the active person's chats and memories. There's an optional **4-digit PIN** per person, which is a *light privacy lock, not strong security*. Use **Switch person** in the header or sidebar to change who's chatting.
- **Chat.** Replies stream in (falling back to normal requests if streaming isn't supported), with a safe markdown renderer, an animated orb, a typing indicator, and stop/retry/copy/read-aloud buttons.
- **Voice.** Talk to Eden (Web Speech API, en-AU), have replies read aloud (pick the voice, rate and pitch, or turn on auto-speak), or use hands-free conversation mode.
- **Light and dark mode**, and it works on desktop and mobile.
- **Your data.** Export and import **per person** (never includes the API key or PIN). You can clear one person's data or everything on the device.
- **Accessible.** Labelled controls, a skip link, focus rings, keyboard support and reduced-motion support.

## Upgrading from v1

If you used the earlier single-user version, your chats, memories and settings move into the **Dwayne** profile automatically, and your API key becomes the shared device key. Everyone is switched to counsellor mode **once**. After that, you can pick Friend mode in Settings and it will stay.

## Tests

- `tests/test_eden.py` runs 67 headless Chromium (Playwright) checks against a fake API. It covers profiles, PINs, privacy, migration, mode and faith, the crisis path, the help panel, the counter, check-ins, streaming, memory, export/import, mobile and loading from file://.
- `tests/test_real_e2e.py` runs a live test using `OPENAI_API_KEY` from the environment. The key goes into the headless browser only and is never written to a file.
