"""Privacy, Your data and terms pages match what the code does after the database move."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = {name: (ROOT / name).read_text(encoding="utf-8") for name in ("privacy.html", "data.html", "terms.html")}


def test_contact_email_is_hello_everywhere():
    for name, text in PAGES.items():
        emails = set(re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text))
        assert emails == {"hello@hopewick.com.au"}, (name, emails)


def test_chats_are_listed_as_encrypted_at_rest():
    for name in ("privacy.html", "data.html"):
        text = PAGES[name]
        assert "aren't encrypted this way yet" not in text and "not encrypted this way yet" not in text
        assert "chats with Hope" in text and "encrypted the same way" in text


def test_pages_describe_storage_after_the_database_move():
    privacy, data = PAGES["privacy.html"], PAGES["data.html"]
    for text in (privacy, data):
        assert "After our database move" not in text and "<strong>Today:</strong>" not in text
        assert "Sydney, Australia" in text and "Singapore" in text
    assert "Render in Singapore:</strong> your account details" in privacy and "saved chats with Hope" in privacy
    assert "Singapore (Render):</strong> your account, payment status, your saved chats with Hope" in data


def test_google_play_is_future_only_and_stripe_is_current():
    for name, text in PAGES.items():
        assert "If you pay through Google Play" not in text
        assert "If you subscribed through Google Play" not in text
        assert "cancelled in Google Play" not in text
    assert "Payment is taken by card through Stripe" in PAGES["terms.html"]
    assert "Stripe handles it" in PAGES["privacy.html"]
