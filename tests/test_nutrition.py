#!/usr/bin/env python3
"""Hopewick Plus nutrition notes: library for Plus, upgrade path for Free, crisis untouched."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"

LIBRARY_MARKERS = (
    "Findings are mixed",
    "Fish-oil capsules are a supplement form",
    "Slip, Slop, Slap",
    "Hopewick does not give a dose",
    "Hopewick does not recommend a dose or a brand",
)


def _library_source() -> str:
    text = APP.read_text(encoding="utf-8")
    return text.split("const NUTRITION_LIBRARY = [", 1)[1].split("const NUTRITION_TOPICS = [", 1)[0]


def test_static_nutrition_copy_and_gate():
    text = APP.read_text(encoding="utf-8")
    library = _library_source()
    assert "function renderNutrition" in text
    assert "function openNutrition" in text
    assert 'id="nutritionLibrary" hidden' in text
    assert 'id="nutritionSafety"' in text
    assert "not medical advice" in text
    assert "Talk to a GP or pharmacist" in text
    assert "13 11 26" in text
    assert "not crisis support" in text
    assert "NAC (N-acetylcysteine)" in library
    assert "Fish oil / omega-3" in library
    assert "Vitamin D" in library
    assert "B-complex" in library
    assert "Magnesium" in library
    assert "Multivitamin" in library
    assert "Vitamin-rich foods" in library
    assert "Hydration" in library
    assert "What it is" in text
    assert "Why people in recovery often look at it" in text
    assert "Practical notes" in text
    assert "nutrition: { label: 'Open nutrition'" in text
    assert "data-need=\"nutrition\"" in text or "id: 'nutrition'" in text
    assert "Do not add plus, resume, bible, or nutrition on a crisis reply." in text
    for marker in LIBRARY_MARKERS:
        assert marker in library
    # No supplement doses and no therapeutic-advertising claims in the notes.
    assert not re.search(r"\b\d+\s*mg\b", library, re.I)
    assert "clinically proven" not in library.lower()
    assert "cures addiction" not in library.lower()
    assert "treats addiction" not in library.lower()
    assert "dwaynesimons1990@gmail.com" not in text
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Nutrition notes — food, water, and supplements people ask about" in landing
    assert "Essential support stays free" in landing


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


def test_nutrition_plus_free_and_crisis():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            _enter_demo(page, base)

            assert page.locator('#needNow [data-need="nutrition"]').count() == 1
            assert page.locator('#needNow [data-need="help"]').count() == 1
            assert page.locator('#needNow [data-need="dv"]').count() == 1
            assert page.locator("#nutritionPlusPill").is_visible()
            assert page.locator("#sideDeveloperBtn").is_hidden()

            page.click('#needNow [data-need="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            free_text = page.inner_text("#nutritionDlg")
            assert "General information only — not medical advice" in free_text
            assert "Talk to a GP or pharmacist" in free_text
            assert "13 11 26" in free_text
            assert "not the full library" in free_text
            assert "NAC (N-acetylcysteine)" in free_text
            for marker in LIBRARY_MARKERS:
                assert marker not in free_text
            assert page.locator("#nutritionLibrary").is_hidden()
            assert page.locator("#nutritionPlusBtn").is_visible()

            page.click("#nutritionPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            assert "Hopewick Plus" in page.inner_text("#accountDlg")
            assert "Nutrition notes" in page.inner_text("#accountDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")

            page.evaluate(
                """() => {
                  billingState.signedIn = true;
                  billingState.plus = true;
                  renderNutrition();
                  syncNutritionPlusPill();
                }"""
            )
            page.click('#needNow [data-need="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            page.wait_for_selector('#nutritionLibrary:not([hidden])')
            plus_text = page.inner_text("#nutritionDlg")
            assert "What it is" in plus_text
            assert "Why people in recovery often look at it" in plus_text
            assert "Practical notes" in plus_text
            for marker in LIBRARY_MARKERS:
                assert marker in plus_text
            assert "not a treatment for addiction" in plus_text
            assert page.locator("#nutritionGate").is_hidden()
            assert page.locator("#nutritionPlusPill").is_hidden()
            assert not re.search(r"\b\d+\s*mg\b", plus_text, re.I)
            page.select_option("#nutritionSelect", "alcohol")
            assert "thiamine" in page.inner_text("#nutritionPanel").lower()
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open !== true")

            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "What about NAC and fish oil?")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="nutrition"]', timeout=10000)
            assert page.locator('#hopeGateway button[data-hope-tool="help"]').count() == 0
            page.click('#hopeGateway button[data-hope-tool="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            assert "Fish oil / omega-3" in page.inner_text("#nutritionDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "my partner is hurting me and I also want NAC")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card")
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="nutrition"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="plus"]').count() == 0
            assert "1800RESPECT" in page.inner_text(".crisis-card")
            page.wait_for_function("() => !busy", timeout=20000)

            page.click("#appTabHome")
            page.wait_for_selector("#needNow")
            page.click('#needNow [data-need="dv"]')
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800 737 732" in page.inner_text("#dvView")
            page.click("#appTabHome")
            page.wait_for_selector("#todayCard")
            page.click('#needNow [data-need="help"]')
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "Domestic & family violence" not in page.inner_text("#helpDlg")
            browser.close()
    finally:
        httpd.shutdown()
