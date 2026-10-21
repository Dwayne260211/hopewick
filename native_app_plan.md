# Hopewick native apps: plan (iPhone + Android, web stays)

Written 22 Oct 2026. Planning only. Nothing in the repo has changed.

## What's there now
- `/app/` is one large static `app/index.html` plus `hw-*.js/css`. There is no build step and no CDNs. It has `app/manifest.webmanifest` but **no service worker**.
- Auth is **not Supabase**. Hopewick's own Node server (`server/index.js`, on Render behind Cloudflare at hopewick.com.au) handles email/password, magic links (via Resend) and Google (Google Identity Services button → `POST /api/auth/google`). The session is an httpOnly `hopewick_session` cookie (SameSite=Lax, 30 days).
- Payments: Stripe on the web. Inside the Android TWA, Google Play Billing runs through the Digital Goods API (`PLAY_PACKAGE = com.bridgebite.hopewick`). `/.well-known/assetlinks.json` lists two SHA-256 fingerprints, most likely the upload key and the Play app-signing key. The TWA wrapper project itself (Bubblewrap/PWABuilder) is **not in this repo**.

## Recommendation
Use **Capacitor**, wrapping the same `/app/` code. Web, iOS and Android share one codebase, and the website stays exactly as it is. A plain web wrapper risks rejection under Apple guideline 4.2, so the app needs real native features. Add these through Capacitor plugins, only when running natively (`Capacitor.isNativePlatform()`):
- **Local reminder notifications** (journal and check-in times). This works offline and needs no server.
- **Push** through FCM/APNs, for example "your weekly reflection". This needs a small `/api/push/register` endpoint and token storage.
- **Offline journal**: save on the device first (Preferences/SQLite), then sync. Bundle the app files inside the app instead of loading the live URL.
- **Share sheet** for exporting a journal entry or the resume PDF. **Haptics** on check-ins. **Biometric lock** (Face ID or fingerprint) for privacy.

