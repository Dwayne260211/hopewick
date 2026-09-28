#!/usr/bin/env python3
"""Hopewick Plus pricing copy and account wiring stay visible and conservative."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_marketing_plans_copy():
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="plans"' in page
    assert "Hopewick Plus — AU$20/month" in page
    assert "AU$20" in page
    assert "Unlock the full Hopewick experience" in page
    assert "Essential support stays free" in page
    assert "Daily message limits" in page
    assert "5 messages/day" in page
    assert "No daily limit" in page
    assert "No daily message limit" in page
    assert "20 messages/day" not in page
    assert "200 messages/day" not in page
    assert "Cancel anytime. One subscription per person." in page
    assert "Organisation plans coming soon" in page
    assert "COMING SOON" in page
    assert "Organisations and clinics" in page
    assert "Today’s Readings" in page
    assert "resume builder" in page.lower()
    assert "3-day free trial" in page or "3 days free" in page
    assert "gut health and neuroplasticity" in page.lower()
    assert "Email me a sign-in link" in page
    assert "crisis" in page.lower()
    assert "Add Hopewick to your home screen as a web app today." in page
    assert "The Play Store app isn’t ready yet." in page
    assert "Try the free demo" not in page
    assert "Join waitlist" not in page
    assert "Phone app coming soon" not in page
    assert "app/?demo=1" not in page
    # Organisations inbox only, never as the founder address.
    assert "admin@bridge-bite-co.com" in page
    assert "dwaynesimons1990@gmail.com" not in page
    assert "Founded by" in page
    founder_bits = page.lower().split("founded by")
    for bit in founder_bits[1:]:
        assert "admin@bridge-bite-co.com" not in bit[:180]


def test_marketing_cbt_dbt_coming_soon():
    """Landing teaser only — name each approach once, and do not claim the tools exist yet."""
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="practices"' in page
    section = page.split('id="practices"', 1)[1].split("</section>", 1)[0]
    assert "Coming soon to the app" in section
    assert "COMING SOON" in section
    assert section.count("CBT (Cognitive Behavioural Therapy)") == 1
    assert section.count("DBT (Dialectical Behaviour Therapy)") == 1
    assert ">CBT</h3>" in section
    assert ">DBT</h3>" in section
    assert "self-help style tools" in section
    assert "counsellor" in section.lower()
    assert "still on the way" in section
    assert "Hopewick Plus" in section
    assert "AU$20" in section
    # The hero stays the recovery pitch; this teaser is its own section.
    hero = page.split('class="hero"', 1)[1].split("</section>", 1)[0]
    assert "Cognitive Behavioural Therapy" not in hero
    assert "Dialectical Behaviour Therapy" not in hero


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
    assert "Essential support stays free" in app
    assert "Daily message limits" in app
    assert "5 messages/day" in app
    assert "No daily limit" in app
    assert "No daily message limit" in app
    assert "20 messages/day" not in app
    assert "200 messages/day" not in app
    assert "Email me a sign-in link" in app
    assert "Hopewick Plus — 3 days free, then AU$20/month" in app
    assert "Plans & account" not in app
    assert "Plans &amp; account" not in app
    assert "Join waitlist" not in app
    assert "Phone app coming soon" not in app
    assert "Add Hopewick to your home screen as a web app today." in app
    assert "The Play Store app isn’t ready yet." in app
    assert "Older chats are part of Hopewick Plus" in app
    assert "Start 3-day free trial" in app
    assert "3 days free, then AU$20" in app
    assert "SMART goals are part of Hopewick Plus" in app
    assert 'id="journalGate"' in app
    assert 'id="resumeGate"' in app
    assert 'id="goalsGate"' in app
    assert "gut health and neuroplasticity" in app.lower()
    assert "Start talking to Hope" in app
    assert "What brings you here" in app
    assert "Keep your conversation history on this device" in app
    assert "Cloud sync is not enabled" in app
    assert "doesn’t hold a dashboard of what you told Hope" in app
    assert "Recovery myself" in app
    assert "Only when asked" in app
    enter = app.split("function enterProfile", 1)[1].split("function ", 1)[0]
    assert "showLaunchPrefs()" not in enter
    assert "dwaynesimons1990@gmail.com" not in app
    assert "admin@bridge-bite-co.com" not in app
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
    assert "FOUNDER_PLUS_EMAILS" in setup
    assert "FOUNDER_PLUS_EMAILS" in example
    assert "dwaynesimons1990@gmail.com" in setup
    # Home-screen web app is real. Service worker stays out until caching is designed.
    assert (ROOT / "app" / "manifest.webmanifest").exists()
    assert "TODO" in setup
    assert "service worker" in setup.lower()
    assert not (ROOT / "app" / "sw.js").exists()
