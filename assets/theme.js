/* Hopewick theme switcher. Load in <head> (not deferred) so there is no flash.
   Saved choice: localStorage "hopewick.theme" = "light" | "dark" | "system" (default).
   Any element with [data-theme-toggle] becomes a light/dark toggle button. */
(function () {
  var KEY = 'hopewick.theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var COLORS = { light: '#0b1b37', dark: '#0a1426' };

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
  }
  function resolved(pref) {
    pref = pref || saved();
    if (pref === 'light' || pref === 'dark') return pref;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function paint(pref) {
    var t = resolved(pref);
    if ((pref || saved()) === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[t]);
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      var label = b.querySelector('[data-theme-label]');
      if (label) label.textContent = t === 'dark' ? 'Dark' : 'Light';
      b.setAttribute('title', t === 'dark' ? 'Dark mode is on. Switch to light mode.' : 'Light mode is on. Switch to dark mode.');
    }
    return t;
  }
  function set(pref) {
    try {
      if (pref === 'light' || pref === 'dark') localStorage.setItem(KEY, pref);
      else localStorage.removeItem(KEY);
    } catch (e) {}
    return paint(pref);
  }
  function toggle() { return set(resolved() === 'dark' ? 'light' : 'dark'); }

  paint();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (saved() === 'system') paint(); });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (b) { e.preventDefault(); toggle(); }
  });
  document.addEventListener('DOMContentLoaded', function () { paint(); });
  window.HopewickTheme = { KEY: KEY, saved: saved, resolved: resolved, set: set, toggle: toggle, paint: paint, colors: COLORS };
})();
