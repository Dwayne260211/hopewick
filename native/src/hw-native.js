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
  ['SecureStoragePlugin', 'HopewickBilling', 'Preferences', 'LocalNotifications', 'Share', 'Haptics', 'App', 'AppLauncher', 'Network', 'BiometricAuthNative'].forEach(function (name) {
    try { P[name] = (Cap.Plugins && Cap.Plugins[name]) || (Cap.registerPlugin ? Cap.registerPlugin(name) : null); } catch (_) { P[name] = null; }
  });
  var platform = Cap.getPlatform ? Cap.getPlatform() : 'native';

  document.documentElement.classList.add('hw-native', 'hw-native-' + platform);

  /* ---------------- Session token (sent as Authorization: Bearer) ----------------
     The web app keeps its httpOnly cookie. The apps cannot rely on cookies from
     https://localhost / capacitor://localhost, so the server returns the same
     session token in the JSON body when X-Hopewick-Client: native is sent. */
  /* Stored in the iOS Keychain / Android Keystore-backed storage (SecureStoragePlugin).
     Phase 1 kept it in localStorage + Preferences; that copy is moved across once and deleted. */
  var token = null;
  var SS = P.SecureStoragePlugin;
  function clearLegacy() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    if (P.Preferences) P.Preferences.remove({ key: TOKEN_KEY }).catch(function () {});
  }
  function legacyToken() {
    var t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (_) {}
    if (t || !P.Preferences) return Promise.resolve(t);
    return P.Preferences.get({ key: TOKEN_KEY }).then(function (r) { return (r && r.value) || null; }).catch(function () { return null; });
  }
  var tokenReady = (SS
    ? SS.get({ key: TOKEN_KEY }).then(function (r) { return (r && r.value) || null; }).catch(function () { return null; })
    : Promise.resolve(null)
  ).then(function (secure) {
    if (secure) { token = secure; clearLegacy(); return; }
    return legacyToken().then(function (old) {
      if (!old) return;
      token = old;
      if (SS) return SS.set({ key: TOKEN_KEY, value: old }).then(clearLegacy).catch(function () {});
    });
  });
  function setToken(t) {
    token = t || null;
    clearLegacy();
    if (!SS) return; // no secure store: keep the token in memory only for this launch
    (t ? SS.set({ key: TOKEN_KEY, value: t }) : SS.remove({ key: TOKEN_KEY })).catch(function () {});
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

  /* ---------------- Google Play Billing (Android app) ----------------
     The web app's existing TWA code talks to the Digital Goods API and PaymentRequest.
     Here both are backed by the native HopewickBilling plugin, so the same subscribe,
     restore and "Manage in Google Play" code runs unchanged and the purchase token still
     goes to /api/billing/play/verify. Stripe stays hidden in the app as in the TWA. */
  var PLAY_METHOD = 'https://play.google.com/billing';
  var B = P.HopewickBilling;
  if (platform === 'android' && B) {
    var playService = {
      listPurchases: function () {
        return B.listPurchases().then(function (r) { return (r && r.purchases) || []; });
      },
      getDetails: function () { return Promise.resolve([]); },
    };
    window.getDigitalGoodsService = function (method) {
      if (method !== PLAY_METHOD) return Promise.reject(new Error('Unsupported payment method.'));
      return Promise.resolve(playService);
    };
    var OrigPR = window.PaymentRequest;
    var PlayPaymentRequest = function (methods, details, options) {
      var m = (methods || []).filter(function (x) { return x && x.supportedMethods === PLAY_METHOD; })[0];
      if (!m) {
        if (typeof OrigPR !== 'function') throw new TypeError('PaymentRequest is not available.');
        return new OrigPR(methods, details, options);
      }
      var sku = m.data && m.data.sku;
      return {
        show: function () {
          return B.purchase({ productId: sku }).catch(function (err) {
            var code = err && err.code;
            if (code === 'USER_CANCELED') { var e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
            if (code === 'ITEM_ALREADY_OWNED') {
              // Already subscribed on this Google account: hand back that purchase so it is restored.
              return playService.listPurchases().then(function (list) {
                var mine = list.filter(function (p) { return p.itemId === sku; })[0];
                if (!mine) throw err;
                return mine;
              });
            }
            throw err;
          }).then(function (p) {
            tap('MEDIUM');
            return { details: { purchaseToken: p.purchaseToken }, complete: function () { return Promise.resolve(); } };
          });
        },
        abort: function () { return Promise.resolve(); },
        canMakePayment: function () { return Promise.resolve(true); },
      };
    };
    window.PaymentRequest = PlayPaymentRequest;
  }

  /* ---------------- iPhone: App Store subscription (not active) ----------------
     App Store rule 3.1.1: Plus cannot be sold with Stripe inside the iPhone app.
     Until StoreKit is switched on, the iPhone app hides web checkout; Plus bought
     elsewhere still works after sign-in. Crisis help and free features are unaffected.
     TODO(ios-storekit): once Apple approves the account,
       1. create the auto-renewing subscription in App Store Connect (AU$20/month, 7-day trial,
          product id to be decided, e.g. hopewick_plus_monthly) and the Paid Apps agreement;
       2. add a StoreKit 2 plugin (native/ios) exposing purchase/listPurchases like HopewickBilling;
       3. add POST /api/billing/apple/verify on the server (App Store Server API);
       4. set IOS_STOREKIT_ENABLED = true and wire it the same way as the Play polyfill above. */
  var IOS_STOREKIT_ENABLED = false;
  var iosStoreKit = { enabled: IOS_STOREKIT_ENABLED, productId: null /* TODO(ios-storekit) */ };

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
    iosStoreKit: iosStoreKit,
    playBilling: !!(platform === 'android' && B),
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
      '.hw-native-ios [data-web-billing]{display:none!important}' +
      '.hwn-settings{border-top:1px solid rgba(16,33,63,.15);margin-top:16px;padding-top:12px}.hwn-row{display:flex;gap:8px;align-items:center;margin:8px 0}.hwn-note{font-size:.9em;opacity:.8}';
    document.head.appendChild(s);
  }

  function boot() {
    addStyles();
    addSettingsSection();
    patchJournal();
    if (platform === 'ios' && !IOS_STOREKIT_ENABLED && typeof window.startCheckout === 'function') {
      var origCheckout = window.startCheckout;
      window.startCheckout = function () {
        var signedIn = false;
        try { signedIn = typeof window.realSession === 'function' && window.realSession(); } catch (_) {}
        if (!signedIn) return origCheckout.apply(this, arguments); // shows the sign-in step as usual
        try { window.toast('Hopewick Plus in the iPhone app is coming soon. If you already have Plus, it works here once you sign in.', false, 6000); } catch (_) {}
        return Promise.resolve();
      };
    }
    if (typeof window.loadGoogleIdentity === 'function') {
      window.loadGoogleIdentity = function () { return window.HopewickNative.signInWithGoogle(); };
    }
    maybeLock();
    scheduleReminder(prefs());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
