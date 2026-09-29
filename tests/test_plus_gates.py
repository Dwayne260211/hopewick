#!/usr/bin/env python3
"""Phone-width Free vs Plus gates: journal, SMART goals, resume, nutrition."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _grant_plus(page, on):
    grant_server_session(page, plus=bool(on), founder=False, status='trialing' if on else 'none')


def test_phone_gates_free_then_plus():
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
            page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#needNow", timeout=10000)

            assert page.locator("#sideDeveloperBtn").is_hidden()
            assert page.evaluate("() => subscriptionPlus()") is False
            today = page.locator("#todayCard").text_content()
            assert "Word for the day" in today
            assert "Just for today" in today

            page.click("#appTabDv")
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800 737 732" in page.inner_text("#dvView")
            assert page.locator("#journalGate").count() == 1

            page.click("#appTabJournal")
            page.wait_for_selector("#journalView:not([hidden])")
            assert page.locator("#journalWorkspace").is_hidden()
            assert page.locator("#jBody").is_hidden()
            assert page.locator("#journalPlusBtn").is_visible()
            journal = page.inner_text("#journalView")
            assert "Start 3-day free trial" in journal
            assert "part of Hopewick Plus" in journal
            overflow = page.evaluate(
                """() => ({
                  sw: document.documentElement.scrollWidth,
                  cw: document.documentElement.clientWidth,
                })"""
            )
            assert overflow["sw"] <= overflow["cw"] + 1

            page.click("#journalPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            account = page.inner_text("#accountDlg")
            assert "3 days free, then AU$20" in account
            assert "15 messages/day" in account
            assert "No daily limit" in account
            assert "No daily message limit" in account
            assert "200 messages/day" not in account
            assert "SMART goals" in account
            assert "Resume builder" in account
            assert "Nutrition notes" in account
            assert "gut health and neuroplasticity" in account.lower()
            assert "Essential support stays free" in account
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")

            page.click("#appTabHome")
            page.wait_for_selector("#needNow")
            page.click('#needNow [data-need="resume"]')
            page.wait_for_selector("#resumeView:not([hidden])")
            assert page.locator("#resumeBuilder").is_hidden()
            assert page.locator("#resumeName").is_hidden()
            assert page.locator("#resumePlusBtn").is_visible()
            assert "part of Hopewick Plus" in page.inner_text("#resumeView")
            resume_overflow = page.evaluate(
                """() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"""
            )
            assert resume_overflow is True

            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            assert page.evaluate("() => document.getElementById('nutritionPlusPill').hidden") is False
            assert page.evaluate("() => document.getElementById('goalsPlusPill').hidden") is False
            assert page.evaluate("() => document.getElementById('resumeSidePlusPill').hidden") is False
            page.click("#sideGoalsBtn")
            page.wait_for_function("() => document.getElementById('goalsDlg')?.open === true")
            assert page.locator("#goalsEditor").is_hidden()
            assert page.locator("#goalCard0").count() == 0
            assert "not a SMART Recovery meeting" in page.inner_text("#goalsIntro")
            page.keyboard.press("Escape")

            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            page.click('#sidebar [data-open="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            assert page.locator("#nutritionLibrary").is_hidden()
            nut = page.inner_text("#nutritionDlg")
            assert "not the full library" in nut
            assert "stay Plus-only" in nut
            assert "Findings are mixed" not in nut
            page.keyboard.press("Escape")

            page.click("#appTabHome")
            page.wait_for_selector("#needNow")
            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert page.locator("#bibleSoapPanel").is_visible()
            page.keyboard.press("Escape")

            page.click("#helpBtn")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "1800 250 015" in page.inner_text("#helpDlg")
            page.keyboard.press("Escape")

            _grant_plus(page, True)
            page.click("#appTabJournal")
            page.evaluate("() => { syncJournalGate(); renderJournalList(); }")
            page.wait_for_selector("#journalWorkspace:not([hidden])")
            assert page.locator("#journalGate").is_hidden()
            page.fill("#jBody", "A line for today")
            page.click("#jSaveBtn")
            assert "A line for today" in page.inner_text("#journalList")

            page.evaluate("() => setAppTab('resume')")
            page.wait_for_selector("#resumeBuilder:not([hidden])")
            assert page.locator("#resumeGate").is_hidden()
            page.fill("#resumeName", "Sam Lee")
            assert page.locator("#resumePreview").inner_text().find("Sam Lee") != -1

            page.evaluate("() => { openGoals(); }")
            page.wait_for_selector("#goalCard0")
            assert page.locator("#goalsGate").is_hidden()
            assert "Specific" in page.inner_text("#goalCard0")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('goalsDlg')?.open !== true")

            page.evaluate("() => openNutrition()")
            page.wait_for_selector("#nutritionLibrary:not([hidden])")
            assert page.locator("#nutritionGate").is_hidden()
            page.keyboard.press("Escape")

            _grant_plus(page, False)
            page.evaluate("() => { setAppTab('journal'); }")
            assert page.locator("#journalWorkspace").is_hidden()
            assert page.locator("#journalPlusBtn").is_visible()
            assert not errors, errors
            browser.close()
    finally:
        httpd.shutdown()
