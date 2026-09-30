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
        if "/api/billing/checkout" in url:
            state["checkout"] = state.get("checkout", 0) + 1
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"url": "/app/?checkout=success", "id": "cs_test"}))
            return
        if "/api/plus/library" in url:
            route.fulfill(status=403, content_type="application/json", body=json.dumps({"error": "Hopewick Plus opens this library.", "code": "plus"}))
            return
        if "/api/checkins" in url or "/api/chats" in url or "/api/readings/" in url:
            route.fulfill(status=404, content_type="application/json", body=json.dumps({}))
            return
        route.continue_()

    page.route("**/api/**", handle)


def test_app_requires_sign_in_and_trial_needs_account():
    """The app stays closed until a real session. Guest storage, demo, and a trial click do not open checkout."""
    from playwright.sync_api import sync_playwright

    home = (ROOT / "index.html").read_text(encoding="utf-8")
    server = (ROOT / "server" / "index.js").read_text(encoding="utf-8")
    assert 'href="tel:000"' in home
    assert "13 11 14" in home
    assert 'href="app/?trial=1"' in home
    assert "payment_method_collection: 'always'" in server
    assert "trial_period_days" in server
    assert "GOOGLE_CLIENT_ID" in server
    assert "apps.googleusercontent.com" not in server

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            state = {"signedIn": False, "checkout": 0}
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(page, state)
            page.goto(f"{base}/app/?trial=1", wait_until="domcontentloaded")
            page.wait_for_selector("#signInDlg[open]", timeout=15000)
            assert page.locator("#onboardingDlg[open]").count() == 0
            assert page.locator("#pickerDlg[open]").count() == 0
            gate = page.inner_text("#signInDlg")
            assert "000" in gate
            assert "13 11 14" in gate
            assert "Sign in with Google" in gate
            assert "Email me a sign-in link" in gate
            assert state["checkout"] == 0
            page.click("#accountGoogleBtn")
            page.wait_for_function("() => (document.getElementById('accountStatus')?.textContent || '').includes('isn’t set up')")
            assert state["checkout"] == 0

            page.evaluate(
                """() => {
                  localStorage.setItem('eden.profiles.v1', JSON.stringify({
                    list: [{id:'old', name:'Old guest', pin:null, created:1}],
                    lastId: 'old'
                  }));
                  localStorage.setItem('hopewick.plus', '1');
                  sessionStorage.setItem('eden.profiles.v1', JSON.stringify({
                    list: [{id:'visit', name:'Visit only', pin:null, created:1}],
                    lastId: 'visit'
                  }));
                }"""
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#signInDlg[open]", timeout=15000)
            assert page.locator("#onboardingDlg[open]").count() == 0
            assert "Old guest" not in page.inner_text("body")
            assert "Visit only" not in page.inner_text("body")
            assert state["checkout"] == 0
            assert page.evaluate("() => localStorage.getItem('eden.profiles.v1')") is None

            page.fill("#accountEmail", "sam@example.com")
            page.fill("#accountPassword", "correct-horse")
            page.click("#accountSignInBtn", no_wait_after=True)
            page.wait_for_function("() => location.search.includes('checkout=success')", timeout=15000)
            assert state["checkout"] == 1
            assert not errors, errors
            page.close()

            free = browser.new_page(viewport={"width": 390, "height": 844})
            free_state = {"signedIn": False, "checkout": 0}
            free.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(free, free_state)
            free.goto(f"{base}/app/", wait_until="domcontentloaded")
            free.wait_for_selector("#signInDlg[open]", timeout=15000)
            free.fill("#accountEmail", "sam@example.com")
            free.fill("#accountPassword", "correct-horse")
            free.click("#accountSignInBtn")
            free.wait_for_selector("#plusChoiceDlg[open]", timeout=15000)
            assert free_state["checkout"] == 0
            free.click("#plusChoiceFree")
            free.wait_for_function("() => document.getElementById('plusChoiceDlg')?.open !== true")
            assert free_state["checkout"] == 0
            assert free.locator("#signInDlg[open]").count() == 0
            free.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            assert not errors, errors
            free.close()

            demo = browser.new_page(viewport={"width": 1100, "height": 800})
            demo_state = {"signedIn": False, "checkout": 0}
            demo.on("pageerror", lambda exc: errors.append(str(exc)))
            _route_account(demo, demo_state)
            demo.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            demo.wait_for_selector("#signInDlg[open]", timeout=15000)
            assert demo.locator("#launchPrefs:not([hidden])").count() == 0
            assert demo.locator("#switchName").inner_text().strip() != "Alex"
            assert demo_state["checkout"] == 0
            demo.close()

            browser.close()
    finally:
        httpd.shutdown()
