#!/usr/bin/env python3
"""Hopewick in-app WEB Bible + SOAP (Playwright)."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"


def test_static_build_and_copyright_guard():
    text = APP.read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.5'" in text
    assert "WEB_CANON" in text
    assert "WEB_EMBED_DAY1" in text
    assert "fillSoapPassage" in text
    assert 'id="bibleReaderPanel"' in text
    for bad in (
        "Holy Bible, New International Version",
        "Christian Standard Bible®",
        "ESV® Text Edition",
    ):
        assert bad not in text


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
