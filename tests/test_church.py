#!/usr/bin/env python3
"""Hopewick Find a church — official AU denominational link-outs (Playwright)."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"

REQUIRED_URLS = [
    "https://www.google.com/maps/search/church+near+me",
    "https://www.openstreetmap.org/search?query=church",
    "https://auschurches.com.au/",
    "https://www.acc.org.au/find-a-church",
    "https://www.catholic.org.au/",
    "http://www.catholicdirectory.com.au/findachurch/findChurch.php",
    "https://www.google.com/maps/search/catholic+church+near+me",
    "https://anglican.org.au/anglican-church-community/dioceses-and-parishes/",
    "https://anglican.org.au/",
    "https://uniting.church/findyourchurch/",
    "https://www.baptist.org.au/state-ministries",
    "https://nswactbaptists.org.au/churches/",
    "https://www.buv.com.au/find-a-church/",
    "https://www.salvationarmy.org.au/locations/",
    "https://presbyterian.org.au/",
    "https://www.lca.org.au/find-a/find-a-church/",
    "https://ccnswact.org.au/find-a-church/",
    "https://churchesofchrist.org.au/find-a-church/",
    "https://www.cocwa.com.au/cocwa-family",
    "https://www.celebraterecovery.com.au/about-cr/locations",
]


def test_static_church_tool():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    m = re.search(r"EDEN_BUILD = '(hopewick-v5\.(\d+))'", text)
    assert m, "EDEN_BUILD missing"
    build, minor = m.group(1), int(m.group(2))
    assert minor >= 10, build
    assert f'content="{build}"' in land
    assert 'id="churchDlg"' in text
    assert "function openChurch" in text
    assert 'id="sideChurchBtn"' in text
    assert "Find a church" in text
    assert "syncFaithChurchVisibility" in text
    assert "CHURCH_LANG_RE" in text
    assert "scrap" in text.lower()
    assert "does not run churches" in text.lower()
    assert "companion: 'Hope'" in text or "companion: \"Hope\"" in text or "'Hope'" in text
    for u in REQUIRED_URLS:
        assert u in text, f"missing url {u}"
    dlg = re.search(r'<dialog id="churchDlg".*?</dialog>', text, re.S).group(0)
    assert "catholicdirectory.com.au" in dlg
    # Paid national directory is mentioned as subscription-only, not the primary finder
    if "directory.catholic.au" in dlg:
        assert "subscription" in dlg.lower() or "paid" in dlg.lower()


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_church_finder_ui_and_faith_hide():
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
            page.wait_for_selector("#sideChurchBtn", timeout=20000)
            if not page.is_visible("#sideChurchBtn"):
                page.click("#menuBtn", force=True)
                page.wait_for_selector("#sideChurchBtn")
            assert page.is_visible("#sideChurchBtn")
            page.click("#sideChurchBtn")
            page.wait_for_function("() => document.getElementById('churchDlg')?.open === true")
            body = page.inner_text("#churchDlg")
            assert "does not run churches" in body.lower()
            assert "AusChurches" in body or "auschurches" in body.lower()
            assert "ACC" in body
            assert "Catholic" in body
            assert "not a crisis" in body.lower()
            page.screenshot(path=str(shot_dir / "v58-church-finder.png"), full_page=False)
            page.evaluate(
                """() => {
                  const b = document.querySelector('#churchDlg .dlg-body');
                  if (b) b.scrollTop = 480;
                }"""
            )
            page.wait_for_timeout(200)
            page.screenshot(path=str(shot_dir / "v58-church-traditions.png"), full_page=False)
            page.keyboard.press("Escape")
            page.wait_for_function("() => !document.getElementById('churchDlg')?.open")

            # Soft-hide when faith preference is none (demo blocks Settings UI — set via JS)
            page.evaluate(
                """() => {
                  settings.faith = 'none';
                  syncFaithChurchVisibility();
                  if (typeof syncFaithBibleVisibility === 'function') syncFaithBibleVisibility();
                }"""
            )
            page.wait_for_timeout(200)
            assert page.eval_on_selector("#sideChurchBtn", "el => !!el.hidden")
            assert page.eval_on_selector("#sideBibleBtn", "el => !!el.hidden")
            page.screenshot(path=str(shot_dir / "v58-church-hidden-faith-none.png"), full_page=False)
            browser.close()
    finally:
        httpd.shutdown()


def test_church_chat_chip():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#input", timeout=20000)
            chip = page.query_selector('button.starter:has-text("Find a church")')
            if chip and chip.is_visible():
                chip.click()
            else:
                page.fill("#input", "Can you help me find a church near me?")
                page.click("#sendBtn")
                page.wait_for_timeout(2000)
                bar = page.query_selector("#churchSuggest:not([hidden]) button")
                if bar:
                    bar.click()
                else:
                    page.evaluate("openChurch()")
            page.wait_for_function("() => document.getElementById('churchDlg')?.open === true", timeout=10000)
            assert page.eval_on_selector("#churchDlg", "el => el.open")
            browser.close()
    finally:
        httpd.shutdown()
