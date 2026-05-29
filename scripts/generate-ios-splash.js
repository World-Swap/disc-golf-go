// generate-ios-splash.js
// Creates branded iOS splash screen image for the LaunchScreen.storyboard.
// Run during iOS CI after `cap add/sync ios` so the ios/ directory exists.
// Does NOT own app icons — that's generate-web-icons.js + CI icon injection.
//
// Produces a single 2732x2732 universal splash PNG: dark teal (#0d2b33) background
// with the circular logo emblem centered at ~30% of canvas width.
// The source logo has an opaque square behind the circular emblem —
// a circular mask removes that square so only the emblem survives.
//
// Output: ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
// Also writes the matching Contents.json for Xcode asset catalog.

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Branded dark teal — matches capacitor.config.ts SplashScreen.backgroundColor
const BG_COLOR = { r: 13, g: 43, b: 51 };

const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/e8cdbbcc-19dc-4fc4-bac5-4016fb74ce13.png';

// Single universal splash image — iOS scales via storyboard Auto Layout.
// 2732x2732 covers iPad Pro 12.9" (largest iOS device) at 2x.
const SPLASH_SIZE = 2732;

// Logo occupies ~30% of canvas (slightly smaller than Android's 40% since
// the iOS canvas is much larger and we want a refined centered look)
const LOGO_RATIO = 0.30;

const SPLASH_DEST = path.join(
  __dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset'
);

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

// Apply circular mask — preserves only the circular emblem from the source.
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

async function generateSplash(sourceBuffer) {
  const size = SPLASH_SIZE;
  const logoSize = Math.round(size * LOGO_RATIO);

  // Resize logo then apply circular mask to remove opaque square background
  const resized = await sharp(sourceBuffer)
    .resize(logoSize, logoSize, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoBuffer = await circularMask(resized);

  const logoMeta = await sharp(logoBuffer).metadata();
  const lw = logoMeta.width;
  const lh = logoMeta.height;

  // Center logo on canvas
  const left = Math.floor((size - lw) / 2);
  const top = Math.floor((size - lh) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...BG_COLOR, alpha: 255 },
    },
  })
    .composite([{ input: logoBuffer, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  console.log('Downloading source logo…');
  const sourceBuffer = await downloadBuffer(SOURCE_URL);
  console.log(`Downloaded ${sourceBuffer.length} bytes`);

  // Ensure destination exists (cap add ios must have run first)
  fs.mkdirSync(SPLASH_DEST, { recursive: true });

  // Generate splash image
  const splashBuffer = await generateSplash(sourceBuffer);
  const splashPath = path.join(SPLASH_DEST, 'splash-2732x2732.png');
  fs.writeFileSync(splashPath, splashBuffer);
  console.log(`  ✓ Splash.imageset/splash-2732x2732.png (${SPLASH_SIZE}x${SPLASH_SIZE})`);

  // Write asset catalog metadata — single universal image, no @2x/@3x needed
  // because the storyboard UIImageView scales it via Auto Layout constraints.
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

  console.log('\niOS splash screen generated.');
}

main().catch((err) => {
  console.error('iOS splash generation failed:', err.message);
  process.exit(1);
});
