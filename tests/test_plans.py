#!/usr/bin/env python3
"""Hopewick Plus pricing copy and account wiring stay visible and conservative."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_marketing_plans_copy():
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="plans"' in page
    assert "Hopewick Plus" in page
    assert "AU$20" in page
    assert "COMING SOON" in page
    assert "Organisations and clinics" in page
    assert "Get help never asks you to pay" in page or "Get help never asks you to pay." in page
    assert "today’s Word for the day" in page or "today's Word for the day" in page
    assert "Sign in to subscribe" in page
    assert "app/?demo=1" in page
    assert "crisis" in page.lower()
    # Consumer checkout is not a hard wall in front of the demo.
    assert "Try the free demo" in page


def test_companion_gates_premium_not_crisis():
    app = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    assert 'id="accountDlg"' in app
    assert 'id="sideAccountBtn"' in app
    assert "function subscriptionPlus" in app
    assert "function conversationLocked" in app
    assert "function openAccountDlg" in app
    assert "/api/billing/checkout" in app
    assert "/api/billing/portal" in app
    assert "/api/auth/magic-link" in app
    assert "AU$20" in app
    assert "Get help stays free" in app
    assert "Older chats are part of Hopewick Plus" in app
    # Crisis card and Get help remain in the companion.
    assert 'id="helpBtn"' in app
    assert "crisis-card" in app
    assert "1800 737 732" in app
    # Today card is still the free daily reading, not removed.
    assert "Word for the day" in app
    assert "Just for today" in app
    assert "function todayReflection" in app


def test_setup_documents_stripe_env():
    setup = (ROOT / "SETUP.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    for name in (
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_PRICE_ID",
        "STRIPE_WEBHOOK_SECRET",
    ):
        assert name in setup
        assert name in example
    assert "AU$20" in setup
    assert "magic" in setup.lower()
    assert "webhook" in setup.lower()
    assert "SETUP.md" in readme
    assert "sk_test_replace_me" in example
    assert "sk_live_" not in example
    # PWA left as a TODO, not a half-built service worker.
    assert "TODO" in setup
    assert "service worker" in setup.lower()
    assert not (ROOT / "app" / "sw.js").exists()
