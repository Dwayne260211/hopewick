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


def _reset_home(page):
    page.evaluate(
        """() => {
          document.querySelectorAll('dialog').forEach((d) => { if (d.open) d.close(); });
          setAppTab('home');
        }"""
    )
    page.wait_for_selector("#homeView:not([hidden])")
    page.wait_for_selector("#needNow")
    page.wait_for_function(
        """() => [...document.querySelectorAll('dialog')].every((d) => !d.open)
          && !document.getElementById('homeView').hidden
          && document.querySelector('#appTabHome')?.getAttribute('aria-current') === 'page'"""
    )


def _wait_dialog_on_top(page, dlg_id):
    """The open dialog, not Home underneath it, is what a tap would hit."""
    page.wait_for_function(
        """(id) => {
          const d = document.getElementById(id);
          if (!d || !d.open) return false;
          const r = d.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) return false;
          const hit = document.elementFromPoint(
            Math.floor(r.left + r.width / 2),
            Math.floor(r.top + Math.min(36, r.height / 2))
          );
          return !!(hit && (hit === d || d.contains(hit)));
        }""",
        arg=dlg_id,
        timeout=5000,
    )


def _wait_view_on_top(page, view_id):
    page.wait_for_function(
        """(id) => {
          const view = document.getElementById(id);
          if (!view || view.hidden) return false;
          if ([...document.querySelectorAll('dialog')].some((d) => d.open)) return false;
          const hit = document.elementFromPoint(
            Math.floor(window.innerWidth / 2),
            Math.floor(window.innerHeight * 0.42)
          );
          return !!(hit && (hit === view || view.contains(hit)));
        }""",
        arg=view_id,
        timeout=5000,
    )


def test_every_need_now_chip_click():
    """Click each Home need-now chip and require its own screen, not Home or another tab."""
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            _reset_home(page)

            def click_chip(need, label):
                chip = page.locator(f'#needNow [data-need="{need}"]')
                assert chip.count() == 1, need
                text = chip.inner_text().strip()
                assert text == label, (need, text, label)
                chip.click()

            def check(name, fn):
                try:
                    _reset_home(page)
                    fn()
                    results.append((name, "pass"))
                except Exception as exc:
                    results.append((name, f"FAIL: {exc}"))

            def help_chip():
                click_chip("help", "Get help")
                _wait_dialog_on_top(page, "helpDlg")
                assert "Get help now" in page.inner_text("#helpTitle")
                assert "1800 250 015" in page.inner_text("#helpDlg")
                assert "Domestic & family violence" not in page.inner_text("#helpDlg")
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
                assert page.locator("#dvView").is_hidden()

            def dv_chip():
                click_chip("dv", "Not safe at home")
                _wait_view_on_top(page, "dvView")
                assert page.locator("#homeView").is_hidden()
                assert page.locator("#appTabDv").get_attribute("aria-current") == "page"
                assert page.locator("#appTabHome").get_attribute("aria-current") == "false"
                assert "1800 737 732" in page.inner_text("#dvView")

            def craving_chip():
                click_chip("craving", "A craving")
                _wait_dialog_on_top(page, "circuitBreakerDlg")
                assert "Circuit breakers" in page.inner_text("#breakerTitle")
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
                assert page.evaluate("() => document.getElementById('homeView').hidden") is False

            def chat_chip():
                label = page.locator('#needNow [data-need="chat"]').inner_text().strip()
                assert label.startswith("Talk to "), label
                page.click('#needNow [data-need="chat"]')
                _wait_view_on_top(page, "messages")
                assert page.locator("#homeView").is_hidden()
                assert page.locator("#appTabChat").get_attribute("aria-current") == "page"
                assert page.locator("#appTabHome").get_attribute("aria-current") == "false"
                assert page.locator("#input").is_visible()

            def today_chip():
                click_chip("today", "Today’s reading")
                _wait_view_on_top(page, "homeView")
                assert page.locator("#todayCard").get_attribute("class").find("is-expanded") != -1
                assert page.locator("#todayExpand").get_attribute("aria-expanded") == "true"
                assert page.locator("#todayWordReading").is_visible()
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
                assert page.evaluate("() => [...document.querySelectorAll('dialog')].every(d => !d.open)")

            def journal_chip():
                click_chip("journal", "Journal")
                _wait_dialog_on_top(page, "journalDlg")
                assert "Journal" in page.inner_text("#journalTitle")
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"

            def bible_chip():
                click_chip("bible", "Bible & SOAP")
                _wait_dialog_on_top(page, "bibleDlg")
                title = page.inner_text("#bibleTitle")
                assert "Bible" in title and "SOAP" in title, title
                assert page.locator("#bibleSoapPanel").is_visible()
                assert page.locator("#bibleDeeperPanel").is_hidden()
                assert page.locator("#bibleReaderPanel").is_hidden()
                assert page.locator("#bibleTabSoap").get_attribute("aria-selected") == "true"
                assert page.locator("#bibleStartSoap").is_visible()
                assert page.evaluate("() => document.getElementById('homeView').hidden") is False
                assert page.evaluate("() => appTab") == "home"
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
                assert page.locator("#messages").is_hidden()
                page.click("#bibleStartSoap")
                _wait_view_on_top(page, "messages")
                assert page.evaluate("() => document.getElementById('bibleDlg').open") is False
                assert page.locator("#homeView").is_hidden()
                assert page.locator("#appTabChat").get_attribute("aria-current") == "page"
                page.wait_for_function(
                    "() => (document.getElementById('messagesInner')?.innerText || '').includes('SOAP')",
                    timeout=15000,
                )

            def resume_chip():
                click_chip("resume", "Resume")
                _wait_view_on_top(page, "resumeView")
                assert page.locator("#homeView").is_hidden()
                assert page.locator("#appTabHome").get_attribute("aria-current") == "false"
                assert page.evaluate("() => appTab") == "resume"

            def meeting_chip():
                click_chip("meeting", "A meeting")
                _wait_dialog_on_top(page, "meetingDlg")
                assert "Find a meeting" in page.inner_text("#meetingTitle")
                assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
                assert page.locator("#resumeView").is_hidden()

            check("Get help", help_chip)
            check("Not safe at home", dv_chip)
            check("craving", craving_chip)
            check("chat", chat_chip)
            check("today’s reading", today_chip)
            check("journal", journal_chip)
            check("Bible & SOAP", bible_chip)
            check("resume", resume_chip)
            check("meeting", meeting_chip)
            browser.close()
    finally:
        httpd.shutdown()
    for name, status in results:
        print(f"CHIP {name}: {status}")
    failed = [f"{name}: {status}" for name, status in results if not status.startswith("pass")]
    assert not failed, "\n".join(failed)
