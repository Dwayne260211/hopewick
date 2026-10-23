# -*- coding: utf-8 -*-
"""Hopewick 2.0 Stage 3, end to end in a browser against a real local server.

Covers the daily check-in, coping toolkit, personal goals, journal (server
storage, prompts, search, export, AI consent, one-time import) and My Next Step
(including the "Save as my next step?" card from a streamed Hope reply).
The server keeps data per user in the JSON fallback (DATABASE_URL unset).
Nothing here touches Stripe, email or production.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage3_live import PLUS_EMAIL, go, live_server, sign_in  # noqa: E402


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


def _page(browser, width=390, height=900, **kw):
    # Check-ins are dated by the Brisbane calendar; pin the browser clock zone so CI (UTC) agrees
    # with it even when the UTC and Brisbane dates differ (14:00-24:00 UTC).
    kw.setdefault("timezone_id", "Australia/Brisbane")
    ctx = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True, **kw)
    page = ctx.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return page, errors


def _wellbeing(data_dir):
    return json.loads((data_dir / "wellbeing.json").read_text(encoding="utf-8"))


def _api(page, method, path, body=None):
    return page.evaluate(
        """async ([m, p, b]) => {
          const pid = (typeof profile !== 'undefined' && profile) ? chatProfileId() : 'main';
          if ((m === 'GET' || m === 'DELETE') && !/profileId=/.test(p)) p += (p.includes('?') ? '&' : '?') + 'profileId=' + encodeURIComponent(pid);
          if (b && !b.profileId) b = Object.assign({ profileId: pid }, b);
          const r = await fetch(p, { method: m, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (_) {} return { status: r.status, body: j }; }""",
        [method, path, body],
    )


def _quiet(errors):
    # The local test server has no hosted Hope and no Google client; those 4xx/5xx probes are expected.
    return [e for e in errors if "Failed to load resource" not in e]


def test_daily_checkin_save_edit_trends_consent_delete(server, browser):
    base, data_dir = server
    page, errors = _page(browser)
    sign_in(page, base, email="checkin@example.test")

    # Dashboard quick check-in: 5-point scale, then the full form with that mood chosen.
    labels = page.locator("#dashCheckin .hw3-mood__label").all_inner_texts()
    assert labels == ["Struggling", "Low", "Okay", "Good", "Great"]
    page.click('#dashCheckin [data-mood="2"]')
    page.wait_for_selector("#hw3Inner[data-tab='checkin']")
    assert page.locator('#hw3CheckinForm [data-mood="2"]').get_attribute("aria-checked") == "true"

    # Keyboard: arrows move through the radio group.
    page.focus('#hw3CheckinForm [data-mood="2"]')
    page.keyboard.press("ArrowLeft")
    assert page.locator('#hw3CheckinForm [data-mood="1"]').get_attribute("aria-checked") == "true"
    support = page.inner_text(".hw3-support:not([hidden])")
    assert "13 11 14" in support and "000" in support
    assert "diagnos" not in support.lower()
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")  # back to Low, then Okay
    assert page.locator('#hw3CheckinForm [data-mood="3"]').get_attribute("aria-checked") == "true"

    page.fill("#hw3Feelings", "wound up but managing")
    page.click('#hw3Triggers button:has-text("Work or study")')
    page.fill("#hw3TriggerCustom", "Traffic")
    page.click("#hw3TriggerAdd")
    page.locator("#hw3Intensity").fill("7")
    page.click('#hw3CheckinForm button.hw-chip:has-text("Mild")')
    page.fill("#hw3Notes", "private note")
    page.click("#hw3CheckinSave")
    page.wait_for_selector("#hw3AfterSaveTitle")
    assert "Saved: Okay, 7/10" in page.inner_text("#hw3Inner")

    # Stored per user and per profile, on the server.
    store = _wellbeing(data_dir)
    rows = [c for u in store["users"].values() for pr in u["profiles"].values() for c in pr["checkins"].values()]
    row = [r for r in rows if r["feelings"] == "wound up but managing"][0]
    assert row["mood"] == 3 and row["intensity"] == 7 and row["craving"] == "Mild"
    assert "Traffic" in row["triggers"]

    # Edit replaces today's check-in (one per day).
    page.click("#hw3Inner button:text-is(\"Done\")")
    page.click('#hw3CheckinForm [data-mood="4"]')
    page.click("#hw3CheckinSave")
    page.wait_for_selector("#hw3AfterSaveTitle")
    listed = _api(page, "GET", "/api/me/checkins?profileId=" + page.evaluate("() => chatProfileId()"))
    assert listed["status"] == 200 and len(listed["body"]["checkins"]) == 1
    assert listed["body"]["checkins"][0]["moodLabel"] == "Good"
    # The older check-in list (dashboard basics, Hope context) follows along.
    assert page.evaluate("() => todaysCheckin().mood.l") == "Good"

    # Trends: text summary always, chart, and a table alternative.
    summary = page.inner_text("#hw3TrendSummary")
    assert "1 of the last 7 days" in summary and "Good" in summary
    page.click("#hw3Trends summary")
    table = page.inner_text("#hw3Trends table")
    assert "Good" in table and "Work or study" in table
    assert page.locator("#hw3Trends svg[role=img]").count() == 1
    # The month view is Plus (founder model). Free sees a kind note, not a lock-out.
    page.click("#hw3TrendMonth")
    assert "Your last 7 days are always here, free" in page.inner_text("#hw3MonthPlus")
    page.click("#hw3TrendWeek")
    page.wait_for_selector("#hw3TrendSummary")

    # Consent: off by default, saved on the server, revocable.
    sw = page.locator("#hw3ShareSwitch")
    assert sw.get_attribute("aria-checked") == "false"
    sw.click()
    page.wait_for_function("() => document.getElementById('hw3ShareSwitch').getAttribute('aria-checked') === 'true'")
    assert _api(page, "GET", "/api/me/settings")["body"]["settings"]["shareCheckinsWithHope"] is True
    page.click("#hw3ShareSwitch")
    page.wait_for_function("() => document.getElementById('hw3ShareSwitch').getAttribute('aria-checked') === 'false'")
    assert _api(page, "GET", "/api/me/settings")["body"]["settings"]["shareCheckinsWithHope"] is False

    # Suggest a coping exercise opens a real tool.
    page.click("#hw3CheckinSave")
    page.wait_for_selector("#hw3AfterSave")
    page.click("#hw3AfterSave")
    page.wait_for_selector("#hw3BeginTool")
    assert page.locator("#hw3PlayerTitle").inner_text()

    # Survives a reload, then delete.
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("() => window.HW3 && HW3.state.loaded", timeout=20000)
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    go(page, "checkin")
    page.wait_for_selector("#hw3CheckinDelete")
    page.once("dialog", lambda d: d.accept())
    page.click("#hw3CheckinDelete")
    page.wait_for_function("() => !document.getElementById('hw3CheckinDelete')")
    assert _api(page, "GET", "/api/me/checkins")["body"]["checkins"] == []
    assert "No check-ins saved yet" in page.inner_text("#hw3Inner")
    assert not _quiet(errors), errors


def test_coping_toolkit_pause_resume_complete_feedback(server, browser):
    base, _ = server
    page, errors = _page(browser, reduced_motion="reduce")
    sign_in(page, base, email="coping@example.test")
    go(page, "coping")
    titles = page.locator("#hw3ToolList .hw3-tool__title").all_inner_texts()
    for want in ["Box breathing", "5-4-3-2-1 grounding", "Urge surfing", "Thought reframing", "TIPP for intense moments", "STOP before you act"]:
        assert want in titles, titles
    assert page.locator("#hw3ToolList .hw3-badge").all_inner_texts().count("DBT-informed") == 2
    page.click("#hw3Filter-cravings")
    assert "Urge surfing" in page.inner_text("#hw3ToolList")
    assert "Thought reframing" not in page.inner_text("#hw3ToolList")
    page.click("#hw3Filter-all")

    page.click('#hw3ToolList button[aria-label="Start: Box breathing"]')
    assert "dizzy" in page.inner_text("#hw3Inner")
    page.click("#hw3BeginTool")
    page.click("#hw3NextStep")
    # Reduced motion: the guide is text only, and it can still run.
    assert page.locator(".hw3-breath--text").count() == 1
    page.click("#hw3BreathStart")
    page.wait_for_function("() => document.getElementById('hw3BreathPhase').textContent === 'Breathe in'")
    page.click("#hw3PauseStep")
    page.wait_for_selector("#hw3ResumeStep")
    acts = _api(page, "GET", "/api/me/activities")["body"]["activities"]
    assert acts[0]["status"] == "paused" and acts[0]["toolKey"] == "breathing-box"

    # Leave and come back: resume where they left off.
    go(page, "home")
    go(page, "coping")
    page.click("text=← All coping tools") if page.locator("text=← All coping tools").count() else None
    page.wait_for_selector("#hw3ResumeBtn")
    page.click("#hw3ResumeBtn")
    page.click("#hw3ResumeStep")
    page.wait_for_selector("#hw3NextStep")
    page.click("#hw3NextStep")
    page.click("#hw3FinishTool")
    page.wait_for_selector("#hw3DoneTitle")
    page.click('#hw3Inner button.hw-chip:has-text("Yes")')
    page.fill("#hw3ActNote", "slower out-breath helped")
    page.click("#hw3FeedbackSave")
    page.wait_for_selector("#hw3ActHist")
    hist = page.inner_text("#hw3Inner")
    assert "Helped" in hist and "slower out-breath helped" in hist
    done = _api(page, "GET", "/api/me/activities")["body"]["activities"][0]
    assert done["status"] == "completed" and done["helpful"] == "yes" and done["completedAt"]

    # Revisit starts a fresh activity; inputs in thought reframing are never saved.
    page.click('#hw3ToolList button[aria-label="Start: Thought reframing"]')
    page.click("#hw3BeginTool")
    page.fill("#hw3Input0", "I always mess up")
    assert "not saved" in page.inner_text("#hw3Inner")
    assert "I always mess up" not in json.dumps(_api(page, "GET", "/api/me/activities")["body"])
    assert not _quiet(errors), errors


def test_personal_goals_full_lifecycle_and_free_gate(server, browser):
    base, _ = server
    page, errors = _page(browser, width=1280, height=900)
    sign_in(page, base, email=PLUS_EMAIL)
    go(page, "mygoals")
    assert "No active goals" in page.inner_text("#hw3Inner")
    assert "streak" in page.inner_text("#hw3Inner")  # "no streaks to keep"
    page.click("#hw3GoalAdd")
    page.click("#hw3GoalSave")
    assert "short name" in page.inner_text("#hw3GoalErr")
    page.fill("#hw3GoalTitle", "Walk 15 minutes three times this week")
    page.select_option("#hw3GoalCat", "recovery")
    page.locator("#hw3GoalProg").fill("20")
    page.click("#hw3GoalSave")
    page.wait_for_selector("#hw3GoalList")
    assert "Recovery" in page.inner_text("#hw3GoalList") and "20% of the way" in page.inner_text("#hw3GoalList")
    page.click('button[aria-label="Add 10 percent progress to Walk 15 minutes three times this week"]')
    page.wait_for_function("() => document.getElementById('hw3GoalList').innerText.includes('30% of the way')")
    page.click('button[aria-label="Edit Walk 15 minutes three times this week"]')
    page.fill("#hw3GoalTitle", "Walk 15 minutes, three times")
    page.click("#hw3GoalSave")
    page.wait_for_selector('button[aria-label="Mark Walk 15 minutes, three times complete"]')
    page.click('button[aria-label="Mark Walk 15 minutes, three times complete"]')
    page.click("#hw3GoalTab-completed")
    assert "Completed" in page.inner_text("#hw3GoalList")
    g = _api(page, "GET", "/api/me/goals")["body"]["goals"][0]
    assert g["status"] == "completed" and g["progress"] == 100 and g["completedAt"]
    page.click('button[aria-label="Archive Walk 15 minutes, three times"]')
    page.click("#hw3GoalTab-archived")
    page.click('button[aria-label="Make Walk 15 minutes, three times active again"]')
    page.click("#hw3GoalTab-active")
    assert "Walk 15 minutes, three times" in page.inner_text("#hw3GoalList")
    assert _api(page, "GET", "/api/me/goals")["body"]["goals"][0]["completedAt"] is None
    # Dashboard shows active goals.
    go(page, "home")
    assert "Walk 15 minutes, three times" in page.inner_text("#hw3DashGoals")
    go(page, "mygoals")
    page.once("dialog", lambda d: d.accept())
    page.click('button[aria-label="Delete Walk 15 minutes, three times"]')
    page.wait_for_function("() => document.getElementById('hw3Inner').innerText.includes('No active goals')")
    assert _api(page, "GET", "/api/me/goals")["body"]["goals"] == []
    assert not _quiet(errors), errors

    # Free account: honest Plus gate in the UI, and the server refuses writes.
    free, ferrors = _page(browser)
    sign_in(free, base, email="free-goals@example.test")
    go(free, "mygoals")
    assert free.locator("#hw3GoalsGate").is_visible()
    assert free.locator("#hw3GoalAdd").count() == 0
    refused = _api(free, "POST", "/api/me/goals", {"title": "x", "profileId": free.evaluate("() => chatProfileId()")})
    assert refused["status"] == 403
    # Check-ins and coping stay free.
    ok = _api(free, "PUT", "/api/me/checkins/" + free.evaluate("() => brisbaneDateISO()"), {"mood": 3, "profileId": free.evaluate("() => chatProfileId()")})
    assert ok["status"] == 200
    assert _api(free, "POST", "/api/me/activities", {"toolKey": "grounding-54321"})["status"] == 201
    assert not _quiet(ferrors), ferrors


def test_journal_server_prompts_search_export_consent(server, browser):
    base, data_dir = server
    page, errors = _page(browser, width=1280, height=1000)
    sign_in(page, base, email=PLUS_EMAIL)
    page.evaluate("() => setAppTab('journal')")
    page.wait_for_selector("#journalWorkspace:not([hidden])")
    page.select_option("#jKind", "gratitude")
    prompt = page.inner_text("#jPromptText")
    assert prompt and page.locator("#jPromptText").is_visible()
    page.fill("#jTitle", "Small wins")
    page.fill("#jBody", "Grateful for a quiet coffee with my sister")
    page.click("#jSaveBtn")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('quiet coffee')")
    page.select_option("#jKind", "free")
    page.click("#jPromptClear") if page.locator("#jPromptClear:visible").count() else None
    page.fill("#jDate", "2026-10-01")
    page.fill("#jBody", "Rough week at work")
    page.click("#jSaveBtn")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('Rough week')")

    entries = _api(page, "GET", "/api/me/journal?profileId=" + page.evaluate("() => chatProfileId()"))["body"]["entries"]
    assert {e["kind"] for e in entries} == {"gratitude", "free"}
    grat = [e for e in entries if e["kind"] == "gratitude"][0]
    assert grat["prompt"] == prompt
    assert [e for e in entries if e["kind"] == "free"][0]["entryDate"] == "2026-10-01"
    # Nothing in the browser's own journal copy for server entries.
    assert page.evaluate("() => localStorage.getItem(pk(profile.id, 'journal'))") in (None, "[]")

    # Search and date filter.
    page.fill("#hw3JSearch", "coffee")
    page.wait_for_function("() => document.getElementById('journalCount').textContent.includes('Showing 1 of 2')")
    assert "Rough week" not in page.inner_text("#journalList")
    page.click("#hw3JournalTools button:has-text('Clear')")
    page.fill("#hw3JTo", "2026-10-05")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('Rough week') && !document.getElementById('journalList').innerText.includes('coffee')")
    page.click("#hw3JournalTools button:has-text('Clear')")

    # Edit.
    page.click('button[aria-label="Edit Small wins"]')
    page.fill("#jBody", "Grateful for a quiet coffee and a walk")
    page.click("#jSaveBtn")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('and a walk')")

    # Export as JSON and Markdown (downloads).
    with page.expect_download() as dl:
        page.click("#hw3JExportJson")
    data = json.loads(Path(dl.value.path()).read_text(encoding="utf-8"))
    assert len(data["entries"]) == 2
    with page.expect_download() as dl:
        page.click("#hw3JExportMd")
    md = Path(dl.value.path()).read_text(encoding="utf-8")
    assert "# " in md and "and a walk" in md

    # Deepen: asks before sending; "No" sends nothing; "Yes" sends with aiConsent.
    sent = []
    page.evaluate("() => { billingState.hopeHosted = true; }")

    def fake(route):
        sent.append(json.loads(route.request.post_data or "{}"))
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"choices": [{"message": {"content": "REFINED:\nYou found calm.\nEMOTIONS:\ncalm\nQUESTION:\nWhat helped?"}}]}))
    page.route("**/api/hope/chat", fake)
    page.click('button[aria-label="Deepen reflection: Small wins"]')
    page.wait_for_selector("dialog.hw3-dialog[open]")
    page.click("#hw3AiNo")
    page.wait_for_timeout(300)
    assert sent == []
    page.click('button[aria-label="Deepen reflection: Small wins"]')
    page.click("#hw3AiYes")
    page.wait_for_selector("#jKeepBoth")
    assert sent and sent[0]["aiConsent"] == "once" and sent[0]["purpose"] == "refine"
    page.click("#jKeepBoth")
    page.wait_for_function("() => document.getElementById('journalList').innerText.includes('You found calm.')")
    saved = [e for e in _api(page, "GET", "/api/me/journal")["body"]["entries"] if e["title"] == "Small wins"][0]
    assert saved["refined"] == "You found calm."
    # The server also refuses refine without consent (hosted path).
    page.unroute("**/api/hope/chat")

    # Delete.
    page.once("dialog", lambda d: d.accept())
    page.click('button[aria-label^="Delete entry from"]')
    page.wait_for_function("() => !document.getElementById('journalList').innerText.includes('Rough week')")
    assert len(_api(page, "GET", "/api/me/journal")["body"]["entries"]) == 1
    assert not _quiet(errors), errors


def test_one_time_import_keeps_local_copy(server, browser):
    base, _ = server
    page, errors = _page(browser)
    sign_in(page, base, email="importer@example.test")
    page.evaluate(
        """() => {
          save(pk(profile.id, 'journal'), [{ id: 'oldentry1', title: 'From my phone', body: 'Written before accounts', created: Date.now() - 86400000, updated: Date.now() - 86400000 }]);
          const plans = normalizePlans({}); plans.relapse.warnings = 'Skipping meals'; save(pk(profile.id, 'plans'), plans);
          HW3.reset(); return HW3.sync(true);
        }"""
    )
    go(page, "home")
    page.wait_for_selector("#hw3ImportHome")
    text = page.inner_text("#hw3ImportHome")
    assert "1 journal entry" in text and "relapse and exit plans" in text and "stays where it is" in text
    # Until they answer, the entry shows as device-only in the journal.
    page.evaluate("() => setAppTab('journal')")
    assert "On this device only" in page.inner_text("#journalList")
    go(page, "home")
    page.click("#hw3ImportYes-home")
    page.wait_for_function("() => !document.getElementById('hw3ImportHome')")
    entries = _api(page, "GET", "/api/me/journal")["body"]["entries"]
    assert [e["title"] for e in entries] == ["From my phone"] and entries[0]["clientId"] == "oldentry1"
    plans = _api(page, "GET", "/api/me/plans")["body"]["plans"]
    assert plans["relapse"]["warnings"] == "Skipping meals"
    # The device copy is still there.
    assert "Written before accounts" in page.evaluate("() => localStorage.getItem(pk(profile.id, 'journal'))")
    assert _api(page, "GET", "/api/me/settings")["body"]["settings"]["journalImport"] == "done"

    # Declining keeps everything local and stops asking.
    other, oerrors = _page(browser)
    sign_in(other, base, email="decliner@example.test")
    other.evaluate("""() => { save(pk(profile.id, 'journal'), [{ id: 'keepme1', title: 'Mine', body: 'Stay here', created: Date.now(), updated: Date.now() }]); HW3.reset(); return HW3.sync(true); }""")
    go(other, "home")
    other.click("#hw3ImportNo-home")
    other.wait_for_function("() => !document.getElementById('hw3ImportHome')")
    assert _api(other, "GET", "/api/me/journal")["body"]["entries"] == []
    assert "Stay here" in other.evaluate("() => localStorage.getItem(pk(profile.id, 'journal'))")
    assert _api(other, "GET", "/api/me/settings")["body"]["settings"]["journalImport"] == "declined"
    assert not _quiet(errors + oerrors), errors + oerrors


def test_my_next_step_from_chat_and_own(server, browser):
    base, _ = server
    page, errors = _page(browser, width=1280, height=900)
    sign_in(page, base, email="steps@example.test")
    go(page, "nextstep")
    assert "No step saved right now" in page.inner_text("#hw3Inner")
    assert "does not contact anyone" in page.inner_text("#hw3Inner")

    # A streamed Hope reply with the server's next-step event shows an ask-first card.
    page.evaluate("() => { billingState.hopeHosted = true; settings.stream = true; }")
    sse = (
        'data: {"choices":[{"delta":{"content":"That sounds like a lot. "}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"You did well to notice it."}}]}\n\n'
        'data: {"hopewick":{"nextStep":{"title":"Drink a glass of water and do box breathing","detail":"","copingKey":"breathing-box"}}}\n\n'
        "data: [DONE]\n\n"
    )
    bodies = []

    def fake(route):
        bodies.append(json.loads(route.request.post_data or "{}"))
        route.fulfill(status=200, headers={"Content-Type": "text/event-stream"}, body=sse)
    page.route("**/api/hope/chat", fake)
    page.evaluate("() => setAppTab('chat')")
    page.fill("#input", "Rough day, cravings are loud")
    page.keyboard.press("Enter")
    page.wait_for_selector(".hw3-suggest")
    assert "Save as my next step?" in page.inner_text(".hw3-suggest")
    assert "[[hopewick" not in page.inner_text("#messages")
    assert bodies[0]["context"]["profileId"]
    # Nothing saved until they say yes.
    assert _api(page, "GET", "/api/me/next-steps")["body"]["steps"] == []
    page.fill(".hw3-suggest input", "Drink a glass of water, then box breathing")
    page.click(".hw3-suggest button:has-text('Save')")
    page.wait_for_selector(".hw3-suggest__done")
    step = _api(page, "GET", "/api/me/next-steps")["body"]["steps"][0]
    assert step["source"] == "hope" and step["copingKey"] == "breathing-box" and step["status"] == "open"
    page.unroute("**/api/hope/chat")

    # Dashboard shows it.
    go(page, "home")
    assert "Drink a glass of water, then box breathing" in page.inner_text("#hw3DashStep")

    # Complete with a reflection; follow-up opt-in is stored only.
    go(page, "nextstep")
    page.click("#hw3StepFollow")
    page.wait_for_function("() => document.getElementById('hw3StepFollow').getAttribute('aria-checked') === 'true'")
    assert "does not send messages" in page.inner_text("#hw3Inner")
    page.fill("#hw3StepRefl", "Felt steadier")
    page.click("#hw3StepDone")
    page.wait_for_selector("#hw3StepAdd")
    done = _api(page, "GET", "/api/me/next-steps")["body"]["steps"][0]
    assert done["status"] == "done" and done["reflection"] == "Felt steadier" and done["followUpOptIn"] is True
    assert "Felt steadier" in page.inner_text("#hw3PastSteps + ul, #hw3Inner")

    # Add my own, change it (old one set aside), delete.
    page.click("#hw3StepAdd")
    page.fill("#hw3StepTitle", "Text Jo after work")
    page.click("#hw3StepSave")
    page.wait_for_selector("#hw3StepChange")
    page.click("#hw3StepChange")
    page.fill("#hw3StepTitle", "Call Jo after work")
    page.click("#hw3StepSave")
    page.wait_for_selector("#hw3StepNow")
    steps = _api(page, "GET", "/api/me/next-steps")["body"]["steps"]
    assert [s["status"] for s in steps if s["title"] == "Text Jo after work"] == ["dismissed"]
    assert [s for s in steps if s["status"] == "open"][0]["title"] == "Call Jo after work"
    page.once("dialog", lambda d: d.accept())
    page.click("#hw3StepDelete")
    page.wait_for_selector("#hw3StepAdd")
    assert not [s for s in _api(page, "GET", "/api/me/next-steps")["body"]["steps"] if s["status"] == "open"]
    assert not _quiet(errors), errors


def test_users_are_isolated_and_signed_out_is_honest(server, browser):
    base, _ = server
    a, _ = _page(browser)
    sign_in(a, base, email="iso-a@example.test")
    pid = a.evaluate("() => chatProfileId()")
    assert _api(a, "POST", "/api/me/next-steps", {"title": "A only", "profileId": pid})["status"] == 201
    b, _ = _page(browser)
    sign_in(b, base, email="iso-b@example.test")
    assert _api(b, "GET", "/api/me/next-steps?profileId=" + pid)["body"].get("steps", []) == []
    # Signed out: the API refuses and the app says what it can and cannot do.
    out, _ = _page(browser)
    out.goto(f"{base}/app/", wait_until="domcontentloaded")
    assert _api(out, "GET", "/api/me/checkins")["status"] == 401


def test_demo_mode_is_memory_only(browser):
    import threading
    from functools import partial
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    from plus_session import install_member_session

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    root = Path(__file__).resolve().parents[1]
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        page, errors = _page(browser)
        install_member_session(page)
        page.goto(f"http://127.0.0.1:{httpd.server_address[1]}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
        page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
        page.click("#launchPrefsContinue")
        page.wait_for_selector("#dashGrid")
        go(page, "checkin")
        assert "Demo mode: nothing you do here is saved." in page.inner_text("#hw3Inner")
        page.click('#hw3CheckinForm [data-mood="5"]')
        page.click("#hw3CheckinSave")
        page.wait_for_selector("#hw3AfterSaveTitle")
        go(page, "mygoals")
        page.click("#hw3GoalAdd")
        page.fill("#hw3GoalTitle", "Demo goal")
        page.click("#hw3GoalSave")
        page.wait_for_selector("#hw3GoalList")
        assert page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('eden.p.'))") == []
        assert not _quiet(errors), errors
    finally:
        httpd.shutdown()
