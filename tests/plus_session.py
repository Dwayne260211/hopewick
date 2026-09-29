"""Playwright helper: Plus and founder come from a mocked /api/auth/me, not billingState writes."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_FIXTURE = None


def plus_library_fixture():
    global _FIXTURE
    if _FIXTURE is None:
        edu = json.loads((ROOT / "server" / "library" / "education.json").read_text(encoding="utf-8"))
        deeper = json.loads((ROOT / "server" / "library" / "going-deeper.json").read_text(encoding="utf-8"))
        editors = json.loads((ROOT / "server" / "library" / "plus-editors.json").read_text(encoding="utf-8"))
        _FIXTURE = {"ok": True, "goingDeeper": deeper, "editors": editors, **edu}
    return _FIXTURE


_GRANT_JS = r"""
async (opts) => {
  const plus = !!opts.plus;
  const founder = !!opts.founder;
  const mePlus = plus || founder;
  const me = {
    signedIn: opts.signedIn !== false,
    plus: mePlus,
    founder: founder,
    complimentary: founder,
    email: opts.email || (founder ? 'founder@example.com' : 'member@example.com'),
    subscriptionStatus: mePlus ? (opts.status || 'active') : 'none',
    hasPassword: true,
    id: 'test-user',
  };
  const usage = opts.usage || (mePlus
    ? { used: 0, limit: null, remaining: null, plus: true, trialEligible: false, resetLabel: null, complimentary: founder }
    : { used: 0, limit: 5, remaining: 5, plus: false, trialEligible: true, resetLabel: 'midnight, Brisbane time', complimentary: false });
  const config = {
    checkoutReady: opts.checkout !== false,
    devMagic: false,
    hopeHosted: opts.hopeHosted !== false,
  };
  window.fetch = async (input) => {
    const url = String((input && input.url) || input || '');
    const respond = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    if (url.includes('/api/auth/me')) return respond(me);
    if (url.includes('/api/billing/config')) return respond(config);
    if (url.includes('/api/hope/usage')) return respond(window.__hopeUsageLive || usage);
    if (url.includes('/api/plus/library')) {
      if (!me.plus) return respond({ error: 'Hopewick Plus opens this library.', code: 'plus' }, 403);
      return respond(window.__plusLibraryFixture || { ok: true });
    }
    return respond({}, 404);
  };
  await refreshBilling();
}
"""


def grant_server_session(page, plus=True, founder=False, library="auto", **opts):
    """Replace fetch for account routes and refresh. A billingState write is not enough."""
    if library == "auto" and (plus or founder):
        page.evaluate("(pack) => { window.__plusLibraryFixture = pack; }", plus_library_fixture())
    elif library:
        page.evaluate("(pack) => { window.__plusLibraryFixture = pack; }", library)
    payload = {"plus": plus, "founder": founder}
    payload.update(opts)
    page.evaluate(_GRANT_JS, payload)
