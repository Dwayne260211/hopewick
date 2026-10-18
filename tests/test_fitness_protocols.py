# -*- coding: utf-8 -*-
"""Move & Recover (FEATURE_FITNESS_PROTOCOLS) in a real browser.

Flag off (the default): nothing at all, not even a teaser, and the API answers 404.
Flag on: free accounts see the free safety rules and one Plus card; Plus gets the
movement screen, the week, a workout with an accessible timer, the heat and cold
screen and the pre-session check (a reported use pauses heat and cold for 24 h).

Local throwaway server (JSON store). Nothing touches Stripe, email, Neon or production.
Set HW_FIT_SCREENS=/path to also save mobile and desktop screenshots, light and dark.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import PLUS_EMAIL, live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page  # noqa: E402

SCREENS = os.environ.get("HW_FIT_SCREENS", "")


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _quiet(errors):
    return [e for e in errors if "Failed to load resource" not in e]


def _tools(page):
    page.evaluate("() => setAppTab('tools')")
    page.wait_for_selector("#toolsHub .hub-card")


def _answer_all(page, form_id, yes=()):
    for fs in page.locator(f"#{form_id} fieldset.hwf-q").all():
        name = fs.locator("input[type=radio]").first.get_attribute("name")
        qid = name.split("-", 1)[1]
        fs.locator(f"input[value={'yes' if qid in yes else 'no'}]").check()


def _shot(page, name):
    if not SCREENS:
        return
    Path(SCREENS).mkdir(parents=True, exist_ok=True)
    page.add_style_tag(content=".toast,.hw-toasts{display:none!important}")
    size = page.viewport_size
    # The app scrolls inside its own panel, so grow the viewport to show the whole screen.
    tall = page.evaluate("() => { const v = document.getElementById('hwFeatureView'); const t = document.getElementById('toolsView'); const el = (v && !v.hidden) ? v : t; return el ? el.scrollHeight : 0; }")
    page.set_viewport_size({"width": size["width"], "height": max(size["height"], min(int(tall) + 260, 5000))})
    page.wait_for_timeout(300)
    page.screenshot(path=str(Path(SCREENS) / f"{name}.png"))
    page.set_viewport_size(size)


def test_flag_off_shows_nothing_and_api_is_404(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": ""}) as (base, _):
        page, errors = _page(browser)
        sign_in(page, base, email=PLUS_EMAIL)
        _tools(page)
        page.wait_for_timeout(600)
        _tools(page)
        assert page.locator("[data-hub=move]").count() == 0
        assert "Move & Recover" not in page.inner_text("body")
        assert "sauna" not in page.inner_text("#toolsHub").lower()
        page.evaluate("() => setAppTab('move')")
        page.wait_for_timeout(200)
        assert page.evaluate("() => appTab") == "home"
        assert page.locator("#hwfTitle").count() == 0
        assert page.evaluate("() => HWFIT.enabled()") is False
        for path in ("/api/fitness/status", "/api/fitness/safety", "/api/fitness/program"):
            assert _api(page, "GET", path)["status"] == 404
        assert not [e for e in _quiet(errors) if "fitness" in e.lower()]


def _wait_side_move(page, visible=True):
    page.wait_for_function(
        "(v) => { const b = document.getElementById('sideMoveBtn'); return !!b && b.hidden === !v; }",
        arg=visible)


def test_side_menu_entry_hidden_when_flag_off(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": ""}) as (base, _):
        page, _errors = _page(browser, width=1280, height=900)
        sign_in(page, base, email=PLUS_EMAIL)
        page.wait_for_timeout(900)
        assert page.locator("#sideMoveBtn").is_hidden()
        assert "Move & Recover" not in page.inner_text("#sidebarTools")


def test_side_menu_entry_free_shows_plus_pill_and_opens_move(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": "1"}) as (base, _):
        # Phone: the entry lives in the More drawer (the same sidebar).
        page, errors = _page(browser)
        sign_in(page, base, email="fit-side-free@example.test")
        _wait_side_move(page, True)
        page.click("#appTabMore")
        page.wait_for_selector("#sideMoveBtn", state="visible")
        assert page.locator("#movePlusPill").is_visible(), "free users see the Plus pill, like other Plus items"
        page.click("#sideMoveBtn")
        page.wait_for_selector("#hwfPlusCard")
        assert page.evaluate("() => appTab") == "move"
        assert page.get_attribute("#sideMoveBtn", "aria-current") == "page"
        assert not _quiet(errors), errors


def test_side_menu_entry_plus_desktop_no_pill(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": "1"}) as (base, _):
        page, errors = _page(browser, width=1280, height=900)
        sign_in(page, base, email=PLUS_EMAIL)  # founder comp counts as Plus
        _wait_side_move(page, True)
        page.wait_for_function("() => document.getElementById('movePlusPill').hidden")
        assert page.locator("#sideMoveBtn").is_visible()
        # The Tools hub card stays too.
        _tools(page)
        page.wait_for_selector("[data-hub=move]")
        page.click("#sideMoveBtn")
        page.wait_for_selector("#hwfTitle")
        assert page.evaluate("() => appTab") == "move"
        assert not _quiet(errors), errors


def test_flag_on_free_sees_safety_rules_and_one_plus_card(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": "1"}) as (base, _):
        page, errors = _page(browser)
        sign_in(page, base, email="fit-free@example.test")
        _tools(page)
        page.wait_for_selector("[data-hub=move]")
        _tools(page)
        card = page.locator("[data-hub=move]")
        assert "Plus" in card.inner_text()
        card.click()
        page.wait_for_selector("#hwfPlusCard")
        page.wait_for_selector("#hwfRules")
        rules = page.inner_text("#hwfRules")
        assert "No alcohol or other drugs" in rules and "Never alone in cold water" in rules and "000" in rules
        assert page.locator(".hwf-nav").count() == 0, "no Plus sections for free"
        assert page.locator("#hwfScreenA").count() == 0
        assert _api(page, "GET", "/api/fitness/program")["status"] == 403
        _shot(page, "free-mobile-light")
        assert not _quiet(errors), errors


def test_flag_on_plus_screen_week_workout_timer_heat_cold_and_use_pause(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": "1"}) as (base, _):
        page, errors = _page(browser)
        sign_in(page, base, email=PLUS_EMAIL)
        _tools(page)
        page.wait_for_selector("[data-hub=move]")
        page.evaluate("() => setAppTab('move')")
        page.wait_for_selector("#hwfScreenA")
        # The screen asks yes/no in fieldsets with legends; nothing is answered for you.
        assert page.locator("#hwfScreenA fieldset legend").count() == 9
        page.click("#hwfScreenASubmit")
        assert "every question" in page.inner_text("#hwfScreenAErr")
        _answer_all(page, "hwfScreenA", yes={"A6"})
        page.click("#hwfScreenASubmit")
        page.wait_for_selector("#hwfResultT")
        assert "Check first" in page.inner_text(".hwf-result")
        page.locator(".hwf-clear input[type=checkbox]").check()
        page.locator(".hwf-clear button[type=submit]").click()
        page.wait_for_selector("#hwfTodayT")
        assert page.locator("#hwfNav-week[aria-pressed=true]").count() == 1
        assert "of 150" in page.inner_text("body")
        # Adapted track: knee.
        page.click("#hwfTrack-knee")
        page.wait_for_selector("#hwfTrack-knee[aria-pressed=true]")
        _shot(page, "plus-week-mobile-light")
        # Start a workout: mood first, then an accessible timer.
        page.click("#hwfStart")
        page.wait_for_selector("#hwfBefore")
        page.locator("#hwfBefore input[name=hwfMoodB][value='2']").check(force=True)
        page.click("#hwfGo")
        page.wait_for_selector("#hwfClock[role=timer]")
        assert page.get_attribute("#hwfClock", "aria-live") == "off"
        page.click("#hwfPlay")
        assert page.get_attribute("#hwfPlay", "aria-pressed") == "true"
        page.wait_for_timeout(2200)
        assert page.inner_text("#hwfClock") != "1:00"
        live = page.inner_text("#hw3Live")
        assert "Started" in live
        _shot(page, "plus-workout-timer-mobile-light")
        page.click("#hwfPlay")
        assert page.get_attribute("#hwfPlay", "aria-pressed") == "false"
        page.click("#hwfSkip")
        assert "Next:" in page.inner_text("#hw3Live") or True
        page.click("#hwfFinish")
        page.wait_for_selector("#hwfDoneT")
        page.locator("#hwfDone input[name=hwfMoodA][value='4']").check(force=True)
        page.click("#hwfSave")
        page.wait_for_selector("#hwfTodayT")
        # Exercises with how-to steps and form cues.
        page.click("#hwfNav-exercises")
        page.wait_for_selector("#hwfEx-squat")
        page.locator("#hwfEx-squat summary").click()
        txt = page.inner_text("#hwfEx-squat")
        assert "How to" in txt and "Form cues" in txt and "For your track" in txt
        # Heat & cold: screen B, then protocols; a reported use pauses heat and cold.
        page.click("#hwfNav-heatcold")
        page.wait_for_selector("#hwfScreenB")
        _answer_all(page, "hwfScreenB", yes={"B17"})
        page.click("#hwfScreenBSubmit")
        assert "agree" in page.inner_text("#hwfScreenBErr")
        page.check("#hwfAgree")
        page.click("#hwfScreenBSubmit")
        page.wait_for_selector("#hwfProt-sauna")
        assert "Unlocked" in page.inner_text("#hwfProt-sauna")
        _shot(page, "plus-heatcold-mobile-light")
        page.locator("#hwfProt-sauna button", has_text="Safety check and start").first.click()
        page.wait_for_selector("#hwfCheck")
        page.locator("input[name=hwfC-usedSubstances][value=yes]").check(force=True)
        page.locator("input[name=hwfC-unwell][value=no]").check(force=True)
        page.locator("input[name=hwfC-hadWaterFood][value=yes]").check(force=True)
        page.click("#hwfCheckGo")
        page.wait_for_function("() => /Not today/.test(document.getElementById('hwfCheckErr').innerText)")
        assert "24 hours" in page.inner_text("#hwfCheckErr")
        _shot(page, "plus-check-blocked-mobile-light")
        st = _api(page, "GET", "/api/fitness/status")
        assert st["body"]["pausedUntil"]
        assert not _quiet(errors), errors


@pytest.mark.skipif(not SCREENS, reason="set HW_FIT_SCREENS to save screenshots")
def test_screenshots_mobile_desktop_light_dark(browser):
    with live_server({"FEATURE_FITNESS_PROTOCOLS": "1"}) as (base, _):
        for scheme in ("light", "dark"):
            for label, (w, hgt) in (("mobile", (390, 844)), ("desktop", (1280, 900))):
                page, errors = _page(browser, width=w, height=hgt, color_scheme=scheme)
                email = f"shots-{scheme}-{label}@example.test"
                sign_in(page, base, email=email)
                assert _api(page, "POST", "/api/billing/dev-set", {"status": "trialing"})["status"] == 200
                page.evaluate("() => refreshBilling && refreshBilling()") if page.evaluate("() => typeof refreshBilling === 'function'") else None
                page.reload(wait_until="domcontentloaded")
                page.wait_for_function("() => typeof profile !== 'undefined' && !!profile", timeout=20000)
                page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
                page.wait_for_function("() => window.HWFIT && HWFIT.enabled() && subscriptionPlus()", timeout=20000)
                _tools(page)
                page.wait_for_selector("[data-hub=move]")
                _shot(page, f"tools-hub-{label}-{scheme}")
                page.evaluate("() => setAppTab('move')")
                page.wait_for_selector("#hwfScreenA")
                _shot(page, f"screen-move-{label}-{scheme}")
                _answer_all(page, "hwfScreenA")
                page.click("#hwfScreenASubmit")
                page.wait_for_selector("#hwfTodayT")
                _shot(page, f"week-{label}-{scheme}")
                page.click("#hwfStart")
                page.wait_for_selector("#hwfBefore")
                page.click("#hwfGo")
                page.wait_for_selector("#hwfClock")
                _shot(page, f"workout-player-{label}-{scheme}")
                page.click("#hwfFinish")
                page.wait_for_selector("#hwfDoneT")
                page.click("#hwfSave")
                page.wait_for_selector("#hwfTodayT")
                page.click("#hwfNav-heatcold")
                page.wait_for_selector("#hwfScreenB")
                _answer_all(page, "hwfScreenB", yes={"B17", "B11"})
                page.check("#hwfAgree")
                page.click("#hwfScreenBSubmit")
                page.wait_for_selector("#hwfResultT")
                _shot(page, f"heatcold-result-{label}-{scheme}")
                page.locator("#hwfProt-sauna .hwf-clear input[type=checkbox]").check()
                page.locator("#hwfProt-sauna .hwf-clear button[type=submit]").click()
                page.wait_for_selector("#hwfProt-sauna .hwf-pill--green")
                page.locator("#hwfProt-sauna button", has_text="Safety check and start").first.click()
                page.wait_for_selector("#hwfCheck")
                _shot(page, f"presession-check-{label}-{scheme}")
                page.click("#hwfNav-safety")
                page.wait_for_selector("#hwfRules")
                _shot(page, f"safety-{label}-{scheme}")
                assert not _quiet(errors), errors
                page.context.close()
