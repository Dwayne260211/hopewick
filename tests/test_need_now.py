#!/usr/bin/env python3
"""Home “what do you need” chips, and Hope opening in-app tools."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"


def test_static_need_and_gateway():
    text = APP.read_text(encoding="utf-8")
    assert "What do you need right now?" in text
    assert "function needNowEl" in text
    assert "function syncHopeGateway" in text
    assert "function splitToolLine" in text
    assert "IN-APP TOOLS" in text
    assert 'id="appTabDv"' in text
    assert 'id="appTabInfo"' in text
    help_dlg = text.split('<dialog id="helpDlg"', 1)[1].split("</dialog>", 1)[0]
    assert "Domestic & family violence" not in help_dlg
    assert "Open Get help" in text
    assert "dwaynesimons1990@gmail.com" not in text  # founder email stays server-side


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_need_now_and_hope_gateway():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#needNow", timeout=10000)
            page.wait_for_selector("#todayCard")

            assert page.locator("#needNowHeading").inner_text() == "What do you need right now?"
            for need in ("help", "dv", "craving", "chat", "today", "journal", "bible", "resume", "meeting"):
                assert page.locator(f'#needNow [data-need="{need}"]').count() == 1, need
            heading_box = page.locator("#todayHeading").bounding_box()
            assert heading_box is not None and heading_box["y"] < 520
            card_text = page.locator("#todayCard").text_content()
            assert "Word for the day" in card_text
            assert "Just for today" in card_text

            nav = " ".join(page.inner_text("#bottomNav").split())
            assert "Home" in nav and "Chat" in nav
            assert "Domestic & family violence" in nav
            assert "News & resources" in nav
            assert page.locator("#sideDeveloperBtn").is_hidden()
            assert page.locator("#keyBannerInvite").is_hidden()

            page.evaluate("() => { settings.faith = 'none'; renderHome(); }")
            assert page.locator('#needNow [data-need="bible"]').count() == 0
            assert page.locator('#needNow [data-need="help"]').count() == 1
            page.evaluate("() => { settings.faith = 'general'; renderHome(); }")
            assert page.locator('#needNow [data-need="bible"]').count() == 1

            page.click('#needNow [data-need="help"]')
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            assert "Domestic & family violence" not in page.inner_text("#helpDlg")
            assert "1800 250 015" in page.inner_text("#helpDlg")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('helpDlg')?.open !== true")

            page.click('#needNow [data-need="dv"]')
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800 737 732" in page.inner_text("#dvView")
            assert page.locator("#appTabDv").get_attribute("aria-current") == "page"

            page.click("#appTabHome")
            page.wait_for_selector("#todayCard")
            page.click('#needNow [data-need="today"]')
            assert page.locator("#todayExpand").get_attribute("aria-expanded") == "true"

            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert "SOAP" in page.inner_text("#bibleTitle")
            assert page.locator("#bibleSoapPanel").is_visible()
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open !== true")

            # A bible/soap tab id must open the study, not fall through to Home.
            page.evaluate("() => setAppTab('soap')")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert page.locator("#bibleSoapPanel").is_visible()
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open !== true")

            page.click("#appTabMore")
            page.click("#sideBibleBtn")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            assert page.locator("#bibleSoapPanel").is_visible()
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open !== true")

            for need, dlg in (
                ("journal", "journalDlg"),
                ("meeting", "meetingDlg"),
                ("craving", "circuitBreakerDlg"),
                ("help", "helpDlg"),
            ):
                page.click(f'#needNow [data-need="{need}"]')
                page.wait_for_function(
                    f"() => document.getElementById('{dlg}')?.open === true",
                    timeout=5000,
                )
                page.keyboard.press("Escape")
                page.wait_for_function(f"() => document.getElementById('{dlg}')?.open !== true")

            page.click('#needNow [data-need="resume"]')
            page.wait_for_selector("#resumeView:not([hidden])")
            page.click("#appTabHome")
            page.wait_for_selector("#needNow")

            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "Please open my journal")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="journal"]', timeout=10000)
            assert "TOOLS:" not in page.inner_text("#messagesInner")
            page.click('#hopeGateway button[data-hope-tool="journal"]')
            page.wait_for_function("() => document.getElementById('journalDlg')?.open === true")
            page.keyboard.press("Escape")
            page.wait_for_function("() => !busy", timeout=20000)

            page.fill("#input", "my partner is hurting me")
            page.click("#sendBtn")
            page.wait_for_selector(".crisis-card")
            card = page.inner_text(".crisis-card")
            assert "Open Get help" in card
            assert "Open domestic & family violence" in card
            assert "1800RESPECT" in card
            page.wait_for_selector('#hopeGateway.is-crisis button[data-hope-tool="help"]')
            assert page.locator('#hopeGateway button[data-hope-tool="plus"]').count() == 0
            assert page.locator('#hopeGateway button[data-hope-tool="resume"]').count() == 0
            page.wait_for_function("() => !busy", timeout=20000)
            assert "TOOLS:" not in page.inner_text("#messagesInner")

            page.fill("#input", "I want Hopewick Plus and more messages")
            page.click("#sendBtn")
            page.wait_for_selector('#hopeGateway button[data-hope-tool="plus"]', timeout=10000)
            assert page.locator("#hopeGateway").get_attribute("class").find("is-crisis") == -1
            page.click('#hopeGateway button[data-hope-tool="plus"]')
            page.wait_for_function("() => document.getElementById('accountDlg')?.open === true")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.getElementById('accountDlg')?.open !== true")
            page.wait_for_function("() => !busy", timeout=20000)

            page.click("#appTabHome")
            page.wait_for_selector('#needNow [data-need="bible"]')
            page.click('#needNow [data-need="bible"]')
            page.wait_for_function("() => document.getElementById('bibleDlg')?.open === true")
            page.click("#bibleStartSoap")
            page.wait_for_selector("#messages:not([hidden])")
            assert page.locator("#homeView").is_hidden()
            assert page.locator("#appTabChat").get_attribute("aria-current") == "page"
            page.wait_for_function(
                "() => (document.getElementById('messagesInner')?.innerText || '').includes('SOAP')",
                timeout=15000,
            )
            browser.close()
    finally:
        httpd.shutdown()
