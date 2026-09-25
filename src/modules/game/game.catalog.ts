// src/modules/game/game.catalog.ts — the Throw Lab challenge catalog and the
// period maths behind it. Progress is never stored: every challenge reads its
// metric straight off game_rounds for the period, so a challenge can't drift
// out of step with the rounds a player actually threw.

export type Period = 'daily' | 'weekly' | 'monthly' | 'lifetime';

// Every metric is an aggregate over game_rounds.
export type Metric =
  | 'rounds'          // rounds finished
  | 'holes'           // holes played
  | 'birdies'         // holes under par
  | 'aces'            // holes in one
  | 'under_par'       // rounds finished under par
  | 'courses'         // distinct real courses played
  | 'best_round';     // best (lowest) vs-par in the period, scored as 1 when under target

export interface GameChallenge {
  key: string;
  period: Period;
  title: string;
  description: string;
  metric: Metric;
  target: number;
}

// Targets are set so a daily is one short session, a weekly is a few sessions,
// and a monthly is real commitment. Lifetime ones are the long chase.
export const GAME_CHALLENGES: GameChallenge[] = [
  // ── daily ────────────────────────────────────────────────────────────────
  { key: 'daily_rounds_3', period: 'daily', title: 'Warm Up', description: 'Finish 3 rounds today', metric: 'rounds', target: 3 },
  { key: 'daily_birdies_3', period: 'daily', title: 'Three Birdies', description: 'Make 3 birdies today', metric: 'birdies', target: 3 },
  { key: 'daily_under_par', period: 'daily', title: 'Beat Par', description: 'Finish a round under par', metric: 'under_par', target: 1 },

  // ── weekly ───────────────────────────────────────────────────────────────
  { key: 'weekly_rounds_15', period: 'weekly', title: 'Range Week', description: 'Finish 15 rounds this week', metric: 'rounds', target: 15 },
  { key: 'weekly_holes_90', period: 'weekly', title: 'Ninety Holes', description: 'Play 90 holes this week', metric: 'holes', target: 90 },
  { key: 'weekly_birdies_20', period: 'weekly', title: 'Birdie Hunter', description: 'Make 20 birdies this week', metric: 'birdies', target: 20 },
  { key: 'weekly_under_par_3', period: 'weekly', title: 'Under Pressure', description: 'Finish 3 rounds under par', metric: 'under_par', target: 3 },

  // ── monthly ──────────────────────────────────────────────────────────────
  { key: 'monthly_rounds_50', period: 'monthly', title: 'Grinder', description: 'Finish 50 rounds this month', metric: 'rounds', target: 50 },
  { key: 'monthly_courses_5', period: 'monthly', title: 'Road Trip', description: 'Play 5 different courses', metric: 'courses', target: 5 },
  { key: 'monthly_birdies_75', period: 'monthly', title: 'Birdie Machine', description: 'Make 75 birdies this month', metric: 'birdies', target: 75 },

  // ── lifetime ─────────────────────────────────────────────────────────────
  { key: 'life_rounds_100', period: 'lifetime', title: 'Centurion', description: 'Finish 100 rounds', metric: 'rounds', target: 100 },
  { key: 'life_birdies_250', period: 'lifetime', title: 'Two Fifty', description: 'Make 250 birdies', metric: 'birdies', target: 250 },
  { key: 'life_ace', period: 'lifetime', title: 'Hole In One', description: 'Throw an ace', metric: 'aces', target: 1 },
  { key: 'life_courses_25', period: 'lifetime', title: 'Course Tourer', description: 'Play 25 different courses', metric: 'courses', target: 25 },
];

// Rewards reuse the frozen XP/gold event tables rather than inventing a
// second economy: a daily pays like an easy challenge, a lifetime like a
// legendary one.
export const PERIOD_REWARD = {
  daily: { xp: 'challenge_easy', gold: 'challenge_daily' },
  weekly: { xp: 'challenge_medium', gold: 'challenge_weekly' },
  monthly: { xp: 'challenge_hard', gold: 'challenge_monthly' },
  lifetime: { xp: 'challenge_legendary', gold: 'challenge_lifetime' },
} as const;

/**
 * The key identifying the current window of a period. Lifetime never rolls
 * over, so it is a constant; the rest are derived from the date in UTC, which
 * is the same clock the scheduled jobs already run on.
 */
export function periodKey(period: Period, now: Date = new Date()): string {
  if (period === 'lifetime') return 'all';
  const y = now.getUTCFullYear();
  if (period === 'monthly') return `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (period === 'daily') return now.toISOString().slice(0, 10);
  return `${isoWeekYear(now)}-W${String(isoWeek(now)).padStart(2, '0')}`;
}

/** Start of the current window, used to filter game_rounds. */
export function periodStart(period: Period, now: Date = new Date()): Date | null {
  if (period === 'lifetime') return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'daily') return d;
  if (period === 'monthly') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Weeks start Monday, matching the ISO week in periodKey.
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

// ISO-8601 week number: week 1 is the one containing the first Thursday.
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7) - 3 + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d.getTime() - jan4.getTime();
  return 1 + Math.round(diff / 604800000 - ((jan4.getUTCDay() + 6) % 7) / 7);
}

// The year the ISO week belongs to, which can differ from the calendar year
// at the turn of January.
function isoWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  return d.getUTCFullYear();
}
