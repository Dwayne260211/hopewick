# -*- coding: utf-8 -*-
"""Stage 5: safety plan builder, optional faith layer (off by default), personalisation,
sign-in-first, end to end in Chromium against the real local server (JSON store,
throwaway HOPEWICK_DATA_KEY). Nothing touches Stripe, email, Neon or production.
Screenshots go to /workspace/hopewick-2.0/stage5-screens/ when that folder exists.
"""
from __future__ import annotations

import base64
import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import go, live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page, _quiet  # noqa: E402

TEST_KEY = base64.b64encode(os.urandom(32)).decode()
SHOTS = Path("/workspace/hopewick-2.0/stage5-screens")
FAITH_WORDS = re.compile(r"\b(god|jesus|christ\w*|lord|pray\w*|scripture|bible|psalm|church\w*|faith\w*|gospel|amen|devotion\w*|soap|sermon|worship)\b", re.I)
SCREENS = ["home", "checkin", "coping", "safety", "recovery", "modules", "compare", "tools", "learn", "journal", "nextstep", "chat"]


def shot(page, name):
    """Tall viewport so the inner scrolling view is captured whole; toasts hidden; animations settled."""
    if not SHOTS.is_dir():
        return
    vp = page.viewport_size
    page.add_style_tag(content=".toast, #toasts, .toast-wrap { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }")
    page.wait_for_timeout(300)
    tall = page.evaluate("""() => { const ids = ['hwFeatureView', 'homeView', 'journalView', 'messages']; let h = document.documentElement.scrollHeight;
      for (const id of ids) { const n = document.getElementById(id); if (n && !n.hidden && n.offsetParent !== null) h = Math.max(h, n.scrollHeight + 260); } return Math.min(h, 5000); }""")
    page.set_viewport_size({"width": vp["width"], "height": max(vp["height"], tall)})
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / f"{name}.png"))
    page.set_viewport_size(vp)


@pytest.fixture(scope="module")
def server():
    with live_server({"HOPEWICK_DATA_KEY": TEST_KEY, "HOPEWICK_DATA_KEY_ID": "t5"}) as (base, data_dir):
        yield base, data_dir


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _visible_text(page):
    return page.evaluate("() => document.body.innerText")


def _faith_hits(page):
    return sorted({m.group(0).lower() for m in FAITH_WORDS.finditer(_visible_text(page))})


@pytest.mark.parametrize("width,label", [(390, "mobile"), (1280, "desktop")])
def test_faith_off_shows_nothing(server, browser, width, label):
    base, _ = server
    page, errors = _page(browser, width=width)
    sign_in(page, base, email=f"s5-off-{label}@example.test")
    assert page.evaluate("() => settings.faith") == "none", "faith is off by default"
    prefs = _api(page, "GET", "/api/me/preferences")["body"]["preferences"]
    assert prefs["faithOptIn"] is False
    for tab in SCREENS:
        page.evaluate("(t) => setAppTab(t)", tab)
        page.wait_for_timeout(500)
        assert _faith_hits(page) == [], f"{tab} ({label}) shows faith content with faith off"
    # Help dialog: no church finder when faith is off; the safety plan is one tap away.
    page.evaluate("() => openHelp()")
    page.wait_for_selector("#helpDlg[open]")
    assert _faith_hits(page) == []
    assert page.is_visible("#helpSafetyPlanBtn")
    assert not page.is_visible("#helpChurchBtn")
    page.evaluate("() => document.getElementById('helpDlg').close()")
    # The faith modules are not even listed.
    rel = _api(page, "GET", "/api/content/releases")["body"]
    assert not [i for i in rel["items"] if "faith" in i["id"]]
    assert _api(page, "GET", "/api/me/faith?context=home")["body"] == {"enabled": False, "items": []}
    page.evaluate("() => setAppTab('home')")
    page.wait_for_selector("#dashForYou")
    shot(page, f"faith-off-home-{label}")
    assert _quiet(errors) == []


