#!/usr/bin/env python3
"""Sign-in screen: email and password, lasting session copy, magic link still offered."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_sign_in_screen_and_build():
    app = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    land = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in app
    assert 'content="hopewick-v5.27"' in land
    assert "accountSignInForm" in app
    assert 'id="accountPassword"' in app
    assert 'id="accountSignInBtn"' in app
    assert ">Sign in</button>" in app
    assert "Email me a sign-in link" in app
    assert "Forgot password?" in app
    assert "Create a password" in app
    sign_in = app.split("form.id = 'accountSignInForm'", 1)[1].split("async function onPasswordSignIn", 1)[0]
    assert "createToggle.id = 'accountCreateToggle'" in sign_in
    assert "createToggle.type = 'button'" in sign_in
    assert "aria-expanded" in sign_in
    assert "aria-controls" in sign_in
    assert "accountCreatePanel" in sign_in
    assert "<summary>Create a password</summary>" not in sign_in
    assert "setCreatePasswordOpen" in app
    assert "/api/auth/login" in app
    assert "/api/auth/password" in app
    assert "/api/auth/logout" in app
    assert "/api/auth/magic-link" in app
    assert "You stay signed in on this device until you sign out." in app
    assert "Email me a sign-in link" in land
    assert "stay signed in on this browser until you sign out" in land
    assert "Sign in with Google" in app
    assert "Google sign-in isn’t set up on this server yet." in app
    assert "/api/auth/google" in app
    assert "appleid.apple.com" not in app
    assert "Sign in with Apple" not in app
    assert "apps.googleusercontent.com" not in app
    assert "accounts.google.com/gsi/client" in app
    assert "google.accounts.id.renderButton" in app
    assert "mountGoogleSignInControl" in app
    assert "Choose your Google account below" in app
    assert "Check that this site is allowed for the Google client" not in app
