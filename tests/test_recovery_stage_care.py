# -*- coding: utf-8 -*-
"""Anger and Relationships topics, recovery stage (incl. first-week mode), Body basics and
Share with my worker, end to end in Chromium at desktop and mobile widths against the
real local server (JSON store). Screenshots go to /workspace/hopewick-feature-shots/
(override with HOPEWICK_SHOTS). Nothing touches Stripe, email, Neon or production.
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page, _quiet  # noqa: E402

SHOTS = Path(os.environ.get("HOPEWICK_SHOTS", "/workspace/hopewick-feature-shots"))
SAFETY = "Not a crisis service. In crisis? Call 000 or Lifeline 13 11 14."
TEST_KEY = base64.b64encode(os.urandom(32)).decode()


@pytest.fixture(scope="module")
def server():
    with live_server({"HOPEWICK_DATA_KEY": TEST_KEY, "HOPEWICK_DATA_KEY_ID": "rsc"}) as (base, data_dir):
        yield base, data_dir


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def shot(page, name):
    """Grow the viewport to the open screen's height so the whole screen is in the picture."""
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.wait_for_timeout(250)
    page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
    vp = page.viewport_size
    tall = page.evaluate("""() => { const v = [...document.querySelectorAll('#homeView, #hwFeatureView')].find((n) => !n.hidden);
      return v ? v.scrollHeight + v.getBoundingClientRect().top + 120 : 0; }""")
    page.set_viewport_size({"width": vp["width"], "height": max(vp["height"], min(int(tall), 6000))})
    page.wait_for_timeout(200)
    page.screenshot(path=str(SHOTS / f"{name}.png"))
    page.set_viewport_size(vp)


def tab(page, t, opts=None):
    page.evaluate("([t, o]) => setAppTab(t, o || {})", [t, opts])
    if t == "home":
        page.wait_for_selector("#homeInner #dashTip")
    else:
        page.wait_for_selector(f"#hw3Inner[data-tab='{t}']")