def test_faith_on_shows_reflections_and_modules_then_off_again(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="s5-on@example.test")
    go(page, "preferences")
    page.wait_for_selector("#hw5PrefsForm")
    assert page.get_attribute("#hw5FaithSwitch", "aria-checked") == "false"
    page.click("#hw5FaithSwitch")
    page.wait_for_selector("#hw5Tradition")
    assert page.input_value("#hw5Tradition") == "christian"
    shot(page, "prefs-faith-on-mobile")
    page.click("#hw5PrefsSave")
    page.wait_for_function("() => window.HW5 && HW5.christianOn()")
    assert page.evaluate("() => settings.faith") == "christian"
    page.evaluate("() => setAppTab('home')")
    page.wait_for_selector("#hw5FaithHome")
    home = page.inner_text("#hw5FaithHome")
    assert "World English Bible" in home and "pastoral review" in home
    assert page.evaluate("() => !!todayCardEl().querySelector('.today-word')"), "Word for the day is back with faith on"
    shot(page, "faith-on-home-mobile")
    go(page, "checkin")
    page.wait_for_selector("#hw3Inner .hw5-faith")
    go(page, "coping")
    page.wait_for_selector("#hw3Inner .hw5-faith")
    shot(page, "faith-on-coping-mobile")
    page.evaluate("() => setAppTab('journal')")
    page.wait_for_selector("#hw5JournalFaith .hw5-faith")
    go(page, "modules")
    page.wait_for_function("() => document.getElementById('hw3Inner').innerText.includes('Faith on hard days')")
    shot(page, "faith-on-modules-mobile")
    # Another tradition: Hope respects it, but the Christian content stays hidden.
    go(page, "preferences")
    page.select_option("#hw5Tradition", "buddhist")
    page.wait_for_selector("#hw5TradNote")
    page.click("#hw5PrefsSave")
    page.wait_for_function("() => window.HW5 && HW5.faithOn() && !HW5.christianOn()")
    page.evaluate("() => setAppTab('home')")
    page.wait_for_timeout(500)
    assert page.locator("#hw5FaithHome").count() == 0
    # Off again: everything faith-related goes.
    go(page, "preferences")
    page.click("#hw5FaithSwitch")
    page.click("#hw5PrefsSave")
    page.wait_for_function("() => window.HW5 && !HW5.faithOn()")
    for tab in ["home", "checkin", "coping", "modules", "journal"]:
        page.evaluate("(t) => setAppTab(t)", tab)
        page.wait_for_timeout(500)
        assert _faith_hits(page) == [], tab
    assert page.evaluate("() => !todayCardEl().querySelector('.today-word')"), "Word for the day hidden with faith off"
    assert _quiet(errors) == []


def test_crisis_access_help_dialog_and_chat_card(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="s5-crisis@example.test")
    page.evaluate("() => openHelp()")
    page.wait_for_selector("#helpDlg[open]")
    shot(page, "help-dialog-safety-plan-mobile")
    page.click("#helpSafetyPlanBtn")
    page.wait_for_selector("#hw3Inner[data-tab='safety']")
    assert not page.is_visible("#helpDlg")
    # The crisis card in chat links to the plan too, without removing any number.
    page.evaluate("() => setAppTab('chat')")
    page.fill("#input", "I want to kill myself")
    page.keyboard.press("Enter")
    page.wait_for_selector(".crisis-card")
    card = page.inner_text(".crisis-card")
    for n in ["000", "13 11 14"]:
        assert n in card
    page.wait_for_selector("[data-crisis-safety]")
    shot(page, "crisis-card-safety-plan-mobile")
    page.click("[data-crisis-safety]")
    page.wait_for_selector("#hw3Inner[data-tab='safety']")
    errs = [e for e in _quiet(errors) if "hope" not in e.lower()]
    assert errs == []


