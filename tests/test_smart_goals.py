#!/usr/bin/env python3
"""SMART goals and the journal tab. The editor and full journal need Hopewick Plus."""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session
APP = ROOT / "app" / "index.html"


def test_static_goals_and_journal_nav():
    text = APP.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in text
    assert "function openGoals" in text
    assert "function weekStartSunday" in text
    assert "eden.p.<id>.goals" in text
    assert 'id="goalsDlg"' in text
    assert 'id="sideGoalsBtn"' in text
    assert "Open SMART goals" in text
    assert "not a SMART Recovery meeting" in text
    assert 'id="appTabJournal"' in text
    assert 'id="journalView"' in text
    assert 'id="sideInfoBtn"' in text
    assert 'id="appTabDv"' in text
    assert 'id="helpBtn"' in text
    # SMART goals are not a Home chip. Today's reading stays.
    home_chips = text.split("function needNowEl", 1)[1].split("function renderHome", 1)[0]
    assert "goals" not in home_chips
    assert "Today’s reading" in home_chips
    assert "data-need=\"bible\"" in text or "id: 'bible'" in text
    # Plus gates that must stay put.
    assert "function profileAddAllowed" in text
    assert "Add a profile is part of Hopewick Plus" in text
    assert "function openNutrition" in text
    assert "nutritionLibrary" in text
    assert 'id="goalsGate"' in text
    assert 'id="journalGate"' in text
    assert 'id="resumeGate"' in text
    assert "SMART goals are part of Hopewick Plus" in text
    assert "The journal is part of Hopewick Plus" in text
    assert "gut health and neuroplasticity" in text.lower()
    assert "Start 3-day free trial" in text


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _dismiss_disclaimer(page):
    if page.locator("#disclaimerDlg[open]").count():
        page.click("#discOkBtn")
        page.wait_for_function("() => document.getElementById('disclaimerDlg').open !== true")


