// src/modules/game/game.season.ts — where the Throw Lab record starts counting.
//
// The flight model was rewritten on 2026-10-05, and it changed what a score
// means. Measured over 4,000 simulated 18-hole rounds, the old model had a
// beginner at -14.8 and a perfect player at -21.4 -- six strokes apart, with
// 80% of holes birdied and one in eight aced. Under the new one those numbers
// are nothing like each other.
//
// So the old rounds are not comparable to the new ones, and a leaderboard that
// mixes them is not a leaderboard: every record set before the change would
// stand unbeatable at the top of it. The rounds are kept -- nothing is deleted
// -- but the boards and the career record count from the season start.
//
// A new season is declared by moving this date. It takes no migration, which
// is deliberate: the cost of a season break should be one line.
export const GAME_SEASON = {
  key: 'S2',
  label: 'Season 2',
  /** First round that counts. Rounds before it are kept but not ranked. */
  startsAt: new Date('2026-10-05T00:00:00Z'),
  /** What the pages say when they explain a board that looks empty. */
  note: 'Season 2 began when the flight model was rebuilt. Earlier rounds are kept on your record but ranked separately.',
};

/** The later of a requested window and the season start — never earlier. */
export function seasonFloor(since: Date | null): Date {
  if (!since) return GAME_SEASON.startsAt;
  return since > GAME_SEASON.startsAt ? since : GAME_SEASON.startsAt;
}
