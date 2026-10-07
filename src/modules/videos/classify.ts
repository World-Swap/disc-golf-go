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
 * Phrases that NAME a category. Weighted: a phrase that can only mean one
 * thing scores 3, a word that usually means it scores 2, a weak hint scores 1.
 * A hint alone never clears MIN_SCORE, so it can only break a tie.
 */
const SIGNALS: Record<string, Array<[RegExp, number]>> = {
  putting: [
    // Split deliberately: "putting" and "putt" are separate signals, so a title
    // that uses BOTH scores twice. Repetition is a fair proxy for what a video
    // is actually about, and it is what separates "Putting Practice ... Three
    // Putt" (putting) from "Three Putting Drills For Field Work" (practice).
    // Note \bputt\b does NOT match inside "putting", which is what makes this work.
    [/\bputting\b/, 3], [/\bputt(s|er|ers)?\b/, 3], [/\bjump putt|straddle|turbo putt/, 3],
    [/\bcircle (1|one|2|two)\b/, 3], [/\bspin putt|push putt/, 3], [/\bmake more putts\b/, 3],
    [/\bc1x|comeback putt\b/, 2],
  ],
  driving: [
    [/\bdistance\b/, 2], [/\bdrive[rs]?\b|\bdriving\b/, 3], [/\bmax(imum)? distance\b/, 3],
    [/\breach ?back|x-?step|run ?up\b/, 3], [/\bfarther|further\b/, 2], [/\bpower\b/, 2],
  ],
  putting_guard: [],
  forehand: [
    [/\bforehand(s)?\b|\bsidearm\b|\bflick\b/, 3], [/\bthumber|tomahawk\b/, 2],
  ],
  approach: [
    [/\bapproach(es|ing)?\b/, 3], [/\bupshot(s)?\b/, 3], [/\bscramble|parked\b/, 2],
    [/\binside (the )?circle\b/, 2], [/\bmidrange(s)?\b/, 2],
  ],
  'disc-selection': [
    [/\bwhat disc|which disc|disc for\b/, 3], [/\bin the bag|bag breakdown\b/, 3],
    [/\bplastic|stability|overstable|understable\b/, 2], [/\bflight number(s)?\b/, 3],
    [/\bbeginner discs?\b/, 3],
  ],
  'course-strategy': [
    [/\bcourse management|course strategy\b/, 3], [/\bhole breakdown|shot selection\b/, 3],
    [/\bwhen to (go|lay)\b/, 2], [/\bplaying (in )?wind\b/, 2],
  ],
  'mental-game': [
    [/\bmental (game|approach)\b/, 3], [/\bnerves|pressure|confidence|focus\b/, 2],
    [/\broutine\b/, 1], [/\bchoking|tilt\b/, 2],
  ],
  'fitness-warmup': [
    [/\bwarm ?up\b/, 3], [/\bstretch(ing|es)?\b/, 3], [/\bmobility|flexibility\b/, 3],
    [/\bworkout|exercise|strength|injury\b/, 2],
  ],
  'rules-etiquette': [
    [/\brules?\b/, 2], [/\betiquette\b/, 3], [/\bpenalty|out of bounds|\bOB\b/, 2],
    [/\bcasual water|relief|drop zone\b/, 3],
  ],
  'tournament-competition': [
    [/\btournament(s)?\b/, 3], [/\bcompeting|competition\b/, 2], [/\bPDGA\b/, 2],
    [/\bleague\b/, 2], [/\bfirst tournament\b/, 3],
  ],
  practice: [
    [/\bdrill(s)?\b/, 3], [/\bpractice (routine|session|plan)\b/, 3],
    [/\bfield work\b/, 3], [/\bhow to practice\b/, 3],
  ],
  'form-technique': [
    [/\bform\b/, 2], [/\btechnique\b/, 2], [/\bgrip\b/, 3], [/\bfootwork\b/, 3],
    [/\bbackhand\b/, 2], [/\brelease|follow ?through|hip (rotation|turn)\b/, 2],
    [/\bnose angle|hyzer|anhyzer\b/, 2],
  ],
  'getting-started': [
    [/\bbeginner(s)?\b/, 2], [/\bnew to disc golf|first round|getting started\b/, 3],
    [/\bhow to (start|play) disc golf\b/, 3],
  ],
};

/** Below this, nothing is published. One weak hint must never be enough. */
export const MIN_SCORE = 3;

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
  if (GENERIC.has(best.categorySlug) && specific && specific.score >= MIN_SCORE) {
    return specific;
  }
  // A tie WITHIN a tier means the title names two categories equally well,
  // which is exactly where a guess files it wrongly. Refuse.
  if (tied.filter((t) => GENERIC.has(t) === GENERIC.has(best!.categorySlug)).length > 0) return null;
  return best;
}
