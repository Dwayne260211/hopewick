#!/usr/bin/env python3
"""Hopewick Plus Plans hub: relapse / lapse prevention and exit plans.

Free sees the upgrade tease. Plus can build, review, and keep both plans
on this device. The tab bar stays Home · Chat · DV · Journal · More.
"""
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


def test_static_plans_hub():
    text = APP.read_text(encoding="utf-8")
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in text
    assert 'content="hopewick-v5.27"' in landing
    assert "function openPlans" in text
    assert "function renderPlans" in text
    assert "function normalizePlans" in text
    assert 'id="plansDlg"' in text
    assert 'id="plansGate"' in text
    assert 'id="plansDisclaimer"' in text
    assert 'id="plansWorkspace"' not in text
    editors = json.loads((ROOT / "server" / "library" / "plus-editors.json").read_text(encoding="utf-8"))
    assert 'id="plansWorkspace"' in editors["plans"]
    assert 'id="journalWorkspace"' not in text
    assert 'id="resumeBuilder"' not in text
    assert 'id="goalsEditor"' not in text
    assert 'id="sidePlansBtn"' in text
    assert 'data-open="plans"' in text
    assert "eden.p.<id>.plans" in text
    assert "plans: plansState" in text
    assert "Self-help only — not a counsellor or a crisis service" in text
    assert "A lapse is not a failure" in text
    assert "Your clean time tracker is separate" in text
    assert "Relapse and exit plans are part of Hopewick Plus" in text
    assert "Open Plans" in text
    assert "Do not add plans on a crisis reply." in text
    assert "HALT check" in text
    assert "Urge surfing" in text
    assert "Walking past a bottle shop" in text
    assert "Code-word call someone" in text
    assert "Limit money or keys" in text
    assert "My exits" in text
    assert "Relapse and exit plans — private on this device" in text
    assert "Relapse and exit plans — private on this device" in landing
    # Still under More. Not a new primary tab.
    assert 'id="appTabJournal"' in text
    assert 'id="appTabHome"' in text
    assert 'data-tab="plans"' not in text
    assert 'data-need="plans"' not in text
    assert "5 messages/day" in text
    assert "20 messages/day" not in text
    assert "200 messages/day" not in text
    # Crisis card and Get help stay.
    assert 'id="helpBtn"' in text
    assert "1800 250 015" in text
    dlg = text.split('<dialog id="plansDlg"', 1)[1].split("</dialog>", 1)[0]
    assert "000" in dlg
    assert "13 11 14" in dlg
    assert "Get help now" in dlg


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


def _open_plans(page):
    page.click("#menuBtn")
    page.wait_for_selector("#sidebar", state="visible")
    button = page.locator("#sidePlansBtn")
    button.scroll_into_view_if_needed()
    button.click()
    page.wait_for_function("() => document.getElementById('plansDlg')?.open === true")


