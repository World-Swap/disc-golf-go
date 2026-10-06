// src/modules/training/path.ts — turn an assessment into an ordered run of
// lessons, and (when a player is actually playing an event) a paced plan that
// counts down to it.
//
// Pure: library in, path out. No database, no request, and the clock is passed
// rather than read, so a dated plan can be tested at any distance from an event
// instead of only on the day the test happens to run.

import { LESSONS, CATEGORIES, type SeedLesson } from '../../db/data/lessons';
import {
  type Answers,
  type SkillLevel,
  TOURNAMENT_CATEGORIES,
  categoryWeights,
  levelRank,
} from './assessment';

export interface PathLesson {
  slug: string;
  title: string;
  category_slug: string;
  category_name: string;
  category_icon: string;
  skill_level: string;
  xp_reward: number;
  /** Why THIS lesson is in THIS player's path, in their own terms. */
  reason: string;
}
export interface PathWeek {
  /** 1-based. Week 1 is the one starting now. */
  week: number;
  label: string;
  lessons: PathLesson[];
}
export interface TrainingPath {
  lessons: PathLesson[];
  /** Present only when the player said they are playing an event. */
  tournament: { event: string; days_away: number; weeks: PathWeek[] } | null;
  /** The categories that drove this path, strongest first — shown as chips. */
  focus: { slug: string; name: string }[];
}

/** How many lessons a path leads with. Long enough to be a plan, short enough to start. */
const PATH_LENGTH = 8;
/**
 * No more than this from one category. Without it a single strong answer floods
 * the path — "I miss putts" returns ten putting lessons and the player's other
 * stated weakness never appears at all.
 */
const MAX_PER_CATEGORY = 3;

const CATEGORY_NAME = new Map(CATEGORIES.map((c) => [c.slug, c.name]));
/* The category's own glyph, so a path row says what KIND of lesson it is at a
   glance. Without it every row carried the same generic mark, which on a list
   of eight read as eight play buttons rather than eight different lessons. */
const CATEGORY_ICON = new Map(CATEGORIES.map((c) => [c.slug, c.icon]));

/** Why a lesson is here, phrased from the answer that pulled it in. */
const REASON: Record<string, string> = {
  putting: 'You said putts are costing you strokes',
  driving: 'You want more off the tee',
  'form-technique': 'The mechanics behind the shot you asked about',
  approach: 'Where most strokes are actually lost',
  'course-strategy': 'Playing the hole, not just the throw',
  forehand: 'The second shot shape you asked for',
  'disc-selection': 'Knowing what to throw, and when',
  'mental-game': 'Keeping one bad hole from becoming four',
  'fitness-warmup': 'So the last six holes feel like the first six',
  practice: 'Reps that actually transfer to a round',
  'getting-started': 'The ground floor, so nothing later is guesswork',
  'tournament-competition': "What a tournament round asks that a casual one doesn't",
  'rules-etiquette': "The rules you'll be held to on a card",
};
const reasonFor = (slug: string) => REASON[slug] ?? 'Picked for what you told us';

interface ScoredLesson {
  lesson: SeedLesson;
  score: number;
}

/**
 * Score every lesson the player has not done. Category weight is the signal;
 * level fit is a tiebreak within a category, so a strongly-weighted category
 * still wins over a perfectly-levelled lesson in a category they did not ask
 * about. sort_order breaks the remaining ties so a path is stable rather than
 * reshuffling on every request.
 */
function scoreLessons(answers: Answers, done: Set<string>, pool: SeedLesson[]): ScoredLesson[] {
  const weights = categoryWeights(answers);
  return pool
    .filter((l) => !done.has(l.slug))
    .map((lesson) => {
      const weight = weights.get(lesson.category_slug) ?? 0;
      // rank 0 is the best fit; shrink the bonus so it cannot outrank a weight
      const fit = 1 / (1 + levelRank(answers.skill, lesson.skill_level));
      return { lesson, score: weight * 10 + fit };
    })
    .sort((a, b) => b.score - a.score || a.lesson.sort_order - b.lesson.sort_order);
}

