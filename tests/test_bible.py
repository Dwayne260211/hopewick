#!/usr/bin/env python3
"""Hopewick in-app WEB Bible + SOAP + Diving Deeper Finding Jesus (Playwright)."""
from __future__ import annotations

import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"


def test_static_build_and_copyright_guard():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.12'" in text
    assert 'content="hopewick-v5.12"' in land
    assert "WEB_CANON" in text
    assert "WEB_EMBED_DAY1" in text
    assert "fillSoapPassage" in text
    assert 'id="bibleReaderPanel"' in text
    assert 'id="bibleDeeperPanel"' in text
    assert "Diving Deeper Finding Jesus" in text
    assert "DIVING_DEEPER_PLAN" in text
    assert "renderDivingDeeper" in text
    for bad in (
        "Holy Bible, New International Version",
        "Christian Standard Bible®",
        "ESV® Text Edition",
        "hereadstruth.com",
        "csbible.com",
        "He Reads Truth",
    ):
        assert bad not in text
        assert bad not in land
    m = re.search(r"const DIVING_DEEPER_PLAN = (\{.*?\});", text)
    assert m, "plan constant missing"
    plan = json.loads(m.group(1))
    assert plan["title"] == "Diving Deeper Finding Jesus"
    assert plan["totalDays"] >= 400
    assert len(plan["sections"]) == 8
    assert plan["days"][0]["main"].startswith("Genesis")
    assert plan["days"][-1]["main"].startswith("Revelation")
    books_hit = set()
    for d in plan["days"]:
        books_hit.add(d["main"].split()[0] if not d["main"][0].isdigit() else " ".join(d["main"].split()[:2]))
    # rough: Genesis through Revelation present via section ids
    assert {s["id"] for s in plan["sections"]} == {
        "genesis", "law", "history", "wisdom", "prophets", "gospels", "church", "revelation"
    }


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_soap_embed_and_full_reader():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#sideBibleBtn", timeout=20000)
            page.route("**/bible-api.com/**", lambda route: route.abort())
            page.click("#sideBibleBtn")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            page.click('[data-bible-tab="soap"]')
            page.wait_for_selector("#soapPassageText .bible-verse", timeout=10000)
            body = page.inner_text("#soapPassageBox")
            assert "Abraham" in body or "genealogy" in body.lower()
            assert "World English" in body or "WEB" in body or "public domain" in body.lower()
            assert "He Reads Truth" not in body
            assert "CSB" not in body
            page.unroute("**/bible-api.com/**")
            page.click('[data-bible-tab="reader"]')
            page.wait_for_selector("#readerBookSelect")
            opts = page.eval_on_selector_all(
                "#readerBookSelect option", "els => els.map(e => e.value)"
            )
            assert len(opts) == 66
            assert opts[0] == "Genesis" and opts[-1] == "Revelation"
            page.select_option("#readerBookSelect", "John")
            page.select_option("#readerChapterSelect", "3")
            page.wait_for_timeout(2000)
            rbody = page.inner_text("#readerBody")
            assert "John" in rbody
            browser.close()
    finally:
        httpd.shutdown()


def test_diving_deeper_plan_ui():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    shot_dir = ROOT / "screenshots"
    shot_dir.mkdir(exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#sideBibleBtn", timeout=20000)
            page.click("#sideBibleBtn")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            page.click('[data-bible-tab="deeper"]')
            page.wait_for_selector("#ddWeekList .dd-row", timeout=10000)
            intro = page.inner_text("#ddIntro")
            assert "one story" in intro.lower() or "Going Deeper" in intro
            prog = page.inner_text("#ddProg")
            assert "66 books" in prog or "days" in prog.lower()
            assert page.locator("#ddSectionNav [data-dd-section]").count() == 8
            # Genesis week rows
            first_main = page.inner_text("#ddWeekList .dd-row .dd-main")
            assert "Genesis" in first_main
            page.screenshot(path=str(shot_dir / "v56-diving-deeper-plan.png"), full_page=False)
            # Open first day
            page.locator("#ddWeekList .dd-row").first.click()
            page.wait_for_selector("#ddDayView:not([hidden])", timeout=10000)
            page.wait_for_timeout(2500)
            hero = page.inner_text("#ddDayHero")
            assert "Genesis" in hero
            assert "Finding Jesus" in page.inner_text("#ddFinding")
            note = page.inner_text("#ddFindingNote")
            assert len(note) > 40
            assert "Talk with Hope" in page.inner_text("#ddDayActions") or page.locator("#ddTalkHope").count()
            page.screenshot(path=str(shot_dir / "v56-diving-deeper-day.png"), full_page=False)
            # Jump to Revelation section
            page.click("#ddBackBtn")
            page.click('[data-dd-section="revelation"]')
            page.wait_for_selector("#ddWeekList .dd-row", timeout=5000)
            assert "Revelation" in page.inner_text("#ddWeekList")
            browser.close()
    finally:
        httpd.shutdown()
