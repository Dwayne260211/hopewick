#!/usr/bin/env python3
"""Hosted Hope: the app sends only user/assistant turns plus structured context.

The server (server/hope-prompts.js) writes every system instruction, so the
browser must never post a system message to /api/hope/chat.
"""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session, install_member_session

SERVER_PROMPTS = ROOT / "server" / "hope-prompts.js"


def test_server_prompt_module_has_crisis_contacts():
    text = SERVER_PROMPTS.read_text(encoding="utf-8")
    assert "Lifeline 13 11 14" in text
    assert "num: '000'" in text


def test_server_prompt_says_relapse_and_exit_plans_are_free_and_saved_to_the_account():
    text = SERVER_PROMPTS.read_text(encoding="utf-8")
    assert "Plans (Hopewick Plus" not in text
    assert "stays on their device" not in text
    assert "the journal, relapse and exit plans" not in text
    assert "plans = Plans (always free, on every plan; on this device, and with the account when signed in)" in text
    assert "Relapse prevention and exit plans are free on every plan." in text
    assert "FIXED HOPEWICK RULES" in text
    assert "export const CRISIS_INSTRUCTION" in text


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


INSTALL_FETCH = """() => {
  window.__hopeCalls = [];
  const orig = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String((url && url.url) || url || '');
    if (u.includes('/api/hope/chat')) {
      let body = {};
      try { body = JSON.parse((opts && opts.body) || '{}'); } catch (_) {}
      window.__hopeCalls.push(body);
      const content = body.purpose === 'memory' ? '{"facts":[]}' : 'Hi from Hope';
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(url, opts);
  };
}"""


def test_app_sends_no_system_messages_to_hosted_hope():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            install_member_session(page)
            page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="networkidle")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#needNow", timeout=10000)
            page.wait_for_function("() => billingState.loaded === true")
            usage = {"day": "2026-10-18", "used": 1, "limit": None, "remaining": None,
                     "plus": True, "trialEligible": False, "resetLabel": None}
            page.evaluate("(usage) => { window.__hopeUsageLive = usage; }", usage)
            grant_server_session(page, plus=True, founder=False, checkout=True, usage=usage, library="auto")
            page.evaluate("() => { isDemo = false; syncHopeAllowance(); }")
            page.evaluate(INSTALL_FETCH)
            page.click("#appTabChat")
            page.wait_for_selector("#messages:not([hidden])")

            page.fill("#input", "Can we talk about cravings?")
            page.click("#sendBtn")
            page.wait_for_function("() => window.__hopeCalls.some(c => c.purpose === 'chat')", timeout=10000)
            page.fill("#input", "I want to die")
            page.click("#sendBtn")
            page.wait_for_function("() => window.__hopeCalls.filter(c => c.purpose === 'chat').length >= 2", timeout=10000)

            calls = page.evaluate("() => window.__hopeCalls")
            chats = [c for c in calls if c.get("purpose") == "chat"]
            assert len(chats) >= 2
            for call in calls:
                roles = {m["role"] for m in call["messages"]}
                assert roles <= {"user", "assistant"}, roles
                assert "context" in call
            ctx = chats[0]["context"]
            assert ctx["mode"] in ("counsellor", "friend")
            assert ctx["companionName"]
            assert isinstance(ctx["memories"], list)
            assert chats[1]["messages"][-1] == {"role": "user", "content": "I want to die"}
            assert errors == []
            browser.close()
    finally:
        httpd.shutdown()