def test_plans_free_gate_and_plus_builders():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            _enter_demo(page, base)

            nav = " ".join(page.inner_text("#bottomNav").split())
            assert "Home" in nav and "Chat" in nav and "Chats" in nav and "Journal" in nav and "More" in nav
            assert page.locator("#bottomNav .bottom-nav-btn").count() == 6
            assert page.locator('#bottomNav [data-tab="plans"]').count() == 0
            assert page.locator('#needNow [data-need="plans"]').count() == 0
            assert page.is_visible("#helpBtn")

            _open_plans(page)
            free_text = page.inner_text("#plansDlg")
            assert "Self-help only — not a counsellor or a crisis service" in free_text
            assert "A lapse is not a failure" in free_text
            assert "Get help now" in free_text
            assert "13 11 14" in free_text
            assert "Relapse and exit plans are part of Hopewick Plus" in free_text
            assert page.locator("#plansWorkspace").is_hidden()
            assert page.locator("#planWarnings").count() == 0
            assert page.locator("#planExitActions").count() == 0
            assert page.locator("#plansPlusBtn").is_visible()
            assert page.evaluate("() => document.getElementById('plansPlusPill').hidden") is False

            page.click("#plansPlusBtn")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            assert "Relapse and exit plans — private on this device" in page.inner_text("#accountDlg")
            assert "5 messages/day" in page.inner_text("#accountDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")

            grant_server_session(page, plus=True, founder=False)
            page.evaluate("() => { renderPlans(); syncPlusFeaturePills(); }")
            if not page.evaluate("() => document.getElementById('plansDlg').open"):
                _open_plans(page)
                page.evaluate("() => { renderPlans(); syncPlusFeaturePills(); }")
            page.wait_for_selector("#plansWorkspace:not([hidden])")
            assert page.evaluate("() => document.getElementById('plansPlusPill').hidden") is True
            assert page.locator("#plansGate").is_hidden()
            assert "A lapse is not a failure" in page.inner_text("#plansDisclaimer")

            dlg = page.locator("#plansDlg")
            dlg.locator("button.plans-card", has_text="Relapse / lapse prevention plan").click()
            page.wait_for_selector("#planWarnings")
            page.fill("#planWarnings", "Walking past the bottle shop on the way home")
            page.click("#planNext")
            dlg.get_by_role("button", name="HALT check", exact=True).click()
            dlg.get_by_role("button", name="Leave the situation", exact=True).click()
            dlg.get_by_role("button", name="Urge surfing", exact=True).click()
            page.fill("#planFirstNote", "Step outside and text Sam")
            page.click("#planNext")
            page.locator("[data-person-name]").fill("Sam")
            page.locator("[data-person-reach]").fill("0400 111 222")
            page.click("#planNext")
            page.fill("#planHelps", "A walk with the dog")
            page.fill("#planAvoid", "Cash in my pocket")
            page.click("#planNext")
            dlg.get_by_role("button", name="I will tell someone safe today", exact=True).click()
            page.click("#planNext")
            page.wait_for_selector("#planSummary")
            summary = page.inner_text("#planSummary")
            assert "Walking past the bottle shop on the way home" in summary
            assert "HALT check" in summary
            assert "Leave the situation" in summary
            assert "Urge surfing" in summary
            assert "Step outside and text Sam" in summary
            assert "Sam" in summary
            assert "0400 111 222" in summary
            assert "A walk with the dog" in summary
            assert "Cash in my pocket" in summary
            assert "I will tell someone safe today." in summary
            assert "does not reset" in summary
            assert page.locator('#planSummary a[href^="tel:"]').count() == 1
            # Demo does not write the plan into device storage.
            assert page.evaluate("() => localStorage.getItem('eden.p.demo.plans')") is None

            dlg.get_by_role("button", name="All plans", exact=True).click()
            dlg.locator("button.plans-card", has_text="Exit plan").click()
            page.wait_for_selector('[data-scenario="payday"]')
            page.locator('[data-scenario="payday"]').click()
            page.wait_for_selector("#planExitActions")
            page.locator('[data-exit-action="leave"]').click()
            page.locator('[data-exit-action="money"]').click()
            page.locator('[data-exit-action="code"]').click()
            page.fill("#planExitWho", "Sam")
            page.fill("#planExitCode", "blue sky")
            page.fill("#planExitNote", "Leave the card at home")
            page.click("#planExitSave")
            page.wait_for_selector('[data-scenario="payday"]')
            assert "Leave" in page.inner_text('[data-scenario="payday"]')
            assert "Limit money or keys" in page.inner_text('[data-scenario="payday"]')

            page.fill("#planCustomTitle", "Family barbecue")
            page.click("#planCustomAdd")
            page.wait_for_selector("#planExitActions")
            assert "Family barbecue" in page.inner_text("#plansExit")
            page.locator('[data-exit-action="route"]').click()
            page.click("#planExitSave")
            page.wait_for_selector('[data-scenario="payday"]')

            dlg.get_by_role("button", name="All plans", exact=True).click()
            dlg.locator("button.plans-card", has_text="My exits").click()
            page.wait_for_selector('[data-my-exit="payday"]')
            mine = page.inner_text("#plansExit")
            assert "Payday" in mine
            assert "Leave" in mine
            assert "Limit money or keys" in mine
            assert "Sam" in mine
            assert "blue sky" in mine
            assert "Leave the card at home" in mine
            assert "Family barbecue" in mine
            assert "Change route" in mine
            page.locator("#plansDlg").get_by_role("button", name="Get help now", exact=True).click()
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "1800 250 015" in page.inner_text("#helpDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open !== true")
            assert page.evaluate("() => document.getElementById('plansDlg').open") is True

            dlg.get_by_role("button", name="All plans", exact=True).click()
            dlg.locator("button.plans-card", has_text="Relapse / lapse prevention plan").click()
            page.wait_for_selector("#planSummary")
            page.once("dialog", lambda d: d.accept())
            page.click("#planDelete")
            page.wait_for_selector("#planWarnings")
            assert page.locator("#planWarnings").input_value() == ""
            dlg.get_by_role("button", name="All plans", exact=True).click()
            card = dlg.locator("button.plans-card", has_text="Relapse / lapse prevention plan").inner_text()
            assert "Saved" not in card

            tools = page.evaluate(
                """() => {
                  const plan = hopeGatewayIds({ messages: [
                    { role: 'user', content: 'Help me write a relapse prevention plan' },
                    { role: 'assistant', content: 'We can do that together.' }
                  ]});
                  const exit = hopeGatewayIds({ messages: [
                    { role: 'user', content: 'Can you help me make an exit plan for payday?' },
                    { role: 'assistant', content: 'Yes.' }
                  ]});
                  const crisis = hopeGatewayIds({ messages: [
                    { role: 'user', content: 'I want to die and I need an exit plan', crisis: true },
                    { role: 'assistant', card: 'crisis', crisisKind: 'suicide', content: '' }
                  ]});
                  const generic = hopeGatewayIds({ messages: [
                    { role: 'user', content: 'Help me make a plan' },
                    { role: 'assistant', content: 'What kind of plan?' }
                  ]});
                  return { plan, exit, crisis, generic };
                }"""
            )
            assert "plans" in tools["plan"]
            assert "plans" in tools["exit"]
            assert "plans" not in tools["crisis"]
            assert "help" in tools["crisis"]
            assert "plans" not in tools["generic"]

            saved = page.evaluate(
                """() => {
                  const prevDemo = isDemo;
                  isDemo = false;
                  profile = { id: 'plan-save', name: 'Alex' };
                  plansState = normalizePlans({
                    relapse: {
                      warnings: 'Walking past the bottle shop',
                      firstTen: ['halt', 'leave', 'not-a-real-action'],
                      people: [{ name: 'Sam', reach: '0400 111 222' }]
                    },
                    exits: { payday: { actions: ['leave', 'code'], who: 'Sam', codeWord: 'blue sky', note: 'Leave the card at home' } },
                    custom: [{ id: 'bbq', title: 'Family barbecue', actions: ['route'], note: '', who: '', codeWord: '' }]
                  });
                  savePlans();
                  isDemo = prevDemo;
                  return localStorage.getItem('eden.p.plan-save.plans');
                }"""
            )
            data = json.loads(saved)
            assert data["relapse"]["warnings"] == "Walking past the bottle shop"
            assert data["relapse"]["firstTen"] == ["halt", "leave"]
            assert data["relapse"]["people"][0]["name"] == "Sam"
            assert data["exits"]["payday"]["codeWord"] == "blue sky"
            assert data["custom"][0]["title"] == "Family barbecue"
            assert "not-a-real-action" not in saved

            page.reload(wait_until="domcontentloaded")
            still = page.evaluate("() => localStorage.getItem('eden.p.plan-save.plans')")
            assert "Walking past the bottle shop" in still
            assert errors == []
            browser.close()
    finally:
        httpd.shutdown()
