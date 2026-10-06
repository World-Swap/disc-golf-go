// src/modules/training/assessment.ts — the short assessment that replaces
// "everyone starts at lesson one", and the mapping from an answer to content.
//
// WHY THIS EXISTS. The recommendation engine before this one was driven by XP
// tier and completion order: "Start here" → "Keep momentum going" → "Time for
// advanced content". That is a single rigid line through the library, so a
// player who drives 400ft but three-putts was sent to Grip Basics, and a player
// who has never thrown a forehand got the same path as one who throws it well.
//
// Two facts about the library shape everything below, and both were measured
// rather than assumed:
//
//   * Per-LESSON skill_level carries real signal — 46 beginner, 60 intermediate,
//     28 advanced across the 134.
//   * Per-CATEGORY skill_level carries NONE. All 13 categories are tagged
//     `all_levels`, so it cannot separate anything and is never read here.
//
// So the path is assembled at the lesson level. Everything in this file is pure
// data and pure functions: no database, no clock, no request. That is what lets
// the builder be tested over the real library without a server.

import { CATEGORIES, LESSONS, type SeedLesson } from '../../db/data/lessons';

/** The three levels a lesson is tagged with, in order. */
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** How close a tournament is, which is a different question from skill. */
export const TOURNAMENT_INTENT = ['none', 'curious', 'registered'] as const;
export type TournamentIntent = (typeof TOURNAMENT_INTENT)[number];

export interface AssessmentOption {
  value: string;
  label: string;
  /** Shown under the label. Kept to one line — this is a survey, not a page. */
  hint?: string;
  /** Category slugs this answer pulls toward. Empty for the skill question. */
  categories?: string[];
}
export interface AssessmentQuestion {
  key: 'skill' | 'goals' | 'weakness' | 'tournament';
  prompt: string;
  /** true = pick several. The two that shape the path most are multi-select. */
  multi: boolean;
  /** A multi question can be skipped; skill and tournament cannot. */
  optional: boolean;
  options: AssessmentOption[];
}

/**
 * Skill is asked in terms of what a player DOES, not what they would call
 * themselves. "Intermediate" means nothing consistent across two people;
 * "I can shape a shot on purpose" is checkable against your own last round.
 */
const SKILL: AssessmentQuestion = {
  key: 'skill',
  prompt: 'Where are you right now?',
  multi: false,
  optional: false,
  options: [
    { value: 'beginner', label: 'Just started', hint: 'A few rounds in, or none yet' },
    { value: 'intermediate', label: 'I play regularly', hint: 'I can throw a line I meant to throw' },
    { value: 'advanced', label: 'I shape shots on purpose', hint: 'Hyzer, anhyzer and flex, when the hole asks' },
  ],
};

/**
 * Goals are what a player WANTS. Weaknesses are what actually costs them
 * strokes, and the two are famously different — everyone wants more distance
 * and most people lose more strokes inside 100ft. Both are asked, and the
 * weakness is weighted harder, because that is the point of asking separately.
 */
const GOALS: AssessmentQuestion = {
  key: 'goals',
  prompt: 'What do you want to get better at?',
  multi: true,
  optional: true,
  options: [
    { value: 'distance', label: 'More distance', categories: ['driving', 'form-technique', 'fitness-warmup'] },
    { value: 'putting', label: 'Putting', categories: ['putting'] },
    { value: 'accuracy', label: 'Accuracy and approach', categories: ['approach', 'course-strategy'] },
    { value: 'forehand', label: 'A forehand I trust', categories: ['forehand'] },
    { value: 'discs', label: 'Knowing what to throw', categories: ['disc-selection'] },
    { value: 'scoring', label: 'Lower scores, not longer drives', categories: ['course-strategy', 'approach', 'putting'] },
    { value: 'headspace', label: 'Staying composed', categories: ['mental-game'] },
    { value: 'fitness', label: 'Fitness and not getting hurt', categories: ['fitness-warmup'] },
  ],
};

/**
 * Weaknesses are phrased as things that happen on a course, because a player
 * can recognise those without knowing the vocabulary. "I lose it right" is
 * answerable; "inconsistent release angle" is not.
 */
const WEAKNESS: AssessmentQuestion = {
  key: 'weakness',
  prompt: 'Where do the strokes actually go?',
  multi: true,
  optional: true,
  options: [
    { value: 'three_putts', label: 'I miss putts I should make', categories: ['putting', 'practice'] },
    { value: 'off_the_tee', label: 'My drives get me in trouble', categories: ['driving', 'form-technique'] },
    { value: 'scramble', label: "I can't recover from a bad lie", categories: ['approach', 'course-strategy'] },
    { value: 'one_shot_shape', label: 'I only have one shot shape', categories: ['forehand', 'form-technique', 'practice'] },
    { value: 'wind', label: 'Wind takes me apart', categories: ['course-strategy', 'disc-selection'] },
    { value: 'blow_up', label: 'One bad hole becomes four', categories: ['mental-game'] },
    { value: 'wrong_disc', label: 'I throw the wrong disc', categories: ['disc-selection', 'course-strategy'] },
    { value: 'late_rounds', label: 'I fade late in a round', categories: ['fitness-warmup', 'mental-game'] },
  ],
};