def test_safety_builder_print_offline_share_versions(server, browser):
    base, data_dir = server
    page, errors = _page(browser)
    sign_in(page, base, email="s5-safety@example.test")
    page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed++; }; }")
    go(page, "safety")
    page.wait_for_selector("#hw5StepForm")
    assert "Step 1 of 7" in page.inner_text("#hw5StepCount")
    assert page.locator("#hw5Services a.hw5-call").count() == 8
    tels = page.eval_on_selector_all("#hw5Services a.hw5-call", "els => els.map(e => e.getAttribute('href'))")
    for t in ["tel:000", "tel:131114", "tel:1300659467", "tel:1300224636", "tel:139276", "tel:1800551800", "tel:1800184527", "tel:1800177833"]:
        assert t in tels
    shot(page, "safety-step1-mobile")
    answers = {
        "warningSigns": "Not sleeping s5secret",
        "copingThings": "Box breathing",
        "safePlaces": "The library",
        "people": "Sam 0400 111 222",
        "professionals": "My GP 07 3000 1234",
        "safeEnvironment": "Medicines with Mum",
        "reasons": "My kids",
    }
    for i, (k, v) in enumerate(answers.items()):
        page.wait_for_selector(f"#hw5Step-{k}")
        page.fill(f"#hw5Step-{k}", v)
        if i < 6:
            page.click("#hw5Next")
    page.click(".hw5-example >> nth=0")
    shot(page, "safety-step7-mobile")
    page.click("#hw5Save")
    page.wait_for_selector("#hw5Plan")
    assert page.get_attribute("#hw5Plan a.hw5-tel >> nth=0", "href") == "tel:0400111222"
    shot(page, "safety-summary-mobile")
    page.click("#hw5Print")
    assert page.evaluate("() => window.__printed") == 1
    with page.expect_download() as dl:
        page.click("#hw5Download")
    html = Path(dl.value.path()).read_text(encoding="utf-8")
    assert "Not sleeping s5secret" in html and 'href="tel:131114"' in html and "<script" not in html
    page.click("#hw5ShareBtn")
    page.wait_for_selector("#hw5Share")
    assert "Hopewick never sends it anywhere" in page.inner_text("#hw5Share")
    assert "Sam 0400 111 222" in page.input_value("#hw5ShareText")
    shot(page, "safety-share-mobile")
    raw = (data_dir / "wellbeing.json").read_text(encoding="utf-8")
    assert "s5secret" not in raw, "encrypted at rest"
    # Second save, then history and restore.
    page.click("#hw5Edit")
    page.fill("#hw5Step-warningSigns", "Skipping meals")
    page.click("#hw5Save")
    page.click("#hw5Tab-history")
    page.wait_for_selector("#hw5Restore-1")
    shot(page, "safety-history-mobile")
    page.click("#hw5View-1")
    page.wait_for_selector("#hw5View")
    assert "Not sleeping s5secret" in page.inner_text("#hw5View")
    page.once("dialog", lambda d: d.accept())
    page.click("#hw5Restore-1")
    page.wait_for_function("() => (document.getElementById('hw5History') || {}).innerText && document.getElementById('hw5History').innerText.includes('Version 3 (current)')")
    assert _api(page, "GET", "/api/me/safety-plan")["body"]["safety"]["warningSigns"] == ["Not sleeping s5secret"]
    assert _quiet(errors) == []


def test_sign_in_first_before_any_account_form(server, browser):
    base, _ = server
    page, errors = _page(browser)
    page.goto(f"{base}/app/", wait_until="domcontentloaded")
    page.wait_for_selector("#signInDlg[open]")
    for tab in ["recovery", "checkin", "mygoals", "nextstep"]:
        page.evaluate("(t) => setAppTab(t)", tab)
        page.wait_for_selector("#hw5SignInFirst")
        assert page.locator("#hw4GoalForm, #hw4AddFirst, #hw4LogForm, #hw3CheckinForm").count() == 0, tab
        assert page.locator("#hw3Inner textarea, #hw3Inner input").count() == 0, f"{tab}: nothing to type before signing in"
    page.evaluate("() => document.getElementById('signInDlg').close()")
    page.evaluate("() => setAppTab('recovery')")
    page.wait_for_selector("#hw5SignInFirst")
    shot(page, "sign-in-first-recovery-mobile")
    page.click("#hw5SignInBtn")
    page.wait_for_selector("#signInDlg[open]")
    # The safety plan still works signed out (saved in this browser).
    page.evaluate("() => { document.getElementById('signInDlg').close(); setAppTab('safety'); }")
    page.wait_for_selector("#hw5StepForm")
    assert "saved in this browser only" in page.inner_text("#hw3Inner")
    # ?demo=1 without an account asks to sign in first.
    page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
    page.wait_for_selector("#signInDlg[open]")
    assert "Sign in to open the demo" in page.inner_text("#signInLead")
    shot(page, "demo-needs-sign-in-mobile")
    assert _quiet(errors) == []


