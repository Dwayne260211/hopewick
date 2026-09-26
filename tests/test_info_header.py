#!/usr/bin/env python3
"""Hopewick v5.13 — launch preferences (decluttered header) and Info DV support."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"

REQUIRED_NUMBERS = [
    "1800 737 732",
    "0458 737 732",
    "1800 811 811",
    "1800 600 636",
    "1300 65 11 88",
    "1300 65 01 43",
    "1800 957 957",
    "1800 887 700",
]
REQUIRED_URLS = [
    "https://1800respect.org.au/",
    "https://askizzy.org.au/search/domestic-violence",
    "https://familyviolencelaw.gov.au/",
    "https://www.dvconnect.org/womensline/",
    "https://www.dvconnect.org/about-crisis-accommodation/",
    "https://www.qld.gov.au/community/getting-support-health-social-issue/support-victims-abuse/need-to-know/help-and-support-options/find-local-support",
    "https://www.legalaid.qld.gov.au/Find-legal-information/Relationships-and-children/Domestic-and-family-violence",
    "https://wlsq.org.au/",
    "https://qifvls.com.au/",
    "https://quivaa.org.au/publications-and-media/",
    "https://theknow.org.au/",
    "https://www.health.nsw.gov.au/aod/public-drug-alerts/Pages/default.aspx",
    "https://www.health.gov.au/our-work/take-home-naloxone-program/where-to-access-naloxone",
    "https://quivaa.org.au/advocacy-action/",
]


def test_static_header_and_info():
    text = APP.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.13'" in text
    topbar = re.search(r'<header class="topbar">.*?</header>', text, re.S).group(0)
    actions = re.search(r'<div class="topbar-actions">.*?</div>', topbar, re.S).group(0)
    # Menu + Get help + profile + hands-free. Preferences are not in the header.
    assert topbar.count("<button") == 4
    assert actions.count("<button") == 3
    assert "Get help" in topbar
    assert 'id="helpBtn"' in topbar
    assert 'data-open="settings"' not in topbar
    assert 'id="themeBtn"' not in topbar
    assert 'id="autoSpeakBtn"' not in topbar
    assert 'id="launchPrefs"' in text
    assert 'id="appTabInfo"' in text
    assert "Home" in text and ">Info<" in text
    for n in REQUIRED_NUMBERS:
        assert n in text, n
    for u in REQUIRED_URLS:
        assert u in text, u
    assert "function showLaunchPrefs" in text
    assert "function renderInfoRegion" in text
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "1800 737 732" in readme
    assert "1800 811 811" in readme


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_launch_prefs_and_info_ui():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    shot_dir = ROOT / "screenshots"
    shot_dir.mkdir(exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            assert page.is_visible("#helpBtn")
            assert page.locator(".topbar-actions > button").count() == 3
            assert page.locator('.topbar [data-open="settings"]').count() == 0
            assert page.locator(".topbar #themeBtn").count() == 0
            page.screenshot(path=str(shot_dir / "v513-launch-prefs-mobile.png"))
            page.select_option("#launchFaith", "none")
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#homeView:not([hidden])", timeout=10000)
            assert page.is_hidden("#launchPrefs")
            page.screenshot(path=str(shot_dir / "v513-home-header-mobile.png"))

            page.click("#appTabInfo")
            page.wait_for_selector("#infoView:not([hidden])")
            body = page.inner_text("#infoView")
            assert "1800 737 732" in body
            assert "1800 811 811" in body
            assert "Ask Izzy" in body
            assert "Family Violence Law Help" in body
            assert "QuIVAA" in body
            assert "The Know" in body
            page.locator("#infoRegionDetail").scroll_into_view_if_needed()
            page.screenshot(path=str(shot_dir / "v513-info-qld-detail.png"))

            page.click('#infoRegionChips button[data-region="nsw"]')
            page.wait_for_timeout(150)
            detail = page.inner_text("#infoRegionDetail")
            assert "New South Wales" in detail
            assert "1800 811 811" not in detail
            assert "1800 737 732" in page.inner_text("#infoDvNational")
            page.click('#infoRegionChips button[data-region="qld"]')
            page.wait_for_timeout(150)
            assert "1800 811 811" in page.inner_text("#infoRegionDetail")
            assert "1300 65 11 88" in page.inner_text("#infoRegionDetail")
            assert "1800 957 957" in page.inner_text("#infoRegionDetail")

            page.set_viewport_size({"width": 1280, "height": 900})
            page.click("#sideAboutBtn")  # sidebar is visible on desktop; ensures More menu still works
            page.wait_for_function("() => document.getElementById('aboutDlg')?.open === true")
            page.keyboard.press("Escape")
            # Preferences from the sidebar returns to the launch step, not a header icon.
            page.click('[data-open="prefs"]')
            page.wait_for_selector("#launchPrefs:not([hidden])")
            assert page.locator(".topbar-actions > button").count() == 3
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#launchPrefs", state="hidden")
            page.click("#appTabHome")
            page.wait_for_selector("#homeView:not([hidden])")
            page.screenshot(path=str(shot_dir / "v513-home-desktop.png"))
            browser.close()
    finally:
        httpd.shutdown()
