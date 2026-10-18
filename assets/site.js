'use strict';
(function mobileNav() {
  var header = document.querySelector('.hw-header');
  var btn = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (!header || !btn || !links) return;
  var label = btn.querySelector('.hw-menu-label');
  function setOpen(open, focusBack) {
    header.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (label) label.textContent = open ? 'Close' : 'Menu';
    if (open) { var first = links.querySelector('a'); if (first) first.focus(); }
    else if (focusBack) btn.focus();
  }
  btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') setOpen(false, true);
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 1000) setOpen(false); });
})();
