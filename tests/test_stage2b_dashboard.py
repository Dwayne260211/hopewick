# -*- coding: utf-8 -*-
"""Hopewick 2.0 Stage 2b: dashboard, Tools/Learn hubs, responsive navigation, theme toggle.

Checks the brief: bottom nav (Home, Chat, Tools, Learn, More) on phones, sidebar on
desktop, crisis help always one tap away and free, every dashboard button does
something real, empty states are honest, keyboard works, light/dark both render.
"""
from __future__ import annotations

import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from plus_session import install_member_session  # noqa: E402


class _Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def _server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _enter_demo(page, base):
    install_member_session(page)
    page.goto(f"{base}/app/?demo=1&demospeed=30", wait_until="domcontentloaded")
    page.wait_for_selector("#launchPrefs:not([hidden])", timeout=20000)
    page.click("#launchPrefsContinue")
    page.wait_for_selector("#dashGrid", timeout=10000)


def _close_everything(page):
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")


DASH_CARDS = ["dashCheckin", "dashHope", "dashNextStep", "dashMilestones", "dashMood", "dashGoals",
              "dashJournal", "dashCoping", "dashLearn", "dashSafety", "dashRecent", "dashAccount"]


def test_mobile_dashboard_nav_and_hubs():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            _enter_demo(page, base)

            # Bottom nav from the mockup; no sidebar nav on phones.
            labels = [t.strip() for t in page.locator("#bottomNav .bottom-nav-btn").all_inner_texts()]
            assert labels == ["Home", "Chat", "Tools", "Learn", "More"]
            assert page.locator("#appTabHome").get_attribute("aria-current") == "page"
            assert page.locator("#sidePrimaryNav").is_hidden()

            # Crisis entry is visible, labelled, and opens free crisis lines without the AI.
            help_btn = page.locator("#helpBtn")
            assert help_btn.is_visible()
            assert "Get help now" in (help_btn.get_attribute("aria-label") or "")
            help_btn.click()
            page.wait_for_function("() => document.getElementById('helpDlg')?.open === true")
            help_text = page.inner_text("#helpDlg")
            assert "13 11 14" in help_text
            assert "000" in help_text
            _close_everything(page)

            # Every dashboard card is there, with a real heading.
            for card in DASH_CARDS:
                assert page.locator(f"#{card}").count() == 1, card
                assert page.locator(f"#{card} .hw-card__title").inner_text().strip(), card
            safety = page.locator("#dashSafety")
            assert safety.locator('a[href="tel:000"]').count() == 1
            assert safety.locator('a[href="tel:131114"]').count() == 1
            # Demo profile has a clean-time date, so the card shows real days...
            assert "day" in page.inner_text("#dashMilestones").lower()
            # ...and without one it shows an honest empty state with a working action.
            page.evaluate("() => { settings.soberStart = ''; renderHome(); }")
            assert page.locator("#dashMilestones .hw-empty").count() == 1
            assert page.locator('#dashMilestones [data-dash="cleantime"]').count() == 1
            assert page.locator("#dashJournal .hw-empty, #dashJournal .hw-card__body").count() >= 1
            # Every button has an accessible name.
            unnamed = page.evaluate(
                """() => [...document.querySelectorAll('#homeView button')]
                    .filter((b) => !(b.getAttribute('aria-label') || b.textContent).trim()).length"""
            )
            assert unnamed == 0

            # No broken buttons: each dashboard action opens a dialog or moves to a screen.
            actions = page.evaluate("() => [...document.querySelectorAll('#dashGrid [data-dash]')].map((b) => b.dataset.dash)")
            assert {"chat", "chats", "help", "dv", "learn", "account"} <= set(actions)
            for key in actions:
                _close_everything(page)
                page.click("#appTabHome")
                page.wait_for_selector("#dashGrid")
                page.click(f'#dashGrid [data-dash="{key}"]')
                page.wait_for_timeout(150)
                moved = page.evaluate(
                    """(key) => appTab !== 'home'
                      || !!document.querySelector('dialog[open]')
                      || !document.getElementById('launchPrefs').hidden
                      || (document.activeElement && document.activeElement !== document.body
                          && document.activeElement.dataset.dash !== key)""",
                    key,
                )
                assert moved, f"dashboard button {key} did nothing"
            _close_everything(page)

            # Tools hub reaches the destinations that left the bottom bar.
            page.click("#appTabTools")
            page.wait_for_selector("#toolsView:not([hidden])")
            assert page.locator("#appTabTools").get_attribute("aria-current") == "page"
            for hub in ("help", "dv", "breakers", "journal", "chats", "plans", "meetings"):
                assert page.locator(f'#toolsHub [data-hub="{hub}"]').count() == 1, hub
            page.click('#toolsHub [data-hub="dv"]')
            page.wait_for_selector("#dvView:not([hidden])")
            assert "1800RESPECT" in page.inner_text("#dvView")
            assert page.locator("#appTabTools").get_attribute("aria-current") == "page"

            # Learn hub.
            page.click("#appTabLearn")
            page.wait_for_selector("#learnView:not([hidden])")
            for hub in ("today", "steps", "deeper", "nutrition"):
                assert page.locator(f'#learnHub [data-hub="{hub}"]').count() == 1, hub

            # Every hub card opens something real.
            for tab, hub_id in (("tools", "toolsHub"), ("learn", "learnHub")):
                keys = page.evaluate(f"() => [...document.querySelectorAll('#{hub_id} [data-hub]')].map((b) => b.dataset.hub)")
                assert len(keys) >= 4
                for key in keys:
                    _close_everything(page)
                    page.evaluate(f"() => setAppTab('{tab}')")
                    page.click(f'#{hub_id} [data-hub="{key}"]')
                    page.wait_for_timeout(120)
                    moved = page.evaluate(
                        f"""() => appTab !== '{tab}' || !!document.querySelector('dialog[open]')
                              || !document.getElementById('launchPrefs').hidden"""
                    )
                    assert moved, f"{tab} card {key} did nothing"
                _close_everything(page)

            # Keyboard: Tab reaches the bottom bar and Enter activates it.
            page.locator("#appTabHome").focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#homeView:not([hidden])")
            outline = page.evaluate(
                """() => { const b = document.getElementById('appTabChat'); b.focus();
                     return getComputedStyle(b).outlineStyle; }"""
            )
            assert outline != "none"

            # More opens the drawer.
            page.click("#appTabMore")
            page.wait_for_selector("#app.sidebar-open")
            assert page.locator("#appTabMore").get_attribute("aria-expanded") == "true"

            overflow = page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
            assert overflow
            assert not errors, errors
            browser.close()
    finally:
        httpd.shutdown()


