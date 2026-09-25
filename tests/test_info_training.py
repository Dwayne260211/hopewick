#!/usr/bin/env python3
"""Hopewick Info & training — official AU AOD info + workforce link-outs (Playwright)."""
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
    "https://insight.qld.edu.au/",
    "https://insight.qld.edu.au/dovetail",
    "https://insight.qld.edu.au/toolkits/trauma-informed-care/detail",
    "https://insight.qld.edu.au/training/methamphetamine/landing",
    "https://insight.qld.edu.au/training/alcohol/landing",
    "https://insight.qld.edu.au/training/cannabis/landing",
    "https://insight.qld.edu.au/training/understanding-drugs-opioids/landing",
    "https://insight.qld.edu.au/toolkits/understanding-drugs/detail",
    "https://insight.qld.edu.au/toolkits/meth-check/detail",
    "https://insight.qld.edu.au/training/psychostimulants-withdrawal-management/landing",
    "https://insight.qld.edu.au/training/elearning/course-guide",
    "https://insight.qld.edu.au/training/elearning",
    "https://nceta.flinders.edu.au/",
    "https://cracksintheice.org.au/health-professionals/online-resources",
    "https://adf.org.au/",
    "https://positivechoices.org.au/",
    "https://www.aihw.gov.au/reports-data/behaviours-risk-factors/illicit-use-of-drugs/overview",
    "https://www.counsellingonline.org.au/",
]


def test_static_info_training_tool():
    text = APP.read_text(encoding="utf-8")
    land = LAND.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.10'" in text
    assert 'content="hopewick-v5.10"' in land
    assert 'id="infoDlg"' in text
    assert "function openInfoTraining" in text
    assert 'id="sideInfoBtn"' in text
    assert "Info &amp; training" in text or "Info & training" in text
    assert "For AOD staff" in text
    assert "For everyone" in text
    assert "insight.qld.edu.au" in text
    assert "does not run these courses" in text.lower()
    assert "not medical advice" in text.lower()
    for u in REQUIRED_URLS:
        assert u in text, f"missing url {u}"
    dlg = re.search(r'<dialog id="infoDlg".*?</dialog>', text, re.S).group(0)
    assert dlg.find("insight.qld.edu.au") < dlg.find("adf.org.au")
    assert "Featured" in dlg
    assert "Sample courses" in dlg
    assert "Trauma-informed care" in dlg or "trauma-informed care" in dlg
    assert "Foundations of Trauma-Informed Care" in dlg
    assert "Applying Trauma-Informed Care in Practice" in dlg
    assert "Methamphetamine" in dlg
    assert "Understanding Drugs" in dlg or "Understanding drugs" in dlg
    assert "Meth Check" in dlg
    assert "Alcohol" in dlg and "Cannabis" in dlg and "Opioids" in dlg
    assert "Jesus" not in dlg
    assert "pray" not in dlg.lower()


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_info_training_ui():
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
            page.wait_for_selector("#sideInfoBtn", timeout=20000)
            if not page.is_visible("#sideInfoBtn"):
                page.click("#menuBtn", force=True)
                page.wait_for_selector("#sideInfoBtn")
            assert page.is_visible("#sideInfoBtn")
            page.click("#sideInfoBtn")
            page.wait_for_function("() => document.getElementById('infoDlg')?.open === true")
            body = page.inner_text("#infoDlg")
            low = body.lower()
            assert "insight" in low
            assert "aod staff" in low
            assert "for everyone" in low
            assert "adf" in low or "alcohol and drug foundation" in low
            assert "dovetail" in low
            assert "nceta" in low
            assert "sample courses" in low
            assert "trauma" in low
            assert "methamphetamine" in low
            assert "understanding drugs" in low
            assert "meth check" in low
            page.screenshot(path=str(shot_dir / "v59-info-training.png"))
            page.locator("#infoStaffSection").scroll_into_view_if_needed()
            page.screenshot(path=str(shot_dir / "v59-info-training-staff.png"))
            page.locator("#infoInsightSamples").scroll_into_view_if_needed()
            page.screenshot(path=str(shot_dir / "v510-info-insight-samples.png"))
            page.locator("#infoEveryoneSection").scroll_into_view_if_needed()
            page.screenshot(path=str(shot_dir / "v59-info-training-everyone.png"))
            browser.close()
    finally:
        httpd.shutdown()
