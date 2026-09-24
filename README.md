# Eden — your AI companion 🌿

Eden is a warm, curious, supportive AI friend that runs entirely in your browser.
Everything is one self-contained file, `index.html`. There's no build step, no server code and no external CDNs.

## Open it

- **Easiest:** double-click `index.html`. It opens straight from disk in any modern browser.
- **Or serve it** (recommended if you want voice input, because some browsers only allow the microphone on `http://localhost` or HTTPS):
  ```bash
  cd eden-companion
  python3 -m http.server 8765
  # then visit http://localhost:8765
  ```

## Add your API key

1. Click **Settings** (the sliders icon, top right, or the link in the sidebar).
2. Under **Connection**, fill in:
   - **Provider base URL**: defaults to `https://api.openai.com/v1`. Any OpenAI-compatible Chat Completions endpoint works (e.g. `https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1`, `https://api.x.ai/v1`, or a local server such as LM Studio or Ollama at `http://localhost:11434/v1`).
   - **Model**: defaults to `gpt-4o-mini`.
   - **API key**: your key.
3. Click **Test connection**, then **Save**.

Your key is kept only in this browser's `localStorage` and is sent only to the base URL you set. It is **not** included in exports.
Without a key, Eden still loads fully and shows a friendly prompt to add one.

> Note: the provider has to allow direct browser (CORS) requests. OpenAI, OpenRouter, Groq and most local servers do.

## Features

- **Chat**: streamed replies (SSE) that fall back automatically to non-streaming, a typing indicator, a safe built-in markdown renderer, stop generation, copy and read-aloud buttons on each message, and retry on errors.
- **Animated orb**: Eden's avatar breathes when idle, swirls while thinking, pulses while speaking and glows gold while listening.
- **Personality**: rename Eden, pick trait chips (Warm, Playful, Thoughtful, Witty, Calm…), add free-text personality notes, choose a conversation style and add extra instructions. Eden is friendly and non-romantic by default and uses Australian English.
- **Memory**: after each exchange, a small extra API call pulls out durable facts about you as JSON. They're stored locally and added to Eden's system prompt. The **Memories** panel lets you view, search, edit, add and delete them. You can turn auto-learning off in Settings.
- **Conversations**: saved locally, with a **New chat** button and a history list in the sidebar (delete per chat).
- **Mood check-in**: an optional emoji row at the start of each new chat. Your answer is passed to Eden as context.
- **Voice**: a mic button for speech-to-text (Web Speech API, en-AU), and text-to-speech replies with a voice picker, rate and pitch controls and an auto-speak toggle. **Hands-free conversation mode** (headphones icon) listens, replies aloud, then listens again. Where the browser doesn't support these, Eden explains that instead of breaking.
- **Light and dark mode**: follows your system by default, with a toggle in the header.
- **Your data**: export or import everything as JSON, and **Clear all data** (asks you to confirm first), all from Settings.
- **Accessible**: labelled controls, a skip link, visible focus rings, full keyboard support (Enter to send, Shift+Enter for a new line, Esc to stop/close, Ctrl/Cmd+Shift+O for a new chat), a live region for messages and respect for reduced-motion settings.

## Browser support notes

- Voice input (SpeechRecognition) works in Chrome, Edge and Safari. Firefox doesn't support it, so the mic shows a friendly message there.
- Available voices depend on your operating system and browser.
- All data lives in one browser profile. Use Export/Import to move it to another device.

## Tests

`tests/test_eden.py` runs a headless Chromium suite (Playwright) against a mocked API. It covers streaming, markdown, memory extraction and injection, the panels, persistence, export, mobile layout and loading from `file://`.
`tests/test_real_e2e.py` runs a live streamed-reply and memory test. It uses `OPENAI_API_KEY` from the environment and injects it only into the headless browser, never into any file.

```bash
python3 -m http.server 8765 &   # from this folder
pip install playwright && python3 tests/test_eden.py
```