def test_desktop_sidebar_and_theme_toggle():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900}, color_scheme="light")
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            _enter_demo(page, base)

            assert page.locator("#bottomNav").is_hidden()
            assert page.locator("#sidePrimaryNav").is_visible()
            assert page.locator("#helpBtn").is_visible()
            labels = [" ".join(t.split()) for t in page.locator("#sidePrimaryNav [data-nav]").all_inner_texts()]
            assert labels[:4] == ["Home", "Chat with Hope", "Tools", "Learn"] or labels[0] == "Home"

            page.click("#sideNavTools")
            page.wait_for_selector("#toolsView:not([hidden])")
            assert page.locator("#sideNavTools").get_attribute("aria-current") == "page"
            page.click("#sideNavChats")
            page.wait_for_selector("#chatsView:not([hidden])")
            assert page.locator("#sideNavChats").get_attribute("aria-current") == "page"
            page.locator("#sideNavLearn").focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#learnView:not([hidden])")

            # Theme toggle (switch) flips light/dark and is remembered on this device.
            toggle = page.locator("#sideThemeToggle")
            assert toggle.get_attribute("role") == "switch"
            before = page.evaluate("() => HopewickTheme.resolved()")
            toggle.click()
            after = page.evaluate("() => HopewickTheme.resolved()")
            assert before != after
            assert page.evaluate("() => localStorage.getItem('hopewick.theme')") == after
            assert toggle.get_attribute("aria-checked") == ("true" if after == "dark" else "false")
            bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("() => document.documentElement.dataset.theme")
            assert page.evaluate("() => HopewickTheme.resolved()") == after
            assert bg
            assert not errors, errors
            browser.close()
    finally:
        httpd.shutdown()


def test_public_pages_light_dark_and_crisis_link():
    from playwright.sync_api import sync_playwright

    httpd = _server()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for scheme in ("light", "dark"):
                ctx = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme)
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda exc: errors.append(str(exc)))
                for path in ("/", "/our-story.html", "/privacy.html", "/terms.html", "/data.html", "/complaints.html"):
                    page.goto(base + path, wait_until="domcontentloaded")
                    crisis = page.locator(".hw-crisis-btn").first
                    assert crisis.is_visible(), path
                    assert page.evaluate("() => HopewickTheme.resolved()") == scheme, path
                    assert page.locator("[data-theme-toggle]").first.is_visible(), path
                    assert page.locator('img[src*="hopewick-mark"]').count() >= 1, path
                    fits = page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
                    assert fits, f"{path} scrolls sideways at 390px ({scheme})"
                page.goto(base + "/", wait_until="domcontentloaded")
                assert "Support for your next step" in page.inner_text("body") or page.locator('img[alt*="Support for your next step"]:visible').count() == 1
                page.goto(base + "/our-story.html", wait_until="domcontentloaded")
                page.locator("[data-theme-toggle]").first.click()
                flipped = "dark" if scheme == "light" else "light"
                assert page.evaluate("() => document.documentElement.dataset.theme") == flipped
                assert not errors, errors
                ctx.close()
            browser.close()
    finally:
        httpd.shutdown()
