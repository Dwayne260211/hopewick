#!/usr/bin/env python3
"""Plus gut-health and brain-habit notes: titles for Free, full cards for Plus."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"

GUT_TITLES = (
    "The gut and mood",
    "Serotonin and dopamine, carefully",
    "Probiotics and fermented foods",
    "Fibre, the everyday helper",
    "Stress, sleep, alcohol, and recovery",
    "When to talk to a GP or dietitian",
)
BRAIN_TITLES = (
    "The brain can change",
    "Why early recovery feels hard",
    "Small repeats matter",
    "Rest is part of the practice",
    "You do not have to walk it alone",
    "A humble note",
)
GUT_BODY = (
    "not a tank of mood medicine",
    "Some kombucha contains a little alcohol",
    "Skip gut detox kits",
)
BRAIN_BODY = (
    "The first walks are slow",
    "Those tools do not rewire you",
    "not brain training you must buy",
)


def _cards_source() -> str:
    text = APP.read_text(encoding="utf-8")
    return text.split("const GUT_CARDS = [", 1)[1].split("function syncEducationPlusPills", 1)[0]


def test_static_education_copy_and_gate():
    text = APP.read_text(encoding="utf-8")
    cards = _cards_source()
    assert "EDEN_BUILD = 'hopewick-v5.17'" in text
    assert "function openGut" in text
    assert "function openBrain" in text
    assert "function renderGut" in text
    assert "function renderBrain" in text
    assert 'id="gutLibrary" hidden' in text
    assert 'id="brainLibrary" hidden' in text
    assert 'id="gutSafety"' in text
    assert 'id="brainSafety"' in text
    assert "not medical advice" in text
    assert "Talk to a GP or dietitian" in text
    assert "not crisis support" in text
    assert "gut: { label: 'Open gut health'" in text
    assert "brain: { label: 'Open brain habits'" in text
    assert "Do not add gut or brain on a crisis reply." in text
    assert "Do not add plus, resume, bible, or nutrition on a crisis reply." in text
    assert 'id="appTabJournal"' in text
    assert 'id="appTabHome"' in text
    assert "data-need=\"gut\"" not in text
    assert "data-need=\"brain\"" not in text
    assert "id: 'nutrition'" not in text
    for title in GUT_TITLES + BRAIN_TITLES:
        assert title in cards
    for marker in GUT_BODY + BRAIN_BODY:
        assert marker in cards
    assert "Neuroplasticity is a long word" in cards
    assert "linked with mood, motivation, and the gut" in cards
    assert "yoghurt, kefir, sauerkraut, kimchi, and miso" in cards
    assert "Open SMART goals" in text
    assert not re.search(r"\b\d+\s*mg\b", cards, re.I)
    assert "clinically proven" not in cards.lower()
    assert "cures addiction" not in cards.lower()
    assert "treats addiction" not in cards.lower()
    # Education must not surface bring-your-own-key. That panel stays founder-only.
    gut_html = text.split('<dialog id="gutDlg"', 1)[1].split("</dialog>", 1)[0]
    brain_html = text.split('<dialog id="brainDlg"', 1)[1].split("</dialog>", 1)[0]
    for blob in (cards, gut_html, brain_html):
        low = blob.lower()
        assert "api key" not in low
        assert "use my own api key" not in low
        assert "add an api key" not in low
    side = re.search(r'<button[^>]*id="sideDeveloperBtn"[^>]*>.*?</button>', text, re.S)
    assert side and "hidden" in side.group(0)
    assert "function founderDeveloperVisible" in text
    assert "billingState.founder" in text
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'content="hopewick-v5.17"' in landing
    assert "Gut health and neuroplasticity notes — plain language, Plus only" in landing
    assert ">Gut health</h3>" in landing
    assert ">Brain habits</h3>" in landing
    assert "Nutrition notes — food, water, and supplements people ask about" in landing


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


def _assert_notes_not_in_dom(page, cards_id, markers):
    """Full cards must be absent from the DOM, not only visually hidden."""
    assert page.locator(f"{cards_id} article").count() == 0
    raw = page.locator(cards_id).text_content() or ""
    for marker in markers:
        assert marker not in raw


def _assert_hosted_chat_only(page):
    """Free and Plus use hosted Hope. Developer / own-key UI stays hidden."""
    assert page.locator("#sideDeveloperBtn").is_hidden()
    assert page.locator("#tabDeveloper").is_hidden()
    assert page.evaluate("() => document.getElementById('panelAdvanced').hidden") is True
    assert page.evaluate("() => !founderDeveloperVisible()") is True
    for dlg in ("#gutDlg", "#brainDlg", "#nutritionDlg", "#accountDlg"):
        if page.locator(dlg).count() == 0:
            continue
        text = (page.locator(dlg).text_content() or "").lower()
        assert "use my own api key" not in text
        assert "add an api key" not in text


def _open_side(page, target):
    page.click("#menuBtn")
    page.wait_for_selector("#sidebar", state="visible")
    button = page.locator(f'#sidebar [data-open="{target}"]')
    button.scroll_into_view_if_needed()
    button.click()


def test_education_plus_gate_phone():
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
            assert "Domestic" in nav
            assert page.locator('#needNow [data-need="gut"]').count() == 0
            assert page.locator('#needNow [data-need="brain"]').count() == 0
            assert page.locator('#needNow [data-need="nutrition"]').count() == 0
            assert page.locator('#needNow [data-need="bible"]').count() == 1
            assert page.evaluate("() => document.getElementById('gutPlusPill').hidden") is False
            assert page.evaluate("() => document.getElementById('brainPlusPill').hidden") is False
            _assert_hosted_chat_only(page)

            _open_side(page, "gut")
            page.wait_for_function("() => document.getElementById('gutDlg')?.open === true")
            free_gut = page.inner_text("#gutDlg")
            assert "General information only — not medical advice" in free_gut
            assert "Talk to a GP or dietitian" in free_gut
            assert "not the full notes" in free_gut
            for title in GUT_TITLES:
                assert title in free_gut
            for marker in GUT_BODY:
                assert marker not in free_gut
            assert page.locator("#gutLibrary").is_hidden()
            assert page.locator("#gutPlusBtn").is_visible()
            _assert_notes_not_in_dom(page, "#gutCards", GUT_BODY)
            page.click("#gutPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            account = page.inner_text("#accountDlg")
            assert "gut health and neuroplasticity" in account.lower()
            assert "Nutrition notes" in account
            assert "Nutrition notes" in account
            _assert_hosted_chat_only(page)
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")

            _open_side(page, "brain")
            page.wait_for_function("() => document.getElementById('brainDlg')?.open === true")
            free_brain = page.inner_text("#brainDlg")
            assert "General information only — not medical advice" in free_brain
            assert "not the full notes" in free_brain
            for title in BRAIN_TITLES:
                assert title in free_brain
            for marker in BRAIN_BODY:
                assert marker not in free_brain
            assert page.locator("#brainLibrary").is_hidden()
            assert page.locator("#brainPlusBtn").is_visible()
            _assert_notes_not_in_dom(page, "#brainCards", BRAIN_BODY)
            assert page.locator('#brainDlg button:has-text("Open SMART goals")').count() == 0
            assert page.locator('#brainDlg button:has-text("Open journal")').count() == 0
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('brainDlg')?.open !== true")

            page.evaluate(
                """() => {
                  billingState.signedIn = true;
                  billingState.plus = true;
                  billingState.founder = false;
                  renderGut();
                  renderBrain();
                  syncEducationPlusPills();
                  syncNutritionPlusPill();
                  syncDeveloperChrome();
                }"""
            )
            assert page.evaluate("() => document.getElementById('gutPlusPill').hidden") is True
            assert page.evaluate("() => document.getElementById('brainPlusPill').hidden") is True
            _assert_hosted_chat_only(page)

            _open_side(page, "gut")
            page.wait_for_function("() => document.getElementById('gutDlg')?.open === true")
            page.wait_for_selector('#gutLibrary:not([hidden]) article[data-edu="probiotics"]')
            plus_gut = page.locator("#gutDlg").text_content()
            for marker in GUT_BODY:
                assert marker in plus_gut
            assert "kefir" in plus_gut
            assert "Talk to a GP or dietitian" in plus_gut
            assert page.locator("#gutGate").is_hidden()
            page.keyboard.press("Escape")

            _open_side(page, "brain")
            page.wait_for_function("() => document.getElementById('brainDlg')?.open === true")
            page.wait_for_selector('#brainLibrary:not([hidden]) article[data-edu="support"]')
            plus_brain = page.locator("#brainDlg").text_content()
            for marker in BRAIN_BODY:
                assert marker in plus_brain
            assert "Neuroplasticity" in plus_brain
            assert page.locator("#brainGate").is_hidden()
            page.click('#brainDlg button:has-text("Open SMART goals")')
            page.wait_for_function("() => document.getElementById('goalsDlg')?.open === true")
            assert "SMART goals" in page.inner_text("#goalsDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('goalsDlg')?.open !== true")

            _open_side(page, "brain")
            page.wait_for_selector('#brainDlg[open] button:has-text("Open journal")')
            page.click('#brainDlg button:has-text("Open journal")')
            page.wait_for_selector("#journalView:not([hidden])")
            assert page.locator("#appTabJournal").get_attribute("aria-current") == "page"
            assert "Journal" in page.inner_text("#journalTitle")

            page.click("#appTabHome")
            page.wait_for_selector("#needNow")
            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert "SOAP" in page.inner_text("#bibleDlg")
            page.keyboard.press("Escape")

            _open_side(page, "nutrition")
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            nut = page.locator("#nutritionDlg").text_content()
            assert "General information only — not medical advice" in nut
            assert "Benefit" in nut
            assert "Fish oil / omega-3" in nut
            page.keyboard.press("Escape")

            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "Can you explain gut health and probiotics?")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="gut"]', timeout=10000)
            page.click('#hopeGateway button[data-hope-tool="gut"]')
            page.wait_for_function("() => document.getElementById('gutDlg')?.open === true")
            assert "sauerkraut" in page.inner_text("#gutDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "How does neuroplasticity and a new habit work?")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="brain"]', timeout=10000)
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "I want to die and I also want gut health notes")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card")
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="gut"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="brain"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="nutrition"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="plus"]').count() == 0
            page.wait_for_function("() => !busy", timeout=20000)

            page.click("#appTabHome")
            page.wait_for_selector("#todayCard")
            assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
            browser.close()
    finally:
        httpd.shutdown()