/** Take the best lessons, capped per category so the path spans their answers. */
function takeSpread(scored: ScoredLesson[], limit: number, perCategory = MAX_PER_CATEGORY): SeedLesson[] {
  const taken: SeedLesson[] = [];
  const count = new Map<string, number>();
  for (const { lesson } of scored) {
    if (taken.length >= limit) break;
    const n = count.get(lesson.category_slug) ?? 0;
    if (n >= perCategory) continue;
    count.set(lesson.category_slug, n + 1);
    taken.push(lesson);
  }
  // The cap can starve a path when a player's answers are narrow and they have
  // already done most of those lessons. Top up ignoring the cap rather than
  // returning a short path: a path with fewer lessons than asked for reads as
  // the app having nothing left to teach.
  if (taken.length < limit) {
    const have = new Set(taken.map((l) => l.slug));
    for (const { lesson } of scored) {
      if (taken.length >= limit) break;
      if (!have.has(lesson.slug)) taken.push(lesson);
    }
  }
  return taken;
}

const toPathLesson = (l: SeedLesson): PathLesson => ({
  slug: l.slug,
  title: l.title,
  category_slug: l.category_slug,
  category_name: CATEGORY_NAME.get(l.category_slug) ?? l.category_slug,
  category_icon: CATEGORY_ICON.get(l.category_slug) ?? '▸',
  skill_level: l.skill_level,
  xp_reward: l.xp_reward,
  reason: reasonFor(l.category_slug),
});

/** Milliseconds in a day, for the countdown. */
const DAY = 86_400_000;

/**
 * Pace the tournament lessons across the weeks before an event, so a player
 * with ten weeks gets a plan rather than a reading list. Capped at four weeks
 * of content: beyond that the weeks thin out into one lesson each, which reads
 * as filler rather than a plan.
 */
function tournamentPlan(
  answers: Answers,
  done: Set<string>,
  event: { name: string; startsAt: Date } | null,
  now: Date
): TrainingPath['tournament'] {
  if (answers.tournament !== 'registered' || !event) return null;

  // round, not ceil: a person counting calendar days from 6 Oct to 12 Dec says
  // 67, and ceil on 67.14 says 68. An event hours away still reads as 0 days.
  const daysAway = Math.max(0, Math.round((event.startsAt.getTime() - now.getTime()) / DAY));
  const pool = LESSONS.filter((l) => TOURNAMENT_CATEGORIES.includes(l.category_slug));
  const picked = takeSpread(scoreLessons(answers, done, pool), 8, 4);
  if (!picked.length) return null;

  const weeksAvailable = Math.max(1, Math.min(4, Math.ceil(daysAway / 7)));
  const perWeek = Math.ceil(picked.length / weeksAvailable);
  const weeks: PathWeek[] = [];
  for (let i = 0; i < weeksAvailable; i++) {
    const slice = picked.slice(i * perWeek, (i + 1) * perWeek);
    if (!slice.length) continue;
    weeks.push({
      week: i + 1,
      // The last week before an event is not for new material.
      label: i === weeksAvailable - 1 && weeksAvailable > 1 ? 'Final week' : `Week ${i + 1}`,
      lessons: slice.map(toPathLesson),
    });
  }
  return { event: event.name, days_away: daysAway, weeks };
}

/**
 * The whole path. `completed` is the set of lesson slugs the player has already
 * finished — they are never shown again, which is what keeps a retake from
 * handing someone the lessons they just did.
 */
export function buildPath(
  answers: Answers,
  completed: Iterable<string> = [],
  opts: { event?: { name: string; startsAt: Date } | null; now?: Date } = {}
): TrainingPath {
  const done = new Set(completed);
  const now = opts.now ?? new Date();

  const scored = scoreLessons(answers, done, LESSONS);
  const lessons = takeSpread(scored, PATH_LENGTH).map(toPathLesson);

  // The chips under the heading: what this player's answers actually asked for,
  // strongest first, and only the ones that beat the floor.
  const weights = categoryWeights(answers);
  const focus = [...weights.entries()]
    .filter(([, w]) => w > 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([slug]) => ({ slug, name: CATEGORY_NAME.get(slug) ?? slug }));

  return {
    lessons,
    tournament: tournamentPlan(answers, done, opts.event ?? null, now),
    focus,
  };
}

/**
 * The path for a player who has not taken the assessment. Deliberately the same
 * builder rather than a second code path, so the page never has two shapes to
 * render — a beginner with no stated goals is just the least-informed answer.
 */
export const DEFAULT_ANSWERS: Answers = {
  skill: 'beginner',
  goals: [],
  weakness: [],
  tournament: 'none',
};

export type { Answers, SkillLevel };
