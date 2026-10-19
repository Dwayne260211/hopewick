# -*- coding: utf-8 -*-
"""Suicide prevention safety plan (Stanley-Brown steps) in "My safety plan", end to end in
Chromium against the real local server (JSON store, throwaway HOPEWICK_DATA_KEY).

A FREE account (no Plus, no trial) reaches the plan from Get help, sees the calm intro and
the 000 notice, adds a person and a GP with labelled name + phone fields, sees the
prefilled services with correct tel: links, saves, and gets the plan back after a reload.
Keyboard-only use of the quick-add fields and dark mode are checked too.
Nothing touches Stripe, email, Neon or production.
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import go, live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page, _quiet  # noqa: E402

TEST_KEY = base64.b64encode(os.urandom(32)).decode()
PREFILLED = {
    "tel:000": "000",
    "tel:131114": "13 11 14",
    "tel:1300659467": "1300 659 467",
    "tel:139276": "13 92 76",
    "tel:1800551800": "1800 55 1800",
    "tel:1300224636": "1300 22 4636",
}


@pytest.fixture(scope="module")
def server():
    with live_server({"HOPEWICK_DATA_KEY": TEST_KEY, "HOPEWICK_DATA_KEY_ID": "ssp"}) as (base, data_dir):
        yield base, data_dir


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _links(page, sel):
    return page.eval_on_selector_all(sel, "els => els.map(e => [e.getAttribute('href'), e.textContent])")


def test_free_user_reaches_builds_saves_and_reloads_the_plan(server, browser):
    base, data_dir = server
    page, errors = _page(browser)
    sign_in(page, base, email="ssp-free@example.test")
    me = _api(page, "GET", "/api/auth/me")["body"]
    assert me["plus"] is False, "free account"

    # Get help: the plan is one tap away and named clearly.
    page.evaluate("() => openHelp()")
    page.wait_for_selector("#helpDlg[open]")
    assert "suicide prevention" in page.inner_text("#helpSafetyPlanBtn")
    assert page.is_visible("#helpSafetyPlanNote")
    # Emergency calling first: 000, then Lifeline, then the plan button, then the longer list.
    order = page.evaluate("""() => {
      const top = (s) => document.querySelector(s).getBoundingClientRect().top;
      const calls = [...document.querySelectorAll('#helpList a.call')].map((a) => a.getAttribute('href'));
      return { calls, more: document.querySelectorAll('#helpListMore a.call').length,
        ok: top('#helpList') < top('#helpSafetyPlanBtn') && top('#helpSafetyPlanBtn') < top('#helpListMore') };
    }""")
    assert order["calls"] == ["tel:000", "tel:131114"], order
    assert order["more"] >= 5 and order["ok"], order
    page.click("#helpSafetyPlanBtn")
    page.wait_for_selector("#hw3Inner[data-tab='safety']")
    page.wait_for_selector("#hw5StepForm")

    # Calm entry and the 000 notice. No Plus prompt anywhere on the screen.
    inner = page.inner_text("#hw3Inner")
    assert "Call 000 if you are in immediate danger" in page.inner_text("#hw5Urgent")
    assert page.get_attribute("#hw5Urgent a[href='tel:000']", "href") == "tel:000"
    assert page.get_attribute("#hw5About", "open") is not None, "intro is open on a new plan"
    assert "suicide prevention safety plan" in page.inner_text("#hw5About")
    assert "Stanley-Brown" in inner
    assert "Hopewick Plus" not in inner and "Upgrade" not in inner

    # Step 1, then jump to step 4 and add a person with the keyboard only.
    page.fill("#hw5Step-warningSigns", "Thinking what's the point sspui")
    page.click(".hw5-steps__btn >> nth=3")
    page.wait_for_selector("#hw5QA-person-name")
    assert page.inner_text("label[for='hw5QA-person-name']") == "Their name"
    assert page.inner_text("label[for='hw5QA-person-phone']") == "Phone"
    page.focus("#hw5QA-person-name")
    page.keyboard.type("Sam")
    page.keyboard.press("Tab")
    page.keyboard.type("0400 111 222")
    page.keyboard.press("Tab")
    assert page.evaluate("() => document.activeElement.id") == "hw5QA-person-add"
    page.keyboard.press("Enter")
    assert page.input_value("#hw5Step-people") == "Sam, 0400 111 222"
    assert page.evaluate("() => document.activeElement.id") == "hw5QA-person-name"

    # Step 5: prefilled services with tap-to-call links, plus GP and caseworker fields.
    page.click("#hw5Next")
    page.wait_for_selector("#hw5StepServicesList")
    links = dict(_links(page, "#hw5StepServicesList a"))
    for tel, num in PREFILLED.items():
        assert tel in links and num in links[tel], tel
    page.fill("#hw5QA-gp-name", "Dr Lee")
    page.fill("#hw5QA-gp-phone", "07 3000 1234")
    page.click("#hw5QA-gp-add")
    page.fill("#hw5QA-case-name", "Ana")
    page.fill("#hw5QA-case-phone", "0400 333 444")
    page.click("#hw5QA-case-add")
    assert page.input_value("#hw5Step-professionals") == "GP: Dr Lee, 07 3000 1234\nCaseworker: Ana, 0400 333 444"

    # Step 7 and save.
    page.click(".hw5-steps__btn >> nth=6")
    page.fill("#hw5Step-reasons", "My dog")
    page.click("#hw5Save")
    page.wait_for_selector("#hw5Plan")
    plan_links = dict(_links(page, "#hw5Plan a.hw5-tel"))
    assert "tel:0400111222" in plan_links and "tel:0730001234" in plan_links
    for tel in PREFILLED:
        assert tel in plan_links, f"{tel} on the saved plan"
    assert "Print or save as PDF" in page.inner_text("#hw5Print")
    saved = _api(page, "GET", "/api/me/safety-plan")["body"]["safety"]
    assert saved["people"] == ["Sam, 0400 111 222"]
    assert saved["professionals"] == ["GP: Dr Lee, 07 3000 1234", "Caseworker: Ana, 0400 333 444"]
    assert "sspui" not in (data_dir / "wellbeing.json").read_text(encoding="utf-8"), "encrypted at rest"

    # Reload: it loads back from the account; the intro folds away once there is a plan.
    page.reload()
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile && window.HW3 && HW3.state.loaded", timeout=20000)
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    page.evaluate("() => HW5.openSafety()")
    page.wait_for_selector("#hw5Plan")
    assert "Thinking what's the point sspui" in page.inner_text("#hw5Plan")
    assert page.get_attribute("#hw5About", "open") is None

    # Dark mode: same screen, no errors; the danger notice stays legible.
    page.evaluate("() => document.documentElement.setAttribute('data-theme', 'dark')")
    color = page.evaluate("() => getComputedStyle(document.querySelector('#hw5Urgent')).color")
    bg = page.evaluate("() => getComputedStyle(document.querySelector('#hw5Urgent')).backgroundColor")
    assert color != bg
    assert _quiet(errors) == []


def test_signed_out_plan_still_works_in_this_browser(server, browser):
    """Signed out, the plan still opens (saved in this browser, as before) with the intro, 000 notice and services."""
    base, _ = server
    page, errors = _page(browser)
    page.goto(f"{base}/app/", wait_until="domcontentloaded")
    page.wait_for_selector("#signInDlg[open]")
    page.evaluate("() => { document.getElementById('signInDlg').close(); setAppTab('safety'); }")
    page.wait_for_selector("#hw5StepForm")
    assert "saved in this browser only" in page.inner_text("#hw3Inner")
    assert "immediate danger" in page.inner_text("#hw5Urgent")
    assert page.is_visible("#hw5About")
    page.click(".hw5-steps__btn >> nth=4")
    page.wait_for_selector("#hw5StepServicesList")
    assert sorted(h for h, _ in _links(page, "#hw5StepServicesList a")) == sorted(PREFILLED)
    assert page.is_visible("#hw5QA-gp-name") and page.is_visible("#hw5QA-case-name")
    assert _quiet(errors) == []
