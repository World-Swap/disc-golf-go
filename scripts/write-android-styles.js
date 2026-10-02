// write-android-styles.js
// Writes the Android styles.xml with proper splash theme configuration and
// installs the Android 12+ system-splash icon (drawable/icon_only.png).
// Must run AFTER `cap sync` because sync overwrites styles.xml with defaults.
// @capacitor/assets owns the launcher icons and full-screen splash PNGs; it does
// NOT own icon_only.png (the Android 12+ system-splash icon), so we own it here.
//
// Why this exists: cap sync generates a default styles.xml that uses
// AppTheme.NoActionBar as the launch theme. We need AppTheme.NoActionBarLaunch
// to extend Theme.SplashScreen (from androidx.core:core-splashscreen) so the
// Android 12+ system splash shows the branded dark background + foreground icon.
//
// THE SAFE ZONE, measured rather than assumed. Google documents the splash icon
// as 288dp of a 432dp drawable — a circle of radius canvas/3 — but that is not
// what devices actually crop to, and designing to it shrinks the logo by 40% for
// no reason. Measured off a real launch on a Galaxy running One UI: the crop is
// a SQUARE, not a circle (nothing is cut at the sides, and the top comes off
// along a flat line, not an arc), and it keeps everything within 0.424 of the
// canvas from centre.
//
// The artwork reaches 0.446 of the canvas vertically — 353x457 half-extents in a
// 1024 canvas — so only the last ~2% overflowed: the top band lost 10px at its
// centre and the pole tip 10px. Small, but it reads as a sliced logo.
//
// The same file is also the launcher-icon source, where
// mipmap-anydpi-v26/ic_launcher.xml already insets the foreground by 16.7% and
// brings it well inside its own mask. The launcher icon is correct and must not
// be shrunk, which is why this fit happens here and not in resources/.
//
// So this script does not copy the source — it FITS it, scaling so the artwork's
// largest half-extent lands at TARGET_EXTENT with a little margin under the
// measured crop. The scale comes from the image, so re-cutting the logo cannot
// reintroduce the clipping.

const fs = require('fs');
const path = require('path');

const RES_BASE = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

/** What a real device was measured to keep: half-extent 0.424 of the canvas. */
const MEASURED_CROP_EXTENT = 0.424;
/** Aim just inside it, so an antialiased edge never kisses the crop. */
const TARGET_EXTENT = 0.41;
/** The source must be centred: the mask is a circle about the canvas centre. */
const MAX_CENTRE_OFFSET = 0.02;

const stylesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <!-- Keep app content below the status bar. Android 15+ (targetSdk 35+)
             enforces edge-to-edge, which draws the WebView under the status bar;
             opt out and paint a white bar with dark icons to match the app. -->
        <item name="android:statusBarColor">#ffffff</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>

    <!-- Launch theme: Android 12+ system splash with branded background + icon.
         The icon points straight at @drawable/icon_only, which this script
         writes already padded to the mask's safe zone — there is no inset
         wrapper, so the padding lives in exactly one place. -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#202020</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/icon_only</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>

</resources>
`;

/**
 * The artwork's largest half-extent from the canvas centre, as a fraction of
 * the canvas — which is what a square crop cuts against — plus how far off
 * centre it sits.
 */
async function artworkExtent(sharp, input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2;
  const cy = height / 2;
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] <= 16) continue; // transparent
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('resources/icon-only.png has no opaque pixels.');
  // How far the artwork's own centre sits from the canvas centre, as a fraction
  // of the canvas. Scaling cannot correct this — it shrinks the offset but never
  // removes it, so a lopsided source yields a lopsided splash icon.
  const offset = Math.max(
    Math.abs((minX + maxX + 1) / 2 - cx) / width,
    Math.abs((minY + maxY + 1) / 2 - cy) / height
  );
  // The square crop cuts on whichever half-extent is larger — here the height.
  const canvas = Math.max(width, height);
  const extent = Math.max(
    Math.max(cx - minX, maxX + 1 - cx),
    Math.max(cy - minY, maxY + 1 - cy)
  ) / canvas;
  return { extent, offset, canvas };
}

async function writeSplashIcon() {
  const iconSource = path.join(__dirname, '..', 'resources', 'icon-only.png');
  const iconDest = path.join(RES_BASE, 'drawable', 'icon_only.png');

  if (!fs.existsSync(iconSource)) {
    console.warn('⚠ resources/icon-only.png missing — Android 12+ splash icon not refreshed');
    return;
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    // Deliberately fatal rather than falling back to a copy: a silent copy is
    // exactly the bug this script exists to prevent, and it would ship clipped.
    throw new Error('sharp is required to build the splash icon — run `npm ci --include=dev` first.');
  }

  const source = fs.readFileSync(iconSource);
  const before = await artworkExtent(sharp, source);
  if (before.offset > MAX_CENTRE_OFFSET) {
    throw new Error(
      `resources/icon-only.png is off-centre by ${(before.offset * 100).toFixed(1)}% of the canvas ` +
        `(limit ${(MAX_CENTRE_OFFSET * 100).toFixed(0)}%). The splash masks a circle about the centre, ` +
        `so off-centre artwork reads as lopsided however much it is scaled.`
    );
  }
  const scale = Math.min(1, TARGET_EXTENT / before.extent);

  const size = before.canvas;
  const inner = Math.max(1, Math.round(size * scale));
  const offset = Math.round((size - inner) / 2);
  const scaled = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const out = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, left: offset, top: offset }])
    .png()
    .toBuffer();

  // Prove it against the real mask rather than trusting the arithmetic.
  const after = await artworkExtent(sharp, out);
  if (after.extent > MEASURED_CROP_EXTENT) {
    throw new Error(
      `Splash icon still inside the crop: artwork reaches ${after.extent.toFixed(3)} of the canvas, ` +
        `measured crop ${MEASURED_CROP_EXTENT}. Check resources/icon-only.png is centred.`
    );
  }

  fs.mkdirSync(path.dirname(iconDest), { recursive: true });
  fs.writeFileSync(iconDest, out);
  console.log(
    `✓ drawable/icon_only.png fitted to the splash crop ` +
      `(artwork ${before.extent.toFixed(3)} → ${after.extent.toFixed(3)} of canvas, scale ${scale.toFixed(3)})`
  );
}

async function main() {
  const valuesDir = path.join(RES_BASE, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(path.join(valuesDir, 'styles.xml'), stylesXml);
  console.log('✓ values/styles.xml written (splash theme with Android 12+ support)');

  // The old inset wrapper is gone: padding is baked into icon_only.png above,
  // and two sources of padding is how it drifted out of the safe zone before.
  const legacyInset = path.join(RES_BASE, 'drawable', 'ic_launcher_splash.xml');
  if (fs.existsSync(legacyInset)) {
    fs.unlinkSync(legacyInset);
    console.log('✓ removed drawable/ic_launcher_splash.xml (padding now baked into icon_only.png)');
  }

  await writeSplashIcon();
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
