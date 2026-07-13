// generate-android-icons.js
// Downloads the Disc Golf Go logo and resizes it into all required Android mipmap densities.
// Run after `cap add android` or `cap sync android` so the android/ directory exists.
// Does NOT own iOS icons — those live in resources/AppIcon.appiconset/.
//
// Also writes adaptive icon XML and background color so the launcher shows the
// branded charcoal background instead of the default white square.
//
// The source logo already has the charcoal background baked in.
// A circular mask is applied during foreground generation for the adaptive icon shape.
// For launcher icons, the full image is used with a cover crop.

const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Branded charcoal — matches the uploaded logo's embedded background
const BG_COLOR = { r: 30, g: 30, b: 30, alpha: 1 };
const BG_HEX = '#1E1E1E';

const SOURCE_URL =
  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_104974/images/46faf86b-5de0-4152-8b2b-ad4a265e8881.png';

// Local fallback — committed AppIcon PNG, always present in the repo.
const LOCAL_SOURCE = path.join(__dirname, '..', 'resources', 'AppIcon.appiconset', 'AppIcon-1024x1024.png');

// mipmap density → icon size in pixels
const MIPMAP_SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
};

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

// Apply circular mask to a buffer. Preserves only the circular emblem;
// everything outside the circle becomes transparent.
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

// Write the adaptive icon XML files that reference foreground + background layers.
// cap sync overwrites these with white-background defaults — we overwrite them back.
function writeAdaptiveIconXml(anydpiDir) {
  const icLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  const icLauncherRoundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), icLauncherXml);
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), icLauncherRoundXml);
  console.log('  ✓ mipmap-anydpi-v26/ic_launcher.xml');
  console.log('  ✓ mipmap-anydpi-v26/ic_launcher_round.xml');
}