def test_smart_goals_journal_nav_and_guards():
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

            nav = " ".join(page.inner_text("#bottomNav").split())
            assert nav.split()[0:5] == ["Home", "Chat", "Domestic", "&", "family"] or "Journal" in nav
            assert "Home" in nav and "Chat" in nav and "Journal" in nav and "More" in nav
            assert "Safety" in nav
            assert "News" not in nav
            assert page.is_visible("#helpBtn")
            assert page.locator('#needNow [data-need="goals"]').count() == 0
            for need in ("help", "dv", "craving", "chat", "today", "journal", "bible", "resume", "meeting"):
                assert page.locator(f'#needNow [data-need="{need}"]').count() == 1, need

            # Journal tab stays. Free sees the trial screen, not the editor.
            page.click("#appTabJournal")
            page.wait_for_selector("#journalView:not([hidden])")
            assert page.locator("#appTabJournal").get_attribute("aria-current") == "page"
            assert page.locator("#homeView").is_hidden()
            assert "Journal" in page.inner_text("#journalTitle")
            assert page.locator("#journalWorkspace").is_hidden()
            assert page.locator("#journalPlusBtn").is_visible()
            assert "part of Hopewick Plus" in page.inner_text("#journalView")
            assert "3 days free" in page.inner_text("#journalGate")

            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            page.click("#sideInfoBtn")
            page.wait_for_selector("#infoView:not([hidden])")
            assert "News & resources" in page.inner_text("#infoView")
            assert "QuIVAA" in page.inner_text("#infoView")
            assert page.locator("#journalView").is_hidden()
            assert page.locator("#sideInfoBtn").get_attribute("aria-current") == "page"

            page.click("#appTabDv")
            page.wait_for_selector("#dvView:not([hidden])")
            assert page.locator("#appTabDv").get_attribute("aria-current") == "page"
            assert "1800 737 732" in page.inner_text("#dvView")
            assert page.is_hidden("#infoView")

            page.click("#appTabHome")
            page.wait_for_selector("#needNow")
            page.click("#helpBtn")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "1800 250 015" in page.inner_text("#helpDlg")
            page.keyboard.press("Escape")

            # Bible chip still opens SOAP, and does not fall through to Home as a tab.
            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert page.locator("#bibleSoapPanel").is_visible()
            assert page.evaluate("() => appTab") == "home"
            page.keyboard.press("Escape")

            # Nutrition stays Plus-gated for a free visit.
            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            assert page.evaluate("() => document.getElementById('nutritionPlusPill').hidden") is False
            page.click('#sidebar [data-open="nutrition"]')
            page.wait_for_function("() => document.getElementById('nutritionDlg')?.open === true")
            assert page.locator("#nutritionLibrary").is_hidden()
            assert page.locator("#nutritionPlusBtn").is_visible()
            page.keyboard.press("Escape")

            # Hope: SMART goals and SMART Recovery meetings are different buttons.
            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "Find a SMART Recovery meeting")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="meetings"]', timeout=15000)
            assert page.locator('#hopeGateway button[data-hope-tool="goals"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="meetings"]').inner_text() == "Find a meeting"
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "Please help me set a SMART goal for this week")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="goals"]', timeout=15000)
            assert page.locator('#hopeGateway button[data-hope-tool="goals"]').inner_text() == "Open SMART goals"
            assert page.locator('#hopeGateway button[data-hope-tool="meetings"]').count() == 0
            page.click('#hopeGateway button[data-hope-tool="goals"]')
            page.wait_for_function("() => document.getElementById('goalsDlg')?.open === true")
            intro = page.inner_text("#goalsIntro")
            assert "not a SMART Recovery meeting" in intro
            assert "Find a meeting" in intro
            assert page.evaluate("() => subscriptionPlus()") is False
            assert page.locator("#goalsEditor").is_hidden()
            assert page.locator("#goalCard0").count() == 0
            assert page.locator("#goalsPlusBtn").is_visible()
            gate = page.inner_text("#goalsGate")
            assert "Specific" in gate
            assert "Measurable" in gate
            assert "Achievable" in gate
            assert "Relevant" in gate
            assert "Time-bound" in gate
            assert "part of Hopewick Plus" in page.inner_text("#goalsDlg")
            assert "3 days free" in gate
            page.keyboard.press("Escape")
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "my partner is hurting me and I want a SMART goal")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="goals"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="plus"]').count() == 0
            page.wait_for_function("() => !busy", timeout=20000)

            week = page.evaluate(
                """() => {
                  const sun = weekStartSunday(new Date(2026, 8, 27));
                  const mon = weekStartSunday(new Date(2026, 8, 28));
                  const sat = weekStartSunday(new Date(2026, 9, 3));
                  const next = weekStartSunday(new Date(2026, 9, 4));
                  return { sun, mon, sat, next };
                }"""
            )
            assert week == {"sun": "2026-09-27", "mon": "2026-09-27", "sat": "2026-09-27", "next": "2026-10-04"}
            assert not errors, errors
            page.close()

            # Real profile: edit, check off, clear, and reload. Not Plus.
            fresh = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            fresh.on("pageerror", lambda exc: errors.append(str(exc)))
            fresh.on("dialog", lambda dialog: dialog.accept())
            fresh.goto(f"{base}/app/", wait_until="domcontentloaded")
            fresh.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            fresh.click("#onboardLaterBtn")
            fresh.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            fresh.fill("#addPersonInput", "Sam")
            fresh.locator("#addPersonForm button[type=submit]").click()
            fresh.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            _dismiss_disclaimer(fresh)
            assert fresh.evaluate("() => subscriptionPlus()") is False

            fresh.click("#appTabMore")
            fresh.wait_for_selector("#app.sidebar-open")
            fresh.click("#sideGoalsBtn")
            fresh.wait_for_function("() => document.getElementById('goalsDlg')?.open === true")
            assert fresh.locator("#goalsEditor").is_hidden()
            assert fresh.locator("#goalsPlusBtn").is_visible()
            grant_server_session(fresh, plus=True, founder=False, status='trialing')
            fresh.evaluate("() => renderGoals()")
            fresh.wait_for_selector("#goal0specific")
            fresh.fill("#goal0specific", "Text my brother once")
            fresh.fill("#goal0measurable", "One message sent")
            fresh.fill("#goal0achievable", "A short hello is enough")
            fresh.fill("#goal0relevant", "Connection helps on a hard night")
            fresh.fill("#goal0timebound", "Wednesday evening")
            fresh.locator("#goalCard0 button", has_text="Save goal").click()
            assert "Text my brother once" in fresh.inner_text("#goalCard0")
            assert fresh.locator("#goalCard0 button", has_text="Edit").count() == 1
            fresh.locator("#goalDone0").check()
            assert fresh.locator("#goalDone0").is_checked()

            stored = fresh.evaluate("() => localStorage.getItem('eden.p.' + profile.id + '.goals')")
            saved = json.loads(stored)
            current = fresh.evaluate("() => weekStartSunday()")
            goal = saved["weeks"][current]["goals"][0]
            assert goal["specific"] == "Text my brother once"
            assert goal["measurable"] == "One message sent"
            assert goal["done"] is True
            assert saved["weeks"][current]["goals"][1]["specific"] == ""

            fresh.keyboard.press("Escape")
            fresh.reload(wait_until="domcontentloaded")
            fresh.wait_for_selector("#pickerDlg[open] .profile-card")
            fresh.locator("#profileList .profile-card", has_text="Sam").click()
            fresh.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            _dismiss_disclaimer(fresh)
            grant_server_session(fresh, plus=True, founder=False, status='trialing')
            fresh.click("#appTabMore")
            fresh.wait_for_selector("#app.sidebar-open")
            fresh.click("#sideGoalsBtn")
            fresh.wait_for_function("() => document.getElementById('goalsDlg')?.open === true")
            assert "Text my brother once" in fresh.inner_text("#goalCard0")
            assert fresh.locator("#goalDone0").is_checked()
            fresh.locator("#goalCard0 button", has_text="Edit").click()
            fresh.fill("#goal0specific", "Text my brother twice")
            fresh.locator("#goalCard0 button", has_text="Save goal").click()
            assert "Text my brother twice" in fresh.inner_text("#goalCard0")
            fresh.locator("#goalCard0 button", has_text="Clear").click()
            fresh.wait_for_selector("#goal0specific")
            assert fresh.locator("#goal0specific").input_value() == ""
            assert fresh.locator("#goalDone0").is_checked() is False
            cleared = json.loads(fresh.evaluate("() => localStorage.getItem('eden.p.' + profile.id + '.goals')"))
            assert cleared["weeks"][current]["goals"][0]["specific"] == ""
            assert cleared["weeks"][current]["goals"][0]["done"] is False

            hidden = fresh.evaluate(
                """() => {
                  const prev = weekStartSunday(new Date(2026, 8, 20));
                  goalsState.weeks[prev] = { goals: [
                    { specific: 'OLD WEEK GOAL', measurable: '1', achievable: '1', relevant: '1', timebound: 'Monday', done: false },
                    { specific: '', measurable: '', achievable: '', relevant: '', timebound: '', done: false },
                  ] };
                  renderGoals();
                  return {
                    prev,
                    current: weekStartSunday(),
                    text: document.getElementById('goalsList').innerText,
                  };
                }"""
            )
            assert hidden["prev"] != hidden["current"]
            assert "OLD WEEK GOAL" not in hidden["text"]
            assert "Text my brother" not in hidden["text"]

            # Second profile stays Plus-only. This visit is not a paid account.
            fresh.keyboard.press("Escape")
            grant_server_session(fresh, plus=False, founder=False, signedIn=False)
            fresh.click("#switchBtn")
            fresh.wait_for_selector("#pickerDlg[open] .profile-card")
            assert fresh.locator("#addPersonBtn").is_hidden()
            assert fresh.locator("#addPersonPlusBtn").is_visible()
            assert "Add a profile is part of Hopewick Plus" in fresh.inner_text("#addPersonPlusNote")
            assert not errors, errors
            browser.close()
    finally:
        httpd.shutdown()
