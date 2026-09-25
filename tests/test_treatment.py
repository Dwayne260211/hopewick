#!/usr/bin/env python3
"""Hopewick Find treatment / rehab — official AU link-outs (Playwright)."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"
LAND = ROOT / "index.html"

REQUIRED_NUMBERS = [
    "1800 250 015",
    "1800 177 833",
    "1800 888 236",
    "1800 198 024",
    "9442 5000",
    "1300 131 340",
    "1800 811 994",
    "6207 9977",
    "1800 131 350",
]

REQUIRED_URLS = [
    "https://adis.health.qld.gov.au/getting-support/find-a-service",
    "https://qnada.org.au/",
    "https://www.health.nsw.gov.au/aod/Pages/contact-service.aspx",
    "https://directline.org.au/service-finder",
    "https://www.counsellingonline.org.au/service-finder",
    "https://myservices.org.au/",
    "https://atdc.org.au/service-directory/",
    "https://directory.atoda.org.au/",
    "https://www.aadant.org.au/AADANTServiceDirectory",
]


def test_static_treatment_tool():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.12'" in text
    assert 'content="hopewick-v5.12"' in land
    assert 'id="treatmentDlg"' in text
    assert "const TREATMENT_STATES" in text
    assert "function openTreatment" in text
    assert 'id="sideTreatmentBtn"' in text
    assert "Find treatment / rehab" in text
    assert "scrap" in text.lower()
    for n in REQUIRED_NUMBERS:
        assert n in text, f"missing number {n}"
    for u in REQUIRED_URLS:
        assert u in text, f"missing url {u}"
    dlg = re.search(r'<dialog id="treatmentDlg".*?</dialog>', text, re.S).group(0)
    assert "Jesus" not in dlg
    assert "pray" not in dlg.lower()


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_treatment_finder_ui():
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
            page.wait_for_selector("#sideTreatmentBtn", timeout=20000)
            # Desktop: sidebar already visible; menuBtn is mobile-only
            if not page.is_visible("#sideTreatmentBtn"):
                page.click("#menuBtn", force=True)
                page.wait_for_selector("#sideTreatmentBtn")
            assert page.is_visible("#sideTreatmentBtn")
            page.click("#sideTreatmentBtn")
            page.wait_for_function("() => document.getElementById('treatmentDlg')?.open === true")
            body = page.inner_text("#treatmentDlg")
            assert "1800 250 015" in body
            page.wait_for_selector("#treatmentStateGrid button")
            btns = page.query_selector_all("#treatmentStateGrid button")
            assert len(btns) == 8
            labels = [b.inner_text() for b in btns]
            assert any("QLD" in x for x in labels)
            assert any("NT" in x for x in labels)
            page.screenshot(path=str(shot_dir / "v57-treatment-home.png"))
            page.click('#treatmentStateGrid button[data-state="qld"]')
            page.wait_for_selector("#treatmentDetail:not([hidden])")
            detail = page.inner_text("#treatmentDetail")
            assert "1800 177 833" in detail
            assert "Adis" in detail or "finder" in detail.lower()
            page.screenshot(path=str(shot_dir / "v57-treatment-qld.png"))
            page.click("#treatmentBackBtn")
            page.wait_for_selector("#treatmentHome:not([hidden])")
            page.click('#treatmentStateGrid button[data-state="vic"]')
            page.wait_for_selector("#treatmentDetail:not([hidden])")
            assert "1800 888 236" in page.inner_text("#treatmentDetail")
            page.screenshot(path=str(shot_dir / "v57-treatment-vic.png"))
            browser.close()
    finally:
        httpd.shutdown()
