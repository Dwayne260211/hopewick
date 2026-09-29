#!/usr/bin/env python3
"""Free Hope daily limit: calm screen, remaining count, and crisis still gets through."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"
HOPE = ROOT / "server" / "hope-chat.js"


def test_static_hope_limit_copy():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    server = HOPE.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in text
    assert 'content="hopewick-v5.27"' in land
    assert 'id="hopeLimit"' in text
    assert "You’ve used your 15 free Hope messages for today" in text
    assert "They reset at midnight, Brisbane time." in text
    assert "Hopewick Plus has no daily limit with Hope." in text
    assert "A 7-day trial is there if you’d like to keep talking." in text
    assert "If you’re in danger at today’s limit, Hope shows the crisis numbers without using the model." in text
    assert 'id="hopeLimitHelp"' in text
    assert 'id="hopeLimitDv"' in text
    assert 'id="hopeLimitHome"' in text
    assert 'id="hopeLimitPlus"' in text
    assert "See Hopewick Plus" in text
    assert "function hopeAtDailyCap" in text
    assert "function syncHopeAllowance" in text
    assert "function showHopeDailyLimit" in text
    assert "hopeAtDailyCap() && !crisis" in text
    assert "e.code === 'daily_cap'" in text
    assert "left today" in text
    assert "FREE_DAILY_DEFAULT = 15" in server
    assert "HOPE_RESET_LABEL = 'midnight, Brisbane time'" in server
    assert "You’ve used your ${n} free Hope ${noun} for today" in server
    assert "domestic and family violence resources, and Get help stay free" in server


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _arm(page, **opts):
    defaults = {
        "remaining": 0,
        "limit": 15,
        "trial": True,
        "checkout": True,
        "plus": False,
        "demo": False,
    }
    defaults.update(opts)
    page.evaluate("(demo) => { isDemo = !!demo; }", defaults["demo"])
    if defaults["plus"]:
        usage = {
            "day": "2026-09-29", "used": 8, "limit": None, "remaining": None,
            "plus": True, "trialEligible": False, "resetLabel": None,
        }
    else:
        usage = {
            "day": "2026-09-29",
            "used": defaults["limit"] - defaults["remaining"],
            "limit": defaults["limit"],
            "remaining": defaults["remaining"],
            "plus": False,
            "trialEligible": bool(defaults["trial"]),
            "resetLabel": "midnight, Brisbane time",
        }
    page.evaluate("(usage) => { window.__hopeUsageLive = usage; }", usage)
    grant_server_session(
        page,
        plus=bool(defaults["plus"]),
        founder=False,
        checkout=bool(defaults["checkout"]),
        usage=usage,
        library="auto" if defaults["plus"] else None,
    )
    page.evaluate("(demo) => { isDemo = !!demo; syncHopeAllowance(); }", defaults["demo"])


def _install_fetch(page):
    page.evaluate(
        """() => {
          if (window.__hopeFetchInstalled) return;
          window.__hopeFetchInstalled = true;
          window.__hopeCalls = [];
          const orig = window.fetch.bind(window);
          window.fetch = async (url, opts) => {
            const u = String((url && url.url) || url || '');
            if (u.includes('/api/hope/chat')) {
              let body = {};
              try { body = JSON.parse((opts && opts.body) || '{}'); } catch (_) {}
              window.__hopeCalls.push(body);
              const last = [...(body.messages || [])].reverse().find((m) => m && m.role === 'user');
              const text = last ? String(last.content || '') : '';
              const crisis = /\\bwant(ed)? to die\\b/i.test(text);
              if (body.purpose === 'memory' || crisis) {
                const content = body.purpose === 'memory'
                  ? '{"facts":[]}'
                  : 'If you are in immediate danger, call 000. Lifeline 13 11 14.';
                return new Response(JSON.stringify({
                  choices: [{ message: { role: 'assistant', content } }],
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (window.__hopeUsageLive) {
                window.__hopeUsageLive.remaining = 0;
                window.__hopeUsageLive.used = window.__hopeUsageLive.limit || 15;
              }
              return new Response(JSON.stringify({
                error: {
                  message: 'You’ve used your 15 free Hope messages for today. They reset at midnight, Brisbane time.',
                  code: 'daily_cap',
                },
                limit: 15,
                used: 15,
                remaining: 0,
                resetLabel: 'midnight, Brisbane time',
              }), { status: 429, headers: { 'Content-Type': 'application/json' } });
            }
            return orig(url, opts);
          };
        }"""
    )


def test_free_hope_limit_screen_keeps_crisis_tools():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="networkidle")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#needNow", timeout=10000)
            page.wait_for_function("() => billingState.loaded === true")

            _arm(page, remaining=0, demo=True)
            page.click("#appTabChat")
            page.wait_for_selector("#messages:not([hidden])")
            assert page.locator("#hopeLimit").is_hidden()
            assert page.evaluate("() => hopeAtDailyCap()") is False

            _arm(page, remaining=2, trial=True, checkout=True)
            assert page.locator("#hopeAllowance").inner_text() == "2 of 15 left today"
            assert page.locator("#hopeLimit").is_hidden()
            assert page.locator("#input").is_enabled()

            _install_fetch(page)
            page.fill("#input", "Can we talk about cravings?")
            page.click("#sendBtn")
            page.wait_for_selector("#hopeLimit:not([hidden])", timeout=10000)
            page.wait_for_function("() => !document.querySelector('.typing')")
            page.wait_for_function("() => document.getElementById('headerOrb').dataset.state !== 'thinking'")
            limit = page.inner_text("#hopeLimit")
            assert "You’ve used your 15 free Hope messages for today" in limit
            assert "They reset at midnight, Brisbane time." in limit
            assert "no daily limit with Hope" in limit
            assert "7-day trial" in limit
            assert "without using the model" in limit
            assert "Get help" in limit
            assert page.input_value("#input") == "Can we talk about cravings?"
            assert page.locator(".msg.error").count() == 0
            assert page.locator('[aria-label="Try again"]').count() == 0
            assert page.evaluate("() => window.__hopeCalls.length") == 1
            assert page.locator("#helpBtn").is_visible()
            assert page.locator("#bottomNav").is_visible()
            assert page.locator("#appTabDv").is_visible()
            overflow = page.evaluate(
                """() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"""
            )
            assert overflow is True

            page.fill("#input", "Another question")
            page.click("#sendBtn")
            assert page.input_value("#input") == "Another question"
            assert page.evaluate("() => window.__hopeCalls.length") == 1
            assert page.locator(".typing").count() == 0
            assert page.locator(".msg.error").count() == 0
            assert page.evaluate("() => document.getElementById('headerOrb').dataset.state") != "thinking"

            page.fill("#input", "I want to die")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card", timeout=10000)
            page.wait_for_function(
                """() => window.__hopeCalls.some((c) => c.purpose !== 'memory' && /want to die/i.test(JSON.stringify(c)))"""
            )
            assert "000" in page.inner_text(".crisis-card")
            assert page.locator("#hopeLimit").is_visible()
            assert page.locator(".msg.error").count() == 0

            page.click("#hopeLimitHelp")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            help_text = page.inner_text("#helpDlg")
            assert "000" in help_text
            assert "13 11 14" in help_text
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open !== true")

            page.click("#hopeLimitDv")
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800 737 732" in page.inner_text("#dvView")
            assert page.locator("#bottomNav").is_visible()

            page.click("#appTabChat")
            page.wait_for_selector("#hopeLimit:not([hidden])")
            page.click("#hopeLimitHome")
            page.wait_for_selector("#todayCard")
            assert "Word for the day" in page.locator("#todayCard").text_content()
            assert page.locator("#appTabChat").is_visible()

            page.click("#appTabChat")
            page.wait_for_selector("#hopeLimit:not([hidden])")
            page.click("#hopeLimitPlus")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            account = page.inner_text("#accountDlg")
            assert "15 of 15 messages used today" in account
            assert "midnight, Brisbane time" in account
            assert "no daily message limit" in account.lower()
            page.keyboard.press("Escape")

            _arm(page, plus=True)
            assert page.locator("#hopeLimit").is_hidden()
            assert page.locator("#hopeAllowance").is_hidden()
            assert page.evaluate("() => hopeAtDailyCap()") is False

            _arm(page, remaining=0, trial=False, checkout=False)
            nudge = page.inner_text("#hopeLimitNudge")
            assert "no daily limit with Hope" in nudge
            assert "7-day trial" not in nudge
            assert "See Hopewick Plus" in page.inner_text("#hopeLimit")

            assert errors == []
            browser.close()
    finally:
        httpd.shutdown()
