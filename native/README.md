# Hopewick native apps (Capacitor)

Same `/app/` web code, wrapped for Android and iPhone. The website is not affected.

    export PATH=/path/to/node22/bin:$PATH        # Capacitor CLI 8 needs Node 22+
    export JAVA_HOME=/path/to/jdk21 ANDROID_HOME=/path/to/android-sdk
    npm ci
    npm run sync                                  # builds www/ from the site and syncs android + ios
    cd android && ./gradlew assembleDebug         # debug APK
    cd android && ./gradlew bundleRelease         # signed AAB (needs android/keystore.properties)

`android/keystore.properties` (never committed): storeFile, storePassword, keyAlias, keyPassword.
Or set HOPEWICK_KEYSTORE, HOPEWICK_KEYSTORE_PASSWORD, HOPEWICK_KEY_ALIAS, HOPEWICK_KEY_PASSWORD.
Always raise `versionCode` in `android/app/build.gradle` above the one in Play.

iOS builds run in GitHub Actions (`.github/workflows/ios-build.yml`, manual). See ../native_app_plan.md.
