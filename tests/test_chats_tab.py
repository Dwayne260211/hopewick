#!/usr/bin/env python3
"""Chats tab lists saved conversations, and leaving the tab does not delete the open one."""
from __future__ import annotations

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def test_chats_tab_and_tab_switch_keeps_conversation():
    from playwright.sync_api import sync_playwright

    text = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    assert 'id="appTabChats"' in text
    assert ">Chats<" in text
    tab = text.split("function setAppTab", 1)[1].split("function moodCardEl", 1)[0]
    assert "newConversation" not in tab

    httpd = _server()
    port = httpd.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.goto(f"{base}/app/", wait_until="domcontentloaded")
            page.evaluate(
                """() => {
                  localStorage.setItem('eden.onboarding.v1', JSON.stringify({seen:true}));
                  localStorage.setItem('eden.profiles.v1', JSON.stringify({
                    list: [{id:'sam1', name:'Sam', pin:null, created:1}],
                    lastId: 'sam1'
                  }));
                  localStorage.setItem('eden.p.sam1.settings', JSON.stringify({
                    settingsVersion: 2, mode: 'counsellor', disclaimerAck: true
                  }));
                  localStorage.setItem('eden.p.sam1.convos', JSON.stringify([{
                    id: 'c1',
                    title: 'Evening check-in',
                    created: 1700000000000,
                    updated: 1700000000000,
                    messages: [{role:'user', content:'hello from yesterday', ts:1700000000000}]
                  }]));
                  localStorage.setItem('eden.p.sam1.active', JSON.stringify('c1'));
                }"""
            )
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#pickerDlg[open] .profile-card")
            page.click("#pickerDlg .profile-card")
            page.wait_for_function("() => document.querySelector('#switchName').textContent === 'Sam'")
            page.wait_for_function("() => !document.getElementById('pickerDlg').open")

            def stored():
                return page.evaluate(
                    """() => ({
                      active: JSON.parse(localStorage.getItem('eden.p.sam1.active')),
                      convos: JSON.parse(localStorage.getItem('eden.p.sam1.convos')),
                      appTab
                    })"""
                )

            before = stored()
            assert before["active"] == "c1"
            assert before["convos"][0]["messages"][0]["content"] == "hello from yesterday"

            for tab_id in ("#appTabHome", "#appTabChats", "#appTabJournal", "#appTabDv", "#appTabChat"):
                page.click(tab_id)
                snap = stored()
                assert snap["active"] == "c1", tab_id
                assert len(snap["convos"]) == 1, tab_id
                assert snap["convos"][0]["id"] == "c1"

            page.click("#appTabChats")
            page.wait_for_selector("#chatsView:not([hidden])")
            assert page.locator("#appTabChats").get_attribute("aria-current") == "page"
            assert "Evening check-in" in page.inner_text("#chatsList")
            assert "hello from yesterday" in page.inner_text("#chatsList")
            page.click("#chatsList .open-chat")
            page.wait_for_function("() => appTab === 'chat'")
            assert "hello from yesterday" in page.inner_text("#messagesInner")
            assert page.locator("#appTabChat").get_attribute("aria-current") == "page"

            page.click("#appTabChats")
            page.click("#chatsNewBtn")
            page.wait_for_function("() => appTab === 'chat'")
            after = stored()
            assert any(c["id"] == "c1" and c["messages"][0]["content"] == "hello from yesterday" for c in after["convos"])
            assert not errors, errors
            browser.close()
    finally:
        httpd.shutdown()
