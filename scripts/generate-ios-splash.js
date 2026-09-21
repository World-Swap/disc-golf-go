// generate-ios-splash.js
// Installs the branded iOS splash screen into the Xcode asset catalog.
// Run during iOS CI after `cap add/sync ios` so the ios/ directory exists.
//
// Source of truth: resources/splash.png — the same branded splash the Android
// pipeline uses (charcoal #212121 background, centered disc emblem, warm glow),
// so iOS and Android launch identically.
//
// History: this script used to download the source from a hard-coded R2 URL,
// which had been overwritten with a screenshot of a training lesson. Every iOS
// build then baked that screenshot into the splash. The generator now reads only
// the committed, version-controlled resources/splash.png — no network, no drift.
//
// Output: ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
// plus the matching Contents.json (single universal image; the storyboard's
// UIImageView scales it via Auto Layout, so no @2x/@3x variants are needed).

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Branded charcoal — matches capacitor.config.ts SplashScreen.backgroundColor.
const BG_COLOR = { r: 33, g: 33, b: 33, alpha: 1 };

// 2732x2732 covers iPad Pro 12.9" (largest iOS device) at 2x.
const SPLASH_SIZE = 2732;

// Branded splash source — committed, always present.
const SOURCE = path.join(__dirname, '..', 'resources', 'splash.png');

const SPLASH_DEST = path.join(
  __dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset'
);

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Branded splash source missing at ${SOURCE} — cannot generate iOS splash.`);
  }

  const sourceBuffer = fs.readFileSync(SOURCE);
  if (sourceBuffer.length < 1000) {
    throw new Error(`Source too small (${sourceBuffer.length} bytes) — resources/splash.png looks corrupt.`);
  }

  // Normalize to the exact canvas on the branded background. `cover` keeps the
  // centered emblem centered; the source periphery is already #212121 so nothing
  // meaningful is cropped.
  const splashBuffer = await sharp(sourceBuffer)
    .resize(SPLASH_SIZE, SPLASH_SIZE, { fit: 'cover', position: 'center', background: BG_COLOR })
    .flatten({ background: BG_COLOR })
    .png()
    .toBuffer();

  fs.mkdirSync(SPLASH_DEST, { recursive: true });
  const splashPath = path.join(SPLASH_DEST, 'splash-2732x2732.png');
  fs.writeFileSync(splashPath, splashBuffer);
  console.log(`  ✓ Splash.imageset/splash-2732x2732.png (${SPLASH_SIZE}x${SPLASH_SIZE})`);

  const contentsJson = {
    images: [
      {
        filename: 'splash-2732x2732.png',
        idiom: 'universal',
      },
    ],
    info: {
      author: 'generate-ios-splash',
      version: 1,
    },
  };

  const contentsPath = path.join(SPLASH_DEST, 'Contents.json');
  fs.writeFileSync(contentsPath, JSON.stringify(contentsJson, null, 2) + '\n');
  console.log('  ✓ Splash.imageset/Contents.json');

  console.log('\niOS splash screen generated from resources/splash.png.');
}

main().catch((err) => {
  console.error('iOS splash generation failed:', err.message);
  process.exit(1);
});
