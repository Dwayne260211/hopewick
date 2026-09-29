"""Working a 12-step with Hope opens the chat, not the Home tab behind the dialog."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_work_step_switches_to_chat():
    text = (ROOT / "app/index.html").read_text(encoding="utf-8")
    start = text.index("function startStepChat")
    end = text.index("\nfunction ", start + 1)
    body = text[start:end]
    assert "setAppTab('chat')" in body
    assert "el.stepsDlg.close()" in body
