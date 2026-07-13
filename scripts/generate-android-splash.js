// generate-android-splash.js
// Creates branded Android splash screen drawables for @capacitor/splash-screen.
// Run after `cap sync android` so the android/ directory exists.
// Does NOT own launcher icons — that's generate-android-icons.js.
//
// Produces splash.png at every density + orientation variant so Capacitor defaults
// (white splash) are fully overwritten. Each is: branded charcoal (#1E1E1E) with
// the circular logo emblem centered at ~40% of the shorter dimension.
// The source logo already has the charcoal background baked in;
// a circular mask shapes the emblem for the splash.

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Matches adaptive icon background and capacitor.config.ts backgroundColor
const BG_COLOR = { r: 13, g: 43, b: 51 };

const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/46faf86b-5de0-4152-8b2b-ad4a265e8881.png';

// Local fallback — committed AppIcon PNG, always present in the repo.
const LOCAL_SOURCE = path.join(__dirname, '..', 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');

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
  // night/dark variants — same dimensions as their day counterparts
  'drawable-night':              { w: 320,  h: 480  },
  'drawable-port-night-ldpi':    { w: 200,  h: 320  },
  'drawable-port-night-mdpi':    { w: 320,  h: 480  },
  'drawable-port-night-hdpi':    { w: 480,  h: 800  },
  'drawable-port-night-xhdpi':   { w: 720,  h: 1280 },
  'drawable-port-night-xxhdpi':  { w: 1080, h: 1920 },
  'drawable-port-night-xxxhdpi': { w: 1440, h: 2560 },
  'drawable-land-night-ldpi':    { w: 320,  h: 200  },
  'drawable-land-night-mdpi':    { w: 480,  h: 320  },
  'drawable-land-night-hdpi':    { w: 800,  h: 480  },
  'drawable-land-night-xhdpi':   { w: 1280, h: 720  },
  'drawable-land-night-xxhdpi':  { w: 1920, h: 1080 },
  'drawable-land-night-xxxhdpi': { w: 2560, h: 1440 },
};

// Logo occupies ~55% of the shorter canvas dimension (bold, prominent treatment)
const LOGO_RATIO = 0.55;

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

function createGlowSvg(diameter) {
  const r = diameter / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">` +
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="#FF6B1A" stop-opacity="0.55"/>` +
    `<stop offset="45%" stop-color="#FF6B1A" stop-opacity="0.20"/>` +
    `<stop offset="100%" stop-color="#FF6B1A" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/></svg>`,
    'utf8'
  );
}

async function generateSplash(sourceBuffer, w, h) {
  const shorter = Math.min(w, h);
  const logoSize = Math.round(shorter * LOGO_RATIO);

  const resized = await sharp(sourceBuffer)
    .resize(logoSize, logoSize, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoBuffer = await circularMask(resized);

  const logoMeta = await sharp(logoBuffer).metadata();
  const lw = logoMeta.width;
  const lh = logoMeta.height;

  const left = Math.floor((w - lw) / 2);
  const top  = Math.floor((h - lh) / 2);

  // Orange glow halo — 1.8× the logo diameter, centered
  const glowDiam = Math.round(Math.max(lw, lh) * 1.8);
  const glowLeft = Math.floor((w - glowDiam) / 2);
  const glowTop  = Math.floor((h - glowDiam) / 2);
  const glowBuffer = await sharp(createGlowSvg(glowDiam)).png().toBuffer();

  return sharp({
    create: { width: w, height: h, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite([
      { input: glowBuffer, left: glowLeft, top: glowTop },
      { input: logoBuffer, left, top },
    ])
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
        <item name="windowSplashScreenBackground">#0d2b33</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`;
  const stylesPath = path.join(valuesDir, 'styles.xml');
  fs.writeFileSync(stylesPath, stylesXml);
  console.log('  ✓ values/styles.xml (splash theme — survives cap sync)');
}

async function main() {
  let sourceBuffer;
  try {
    console.log('Downloading source logo from R2…');
    sourceBuffer = await downloadBuffer(SOURCE_URL);
    console.log(`Downloaded ${sourceBuffer.length} bytes from R2`);
  } catch (r2err) {
    console.warn(`R2 download failed (${r2err.message}) — falling back to local AppIcon`);
    if (!fs.existsSync(LOCAL_SOURCE)) {
      throw new Error(
        `Neither R2 source nor local fallback exists at ${LOCAL_SOURCE}. ` +
        'Cannot generate Android splash.'
      );
    }
    sourceBuffer = fs.readFileSync(LOCAL_SOURCE);
    console.log(`Loaded ${sourceBuffer.length} bytes from local fallback`);
  }

  if (sourceBuffer.length < 1000) {
    throw new Error(
      `Source buffer too small (${sourceBuffer.length} bytes) — likely corrupt. ` +
      'Check that AppIcon-1024x1024.png in resources/AppIcon.appiconset/ is valid.'
    );
  }

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
