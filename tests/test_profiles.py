#!/usr/bin/env python3
"""Starter profiles must not ship personal names. The Alex demo sample stays."""
from __future__ import annotations

import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session, install_member_session
APP = ROOT / "app" / "index.html"

FACTORY = {
    "list": [
        {"id": "dwayne", "name": "Dwayne", "pin": None, "created": 1},
        {"id": "abbey", "name": "Abbey", "pin": None, "created": 1},
    ],
    "lastId": "dwayne",
}


def test_static_no_personal_starter_names():
    text = APP.read_text(encoding="utf-8")
    topbar = re.search(r'<header class="topbar">.*?</header>', text, re.S).group(0)
    picker = re.search(r'<dialog id="pickerDlg".*?</dialog>', text, re.S).group(0)
    assert "Dwayne" not in topbar
    assert "Abbey" not in topbar
    assert "Dwayne" not in picker
    assert "Abbey" not in picker
    assert "name: 'Dwayne'" not in text
    assert "name: 'Abbey'" not in text
    assert "const DEMO_PERSON = { id: 'demo', name: 'Alex'" in text
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Pick **Dwayne**" not in readme
    assert "Abbey" not in readme
    assert "Person 1" in readme


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _names(page):
    return page.locator("#profileList .pname").all_text_contents()


def _profiles(page):
    raw = page.evaluate("() => localStorage.getItem('eden.profiles.v1')")
    return json.loads(raw) if raw else None


