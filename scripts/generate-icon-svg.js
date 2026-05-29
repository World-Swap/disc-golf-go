#!/usr/bin/env node
/**
 * Generates 4 Disc Golf Go iOS app icon variations as SVG→PNG via sharp.
 * Direction A: game-style, dark teal bg, flying disc + glow, crystals, sunburst.
 * Saves PNGs to resources/icons/ for server-side R2 upload.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ICONS_DIR = path.join(__dirname, '..', 'resources', 'icons');

// ─── Variation 1: Disc flying upper-right, crystals flanking bottom ──────────
function svgVariation1() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg1" cx="65%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#0d3a4a"/>
      <stop offset="60%" stop-color="#0a2a3a"/>
      <stop offset="100%" stop-color="#061820"/>
    </radialGradient>
    <radialGradient id="sunGlow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff7e0" stop-opacity="1"/>
      <stop offset="25%" stop-color="#ffd060" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#ff9900" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ff6600" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="discGrad1" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#ffe8a0"/>
      <stop offset="80%" stop-color="#e8c040"/>
      <stop offset="100%" stop-color="#c09020"/>
    </radialGradient>
    <radialGradient id="discGlow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8d0" stop-opacity="0.8"/>
      <stop offset="60%" stop-color="#ffd060" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="crystalL1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a0fff0"/>
      <stop offset="30%" stop-color="#40d4c0"/>
      <stop offset="70%" stop-color="#008878"/>
      <stop offset="100%" stop-color="#004440"/>
    </linearGradient>
    <linearGradient id="crystalR1" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#80ffe8"/>
      <stop offset="30%" stop-color="#30c0b0"/>
      <stop offset="70%" stop-color="#007068"/>
      <stop offset="100%" stop-color="#003838"/>
    </linearGradient>
    <linearGradient id="trail1" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#fff0a0" stop-opacity="0.9"/>
      <stop offset="40%" stop-color="#ffd060" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ff8800" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow1" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="crystalGlowFilter" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg1)"/>
  <ellipse cx="512" cy="950" rx="600" ry="200" fill="#061820" opacity="0.6"/>
  <g transform="translate(760, 190)">
    <circle r="200" fill="url(#sunGlow1)" opacity="0.7"/>
    <g stroke="#ffd060" stroke-linecap="round" opacity="0.85">
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(22.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(45)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(67.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(90)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(112.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(135)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(157.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(180)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(202.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(225)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(247.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(270)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(292.5)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(315)"/>
      <line x1="0" y1="-90" x2="0" y2="-260" stroke-width="3" transform="rotate(337.5)"/>
    </g>
    <g stroke="#ffb020" stroke-linecap="round" opacity="0.6">
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(11.25)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(33.75)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(56.25)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(78.75)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(101.25)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(123.75)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(146.25)"/>
      <line x1="0" y1="-70" x2="0" y2="-140" stroke-width="2" transform="rotate(168.75)"/>
    </g>
    <circle r="72" fill="#fff7e0"/>
    <circle r="55" fill="#ffffff"/>
  </g>
  <polygon points="160,680 280,560 680,280 640,340 310,600" fill="url(#trail1)" opacity="0.6"/>
  <polygon points="200,650 300,550 660,290 650,330 330,580" fill="#fff8e0" opacity="0.15"/>
  <g fill="#fff8c0" opacity="0.8">
    <circle cx="290" cy="580" r="5"/>
    <circle cx="350" cy="520" r="4"/>
    <circle cx="420" cy="465" r="6"/>
    <circle cx="490" cy="410" r="4"/>
    <circle cx="560" cy="355" r="5"/>
  </g>
  <ellipse cx="590" cy="380" rx="160" ry="80" fill="url(#discGlow1)" transform="rotate(-35, 590, 380)" filter="url(#glow1)" opacity="0.8"/>
  <ellipse cx="590" cy="375" rx="145" ry="62" fill="url(#discGrad1)" transform="rotate(-35, 590, 375)" filter="url(#softGlow)"/>
  <ellipse cx="590" cy="375" rx="70" ry="28" fill="#fffff0" transform="rotate(-35, 590, 375)" opacity="0.9"/>
  <ellipse cx="590" cy="375" rx="145" ry="62" fill="none" stroke="#ffffff" stroke-width="3" transform="rotate(-35, 590, 375)" opacity="0.7"/>
  <ellipse cx="590" cy="375" rx="100" ry="42" fill="none" stroke="#ffd88080" stroke-width="1.5" transform="rotate(-35, 590, 375)"/>
  <ellipse cx="555" cy="350" rx="25" ry="10" fill="#ffffff" transform="rotate(-35, 555, 350)" opacity="0.6"/>
  <g filter="url(#crystalGlowFilter)" opacity="0.95">
    <ellipse cx="185" cy="870" rx="120" ry="60" fill="#00c8b8" opacity="0.3"/>
    <polygon points="185,580 225,780 145,780" fill="url(#crystalL1)"/>
    <polygon points="185,580 225,780 205,680" fill="#c0fff8" opacity="0.4"/>
    <polygon points="185,580 145,780 165,680" fill="#004848" opacity="0.3"/>
    <polygon points="130,640 160,800 100,800" fill="#30c0b0" opacity="0.8"/>
    <polygon points="240,660 268,800 212,800" fill="#20a898" opacity="0.8"/>
    <polygon points="185,580 225,780 145,780" fill="none" stroke="#80ffe8" stroke-width="2" opacity="0.6"/>
  </g>
  <g filter="url(#crystalGlowFilter)" opacity="0.95">
    <ellipse cx="840" cy="870" rx="120" ry="60" fill="#00c8b8" opacity="0.3"/>
    <polygon points="840,600 880,800 800,800" fill="url(#crystalR1)"/>
    <polygon points="840,600 880,800 860,700" fill="#a0fff0" opacity="0.4"/>
    <polygon points="840,600 800,800 820,700" fill="#003848" opacity="0.3"/>
    <polygon points="790,650 818,800 762,800" fill="#20b0a0" opacity="0.8"/>
    <polygon points="890,640 918,800 862,800" fill="#30c0b0" opacity="0.8"/>
    <polygon points="840,600 880,800 800,800" fill="none" stroke="#60ffd8" stroke-width="2" opacity="0.6"/>
  </g>
  <ellipse cx="512" cy="840" rx="500" ry="80" fill="#00c0b0" opacity="0.08"/>
  <g fill="#a0fff0" opacity="0.4">
    <circle cx="350" cy="200" r="2.5"/>
    <circle cx="420" cy="150" r="2"/>
    <circle cx="300" cy="350" r="3"/>
    <circle cx="480" cy="250" r="1.5"/>
    <circle cx="660" cy="480" r="2"/>
    <circle cx="720" cy="520" r="1.5"/>
    <circle cx="200" cy="450" r="2"/>
    <circle cx="140" cy="300" r="1.5"/>
    <circle cx="880" cy="400" r="2"/>
    <circle cx="950" cy="550" r="1.5"/>
  </g>
</svg>`;
}

// ─── Variation 2: Sun top-center, disc center, crystal row bottom ─────────────
function svgVariation2() {
  const rays24 = Array.from({length: 24}, (_, i) => {
    const angle = i * 15;
    const len = i % 2 === 0 ? 340 : 220;
    const inner = 80;
    const rad = angle * Math.PI / 180;
    const x1 = Math.sin(rad) * inner, y1 = -Math.cos(rad) * inner;
    const x2 = Math.sin(rad) * len, y2 = -Math.cos(rad) * len;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffc840" stroke-width="${i % 2 === 0 ? 3 : 1.5}" stroke-linecap="round"/>`;
  }).join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg2" cx="50%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#0e3e50"/>
      <stop offset="50%" stop-color="#0a2a3a"/>
      <stop offset="100%" stop-color="#051520"/>
    </radialGradient>
    <radialGradient id="sun2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="20%" stop-color="#ffe060"/>
      <stop offset="50%" stop-color="#ff9900" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#ff5500" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disc2" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#ffe090"/>
      <stop offset="75%" stop-color="#d8a030"/>
      <stop offset="100%" stop-color="#a07010"/>
    </radialGradient>
    <radialGradient id="discGlow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff4c0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cA2" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#90ffe8"/>
      <stop offset="40%" stop-color="#20c0a8"/>
      <stop offset="100%" stop-color="#006058"/>
    </linearGradient>
    <linearGradient id="cB2" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#b0fff0"/>
      <stop offset="40%" stop-color="#30d0b8"/>
      <stop offset="100%" stop-color="#008070"/>
    </linearGradient>
    <linearGradient id="cC2" x1="80%" y1="0%" x2="20%" y2="100%">
      <stop offset="0%" stop-color="#70ffd8"/>
      <stop offset="40%" stop-color="#10b0a0"/>
      <stop offset="100%" stop-color="#005050"/>
    </linearGradient>
    <filter id="glow2" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="20" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="crystal2" x="-35%" y="-35%" width="170%" height="170%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg2)"/>
  <rect x="0" y="820" width="1024" height="204" fill="#04121a" opacity="0.7"/>
  <g transform="translate(512, 80)">
    <circle r="320" fill="url(#sun2)" opacity="0.5"/>
    <g opacity="0.9">${rays24}</g>
    <circle r="75" fill="#fff8e0"/>
    <circle r="55" fill="#ffffff"/>
    <circle r="20" fill="#fffde0" opacity="0.8"/>
  </g>
  <g transform="translate(512, 490)">
    <ellipse rx="200" ry="95" fill="url(#discGlow2)" transform="rotate(-25)" filter="url(#glow2)" opacity="0.7"/>
    <g stroke="#ffe080" stroke-linecap="round" opacity="0.5" transform="rotate(-25)">
      <line x1="-280" y1="-20" x2="-210" y2="-15" stroke-width="3"/>
      <line x1="-260" y1="5" x2="-200" y2="8" stroke-width="2"/>
      <line x1="-270" y1="-45" x2="-215" y2="-35" stroke-width="2"/>
      <line x1="-255" y1="30" x2="-208" y2="22" stroke-width="1.5"/>
    </g>
    <ellipse rx="175" ry="75" fill="url(#disc2)" transform="rotate(-25)" filter="url(#glow2)"/>
    <ellipse rx="80" ry="34" fill="#fffff0" transform="rotate(-25)" opacity="0.9"/>
    <ellipse rx="175" ry="75" fill="none" stroke="#ffffff" stroke-width="3" transform="rotate(-25)" opacity="0.65"/>
    <ellipse rx="120" ry="52" fill="none" stroke="#ffd86060" stroke-width="1.5" transform="rotate(-25)"/>
    <ellipse cx="-55" cy="-20" rx="28" ry="12" fill="#ffffff" transform="rotate(-25, -55, -20)" opacity="0.55"/>
  </g>
  <g transform="translate(180, 1024)" filter="url(#crystal2)">
    <ellipse cx="0" cy="-30" rx="100" ry="40" fill="#00c0b0" opacity="0.25"/>
    <polygon points="0,-380 55,-50 -55,-50" fill="url(#cA2)"/>
    <polygon points="0,-380 55,-50 10,-200" fill="#c0fff8" opacity="0.35"/>
    <polygon points="-80,-300 -45,-50 -115,-50" fill="#20b0a0" opacity="0.7"/>
    <polygon points="80,-310 115,-50 45,-50" fill="#30c0b0" opacity="0.7"/>
    <polygon points="0,-380 55,-50 -55,-50" fill="none" stroke="#70ffe8" stroke-width="2" opacity="0.5"/>
  </g>
  <g transform="translate(512, 1024)" filter="url(#crystal2)">
    <ellipse cx="0" cy="-30" rx="110" ry="45" fill="#00d0c0" opacity="0.3"/>
    <polygon points="0,-430 65,-50 -65,-50" fill="url(#cB2)"/>
    <polygon points="0,-430 65,-50 15,-220" fill="#d0fff8" opacity="0.4"/>
    <polygon points="-90,-340 -60,-50 -120,-50" fill="#10b0a0" opacity="0.7"/>
    <polygon points="90,-350 120,-50 60,-50" fill="#20c0b0" opacity="0.7"/>
    <polygon points="0,-430 65,-50 -65,-50" fill="none" stroke="#90ffec" stroke-width="2.5" opacity="0.55"/>
  </g>
  <g transform="translate(844, 1024)" filter="url(#crystal2)">
    <ellipse cx="0" cy="-30" rx="100" ry="40" fill="#00c0b0" opacity="0.25"/>
    <polygon points="0,-370 55,-50 -55,-50" fill="url(#cC2)"/>
    <polygon points="0,-370 55,-50 10,-190" fill="#b0fff0" opacity="0.35"/>
    <polygon points="-80,-290 -45,-50 -115,-50" fill="#18a898" opacity="0.7"/>
    <polygon points="80,-300 115,-50 45,-50" fill="#28b8a8" opacity="0.7"/>
    <polygon points="0,-370 55,-50 -55,-50" fill="none" stroke="#60ffd8" stroke-width="2" opacity="0.5"/>
  </g>
  <ellipse cx="512" cy="900" rx="520" ry="90" fill="#00c0b0" opacity="0.07"/>
</svg>`;
}

// ─── Variation 3: Disc large center, sun explosion, crystal flanks ────────────
function svgVariation3() {
  const rays24 = Array.from({length: 24}, (_, i) => {
    const angle = i * 15 + 7.5;
    const len = i % 3 === 0 ? 430 : i % 3 === 1 ? 320 : 240;
    const inner = 110;
    const rad = angle * Math.PI / 180;
    const x1 = Math.sin(rad) * inner, y1 = -Math.cos(rad) * inner;
    const x2 = Math.sin(rad) * len, y2 = -Math.cos(rad) * len;
    const w = i % 3 === 0 ? 4 : i % 3 === 1 ? 2.5 : 1.5;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffd050" stroke-width="${w}" stroke-linecap="round"/>`;
  }).join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg3" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0c3040"/>
      <stop offset="55%" stop-color="#08222f"/>
      <stop offset="100%" stop-color="#030e16"/>
    </radialGradient>
    <radialGradient id="sun3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8e0"/>
      <stop offset="30%" stop-color="#ffd050" stop-opacity="0.8"/>
      <stop offset="65%" stop-color="#ff8800" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ff4400" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disc3" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="30%" stop-color="#fff0a0"/>
      <stop offset="65%" stop-color="#e0b040"/>
      <stop offset="100%" stop-color="#b08020"/>
    </radialGradient>
    <radialGradient id="discHalo3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8c0" stop-opacity="1"/>
      <stop offset="50%" stop-color="#ffb020" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ff6600" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cL3" x1="30%" y1="0%" x2="70%" y2="100%">
      <stop offset="0%" stop-color="#b0ffee"/>
      <stop offset="35%" stop-color="#30d0b8"/>
      <stop offset="100%" stop-color="#005848"/>
    </linearGradient>
    <linearGradient id="cR3" x1="70%" y1="0%" x2="30%" y2="100%">
      <stop offset="0%" stop-color="#90ffe8"/>
      <stop offset="35%" stop-color="#20b8a8"/>
      <stop offset="100%" stop-color="#004840"/>
    </linearGradient>
    <filter id="bigGlow3" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="25" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softGlow3" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="crystalF3" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg3)"/>
  <ellipse cx="200" cy="1024" rx="220" ry="120" fill="#061418" opacity="0.8"/>
  <ellipse cx="500" cy="1020" rx="260" ry="100" fill="#051218" opacity="0.7"/>
  <ellipse cx="830" cy="1024" rx="220" ry="110" fill="#061418" opacity="0.8"/>
  <g transform="translate(512, 512)">
    <circle r="380" fill="url(#sun3)" opacity="0.6"/>
    <g opacity="0.75">${rays24}</g>
  </g>
  <g transform="translate(105, 760)" filter="url(#crystalF3)">
    <ellipse cx="0" cy="30" rx="90" ry="40" fill="#00c8b8" opacity="0.3"/>
    <polygon points="0,-450 70,100 -70,100" fill="url(#cL3)"/>
    <polygon points="0,-450 70,100 20,-150" fill="#d0fff8" opacity="0.4"/>
    <polygon points="0,-450 -70,100 -20,-150" fill="#003840" opacity="0.35"/>
    <polygon points="0,-450 70,100 -70,100" fill="none" stroke="#80ffe8" stroke-width="2.5" opacity="0.6"/>
    <polygon points="-75,-300 -40,100 -110,100" fill="#28b8a8" opacity="0.75"/>
    <polygon points="75,-280 110,100 40,100" fill="#38c8b8" opacity="0.75"/>
  </g>
  <g transform="translate(919, 760)" filter="url(#crystalF3)">
    <ellipse cx="0" cy="30" rx="90" ry="40" fill="#00c8b8" opacity="0.3"/>
    <polygon points="0,-440 70,100 -70,100" fill="url(#cR3)"/>
    <polygon points="0,-440 70,100 20,-140" fill="#c0fff0" opacity="0.4"/>
    <polygon points="0,-440 -70,100 -20,-140" fill="#003040" opacity="0.35"/>
    <polygon points="0,-440 70,100 -70,100" fill="none" stroke="#60ffd0" stroke-width="2.5" opacity="0.6"/>
    <polygon points="-75,-290 -40,100 -110,100" fill="#18a898" opacity="0.75"/>
    <polygon points="75,-270 110,100 40,100" fill="#28b8a8" opacity="0.75"/>
  </g>
  <g transform="translate(512, 490)">
    <ellipse rx="280" ry="130" fill="url(#discHalo3)" transform="rotate(-30)" filter="url(#bigGlow3)" opacity="0.85"/>
    <ellipse rx="245" ry="105" fill="url(#disc3)" transform="rotate(-30)" filter="url(#softGlow3)"/>
    <ellipse rx="115" ry="50" fill="#fffff8" transform="rotate(-30)" opacity="0.88"/>
    <ellipse rx="245" ry="105" fill="none" stroke="#ffffff" stroke-width="4" transform="rotate(-30)" opacity="0.6"/>
    <ellipse rx="175" ry="75" fill="none" stroke="#ffe08050" stroke-width="2" transform="rotate(-30)"/>
    <ellipse cx="-80" cy="-38" rx="40" ry="16" fill="#ffffff" transform="rotate(-30, -80, -38)" opacity="0.5"/>
    <ellipse cx="-60" cy="-28" rx="15" ry="6" fill="#ffffff" transform="rotate(-30, -60, -28)" opacity="0.7"/>
  </g>
  <g fill="#a0ffe8" opacity="0.45">
    <circle cx="180" cy="200" r="3"/>
    <circle cx="280" cy="150" r="2"/>
    <circle cx="750" cy="180" r="3"/>
    <circle cx="860" cy="250" r="2"/>
    <circle cx="140" cy="500" r="2.5"/>
    <circle cx="920" cy="480" r="2"/>
  </g>
</svg>`;
}

// ─── Variation 4: Crystal launch pad, disc ascending toward sun ───────────────
function svgVariation4() {
  const rays32 = Array.from({length: 32}, (_, i) => {
    const angle = i * 11.25;
    const len = i % 4 === 0 ? 500 : i % 2 === 0 ? 380 : 260;
    const inner = 85;
    const rad = angle * Math.PI / 180;
    const x1 = Math.sin(rad) * inner, y1 = -Math.cos(rad) * inner;
    const x2 = Math.sin(rad) * len, y2 = -Math.cos(rad) * len;
    const w = i % 4 === 0 ? 3.5 : i % 2 === 0 ? 2 : 1;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffc030" stroke-width="${w}" stroke-linecap="round"/>`;
  }).join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg4" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#040f16"/>
      <stop offset="40%" stop-color="#081e2a"/>
      <stop offset="75%" stop-color="#0a2838"/>
      <stop offset="100%" stop-color="#0d3448"/>
    </linearGradient>
    <radialGradient id="sun4" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbe8"/>
      <stop offset="20%" stop-color="#ffe858"/>
      <stop offset="50%" stop-color="#ff9900" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#ff4400" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disc4" cx="38%" cy="30%" r="62%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#fff4b0"/>
      <stop offset="70%" stop-color="#e8c048"/>
      <stop offset="100%" stop-color="#c09828"/>
    </radialGradient>
    <radialGradient id="discHalo4" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8d0" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="crystalBase4" cx="50%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#40ffd8" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#00a090" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="c1_4" x1="25%" y1="0%" x2="75%" y2="100%">
      <stop offset="0%" stop-color="#c0fff8"/>
      <stop offset="40%" stop-color="#38d0b8"/>
      <stop offset="100%" stop-color="#006858"/>
    </linearGradient>
    <linearGradient id="c2_4" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#a0ffe8"/>
      <stop offset="40%" stop-color="#28c0a8"/>
      <stop offset="100%" stop-color="#005848"/>
    </linearGradient>
    <linearGradient id="c3_4" x1="75%" y1="0%" x2="25%" y2="100%">
      <stop offset="0%" stop-color="#90ffd8"/>
      <stop offset="40%" stop-color="#20b098"/>
      <stop offset="100%" stop-color="#004840"/>
    </linearGradient>
    <linearGradient id="sparkTrail4" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#ffd860" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow4" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="20" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="crystalGlow4" x="-35%" y="-35%" width="170%" height="170%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="discSoft4" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg4)"/>
  <g transform="translate(512, -40)">
    <circle r="420" fill="url(#sun4)" opacity="0.55"/>
    <g opacity="0.8">${rays32}</g>
    <circle r="82" fill="#fff8e0"/>
    <circle r="62" fill="#ffffff"/>
  </g>
  <g transform="translate(512, 1024)">
    <ellipse cx="0" cy="-50" rx="480" ry="150" fill="url(#crystalBase4)" opacity="0.6"/>
    <g filter="url(#crystalGlow4)" opacity="0.65">
      <polygon transform="translate(-300,0)" points="0,-220 35,-50 -35,-50" fill="#186858"/>
      <polygon transform="translate(-220,0)" points="0,-260 40,-50 -40,-50" fill="#1a7868"/>
      <polygon transform="translate(220,0)" points="0,-240 38,-50 -38,-50" fill="#1a7060"/>
      <polygon transform="translate(300,0)" points="0,-210 34,-50 -34,-50" fill="#186050"/>
    </g>
    <g filter="url(#crystalGlow4)" opacity="0.85">
      <polygon transform="translate(-200,0)" points="0,-320 55,-50 -55,-50" fill="url(#c3_4)"/>
      <polygon transform="translate(-200,0)" points="0,-320 55,-50 10,-165" fill="#c0fff0" opacity="0.3"/>
      <polygon transform="translate(-200,0)" points="0,-320 55,-50 -55,-50" fill="none" stroke="#60ffd8" stroke-width="1.5" opacity="0.5"/>
      <polygon transform="translate(200,0)" points="0,-310 55,-50 -55,-50" fill="url(#c3_4)"/>
      <polygon transform="translate(200,0)" points="0,-310 55,-50 10,-160" fill="#b0ffee" opacity="0.3"/>
      <polygon transform="translate(200,0)" points="0,-310 55,-50 -55,-50" fill="none" stroke="#50ffcc" stroke-width="1.5" opacity="0.5"/>
    </g>
    <g filter="url(#crystalGlow4)">
      <polygon transform="translate(-120,0)" points="0,-420 70,-50 -70,-50" fill="url(#c1_4)"/>
      <polygon transform="translate(-120,0)" points="0,-420 70,-50 18,-210" fill="#d8fff8" opacity="0.4"/>
      <polygon transform="translate(-120,0)" points="0,-420 -70,-50 -18,-210" fill="#003840" opacity="0.3"/>
      <polygon transform="translate(-120,0)" points="0,-420 70,-50 -70,-50" fill="none" stroke="#90ffe8" stroke-width="2.5" opacity="0.55"/>
      <polygon transform="translate(0,0)" points="0,-480 80,-50 -80,-50" fill="url(#c2_4)"/>
      <polygon transform="translate(0,0)" points="0,-480 80,-50 20,-240" fill="#e0fff8" opacity="0.45"/>
      <polygon transform="translate(0,0)" points="0,-480 -80,-50 -20,-240" fill="#004040" opacity="0.3"/>
      <polygon transform="translate(0,0)" points="0,-480 80,-50 -80,-50" fill="none" stroke="#a0ffec" stroke-width="3" opacity="0.6"/>
      <polygon transform="translate(120,0)" points="0,-400 70,-50 -70,-50" fill="url(#c1_4)"/>
      <polygon transform="translate(120,0)" points="0,-400 70,-50 18,-200" fill="#c8fff0" opacity="0.4"/>
      <polygon transform="translate(120,0)" points="0,-400 -70,-50 -18,-200" fill="#003040" opacity="0.3"/>
      <polygon transform="translate(120,0)" points="0,-400 70,-50 -70,-50" fill="none" stroke="#80ffe0" stroke-width="2.5" opacity="0.55"/>
    </g>
    <ellipse cx="0" cy="-50" rx="420" ry="80" fill="#00d0c0" opacity="0.1"/>
  </g>
  <polygon points="480,760 512,700 544,760 530,900 494,900" fill="url(#sparkTrail4)" opacity="0.6"/>
  <line x1="512" y1="670" x2="512" y2="900" stroke="#ffffff" stroke-width="3" opacity="0.5"/>
  <g fill="#fffce0" opacity="0.8">
    <circle cx="512" cy="720" r="5"/>
    <circle cx="506" cy="750" r="3.5"/>
    <circle cx="518" cy="780" r="4"/>
    <circle cx="500" cy="810" r="3"/>
    <circle cx="524" cy="840" r="3.5"/>
    <circle cx="508" cy="690" r="4.5"/>
  </g>
  <g transform="translate(512, 620)">
    <ellipse rx="170" ry="72" fill="url(#discHalo4)" transform="rotate(-20)" filter="url(#glow4)" opacity="0.85"/>
    <ellipse rx="148" ry="63" fill="url(#disc4)" transform="rotate(-20)" filter="url(#discSoft4)"/>
    <ellipse rx="68" ry="29" fill="#fffff5" transform="rotate(-20)" opacity="0.9"/>
    <ellipse rx="148" ry="63" fill="none" stroke="#ffffff" stroke-width="3.5" transform="rotate(-20)" opacity="0.65"/>
    <ellipse rx="105" ry="45" fill="none" stroke="#ffe09050" stroke-width="1.5" transform="rotate(-20)"/>
    <ellipse cx="-48" cy="-22" rx="28" ry="11" fill="#ffffff" transform="rotate(-20, -48, -22)" opacity="0.52"/>
  </g>
  <g fill="#80ffd8" opacity="0.3">
    <circle cx="150" cy="200" r="2.5"/>
    <circle cx="350" cy="120" r="2"/>
    <circle cx="680" cy="150" r="2.5"/>
    <circle cx="880" cy="220" r="2"/>
    <circle cx="100" cy="420" r="1.5"/>
    <circle cx="940" cy="380" r="1.5"/>
  </g>
</svg>`;
}

async function generateVariation(svgFn, index, label) {
  process.stderr.write(`[${index}] Generating ${label}...\n`);

  const svgBuffer = Buffer.from(svgFn(), 'utf8');

  const pngBuffer = await sharp(svgBuffer, { density: 72 })
    .resize(1024, 1024, { fit: 'fill' })
    .flatten({ background: { r: 10, g: 42, b: 58 } })
    .png({ compressionLevel: 6 })
    .toBuffer();

  process.stderr.write(`[${index}] PNG generated (${Math.round(pngBuffer.length / 1024)}KB)\n`);

  const outPath = path.join(ICONS_DIR, `icon-v${index}.png`);
  fs.writeFileSync(outPath, pngBuffer);
  process.stderr.write(`[${index}] Saved: ${outPath}\n`);

  return { variation: index, label, path: outPath, size: pngBuffer.length };
}

async function main() {
  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

  const variations = [
    [svgVariation1, 1, 'Disc flying upper-right, crystals bottom, sun upper-right'],
    [svgVariation2, 2, 'Sun top-center, disc center, crystal row bottom'],
    [svgVariation3, 3, 'Disc large center, sun explosion, crystal flanks'],
    [svgVariation4, 4, 'Crystal launch pad, disc ascending toward sun'],
  ];

  const results = [];
  for (const [fn, idx, label] of variations) {
    try {
      const result = await generateVariation(fn, idx, label);
      results.push(result);
    } catch (err) {
      process.stderr.write(`[${idx}] FAILED: ${err.message}\n`);
      results.push({ variation: idx, label, error: err.message });
    }
  }

  process.stderr.write('Done! Files saved to resources/icons/\n');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  process.stderr.write('Fatal: ' + err.message + '\n');
  process.exit(1);
});
