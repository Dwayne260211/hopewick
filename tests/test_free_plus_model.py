# -*- coding: utf-8 -*-
"""Founder-approved free vs Plus model, end to end in a browser.

Free: basic journal writing, the daily check-in, the 12 core coping tools, My
next step, safety plan essentials, export and delete, never capped. In-app
history shows the last 7 days; older items are counted and kept.
Plus: full history, monthly insights, the printable report, weekly plans,
journal refinements and new content first. Lapsed Plus keeps everything.
Real local server (JSON store). Nothing touches Stripe, email or production.
"""
from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import PLUS_EMAIL, go, live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page  # noqa: E402


@pytest.fixture(scope="module")
def server():
    with live_server() as (base, data_dir):
        yield base, data_dir


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _quiet(errors):
    return [e for e in errors if "Failed to load resource" not in e]


def _days_ago(page, n):
    return page.evaluate("(n) => { const t = brisbaneDateISO(); const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }", n)


def _seed(page, days=(0, 3, 10, 40)):
    for n in days:
        r = _api(page, "PUT", f"/api/me/checkins/{_days_ago(page, n)}", {"mood": 3, "triggers": ["Work"], "craving": "Mild"})
        assert r["status"] == 200, r
    page.evaluate("() => HW3.sync(true)")


def test_free_history_window_export_delete_and_compare(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="fp-free@example.test")
    _seed(page)
    go(page, "checkin")
    page.wait_for_selector("#hw3CheckinWindow")
    note = page.inner_text("#hw3CheckinWindow")
    assert "2 older check-ins are saved" in note
    assert "See your full history with Plus" in note
    # Month view is Plus; the week stays free.
    assert "Plus" in page.inner_text("#hw3TrendMonth")
    page.click("#hw3TrendMonth")
    page.wait_for_selector("#hw3MonthPlus")
    assert "Your last 7 days are always here, free" in page.inner_text("#hw3MonthPlus")
    assert page.locator("#hw3Insights").count() == 0
    # Export includes everything, even outside the window.
    with page.expect_download() as dl:
        page.click("#hw3ExportAll")
    import json
    data = json.loads(Path(dl.value.path()).read_text(encoding="utf-8"))
    assert len(data["checkins"]) == 4
    # Upgrade goes to the existing checkout flow.
    with page.expect_request("**/api/billing/checkout") as req:
        page.click("#hw3CheckinWindowPlus")
    assert req.value.method == "POST"
    # Delete stays free.
    page.reload()
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile && window.HW3 && HW3.state.loaded", timeout=20000)
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    go(page, "checkin")
    page.select_option("#hw3DelArea", "checkins")
    page.once("dialog", lambda d: d.accept())
    page.click("#hw3DelBtn")
    page.wait_for_function("() => HW3.state.checkins.length === 0 && !document.getElementById('hw3CheckinWindow')")
    assert _api(page, "GET", "/api/me/export")["body"]["checkins"] == []
    # Comparison view: always-free list and honest "coming soon".
    go(page, "compare")
    text = page.inner_text("#hw3Inner")
    for must in ["Always free, never capped", "My safety plan essentials", "Daily check-in", "Coming soon", "AU$20 a month, with a 7-day free trial", "15 messages a day"]:
        assert must in text, must
    assert page.locator("#hw3CompareUpgrade").is_visible()
    assert not _quiet(errors), errors


def test_free_journal_writes_basic_entries_plus_kinds_locked(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="fp-journal@example.test")
    page.evaluate("() => setAppTab('journal')")
    page.wait_for_selector("#journalWorkspace:not([hidden])")
    assert page.locator("#jRefineBtn").is_hidden()
    assert page.locator("#jKind option[value=gratitude]").is_disabled()
    # Packs are teaser-only for free.
    assert page.locator("#jPack option[value='first-30-days']").is_disabled()
    page.fill("#jBody", "Free can write this")
    page.click("#jSaveBtn")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('Free can write this')")
    entries = _api(page, "GET", "/api/me/journal")["body"]["entries"]
    assert len(entries) == 1 and entries[0]["kind"] == "free"
    # The server refuses Plus kinds and Deepen with Hope for free, whatever the browser sends.
    assert _api(page, "POST", "/api/me/journal", {"body": "x", "kind": "recovery"})["status"] == 403
    refine = page.evaluate("""async () => (await fetch('/api/hope/chat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'refine', aiConsent: 'once', messages: [{ role: 'user', content: 'Entry:\\nhello' }] }) })).status""")
    assert refine == 403
    assert not _quiet(errors), errors


