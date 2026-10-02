#!/usr/bin/env python3
"""My Account page: real sections, nav entry, and no extra bottom tab."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_my_account_page_and_nav():
    app = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    land = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "EDEN_BUILD = 'hopewick-v5.27'" in app
    assert 'content="hopewick-v5.27"' in land
    assert 'id="myAccountView"' in app
    assert ">My Account</h1>" in app
    assert 'id="myAccountBtn"' in app
    assert 'aria-label="My Account"' in app
    assert 'id="sideMyAccountBtn"' in app
    assert 'data-open="myaccount"' in app
    assert "Personal Details" in app
    assert "Password &amp; Security" in app
    assert "Subscription" in app
    assert "Payment Method" in app
    assert "Billing History" in app
    assert "Notifications" in app
    assert 'id="myAccountSignOut"' in app
    assert 'id="myAccountDelete"' in app
    assert 'id="deleteAccountDlg"' in app
    assert "Type DELETE to confirm" in app
    assert 'id="deleteAccountSubmit" disabled' in app
    assert "saved chats for this account on our server" in app
    assert "Saved chats for this account on the server are erased." in app
    assert "This browser may still keep a copy of those chats" in app
    assert "disk snapshot" in app
    assert "Stripe may keep invoices" in app
    assert "except where the Australian Consumer Law requires it" in app
    assert "targets, not a guarantee" in app
    assert "address on the Hopewick website" in app
    assert "Saved chats on the server are gone." in app
    assert "Chats in this browser stay until you clear them in Settings." not in app
    assert "Chats in this browser are still here" not in app
    assert "Chats, journal, and profiles in this browser are not deleted." not in app
    assert "Changing your sign-in email isn’t available." in app
    assert "Hopewick never sees or stores your full card number" in app
    assert "Coming soon. These switches don’t send anything yet" in app
    assert "/api/account/profile" in app
    assert "/api/account/cancel" in app
    assert "/api/account/delete" in app
    assert "/api/account/payment-method" in app
    assert "/api/account/invoices" in app
    assert "/api/account/setup-card" in app
    assert "function openMyAccount" in app
    assert "data-account-section=\"details\"" in app
    assert "data-account-section=\"password\"" in app
    assert "data-account-section=\"subscription\"" in app
    assert "data-account-section=\"payment\"" in app
    assert "data-account-section=\"billing\"" in app
    assert "data-account-section=\"notifications\"" in app
    # Bottom bar is Home, Chat, Chats, Domestic & family violence, Journal, More.
    # My Account stays out of that bar (header button and sidebar).
    nav = app.split('id="bottomNav"', 1)[1].split("</nav>", 1)[0]
    assert nav.count("bottom-nav-btn") == 6
    assert 'id="appTabChats"' in nav
    assert 'id="myAccountBtn"' not in nav
    assert 'data-tab="account"' not in nav
    # More still opens the sidebar, and that sidebar links to My Account.
    assert "else if (o === 'myaccount') openMyAccount();" in app
    server = (ROOT / "server" / "index.js").read_text(encoding="utf-8")
    account = server.split("async function handleAccountApi", 1)[1].split("function completionJson", 1)[0]
    assert "requireSession" in account
    assert "body.userId" not in account
    assert "body.email" not in account
    assert "confirm !== 'DELETE'" in account
    assert "cancel_at_period_end" in account
    assert "hasRawCardFields" in account
