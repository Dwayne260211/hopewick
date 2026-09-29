#!/usr/bin/env python3
"""Going Deeper study tracks: faith gating, Plus gate, and a real sample day."""
from __future__ import annotations

import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import grant_server_session
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"
DATA = ROOT / "app" / "data" / "going-deeper.js"

BANNED = (
    "god grant me the serenity",
    "we admitted we were powerless",
    "just for today i will be happy",
    "easy does it",
    "let go and let god",
    "live through this day only",
    "celebrate recovery",
    "big book",
    "clinically proven",
    "cures addiction",
    "treats addiction",
)
TRACKS = ("christian", "values", "islamic", "hindu", "buddhist")
# Sentences from the readings, not the day titles, so Free tease must not contain them.
BODY = {
    "christian": "not reduced to the worst hour",
    "values": "A value does not need a creed",
    "islamic": "Mercy is not a wage you earn",
    "hindu": "Non-harm includes the way you speak to yourself",
    "buddhist": "A craving is a visitor, not a command",
}


def _tracks():
    return json.loads((ROOT / "server" / "library" / "going-deeper.json").read_text(encoding="utf-8"))


def test_static_tracks_copy_and_gate():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    data = DATA.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in text
    assert 'content="hopewick-v5.27"' in land
    assert 'src="data/going-deeper.js"' in text
    assert 'id="deeperDlg"' in text
    assert "card.id = 'homeGoingDeeper'" in text
    assert 'id="sideDeeperBtn"' in text
    assert 'data-open="deeper"' in text
    assert "function openGoingDeeper" in text
    assert "function preferredDeeperTrackId" in text
    assert "settings.faith === 'none' && !deeperBrowseAll" in text
    assert "Study is not care" in text
    assert "not a substitute for a GP" in text
    assert "Do not add deeper on a crisis reply." in text
    assert "deeper: { label: 'Open Going Deeper'" in text
    assert "13YARN is 13 92 76" in text
    assert "will not invent a thin version of your tradition" in text
    tracks = _tracks()
    assert [t["id"] for t in tracks] == list(TRACKS)
    blob = json.dumps(tracks).lower()
    for banned in BANNED:
        assert banned not in blob
        assert banned not in data.lower()
    for marker in BODY.values():
        assert marker not in data
        assert marker not in text
    client = json.loads(re.search(r"var GOING_DEEPER_TRACKS = (\[.*\]);\s*$", data, re.S).group(1))
    assert [t["id"] for t in client] == list(TRACKS)
    assert "One true sentence" == next(t for t in client if t["id"] == "values")["days"][0]["title"]
    assert "reading" not in json.dumps(client)
    for track in tracks:
        assert track["title"] and track["blurb"]
        assert len(track["days"]) == 7
        assert BODY[track["id"]] in json.dumps(track)
        for day in track["days"]:
            assert day["title"] and day["prompt"] and day["practice"]
            assert len(day["reading"]) > 350
            assert "\n\n" in day["reading"]
    values = next(t for t in tracks if t["id"] == "values")
    assert "none" in values["faiths"] and "general" in values["faiths"]
    christian = next(t for t in tracks if t["id"] == "christian")
    assert "christian" in christian["faiths"] and "catholic" in christian["faiths"]
    assert "Mercy that does not keep score" == christian["days"][0]["title"]
    assert "One true sentence" == values["days"][0]["title"]


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _enter(page, base, faith):
    page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
    page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
    page.select_option("#launchFaith", faith)
    page.click("#launchPrefsContinue")
    page.wait_for_selector("#homeGoingDeeper", timeout=10000)


def _open_side(page):
    page.click("#menuBtn")
    page.wait_for_selector("#sidebar", state="visible")
    button = page.locator("#sideDeeperBtn")
    button.scroll_into_view_if_needed()
    button.click()


def _assert_no_reading_bodies(page):
    raw = page.locator("#deeperDlg").text_content() or ""
    for marker in BODY.values():
        assert marker not in raw
    assert page.locator("#deeperReading").count() == 0


def _grant_plus(page):
    grant_server_session(page, plus=True, founder=False)
    page.evaluate("() => { renderGoingDeeper(); syncDeeperPlusPill(); }")


