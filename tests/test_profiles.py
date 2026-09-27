#!/usr/bin/env python3
"""Starter profiles must not ship personal names. Scripted visits have no sample person."""
from __future__ import annotations

import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
    assert "name: 'Alex'" not in text
    assert ">DEMO<" not in text
    assert "const DEMO_PERSON = { id: 'demo', name: ''" in text
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Pick **Dwayne**" not in readme
    assert "Abbey" not in readme
    assert "sample person" not in readme
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
            saved = _profiles(page)
            assert [p["name"] for p in saved["list"]] == ["Sam"]
            blob = json.dumps(saved)
            assert "Dwayne" not in blob and "Abbey" not in blob
            assert not errors, errors
            fresh.close()

            demo = browser.new_context(viewport={"width": 1100, "height": 800})
            page = demo.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=15000)
            assert page.locator("#switchName").text_content().strip() == ""
            assert "Alex" not in page.locator("body").inner_text()
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
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.evaluate(
                """(factory) => {
                  localStorage.setItem('eden.profiles.v1', JSON.stringify(factory));
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                }""",
                FACTORY,
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            assert _names(page) == []
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            seeded.close()

            used = browser.new_context()
            page = used.new_page()
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
            page.wait_for_selector("#pickerDlg[open] .profile-card")
            assert _names(page) == ["Dwayne", "Abbey"]
            kept = _profiles(page)
            assert [p["name"] for p in kept["list"]] == ["Dwayne", "Abbey"]
            used.close()

            legacy = browser.new_context()
            page = legacy.new_page()
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
            page.wait_for_selector("#pickerDlg[open] .pname")
            assert _names(page) == ["Person 1"]
            assert page.evaluate("() => localStorage.getItem('eden.settings.v1')") is None
            assert page.evaluate("() => localStorage.getItem('eden.conversations.v1')") is None
            migrated = _profiles(page)
            assert [p["name"] for p in migrated["list"]] == ["Person 1"]
            pid = migrated["list"][0]["id"]
            assert pid not in ("dwayne", "abbey")
            shared = json.loads(page.evaluate("() => localStorage.getItem('eden.shared.v1')"))
            assert shared["apiKey"] == "legacy-key"
            convos = page.evaluate("(id) => localStorage.getItem('eden.p.' + id + '.convos')", pid)
            assert "hi" in convos
            legacy.close()

            demo_seed = browser.new_context()
            page = demo_seed.new_page()
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.evaluate(
                """(factory) => { localStorage.setItem('eden.profiles.v1', JSON.stringify(factory)); }""",
                FACTORY,
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])")
            assert page.locator("#switchName").text_content().strip() == ""
            still = json.loads(page.evaluate("() => localStorage.getItem('eden.profiles.v1')"))
            assert [p["name"] for p in still["list"]] == ["Dwayne", "Abbey"]
            page.click("#exitDemoBtn")
            page.wait_for_selector("#pickerDlg[open]")
            assert _names(page) == []
            still = json.loads(page.evaluate("() => localStorage.getItem('eden.profiles.v1')"))
            assert [p["name"] for p in still["list"]] == ["Dwayne", "Abbey"]
            demo_seed.close()

            browser.close()
    finally:
        httpd.shutdown()
