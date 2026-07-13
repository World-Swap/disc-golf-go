// src/modules/progression/events.ts — XP + gold award tables (generated from the
// legacy engine, then frozen). Amounts are the base values before any boost.

export const XP_EVENTS = {
  "checkin_new_course": 300,
  "checkin_return": 50,
  "daily_first_checkin": 50,
  "weekend_warrior": 100,
  "bad_weather": 150,
  "trailblazer_first": 500,
  "round_complete": 200,
  "challenge_easy": 150,
  "challenge_medium": 350,
  "challenge_hard": 750,
  "challenge_legendary": 1500,
  "battle_victory": 250,
  "battle_participation": 75,
  "battle_victory_daily": 250,
  "battle_victory_weekly": 500,
  "battle_victory_monthly": 1000,
  "battle_participation_daily": 75,
  "battle_participation_weekly": 150,
  "battle_participation_monthly": 300,
  "login_streak_3": 25,
  "login_streak_7": 50,
  "login_streak_14": 75,
  "login_streak_30": 100,
  "milestone_checkins_10": 200,
  "milestone_checkins_50": 750,
  "milestone_checkins_100": 2000,
  "milestone_checkins_250": 5000,
  "milestone_courses_5": 300,
  "milestone_courses_10": 500,
  "milestone_courses_25": 1500,
  "milestone_courses_50": 3500,
  "milestone_courses_100": 7500,
  "milestone_rounds_10": 500,
  "milestone_rounds_50": 2500,
  "milestone_state_champion": 5000
} as const;

export type XpEvent = keyof typeof XP_EVENTS;

export const GOLD_EVENTS = {
  "checkin_new_course": 25,
  "checkin_return": 10,
  "round_complete": 20,
  "round_complete_18": 35,
  "birdie": 5,
  "eagle": 15,
  "ace": 50,
  "battle_win_daily": 40,
  "battle_win_weekly": 75,
  "battle_win_monthly": 150,
  "battle_loss": 10,
  "challenge_daily": 15,
  "challenge_weekly": 40,
  "challenge_monthly": 100,
  "badge_unlock": 20,
  "level_up": 50,
  "state_champion_first": 200
} as const;

export type GoldEvent = keyof typeof GOLD_EVENTS;
