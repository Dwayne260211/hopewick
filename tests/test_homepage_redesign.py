#!/usr/bin/env python3
"""Homepage redesign (2026-10): six sections, nav, crisis strip, honest pricing, working box breathing."""
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "index.html").read_text(encoding="utf-8")


class _Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def test_six_sections_in_order_and_copy():
    order = ['class="hero"', 'id="how-it-helps"', 'id="see-hopewick"', 'id="founder"', 'id="plans"', 'id="finalTitle"']
    at = [PAGE.index(m) for m in order]
    assert at == sorted(at)
    assert "Small steps <span class=\"gold\">count.</span>" in PAGE
    assert 'href="#see-hopewick"' in PAGE and "See How It Works" in PAGE
    for title in ("Talk to Hope", "Track Your Progress", "Build Practical Skills", "Find Your Next Step"):
        assert f"<h3>{title}</h3>" in PAGE
    assert "Your next step starts here." in PAGE and "Get Started Free" in PAGE
    assert ">hopewick.com.au<" not in PAGE  # never a button label


def test_nav_and_crisis():
    for label, href in (("Home", "/"), ("How It Works", "/how-it-works.html"), ("Our Story", "/our-story.html"),
                        ("Pricing", "/pricing.html"), ("Get Help", "/#get-help"), ("Sign In", "/app/"), ("Start Free", "/app/")):
        assert f'href="{href}"' in PAGE and f">{label}</a>" in PAGE, label
    assert 'aria-expanded="false" aria-controls="navLinks"' in PAGE
    assert 'Not a crisis service. In crisis? Call <a href="tel:000">000</a> or Lifeline <a href="tel:131114">13 11 14</a>.' in PAGE
    assert "not an emergency service or a clinical treatment service" in PAGE


def test_pricing_cards_are_honest():
    assert "15 Hope messages a day" in PAGE
    assert "AU$20" in PAGE and "7-day free trial" in PAGE and "Cancel anytime" in PAGE
    assert "free forever" not in PAGE.lower()
    assert "Move &amp; Recover" not in PAGE  # flag-gated, not advertised


def test_box_breathing_runs_pauses_resets_and_respects_reduced_motion():
    from playwright.sync_api import sync_playwright
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
            page = ctx.new_page()
            page.goto(base + "/")
            assert page.locator("#breathReset").is_hidden() and page.locator("#breathExit").is_hidden()
            page.focus("#breathStart")
            page.keyboard.press("Enter")
            page.wait_for_timeout(1200)
            assert page.inner_text("#breathPhase") == "Breathe in"
            assert page.get_attribute("#breathPhase", "aria-live") == "polite"
            assert page.evaluate("() => getComputedStyle(document.getElementById('breathBox')).transitionDuration") == "0s"
            page.keyboard.press("Enter")
            assert "Paused" in page.inner_text("#breathPhase")
            page.click("#breathReset")
            assert page.inner_text("#breathStart") == "Start"
            page.click("#breathExit")
            assert page.locator("#breathRun").is_hidden()
            page.click("#navToggle")
            assert page.get_attribute("#navToggle", "aria-expanded") == "true"
            page.keyboard.press("Escape")
            assert page.get_attribute("#navToggle", "aria-expanded") == "false"
            assert page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
            browser.close()
    finally:
        httpd.shutdown()
