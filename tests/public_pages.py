"""Public marketing copy after the 2026-10 homepage redesign.

The homepage (index.html) was cut to six short sections. Detailed copy that used to sit on it
moved, unchanged, to how-it-works.html (features, privacy, safety, faith, services) and
pricing.html (full Free vs Plus comparison, trial terms, FAQ). Tests that check that marketing
copy read all three pages together, so the requirement still holds wherever the copy now lives.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = ("index.html", "how-it-works.html", "pricing.html")


def public_copy() -> str:
    return "\n".join((ROOT / name).read_text(encoding="utf-8") for name in PUBLIC_PAGES)
