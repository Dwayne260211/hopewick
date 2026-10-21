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


def test_ten_sections_in_order_and_copy():
    order = ['class="hero"', 'id="why"', 'id="how-it-works"', 'id="how-it-helps"', 'id="see-hopewick"', 'id="founder"',
             'id="plans"', 'id="safety-privacy"', 'id="finalTitle"', 'class="hw-footer"']
    at = [PAGE.index(m) for m in order]
    assert at == sorted(at)
    assert "Recovery is a journey. <span class=\"gold\">You don’t have to walk it alone.</span>" in PAGE
    assert ("Hopewick is an AI-powered recovery-support companion built with lived experience at its heart. A space to reflect, "
            "find encouragement, build healthy habits and take the next step forward.") in PAGE
    assert '>Start Free</a>' in PAGE and '<a class="hw-btn" href="our-story.html">Discover Our Story</a>' in PAGE
    assert PAGE.count('<ol class="steps">') == 1 and PAGE.count("<li><h3>") == 3
    for title in ("Talk with Hope", "Track Your Recovery", "Build Your Plan", "Find Support"):
        assert f"<h3>{title}</h3>" in PAGE
    assert "Real app screen, shown in demo mode." in PAGE
    assert "Your next step starts here." in PAGE
    assert ">hopewick.com.au<" not in PAGE  # never a button label


def test_honest_content_rules():
    low = PAGE.lower()
    assert "partner" not in low  # the founder says "my wife"
    assert "my wife" in (ROOT / "our-story.html").read_text(encoding="utf-8").lower()
    assert "his wife" in low
    for banned in ("abbey", "testimonial", "users trust", "thousands of", "clinically proven", "therapist", "unlimited"):
        assert banned not in low, banned
    assert "not a counsellor, doctor or clinician" in PAGE
    assert "graduation expected January 2027" in PAGE and "not a doctor, psychologist or registered counsellor" in PAGE
    # Every features list stays reachable from the homepage.
    for bit in ("recovery-stage support", "anger and relationships", "share a summary with your worker", "wellbeing basics"):
        assert bit in PAGE, bit
    # No private details.
    assert "director" not in low and "tel:04" not in PAGE


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
            page.route("**/api/visit", lambda r: r.fulfill(status=204, body=""))  # never count a test visit
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


def test_homepage_layout_at_three_widths_and_links_resolve():
    """390, 768 and 1280px: no sideways scroll, CTAs visible, touch targets, every local link points at a real file."""
    import re
    from playwright.sync_api import sync_playwright
    hrefs = set(re.findall(r'href="(/?[^"#:?]+\.html|/?app/|/)(?:[?#][^"]*)?"', PAGE))
    for h in hrefs:
        rel = h.lstrip("/")
        target = ROOT / rel if rel and not rel.endswith("/") else ROOT / rel / "index.html"
        assert target.exists(), h
    for tel in ("tel:000", "tel:131114", "tel:1300659467", "tel:1800250015", "tel:1800737732", "tel:139276"):
        assert f'href="{tel}"' in PAGE, tel
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for w, h in ((390, 844), (768, 1024), (1280, 900)):
                page = browser.new_page(viewport={"width": w, "height": h})
                page.route("**/api/visit", lambda r: r.fulfill(status=204, body=""))
                page.goto(base + "/")
                assert page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), w
                assert page.locator("#launchApp").is_visible()
                box = page.locator("#launchApp").bounding_box()
                assert box["y"] + box["height"] <= h * 1.6 and box["height"] >= 44, (w, box)
                small = page.evaluate("""() => [...document.querySelectorAll('main a.hw-btn, main button')]
                    .filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect())
                    .filter((r) => r.height < 44).length""")
                assert small == 0, (w, small)
                assert page.locator(".crisis-strip a[href='tel:000']").is_visible()
                page.close()
            browser.close()
    finally:
        httpd.shutdown()
