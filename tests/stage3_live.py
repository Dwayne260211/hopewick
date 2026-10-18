# -*- coding: utf-8 -*-
"""Helpers for Stage 3 browser tests against a real local Hopewick server.

The server is tests/stage3_server.mjs: a temp data dir, developer magic links,
no DATABASE_URL (the per-user JSON store), no OpenAI/Stripe/Resend keys.
"""
from __future__ import annotations

import os
import subprocess
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUS_EMAIL = "plus-tester@example.test"


@contextmanager
def live_server(extra_env=None):
    env = dict(os.environ)
    env.pop("DATABASE_URL", None)
    env.update(extra_env or {})
    proc = subprocess.Popen(["node", str(ROOT / "tests" / "stage3_server.mjs")], cwd=str(ROOT), env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        line = ""
        for _ in range(50):
            line = proc.stdout.readline()
            if line.startswith("READY"):
                break
        if not line.startswith("READY"):
            raise RuntimeError("stage3 server did not start: " + line)
        _, port, data_dir = line.split()
        yield f"http://127.0.0.1:{port}", Path(data_dir)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def sign_in(page, base, email=PLUS_EMAIL, name="Sam", seed=None):
    """Sign in with a dev magic link and create a first profile. seed(page) can fill localStorage first."""
    r = page.context.request.post(f"{base}/api/auth/magic-link", data={"email": email}, headers={"Origin": base})
    assert r.status == 200, r.text()
    link = r.json()["devLink"]
    if seed:
        page.goto(f"{base}/app/", wait_until="domcontentloaded")
        seed(page)
    page.goto(link, wait_until="domcontentloaded")
    if not seed:
        page.wait_for_selector("#onboardingDlg[open]", timeout=20000)
        page.wait_for_timeout(400)
        # A free account is offered the trial first; "not now" is the honest default here.
        page.evaluate("() => { const d = document.getElementById('plusChoiceDlg'); if (d && d.open) d.close(); }")
        page.click("#onboardLaterBtn")
        page.wait_for_selector("#pickerDlg[open] #addPersonForm:not([hidden])")
        page.fill("#addPersonInput", name)
        page.locator("#addPersonForm button[type=submit]").click()
    page.wait_for_function("() => typeof profile !== 'undefined' && !!profile", timeout=20000)
    if page.locator("#launchPrefs:not([hidden])").count():
        page.click("#launchPrefsContinue")
    page.evaluate("() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())")
    page.wait_for_function("() => window.HW3 && HW3.state.loaded", timeout=20000)


def go(page, tab):
    page.evaluate("(t) => setAppTab(t)", tab)
    page.wait_for_selector(f"#hw3Inner[data-tab='{tab}']" if tab in ("checkin", "coping", "mygoals", "nextstep", "compare", "safety", "recovery", "modules", "preferences") else "body")
