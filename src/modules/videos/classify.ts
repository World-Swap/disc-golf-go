// src/modules/videos/classify.ts — which training category does this video teach?
//
// This runs with NO HUMAN REVIEW: whatever it returns becomes a published
// lesson in the library the app is sold on. So the rule it follows is the one
// the 2026-09-29 audit arrived at the hard way, when lessons were found leading
// with a USGA ruling, two ball-golf mindset channels, and a schoolteacher
// posting wedge shots: **a plausible title is not evidence**.
//
// Two consequences, both deliberate:
//
//   1. It REFUSES rather than guesses. A video whose title does not clearly
//      name a category returns null and simply never becomes a lesson. Missing
//      a good video costs nothing; publishing a mis-filed one costs the
//      library's credibility, which is the product.
//   2. It only ever sees videos that already passed two earlier gates -- the
//      channel is on the trusted list, and `teaches.ts` judged the title to be
//      instruction rather than coverage. This is the third filter, not the
//      first.
//
// Scoring is "strongest signal wins, and only if it is strong enough", not
// "most keyword hits": a putting video that happens to say "drive" once should
// not land in Driving.

export interface Classification {
  categorySlug: string;
  /** What matched, so a wrong call can be diagnosed from the row itself. */
  matched: string[];
  score: number;
}

/**
 * Phrases that NAME a category, weighted by how certain they make it:
 *
 *   4 -- can only mean this category in disc golf ("putting", "forehand",
 *        "etiquette"). Naming the category once this plainly is enough to
 *        publish on its own, which is what keeps the library growing.
 *   3 -- strongly suggests it.
 *   2 -- usually means it, but appears in other categories' videos too.
 *   1 -- a weak hint. Never clears MIN_SCORE alone, so it can only break a tie.
 */
const SIGNALS: Record<string, Array<[RegExp, number]>> = {
  putting: [
    // Split deliberately: "putting" and "putt" are separate signals, so a title
    // that uses BOTH scores twice. Repetition is a fair proxy for what a video
    // is actually about, and it is what separates "Putting Practice ... Three
    // Putt" (putting) from "Three Putting Drills For Field Work" (practice).
    // Note \bputt\b does NOT match inside "putting", which is what makes this work.
    [/\bputting\b/, 4], [/\bputt(s)?\b/, 4],
    // A "putter" is a DISC, not the act of putting, so it is a far weaker signal:
    // "3 Ways to Drive with Putters" is a driving video. At putt-strength it was
    // filed under Putting, which is the kind of plausible-looking mistake the
    // 2026-09-29 audit was cleaning up.
    [/\bputter(s)?\b/, 2], [/\bjump putt\b|\bstraddle\b|\bturbo putt/, 3],
    [/\bcircle (1|one|2|two)\b/, 3], [/\bspin putt\b|\bpush putt/, 3], [/\bmake more putts\b/, 3],
    [/\bc1x\b|\bcomeback putt\b/, 2],
  ],
  driving: [
    [/\bdistance\b/, 2], [/\bdriving\b/, 4], [/\bdriver(s)?\b/, 3], [/\bdrive(s)?\b/, 2], [/\bmax(imum)? distance\b/, 3],
    [/\breach ?back\b|\bx-?step\b|\brun ?up\b/, 4], [/\bfarther\b|\bfurther\b/, 2], [/\bpower\b/, 2],
    // How the feed actually words "distance": by asking for it, or in feet.
    [/\bthrow(ing)? (it )?(far|farther|further)\b/, 4], [/\bthrow far\b/, 4],
    [/\b[1-9]\d{2} ?(ft|feet|foot)\b/, 3], [/\bmore power\b|\bpower pocket\b/, 3],
    [/\bcoil\b/, 3],
  ],
  putting_guard: [],
  forehand: [
    // Split for the same reason putting is: these are three names for one shot,
    // and a title using more than one of them is more certainly about it. As a
    // single alternation this maxed out at 3 and so could NEVER clear MIN_SCORE
    // -- the entire category was unreachable.
    [/\bforehand(s)?\b/, 4], [/\bsidearm\b/, 4], [/\bflick\b/, 3],
    [/\bthumber\b|\btomahawk\b/, 2],
  ],
  approach: [
    [/\bapproach(es|ing)?\b/, 4], [/\bupshot(s)?\b/, 4], [/\bscramble\b|\bparked\b/, 2],
    [/\binside (the )?circle\b/, 2], [/\bmidrange(s)?\b/, 2],
  ],
  'disc-selection': [
    [/\b(what|which|best) discs?\b/, 4], [/\bin the bag\b|\bbag breakdown\b/, 3],
    [/\bplastic\b|\bstability\b|\boverstable\b|\bunderstable\b/, 2], [/\bflight number(s)?\b/, 3],
    [/\bbeginner discs?\b/, 3],
  ],
  'course-strategy': [
    [/\bcourse management\b|\bcourse strategy\b/, 4], [/\bhole breakdown\b|\bshot selection\b/, 3],
    [/\bwhen to (go|lay)\b/, 2], [/\bplaying (in )?wind\b/, 2],
  ],
  'mental-game': [
    [/\bmental (game|approach)\b/, 4], [/\bnerves\b|\bpressure\b|\bconfidence\b|\bfocus\b/, 2],
    [/\broutine\b/, 1], [/\bchoking\b|\btilt\b/, 2],
  ],
  'fitness-warmup': [
    [/\bwarm ?up\b/, 4], [/\bstretch(ing|es)?\b/, 4], [/\bmobility\b|\bflexibility\b/, 3],
    [/\bworkout\b|\bexercise\b|\bstrength\b/, 2], [/\binjur(y|ies)\b/, 3],
    [/\belbow\b/, 2], [/\bwrist\b/, 2], [/\bshoulder\b/, 2],
  ],
  'rules-etiquette': [
    [/\brules?\b/, 2], [/\betiquette\b/, 4], [/\bpenalty\b|\bout of bounds\b|\bOB\b/, 2],
    [/\bcasual water\b|\brelief\b|\bdrop zone\b/, 3],
  ],
  'tournament-competition': [
    [/\btournament(s)?\b/, 4], [/\bcompeting\b|\bcompetition\b/, 2], [/\bPDGA\b/, 2],
    [/\bleague\b/, 2], [/\bfirst tournament\b/, 3],
  ],
  practice: [
    [/\bdrill(s)?\b/, 4], [/\bpractice (routine|session|plan)\b/, 3],
    [/\bfield work\b/, 4], [/\bhow to practice\b/, 3], [/\bpractice tips\b/, 4],
  ],
  'form-technique': [
    [/\bform\b/, 2], [/\btechnique\b/, 2], [/\bgrip\b/, 3], [/\bfootwork\b/, 4],
    [/\bbackhand\b/, 2], [/\brelease\b|\bfollow ?through\b|\bhip (rotation|turn)\b/, 2],
    [/\bnose angle\b|\bhyzer\b|\banhyzer\b/, 2],
    // Named faults. Each of these is a form error and nothing else, which is
    // why they score as a plain naming of the category.
    [/\brounding\b/, 4], [/\bplant foot\b/, 4], [/\bform breakdown\b/, 4],
    [/\bswoop\b/, 3], [/\bcounter ?rotation\b/, 3], [/\bhyzer flip\b/, 3],
    [/\bposture\b/, 2], [/\bpower pocket\b/, 2],
  ],
  'getting-started': [
    [/\bbeginner(s)?\b/, 2], [/\bnew to disc golf\b|\bfirst round\b|\bgetting started\b/, 3],
    [/\bhow to (start|play) disc golf\b/, 3],
  ],
};

