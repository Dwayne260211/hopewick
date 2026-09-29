#!/usr/bin/env python3
"""Homepage founder section: story and credentials, before pricing."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_founder_section_before_pricing():
    """Heading and credential lines sit after features and before pricing."""
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    features_at = page.index('id="features"')
    founder_at = page.index('id="founder"')
    plans_at = page.index('id="plans"')
    assert features_at < founder_at < plans_at
    section = page.split('id="founder"', 1)[1].split("</section>", 1)[0]
    assert "Why I built Hopewick" in section
    assert "Dwayne Stevens" in section
    assert "Founder, Hopewick" in section
    assert "Dual Diploma in Mental Health &amp; Alcohol and Other Drugs" in section
    assert "Lived experience of addiction, recovery, incarceration and the out-of-home care system" in section
    assert "Faith became central to that change, and it eventually led me into studying mental health and alcohol and other drugs because I wanted to use what I had lived through to help other people." in section
    assert "<img" not in section.lower()
