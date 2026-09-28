#!/usr/bin/env python3
"""Settings → Developer is invisible unless the signed-in account is the founder."""
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"


def test_developer_chrome_is_hidden_until_founder_account():
    app = APP.read_text(encoding="utf-8")
    store = (ROOT / "server" / "store.js").read_text(encoding="utf-8")

    assert "dwaynesimons1990@gmail.com" not in app
    assert "admin@bridge-bite-co.com" not in app

    side = re.search(
        r'<button[^>]*id="sideDeveloperBtn"[^>]*>.*?</button>',
        app,
        re.S,
    )
    tab = re.search(r'<button[^>]*id="tabDeveloper"[^>]*>Developer</button>', app)
    assert side and "hidden" in side.group(0)
    assert "Developer" in side.group(0)
    assert tab and "hidden" in tab.group(0)

    # API key, model endpoint, own provider, and invite redeem live in that panel.
    start = app.index('id="panelAdvanced"')
    end = app.index('<div class="dlg-foot">', start)
    body = app[start:end]
    assert 'id="setKey"' in body
    assert "disabled" in re.search(r'<input id="setKey"[^>]*>', body).group(0)
    assert 'id="ownKeyDetails"' in body
    assert re.search(r'<details[^>]*id="ownKeyDetails"[^>]*hidden', body)
    assert 'id="setBaseUrl"' in body
    assert 'id="setModel"' in body
    assert 'id="setUseOwnKey"' in body
    assert 'id="advInviteBtn"' in body
    assert "Enter invite code" in body
    assert "Add an API key" not in app
    assert "SHOW_INVITE_ENTRY && founderDeveloperOn" in app

    own = re.search(r"function usingOwnProvider\(\) \{.*?\n\}", app, re.S).group(0)
    assert "founderDeveloperVisible()" in own
    form = re.search(r"function readSettingsForm\(\) \{.*?\n\}", app, re.S).group(0)
    assert "if (founderDeveloperVisible())" in form
    assert "next.apiKey" in form
    chat = re.search(r"async function chatCompletion\(messages, opts = \{\}\) \{.*?\n\}", app, re.S).group(0)
    assert "founderDeveloperVisible()" in chat
    assert "own.hidden = !founderDeveloperOn" in app

    fn = re.search(r"function founderDeveloperVisible\(\) \{.*?\n\}", app, re.S).group(0)
    assert "billingState.signedIn" in fn
    assert "billingState.founder" in fn
    assert "profile" not in fn
    assert "userName" not in fn
    assert "setProfileName" not in fn

    assert "founder: isFounderPlusEmail(user.email)" in store or "const founder = isFounderPlusEmail(user.email)" in store
    assert "founder," in store

    # .btn { display: inline-flex } must not override the hidden Developer button.
    assert ".btn[hidden]" in app
    assert "display: none !important" in app

    # Crisis and domestic violence stay in the companion.
    assert 'id="helpBtn"' in app
    assert 'id="appTabDv"' in app
    assert 'id="sideDvBtn"' in app
    assert "1800 737 732" in app
    assert "1800RESPECT" in app

    # Companion and product names are present in the strings that used to render blank.
    assert "Chat with <span data-companion>Hope</span>" in app
    assert "shared with <span data-companion>Hope</span> in every chat" in app
    assert 'id="brandName" data-brand>Hopewick</div>' in app


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def _dismiss_disclaimer(page):
    if page.locator("#disclaimerDlg[open]").count():
        page.click("#discOkBtn")
        page.wait_for_function("() => document.getElementById('disclaimerDlg').open !== true")


def _open_settings(page):
    if page.locator("#settingsDlg[open]").count():
        page.click("#settingsCancel")
        page.wait_for_function("() => document.getElementById('settingsDlg').open !== true")
    if page.locator("#app.sidebar-open").count() == 0:
        page.click("#appTabMore")
        page.wait_for_selector("#app.sidebar-open")
    page.click('[data-open="settings"]')
    page.wait_for_selector("#settingsDlg[open]")


def _assert_no_api_key_add_ui(page):
    visible = page.locator("body").inner_text()
    assert "Add an API key" not in visible
    assert "Use my own API key" not in visible
    assert page.locator("#setKey").is_hidden()
    assert page.locator("#ownKeyDetails").is_hidden()
    assert page.locator("#tabDeveloper").is_hidden()
    assert page.locator("#sideDeveloperBtn").is_hidden()
    assert page.locator("#setKey").is_disabled()
    page.click("#tabMore")
    more = page.inner_text("#panelMore")
    assert "Use my own API key" not in more
    assert "Add an API key" not in more
    assert page.locator("#setKey").is_hidden()


