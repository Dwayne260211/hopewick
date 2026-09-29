#!/usr/bin/env python3
"""Free Hope daily limit: calm screen, remaining count, and crisis still gets through."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"
HOPE = ROOT / "server" / "hope-chat.js"


def test_static_hope_limit_copy():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    server = HOPE.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.23'" in text
    assert 'content="hopewick-v5.23"' in land
    assert 'id="hopeLimit"' in text
    assert "You’ve used your 5 free Hope messages for today" in text
    assert "They reset at midnight, Brisbane time." in text
    assert "Hopewick Plus has no daily limit with Hope." in text
    assert "A 3-day trial is there if you’d like to keep talking." in text
    assert "Crisis messages aren’t counted." in text
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
    assert "FREE_DAILY_DEFAULT = 5" in server
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
        "limit": 5,
        "trial": True,
        "checkout": True,
        "plus": False,
        "demo": False,
    }
    defaults.update(opts)
    page.evaluate(
        """(opts) => {
          isDemo = !!opts.demo;
          billingState.loaded = true;
          billingState.reachable = true;
          billingState.signedIn = true;
          billingState.plus = !!opts.plus;
          billingState.subscriptionStatus = opts.plus ? 'active' : 'none';
          billingState.hopeHosted = true;
          billingState.checkoutReady = !!opts.checkout;
          billingState.complimentary = false;
          billingState.founder = false;
          if (opts.plus) {
            billingState.hopeUsage = {
              day: '2026-09-29', used: 8, limit: null, remaining: null,
              plus: true, trialEligible: false, resetLabel: null,
            };
          } else {
            billingState.hopeUsage = {
              day: '2026-09-29',
              used: opts.limit - opts.remaining,
              limit: opts.limit,
              remaining: opts.remaining,
              plus: false,
              trialEligible: !!opts.trial,
              resetLabel: 'midnight, Brisbane time',
            };
          }
          syncHopeAllowance();
        }""",
        defaults,
    )


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
              return new Response(JSON.stringify({
                error: {
                  message: 'You’ve used your 5 free Hope messages for today. They reset at midnight, Brisbane time.',
                  code: 'daily_cap',
                },
                limit: 5,
                used: 5,
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
            assert page.locator("#hopeAllowance").inner_text() == "2 of 5 left today"
            assert page.locator("#hopeLimit").is_hidden()
            assert page.locator("#input").is_enabled()

            _install_fetch(page)
            page.fill("#input", "Can we talk about cravings?")
            page.click("#sendBtn")
            page.wait_for_selector("#hopeLimit:not([hidden])", timeout=10000)
            page.wait_for_function("() => !document.querySelector('.typing')")
            page.wait_for_function("() => document.getElementById('headerOrb').dataset.state !== 'thinking'")
            limit = page.inner_text("#hopeLimit")
            assert "You’ve used your 5 free Hope messages for today" in limit
            assert "They reset at midnight, Brisbane time." in limit
            assert "no daily limit with Hope" in limit
            assert "3-day trial" in limit
            assert "Crisis messages aren’t counted." in limit
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
            assert "Word for the day" in page.inner_text("#todayCard")
            assert page.locator("#appTabChat").is_visible()

            page.click("#appTabChat")
            page.wait_for_selector("#hopeLimit:not([hidden])")
            page.click("#hopeLimitPlus")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            account = page.inner_text("#accountDlg")
            assert "5 of 5 messages used today" in account
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
            assert "3-day trial" not in nudge
            assert "See Hopewick Plus" in page.inner_text("#hopeLimit")

            assert errors == []
            browser.close()
    finally:
        httpd.shutdown()
