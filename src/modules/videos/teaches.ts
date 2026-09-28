// src/modules/videos/teaches.ts — does this upload teach something?
//
// The Lounge takes whatever the channels post. The training feed must not:
// a round of tournament coverage sitting under "New training videos" is a
// lie about what the app is for. Nothing in a YouTube feed says "this is a
// lesson", so the decision is made from the title, and the rule is written to
// be WRONG IN THE SAFE DIRECTION -- it would rather miss a real lesson than
// admit a vlog, because a miss is invisible and a false positive is not.
//
// Every pattern here was checked against real titles from the channels we
// actually pull; see teaches.test.ts, which pins both halves.

/** Coverage, vlogs, shopping and hype: never a lesson, whatever else matches. */
const NOT_TEACHING = [
  // Round coverage. "F9"/"B9" and round numbers are how every channel labels it.
  /\b(front|back)\s*9\b/i,
  /\b[FB]9\b/,
  /\bround\s*[1-9]\b/i,
  /\bR[1-4]\s*(F9|B9)?\b/,
  /\bpractice round\b/i,
  /\b(final|semi|quarter)\s*(round|final)\b/i,
  /\bhighlights?\b/i,
  /\b(mpo|fpo)\b/i,
  /\bpresented by\b/i,
  // Head-to-head entertainment.
  /\bvs\.?\b/i,
  /\bbattle\b/i,
  /\bchallenge\b/i,
  /\bwager\b/i,
  /\bbet\b/i,
  // Shopping and unboxing.
  /\b(unbox|in the bag|itb|restock|sale|giveaway|shop|store|merch|drop)\b/i,
  /\bdisc review\b/i,
  // Channel business, not coaching.
  /\b(vlog|podcast|ama|q\s*&\s*a|announcement|recap|interview|documentary)\b/i,
  /\bsubscriber\b/i,
  /\bcourse (tour|record|design|build|proposal)\b/i,
  /\bmy (new|home) course\b/i,
  /\bhistory lesson\b/i,
  // Product roundups. Disc selection IS taught in the library, but "the best
  // approach disc" is a shopping video, not a lesson. Narrow on purpose:
  // "How to Build The Perfect Disc Golf Bag" must survive.
  /\b(best|top \d+|worst) [\w\s'’]{0,18}\b(disc|driver|putter|midrange|mold)s?\b/i,
  /\b(i|we) (tested|tried|bought|own)\b/i,
  /\bfirst look\b/i,
  /\bwhich disc\b/i,
  /\b\d+ discs\b/i,
];

/**
 * Says outright that it teaches. Kept deliberately narrow -- a bare mention of
 * "putting" or "forehand" is a topic, not a lesson, and matching those alone
 * was what dragged an earlier keyword pass down to roughly half precision.
 */
const TEACHING = [
  /\bhow to\b/i,
  /\btutorial\b/i,
  /\b(lesson|masterclass|clinic|coaching)\b/i,
  /\bdrills?\b/i,
  /\btechnique\b/i,
  /\bfundamentals?\b/i,
  /\bmechanics\b/i,
  /\bform (check|breakdown|tips|guide|fix)\b/i,
  /\b(tips?|guide) (for|to|on)\b/i,
  /\b\d+\s+(tips|drills|ways|steps|keys|mistakes)\b/i,
  /\b(stop|avoid|fix(ing)?) (your |the )?\w+/i,
  /\b(improve|master|fixing) (your|the|my)\b/i,
  /\bteach(es|ing)? (you|me|us|him|her)\b/i,
  /\blearn (to|how)\b/i,
  /\bbeginner('s)? (guide|tips)\b/i,
  /\bthe key to\b/i,
  /\bwhy you\b/i,
  /\bmistakes?\b/i,
  /\bexplained\b/i,
  /\b(form|swing|throw|shot|technique|mechanic|putt|drive)\w*\s+breakdown\b/i,
  /\b(getting|get) \w+ every time\b/i,
  /\bsecrets?\b/i,
  /\bstep by step\b/i,
  // Shapes that teach without ever saying "how to" -- these were the whole of
  // the recall gap when the rule was first measured against real titles.
  /\b(your|you're|youre) [\w\s]{0,14}(killing|costing|hurting|ruining|holding)\b/i,
  /\bdeep dive\b/i,
  /\bform review\b/i,
  /\bmisunderstanding\b/i,
  /\bstrategy for\b/i,
  /\byou must\b/i,
  /\bwhy \w+ (creates|makes|causes|means|works|matters)\b/i,
  // Named parts of the throw. A title naming one of these is talking about
  // mechanics; the disqualifiers above already remove the shopping videos.
  /\b(nose angle|power pocket|counter ?rotation|footwork|coil|follow[- ]through|reach ?back|weight shift|hyzer flip|swoop|rounding|off[- ]?axis)\b/i,
];

/** True only when the title says it teaches and says nothing disqualifying. */
export function teaches(title: string): boolean {
  const t = String(title || '');
  if (!t.trim()) return false;
  if (NOT_TEACHING.some((re) => re.test(t))) return false;
  return TEACHING.some((re) => re.test(t));
}
