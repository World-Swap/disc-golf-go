# iOS Build Guide — Disc Golf Go

Cloud Xcode builds via GitHub Actions. No Mac required.

## GitHub Secrets (already configured)

| Secret | What it contains |
|--------|-----------------|
| `IOS_CERTIFICATE_P12` | Apple Distribution certificate — base64-encoded `.p12` file |
| `IOS_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `IOS_PROVISIONING_PROFILE` | App Store provisioning profile — base64-encoded `.mobileprovision` |
| `APP_STORE_CONNECT_API_KEY` | App Store Connect API key — base64-encoded `.p8` file |
| `APP_STORE_CONNECT_KEY_ID` | API key ID (e.g. `ABCD1234EF`) |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer UUID (e.g. `12ab3456-7890-...`) |

### Encoding a file to base64 for a secret

```bash
# macOS
base64 -i YourCertificate.p12 | pbcopy    # pastes to clipboard

# Linux / CI
base64 -w 0 YourCertificate.p12
```

---

## Triggering a Build Manually

1. Go to **GitHub → Actions → "Build iOS IPA & Upload to TestFlight"**
2. Click **"Run workflow"** (top right)
3. Choose whether to upload to TestFlight (`true` = upload, `false` = IPA artifact only)
4. Click **"Run workflow"**

The workflow runs on `macos-latest` (Apple Silicon, Xcode 16).
Expected runtime: **10–20 minutes**.

### Auto-trigger on push

The workflow also runs automatically on push to `main` when any of these files change:

```
capacitor.config.ts
public/**
package.json
ios/**
```

---

## Checking Build Status

1. **GitHub Actions tab** → click the running workflow
2. Each step shows live logs
3. When complete, the **job summary** shows:
   - Build result
   - TestFlight upload status
   - Link to App Store Connect

---

## Downloading the IPA Artifact

If you skipped TestFlight upload (or want the raw IPA):

1. GitHub Actions → completed run → **Artifacts** section at the bottom
2. Download `disc-golf-go-ios-<run-number>.zip`
3. Unzip → contains the signed `.ipa`

Artifacts are retained for **30 days**.

dSYMs (crash reporting symbols) are stored separately as `disc-golf-go-dsym-<run-number>` for **90 days**.

---

## How TestFlight Upload Works

The workflow uses **xcrun altool** with the App Store Connect API key (no Apple ID password needed). Flow:

1. CI decodes `APP_STORE_CONNECT_API_KEY` (base64 `.p8`) → writes to `~/.appstoreconnect/private_keys/`
2. Calls `xcrun altool --upload-app` with `--apiKey` + `--apiIssuer`
3. Apple processes the build asynchronously (usually 5–15 min after upload)
4. Build appears in **App Store Connect → TestFlight** automatically

### After upload

- Check [App Store Connect](https://appstoreconnect.apple.com) → your app → TestFlight
- Apple will email when processing is complete
- Add internal testers immediately; external testers need Apple review (1–3 days)

---

## Architecture

```
GitHub Actions (macos-latest, Xcode 16)
  └── npm ci
  └── npx cap add ios  (first time) OR  npx cap sync ios  (subsequent)
  └── scripts/patch-ios-info-plist.sh  (adds location permission strings)
  └── Import cert + provisioning profile into temporary keychain
  └── xcodebuild archive  →  build/App.xcarchive
  └── xcodebuild -exportArchive  →  build/*.ipa
  └── xcrun altool --upload-app  →  TestFlight
```

**Bundle ID:** `the.discgolfgo.app`
**Scheme:** `App`
**Workspace:** `ios/App/App.xcworkspace`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "No signing certificate found" | Check `IOS_CERTIFICATE_P12` + `IOS_CERTIFICATE_PASSWORD` secrets are set and the cert is a Distribution (not Development) cert |
| "Provisioning profile doesn't match" | Ensure the profile covers `the.discgolfgo.app` and is an **App Store** profile (not Ad Hoc) |
| "API key not found" | Verify `APP_STORE_CONNECT_KEY_ID` matches the `.p8` filename and the key has App Manager role |
| Build succeeds but no TestFlight upload | Check altool output in the step log; "409 Conflict" = duplicate build number (bump CFBundleVersion) |
| `cap sync ios` fails | First run — `cap add ios` initializes the platform; subsequent runs use `cap sync ios` |
| Location permission denied on device | `scripts/patch-ios-info-plist.sh` must run after `cap sync`; check the step ran |