// Write the background color into res/values/colors.xml (creates or updates).
function writeBackgroundColor(valuesDir) {
  fs.mkdirSync(valuesDir, { recursive: true });
  const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Disc Golf Go branded charcoal — used as adaptive icon background -->
    <color name="ic_launcher_background">${BG_HEX}</color>
</resources>
`;
  const colorsPath = path.join(valuesDir, 'colors.xml');
  // If colors.xml already exists, merge only the ic_launcher_background entry
  if (fs.existsSync(colorsPath)) {
    let existing = fs.readFileSync(colorsPath, 'utf8');
    if (existing.includes('ic_launcher_background')) {
      // Replace existing value
      existing = existing.replace(
        /<color name="ic_launcher_background">[^<]*<\/color>/,
        `<color name="ic_launcher_background">${BG_HEX}</color>`
      );
      fs.writeFileSync(colorsPath, existing);
    } else {
      // Inject before closing </resources>
      existing = existing.replace(
        '</resources>',
        `    <color name="ic_launcher_background">${BG_HEX}</color>\n</resources>`
      );
      fs.writeFileSync(colorsPath, existing);
    }
  } else {
    fs.writeFileSync(colorsPath, colorsXml);
  }
  console.log(`  ✓ values/colors.xml (ic_launcher_background = ${BG_HEX})`);
}

async function main() {
  let sourceBuffer;
  try {
    console.log('Downloading source icon from R2…');
    sourceBuffer = await downloadBuffer(SOURCE_URL);
    console.log(`Downloaded ${sourceBuffer.length} bytes from R2`);
  } catch (r2err) {
    console.warn(`R2 download failed (${r2err.message}) — falling back to local AppIcon`);
    if (!fs.existsSync(LOCAL_SOURCE)) {
      throw new Error(
        `Neither R2 source nor local fallback exists at ${LOCAL_SOURCE}. ` +
        'Cannot generate Android icons.'
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

  for (const [density, size] of Object.entries(MIPMAP_SIZES)) {
    const dir = path.join(RES_BASE, density);
    fs.mkdirSync(dir, { recursive: true });

    // Square launcher icon — logo on branded background with circular mask
    const launcherPath = path.join(dir, 'ic_launcher.png');
    const resizedForLauncher = await sharp(sourceBuffer)
      .resize(size, size, { fit: 'cover', background: BG_COLOR })
      .png()
      .toBuffer();
    const maskedForLauncher = await circularMask(resizedForLauncher);
    // Composite masked circle onto dark teal square canvas
    await sharp({
      create: { width: size, height: size, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
    })
      .composite([{ input: maskedForLauncher, left: 0, top: 0 }])
      .png()
      .toFile(launcherPath);
    console.log(`  ✓ ${density}/ic_launcher.png (${size}x${size})`);

    // Round variant — circular mask over branded background
    const roundPath = path.join(dir, 'ic_launcher_round.png');
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
    );
    await sharp(sourceBuffer)
      .resize(size, size, { fit: 'cover', background: BG_COLOR })
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toFile(roundPath);
    console.log(`  ✓ ${density}/ic_launcher_round.png (${size}x${size})`);
  }

  // ── Adaptive icon layers (API 26+) ───────────────────────────────────────
  // Foreground: circular-masked logo centered with charcoal padding on 108dp canvas.
  // The circular mask shapes the logo for the adaptive icon so the
  // background layer (#1E1E1E) blends seamlessly with the foreground.
  const FOREGROUND_SIZES = {
    'mipmap-mdpi':    108,   // 108dp × 1
    'mipmap-hdpi':    162,   // 108dp × 1.5
    'mipmap-xhdpi':   216,   // 108dp × 2
    'mipmap-xxhdpi':  324,   // 108dp × 3
    'mipmap-xxxhdpi': 432,   // 108dp × 4
  };

  const anydpiDir = path.join(RES_BASE, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpiDir, { recursive: true });

  for (const [density, fgSize] of Object.entries(FOREGROUND_SIZES)) {
    const fgDir = path.join(RES_BASE, density);
    fs.mkdirSync(fgDir, { recursive: true });
    const fgPath = path.join(fgDir, 'ic_launcher_foreground.png');
    // Android adaptive icon safe zone: 66dp out of 108dp canvas (61%).
    // Use 45% so the complete DGG artwork (disc, landscape, text) fits well
    // inside the circular mask that Android 12+ applies to the splash screen
    // animated icon. 60% caused the logo edges to clip on some devices.
    const paddedSize = Math.round(fgSize * 0.45);

    // Resize source → apply circular mask → extend with dark teal padding
    const resizedFg = await sharp(sourceBuffer)
      .resize(paddedSize, paddedSize, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const maskedFg = await circularMask(resizedFg);

    // Get actual dimensions after resize (may differ if source isn't square)
    const fgMeta = await sharp(maskedFg).metadata();
    const fgW = fgMeta.width;
    const fgH = fgMeta.height;

    // Composite masked logo onto dark teal canvas at correct size
    await sharp({
      create: { width: fgSize, height: fgSize, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
    })
      .composite([{
        input: maskedFg,
        left: Math.floor((fgSize - fgW) / 2),
        top: Math.floor((fgSize - fgH) / 2),
      }])
      .png()
      .toFile(fgPath);

    console.log(`  ✓ ${density}/ic_launcher_foreground.png (${fgSize}px)`);
  }

  // Remove Capacitor's default vector drawables — they conflict with our bitmap foreground
  // and color background. cap sync recreates these every time, so the script cleans them.
  const defaultFgXml = path.join(RES_BASE, 'drawable-v24', 'ic_launcher_foreground.xml');
  const defaultBgXml = path.join(RES_BASE, 'drawable', 'ic_launcher_background.xml');
  const defaultBgColorXml = path.join(RES_BASE, 'values', 'ic_launcher_background.xml');
  for (const f of [defaultFgXml, defaultBgXml, defaultBgColorXml]) {
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`  ✗ removed default ${path.relative(RES_BASE, f)}`); }
  }

  // Write adaptive icon XMLs (overwrite cap sync defaults which use white background)
  writeAdaptiveIconXml(anydpiDir);

  // Write background color to res/values/colors.xml
  const valuesDir = path.join(RES_BASE, 'values');
  writeBackgroundColor(valuesDir);

  console.log('\nAll Android icons generated.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
