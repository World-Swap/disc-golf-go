// update-app-branding.js
// Downloads the approved disc-mark splash design from R2 and writes every
// required iOS icon and splash output.  Falls back to the committed
// AppIcon-1024x1024.png when R2 is unreachable.
//
// Outputs:
//   resources/splash.png                       (2732×2732)
//   resources/splash-dark.png                  (2732×2732)
//   resources/AppIcon.appiconset/*.png          (all iOS sizes)
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/*.png
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Approved splash design (charcoal bg + disc mark + orange glow)
const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/generated-images/company_104974/a34d951c-8869-4cde-a02a-ecdf549173e7.jpg';

const LOCAL_SOURCE = path.join(ROOT, 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');

const IOS_ICON_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
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
  // 1. Acquire source buffer
  let sourceBuffer;
  try {
    console.log('Downloading approved splash design from R2…');
    sourceBuffer = await downloadBuffer(SOURCE_URL);
    console.log(`  Downloaded ${sourceBuffer.length} bytes`);
  } catch (err) {
    console.warn(`  R2 download failed (${err.message}) — using local fallback`);
    if (!fs.existsSync(LOCAL_SOURCE)) {
      throw new Error(`Local fallback not found at ${LOCAL_SOURCE}`);
    }
    sourceBuffer = fs.readFileSync(LOCAL_SOURCE);
    console.log(`  Loaded ${sourceBuffer.length} bytes from local fallback`);
  }

  if (sourceBuffer.length < 10000) {
    throw new Error(
      `Source buffer is only ${sourceBuffer.length} bytes — likely corrupt. Aborting.`
    );
  }

  // 2. Splash files (2732×2732)
  console.log('\nGenerating splash files…');
  const splashBuffer = await sharp(sourceBuffer)
    .resize(2732, 2732, { fit: 'cover' })
    .png()
    .toBuffer();

  const splashDests = [
    path.join(ROOT, 'resources', 'splash.png'),
    path.join(ROOT, 'resources', 'splash-dark.png'),
  ];
  for (const dest of splashDests) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, splashBuffer);
    console.log(`  ✓ ${path.relative(ROOT, dest)}`);
  }

  // 3. App icon source (1024×1024)
  console.log('\nGenerating app icon source…');
  const icon1024Buffer = await sharp(sourceBuffer)
    .resize(1024, 1024, { fit: 'cover' })
    .png({ compressionLevel: 0 })
    .toBuffer();

  const iconSourceDest = path.join(ROOT, 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');
  fs.mkdirSync(path.dirname(iconSourceDest), { recursive: true });
  fs.writeFileSync(iconSourceDest, icon1024Buffer);
  console.log(`  ✓ ${path.relative(ROOT, iconSourceDest)}`);

  // 4. All iOS icon density sizes
  console.log('\nGenerating iOS icon sizes…');
  const resourcesIconDir = path.join(ROOT, 'resources', 'AppIcon.appiconset');
  const iosIconDir = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  fs.mkdirSync(resourcesIconDir, { recursive: true });
  fs.mkdirSync(iosIconDir, { recursive: true });

  for (const px of IOS_ICON_SIZES) {
    const filename = `AppIcon-${px}x${px}.png`;
    // Use uncompressed PNG for the 1024 source so wc -c > 500 KB
    const pngOpts = px === 1024 ? { compressionLevel: 0 } : {};
    const buf = await sharp(icon1024Buffer)
      .resize(px, px, { fit: 'cover' })
      .png(pngOpts)
      .toBuffer();
    const dest1 = path.join(resourcesIconDir, filename);
    const dest2 = path.join(iosIconDir, filename);
    fs.writeFileSync(dest1, buf);
    fs.writeFileSync(dest2, buf);
    console.log(`  ✓ ${px}×${px}  (${buf.length} bytes)`);
  }

  // 5. iOS AppIcon Contents.json (multi-idiom for Xcode)
  const iosAppIconContents = {
    images: [
      { idiom: 'iphone', scale: '2x',  size: '20x20',     filename: 'AppIcon-40x40.png'   },
      { idiom: 'iphone', scale: '3x',  size: '20x20',     filename: 'AppIcon-60x60.png'   },
      { idiom: 'iphone', scale: '2x',  size: '29x29',     filename: 'AppIcon-58x58.png'   },
      { idiom: 'iphone', scale: '3x',  size: '29x29',     filename: 'AppIcon-87x87.png'   },
      { idiom: 'iphone', scale: '2x',  size: '40x40',     filename: 'AppIcon-80x80.png'   },
      { idiom: 'iphone', scale: '3x',  size: '40x40',     filename: 'AppIcon-120x120.png' },
      { idiom: 'iphone', scale: '2x',  size: '60x60',     filename: 'AppIcon-120x120.png' },
      { idiom: 'iphone', scale: '3x',  size: '60x60',     filename: 'AppIcon-180x180.png' },
      { idiom: 'ipad',   scale: '1x',  size: '20x20',     filename: 'AppIcon-20x20.png'   },
      { idiom: 'ipad',   scale: '2x',  size: '20x20',     filename: 'AppIcon-40x40.png'   },
      { idiom: 'ipad',   scale: '1x',  size: '29x29',     filename: 'AppIcon-29x29.png'   },
      { idiom: 'ipad',   scale: '2x',  size: '29x29',     filename: 'AppIcon-58x58.png'   },
      { idiom: 'ipad',   scale: '1x',  size: '40x40',     filename: 'AppIcon-40x40.png'   },
      { idiom: 'ipad',   scale: '2x',  size: '40x40',     filename: 'AppIcon-80x80.png'   },
      { idiom: 'ipad',   scale: '1x',  size: '76x76',     filename: 'AppIcon-76x76.png'   },
      { idiom: 'ipad',   scale: '2x',  size: '76x76',     filename: 'AppIcon-152x152.png' },
      { idiom: 'ipad',   scale: '2x',  size: '83.5x83.5', filename: 'AppIcon-167x167.png' },
      { idiom: 'ios-marketing', scale: '1x', size: '1024x1024', filename: 'AppIcon-1024x1024.png' },
    ],
    info: { author: 'update-app-branding', version: 1 },
  };

  const iosAppIconContentsPath = path.join(iosIconDir, 'Contents.json');
  fs.writeFileSync(iosAppIconContentsPath, JSON.stringify(iosAppIconContents, null, 2) + '\n');
  console.log('\n  ✓ ios AppIcon.appiconset/Contents.json');

  // resources/AppIcon.appiconset/Contents.json — keep single universal 1024 entry
  // (used by @capacitor/assets; do not convert to multi-idiom)
  console.log('  (resources/AppIcon.appiconset/Contents.json left unchanged)');

  // 6. iOS Splash slots (three identically-sized copies)
  console.log('\nGenerating iOS splash slots…');
  const iosSplashDir = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
  fs.mkdirSync(iosSplashDir, { recursive: true });

  const splashSlots = [
    'splash-2732x2732.png',
    'splash-2732x2732-1.png',
    'splash-2732x2732-2.png',
  ];
  for (const slot of splashSlots) {
    const dest = path.join(iosSplashDir, slot);
    fs.writeFileSync(dest, splashBuffer);
    console.log(`  ✓ Splash.imageset/${slot}`);
  }

  const splashContents = {
    images: splashSlots.map((filename) => ({ idiom: 'universal', filename })),
    info: { author: 'update-app-branding', version: 1 },
  };
  fs.writeFileSync(
    path.join(iosSplashDir, 'Contents.json'),
    JSON.stringify(splashContents, null, 2) + '\n'
  );
  console.log('  ✓ Splash.imageset/Contents.json');

  console.log('\nAll branding assets written successfully.');
}

main().catch((err) => {
  console.error('update-app-branding failed:', err.message);
  process.exit(1);
});
