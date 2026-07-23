// generate-capacitor-assets-sources.js
// Creates the source images that @capacitor/assets expects in resources/.
// Run this ONCE to generate source images, then run `npx capacitor-assets generate`.
// Does NOT own the final native assets — @capacitor/assets does.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Branded charcoal background
const BG_COLOR = { r: 33, g: 33, b: 33 };
const BG_HEX = '#212121';

// Use the existing 1024x1024 app icon as the source
const SOURCE_PATH = path.join(__dirname, '..', 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

// Circular mask — preserves only the circular emblem from the source logo
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

async function main() {
  console.log('Reading source icon from resources/AppIcon.appiconset/…');
  const sourceBuffer = fs.readFileSync(SOURCE_PATH);
  console.log(`Read ${sourceBuffer.length} bytes from local source`);

  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  // ── 1. icon-only.png (1024x1024, transparent bg, logo at ~66% for safe zone) ──
  // @capacitor/assets uses this as the foreground layer for adaptive icons.
  // The 66% sizing ensures the logo fits inside Android 12+ circular safe zone (66dp/108dp).
  const ICON_SIZE = 1024;
  const LOGO_IN_ICON = Math.round(ICON_SIZE * 0.66); // 66% of canvas for safe zone

  const resizedIcon = await sharp(sourceBuffer)
    .resize(LOGO_IN_ICON, LOGO_IN_ICON, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const maskedIcon = await circularMask(resizedIcon);
  const iconMeta = await sharp(maskedIcon).metadata();

  // Center on transparent 1024x1024 canvas
  await sharp({
    create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: maskedIcon,
      left: Math.floor((ICON_SIZE - iconMeta.width) / 2),
      top: Math.floor((ICON_SIZE - iconMeta.height) / 2),
    }])
    .png()
    .toFile(path.join(RESOURCES_DIR, 'icon-only.png'));
  console.log('  ✓ resources/icon-only.png (1024x1024, transparent, 66% safe zone)');

  // ── 2. icon-background.png (1024x1024, solid dark teal) ──
  await sharp({
    create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .png()
    .toFile(path.join(RESOURCES_DIR, 'icon-background.png'));
  console.log('  ✓ resources/icon-background.png (1024x1024, solid #212121)');

  // ── 3. icon.png (1024x1024, logo on dark teal — used for non-adaptive icons) ──
  // Fallback icon for platforms that don't support adaptive icons
  const maskedFullIcon = await circularMask(
    await sharp(sourceBuffer)
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover', background: BG_COLOR })
      .png()
      .toBuffer()
  );
  await sharp({
    create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite([{ input: maskedFullIcon, left: 0, top: 0 }])
    .png()
    .toFile(path.join(RESOURCES_DIR, 'icon.png'));
  console.log('  ✓ resources/icon.png (1024x1024, logo on dark teal)');

  // ── 4. splash.png (2732x2732, branded splash with centered logo + glow) ──
  const SPLASH_SIZE = 2732;
  const LOGO_IN_SPLASH = Math.round(SPLASH_SIZE * 0.40); // 40% of canvas — bold treatment

  function createGlowSvg(diameter) {
    const r = diameter / 2;
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">` +
      `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#FA5E0F" stop-opacity="0.55"/>` +
      `<stop offset="45%" stop-color="#FA5E0F" stop-opacity="0.20"/>` +
      `<stop offset="100%" stop-color="#FA5E0F" stop-opacity="0"/>` +
      `</radialGradient></defs>` +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/></svg>`,
      'utf8'
    );
  }

  const resizedSplash = await sharp(sourceBuffer)
    .resize(LOGO_IN_SPLASH, LOGO_IN_SPLASH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const maskedSplash = await circularMask(resizedSplash);
  const splashMeta = await sharp(maskedSplash).metadata();

  const splashLeft = Math.floor((SPLASH_SIZE - splashMeta.width) / 2);
  const splashTop  = Math.floor((SPLASH_SIZE - splashMeta.height) / 2);

  const glowDiam = Math.round(Math.max(splashMeta.width, splashMeta.height) * 1.8);
  const glowLeft = Math.floor((SPLASH_SIZE - glowDiam) / 2);
  const glowTop  = Math.floor((SPLASH_SIZE - glowDiam) / 2);
  const glowBuffer = await sharp(createGlowSvg(glowDiam)).png().toBuffer();

  const splashComposites = [
    { input: glowBuffer, left: glowLeft, top: glowTop },
    { input: maskedSplash, left: splashLeft, top: splashTop },
  ];

  await sharp({
    create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite(splashComposites)
    .png()
    .toFile(path.join(RESOURCES_DIR, 'splash.png'));
  console.log('  ✓ resources/splash.png (2732x2732, branded splash with glow)');

  // ── 5. splash-dark.png (same as splash — charcoal is already dark-mode friendly) ──
  await sharp({
    create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite(splashComposites)
    .png()
    .toFile(path.join(RESOURCES_DIR, 'splash-dark.png'));
  console.log('  ✓ resources/splash-dark.png (2732x2732, dark mode splash with glow)');

  console.log('\nAll @capacitor/assets source images generated in resources/.');
  console.log('Next step: npx @capacitor/assets generate --iconBackgroundColor "#212121" --splashBackgroundColor "#212121"');
}

main().catch((err) => {
  console.error('Source image generation failed:', err.message);
  process.exit(1);
});
