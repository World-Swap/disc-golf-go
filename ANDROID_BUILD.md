# Disc Golf Go — Android Build Guide

## How it works

Capacitor wraps the live website (`https://discgolfgo.app`) in a native Android WebView. There's no static export — the app always loads from the server so features stay in sync automatically.

**App ID:** `the.discgolfgo.app`
**App Name:** Disc Golf Go
**GPS:** Native Android location (works via `navigator.geolocation` in the WebView)

---

## Option A: GitHub Actions (Recommended — no local setup needed)

The workflow at `.github/workflows/build-android.yml` handles everything.

### 1. First time: Initialize the Android project

After cloning and installing dependencies, CI runs `npx cap add android` automatically if the `android/` directory doesn't exist.

You can also trigger this manually:
```bash
npm install
npx cap add android
```

### 2. Build a debug AAB (for testing)

Go to **GitHub → Actions → Build Android AAB → Run workflow**.

The debug AAB will appear as a build artifact. Download it and install via `adb install` or upload to Play Console internal testing.

### 3. Build a SIGNED release AAB (for Play Store)

You need a keystore first. Generate one:

```bash
keytool -genkey -v \
  -keystore disc-golf-go.jks \
  -alias discgolfgo \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Then add these to **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i disc-golf-go.jks` |
| `ANDROID_KEY_ALIAS` | `discgolfgo` |
| `ANDROID_KEY_PASSWORD` | your key password |
| `ANDROID_STORE_PASSWORD` | your store password |

**Store the keystore file somewhere safe** — if you lose it, you can never update the app on Play Store.

Trigger the workflow with **sign_release = true** — the signed `.aab` will appear as an artifact.

---

## Option B: Build locally (requires Android Studio)

### Release build workflow (Play Store uploads)

Every release AAB needs a unique, incrementing `versionCode`. Run the bump script before each build:

```bash
# 1. Install dependencies (first time)
npm install

# 2. Add Android platform and sync web assets
npx cap add android   # first time only
npx cap sync android

# 3. Bump versionCode + build (one command)
npm run android:release
# → increments versionCode in android-version.json
# → patches android/app/build.gradle
# → runs ./gradlew clean bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab

# 4. Sign with jarsigner, then upload to Play Console

# 5. After successful upload — commit the version bump
git add android-version.json && git commit -m "chore: bump Android versionCode to XX"
```

**versionCode is tracked in `android-version.json` at the repo root.** This file persists the counter across `cap sync` runs (which regenerate `build.gradle`). Never edit it manually — the script owns it.

### Debug build

```bash
npm install
npx cap sync android
cd android && ./gradlew bundleDebug
# Output: android/app/build/outputs/bundle/debug/app-debug.aab
```

To open in Android Studio for device testing:
```bash
npx cap open android
```

---

## GPS / Geolocation

The app uses `navigator.geolocation` (standard Web API) which Android WebView supports natively. The `@capacitor/geolocation` plugin is included to ensure Android prompts for location permission correctly.

No code changes needed — the existing 500m proximity check-in mechanic works as-is in the WebView.

---

## Google Play Store submission

1. Create app in [Google Play Console](https://play.google.com/console)
2. Set up app signing (use Play App Signing — recommended)
3. Upload the signed `.aab` to a release track (internal → closed → open → production)
4. Fill in store listing (description, screenshots, privacy policy)
5. Submit for review

**Privacy Policy required** — add one at `https://discgolfgo.app/privacy` before submitting.

---

## Updating the app

After web changes are deployed, no new APK/AAB needed — the WebView loads the live site.

For native changes (permissions, app icon, splash screen), run the build workflow again and upload the new AAB to Play Console.
