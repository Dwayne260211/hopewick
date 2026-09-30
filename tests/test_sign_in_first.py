#!/usr/bin/env python3
"""A signed-out visit can use Hopewick without an account. That visit is not durable. A signed-in profile still opens Home."""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SIGNED_OUT = {
    "signedIn": False,
    "id": None,
    "email": None,
    "subscriptionStatus": "none",
    "currentPeriodEnd": None,
    "plus": False,
    "complimentary": False,
    "founder": False,
    "hasPassword": False,
    "name": "",
    "phone": "",
    "cancelAtPeriodEnd": False,
}
CONFIG = {"checkoutReady": True, "devMagic": False, "hopeHosted": True}
USAGE = {
    "used": 0,
    "limit": 5,
    "remaining": 5,
    "plus": False,
    "trialEligible": True,
    "resetLabel": "midnight, Brisbane time",
    "complimentary": False,
}


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _route_account(page, state):
    def handle(route):
        url = route.request.url
        if "/api/auth/login" in url and route.request.method == "POST":
            state["signedIn"] = True
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
            return
        if "/api/auth/me" in url:
            body = dict(SIGNED_OUT)
            if state["signedIn"]:
                body.update({
                    "signedIn": True,
                    "id": "sam-id",
                    "email": "sam@example.com",
                    "hasPassword": True,
                    "plus": False,
                    "founder": False,
                })
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
            return
        if "/api/billing/config" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(CONFIG))
            return
        if "/api/hope/usage" in url:
            if not state["signedIn"]:
                route.fulfill(status=401, content_type="application/json", body=json.dumps({"error": "Sign in", "code": "auth"}))
                return
            route.fulfill(status=200, content_type="application/json", body=json.dumps(USAGE))
            return
        if "/api/plus/library" in url:
            route.fulfill(status=403, content_type="application/json", body=json.dumps({"error": "Hopewick Plus opens this library.", "code": "plus"}))
            return
        if "/api/chats" in url or "/api/readings/" in url:
            route.fulfill(status=404, content_type="application/json", body=json.dumps({}))
            return
        route.continue_()

    page.route("**/api/**", handle)


def test_sign_in_before_profile_and_home_when_already_in():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            state = {"signedIn": False}
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(page, state)
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            assert page.locator("#signInDlg[open]").count() == 0
            help_text = page.locator("#helpDlg").text_content()
            assert "000" in help_text
            assert "13 11 14" in help_text
            assert "000" in page.locator("#composerHint").inner_text()
            assert "000" in page.locator("#dvView").text_content()

            page.evaluate(
                """() => {
                  localStorage.setItem('eden.profiles.v1', JSON.stringify({
                    list: [{id:'old', name:'Old guest', pin:null, created:1}],
                    lastId: 'old'
                  }));
                  localStorage.setItem('eden.p.old.journal', JSON.stringify([{id:'j', body:'yesterday'}]));
                }"""
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            assert page.evaluate("() => localStorage.getItem('eden.p.old.journal')") is None
            assert "Old guest" not in page.locator("body").inner_text()

            page.click("#onboardLaterBtn")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            page.fill("#addPersonInput", "Sam")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None
            assert "Sam" in page.evaluate("() => sessionStorage.getItem('eden.profiles.v1')")
            page.evaluate(
                """() => {
                  journal = [{id:'j1', title:'Today', body:'this visit', created:1, updated:1}];
                  saveJournal();
                  goalsState = normalizeGoals({});
                  saveGoals();
                }"""
            )
            assert page.evaluate("() => localStorage.getItem('eden.p.' + profile.id + '.journal')") is None
            assert "this visit" in page.evaluate("() => sessionStorage.getItem('eden.p.' + profile.id + '.journal')")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#pickerDlg[open] .profile-card")
            assert page.locator("#profileList .pname").all_text_contents() == ["Sam"]
            assert not errors, errors
            page.close()

            gone = browser.new_context(viewport={"width": 390, "height": 844})
            fresh = gone.new_page()
            fresh.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(fresh, {"signedIn": False})
            fresh.goto(f"{base}/app/", wait_until="domcontentloaded")
            fresh.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            assert fresh.evaluate("() => sessionStorage.getItem('eden.profiles.v1')") is None
            assert fresh.locator("#signInDlg[open]").count() == 0
            assert not errors, errors
            gone.close()

            state = {"signedIn": True}
            home = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            home.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(home, state)
            home.goto(f"{base}/app/", wait_until="domcontentloaded")
            home.evaluate(
                """() => {
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                  localStorage.setItem('eden.profiles.v1', JSON.stringify({
                    list: [{id:'sam1', name:'Sam', pin:null, created:1}],
                    lastId: 'sam1'
                  }));
                  localStorage.setItem('eden.p.sam1.settings', JSON.stringify({
                    settingsVersion: 2, mode: 'counsellor', disclaimerAck: true
                  }));
                }"""
            )
            home.reload(wait_until="domcontentloaded")
            home.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'", timeout=15000)
            assert home.locator("#signInDlg[open]").count() == 0
            assert home.locator("#onboardingDlg[open]").count() == 0
            assert home.locator("#pickerDlg[open]").count() == 0
            assert home.locator("#homeView").is_visible()
            assert home.evaluate("() => subscriptionPlus()") is False
            assert home.evaluate("() => plusAccess.ready") is False
            assert not errors, errors
            home.close()

            demo = browser.new_page(viewport={"width": 1100, "height": 800})
            errors = []
            demo.on("pageerror", lambda exc: errors.append(str(exc)))
            demo.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            demo.wait_for_selector("#launchPrefs:not([hidden])", timeout=15000)
            assert demo.locator("#signInDlg[open]").count() == 0
            assert demo.locator("#onboardingDlg[open]").count() == 0
            assert demo.locator("#switchName").inner_text().strip() == "Alex"
            assert not errors, errors
            demo.close()

            browser.close()
    finally:
        httpd.shutdown()
