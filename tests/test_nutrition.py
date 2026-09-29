#!/usr/bin/env python3
"""Hopewick Plus nutrition notes: library for Plus, upgrade path for Free, crisis untouched."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session
APP = ROOT / "app" / "index.html"

DISCLAIMER = (
    "This section is for education, not individual medical advice. "
    "Your health, medications and recovery are individual. "
    "Some supplements, compounds and major dietary changes can interact with medicines or medical conditions, "
    "so speak with an appropriate health professional when that applies to you."
)
FOUNDER = (
    "During my own recovery I became willing to experiment with things I had never considered before, "
    "from changing the way I ate to exploring supplements and other approaches. "
    "Not everything I tried will be right for everyone, and my experience isn’t medical evidence. "
    "What mattered was that I stopped neglecting myself and started becoming curious about what helped me rebuild."
)
PLUS_ONLY = (
    "Findings are mixed",
    "Fish-oil capsules are a supplement form",
    "Slip, Slop, Slap",
    "Hopewick does not give a dose",
    "serotonin syndrome",
    "Therapeutic Goods Administration",
)
CATEGORIES = (
    "Rebuild the basics",
    "Explore",
    "What the evidence says",
    "Things to consider",
    "Questions for your GP or pharmacist",
    "My experiment",
)


def _library_source() -> str:
    import json
    lib = json.loads((ROOT / "server" / "library" / "education.json").read_text(encoding="utf-8"))
    return json.dumps({"categories": lib["nutritionCategories"], "cards": lib["nutritionCards"]})


def test_static_nutrition_copy_and_gate():
    text = APP.read_text(encoding="utf-8")
    library = _library_source()
    dlg = text.split('<dialog id="nutritionDlg"', 1)[1].split("</dialog>", 1)[0]
    assert "function renderNutrition" in text
    assert "function openNutrition" in text
    assert "function renderNutritionExperiment" in text
    assert 'id="nutritionLibrary" hidden' in text
    assert 'id="nutritionSafety"' in text
    assert 'id="nutritionDisclaimer"' in text
    assert dlg.count(DISCLAIMER) == 1
    assert "before you start anything" not in dlg
    assert "before you start anything" not in library
    assert "Talk to a GP or pharmacist before you start" not in text
    assert FOUNDER in dlg
    assert "From the founder — personal experience, not evidence" in dlg
    assert "Recovery gave me permission to try things differently." in dlg
    assert "You do not have to keep living in the same body routines that existed during addiction." in dlg
    assert "13 11 26" in dlg
    assert "not crisis support" in dlg
    assert "Alcohol and benzodiazepine withdrawal" in dlg
    assert "data-nutrition-category" in text
    assert "nutExpChanged" in text
    assert "What I changed" in text
    assert "Why I tried it" in text
    assert "How I felt" in text
    assert "Side effects" in text
    assert "Will I continue?" in text
    assert "eden.p.<id>.nutrition" in text
    for category in CATEGORIES:
        assert category in text
    card_stub = text.split("const NUTRITION_CARDS = [", 1)[1].split("];", 1)[0]
    for marker in PLUS_ONLY:
        assert marker in library
        assert marker not in card_stub
    assert "NAC (N-acetylcysteine)" in library
    assert "Fish oil / omega-3" in library
    assert "Vitamin D" in library
    assert "Magnesium" in library
    assert "Ashwagandha" in library
    assert "Methylene blue" in library
    assert "not an ordinary wellness supplement" in library
    assert "Ketogenic and carnivore diets" in library
    assert "You do not need to follow either diet" in library
    assert "Fruit, vegetables, and fibre" in library
    assert "thiamine" in library.lower()
    assert "What it is" in library
    assert "What the evidence says" in library
    assert "Things to consider" in library
    assert "not a treatment for addiction" in library
    for marker in PLUS_ONLY:
        assert marker in library
    assert "nutrition: { label: 'Open nutrition'" in text
    assert "id: 'nutrition'" not in text  # Home chips stay as they are; today’s reading stays up
    assert "Do not add plus, resume, bible, or nutrition on a crisis reply." in text
    assert "methylene blue" in text.lower()
    assert not re.search(r"\b\d+\s*mg\b", library, re.I)
    assert "clinically proven" not in library.lower()
    assert "cures addiction" not in library.lower()
    assert "treats addiction" not in library.lower()
    assert "dwaynesimons1990@gmail.com" not in text
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Nutrition notes — rebuild the basics, and explore food and supplements with clear evidence" in landing
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

            assert page.locator('#needNow [data-need="nutrition"]').count() == 0
            assert page.locator('#needNow [data-need="help"]').count() == 1
            assert page.locator('#needNow [data-need="dv"]').count() == 1
            heading_box = page.locator("#todayHeading").bounding_box()
            assert heading_box is not None and heading_box["y"] < 520
            assert page.evaluate("() => document.getElementById('nutritionPlusPill').hidden") is False
            assert page.locator("#sideDeveloperBtn").is_hidden()

            page.click("#menuBtn")
            page.wait_for_selector("#sidebar", state="visible")
            page.click('#sidebar [data-open="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            free_text = page.inner_text("#nutritionDlg")
            assert "Education, not individual medical advice" in free_text
            assert DISCLAIMER in free_text
            assert free_text.count(DISCLAIMER) == 1
            assert FOUNDER in free_text
            assert "13 11 26" in free_text
            assert "not the full library" in free_text
            assert "NAC (N-acetylcysteine)" in free_text
            assert "Rebuild the basics" in free_text
            assert "My experiment" in free_text
            for marker in PLUS_ONLY:
                assert marker not in free_text
            assert page.locator("#nutritionLibrary").is_hidden()
            assert page.locator("#nutritionPlusBtn").is_visible()

            page.click("#nutritionPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            assert "Hopewick Plus" in page.inner_text("#accountDlg")
            assert "Nutrition notes" in page.inner_text("#accountDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")

            grant_server_session(page, plus=True, founder=False)
            page.evaluate("() => { renderNutrition(); syncNutritionPlusPill(); }")
            assert page.evaluate("() => document.getElementById('nutritionPlusPill').hidden") is True
            page.click("#menuBtn")
            page.wait_for_selector("#sidebar", state="visible")
            page.click('#sidebar [data-open="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            page.wait_for_selector('#nutritionLibrary:not([hidden]) article[data-card="nac"]')
            plus_text = page.locator("#nutritionDlg").text_content() or ""
            assert plus_text.count(DISCLAIMER) == 1
            assert "What it is" in plus_text
            assert "What the evidence says" in plus_text
            assert "Things to consider" in plus_text
            assert "My experiment" in plus_text
            for marker in PLUS_ONLY:
                assert marker in plus_text
            assert "not a treatment for addiction" in plus_text
            assert page.locator("#nutritionGate").is_hidden()
            assert not re.search(r"\b\d+\s*mg\b", plus_text, re.I)

            page.click('[data-nutrition-category="basics"]')
            page.wait_for_selector('article[data-card="basics-plants"]')
            assert page.locator('article[data-card="nac"]').count() == 0
            plants = page.inner_text('article[data-card="basics-plants"]').lower()
            assert "vegetable" in plants
            assert "pharmacist" not in plants
            assert "gp" not in plants
            assert "before you start" not in plants

            page.click('[data-nutrition-category="explore"]')
            page.wait_for_selector('article[data-card="nac"]')
            page.wait_for_selector('article[data-card="fish-oil"]')
            page.wait_for_selector('article[data-card="methylene-blue"]')
            assert page.locator('article[data-card="basics-plants"]').count() == 0
            nac_text = page.inner_text('article[data-card="nac"]')
            assert "Findings are mixed" in nac_text
            assert "thiamine" not in nac_text.lower()
            vitamins = page.inner_text('article[data-card="vitamins"]').lower()
            assert "thiamine" in vitamins
            blue = page.inner_text('article[data-card="methylene-blue"]')
            assert "not an ordinary wellness supplement" in blue
            assert "serotonin syndrome" in blue
            assert "Hopewick does not give a dose" in blue
            assert not re.search(r"\b\d+\s*mg\b", blue, re.I)
            diets = page.inner_text('article[data-card="restrictive-diets"]')
            assert "You do not need to follow either diet" in diets
            assert "carnivore" in diets.lower()

            page.click('[data-nutrition-category="questions"]')
            questions = page.inner_text('[data-nutrition-group="questions"]')
            assert "Questions you can take to a GP, pharmacist, or dietitian." in questions
            assert "?" in questions
            assert "thiamine" in questions.lower()

            page.click('[data-nutrition-category="consider"]')
            consider = page.inner_text('[data-nutrition-group="consider"]')
            assert "benzodiazepine" in consider.lower()
            assert "serotonin syndrome" in consider.lower()

            page.click('[data-nutrition-category="experiment"]')
            page.wait_for_selector("#nutExpChanged")
            page.fill("#nutExpChanged", "Added eggs at breakfast")
            page.fill("#nutExpWhy", "I was skipping food")
            page.fill("#nutExpFelt", "Steadier before noon")
            page.fill("#nutExpEffects", "None")
            page.select_option("#nutExpKeep", "keep")
            page.click("#nutExpSave")
            page.wait_for_selector('#nutritionExperimentList article')
            saved = page.inner_text("#nutritionExperimentList")
            assert "Added eggs at breakfast" in saved
            assert "Steadier before noon" in saved
            assert "Keep it" in saved
            assert "This demo visit only" in page.inner_text("#nutritionExperimentSaved")
            assert page.evaluate("() => localStorage.getItem('eden.p.demo.nutrition')") is None

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