def test_non_founder_cannot_add_an_api_key():
    """Phone width: signed-out, Free, and Plus never see a personal API-key form."""
    from playwright.sync_api import sync_playwright

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.wait_for_selector("#onboardingDlg[open]", timeout=15000)
            page.click("#onboardLaterBtn")
            page.wait_for_function("() => billingState.loaded")
            page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
            page.fill("#addPersonInput", "Sam")
            page.locator("#addPersonForm button[type=submit]").click()
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            _dismiss_disclaimer(page)

            _open_settings(page)
            _assert_no_api_key_add_ui(page)
            page.click("#settingsCancel")
            page.wait_for_function("() => document.getElementById('settingsDlg').open !== true")

            page.click("#appTabChat")
            page.wait_for_selector("#input", state="visible")
            page.fill("#input", "hello")
            page.click("#sendBtn")
            page.wait_for_selector("#needAiDlg[open]")
            need = page.inner_text("#needAiDlg")
            assert "Add an API key" not in need
            assert "Use my own API key" not in need
            assert "Sign in" in need
            assert page.locator("#needAiSignInBtn").is_visible()
            assert page.locator("#needAiAdvancedBtn").count() == 0
            assert page.locator("#keyBannerOwnKey").count() == 0
            page.click("#needAiCloseBtn")
            page.wait_for_function("() => document.getElementById('needAiDlg').open !== true")

            # A leftover browser key must not replace hosted Hope for Free or Plus.
            leftover = page.evaluate(
                """() => {
                  settings.apiKey = 'sk-existing';
                  settings.useOwnKey = true;
                  saveSettings();
                  function snap(plus) {
                    billingState.reachable = true;
                    billingState.signedIn = true;
                    billingState.plus = plus;
                    billingState.founder = false;
                    billingState.email = plus ? 'plus@example.com' : 'free@example.com';
                    syncDeveloperChrome();
                    const key = document.getElementById('setKey');
                    key.disabled = false;
                    key.value = 'sk-pasted-by-user';
                    const next = readSettingsForm();
                    return {
                      saved: next.apiKey,
                      own: usingOwnProvider(),
                      hosted: hostedChatAvailable(),
                      can: canCallModel(),
                      founder: founderDeveloperVisible(),
                    };
                  }
                  return { free: snap(false), plus: snap(true) };
                }"""
            )
            for who in ("free", "plus"):
                assert leftover[who]["saved"] == "sk-existing", who
                assert leftover[who]["own"] is False, who
                assert leftover[who]["hosted"] is True, who
                assert leftover[who]["can"] is True, who
                assert leftover[who]["founder"] is False, who

            _open_settings(page)
            _assert_no_api_key_add_ui(page)
            assert page.locator("#setKey").input_value() == ""

            page.evaluate(
                """() => {
                  billingState.founder = true;
                  billingState.email = 'founder@example.com';
                  syncDeveloperChrome();
                }"""
            )
            page.click("#tabDeveloper")
            page.wait_for_selector("#panelAdvanced:not([hidden])")
            page.click("#ownKeyDetails > summary")
            page.wait_for_selector("#setKey", state="visible")
            assert page.locator("#tabDeveloper").is_visible()
            assert "Use my own API key" in page.inner_text("#panelAdvanced")
            assert page.locator("#setKey").is_disabled() is False
            kept = page.evaluate(
                """() => {
                  document.getElementById('setKey').value = 'sk-founder';
                  document.getElementById('setUseOwnKey').checked = true;
                  const next = readSettingsForm();
                  settings.apiKey = next.apiKey;
                  settings.useOwnKey = next.useOwnKey;
                  return { apiKey: next.apiKey, own: usingOwnProvider() };
                }"""
            )
            assert kept["apiKey"] == "sk-founder"
            assert kept["own"] is True

            page.evaluate(
                """() => {
                  billingState.founder = false;
                  billingState.plus = true;
                  syncDeveloperChrome();
                }"""
            )
            assert page.locator("#tabDeveloper").is_hidden()
            assert page.locator("#setKey").is_hidden()
            assert page.locator("#ownKeyDetails").is_hidden()
            assert "Add an API key" not in page.locator("body").inner_text()
            assert "Use my own API key" not in page.locator("body").inner_text()
            browser.close()
    finally:
        httpd.shutdown()