/**
 * Asked plainly, because the answer changes the whole path rather than nudging
 * it: a player with a date in the diary gets a paced plan, and everyone else
 * should not be shown competition content they did not ask for.
 */
const TOURNAMENT: AssessmentQuestion = {
  key: 'tournament',
  prompt: 'Playing an event?',
  multi: false,
  optional: false,
  options: [
    { value: 'registered', label: "Yes — I'm signed up", hint: 'Get me ready for it' },
    { value: 'curious', label: 'Thinking about it', hint: 'Show me what one is like' },
    { value: 'none', label: 'Not for me', hint: 'Just here to get better' },
  ],
};

export const ASSESSMENT: AssessmentQuestion[] = [SKILL, GOALS, WEAKNESS, TOURNAMENT];

/** Categories that only matter once someone is actually competing. */
export const TOURNAMENT_CATEGORIES = ['tournament-competition', 'rules-etiquette', 'mental-game'];

// ── answers ────────────────────────────────────────────────────────────────

export interface Answers {
  skill: SkillLevel;
  goals: string[];
  weakness: string[];
  tournament: TournamentIntent;
}

const optionValues = (q: AssessmentQuestion) => new Set(q.options.map((o) => o.value));

/**
 * Validate against the catalogue rather than trusting the request. The same
 * rule the leaderboard metrics follow: a submitted string only ever SELECTS a
 * known option, and anything unrecognised is dropped rather than carried.
 * Returns null when a required answer is missing or unknown.
 */
export function parseAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;

  const skill = String(body.skill ?? '');
  if (!optionValues(SKILL).has(skill)) return null;

  const tournament = String(body.tournament ?? '');
  if (!optionValues(TOURNAMENT).has(tournament)) return null;

  const pick = (q: AssessmentQuestion, v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const allowed = optionValues(q);
    // de-duplicated, catalogue-checked, and capped so a crafted body cannot
    // hand the builder a list longer than the question has options
    return [...new Set(v.map(String).filter((s) => allowed.has(s)))].slice(0, q.options.length);
  };

  return {
    skill: skill as SkillLevel,
    goals: pick(GOALS, body.goals),
    weakness: pick(WEAKNESS, body.weakness),
    tournament: tournament as TournamentIntent,
  };
}

// ── scoring ────────────────────────────────────────────────────────────────

/** A weakness outranks a goal: it is where the strokes are actually going. */
const WEAKNESS_WEIGHT = 3;
const GOAL_WEIGHT = 2;
/** Every category keeps a floor so nothing is ever unreachable from the path. */
const BASE_WEIGHT = 0.1;

const CATEGORY_SLUGS = new Set(CATEGORIES.map((c) => c.slug));
const optionsFor = (q: AssessmentQuestion, values: string[]) =>
  q.options.filter((o) => values.includes(o.value));

/**
 * Turn answers into a weight per category slug. Pure, so the whole mapping can
 * be asserted over the real library in a test.
 */
export function categoryWeights(a: Answers): Map<string, number> {
  const w = new Map<string, number>();
  for (const slug of CATEGORY_SLUGS) w.set(slug, BASE_WEIGHT);
  const add = (slugs: string[] | undefined, amount: number) => {
    for (const slug of slugs ?? []) {
      // a mapping typo must not invent a category
      if (w.has(slug)) w.set(slug, w.get(slug)! + amount);
    }
  };

  for (const o of optionsFor(WEAKNESS, a.weakness)) add(o.categories, WEAKNESS_WEIGHT);
  for (const o of optionsFor(GOALS, a.goals)) add(o.categories, GOAL_WEIGHT);

  // A player who has never played needs the ground floor regardless of what
  // they picked, and one who shapes shots on purpose does not.
  if (a.skill === 'beginner') add(['getting-started'], GOAL_WEIGHT);
  if (a.skill === 'advanced') w.set('getting-started', BASE_WEIGHT);

  // Competition content is opt-in. Weighting it for everyone would push
  // tournament lessons at players who said plainly they are not interested.
  if (a.tournament === 'registered') add(TOURNAMENT_CATEGORIES, WEAKNESS_WEIGHT);
  else if (a.tournament === 'curious') add(TOURNAMENT_CATEGORIES, GOAL_WEIGHT / 2);

  return w;
}

/**
 * Which lesson levels a player should see. Deliberately overlapping: a level is
 * a tag on a lesson, not a wall, and the level below is where the fundamentals
 * that fix a weakness usually live.
 */
export function levelsFor(skill: SkillLevel): SkillLevel[] {
  if (skill === 'beginner') return ['beginner', 'intermediate'];
  if (skill === 'intermediate') return ['intermediate', 'beginner', 'advanced'];
  return ['advanced', 'intermediate'];
}

/** Rank within levelsFor(): earlier is a better fit. */
export function levelRank(skill: SkillLevel, lessonLevel: string): number {
  const order = levelsFor(skill);
  const i = order.indexOf(lessonLevel as SkillLevel);
  return i === -1 ? order.length : i;
}

export const lessonsByCategory = (): Map<string, SeedLesson[]> => {
  const m = new Map<string, SeedLesson[]>();
  for (const l of LESSONS) {
    if (!m.has(l.category_slug)) m.set(l.category_slug, []);
    m.get(l.category_slug)!.push(l);
  }
  return m;
};
