# -*- coding: utf-8 -*-
"""Overhaul onboarding (2026-10): Start Free -> account -> welcome (help, AI limits, privacy, real help) -> Meet Hope.

Real local server (JSON store, no Stripe/OpenAI/Resend keys). Throwaway example.test accounts only.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import live_server  # noqa: E402

SIZES = [(390, 844), (768, 1024), (1280, 900)]


@pytest.fixture(scope="module")
def server():
    with live_server() as (base, data_dir):
        yield base


@pytest.fixture(scope="module")
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _start(browser, base, w, h, email):
    ctx = browser.new_context(viewport={"width": w, "height": h})
    page = ctx.new_page()
    page.route("**/api/visit", lambda r: r.fulfill(status=204, body=""))
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Homepage Start Free goes to the app, which asks for an account first.
    page.goto(base + "/", wait_until="domcontentloaded")
    page.click("#launchApp")
    page.wait_for_selector("#signInDlg[open]", timeout=20000)
    assert page.locator("#signInDlg a[href='tel:000']").is_visible()
    r = ctx.request.post(f"{base}/api/auth/magic-link", data={"email": email}, headers={"Origin": base})
    assert r.status == 200
    page.goto(r.json()["devLink"], wait_until="domcontentloaded")
    page.wait_for_selector("#onboardingDlg[open]", timeout=20000)
    return ctx, page, errors


@pytest.mark.parametrize("w,h", SIZES, ids=["mobile", "tablet", "desktop"])
def test_meet_hope_in_five_steps_without_a_plus_popup(server, browser, w, h):
    ctx, page, errors = _start(browser, server, w, h, f"onb-{w}@example.test")
    assert page.locator("#plusChoiceDlg[open]").count() == 0
    assert page.locator("#onboardCrisis a[href='tel:131114']").is_visible()
    assert page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
    page.click("#onboardYesBtn")
    page.click("#onboardReasonContinue")
    page.click("#onboardFaithLater")
    page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
    page.fill("#addPersonInput", "Sam")
    page.locator("#addPersonForm button[type=submit]").click()
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile", timeout=20000)
    page.wait_for_timeout(500)
    # The welcome covered the safety points and the person said "I understand", so no second safety pop-up.
    assert page.locator("#disclaimerDlg[open]").count() == 0
    assert page.locator("#plusChoiceDlg[open]").count() == 0
    assert page.evaluate("() => appTab") == "chat"
    # Get help is still one tap away and free.
    assert page.locator("#helpBtn").is_visible()
    # Coming back later: still no surprise Plus pop-up for this account on this device.
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile", timeout=20000)
    page.wait_for_timeout(800)
    assert page.locator("#plusChoiceDlg[open]").count() == 0
    assert not [e for e in errors if "Failed to load resource" not in e], errors
    ctx.close()


def test_not_now_still_shows_the_safety_note(server, browser):
    ctx, page, _ = _start(browser, server, 390, 844, "onb-later@example.test")
    page.click("#onboardLaterBtn")
    page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
    page.fill("#addPersonInput", "Jo")
    page.locator("#addPersonForm button[type=submit]").click()
    page.wait_for_selector("#disclaimerDlg[open]", timeout=20000)
    assert "not a registered counsellor, doctor or clinician" in page.inner_text("#disclaimerDlg")
    ctx.close()
