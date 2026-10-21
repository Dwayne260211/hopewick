/* Hopewick native helper (iPhone and Android apps only).
   Injected into the native bundle by native/scripts/build-www.mjs; the website never loads it.
   Everything here is a no-op unless window.Capacitor reports a native platform. */
(function () {
  'use strict';
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;

  var API_ORIGIN = 'https://hopewick.com.au';
  var TOKEN_KEY = 'hopewick.native.session';
  var OUTBOX_KEY = 'hopewick.native.journalOutbox';
  var PREFS_KEY = 'hopewick.native.prefs';
  var REMINDER_ID = 4201;
  var P = {};
  ['Preferences', 'LocalNotifications', 'Share', 'Haptics', 'App', 'AppLauncher', 'Network', 'BiometricAuthNative'].forEach(function (name) {
    try { P[name] = (Cap.Plugins && Cap.Plugins[name]) || (Cap.registerPlugin ? Cap.registerPlugin(name) : null); } catch (_) { P[name] = null; }
  });
  var platform = Cap.getPlatform ? Cap.getPlatform() : 'native';

  document.documentElement.classList.add('hw-native', 'hw-native-' + platform);

  /* ---------------- Session token (sent as Authorization: Bearer) ----------------
     The web app keeps its httpOnly cookie. The apps cannot rely on cookies from
     https://localhost / capacitor://localhost, so the server returns the same
     session token in the JSON body when X-Hopewick-Client: native is sent. */
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (_) {}
  var tokenReady = (P.Preferences ? P.Preferences.get({ key: TOKEN_KEY }).then(function (r) {
    if (r && r.value) token = r.value;
  }).catch(function () {}) : Promise.resolve());
  function setToken(t) {
    token = t || null;
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    // TODO(native): move to Keychain / Android Keystore (secure storage plugin) before wide release.
    if (P.Preferences) (t ? P.Preferences.set({ key: TOKEN_KEY, value: t }) : P.Preferences.remove({ key: TOKEN_KEY })).catch(function () {});
  }

  var nativeFetch = window.fetch.bind(window);
  function isApi(url) { return typeof url === 'string' && url.indexOf('/api/') === 0; }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isApi(url)) return nativeFetch(input, init);
    var opts = Object.assign({}, init || {});
    var headers = new Headers(opts.headers || (typeof input !== 'string' && input.headers) || {});
    headers.set('X-Hopewick-Client', 'native');
    opts.credentials = 'omit';
    opts.mode = 'cors';
    delete opts.keepalive;
    return tokenReady.then(function () {
      if (token) headers.set('Authorization', 'Bearer ' + token);
      opts.headers = headers;
      return nativeFetch(API_ORIGIN + url, opts);
    }).then(function (res) {
      if (/^\/api\/auth\/logout/.test(url)) setToken(null);
      else if (res.status === 401 && /^\/api\/auth\/me/.test(url)) setToken(null);
      if (/^\/api\/auth\//.test(url) && res.ok) {
        res.clone().json().then(function (data) {
          if (data && typeof data.sessionToken === 'string') setToken(data.sessionToken);
        }).catch(function () {});
      }
      return res;
    });
  };

  /* ---------------- Crisis numbers: always tap-to-call, never gated ---------------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href^="tel:"]');
    if (!a) return;
    ev.preventDefault();
    var href = a.getAttribute('href');
    if (P.AppLauncher) P.AppLauncher.openUrl({ url: href }).catch(function () { window.location.href = href; });
    else window.location.href = href;
  }, true);

  /* ---------------- Haptics ---------------- */
  function tap(style) {
    if (P.Haptics) P.Haptics.impact({ style: style || 'LIGHT' }).catch(function () {});
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('.btn-primary, .hw-btn--primary, [data-mood], .mood-btn');
    if (b) tap('LIGHT');
  }, true);

  /* ---------------- Preferences (reminder, app lock) ---------------- */
  function prefs() {
    try { return Object.assign({ reminderOn: false, reminderTime: '19:00', lockOn: false }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
    catch (_) { return { reminderOn: false, reminderTime: '19:00', lockOn: false }; }
  }
  function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (_) {} }

  /* Daily check-in reminder. Off by default; only scheduled after the person turns it on. */
  function scheduleReminder(p) {
    var LN = P.LocalNotifications;
    if (!LN) return Promise.resolve(false);
    return LN.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(function () {}).then(function () {
      if (!p.reminderOn) return false;
      var parts = String(p.reminderTime || '19:00').split(':');
      return LN.requestPermissions().then(function (perm) {
        if (!perm || perm.display !== 'granted') return false;
        return LN.schedule({ notifications: [{
          id: REMINDER_ID,
          title: 'Hopewick',
          body: 'A gentle nudge: how are you going today? A one-minute check-in is waiting.',
          schedule: { on: { hour: Number(parts[0]) || 19, minute: Number(parts[1]) || 0 }, allowWhileIdle: true },
          extra: { open: 'checkin' },
        }] }).then(function () { return true; });
      });
    }).catch(function () { return false; });
  }
  if (P.LocalNotifications) {
    P.LocalNotifications.addListener('localNotificationActionPerformed', function () {
      try { if (typeof window.setAppTab === 'function') window.setAppTab('checkin'); } catch (_) {}
    });
  }

  /* Optional Face ID / fingerprint lock. Crisis numbers stay reachable on the lock screen. */
  var locked = false;
  function lockScreen() {
    var el = document.getElementById('hwNativeLock');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'hwNativeLock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Hopewick is locked');
    el.innerHTML = '<div class="hwn-lock-card"><h2>Hopewick is locked</h2>' +
      '<p>Unlock with Face ID, fingerprint or your phone passcode.</p>' +
      '<button type="button" class="btn btn-primary" id="hwNativeUnlock">Unlock</button>' +
      '<p class="hwn-crisis">In immediate danger call <a href="tel:000">000</a>. Lifeline <a href="tel:131114">13 11 14</a>.</p></div>';
    document.body.appendChild(el);
    el.querySelector('#hwNativeUnlock').addEventListener('click', unlock);
    return el;
  }
  function unlock() {
    var B = P.BiometricAuthNative;
    if (!B) { hideLock(); return; }
    B.internalAuthenticate ? B.internalAuthenticate({ reason: 'Unlock Hopewick', cancelTitle: 'Cancel', allowDeviceCredential: true, iosFallbackTitle: 'Use passcode', androidTitle: 'Unlock Hopewick', androidConfirmationRequired: false })
      .then(hideLock).catch(function () {})
      : B.authenticate({ reason: 'Unlock Hopewick', allowDeviceCredential: true }).then(hideLock).catch(function () {});
  }
  function hideLock() { locked = false; var el = document.getElementById('hwNativeLock'); if (el) el.hidden = true; }
  function maybeLock() {
    if (!prefs().lockOn) return;
    locked = true;
    var el = lockScreen();
    el.hidden = false;
    unlock();
  }
  if (P.App) {
    P.App.addListener('appStateChange', function (s) {
      if (s && s.isActive) { maybeLock(); flushOutbox(); }
    });
  }

  /* ---------------- Offline-first journal ----------------
     If a save cannot reach the server, it goes to an outbox on the device and the
     entry shows straight away. The outbox is sent when the phone is back online
     or the app comes back to the front. */
  function outbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (_) { return []; } }
  function saveOutbox(list) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (_) {} }
  function currentProfileId() { try { return profile && profile.id; } catch (_) { return null; } }
  function isNetworkError(err) { return !navigator.onLine || (err && (err.name === 'TypeError' || /network|failed to fetch|load failed/i.test(err.message || ''))); }
  var flushing = false;
  function flushOutbox() {
    var H = window.HW3;
    if (flushing || !navigator.onLine || !H || !H.__nativeOriginalSave) return Promise.resolve();
    var pidNow = currentProfileId();
    var list = outbox();
    if (!list.length) return Promise.resolve();
    flushing = true;
    var keep = [];
    return list.reduce(function (chain, item) {
      return chain.then(function () {
        if (item.profileId !== pidNow) { keep.push(item); return; }
        var existing = item.serverId ? { id: item.serverId, server: true } : null;
        return H.__nativeOriginalSave(item.fields, existing).then(function (saved) {
          if (!saved) { keep.push(item); return; }
          try { journal = journal.filter(function (e) { return e.id !== item.tempId; }); } catch (_) {}
        }).catch(function () { keep.push(item); });
      });
    }, Promise.resolve()).then(function () {
      saveOutbox(keep);
      flushing = false;
      try { if (typeof window.renderJournalList === 'function') window.renderJournalList(); } catch (_) {}
    });
  }
  window.addEventListener('online', flushOutbox);

  function patchJournal() {
    var H = window.HW3;
    if (!H || !H.journalSave || H.__nativeOriginalSave) return;
    var original = H.journalSave;
    H.__nativeOriginalSave = original;
    H.journalSave = function (fields, existing) {
      return Promise.resolve().then(function () {
        if (!navigator.onLine) throw new TypeError('offline');
        return original(fields, existing);
      }).catch(function (err) {
        if (!isNetworkError(err) || !H.journalServerMode()) throw err;
        var now = Date.now();
        var tempId = (existing && existing.pendingSync && existing.id) || ('offline-' + now.toString(36) + Math.random().toString(36).slice(2, 8));
        var list = outbox().filter(function (i) { return i.tempId !== tempId; });
        list.push({ tempId: tempId, serverId: existing && existing.server ? existing.id : null, profileId: currentProfileId(), fields: fields, at: now });
        saveOutbox(list);
        var entry = Object.assign({}, existing || {}, fields, { id: existing && existing.server ? existing.id : tempId, created: (existing && existing.created) || now, updated: now, server: !!(existing && existing.server), pendingSync: true });
        try { journal = [entry].concat(journal.filter(function (e) { return e.id !== entry.id; })); } catch (_) {}
        return entry;
      });
    };
    /* Share sheet for journal export: the phone's own share options, nothing uploaded by Hopewick. */
    if (P.Share && H.journalExport) {
      H.journalExport = function (format) {
        var list = [];
        try { list = journal.slice(); } catch (_) {}
        list.sort(function (a, b) { return (b.entryDate || '').localeCompare(a.entryDate || '') || (b.created || 0) - (a.created || 0); });
        var text = format === 'json'
          ? JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Hopewick', entries: list }, null, 2)
          : '# Hopewick journal\n\n' + list.map(function (e) {
              return '## ' + (e.title || 'Untitled entry') + '\n\n_' + (e.entryDate || new Date(e.created || Date.now()).toISOString().slice(0, 10)) + '_\n\n' + (e.body || '') + (e.refined ? '\n\n**Deepened reflection:** ' + e.refined : '');
            }).join('\n\n---\n\n');
        return P.Share.share({ title: 'My Hopewick journal', text: text, dialogTitle: 'Share your journal' }).catch(function () {});
      };
    }
    flushOutbox();
  }

  /* ---------------- Sign-in stubs ----------------
     TODO(native-google): needs iOS + Android OAuth client IDs (Google Cloud console) and a native
       Google sign-in plugin. Send the ID token to POST /api/auth/google with the new client IDs
       added to the server's accepted audiences.
     TODO(native-apple): Sign in with Apple (App Store guideline 4.8). Needs the Apple Developer
       account, a Services ID / key, and a new POST /api/auth/apple endpoint. */
  window.HopewickNative = {
    platform: platform,
    signInWithGoogle: function () { return Promise.reject(new Error('Google sign-in is coming to the app soon. Use your email for now.')); },
    signInWithApple: function () { return Promise.reject(new Error('Sign in with Apple is coming soon. Use your email for now.')); },
    share: function (title, text) { return P.Share ? P.Share.share({ title: title, text: text }) : Promise.reject(new Error('Share is not available.')); },
    tap: tap,
    scheduleReminder: function () { return scheduleReminder(prefs()); },
    flushOutbox: flushOutbox,
    outboxSize: function () { return outbox().length; },
  };

  /* ---------------- Phone settings in the Settings dialog ---------------- */
  function addSettingsSection() {
    var dlg = document.getElementById('settingsDlg');
    if (!dlg || document.getElementById('hwNativeSettings')) return;
    var p = prefs();
    var sec = document.createElement('section');
    sec.id = 'hwNativeSettings';
    sec.className = 'hwn-settings';
    sec.innerHTML = '<h3>On this phone</h3>' +
      '<label class="hwn-row"><input type="checkbox" id="hwnReminderOn"> Daily check-in reminder</label>' +
      '<label class="hwn-row">Time <input type="time" id="hwnReminderTime"></label>' +
      '<label class="hwn-row"><input type="checkbox" id="hwnLockOn"> Lock Hopewick with Face ID, fingerprint or passcode</label>' +
      '<p class="hwn-note">Reminders stay on this phone. Crisis numbers are always available, even when the app is locked.</p>';
    var actions = dlg.querySelector('#settingsSave');
    var host = actions ? actions.parentNode : dlg;
    host.parentNode.insertBefore(sec, host);
    sec.querySelector('#hwnReminderOn').checked = !!p.reminderOn;
    sec.querySelector('#hwnReminderTime').value = p.reminderTime;
    sec.querySelector('#hwnLockOn').checked = !!p.lockOn;
    function apply() {
      var next = { reminderOn: sec.querySelector('#hwnReminderOn').checked, reminderTime: sec.querySelector('#hwnReminderTime').value || '19:00', lockOn: sec.querySelector('#hwnLockOn').checked };
      savePrefs(next);
      scheduleReminder(next).then(function (ok) {
        if (next.reminderOn && !ok) sec.querySelector('.hwn-note').textContent = 'Reminders need notification permission. You can turn it on in your phone settings.';
      });
    }
    sec.addEventListener('change', apply);
  }

  function addStyles() {
    var s = document.createElement('style');
    s.textContent = '#hwNativeLock{position:fixed;inset:0;z-index:99999;background:#10213F;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px}' +
      '#hwNativeLock[hidden]{display:none}#hwNativeLock .hwn-lock-card{max-width:22rem;text-align:center}#hwNativeLock a{color:#f3d48a;font-weight:700}' +
      '.hwn-settings{border-top:1px solid rgba(16,33,63,.15);margin-top:16px;padding-top:12px}.hwn-row{display:flex;gap:8px;align-items:center;margin:8px 0}.hwn-note{font-size:.9em;opacity:.8}';
    document.head.appendChild(s);
  }

  function boot() {
    addStyles();
    addSettingsSection();
    patchJournal();
    if (typeof window.loadGoogleIdentity === 'function') {
      window.loadGoogleIdentity = function () { return window.HopewickNative.signInWithGoogle(); };
    }
    maybeLock();
    scheduleReminder(prefs());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
