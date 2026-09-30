#!/usr/bin/env python3
"""Message speaker (read aloud) must start speech and must not stick on Speaking…"""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import install_member_session
APP = ROOT / "app" / "index.html"

# Installed before app/index.html runs so Hope captures this synth, not the browser's.
TTS_STUB = r"""
(() => {
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    _eat: false,
    getVoices() {
      return [{ name: 'Karen', lang: 'en-AU', voiceURI: 'karen-au', localService: true, default: true }];
    },
    addEventListener() {},
    removeEventListener() {},
    cancel() {
      window.__ttsLog.push({ type: 'cancel' });
      this._eat = true;
      const u = window.__ttsCurrent;
      this.speaking = false;
      this.pending = false;
      this.paused = false;
      window.__ttsCurrent = null;
      if (u && typeof u.onerror === 'function') u.onerror({ error: 'interrupted' });
      queueMicrotask(() => { this._eat = false; });
    },
    pause() { this.paused = true; },
    resume() {
      this.paused = false;
      window.__ttsLog.push({ type: 'resume' });
    },
    speak(u) {
      if (this._eat) {
        this._eat = false;
        window.__ttsLog.push({ type: 'swallowed', text: String(u && u.text || '') });
        this.speaking = false;
        if (u && typeof u.onerror === 'function') u.onerror({ error: 'canceled' });
        return;
      }
      const text = String(u && u.text || '');
      window.__ttsLog.push({ type: 'speak', text });
      window.__ttsCurrent = u;
      const mode = window.__ttsMode || 'ok';
      if (mode === 'fail') {
        this.speaking = false;
        this.pending = false;
        if (u && typeof u.onerror === 'function') u.onerror({ error: 'canceled' });
        return;
      }
      if (mode === 'silent') {
        this.speaking = false;
        this.pending = false;
        return;
      }
      this.speaking = true;
      this.pending = false;
      this.paused = false;
      if (u && typeof u.onstart === 'function') u.onstart();
    },
  };
  window.__ttsLog = [];
  window.__ttsMode = 'ok';
  window.__ttsCurrent = null;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get() { return synth; } });
})();
"""


def test_speak_source_does_not_ignore_cancel():
    text = APP.read_text(encoding="utf-8")
    assert "function readMessageAloud" in text
    assert "function speakChunks" in text
    assert "dataset.readAloud" in text
    # Old handler ignored cancel/interrupt and left the header on Speaking….
    assert "e.error !== 'interrupted' && e.error !== 'canceled'" not in text
    assert "currentUtterance" in text
    assert "Copy message" in text


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _status(page) -> str:
    return page.inner_text("#statusText")


def _log(page):
    return page.evaluate("() => window.__ttsLog.map(e => ({ type: e.type, text: e.text || '' }))")


def test_chat_speaker_reads_aloud_and_clears_stuck_state():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={"width": 390, "height": 844},
                user_agent=(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
                ),
                has_touch=True,
                is_mobile=True,
            )
            page.add_init_script(TTS_STUB)
            install_member_session(page)
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefsContinue", timeout=20000)
            page.click("#launchPrefsContinue")
            page.click("#appTabChat")
            page.wait_for_selector("#messages:not([hidden])", timeout=10000)
            page.evaluate(
                """() => {
                  const c = activeConvo() || newConversation();
                  c.messages.push({
                    role: 'assistant',
                    content: "Matthew one is today's reading. **God with us.**",
                    ts: Date.now(),
                  });
                  setAppTab('chat');
                  renderMessages();
                  window.__copied = '';
                  const clip = navigator.clipboard || (navigator.clipboard = {});
                  clip.writeText = async (t) => { window.__copied = t; };
                }"""
            )
            speak_btn = page.locator("[data-read-aloud]")
            speak_btn.wait_for(state="visible", timeout=10000)
            assert speak_btn.get_attribute("aria-label") == "Read aloud"
            page.evaluate("() => { window.__ttsLog.length = 0; window.__ttsMode = 'ok'; }")

            speak_btn.click()
            assert "Speaking" in _status(page)
            assert speak_btn.get_attribute("aria-pressed") == "true"
            assert speak_btn.get_attribute("aria-label") == "Stop reading"
            log = _log(page)
            assert log and log[0]["type"] == "speak", log
            assert "Matthew" in log[0]["text"]
            assert "**" not in log[0]["text"]
            assert not any(e["type"] == "cancel" for e in log), log
            assert not any(e["type"] == "swallowed" for e in log), log

            # Next sentence is queued from onend, not from another tap.
            page.evaluate("() => { if (window.__ttsCurrent && window.__ttsCurrent.onend) window.__ttsCurrent.onend(); }")
            log = _log(page)
            spoken = [e["text"] for e in log if e["type"] == "speak"]
            assert len(spoken) == 2, log
            assert "God with us" in spoken[1]
            assert "Speaking" in _status(page)

            # Audible read: the same control stops and clears the header.
            speak_btn.click()
            assert "Speaking" not in _status(page)
            assert speak_btn.get_attribute("aria-pressed") == "false"
            assert speak_btn.get_attribute("aria-label") == "Read aloud"
            log = _log(page)
            assert log[-1]["type"] == "cancel"
            assert sum(1 for e in log if e["type"] == "speak") == 2

            page.locator('[aria-label="Copy message"]').click()
            copied = page.evaluate("() => window.__copied")
            assert "Matthew one is today's reading." in copied
            assert "**God with us.**" in copied

            # Engine rejects the utterance (iOS cancel/canceled). Header must not stay on Speaking….
            page.evaluate("() => { window.__ttsMode = 'fail'; window.__ttsLog.length = 0; }")
            speak_btn.click()
            assert "Speaking" not in _status(page)
            assert speak_btn.get_attribute("aria-pressed") == "false"
            log = _log(page)
            assert any(e["type"] == "speak" and "Matthew" in e["text"] for e in log), log
            assert "read that aloud" in page.inner_text("#toasts")

            # Utterance never starts and never errors. Watchdog clears the stuck header.
            page.evaluate("() => { window.__ttsMode = 'silent'; }")
            speak_btn.click()
            assert "Speaking" in _status(page)
            page.wait_for_function(
                "() => !document.getElementById('statusText').textContent.includes('Speaking')",
                timeout=5000,
            )
            assert speak_btn.get_attribute("aria-pressed") == "false"
            assert "read that aloud" in page.inner_text("#toasts")

            # A later tap still reads aloud.
            page.evaluate("() => { window.__ttsMode = 'ok'; window.__ttsLog.length = 0; }")
            speak_btn.click()
            assert "Speaking" in _status(page)
            log = _log(page)
            assert any(e["type"] == "speak" and "Matthew" in e["text"] for e in log), log
            assert not any(e["type"] == "swallowed" for e in log), log
            browser.close()
    finally:
        httpd.shutdown()
