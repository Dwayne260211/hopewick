# -*- coding: utf-8 -*-
"""Stage 4: recovery tracker and interactive learning modules, end to end.

Real local server (tests/stage3_server.mjs, JSON store, HOPEWICK_DATA_KEY set
to a throwaway test key). Nothing touches Stripe, email, Neon or production.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import PLUS_EMAIL, go, live_server, sign_in  # noqa: E402
from test_stage3_features import _api, _page, _quiet  # noqa: E402

TEST_KEY = base64.b64encode(os.urandom(32)).decode()


@pytest.fixture(scope="module")
def server():
    with live_server({"HOPEWICK_DATA_KEY": TEST_KEY, "HOPEWICK_DATA_KEY_ID": "t4"}) as (base, data_dir):
        yield base, data_dir


@pytest.fixture(scope="module")
def preview_server(tmp_path_factory):
    """A test-only release file with every module's Plus date pulled back to 2026-10-01, so Plus
    sees the whole queue. The shipped schedule (server/library/content-releases.json) is untouched."""
    src = json.loads((Path(__file__).resolve().parent.parent / "server" / "library" / "content-releases.json").read_text(encoding="utf-8"))
    for item in src["items"]:
        if item.get("kind") == "module" and not item.get("core"):
            item["plusReleaseDate"] = "2026-10-01"
            item.pop("freeReleaseDate", None)
    f = tmp_path_factory.mktemp("rel") / "releases.json"
    f.write_text(json.dumps(src), encoding="utf-8")
    with live_server({"HOPEWICK_DATA_KEY": TEST_KEY, "HOPEWICK_DATA_KEY_ID": "t4", "HOPEWICK_RELEASES_PATH": str(f)}) as (base, data_dir):
        yield base, data_dir


@pytest.fixture()
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _raw(data_dir):
    return (data_dir / "wellbeing.json").read_text(encoding="utf-8")


def _days_ago(page, n):
    return page.evaluate("(n) => { const t = brisbaneDateISO(); const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }", n)


def test_free_tracker_goal_craving_lapse_gentle_counts(server, browser):
    base, data_dir = server
    page, errors = _page(browser)
    sign_in(page, base, email="s4-free@example.test")
    go(page, "recovery")
    page.wait_for_selector("#hw4Empty")
    assert "Recovery tracker" in page.inner_text("#hw3Title")
    page.click("#hw4AddFirst")
    page.wait_for_selector("#hw4GoalForm")
    # The goal kind is a real radio group: arrow keys move the choice.
    page.focus("#hw4Kind-abstain")
    page.keyboard.press("ArrowRight")
    assert page.get_attribute("#hw4Kind-reduce", "aria-checked") == "true"
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4Kind-reduce'")
    page.keyboard.press("ArrowLeft")
    page.fill("#hw4GoalLabel", "Alcohol s4secretlabel")
    page.fill("#hw4GoalStart", _days_ago(page, 40))
    page.fill("#hw4GoalWhy", "for my kids s4secretwhy")
    page.click("#hw4GoalSave")
    card = page.locator(".hw4-goal").first
    card.wait_for()
    text = card.inner_text()
    assert "Day 41" in text and "41" in text and "days went to plan" in text
    assert "1 week" in text and "30 days" in text, "milestones reached"
    assert "Next: 60 days" in text

    # Log a craving.
    card.get_by_role("button", name="Log a craving").click()
    page.wait_for_selector("#hw4LogForm")
    page.fill("#hw4LogStrength", "7")
    page.get_by_role("button", name="Payday").click()
    assert page.get_attribute("#hw4LogForm button.hw-chip:has-text('Payday')", "aria-pressed") == "true"
    page.fill("#hw4LogOwn", "s4secrettrigger")
    page.get_by_role("button", name="Add", exact=True).click()
    page.check("#hw4Out-passed")
    page.fill("#hw4LogHelped", "walked the dog")
    page.click("#hw4LogSave")
    page.wait_for_function("() => (document.getElementById('hw4Logs') || {}).innerText && document.getElementById('hw4Logs').innerText.includes('strength 7 of 10')")
    assert page.locator("#hw4LogForm").count() == 0

    # Log a lapse: kind, non-judgemental follow-up; counts never reset.
    page.locator(".hw4-goal").first.get_by_role("button", name="Log a lapse").click()
    page.fill("#hw4LogDate", _days_ago(page, 2))
    page.fill("#hw4LogNote", "s4secretnote")
    page.click("#hw4LogSave")
    page.wait_for_selector("#hw4AfterLapse")
    after = page.inner_text("#hw4AfterLapse")
    assert "do not wipe out" in after and "40 days that went to plan" in after and "day 41" in after
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4AfterLapseT'")
    for bad in ["fail", "relapsed", "start again", "reset"]:
        assert bad not in after.lower()
    goal = page.locator(".hw4-goal").first.inner_text()
    assert "Day 41" in goal and "2" in goal and "days since your last lapse" in goal
    assert "never resets" in goal

    # Trends are Plus; the free note is calm and the basics stay free.
    ins = page.inner_text("#hw4Insights")
    assert "part of Hopewick Plus" in ins and "stay free" in ins
    assert page.locator("#hw4Weeks").count() == 0

    # Saved to the account, encrypted at rest.
    raw = _raw(data_dir)
    for s in ["s4secretlabel", "s4secretwhy", "s4secrettrigger", "s4secretnote", "walked the dog"]:
        assert s not in raw, s
    assert "hwenc:v1:t4:" in raw
    exp = _api(page, "GET", "/api/me/export")
    assert exp["status"] == 200
    assert exp["body"]["recoveryTracker"]["goals"][0]["label"] == "Alcohol s4secretlabel"
    assert len(exp["body"]["recoveryTracker"]["logs"]) == 2

    # Delete the goal (and its logs) from the card.
    page.once("dialog", lambda d: d.accept())
    page.locator(".hw4-goal").first.get_by_role("button", name="Delete").click()
    page.wait_for_selector("#hw4Empty")
    assert _api(page, "GET", "/api/me/recovery")["body"]["logs"] == []
    assert _quiet(errors) == []


def test_free_modules_list_core_free_plus_first_locked(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="s4-mods@example.test")
    go(page, "modules")
    page.wait_for_selector("#hw4CoreT")
    assert "Pending clinical review" in page.inner_text("#hw4Review")
    core = page.locator("#hw4CoreT + ul > li")
    assert core.count() == 7
    titles = page.inner_text("#hw4CoreT + ul")
    for t in ["Cravings and triggers", "Sleep basics", "Stress and anxiety basics", "harm reduction", "Getting support in Australia", "CBT basics", "ACT basics"]:
        assert t in titles, t
    rel = _api(page, "GET", "/api/content/releases")["body"]["items"]
    plus_first = [r for r in rel if r["kind"] == "module" and not r["core"]]
    assert plus_first, "at least one Plus-first module is visible on launch day"
    assert all(not r["available"] and "content" not in r for r in plus_first), "a free account never receives Plus-first module text"
    extra = page.inner_text("#hw4ExtraT + p + ul")
    assert "Coming to free in" in extra and "See Hopewick Plus" in extra
    assert _quiet(errors) == []


def test_act_module_interactions_keyboard_reduced_motion(server, browser):
    base, data_dir = server
    page, errors = _page(browser, reduced_motion="reduce")
    sign_in(page, base, email="s4-act@example.test")
    page.evaluate("() => HW3.openModule('act-unhooking')")
    page.wait_for_selector("#hw4ModT")
    assert "Step 1 of 6" in page.inner_text("#hw4StepT")
    assert page.get_attribute(".hw4-player [role=progressbar]", "aria-valuetext") == "Step 1 of 6"
    # Tap-through cards with the keyboard.
    assert "1 of 4" in page.inner_text("#hw4Card")
    page.focus("#hw4CardNext")
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.getElementById('hw4Card').innerText.includes('2 of 4')")
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4CardNext'")
    assert "Getting hooked" in page.inner_text("#hw4Card")
    page.wait_for_function("() => document.getElementById('hw3Live').textContent.includes('Card 2 of 4')")
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.getElementById('hw4Card').innerText.includes('3 of 4') && document.activeElement.id === 'hw4CardNext'")
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.getElementById('hw4Card').innerText.includes('4 of 4')")
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4Card'")
    page.click("#hw4Next")
    # Guided defusion.
    page.wait_for_selector("#hw4Defuse")
    page.fill("#hw4Defuse", "I can't cope.")
    page.click("#hw4DefuseGo")
    assert page.inner_text("#hw4DefuseOne") == "I'm having the thought that I can't cope."
    page.click("#hw4DefuseGo")
    assert page.inner_text("#hw4DefuseTwo") == "I'm noticing I'm having the thought that I can't cope."
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4DefuseTwo'")
    assert page.evaluate("HW3.defuse('Nobody likes me').two") == "I'm noticing I'm having the thought that nobody likes me."
    # A thought about ending your life gets crisis support, not an exercise.
    page.click("#hw4DefuseGo")
    page.fill("#hw4Defuse", "I want to die")
    page.click("#hw4DefuseGo")
    crisis = page.inner_text("#hw4DefuseCrisis")
    assert "13 11 14" in crisis and "000" in crisis
    assert page.locator("#hw4DefuseOne").count() == 0
    assert "I want to die" not in _raw(data_dir) if (data_dir / "wellbeing.json").exists() else True
    page.click("#hw4Next")
    # Dropping anchor timer: text-led, still under reduced motion, pause and resume.
    page.wait_for_selector("#hw4Timer")
    assert page.locator(".hw4-timer--still").count() == 1
    assert page.inner_text("#hw4TimerLabel") == "Notice"
    page.click("#hw4TimerGo")
    page.wait_for_timeout(2200)
    left = int(page.inner_text("#hw4TimerCount"))
    assert left <= 10
    assert page.inner_text("#hw4TimerGo") == "Pause"
    page.click("#hw4TimerGo")
    page.wait_for_timeout(1300)
    assert int(page.inner_text("#hw4TimerCount")) == left, "paused"
    assert page.inner_text("#hw4TimerGo") == "Resume"
    page.click("#hw4Next")
    # Quiz with kind feedback.
    page.wait_for_selector("#hw4Quiz")
    page.click("#hw4QuizCheck")
    assert "Choose an answer" in page.inner_text("#hw4QuizResult")
    page.check("#hw4Q0o0")  # wrong
    page.check("#hw4Q1o1")  # right
    page.click("#hw4QuizCheck")
    assert "1 of 2" in page.inner_text("#hw4QuizResult")
    assert "Not quite" in page.inner_text("#hw4Fb0")
    assert page.inner_text("#hw4Fb1").startswith("✓")
    page.click("#hw4Next")
    # Optional private reflection: saved, encrypted, exportable, deletable.
    page.wait_for_selector("#hw4Reflect")
    page.fill("#hw4Reflect", "s4secretreflection about my thoughts")
    page.click("#hw4ReflectSave")
    page.wait_for_function("() => document.getElementById('hw4ReflectStatus').textContent.includes('Saved privately')")
    assert "s4secretreflection" not in _raw(data_dir)
    exp = _api(page, "GET", "/api/me/export")["body"]
    mod = [m for m in exp["learning"] if m["moduleId"] == "act-unhooking"][0]
    assert mod["notes"]["reflection"].startswith("s4secretreflection")
    assert mod["quiz"] == {"correct": 1, "total": 2}
    page.click("#hw4Next")
    # Try this today -> My next step.
    page.wait_for_selector("#hw4TryAdd")
    page.click("#hw4TryAdd")
    page.wait_for_function("() => document.getElementById('hw4TryStatus').textContent.includes('Added')")
    steps = _api(page, "GET", "/api/me/next-steps")["body"]["steps"]
    assert steps[0]["title"] == "Drop anchor once today" and steps[0]["status"] == "open"
    assert page.locator("#hw4TryTool").count() == 1
    # Sources and credit; finish.
    page.click("#hw4Sources summary")
    src = page.inner_text("#hw4Sources")
    assert "Russ Harris" in src and "not reproduced" in src and "No text, scripts or worksheets are copied" in src
    page.click("#hw4Next")
    page.wait_for_selector("#hw4Done")
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'hw4DoneT'")
    prog = _api(page, "GET", "/api/me/learning")["body"]["progress"]
    assert prog[0]["completedAt"]
    page.click("#hw4DoneAll")
    page.wait_for_selector("#hw4CoreT")
    assert "Done" in page.inner_text("#hw4M-act-unhooking")
    assert _quiet(errors) == []


def test_plus_values_sort_thought_record_and_tracker_trends(server, browser):
    base, data_dir = server
    page, errors = _page(browser, width=1280, height=900)
    sign_in(page, base, email=PLUS_EMAIL)
    rel = _api(page, "GET", "/api/content/releases")["body"]["items"]
    dbt = [r for r in rel if r["key"] == "dbt-skills"][0]
    assert dbt["available"] and dbt["content"]["approach"] == "DBT"
    # Plus can open the Plus-first module.
    go(page, "modules")
    page.wait_for_selector("#hw4ExtraT")
    assert "New in Hopewick Plus" in page.inner_text("#hw4ExtraT")
    page.click("#hw4M-dbt-skillsGo")
    page.wait_for_selector("#hw4ModT")
    assert "DBT skills" in page.inner_text("#hw4ModT")
    # Values card sort (act-values is scheduled; open it in a test catalogue only if released) and thought record
    # are checked through the same components using whichever module is open to this account today.
    mods = {r["key"]: r for r in rel if r["kind"] == "module"}
    if "act-values" in mods and mods["act-values"]["available"]:
        page.evaluate("() => HW3.openModule('act-values')")
        page.click("#hw4Next")
        page.wait_for_selector("#hw4Values")
        page.click("#hw4V2b0")  # Family: very important
        page.click("#hw4V4b0")  # Health
        assert page.get_attribute("#hw4V2b0", "aria-pressed") == "true"
        assert "Family, Health" in page.inner_text("#hw4ValuesSum")
        page.click("#hw4ValuesSave")
        page.wait_for_function("() => document.getElementById('hw4ValuesStatus').textContent.includes('Saved')")
    else:
        # Before its Plus date the values module does not exist yet, even for Plus.
        assert _api(page, "PUT", "/api/me/learning/act-values", {"step": 1})["status"] == 404
    # Tracker trends for Plus.
    g = _api(page, "POST", "/api/me/recovery/goals", {"kind": "reduce", "label": "Weed", "startDate": _days_ago(page, 20)})
    assert g["status"] == 201
    for n, s in [(1, 6), (3, 8), (12, 4)]:
        assert _api(page, "POST", "/api/me/recovery/logs", {"kind": "craving", "goalId": g["body"]["goal"]["id"], "date": _days_ago(page, n), "intensity": s, "triggers": ["Stress"], "outcome": "passed"})["status"] == 201
    go(page, "recovery")
    page.wait_for_selector("#hw4Weeks")
    ins = page.inner_text("#hw4Insights")
    assert "You logged 3 cravings in the last 30 days." in ins and "Stress (3)" in ins and "not an assessment" in ins
    page.click("#hw4Ins90")
    page.wait_for_function("() => (document.getElementById('hw4Insights') || {}).innerText.includes('last 90 days')")
    assert page.locator("#hw4InsPlus").count() == 0
    assert _quiet(errors) == []


def test_preview_values_sort_and_thought_record(preview_server, browser):
    """Queued Plus modules, opened early through a test-only schedule: values card sort and thought record."""
    base, data_dir = preview_server
    page, errors = _page(browser)
    sign_in(page, base, email=PLUS_EMAIL)
    rel = {r["key"]: r for r in _api(page, "GET", "/api/content/releases")["body"]["items"] if r["kind"] == "module"}
    assert rel["act-values"]["available"] and rel["thought-record"]["available"]
    go(page, "modules")
    page.wait_for_selector("#hw4ExtraT")
    # Values card sort: toggle buttons with aria-pressed; summary updates; saved encrypted.
    page.evaluate("() => HW3.openModule('act-values')")
    page.wait_for_selector("#hw4ModT")
    for _ in range(8):
        if page.locator("#hw4Values").count():
            break
        page.click("#hw4Next")
    page.wait_for_selector("#hw4Values")
    page.focus("#hw4V2b0")
    page.keyboard.press("Enter")
    page.click("#hw4V4b0")
    assert page.get_attribute("#hw4V2b0", "aria-pressed") == "true"
    summ = page.inner_text("#hw4ValuesSum")
    page.click("#hw4ValuesSave")
    page.wait_for_function("() => document.getElementById('hw4ValuesStatus').textContent.includes('Saved')")
    learn = _api(page, "GET", "/api/me/learning")["body"]["progress"]
    vals = [m for m in learn if m["moduleId"] == "act-values"][0]["notes"]["values"]
    assert len(vals) >= 2 and summ.strip()
    # Thought record: labelled fields, saved privately, never in plain text on disk.
    page.click("#hw4ModBack")
    page.evaluate("() => HW3.openModule('thought-record')")
    page.wait_for_selector("#hw4ModT")
    for _ in range(8):
        if page.locator("#hw4TR").count():
            break
        page.click("#hw4Next")
    page.wait_for_selector("#hw4TR")
    assert page.locator("label[for='hw4TR-situation']").count() == 1
    page.fill("#hw4TR-situation", "s4trsituation team meeting")
    page.fill("#hw4TR-thought", "they think I'm useless")
    page.fill("#hw4TR-balanced", "one comment, not the whole picture")
    page.click("#hw4TRSave")
    page.wait_for_function("() => document.getElementById('hw4TRStatus').textContent.includes('Saved privately')")
    assert "s4trsituation" not in _raw(data_dir)
    exp = _api(page, "GET", "/api/me/export")["body"]
    tr = [m for m in exp["learning"] if m["moduleId"] == "thought-record"][0]
    assert tr["notes"]["thoughtRecord"]["situation"].startswith("s4trsituation")
    assert _quiet(errors) == []


def test_free_account_sees_queued_module_locked_in_preview(preview_server, browser):
    """Free accounts see a released Plus module as a title and teaser only, and the API refuses it."""
    base, _ = preview_server
    page, errors = _page(browser)
    sign_in(page, base, email="s4-free-preview@example.test")
    go(page, "modules")
    page.wait_for_selector("#hw4ExtraT")
    assert _api(page, "PUT", "/api/me/learning/thought-record", {"step": 1})["status"] == 403
    rel = {r["key"]: r for r in _api(page, "GET", "/api/content/releases")["body"]["items"] if r["kind"] == "module"}
    assert not rel["thought-record"]["available"] and "content" not in rel["thought-record"]
    assert _quiet(errors) == []