/** Below this, nothing is published. One weak hint must never be enough. */
export const MIN_SCORE = 4;

/**
 * Categories that describe HOW TO THROW ANYTHING rather than a particular shot.
 *
 * They are kept at a lower tier because their vocabulary is shared: "grip" and
 * "release" appear in a forehand video, a putting video and a driving video
 * alike. Scored flat, "Forehand Basics: Grip and Release" lands in Form &
 * Technique on grip+release (5) over forehand (3), which is plainly wrong -- the
 * title says what it is about in its first word. So a specific shot category
 * wins whenever one cleared the bar, and these only take a video nothing
 * specific claimed.
 */
const GENERIC = new Set(['form-technique', 'getting-started']);

export function classifyVideo(title: string): Classification | null {
  const t = String(title || '').toLowerCase();
  if (!t.trim()) return null;

  let best: Classification | null = null;
  let specific: Classification | null = null;
  const tied: string[] = [];

  for (const [slug, signals] of Object.entries(SIGNALS)) {
    if (slug.endsWith('_guard')) continue;
    let score = 0;
    const matched: string[] = [];
    for (const [re, weight] of signals) {
      if (re.test(t)) { score += weight; matched.push(re.source); }
    }
    if (score === 0) continue;
    const cand: Classification = { categorySlug: slug, matched, score };
    if (!GENERIC.has(slug) && (!specific || score > specific.score)) specific = cand;
    if (!best || score > best.score) { best = cand; tied.length = 0; }
    else if (score === best.score) tied.push(slug);
  }

  if (!best || best.score < MIN_SCORE) return null;

  // A specific shot beats a generic how-to-throw category, whatever the raw
  // score says -- see GENERIC above.
  if (GENERIC.has(best.categorySlug) && specific) {
    // The specific one wins if it stands on its own.
    if (specific.score >= MIN_SCORE) return specific;
    // Otherwise REFUSE rather than fall back to the generic category. The title
    // named a specific shot ("Forehand Basics: Grip and Release"), so filing it
    // under Form & Technique is the one answer we already know is wrong -- and
    // with nobody reviewing, publishing nothing beats publishing that.
    return null;
  }
  // A tie WITHIN a tier means the title names two categories equally well,
  // which is exactly where a guess files it wrongly. Refuse.
  if (tied.filter((t) => GENERIC.has(t) === GENERIC.has(best!.categorySlug)).length > 0) return null;
  return best;
}
