#!/usr/bin/env python3
"""Homepage founder section: story and credentials, near the top (after the hero), before pricing."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_founder_section_before_pricing():
    """Heading and credential lines sit right after the hero and before features and pricing (human-first home, b054ccf)."""
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    hero_at = page.index('class="hero"')
    features_at = page.index('id="features"')
    founder_at = page.index('id="founder"')
    plans_at = page.index('id="plans"')
    assert hero_at < founder_at < features_at < plans_at
    section = page.split('id="founder"', 1)[1].split("</section>", 1)[0]
    assert "Why I built Hopewick" in section
    # Short human-first version with a photo (b054ccf); the full story is on our-story.html.
    assert "Dwayne Stevens, founder" in section
    assert "Dual Diploma of Mental Health and Alcohol and Other Drugs" in section
    assert "I’m not a doctor, psychologist or registered counsellor." in section
    assert 'href="our-story.html"' in section
    assert "<img" in section.lower() and 'alt="' in section
