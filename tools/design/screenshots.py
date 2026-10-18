"""Stage 2b screenshots: landing page and app dashboard, mobile (390px) and desktop (1280px), light and dark.

Usage: python tools/design/screenshots.py OUT_DIR
Serves the repo with a static server and mocks /api/* as a signed-in free member
(no demo data). Writes landing-{mobile,desktop}-{light,dark}.png and
dashboard-{mobile,desktop}-{light,dark}.png.
"""
from __future__ import annotations

import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


ME = {"signedIn": True, "plus": False, "founder": False, "complimentary": False, "email": "member@example.com",
      "subscriptionStatus": "none", "hasPassword": True, "id": "shot-user", "name": "", "phone": "", "cancelAtPeriodEnd": False}
USAGE = {"used": 0, "limit": 15, "remaining": 15, "plus": False, "trialEligible": True, "resetLabel": "midnight, Brisbane time", "complimentary": False}
CONFIG = {"checkoutReady": True, "devMagic": False, "hopeHosted": True, "googleClientId": "", "trialDays": 7, "amountLabel": "AU$20/month"}


def mock_api(route):
    url = route.request.url
    body, status = {}, 404
    if "/api/auth/me" in url:
        body, status = ME, 200
    elif "/api/billing/config" in url:
        body, status = CONFIG, 200
    elif "/api/hope/usage" in url:
        body, status = USAGE, 200
    elif "/api/chats" in url or "/api/checkins" in url:
        body, status = {"profiles": []}, 200
    elif "/api/visit" in url:
        body, status = {"visits": 1}, 200
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


def readings_script() -> str:
    """The live server serves today's readings from /api; the static server needs them injected (as the tests do)."""
    import re
    def arr(name, file):
        text = (ROOT / "app" / "data" / file).read_text(encoding="utf-8")
        return re.search(rf"var {name} = (\[.*\]);\s*$", text, re.S).group(1)
    return ("window.WORD_FOR_THE_DAY = " + arr("WORD_FOR_THE_DAY", "word-for-the-day.js")
            + "; window.JUST_FOR_TODAY = " + arr("JUST_FOR_TODAY", "just-for-today.js") + ";")


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    httpd = serve()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for scheme in ("light", "dark"):
                for name, vp in (("mobile", {"width": 390, "height": 844}), ("desktop", {"width": 1280, "height": 900})):
                    ctx = browser.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1)
                    page = ctx.new_page()
                    page.route("**/api/**", mock_api)
                    page.add_init_script(readings_script())
                    page.add_init_script("try { localStorage.setItem('hopewick.plusDeclined.v2', JSON.stringify('shot-user')); } catch (e) {}")
                    page.goto(f"{base}/", wait_until="networkidle")
                    page.screenshot(path=str(out / f"landing-{name}-{scheme}.png"))
                    page.goto(f"{base}/app/", wait_until="domcontentloaded")
                    page.wait_for_selector("#homeView:not([hidden]), #launchPrefs:not([hidden])", timeout=20000)
                    page.wait_for_timeout(1500)
                    for _ in range(8):
                        open_ids = page.evaluate("() => [...document.querySelectorAll('dialog')].filter(d => d.open).map(d => d.id)")
                        if "plusChoiceDlg" in open_ids:
                            page.click("#plusChoiceFree")
                        elif "disclaimerDlg" in open_ids:
                            page.click("#disclaimerDlg .btn-primary")
                        elif "onboardingDlg" in open_ids:
                            page.click("#onboardLaterBtn")
                        elif "pickerDlg" in open_ids:
                            if page.is_visible("#addPersonBtn"):
                                page.click("#addPersonBtn")
                            page.fill("#addPersonInput", "Sam")
                            page.press("#addPersonInput", "Enter")
                        elif page.is_visible("#launchPrefsContinue"):
                            page.click("#launchPrefsContinue")
                        elif page.locator("#homeView:not([hidden]) #dashGrid").count():
                            break
                        page.wait_for_timeout(400)
                    page.wait_for_selector("#homeView:not([hidden]) #dashGrid", timeout=10000)
                    page.evaluate("() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }")
                    page.wait_for_timeout(3600)  # let the welcome toasts fade
                    page.screenshot(path=str(out / f"dashboard-{name}-{scheme}.png"))
                    page.evaluate("() => { const v = document.getElementById('homeView'); v.scrollTop = v.scrollHeight * 0.45; }")
                    page.wait_for_timeout(150)
                    page.screenshot(path=str(out / f"dashboard-{name}-{scheme}-scrolled.png"))
                    page.evaluate("() => setAppTab('tools')")
                    page.wait_for_timeout(150)
                    page.screenshot(path=str(out / f"tools-{name}-{scheme}.png"))
                    ctx.close()
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/hopewick-screens"))