@pytest.mark.parametrize("label,width,height", [("desktop", 1280, 900), ("mobile", 390, 844)])
def test_new_features(server, browser, label, width, height):
    base, _ = server
    page, errors = _page(browser, width=width, height=height)
    sign_in(page, base, email=f"care-{label}@example.test")

    # Data to share: two check-ins, a safety plan and a journal entry.
    today = page.evaluate("() => HW3.kit.todayIso()")
    yday = page.evaluate("() => HW3.kit.addDays(HW3.kit.todayIso(), -1)")
    for d, m in ((yday, 2), (today, 3)):
        r = _api(page, "PUT", f"/api/me/checkins/{d}", {"mood": m, "feelings": "tired but okay", "triggers": ["Stress"], "intensity": 5})
        assert r["status"] == 200, r
    assert _api(page, "PUT", "/api/me/safety-plan", {"safety": {"warningSigns": ["Not sleeping"], "people": ["Alex 0400 111 222"], "reasons": ["My dog"]}})["status"] == 200
    page.evaluate("() => HW3.sync(true)")

    # 1 + 2. About you: Anger, Relationships and a stage, saved on the account.
    tab(page, "preferences")
    page.wait_for_selector("#hw5PrefsForm")
    page.click("#hw5Focus-anger")
    page.click("#hw5Focus-relationships")
    page.check("#hw5Stage-month")
    shot(page, f"{label}-01-about-you-stage-and-topics")
    page.click("#hw5PrefsForm button[type=submit]")
    page.wait_for_timeout(500)
    prefs = _api(page, "GET", "/api/me/preferences")["body"]["preferences"]
    assert prefs["recoveryStage"] == "month"
    assert {"anger", "relationships"} <= set(prefs["focusAreas"])

    tab(page, "home")
    tip = page.inner_text("#dashTip")
    assert "Tip for today" in tip and "first month" in tip
    shot(page, f"{label}-02-home-tip-for-today")

    for topic in ("anger", "relationships"):
        tab(page, "topic", {"topic": topic})
        txt = page.inner_text("#hw3Inner")
        assert SAFETY in txt
        assert ("HALT" in txt) if topic == "anger" else ("Boundaries" in txt and "Loneliness" in txt)
        shot(page, f"{label}-03-topic-{topic}")

    tab(page, "checkin")
    page.wait_for_selector(".hwc-prompt")
    assert "angry" in page.inner_text(".hwc-prompt")

    # 3. Body basics: ticks stay on this device after a reload.
    tab(page, "bodybasics")
    txt = page.inner_text("#hw3Inner")
    assert SAFETY in txt and "Talk to your GP or a health professional for advice that fits you." in txt
    page.check("#hwcTick-water")
    page.check("#hwcTick-caffeine")
    shot(page, f"{label}-04-body-basics")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("() => window.HW3 && typeof setAppTab === 'function' && typeof billingState !== 'undefined' && billingState.signedIn")
    page.wait_for_timeout(600)
    if page.locator("#disclaimerDlg[open]").count():
        page.click("#discOkBtn")
        page.wait_for_function("() => document.getElementById('disclaimerDlg').open !== true")
    tab(page, "bodybasics")
    assert page.is_checked("#hwcTick-water") and not page.is_checked("#hwcTick-food")

    # 4. Share with my worker: journal off by default, preview, print, copy. Nothing posted.
    posts = []
    page.on("request", lambda r: posts.append(r.url) if r.method in ("POST", "PUT", "PATCH") else None)
    page.evaluate("() => HW3.sync(true)")
    page.wait_for_timeout(400)
    page.evaluate("() => { journal.push({ id: 'j1', title: 'Rough night', body: 'Hard to sleep.', created: Date.now(), updated: Date.now() }); }")
    tab(page, "share")
    txt = page.inner_text("#hw3Inner")
    assert "Only you choose what to share. Nothing is sent unless you send it." in txt and SAFETY in txt
    assert not page.is_checked("#hwcInc-journal")
    prev = page.inner_text("#hwcPreview")
    assert "CHECK-INS AND MOOD" in prev and "Okay" in prev and "SAFETY PLAN" in prev and "Not sleeping" in prev
    assert "BODY BASICS" in prev and "Water: 1 of 1" in prev
    assert "Rough night" not in prev
    shot(page, f"{label}-05-share-default")
    page.check("#hwcInc-journal")
    page.wait_for_function("() => document.getElementById('hwcPreview').textContent.includes('Rough night')")
    page.click("#hwcLast7")
    shot(page, f"{label}-06-share-with-journal")
    page.evaluate("() => document.body.classList.add('hwc-printing')")
    page.emulate_media(media="print")
    shot(page, f"{label}-07-share-print-view")
    page.emulate_media(media="screen")
    page.evaluate("() => document.body.classList.remove('hwc-printing')")
    page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
    page.click("#hwcCopy")
    page.wait_for_timeout(300)
    assert "CHECK-INS AND MOOD" in page.evaluate("() => navigator.clipboard.readText()")
    assert not posts, f"share sent data: {posts}"

    # First-week mode: fewer cards, bigger buttons, the basics.
    assert _api(page, "PATCH", "/api/me/preferences", {"recoveryStage": "week"})["status"] == 200
    page.evaluate("() => HW5.load(true)")
    page.wait_for_timeout(300)
    tab(page, "home")
    assert page.is_visible("#dashFirstWeek")
    fw = page.inner_text("#dashFirstWeek")
    assert "water" in fw.lower() and "tea and coffee" in fw and SAFETY in fw
    assert not page.is_visible("#dashGoals") and not page.is_visible("#todayCard")
    h = page.eval_on_selector("#hwcWeekHelp", "b => b.getBoundingClientRect().height")
    assert h >= 54, h
    shot(page, f"{label}-08-first-week-home")
    tab(page, "bodybasics")
    shot(page, f"{label}-09-first-week-body-basics")
    assert not _quiet(errors), _quiet(errors)
