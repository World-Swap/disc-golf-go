// generate-new-logo.js
// Downloads the Disc Golf Go brand mark from R2 and generates all logo/icon assets.
// Replaces the old generated logo with the definitive uploaded disc PNG.
// Run once: node scripts/generate-new-logo.js

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
const IOS_ICON_DIR = path.join(RESOURCES_DIR, 'AppIcon.appiconset');

// Primary source — definitive Disc Golf Go brand mark (orange disc on charcoal)
const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/46faf86b-5de0-4152-8b2b-ad4a265e8881.png';

// Local fallback — committed AppIcon PNG, always present in the repo.
const LOCAL_SOURCE = path.join(__dirname, '..', 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');

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

// Circular mask — trims corners for adaptive icon safe zone
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
  let sourceBuffer;
  try {
    console.log('Downloading brand mark from R2…');
    sourceBuffer = await downloadBuffer(SOURCE_URL);
    console.log(`  Downloaded ${sourceBuffer.length} bytes from R2`);
  } catch (r2err) {
    console.warn(`R2 download failed (${r2err.message}) — falling back to local AppIcon`);
    if (!fs.existsSync(LOCAL_SOURCE)) {
      throw new Error(
        `Neither R2 source nor local fallback exists at ${LOCAL_SOURCE}. ` +
        'Cannot generate logo assets.'
      );
    }
    sourceBuffer = fs.readFileSync(LOCAL_SOURCE);
    console.log(`  Loaded ${sourceBuffer.length} bytes from local fallback`);
  }

  if (sourceBuffer.length < 1000) {
    throw new Error(
      `Source buffer too small (${sourceBuffer.length} bytes) — likely corrupt. ` +
      'Check that AppIcon-1024x1024.png in resources/AppIcon.appiconset/ is valid.'
    );
  }

  console.log('Generating Disc Golf Go logo assets (orange + charcoal)…\n');

  // ── Web favicons ──────────────────────────────────────────────────────────
  const WEB_SIZES = {
    'favicon-16x16.png':   16,
    'favicon-32x32.png':   32,
    'favicon-180x180.png': 180,
    'favicon-192x192.png': 192,
    'favicon-512x512.png': 512,
  };

  for (const [filename, size] of Object.entries(WEB_SIZES)) {
    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(PUBLIC_DIR, filename));
    console.log(`  ✓ public/${filename} (${size}x${size})`);
  }

  // apple-touch-icon (180×180)
  await sharp(sourceBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('  ✓ public/apple-touch-icon.png (180x180)');

  // logo.png (180×180 — referenced by all 26 <img src="/logo.png"> tags)
  await sharp(sourceBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'logo.png'));
  console.log('  ✓ public/logo.png (180x180)');

  // logo-original-1080.png (high-res backup)
  await sharp(sourceBuffer)
    .resize(1080, 1080)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'logo-original-1080.png'));
  console.log('  ✓ public/logo-original-1080.png (1080x1080)');

  // favicon.ico — 32×32 PNG wrapped as ICO (modern browsers accept PNG-in-ICO)
  const ico32 = await sharp(sourceBuffer).resize(32, 32).png().toBuffer();
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // reserved
  icoHeader.writeUInt16LE(1, 2); // type: ICO
  icoHeader.writeUInt16LE(1, 4); // image count
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(32, 0);
  dirEntry.writeUInt8(32, 1);
  dirEntry.writeUInt8(0, 2);
  dirEntry.writeUInt8(0, 3);
  dirEntry.writeUInt16LE(1, 4);
  dirEntry.writeUInt16LE(32, 6);
  dirEntry.writeUInt32LE(ico32.length, 8);
  dirEntry.writeUInt32LE(22, 12); // data offset = 6 + 16
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), Buffer.concat([icoHeader, dirEntry, ico32]));
  console.log('  ✓ public/favicon.ico (32x32 PNG-in-ICO)');

  // ── iOS app icon ──────────────────────────────────────────────────────────
  fs.mkdirSync(IOS_ICON_DIR, { recursive: true });
  await sharp(sourceBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(IOS_ICON_DIR, 'AppIcon-1024x1024.png'));
  console.log('  ✓ resources/AppIcon.appiconset/AppIcon-1024x1024.png (1024x1024)');

  // ── Capacitor source images ───────────────────────────────────────────────
  const BG_COLOR = { r: 30, g: 30, b: 30 };
  const ICON_SIZE = 1024;
  const LOGO_IN_ICON = Math.round(ICON_SIZE * 0.66);

  // icon-only.png (transparent bg, logo at 66% safe zone)
  const resizedIcon = await sharp(sourceBuffer)
    .resize(LOGO_IN_ICON, LOGO_IN_ICON, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const maskedIcon = await circularMask(resizedIcon);
  const iconMeta = await sharp(maskedIcon).metadata();
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

  // icon-background.png (solid charcoal)
  await sharp({
    create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .png()
    .toFile(path.join(RESOURCES_DIR, 'icon-background.png'));
  console.log('  ✓ resources/icon-background.png (1024x1024, solid #1E1E1E)');

  // icon.png (logo on charcoal, circular)
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
  console.log('  ✓ resources/icon.png (1024x1024, logo on charcoal)');

  // splash.png (2732×2732, icon centered on charcoal with orange glow)
  const SPLASH_SIZE = 2732;
  const LOGO_IN_SPLASH = Math.round(SPLASH_SIZE * 0.40);

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
  console.log('  ✓ resources/splash.png (2732x2732, charcoal splash with glow)');

  await sharp({
    create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite(splashComposites)
    .png()
    .toFile(path.join(RESOURCES_DIR, 'splash-dark.png'));
  console.log('  ✓ resources/splash-dark.png (2732x2732, dark mode splash with glow)');

  console.log('\nAll logo and icon assets generated successfully.');
}

main().catch((err) => {
  console.error('Logo generation failed:', err.message);
  process.exit(1);
});
