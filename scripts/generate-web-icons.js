// generate-web-icons.js
// Downloads the DGG logo and generates all web favicon variants, PWA icons,
// apple-touch-icon, logo.png, and iOS app icon from a single source.
// Does NOT own Android icons — those are generate-android-icons.js and generate-android-splash.js.

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/e8cdbbcc-19dc-4fc4-bac5-4016fb74ce13.png';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IOS_ICON_DIR = path.join(__dirname, '..', 'resources', 'AppIcon.appiconset');

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

async function main() {
  console.log('Downloading source logo…');
  const sourceBuffer = await downloadBuffer(SOURCE_URL);
  console.log(`Downloaded ${sourceBuffer.length} bytes`);

  // ── Web favicons ──────────────────────────────────────────────────────
  const WEB_SIZES = {
    'favicon-16x16.png':   16,
    'favicon-32x32.png':   32,
    'favicon-180x180.png': 180,
    'favicon-192x192.png': 192,
    'favicon-512x512.png': 512,
  };

  for (const [filename, size] of Object.entries(WEB_SIZES)) {
    const outPath = path.join(PUBLIC_DIR, filename);
    await sharp(sourceBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`  ✓ public/${filename} (${size}x${size})`);
  }

  // apple-touch-icon (180x180, same as favicon-180x180 but separate file)
  const appleTouchPath = path.join(PUBLIC_DIR, 'apple-touch-icon.png');
  await sharp(sourceBuffer)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(appleTouchPath);
  console.log('  ✓ public/apple-touch-icon.png (180x180)');

  // logo.png (180x180 — matches existing size)
  const logoPath = path.join(PUBLIC_DIR, 'logo.png');
  await sharp(sourceBuffer)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(logoPath);
  console.log('  ✓ public/logo.png (180x180)');

  // logo-original-1080.png (high-res backup)
  const logoOrigPath = path.join(PUBLIC_DIR, 'logo-original-1080.png');
  await sharp(sourceBuffer)
    .resize(1080, 1080, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(logoOrigPath);
  console.log('  ✓ public/logo-original-1080.png (1080x1080)');

  // favicon.ico — 32x32 PNG wrapped as ICO (modern browsers accept PNG-in-ICO)
  const ico32 = await sharp(sourceBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // ICO format: header (6 bytes) + dir entry (16 bytes) + PNG data
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);      // reserved
  icoHeader.writeUInt16LE(1, 2);      // type: 1 = ICO
  icoHeader.writeUInt16LE(1, 4);      // number of images

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(32, 0);         // width (32 = 32px)
  dirEntry.writeUInt8(32, 1);         // height
  dirEntry.writeUInt8(0, 2);          // color palette
  dirEntry.writeUInt8(0, 3);          // reserved
  dirEntry.writeUInt16LE(1, 4);       // color planes
  dirEntry.writeUInt16LE(32, 6);      // bits per pixel
  dirEntry.writeUInt32LE(ico32.length, 8);  // size of PNG data
  dirEntry.writeUInt32LE(22, 12);     // offset to PNG data (6 + 16 = 22)

  const icoBuffer = Buffer.concat([icoHeader, dirEntry, ico32]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
  console.log('  ✓ public/favicon.ico (32x32 PNG-in-ICO)');

  // ── iOS app icon ──────────────────────────────────────────────────────
  fs.mkdirSync(IOS_ICON_DIR, { recursive: true });
  const iosIconPath = path.join(IOS_ICON_DIR, 'AppIcon-1024x1024.png');
  await sharp(sourceBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(iosIconPath);
  console.log('  ✓ resources/AppIcon.appiconset/AppIcon-1024x1024.png (1024x1024)');

  console.log('\nAll web icons and iOS app icon generated.');
}

main().catch((err) => {
  console.error('Web icon generation failed:', err.message);
  process.exit(1);
});
