#!/usr/bin/env python3
"""Hopewick Find AOD services — curated NGO offerings (Playwright)."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"

REQUIRED_ORGS = ["QuIHN", "Drug ARM", "Lives Lived Well", "Brisbane Youth Service", "Anglicare"]
REQUIRED_OFFERS = ["NSP", "counselling", "Creating Options", "MudMaps"]
REQUIRED_PHONES = ["1800 172 076", "(07) 3620 8880", "1300 727 957"]
REQUIRED_URLS = [
    "https://www.quihn.org/",
    "https://www.drugarm.com.au/",
    "https://www.liveslivedwell.org.au/",
    "https://qnada.org.au/",
]


def test_static_aod_services():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.12'" in text
    assert 'content="hopewick-v5.12"' in land
    assert 'id="aodDlg"' in text
    assert "const AOD_ORGS" in text
    assert "function openAodServices" in text
    assert 'id="sideAodBtn"' in text
    assert "Find AOD services" in text
    assert "does not run these services" in text
    assert "not a crisis service" in text.lower()
    dlg = re.search(r'<dialog id="aodDlg".*?</dialog>', text, re.S).group(0)
    assert "crisis service" in dlg.lower()
    assert "not a crisis" in dlg.lower()
    for org in REQUIRED_ORGS:
        assert org in text, f"missing org {org}"
    for offer in REQUIRED_OFFERS:
        assert offer in text, f"missing offer {offer}"
    for n in REQUIRED_PHONES:
        assert n in text, f"missing phone {n}"
    for u in REQUIRED_URLS:
        assert u in text, f"missing url {u}"
    assert "AOD_SERVICES_LANG_RE" in text
    assert "Find AOD services" in (ROOT / "README.md").read_text(encoding="utf-8")


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_aod_services_ui():
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
            page.wait_for_selector("#sideAodBtn", timeout=20000)
            if not page.is_visible("#sideAodBtn"):
                page.click("#menuBtn", force=True)
                page.wait_for_selector("#sideAodBtn")
            assert page.is_visible("#sideAodBtn")
            label = page.inner_text("#sideAodBtn")
            assert "Find AOD services" in label
            page.click("#sideAodBtn")
            page.wait_for_function("() => document.getElementById('aodDlg')?.open === true")
            body = page.inner_text("#aodDlg")
            assert "does not run these services" in body
            assert "not a crisis service" in body.lower()
            assert "QuIHN" in body
            assert "Drug ARM" in body
            assert "NSP" in body
            assert "1800 172 076" in body
            assert "Creating Options" in body or "counselling" in body.lower()
            page.wait_for_selector("#aodFilters .chip")
            chips = page.query_selector_all("#aodFilters .chip")
            assert len(chips) >= 5
            page.click('#aodFilters .chip[data-filter="nsp"]')
            page.wait_for_timeout(200)
            cards = page.inner_text("#aodCards")
            assert "QuIHN" in cards
            assert "Brisbane Youth Service" in cards
            page.screenshot(path=str(shot_dir / "v511-aod-services.png"), full_page=False)
            page.click("#aodFilters .chip:not([data-filter])")
            page.wait_for_timeout(150)
            all_cards = page.inner_text("#aodCards")
            assert "Lives Lived Well" in all_cards
            assert "QNADA" in all_cards
            page.screenshot(path=str(shot_dir / "v511-aod-services-all.png"), full_page=False)
            browser.close()
    finally:
        httpd.shutdown()
