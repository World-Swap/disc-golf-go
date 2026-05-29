// generate-android-splash.js
// Creates branded Android splash screen drawables for @capacitor/splash-screen.
// Run after `cap sync android` so the android/ directory exists.
// Does NOT own launcher icons — that's generate-android-icons.js.
//
// Produces splash.png at every density + orientation variant so Capacitor defaults
// (white splash) are fully overwritten. Each is: branded dark teal (#0d2b33) with
// the circular logo emblem centered at ~40% of the shorter dimension.
// The source logo has an opaque light-teal square behind the circular emblem —
// a circular mask removes that square so only the emblem survives.

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Matches adaptive icon background and capacitor.config.ts backgroundColor
const BG_COLOR = { r: 13, g: 43, b: 51 };

const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/e8cdbbcc-19dc-4fc4-bac5-4016fb74ce13.png';

// All density-qualified variants so no Capacitor default splash survives.
// Covers: base fallback, portrait (all densities), landscape (all densities),
// and unqualified density buckets.
const SPLASH_SIZES = {
  'drawable':              { w: 320,  h: 480  },
  'drawable-hdpi':         { w: 480,  h: 800  },
  'drawable-xhdpi':        { w: 720,  h: 1280 },
  'drawable-xxhdpi':       { w: 1080, h: 1920 },
  'drawable-xxxhdpi':      { w: 1440, h: 2560 },
  'drawable-port':         { w: 320,  h: 480  },
  'drawable-port-mdpi':    { w: 320,  h: 480  },
  'drawable-port-hdpi':    { w: 480,  h: 800  },
  'drawable-port-xhdpi':   { w: 720,  h: 1280 },
  'drawable-port-xxhdpi':  { w: 1080, h: 1920 },
  'drawable-port-xxxhdpi': { w: 1440, h: 2560 },
  'drawable-land':         { w: 480,  h: 320  },
  'drawable-land-mdpi':    { w: 480,  h: 320  },
  'drawable-land-hdpi':    { w: 800,  h: 480  },
  'drawable-land-xhdpi':   { w: 1280, h: 720  },
  'drawable-land-xxhdpi':  { w: 1920, h: 1080 },
  'drawable-land-xxxhdpi': { w: 2560, h: 1440 },
};

// Logo occupies ~40% of the shorter canvas dimension
const LOGO_RATIO = 0.40;

const RES_BASE = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Apply circular mask to a buffer, preserving only the circular emblem.
// Returns a PNG buffer with transparent background outside the circle.
async function circularMask(buf) {
  const meta = await sharp(buf).metadata();
  const { width, height } = meta;
  const diameter = Math.min(width, height);
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${diameter / 2}" fill="white"/></svg>`
  );
  return sharp(buf)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function generateSplash(sourceBuffer, w, h) {
  const shorter = Math.min(w, h);
  const logoSize = Math.round(shorter * LOGO_RATIO);

  // Resize logo to target size, then apply circular mask to remove the
  // opaque light-teal square that sits behind the circular emblem in the source.
  const resized = await sharp(sourceBuffer)
    .resize(logoSize, logoSize, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoBuffer = await circularMask(resized);

  // Get actual logo dimensions after resize
  const logoMeta = await sharp(logoBuffer).metadata();
  const lw = logoMeta.width;
  const lh = logoMeta.height;

  // Center logo on canvas
  const left = Math.floor((w - lw) / 2);
  const top = Math.floor((h - lh) / 2);

  // Build canvas: solid branded background + circular logo composite
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { ...BG_COLOR, alpha: 255 },
    },
  })
    .composite([{ input: logoBuffer, left, top }])
    .png()
    .toBuffer();
}

// Write styles.xml to res/values/ after generating splash assets.
// This MUST run after `cap sync` because sync overwrites styles.xml.
// The CI workflow runs this script after sync, so the theme persists.
function writeStylesXml() {
  const valuesDir = path.join(RES_BASE, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  const stylesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <!-- Customize your theme here. -->
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>


    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <!-- Android 12+ system splash: dark teal bg matching the brand -->
        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>
        <!-- Android 12+ animated icon: use the adaptive launcher icon (properly sized
             foreground at 60% canvas = fits within 66dp safe zone + circular mask).
             Do NOT use @drawable/splash here — that's a full-screen image that gets
             mangled by the mandatory circular crop. -->
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <!-- After system splash dismisses, switch to the normal no-action-bar theme -->
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <!-- Pre-12 window background: full branded splash PNG -->
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`;
  const stylesPath = path.join(valuesDir, 'styles.xml');
  fs.writeFileSync(stylesPath, stylesXml);
  console.log('  ✓ values/styles.xml (splash theme — survives cap sync)');
}

async function main() {
  console.log('Downloading source logo…');
  const sourceBuffer = await downloadBuffer(SOURCE_URL);
  console.log(`Downloaded ${sourceBuffer.length} bytes`);

  for (const [dir, { w, h }] of Object.entries(SPLASH_SIZES)) {
    const outDir = path.join(RES_BASE, dir);
    fs.mkdirSync(outDir, { recursive: true });

    const splashPath = path.join(outDir, 'splash.png');
    const splashBuffer = await generateSplash(sourceBuffer, w, h);
    fs.writeFileSync(splashPath, splashBuffer);
    console.log(`  ✓ ${dir}/splash.png (${w}×${h})`);
  }

  // Write the splash theme to styles.xml — must happen AFTER cap sync
  // because sync regenerates this file with Capacitor defaults.
  writeStylesXml();

  console.log('\nAll Android splash screens generated.');
}

main().catch((err) => {
  console.error('Splash generation failed:', err.message);
  process.exit(1);
});
