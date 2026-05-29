#!/usr/bin/env node
/**
 * Generates 4 iOS app icon variations for Disc Golf Go using DALL-E 3.
 * Uploads each to R2 for preview. Outputs URLs to stdout as JSON.
 */

const OpenAI = require('openai');
const fetch = require('node-fetch');
const FormData = require('form-data');
const https = require('https');
const http = require('http');

const openai = new OpenAI();

// Direction A — Full game-style icon, no text, no sticker outline
// 4 variations: different disc angle / crystal placement / lighting
const PROMPTS = [
  // Variation 1: Dynamic disc flying toward viewer, crystals at bottom
  `App icon for a disc golf mobile game. Square format, full-bleed, no border, no rounded corners, no text, no letterboxing. Dark deep teal background (#0a2a3a), rich moody atmosphere.

Center: a glowing white-yellow flying disc (frisbee) soaring diagonally from lower-left to upper-right, motion blur trail of golden-white light streaming behind it. The disc is the dominant element, filling 40% of the canvas.

Bottom corners: two large luminous crystals (aqua/teal-green glow) framing the disc below. Crystal facets catch light with sharp geometric reflections.

Upper right: a bright radiant sun/starburst with long golden rays fanning out, light haze around it. The sun's glow illuminates the disc from behind.

Art style: Pokémon Go adventure meets high-end mobile game icon. Vibrant, saturated, dramatic lighting. NO text, NO wordmark, NO sticker outline. Fill every pixel edge to edge.`,

  // Variation 2: Overhead disc view, crystals surround, sun centered above
  `App icon for a disc golf mobile game. Square format, full-bleed, no border, no rounded corners, no text, no letterboxing. Deep dark teal gradient background (#0a2a3a to #0d3a4a).

Center-left: glowing flying disc seen at a steep 3/4 angle, bright white core with electric-yellow glow ring, speed lines trailing right.

Sun: positioned top-center, large golden starburst with long radiating rays spreading across upper half of icon. Warm amber-gold tones contrast the teal background.

Crystals: three large teal-green crystals arranged along the bottom edge, hexagonal facets, lit from within with cyan glow. They anchor the composition.

Art style: high-detail game icon, cinematic lighting, depth of field effect. NO text, NO wordmark, NO outline border. Fills 1024x1024 completely.`,

  // Variation 3: Dramatic upward angle, disc center-mass, light explosion
  `App icon for a disc golf mobile game. Square format, full-bleed, no border, no rounded corners, no text. Very dark teal-navy background (#08222f).

Primary element: a large flying disc dead center, viewed from slightly below at a dynamic angle. The disc catches a burst of golden light from the upper-left — gleaming white rim, metallic sheen, lens flare across its surface. The disc takes up half the canvas.

Background: faint distant forest silhouette in darker teal at the very bottom edge.

Top half: massive golden sun explosion behind and above the disc, rays of light fanning outward in all directions like a starburst halo. Orange-gold gradient corona.

Flanking the disc: two tall pointed crystals (aquamarine, glowing teal), one on each side, their tips piercing into the disc's light.

Style: premium mobile game icon, rich detail, saturated adventure palette. NO text. NO sticker outline. All 1024x1024 pixels filled with art.`,

  // Variation 4: Crystal cave below, disc launching upward, sun at top
  `App icon for a disc golf mobile game. Square 1024x1024, full-bleed artwork, no border, no text, no rounded outline.

Composition: vertical hero shot. Bottom third — dense cluster of large glowing crystals (teal, cyan, aqua) rising from the bottom edge, pointed upward like a launching pad.

Center — a bright disc (frisbee) launching upward from the crystal cluster, trailing an arc of golden sparkles and light particles, disc slightly tilted, glowing bright white-gold.

Top third — enormous radiant sun filling the sky, deep amber-orange at the core fading to golden-yellow rays that cross the entire top. The disc is heading straight toward the sun.

Background: deep dark teal (#0a2a3a) sky with subtle dark cloud wisps for atmosphere and depth.

Style: epic mobile game cover art, Pokémon Go adventure aesthetic, lush saturated colors, dramatic depth. NO text, NO border, NO sticker effect. Full bleed.`
];

async function downloadImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadToR2(buffer, filename) {
  const formData = new FormData();
  formData.append('file', buffer, {
    filename,
    contentType: 'image/png',
  });

  const response = await fetch('https://polsia.com/api/proxy/r2/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error?.message || 'Upload failed');
  }
  return result.file.url;
}

async function generateAndUpload(prompt, index) {
  console.error(`[${index + 1}/4] Generating variation ${index + 1}...`);

  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    size: '1024x1024',
    quality: 'hd',
    n: 1,
  });

  const imageUrl = image.data[0].url;
  console.error(`[${index + 1}/4] Generated. Downloading...`);

  const buffer = await downloadImageBuffer(imageUrl);
  console.error(`[${index + 1}/4] Downloaded (${Math.round(buffer.length / 1024)}KB). Uploading to R2...`);

  const r2Url = await uploadToR2(buffer, `disc-golf-go-icon-v${index + 1}-${Date.now()}.png`);
  console.error(`[${index + 1}/4] Uploaded: ${r2Url}`);

  return { variation: index + 1, url: r2Url, buffer };
}

async function main() {
  const results = [];

  // Generate sequentially to avoid rate limits
  for (let i = 0; i < PROMPTS.length; i++) {
    const result = await generateAndUpload(PROMPTS[i], i);
    results.push({ variation: result.variation, url: result.url });

    // Save buffer info for selection
    result._buffer = result.buffer;

    // Small delay between generations
    if (i < PROMPTS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Output JSON result
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
