#!/usr/bin/env python3
"""Home Today card — full daily readings, Brisbane calendar."""
from __future__ import annotations

import json
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import install_member_session
APP = ROOT / "app" / "index.html"
WORD_JS = ROOT / "app" / "data" / "word-for-the-day.js"
JFT_JS = ROOT / "app" / "data" / "just-for-today.js"

BANNED = (
    "live through this day only",
    "william james",
    "god grant me the serenity",
    "we admitted we were powerless",
    "just for today i will be happy",
    "easy does it",
    "let go and let god",
)


def _js_array(path: Path, var_name: str):
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"var {var_name} = (\[.*\]);\s*$", text, re.S)
    assert m, var_name
    return json.loads(m.group(1))


def test_today_source():
    text = APP.read_text(encoding="utf-8")
    assert "function todayReflection" in text
    assert "function brisbaneDateISO" in text
    assert "function readingDayIndex" in text
    assert "Australia/Brisbane" in text
    assert "Word for the day" in text
    assert "Just for today" in text
    assert "Optional fellowship-style reflection, not clinical advice." in text
    assert 'src="data/word-for-the-day.js"' not in text
    assert 'src="data/just-for-today.js"' not in text
    assert "function ensureTodayReading" in text
    server = (ROOT / "server" / "index.js").read_text(encoding="utf-8")
    assert "app/data/word-for-the-day.js" in server
    assert "app/data/just-for-today.js" in server
    assert "id=\"todayCard\"" in text or "card.id = 'todayCard'" in text
    assert "Read full reflections" in text
    info = re.search(r'<section class="info-view".*?</section>', text, re.S).group(0)
    assert "Word for the day" not in info
    assert "todayCard" not in info
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Word for the day" in readme
    assert "Just for today" in readme
    assert "not clinical advice" in readme

    words = _js_array(WORD_JS, "WORD_FOR_THE_DAY")
    jfts = _js_array(JFT_JS, "JUST_FOR_TODAY")
    assert len(words) == 365
    assert len(jfts) == 365
    assert len({e["word"] for e in words}) == 365
    assert len({e["title"] for e in jfts}) == 365
    assert [(e["month"], e["day"]) for e in words] == [(e["month"], e["day"]) for e in jfts]
    assert (words[0]["month"], words[0]["day"]) == (1, 1)
    assert (words[58]["month"], words[58]["day"]) == (2, 28)
    assert (words[59]["month"], words[59]["day"]) == (3, 1)
    assert (words[364]["month"], words[364]["day"]) == (12, 31)
    blob = json.dumps(words + jfts).lower()
    for banned in BANNED:
        assert banned not in blob
    ref = re.compile(r"\b(?:[1-3]\s)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s\d+:\d+\b")
    na_church = re.compile(r"\b(jesus|christ|bible|church|scripture|gospel|sermon)\b", re.I)
    for entry in words:
        assert 1 <= len(entry["word"]) <= 28
        assert entry["reading"].count(".") >= 3
        assert len(entry["reading"]) > 400
        assert "Just for today" not in entry["reading"]
        assert "just for today" not in entry["reading"].lower()
        assert ref.search(entry["reading"]), entry["word"]
        low = entry["reading"].lower()
        assert "narcotics anonymous" not in low
        assert "sponsor" not in low
        assert "home group" not in low
        assert "higher power" not in low
    for entry in jfts:
        assert entry["reading"].strip().endswith(".") or entry["reading"].rstrip().endswith(".")
        paras = [part for part in entry["reading"].split("\n\n") if part.strip()]
        assert paras[-1].startswith("Just for today")
        assert len(entry["reading"]) > 400
        assert "Narcotics Anonymous" in entry["reading"]
        assert not ref.search(entry["reading"]), entry["title"]
        assert not na_church.search(entry["reading"]), entry["title"]
    for word, jft in zip(words, jfts):
        assert word["reading"] != jft["reading"]
        assert not re.search(rf"\b{re.escape(word['word'].lower())}\b", jft["reading"].lower())
        assert jft["title"].lower() not in word["reading"].lower()
        w_sents = {s.strip().lower() for s in re.split(r"(?<=[.!?])\s+", word["reading"].replace("\n", " ")) if s.strip()}
        j_sents = {s.strip().lower() for s in re.split(r"(?<=[.!?])\s+", jft["reading"].replace("\n", " ")) if s.strip()}
        assert not (w_sents & j_sents), (word["word"], jft["title"])


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
            # Init scripts are strict, so a file-level `var` would not become a page global.
            page.add_init_script(
                "window.WORD_FOR_THE_DAY = "
                + json.dumps(_js_array(WORD_JS, "WORD_FOR_THE_DAY"))
                + "; window.JUST_FOR_TODAY = "
                + json.dumps(_js_array(JFT_JS, "JUST_FOR_TODAY"))
                + ";"
            )
            install_member_session(page)
            page.goto(f"{base}/app/?demo=1", wait_until="domcontentloaded")
            page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
            page.click("#launchPrefsContinue")
            page.wait_for_selector("#homeView:not([hidden]) #todayCard", timeout=10000)

            card = page.locator("#todayCard")
            assert card.is_visible()
            folded = card.inner_text().lower()
            assert "today" in folded
            assert "word for the day" in folded
            assert "just for today" in folded
            assert "not clinical advice" in folded
            assert "optional fellowship-style reflection" in folded
            assert "brisbane" in folded
            assert "Word for the day" in card.text_content()
            assert "Just for today" in card.text_content()
            word = page.locator("#todayCard .today-word").inner_text().strip()
            title = page.locator("#todayCard .today-jft-title").inner_text().strip()
            assert word
            assert title
            assert page.locator("#todayHeading").evaluate("el => el.tagName") == "H2"
            expand = page.locator("#todayExpand")
            assert expand.inner_text().strip() == "Read full reflections"
            assert expand.get_attribute("aria-expanded") == "false"

            # Both readings are on the card. Collapsed, the control stays reachable.
            heading_box = page.locator("#todayHeading").bounding_box()
            assert heading_box is not None and heading_box["y"] < 520
            expand.scroll_into_view_if_needed()
            assert expand.is_visible()
            page.screenshot(path="/tmp/today-home-mobile.png")

            expand.click()
            assert expand.get_attribute("aria-expanded") == "true"
            assert expand.inner_text().strip() == "Show less"
            word_body = page.locator("#todayWordReading").inner_text().strip()
            jft_body = page.locator("#todayJftReading").inner_text().strip()
            assert word_body.count(".") >= 3
            assert len(word_body) > 400
            assert "Just for today" in jft_body
            assert len(jft_body) > 400
            page.locator("#todayJftReading .today-jft-close").scroll_into_view_if_needed()
            assert page.locator("#todayJftReading .today-jft-close").is_visible()
            page.screenshot(path="/tmp/today-home-mobile-expanded.png")
            expand.click()
            assert expand.get_attribute("aria-expanded") == "false"

            # Existing destinations stay put.
            nav = " ".join(page.inner_text("#bottomNav").split())
            assert "Home" in nav
            assert "Journal" in nav
            assert "News" not in nav
            assert "Safety" in nav
            assert page.is_visible("#helpBtn")
            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            page.click("#sideInfoBtn")
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
                  for (let i = 0; i < WORD_FOR_THE_DAY.length; i++) {
                    const day = new Date(Date.UTC(2026, 0, 1 + i, 2, 0, 0));
                    const item = todayReflection(day);
                    span.push(item.index);
                    seen.add(item.word + '|' + item.line);
                  }
                  const feb28 = todayReflection(new Date('2028-02-28T02:00:00Z'));
                  const leap = todayReflection(new Date('2028-02-29T02:00:00Z'));
                  const mar2028 = todayReflection(new Date('2028-03-01T02:00:00Z'));
                  const mar2026 = todayReflection(new Date('2026-03-01T02:00:00Z'));
                  return {
                    len: WORD_FOR_THE_DAY.length,
                    jft: JUST_FOR_TODAY.length,
                    same: one.word === again.word && one.line === again.line && one.iso === again.iso,
                    iso: one.iso,
                    nextIso: next.iso,
                    changed: one.word !== next.word || one.line !== next.line,
                    rolledIso: rolled.iso,
                    notYetIso: notYet.iso,
                    uniqueIndexes: new Set(span).size,
                    uniquePairs: seen.size,
                    leapIso: leap.iso,
                    leapShares: leap.index === feb28.index && leap.word === feb28.word && leap.line === feb28.line,
                    marchStable: mar2028.index === mar2026.index && mar2028.word === mar2026.word,
                    marchDiffers: mar2028.index !== feb28.index,
                  };
                }"""
            )
            assert rotation["len"] == 365
            assert rotation["jft"] == 365
            assert rotation["same"] is True
            assert rotation["iso"] == "2026-09-27"
            assert rotation["nextIso"] == "2026-09-28"
            assert rotation["changed"] is True
            assert rotation["rolledIso"] == "2026-09-28"
            assert rotation["notYetIso"] == "2026-09-27"
            assert rotation["uniqueIndexes"] == 365
            assert rotation["uniquePairs"] == 365
            assert rotation["leapIso"] == "2028-02-29"
            assert rotation["leapShares"] is True
            assert rotation["marchStable"] is True
            assert rotation["marchDiffers"] is True

            page.set_viewport_size({"width": 1280, "height": 900})
            page.locator("#todayCard").scroll_into_view_if_needed()
            page.screenshot(path="/tmp/today-home-desktop.png")
            page.set_viewport_size({"width": 390, "height": 844})
            page.emulate_media(color_scheme="dark")
            page.evaluate("() => { settings.theme = 'dark'; applyTheme(); }")
            page.wait_for_timeout(50)
            assert page.locator("#todayCard").is_visible()
            page.locator("#todayCard").scroll_into_view_if_needed()
            page.screenshot(path="/tmp/today-home-mobile-dark.png")
            browser.close()
    finally:
        httpd.shutdown()
