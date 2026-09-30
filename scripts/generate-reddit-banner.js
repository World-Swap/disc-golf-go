#!/usr/bin/env node
/**
 * Reddit community banners.
 *
 *   npm run art:reddit   -> web/img/social/reddit-banner-<w>x<h>.png
 *
 * Reddit asks for at least 1072x128 (desktop) and 1080x128 (mobile). That is an
 * 8.4:1 strip, which is the whole design problem: almost anything detailed turns
 * to mush, and Reddit draws the community icon and name OVER the left of it.
 *
 * So: the left third is kept deliberately empty, the same rule the in-app
 * .artcard follows for its title. The subject is a receding row of the logo's
 * own basket -- drawn from scripts/lib/logo-basket.js, the same path the
 * training cards use, so it is the logo's basket by construction.
 *
 * No text. At 128px tall a tagline is either too small to read or competes with
 * the community name Reddit puts on top of it, and the name already says who
 * this is.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { basket, disc, ORANGE, PEACH } = require('./lib/logo-basket');

const OUT = path.join(__dirname, '..', 'web', 'img', 'social');
const SIZES = [
  { w: 1072, h: 128, label: 'desktop' },
  { w: 1080, h: 128, label: 'mobile' },
];

const INK = '#17140f';        // the app's card base, a touch warmer than tokens' ink
const INK_2 = '#221d16';

function build(W, H) {
  // The basket is 241 units tall at scale 1. Size it to sit within the strip
  // with a little headroom, then step it across the right two-thirds.
  const s = (H * 0.78) / 241;
  const bw = 256 * s;

  const clearLeft = Math.round(W * 0.30);   // Reddit's icon + community name
  const first = clearLeft + bw * 0.25;
  const gap = bw * 1.05;
  const count = Math.ceil((W - first) / gap) + 1;

  const baskets = [];
  for (let i = 0; i < count; i++) {
    const x = first + i * gap;
    if (x > W) break;
    // Fade the row out to the right so it reads as texture, not a fence.
    const a = Math.max(0.10, 0.62 - i * 0.075);
    baskets.push(basket(x, (H - 241 * s) / 2, s, `rgba(247,244,239,${a.toFixed(3)})`));
  }

  // One disc in flight, crossing the row. The single bright thing in the strip.
  const cy = H * 0.56;
  const flight =
    `<path d="M${clearLeft * 0.62} ${H * 0.80} Q ${W * 0.46} ${H * 0.08} ${W * 0.80} ${cy}"
       fill="none" stroke="${ORANGE}" stroke-width="${Math.round(H * 0.045)}"
       stroke-linecap="round" opacity="0.92"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="${INK_2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${baskets.join('\n  ')}
  ${flight}
  ${disc(W * 0.80, cy, H * 0.115, ORANGE)}
  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="${ORANGE}"/>
</svg>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const { w, h, label } of SIZES) {
    const file = path.join(OUT, `reddit-banner-${w}x${h}.png`);
    await sharp(Buffer.from(build(w, h))).png({ compressionLevel: 9 }).toFile(file);
    const meta = await sharp(file).metadata();
    if (meta.width !== w || meta.height !== h) {
      throw new Error(`${file}: wrote ${meta.width}x${meta.height}, wanted ${w}x${h}`);
    }
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`  ${label.padEnd(8)} ${w}x${h}  ${kb} KB  ${path.relative(process.cwd(), file)}`);
  }
})();
