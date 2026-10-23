#!/usr/bin/env python3
"""Homepage founder section: story and credentials, near the top (after the hero), before pricing."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_founder_section_before_pricing():
    """Homepage redesign (2026-10): hero, how it helps, see it in action, founder (Why Hopewick exists), then pricing.
    The founder section keeps the photo, the credential line and a link to the full story on our-story.html."""
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    hero_at = page.index('class="hero"')
    helps_at = page.index('id="how-it-helps"')
    action_at = page.index('id="see-hopewick"')
    founder_at = page.index('id="founder"')
    plans_at = page.index('id="plans"')
    assert hero_at < helps_at < action_at < founder_at < plans_at
    section = page.split('id="founder"', 1)[1].split("</section>", 1)[0]
    assert "Built from lived experience. Created with purpose." in section
    assert "wife" in section and "partner" not in section.lower()
    # Short excerpt quoted from our-story.html, with the photo; the full story is on our-story.html.
    assert "Dwayne Stevens, founder" in section
    assert "Dual Diploma of Mental Health and AOD" in section
    assert "I’m not a doctor, psychologist or registered counsellor." in section
    assert 'href="our-story.html"' in section
    assert "<img" in section.lower() and 'alt="' in section
