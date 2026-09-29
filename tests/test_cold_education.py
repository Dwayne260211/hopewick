#!/usr/bin/env python3
"""Plus ice-bath and recovery-spa notes: titles for Free, full cards for Plus."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"

COLD_TITLES = (
    "Why this rarely comes up",
    "A new path, not a cure",
    "What research has explored",
    "Recovery spas and contrast therapy",
    "Not for everyone",
    "Not a substitute for treatment",
)
COLD_BODY = (
    "Tipton and colleagues",
    "Yankouskaya and colleagues",
    "Bleakley and Davison",
    "does not endorse a venue",
    "It is not a cure for addiction",
    "Open Brain habits if you want that idea",
)


def _cold_source() -> str:
    text = APP.read_text(encoding="utf-8")
    return text.split("const COLD_CARDS = [", 1)[1].split("function syncEducationPlusPills", 1)[0]


def test_static_cold_education_copy_and_gate():
    text = APP.read_text(encoding="utf-8")
    cards = _cold_source()
    assert "EDEN_BUILD = 'hopewick-v5.26'" in text
    assert "function openCold" in text
    assert "function renderCold" in text
    assert 'id="coldLibrary" hidden' in text
    assert 'id="coldSafety"' in text
    assert 'id="sideColdBtn"' in text
    assert 'data-open="cold"' in text
    assert 'data-need="cold"' not in text
    assert "cold: { label: 'Open ice baths & spas'" in text
    assert "Do not add cold on a crisis reply." in text
    assert "Do not add gut or brain on a crisis reply." in text
    assert "not medical advice" in text
    assert "Talk to a GP before you try cold water or a recovery spa." in text
    assert "not a substitute for treatment" in text
    assert "blood-pressure problem" in text
    assert "while intoxicated" in text
    assert "chest pain" in text
    for title in COLD_TITLES:
        assert title in cards
    for marker in COLD_BODY:
        assert marker in cards
    assert "As of 2026" in cards
    assert "2017 review in Experimental Physiology" in cards
    assert "small 2023 study in the journal Biology" in cards
    assert "2010 review in the British Journal of Sports Medicine" in cards
    assert "2013 review in PLoS ONE" in cards
    assert "Brain habits" in cards
    assert "high risk of bias" in cards
    assert "into a how-to" in cards
    assert "°" not in cards
    assert "minutes" not in cards.lower()
    assert "degrees" not in cards.lower()
    assert not re.search(r"\b\d+\s*mg\b", cards, re.I)
    assert not re.search(r"\b\d+\s*(?:°|degrees|minutes|mins)\b", cards, re.I)
    low = cards.lower()
    assert "clinically proven" not in low
    assert "cures addiction" not in low
    assert "treats addiction" not in low
    assert "api key" not in low
    cold_html = text.split('<dialog id="coldDlg"', 1)[1].split("</dialog>", 1)[0]
    assert "not a how-to" in cold_html
    html_low = cold_html.lower()
    assert "not medical advice" in html_low
    assert "talk to a gp" in html_low
    assert "chest pain" in html_low
    assert "pregnant" in html_low or "pregnancy" in html_low
    assert "api key" not in html_low
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'content="hopewick-v5.26"' in landing
    assert ">Ice baths &amp; recovery spas</h3>" in landing
    assert "Ice baths and recovery spa notes — plain language, Plus only" in landing
    assert "Gut health and neuroplasticity notes — plain language, Plus only" in landing


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _enter_demo(page, base):
    page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
    page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
    page.click("#launchPrefsContinue")
    page.wait_for_selector("#needNow", timeout=10000)


def _open_side(page, target):
    page.click("#menuBtn")
    page.wait_for_selector("#sidebar", state="visible")
    button = page.locator(f'#sidebar [data-open="{target}"]')
    button.scroll_into_view_if_needed()
    button.click()


def test_cold_education_plus_gate_phone():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            _enter_demo(page, base)

            nav = page.inner_text("#bottomNav")
            assert "Home" in nav and "Chat" in nav and "Journal" in nav and "More" in nav
            assert page.locator('#needNow [data-need="cold"]').count() == 0
            assert page.locator('#appTabHome').count() == 1
            assert page.evaluate("() => document.getElementById('coldPlusPill').hidden") is False

            _open_side(page, "cold")
            page.wait_for_function("() => document.getElementById('coldDlg')?.open === true")
            free = page.inner_text("#coldDlg")
            assert "General information only — not medical advice" in free
            assert "Talk to a GP" in free
            assert "chest pain" in free
            assert "not a substitute for treatment" in free.lower()
            assert "not the full notes" in free
            assert "Start 3-day free trial" in free
            for title in COLD_TITLES:
                assert title in free
            for marker in COLD_BODY:
                assert marker not in free
            assert page.locator("#coldLibrary").is_hidden()
            assert page.locator("#coldPlusBtn").is_visible()
            assert page.locator("#coldCards article").count() == 0
            assert page.locator('#coldDlg button:has-text("Open brain habits")').count() == 0
            page.click("#coldPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            account = page.inner_text("#accountDlg")
            assert "Ice baths and recovery spa notes — plain language, Plus only" in account
            assert "5 messages/day" in account
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('coldDlg')?.open !== true")

            page.evaluate(
                """() => {
                  billingState.signedIn = true;
                  billingState.plus = true;
                  billingState.founder = false;
                  renderCold();
                  syncEducationPlusPills();
                }"""
            )
            assert page.evaluate("() => document.getElementById('coldPlusPill').hidden") is True

            _open_side(page, "cold")
            page.wait_for_function("() => document.getElementById('coldDlg')?.open === true")
            page.wait_for_selector('#coldLibrary:not([hidden]) article[data-edu="research"]')
            plus = page.locator("#coldDlg").text_content()
            for marker in COLD_BODY:
                assert marker in plus
            assert "As of 2026" in plus
            assert "Talk to a GP" in plus
            assert page.locator("#coldGate").is_hidden()
            assert "°" not in plus
            page.click('#coldDlg button:has-text("Open brain habits")')
            page.wait_for_function("() => document.getElementById('brainDlg')?.open === true")
            assert "Brain habits" in page.inner_text("#brainDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('brainDlg')?.open !== true")

            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "What does research say about ice baths and recovery spas?")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="cold"]', timeout=10000)
            page.click('#hopeGateway button[data-hope-tool="cold"]')
            page.wait_for_function("() => document.getElementById('coldDlg')?.open === true")
            assert "Yankouskaya and colleagues" in page.inner_text("#coldDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "I want to die and I also want an ice bath")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card")
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="cold"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="brain"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="plus"]').count() == 0
            page.wait_for_function("() => !busy", timeout=20000)

            matched = page.evaluate(
                """() => ({
                  ice: hopeGatewayIds({ messages: [{ role: 'user', content: 'Tell me about ice baths' }] }),
                  spa: hopeGatewayIds({ messages: [{ role: 'user', content: 'Is a recovery spa worth it?' }] }),
                  contrast: hopeGatewayIds({ messages: [{ role: 'user', content: 'What is contrast therapy?' }] }),
                  cold: hopeGatewayIds({ messages: [{ role: 'user', content: 'I feel cold today' }] }),
                  crisis: hopeGatewayIds({ messages: [{ role: 'user', content: 'I want to die and try a cold plunge', crisis: true }] }),
                })"""
            )
            assert "cold" in matched["ice"]
            assert "cold" in matched["spa"]
            assert "cold" in matched["contrast"]
            assert "cold" not in matched["cold"]
            assert matched["crisis"] == ["help"]

            nav_after = page.inner_text("#bottomNav")
            assert "Home" in nav_after and "Chat" in nav_after and "More" in nav_after
            assert "Ice baths" not in nav_after
            browser.close()
    finally:
        httpd.shutdown()