def test_free_coping_teaser_and_plus_sees_new_drop(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="fp-cope@example.test")
    go(page, "coping")
    page.wait_for_selector("#hw3CopeSoon")
    soon = page.inner_text("#hw3CopeSoon")
    assert "Self-compassion break" in soon
    assert "New for Plus this week" in soon and "Coming to free in April 2027" in soon
    assert page.locator('[aria-label$=": Self-compassion break"]').count() == 0
    assert page.locator('#hw3ToolList > li').count() == 12
    assert not _quiet(errors), errors

    plus, perrors = _page(browser)
    sign_in(plus, base, email=PLUS_EMAIL)
    go(plus, "coping")
    plus.wait_for_selector('[aria-label$=": Self-compassion break"]')
    assert plus.locator("#hw3CopeSoon").count() == 0
    assert "New for Plus this week" in plus.inner_text("#hw3ToolList")
    plus.click('[aria-label$=": Self-compassion break"]')
    plus.wait_for_selector("#hw3PlayerTitle")
    assert "Self-compassion break" in plus.inner_text("#hw3PlayerTitle")
    assert not _quiet(perrors), perrors


def test_plus_full_history_insights_report_weekly_plan(server, browser):
    base, _ = server
    page, errors = _page(browser, width=1280, height=1000)
    sign_in(page, base, email=PLUS_EMAIL)
    _seed(page)
    go(page, "checkin")
    page.wait_for_selector("#hw3Insights ul.hw3-insights li")
    assert page.locator("#hw3CheckinWindow").count() == 0
    assert "You checked in on" in page.inner_text("#hw3Insights")
    page.click("#hw3TrendMonth")
    assert "last 30 days" in page.inner_text("#hw3TrendSummary")
    assert page.locator("#hw3MonthPlus").count() == 0
    page.evaluate("() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }")
    page.click("#hw3ReportBtn")
    page.wait_for_selector("#hw3Print")
    rep = page.inner_text("#hw3Print")
    assert "Hopewick mood and recovery report" in rep and "not a clinical assessment" in rep
    assert page.evaluate("() => window.__printed") == 1
    page.click("#hw3PrintClose")
    assert page.locator("#hw3Print").count() == 0
    # Weekly multi-step plan.
    go(page, "nextstep")
    page.fill("#hw3WeekTitle", "Steady week")
    page.fill("#hw3WeekSteps", "Call Sam\nGo to a meeting\nCook dinner twice")
    page.click("#hw3WeekSave")
    page.wait_for_selector("#hw3WeeklyName")
    assert "0 of 3 done" in page.inner_text("#hw3WeeklyName")
    page.check("#hw3Wk-0")
    page.wait_for_function("() => document.getElementById('hw3WeeklyName').textContent.includes('1 of 3 done')")
    plans = _api(page, "GET", "/api/me/weekly-plans")["body"]["plans"]
    assert plans[0]["steps"][0]["done"] is True
    assert not _quiet(errors), errors


def test_safety_plan_is_free_and_lapsed_plus_keeps_everything(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="fp-lapsed@example.test")
    assert _api(page, "POST", "/api/billing/dev-set", {"status": "active"})["status"] == 200
    page.evaluate("() => refreshBilling && refreshBilling()")
    _seed(page)
    assert _api(page, "POST", "/api/me/weekly-plans", {"title": "Plus week", "steps": ["One", "Two"]})["status"] == 201
    assert _api(page, "POST", "/api/me/journal", {"body": "grateful", "kind": "gratitude"})["status"] == 201
    # Plus lapses.
    assert _api(page, "POST", "/api/billing/dev-set", {"status": "canceled"})["status"] == 200
    page.reload()
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile && window.HW3 && HW3.state.loaded && !subscriptionPlus()", timeout=20000)
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    go(page, "checkin")
    page.wait_for_selector("#hw3CheckinWindow")
    go(page, "nextstep")
    assert "Plus week" in page.inner_text("#hw3Weekly"), "weekly plan kept and visible"
    assert page.locator("#hw3Wk-0").is_disabled()
    ex = _api(page, "GET", "/api/me/export")["body"]
    assert len(ex["checkins"]) == 4 and len(ex["weeklyPlans"]) == 1 and len(ex["journal"]) == 1
    # Safety plan essentials: free, saved to the account.
    go(page, "safety")
    assert "Call 000" in page.inner_text("#hw3Inner")
    page.fill("#hw3Safe-people", "Sam 0400 000 000")
    page.fill("#hw3Safe-warningSigns", "Not sleeping\nSkipping meals")
    page.click("#hw3SafetySave")
    page.wait_for_function("() => HW3.state.safety && HW3.state.safety.people.length === 1")
    assert _api(page, "GET", "/api/me/safety-plan")["body"]["safety"]["warningSigns"] == ["Not sleeping", "Skipping meals"]
    assert not _quiet(errors), errors
