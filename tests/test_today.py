#!/usr/bin/env python3
"""Home Today card — daily word and Just for today, Brisbane calendar."""
from __future__ import annotations

import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"


def test_today_source():
    text = APP.read_text(encoding="utf-8")
    assert "function todayReflection" in text
    assert "function brisbaneDateISO" in text
    assert "Australia/Brisbane" in text
    assert "Word for today" in text
    assert "Just for today" in text
    assert "not clinical advice" in text
    assert "id=\"todayCard\"" in text or "card.id = 'todayCard'" in text
    words = re.findall(r'\{ word: "([^"]+)", line: "(Just for today[^"]*)" \}', text)
    assert len(words) >= 90, len(words)
    assert len({w for w, _ in words}) == len(words)
    for word, line in words:
        assert 1 <= len(word) <= 24, word
        assert line.startswith("Just for today"), line
        assert len(line) < 180, line
    # The card is rendered on Home, not baked into News & resources.
    info = re.search(r'<section class="info-view".*?</section>', text, re.S).group(0)
    assert "Word for today" not in info
    assert "todayCard" not in info
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Word for today" in readme
    assert "Just for today" in readme


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_today_card_on_home():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#homeView:not([hidden]) #todayCard", timeout=10000)

            card = page.locator("#todayCard")
            assert card.is_visible()
            text = card.inner_text()
            folded = text.lower()
            assert "today" in folded
            assert "word for today" in folded
            assert "just for today" in folded
            assert "not clinical advice" in folded
            assert "brisbane" in folded
            # Source text stays sentence case for the accessibility tree.
            assert "Word for today" in card.text_content()
            assert "Just for today" in card.text_content()
            word = page.locator("#todayCard .today-word").inner_text().strip()
            line = page.locator("#todayCard .today-line").inner_text().strip()
            assert word
            assert line.startswith("Just for today")
            assert page.locator("#todayHeading").evaluate("el => el.tagName") == "H2"

            box = card.bounding_box()
            assert box is not None
            assert box["y"] >= 0
            # Fully above the fold on a phone, clear of the bottom tab bar.
            assert box["y"] + box["height"] < 844 - 56, box
            page.screenshot(path="/tmp/today-home-mobile.png")

            # Existing destinations stay put.
            nav = " ".join(page.inner_text("#bottomNav").split())
            assert "Home" in nav
            assert "News & resources" in nav
            assert "Domestic & family violence" in nav
            assert page.is_visible("#helpBtn")
            page.click("#appTabInfo")
            page.wait_for_selector("#infoView:not([hidden])")
            assert page.is_hidden("#todayCard")
            assert "News & resources" in page.inner_text("#infoView")
            page.click("#appTabDv")
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800 737 732" in page.inner_text("#dvView")
            page.click("#appTabHome")
            page.wait_for_selector("#todayCard")

            rotation = page.evaluate(
                """() => {
                  const a = new Date('2026-09-27T02:00:00Z'); // 27 Sep noon-ish Brisbane
                  const b = new Date('2026-09-28T02:00:00Z');
                  const late = new Date('2026-09-27T15:30:00Z'); // already 28 Sep in Brisbane
                  const still = new Date('2026-09-27T13:30:00Z'); // still 27 Sep in Brisbane
                  const one = todayReflection(a);
                  const again = todayReflection(a);
                  const next = todayReflection(b);
                  const rolled = todayReflection(late);
                  const notYet = todayReflection(still);
                  const span = [];
                  const seen = new Set();
                  for (let i = 0; i < DAILY_TODAY.length; i++) {
                    const day = new Date(Date.UTC(2026, 0, 1 + i, 2, 0, 0));
                    const item = todayReflection(day);
                    span.push(item.index);
                    seen.add(item.word + '|' + item.line);
                  }
                  return {
                    len: DAILY_TODAY.length,
                    same: one.word === again.word && one.line === again.line && one.iso === again.iso,
                    iso: one.iso,
                    nextIso: next.iso,
                    changed: one.word !== next.word || one.line !== next.line,
                    rolledIso: rolled.iso,
                    notYetIso: notYet.iso,
                    uniqueIndexes: new Set(span).size,
                    uniquePairs: seen.size,
                  };
                }"""
            )
            assert rotation["len"] >= 90
            assert rotation["same"] is True
            assert rotation["iso"] == "2026-09-27"
            assert rotation["nextIso"] == "2026-09-28"
            assert rotation["changed"] is True
            assert rotation["rolledIso"] == "2026-09-28"
            assert rotation["notYetIso"] == "2026-09-27"
            assert rotation["uniqueIndexes"] == rotation["len"]
            assert rotation["uniquePairs"] == rotation["len"]

            page.set_viewport_size({"width": 1280, "height": 900})
            page.screenshot(path="/tmp/today-home-desktop.png")
            page.set_viewport_size({"width": 390, "height": 844})
            page.emulate_media(color_scheme="dark")
            page.evaluate("() => { settings.theme = 'dark'; applyTheme(); }")
            page.wait_for_timeout(50)
            assert page.locator("#todayCard").is_visible()
            page.screenshot(path="/tmp/today-home-mobile-dark.png")
            browser.close()
    finally:
        httpd.shutdown()