def test_phone_navigation_faith_and_sample_day():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})

            _enter(page, base, "none")
            assert page.locator("#sideBibleBtn").is_hidden()
            assert page.locator('#needNow [data-need="bible"]').count() == 0
            assert page.locator("#homeGoingDeeper").is_visible()
            assert "values path" in page.inner_text("#homeGoingDeeper")
            page.click("#homeGoingDeeperBtn")
            page.wait_for_function("() => document.getElementById('deeperDlg')?.open === true")
            free = page.inner_text("#deeperDlg")
            assert "Study is not care" in free
            assert "no faith content" in free.lower()
            assert "One true sentence" in free
            assert "not the readings" in free
            assert page.locator('#deeperTracks [data-deeper-track="values"]').get_attribute("aria-current") == "true"
            assert page.locator("#deeperTracks button").count() == 1
            _assert_no_reading_bodies(page)
            assert page.locator("#deeperPlusBtn").is_visible()
            assert page.locator("#deeperLibrary").is_hidden()
            page.click("#deeperBrowseAll")
            page.wait_for_selector('#deeperTracks [data-deeper-track="christian"]')
            assert page.locator("#deeperTracks button").count() == 5
            page.click("#deeperHideOthers")
            page.wait_for_function("() => document.querySelectorAll('#deeperTracks button').length === 1")
            page.click("#deeperGetHelp")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "000" in page.inner_text("#helpDlg")
            page.keyboard.press("Escape")

            _open_side(page)
            page.wait_for_function("() => document.getElementById('deeperDlg')?.open === true")
            overflow = page.evaluate(
                """() => {
                  const dlg = document.getElementById('deeperDlg');
                  const wide = [];
                  dlg.querySelectorAll('button, p, h2, h3, li').forEach((el) => {
                    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 8) {
                      wide.push((el.id || el.className || el.tagName) + ' ' + (el.textContent || '').trim().slice(0, 40));
                    }
                  });
                  return {
                    doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
                    dlg: dlg.scrollWidth <= dlg.clientWidth + 2,
                    wide,
                  };
                }"""
            )
            assert overflow["doc"], overflow
            assert overflow["dlg"], overflow
            assert overflow["wide"] == [], overflow
            page.keyboard.press("Escape")

            page.evaluate(
                """() => {
                  settings.faith = 'islamic';
                  deeperBrowseAll = false;
                  deeperTrackId = null;
                  deeperDayId = null;
                  syncFaithBibleVisibility();
                  renderHome();
                }"""
            )
            assert page.locator("#sideBibleBtn").is_visible()
            page.click("#homeGoingDeeperBtn")
            page.wait_for_selector('#deeperTracks [data-deeper-track="islamic"][aria-current="true"]')
            assert "Mercy wider than a hard day" in page.inner_text("#deeperTease")
            _assert_no_reading_bodies(page)
            page.keyboard.press("Escape")

            page.evaluate(
                """() => {
                  settings.faith = 'christian';
                  deeperTrackId = null;
                  deeperDayId = null;
                  syncFaithBibleVisibility();
                  renderHome();
                }"""
            )
            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            page.click("#bibleOpenDeeper")
            page.wait_for_function("() => document.getElementById('deeperDlg')?.open === true")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open !== true")
            assert page.locator('#deeperTracks [data-deeper-track="christian"]').get_attribute("aria-current") == "true"
            assert "Mercy that does not keep score" in page.inner_text("#deeperTease")
            _grant_plus(page)
            page.wait_for_selector("#deeperLibrary:not([hidden]) .deeper-day")
            assert page.locator("#deeperGate").is_hidden()
            assert page.locator("#deeperPlusPill").is_hidden()
            page.locator("#deeperDayList .deeper-day").first.click()
            page.wait_for_selector("#deeperReading")
            day = page.inner_text("#deeperDayView")
            assert "Mercy that does not keep score" in day
            assert BODY["christian"] in day
            assert "Sit with this" in day
            assert "One small step" in day
            assert "Open Bible & SOAP" in day
            assert "World English Bible" in day
            page.click("#deeperToggleDone")
            page.click("#deeperBack")
            assert "done" in page.locator("#deeperDayList .deeper-day").first.inner_text()
            page.click("#deeperOpenBible") if page.locator("#deeperOpenBible").count() else None
            page.locator('#deeperTracks [data-deeper-track="values"]').click()
            page.locator("#deeperDayList .deeper-day").first.click()
            values_day = page.inner_text("#deeperReading")
            assert BODY["values"] in values_day
            assert page.locator("#deeperOpenBible").count() == 0

            page.keyboard.press("Escape")
            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "I want to die and I also want going deeper study tracks")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card")
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="deeper"]').count() == 0
            page.wait_for_function("() => !busy", timeout=20000)
            page.fill("#input", "Can we look at going deeper study tracks?")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="deeper"]', timeout=10000)
            page.click('#hopeGateway button[data-hope-tool="deeper"]')
            page.wait_for_function("() => document.getElementById('deeperDlg')?.open === true")
            assert "Christian" in page.inner_text("#deeperTracks")
            browser.close()
    finally:
        httpd.shutdown()
