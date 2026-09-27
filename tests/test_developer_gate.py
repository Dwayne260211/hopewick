#!/usr/bin/env python3
"""Settings → Developer is invisible unless the signed-in account is the founder."""
import re
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
    assert 'id="setBaseUrl"' in body
    assert 'id="setModel"' in body
    assert 'id="setUseOwnKey"' in body
    assert 'id="advInviteBtn"' in body
    assert "Enter invite code" in body
    assert "SHOW_INVITE_ENTRY && founderDeveloperOn" in app

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
