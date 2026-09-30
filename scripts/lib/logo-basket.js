// scripts/lib/logo-basket.js — the logo's basket, as one shared path.
//
// Every basket the brand draws comes from here, so a basket on a Reddit banner
// and a basket on a training card are the same object by construction and
// cannot drift apart. Duplicating the geometry into each generator is exactly
// how "all baskets should follow the logo" quietly stops being true.
//
// Geometry was read from web/img/logo-mark.png's pixels rather than eyeballed
// (256x256 source): the top band spans x 54-212 over y 13-40, four chain bars
// splay from centres 75.5/114.5/152/191 at the top to 84/117.5/149.5/182.5 at
// the bottom, the tray is a trapezoid 51-215 narrowing to 58-208 over y 157-185,
// and the post runs y 185-241 tapering 126-141 to 129-138.

// web/styles/tokens.css
const INK = '#202020';
const ORANGE = '#fc6414';
const GREEN = '#2e7d57';
const PEACH = '#f7f4ef';   // the logo's basket white

/**
 * The logo's basket. `s` scales the 256-unit source; (x, y) is its top-left.
 * Returns SVG fragments, so it composes into any document.
 */
function basket(x, y, s, fill = PEACH) {
  const u = (n) => n * s;
  const bars = [[75.5, 84], [114.5, 117.5], [152, 149.5], [191, 182.5]];
  const bw = 8;
  return [
    `<rect x="${x + u(54)}" y="${y + u(13)}" width="${u(158)}" height="${u(27)}"
       rx="${u(13)}" fill="${fill}"/>`,
    ...bars.map(([t, b]) =>
      `<path d="M${x + u(t - bw / 2)} ${y + u(40)} L${x + u(t + bw / 2)} ${y + u(40)}
                L${x + u(b + bw / 2)} ${y + u(157)} L${x + u(b - bw / 2)} ${y + u(157)} Z"
         fill="${fill}"/>`),
    `<path d="M${x + u(51)} ${y + u(157)} L${x + u(215)} ${y + u(157)}
              L${x + u(208)} ${y + u(185)} L${x + u(58)} ${y + u(185)} Z" fill="${fill}"/>`,
    `<path d="M${x + u(126)} ${y + u(185)} L${x + u(141)} ${y + u(185)}
              L${x + u(138)} ${y + u(241)} L${x + u(129)} ${y + u(241)} Z" fill="${fill}"/>`,
  ].join('');
}

/** A disc, always flat — on the ground, in flight, or as a mark. Never held. */
const disc = (cx, cy, rx, fill = ORANGE, ry = rx * 0.34) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;

/** The basket's full height and width in drawn units, for layout maths. */
const BASKET_H = 241, BASKET_W = 256;

module.exports = { basket, disc, INK, ORANGE, GREEN, PEACH, BASKET_H, BASKET_W };