def test_preferences_edit_reset_and_for_you(server, browser):
    base, _ = server
    page, errors = _page(browser, width=1280)
    sign_in(page, base, email="s5-prefs@example.test")
    page.wait_for_selector("#dashForYouSetup")
    shot(page, "for-you-nudge-desktop")
    page.click("#dashForYouSetup")
    page.wait_for_selector("#hw5PrefsForm")
    page.fill("#hw5Name", "Jo")
    page.click("#hw5Focus-sleep")
    page.click("#hw5Focus-aod")
    page.check("#hw5Tone-direct")
    shot(page, "prefs-desktop")
    page.click("#hw5PrefsSave")
    page.wait_for_function("() => HW5.prefs().preferredName === 'Jo'")
    p = _api(page, "GET", "/api/me/preferences")["body"]["preferences"]
    assert p["focusAreas"] == ["aod", "sleep"] and p["tone"] == "direct" and p["faithOptIn"] is False and p["onboardedAt"]
    page.evaluate("() => setAppTab('home')")
    page.wait_for_selector("#dashForYouEdit")
    fy = page.inner_text("#dashForYou")
    assert "For you, Jo" in fy and "Recovery tracker" in fy and "Sleep basics module" in fy
    shot(page, "for-you-desktop")
    page.click("#dashForYouEdit")
    page.wait_for_selector("#hw5PrefsReset")
    page.once("dialog", lambda d: d.accept())
    page.click("#hw5PrefsReset")
    page.wait_for_function("() => HW5.prefs().preferredName === '' && !HW5.prefs().onboardedAt")
    assert page.input_value("#hw5Name") == ""
    assert _quiet(errors) == []


@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_screens_light_dark_mobile_desktop(server, browser, scheme):
    base, _ = server
    for width, label in [(390, "mobile"), (1280, "desktop")]:
        page, errors = _page(browser, width=width, color_scheme=scheme)
        sign_in(page, base, email=f"s5-shots-{scheme}-{label}@example.test")
        _api(page, "PUT", "/api/me/safety-plan", {"safety": {"warningSigns": ["Not sleeping"], "people": ["Sam 0400 111 222"], "reasons": ["My kids"]}})
        page.evaluate("() => { HW3.reset(); HW3.sync(true); }")
        page.wait_for_timeout(600)
        go(page, "safety")
        page.wait_for_selector("#hw5StepForm")
        shot(page, f"safety-builder-{label}-{scheme}")
        page.click("#hw5Tab-summary")
        page.wait_for_selector("#hw5Plan")
        shot(page, f"safety-summary-{label}-{scheme}")
        go(page, "preferences")
        page.wait_for_selector("#hw5PrefsForm")
        shot(page, f"preferences-{label}-{scheme}")
        page.evaluate("() => setAppTab('home')")
        page.wait_for_selector("#dashForYou")
        shot(page, f"home-{label}-{scheme}")
        assert _quiet(errors) == []
        page.context.close()


def test_app_without_slash_redirects(server, browser):
    base, _ = server
    page, errors = _page(browser)
    page.goto(f"{base}/app?tab=safety", wait_until="domcontentloaded")
    assert page.url == f"{base}/app/?tab=safety"
    assert page.evaluate("() => !!window.HW5 && !!window.HW3")
    assert _quiet(errors) == []