## Repo changes
- Add `capacitor.config.ts`, `ios/` and `android/` (appId `com.bridgebite.hopewick`) and a tiny copy step that builds `www/` from `app/`.
- API calls go to `https://hopewick.com.au` (this needs CORS for the app's own address, `capacitor://localhost`). Cookies are unreliable in iOS WebViews, so add a **bearer-token session** for native: `/api/auth/*` returns a token, which the app keeps in Keychain/Keystore. The web keeps its cookie.
- **Google sign-in:** the web GSI button won't work inside the app. Use a native Google sign-in plugin (`@capgo/capacitor-social-login` or similar) with iOS and Android OAuth client IDs. The server verifies the ID token as it does now, but must also accept the new client IDs as valid "audience". **Apple guideline 4.8:** because Google sign-in is offered, the iOS app must also offer **Sign in with Apple** (or another equally private option). Add `POST /api/auth/apple`.
- **Payments:** the Digital Goods API only exists in TWAs. Replace it with a native in-app purchase plugin (RevenueCat, or `cordova-plugin-purchase`) for Play Billing **and** Apple in-app purchase. On iOS, Plus has to be sold through Apple IAP; Stripe sign-up links aren't allowed there. The server needs to check Apple/Google receipts.
- Magic links: add Universal Links (an `apple-app-site-association` file) and Android App Links, so a link opens the app.

## Android: replace the TWA, same package
Yes. Publish the Capacitor build as an **update** to `com.bridgebite.hopewick`, with a higher versionCode. Play App Signing keeps the app-signing key, so the only thing that matters is signing with the **same upload key** the TWA used. Find that keystore (Bubblewrap/PWABuilder output) before anything else. If it's lost, ask for an upload-key reset in Play Console (takes a few days). Users keep the app and their Play subscriptions carry over, as long as the product IDs stay the same.

## iOS without a Mac
**Codemagic** (free tier ~500 macOS minutes a month) or **GitHub Actions macOS runners**. Both build and sign using an App Store Connect API key, then upload to TestFlight automatically. Testing on a real iPhone happens through TestFlight. You'll need App Store screenshots (from a simulator in CI or a real phone).

## Apple Developer Program
- **Price:** **A$144.99/year** (from the Australian App Store listing of Apple's Developer app; officially US$99 charged in local currency). It auto-renews.
- **Enrol as an organisation:** BRIDGE&BITE.CO PTY LTD, D-U-N-S **775150680**.
- **Requirements:**
  - Dwayne's Apple Account with 2FA turned on.
  - The legal name must exactly match the D-U-N-S record.
  - A website on the company's domain.
  - A work email on that domain (e.g. `@hopewick.com.au`, not Gmail).
  - Authority to sign for the company.
- Apple phones to verify, then charges after approval. Allow 1–2 weeks. Check the D-U-N-S details on Apple's lookup tool first.

## App Store review risks (health/wellbeing)
- **4.2 minimum functionality:** the native features above deal with this.
- **1.4.1 / medical claims:** keep the wording "peer support, not treatment". Crisis numbers must be visible and must work as tap-to-call.
- **AI chat (Hope):** explain the safety measures and the 18+ setting in the review notes, and fill in the age-rating questionnaire honestly.
- **5.1.1:** in-app account deletion (it already exists; make sure it's easy to find), a privacy policy URL, and accurate "nutrition labels". Health data must not go to advertising.
- **3.1.1:** Plus must use Apple IAP on iOS (the 15% small-business rate applies).
- **4.8:** Sign in with Apple.
- **Review account:** give Apple a working demo login.

## Steps (★ = needs Dwayne)
1. ★ Find the TWA upload keystore and password. Confirm in Play Console which key fingerprints are in use.
2. ★ Enrol in the Apple Developer Program as an organisation (D-U-N-S, phone verification, pay A$144.99).
3. Add Capacitor, the native token session, CORS and the plugins. The web build stays unchanged.
4. ★ Create the Google OAuth iOS/Android client IDs in Google Cloud. Create the Sign in with Apple key and App Store Connect API key in the Apple portal.
5. Native in-app purchases: the RevenueCat (or plugin) setup, receipt checks on the server, and a matching App Store subscription (AU$20/month, 7-day trial).
6. ★ Set up the Codemagic or GitHub Actions secrets (keystore, Apple key). Run CI builds.
7. Push notifications: FCM project ★, APNs key ★, server endpoint.
8. Internal testing: a Play internal track and TestFlight. ★ Dwayne tests on his phones.
9. ★ App Store listing: screenshots, privacy labels, age rating, review notes with a demo account, and agreeing to the Paid Apps agreement plus bank/tax details.
10. Release the Android update over the TWA, then submit to iOS review. Expect 1–2 rounds of feedback.

Rough effort: 3–5 weeks of build work, plus Apple's enrolment and review time.

---

## Phase 1 status (branch `native-app`, 22 Oct 2026)
Done on the branch. It is not merged, not deployed and not uploaded anywhere.
- `native/`: Capacitor 8.5 project (appId `com.bridgebite.hopewick`) with `android/` and an `ios/` scaffold. `npm run build:web` copies the site into `native/www` and adds `capacitor.js` and `hw-native.js` **to that copy only**. The website's `/app/` is unchanged.
- `native/src/hw-native.js` does nothing on the web. In the app it handles:
  - API calls to `https://hopewick.com.au` with a bearer token.
  - Tap-to-call for every `tel:` link. 000 and Lifeline also appear on the lock screen and are never paywalled.
  - Haptics.
  - A daily check-in reminder (off by default, the person picks the time). It lives in Settings under "On this phone".
  - An optional Face ID / fingerprint / passcode lock.
  - An offline journal outbox that syncs when the phone is back online or the app reopens.
  - Journal export through the phone's share sheet.
- Server: `X-Hopewick-Client: native` returns `sessionToken` in the JSON reply when a session starts. `Authorization: Bearer` is accepted anywhere the cookie is. CORS is allowed only for `https://localhost` and `capacitor://localhost`, with no credentials. Web cookie login is unchanged.
- Android: versionCode 6 / 2.0.0, signed with the existing upload key (SHA-256 5F:FD:…:2E). The signing details live in `native/android/keystore.properties`, which is gitignored.
- `.github/workflows/ios-build.yml`: manual only. It does nothing until the repo variable `IOS_BUILD_ENABLED=true` and the Apple secrets exist.

### Stubbed / later
- **Native Google sign-in:** needs iOS and Android OAuth client IDs, then the server must accept those audiences in `/api/auth/google`.
- **Sign in with Apple:** needs a new `/api/auth/apple`. Until then the app offers email/password only, and Google shows "coming soon".
- **Magic links in the app:** the email link opens the browser. Needs Universal Links / App Links.
- **Token storage:** the token sits in Preferences. Move it to Keychain/Keystore before wide release.
- **Push (FCM/APNs):** not started.
- **Sessions:** one session per account still applies, so signing in on the phone signs the web out.
- **Payments (unchanged in phase 1):**
  - The TWA's Digital Goods API Play Billing does **not** exist inside Capacitor. The app shows the web Plus screen.
  - Before releasing the Capacitor build to Play, add a native billing plugin (RevenueCat or `cordova-plugin-purchase`). Use the same product `hopewick_plus_monthly` and verify through the existing `/api/billing/play/verify`.
  - For iOS: an App Store subscription (AU$20/month, 7-day trial), Apple receipt checks on the server, and Stripe hidden on iOS.
- **minSdk:** 24 (Android 7). Check in Play Console whether anyone on Android 5–6 has the TWA installed.