def test_new_user_picker_and_demo_privacy():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            fresh = browser.new_context(viewport={"width": 1100, "height": 800})
            page = fresh.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            install_member_session(page)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            page.click("#onboardLaterBtn")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            assert _names(page) == []
            assert "Dwayne" not in page.locator("#pickerDlg").inner_text()
            assert "Abbey" not in page.locator("#pickerDlg").inner_text()
            assert page.locator("#switchName").text_content().strip() == ""
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            page.fill("#addPersonInput", "Sam")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            saved = json.loads(page.evaluate("() => localStorage.getItem('eden.profiles.v1')"))
            assert [p["name"] for p in saved["list"]] == ["Sam"]
            blob = json.dumps(saved)
            assert "Dwayne" not in blob and "Abbey" not in blob
            assert saved.get("accountId") == "test-user"
            assert not errors, errors
            fresh.close()

            demo = browser.new_context(viewport={"width": 1100, "height": 800})
            page = demo.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            install_member_session(page)
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=15000)
            assert page.locator("#switchName").text_content().strip() == "Alex"
            assert page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('eden.'))") == []
            page.click("#switchBtn")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            assert _names(page) == []
            assert page.locator("#switchName").text_content().strip() != "Dwayne"
            assert page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('eden.'))") == []
            assert not errors, errors
            demo.close()

            seeded = browser.new_context()
            page = seeded.new_page()
            install_member_session(page)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.evaluate(
                """(factory) => {
                  localStorage.setItem('eden.profiles.v1', JSON.stringify(factory));
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                }""",
                FACTORY,
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#pickerDlg[open]", timeout=15000)
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            assert _names(page) == []
            assert "Dwayne" not in page.locator("#pickerDlg").inner_text()
            seeded.close()

            used = browser.new_context()
            page = used.new_page()
            install_member_session(page)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.evaluate(
                """(factory) => {
                  localStorage.setItem('eden.profiles.v1', JSON.stringify(factory));
                  localStorage.setItem('eden.p.dwayne.settings', JSON.stringify({settingsVersion:2, mode:'counsellor'}));
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                }""",
                FACTORY,
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#pickerDlg[open]", timeout=15000)
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            assert page.evaluate("() => localStorage.getItem('eden.p.dwayne.settings')") is None
            assert _names(page) == []
            used.close()

            legacy = browser.new_context()
            page = legacy.new_page()
            install_member_session(page)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.evaluate(
                """() => {
                  localStorage.setItem('eden.settings.v1', JSON.stringify({
                    apiKey: 'legacy-key', userName: 'Dwayne', mode: 'friend'
                  }));
                  localStorage.setItem('eden.conversations.v1', JSON.stringify([{id:'c1', messages:[{role:'user', content:'hi'}]}]));
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                }"""
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function(
                "() => document.getElementById('pickerDlg')?.open || document.querySelector('#switchName')?.textContent === 'Person 1'",
                timeout=15000,
            )
            assert page.evaluate("() => localStorage.getItem('eden.settings.v1')") is None
            assert page.evaluate("() => localStorage.getItem('eden.conversations.v1')") is None
            visible = page.locator("body").inner_text()
            assert "Dwayne" not in visible
            assert "Abbey" not in visible
            legacy.close()

            demo_seed = browser.new_context()
            page = demo_seed.new_page()
            install_member_session(page)
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.evaluate(
                """(factory) => { localStorage.setItem('eden.profiles.v1', JSON.stringify(factory)); }""",
                FACTORY,
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])")
            assert page.locator("#switchName").text_content().strip() == "Alex"
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            page.click("#exitDemoBtn")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            assert _names(page) == []
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            demo_seed.close()

            browser.close()
    finally:
        httpd.shutdown()


def _profile_names(page):
    raw = page.evaluate(
        "() => sessionStorage.getItem('eden.profiles.v1') || localStorage.getItem('eden.profiles.v1')"
    )
    if not raw:
        return []
    return [p["name"] for p in json.loads(raw)["list"]]


def test_add_extra_profile_requires_plus():
    """First profile stays free. Adding another opens Plus. Switching still works."""
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            install_member_session(page)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            page.click("#onboardLaterBtn")
            page.wait_for_function("() => billingState.loaded")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            assert page.locator("#addPersonBtn").is_visible()
            assert page.locator("#addPersonPlusNote").is_hidden()
            assert page.evaluate("() => subscriptionPlus()") is False

            page.fill("#addPersonInput", "Sam")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            assert _profile_names(page) == ["Sam"]
            if page.locator("#disclaimerDlg[open]").count():
                page.click("#discOkBtn")
                page.wait_for_function("() => document.getElementById('disclaimerDlg').open !== true")

            page.click("#switchBtn")
            page.wait_for_selector("#pickerDlg[open] .profile-card")
            assert page.locator("#profileList .pname").all_text_contents() == ["Sam"]
            assert page.locator("#addPersonBtn").is_hidden()
            assert page.locator("#addPersonForm").is_hidden()
            assert page.locator("#addPersonPlusBtn").is_visible()
            assert "Add a profile is part of Hopewick Plus" in page.inner_text("#addPersonPlusNote")

            page.click("#addPersonPlusBtn")
            page.wait_for_selector("#accountDlg[open]")
            assert "Hopewick Plus" in page.inner_text("#accountTitle")
            assert "Add another profile" in page.inner_text("#accountDlg")
            page.click("#accountCloseBtn")
            page.wait_for_function("() => document.getElementById('accountDlg').open !== true")

            page.evaluate("() => { document.getElementById('addPersonForm').hidden = false; }")
            page.fill("#addPersonInput", "Riley")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_selector("#accountDlg[open]")
            assert _profile_names(page) == ["Sam"]
            page.click("#accountCloseBtn")
            page.wait_for_function("() => document.getElementById('accountDlg').open !== true")

            page.locator("#profileList .profile-card", has_text="Sam").click()
            page.wait_for_function("() => !document.getElementById('pickerDlg').open")
            assert page.locator("#switchName").text_content().strip() == "Sam"

            grant_server_session(page, plus=True, founder=False, status='active')
            page.evaluate("() => syncProfileAddUi()")
            page.click("#switchBtn")
            page.wait_for_selector("#pickerDlg[open] #addPersonBtn:not([hidden])")
            assert page.locator("#addPersonPlusNote").is_hidden()
            assert page.locator("#profileList .pname").all_text_contents() == ["Sam"]
            page.click("#addPersonBtn")
            page.wait_for_selector("#addPersonForm:not([hidden])")
            page.fill("#addPersonInput", "Riley")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Riley'")
            assert _profile_names(page) == ["Sam", "Riley"]
            if page.locator("#disclaimerDlg[open]").count():
                page.click("#discOkBtn")
                page.wait_for_function("() => document.getElementById('disclaimerDlg').open !== true")

            grant_server_session(page, plus=False, founder=False)
            page.evaluate("() => syncProfileAddUi()")
            page.click("#switchBtn")
            page.wait_for_selector("#pickerDlg[open] .profile-card")
            assert page.locator("#profileList .pname").all_text_contents() == ["Sam", "Riley"]
            assert page.locator("#addPersonBtn").is_hidden()
            assert page.locator("#addPersonPlusBtn").is_visible()
            page.evaluate("() => { document.getElementById('addPersonForm').hidden = false; }")
            page.fill("#addPersonInput", "Casey")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_selector("#accountDlg[open]")
            assert _profile_names(page) == ["Sam", "Riley"]
            page.click("#accountCloseBtn")
            page.wait_for_function("() => document.getElementById('accountDlg').open !== true")
            page.locator("#profileList .profile-card", has_text="Sam").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            assert page.evaluate("() => subscriptionPlus()") is False
            browser.close()
    finally:
        httpd.shutdown()
