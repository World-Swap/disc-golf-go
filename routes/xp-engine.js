/**
 * XP Engine — Disc Golf Go
 * Central module for all XP values, level math, badge definitions, and badge evaluation.
 */

// ──────────────────────────────────────────────
// LEVELING CURVE
// Formula: TOTAL_XP_FOR_LEVEL(n) = 125 * n * (n - 1)
//   Level 1:  0 XP total
//   Level 2:  250 XP total
//   Level 3:  750 XP total
//   Level 4:  1,500 XP total
//   Level 5:  2,500 XP total
//   Level 10: 11,250 XP total
//   Level 20: 47,500 XP total
//   Level 30: 108,750 XP total
//   Level 50: 306,250 XP total
// ──────────────────────────────────────────────

function totalXpForLevel(n) {
  if (n <= 1) return 0;
  return 125 * n * (n - 1);
}

function getLevelFromXp(xp) {
  // Binary search for level
  let low = 1, high = 500;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (totalXpForLevel(mid) <= xp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

function getLevelProgress(xp) {
  const level = getLevelFromXp(xp);
  const currentLevelXp = totalXpForLevel(level);
  const nextLevelXp = totalXpForLevel(level + 1);
  const progress = xp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  return {
    level,
    progress,
    needed,
    percent: Math.min(100, Math.round((progress / needed) * 100))
  };
}

// ──────────────────────────────────────────────
// LEVEL TITLES
// ──────────────────────────────────────────────
const LEVEL_TITLES = [
  { minLevel: 1,  maxLevel: 4,  title: 'Rookie',        icon: '🥏' },
  { minLevel: 5,  maxLevel: 9,  title: 'Amateur',       icon: '⛳' },
  { minLevel: 10, maxLevel: 14, title: 'Intermediate',  icon: '🎯' },
  { minLevel: 15, maxLevel: 24, title: 'Advanced',      icon: '🏅' },
  { minLevel: 25, maxLevel: 39, title: 'Pro',           icon: '🥇' },
  { minLevel: 40, maxLevel: 59, title: 'Legend',        icon: '👑' },
  { minLevel: 60, maxLevel: 999, title: 'GOAT',         icon: '🐐' },
];

function getLevelTitle(level) {
  return LEVEL_TITLES.find(t => level >= t.minLevel && level <= t.maxLevel) || LEVEL_TITLES[0];
}

// ──────────────────────────────────────────────
// XP EVENT VALUES
// ──────────────────────────────────────────────
const XP_EVENTS = {
  // Check-in events
  checkin_new_course:      300,
  checkin_return:           50,
  daily_first_checkin:      50,
  weekend_warrior:         100,
  bad_weather:             150,
  trailblazer_first:       500,   // First player ever at a course

  // Round events
  round_complete:          200,

  // Challenge completion (by difficulty)
  challenge_easy:          150,
  challenge_medium:        350,
  challenge_hard:          750,
  challenge_legendary:    1500,

  // Battle events (legacy single-submit)
  battle_victory:          250,
  battle_participation:     75,

  // Battle events — scaled by type
  battle_victory_daily:    250,
  battle_victory_weekly:   500,
  battle_victory_monthly: 1000,
  battle_participation_daily:   75,
  battle_participation_weekly: 150,
  battle_participation_monthly: 300,

  // Streak bonuses (per streak day bonus, capped)
  login_streak_3:           25,
  login_streak_7:           50,
  login_streak_14:          75,
  login_streak_30:         100,

  // Milestone bonuses
  milestone_checkins_10:   200,
  milestone_checkins_50:   750,
  milestone_checkins_100: 2000,
  milestone_checkins_250: 5000,
  milestone_courses_5:     300,
  milestone_courses_10:    500,
  milestone_courses_25:   1500,
  milestone_courses_50:   3500,
  milestone_courses_100:  7500,
  milestone_rounds_10:     500,
  milestone_rounds_50:    2500,

  // Exploration milestone bonuses
  milestone_courses_100:  7500,
  milestone_state_champion: 5000,  // First state completed
};

function getCheckinMilestone(checkinCount) {
  const milestones = [10, 50, 100, 250];
  for (const m of milestones) {
    if (checkinCount === m) return `milestone_checkins_${m}`;
  }
  return null;
}

function getCourseMilestone(uniqueCourses) {
  const milestones = [5, 10, 25, 50, 100];
  for (const m of milestones) {
    if (uniqueCourses === m) return `milestone_courses_${m}`;
  }
  return null;
}

function getStateMilestone(completedStates) {
  // Award XP the first time a player completes any state
  if (completedStates === 1) return 'milestone_state_champion';
  return null;
}

function getRoundMilestone(totalRounds) {
  const milestones = [10, 50];
  for (const m of milestones) {
    if (totalRounds === m) return `milestone_rounds_${m}`;
  }
  return null;
}

// ──────────────────────────────────────────────
// BADGE DEFINITIONS
// 15 categories × 5 tiers (bronze/silver/gold/platinum/diamond)
// ──────────────────────────────────────────────
const BADGE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

const BADGE_DEFINITIONS = {
  explorer: {
    name: 'Explorer',
    icon: '🗺️',
    description: 'Courses visited',
    tiers: {
      bronze:   { threshold: 1,   label: 'First Steps',       desc: 'Visit 1 course' },
      silver:   { threshold: 5,   label: 'Trail Blazer',      desc: 'Visit 5 courses' },
      gold:     { threshold: 10,  label: 'Course Hunter',     desc: 'Visit 10 courses' },
      platinum: { threshold: 25,  label: 'Road Warrior',      desc: 'Visit 25 courses' },
      diamond:  { threshold: 50,  label: 'Disc Nomad',        desc: 'Visit 50 courses' },
    },
    check: (stats) => stats.uniqueCourses,
  },

  course_conqueror: {
    name: 'Course Conqueror',
    icon: '🏆',
    description: 'Visit 100 courses',
    tiers: {
      bronze:   { threshold: 75,  label: 'Century Chaser',    desc: 'Visit 75 courses' },
      silver:   { threshold: 100, label: 'Course Conqueror',  desc: 'Visit 100 courses' },
      gold:     { threshold: 150, label: 'Disc Pilgrim',      desc: 'Visit 150 courses' },
      platinum: { threshold: 250, label: 'Course Legend',     desc: 'Visit 250 courses' },
      diamond:  { threshold: 500, label: 'Disc Atlas',        desc: 'Visit 500 courses' },
    },
    check: (stats) => stats.uniqueCourses,
  },

  state_champion: {
    name: 'State Champion',
    icon: '🏅',
    description: 'Complete every course in a state',
    tiers: {
      bronze:   { threshold: 1,  label: 'State Champion',    desc: 'Complete all courses in 1 state' },
      silver:   { threshold: 3,  label: 'Tri-State',         desc: 'Complete all courses in 3 states' },
      gold:     { threshold: 5,  label: 'Regional Master',   desc: 'Complete all courses in 5 states' },
      platinum: { threshold: 10, label: 'Coast to Coast',    desc: 'Complete all courses in 10 states' },
      diamond:  { threshold: 20, label: 'National Legend',   desc: 'Complete all courses in 20 states' },
    },
    check: (stats) => stats.completedStates || 0,
  },

  completionist: {
    name: 'Completionist',
    icon: '✅',
    description: 'Full rounds completed',
    tiers: {
      bronze:   { threshold: 1,   label: 'First Round',     desc: 'Complete 1 full round' },
      silver:   { threshold: 5,   label: 'Regular',         desc: 'Complete 5 full rounds' },
      gold:     { threshold: 25,  label: 'Dedicated',       desc: 'Complete 25 full rounds' },
      platinum: { threshold: 50,  label: 'Iron Disc',       desc: 'Complete 50 full rounds' },
      diamond:  { threshold: 100, label: 'Round Machine',   desc: 'Complete 100 full rounds' },
    },
    check: (stats) => stats.totalRounds,
  },

  challenger: {
    name: 'Challenger',
    icon: '⚔️',
    description: 'Challenges completed',
    tiers: {
      bronze:   { threshold: 1,  label: 'First Challenge',  desc: 'Complete 1 challenge' },
      silver:   { threshold: 5,  label: 'Task Master',      desc: 'Complete 5 challenges' },
      gold:     { threshold: 15, label: 'Quest Hunter',     desc: 'Complete 15 challenges' },
      platinum: { threshold: 30, label: 'Elite Challenger', desc: 'Complete 30 challenges' },
      diamond:  { threshold: 50, label: 'Legend Mode',      desc: 'Complete 50 challenges' },
    },
    check: (stats) => stats.challengesCompleted,
  },

  warrior: {
    name: 'Warrior',
    icon: '🏆',
    description: 'Battle victories',
    tiers: {
      bronze:   { threshold: 1,   label: 'Fighter',       desc: 'Win 1 battle' },
      silver:   { threshold: 10,  label: 'Competitor',    desc: 'Win 10 battles' },
      gold:     { threshold: 25,  label: 'Champion',      desc: 'Win 25 battles' },
      platinum: { threshold: 50,  label: 'Gladiator',     desc: 'Win 50 battles' },
      diamond:  { threshold: 100, label: 'Battle Lord',   desc: 'Win 100 battles' },
    },
    check: (stats) => stats.battleWins,
  },

  streak: {
    name: 'Streak',
    icon: '🔥',
    description: 'Consecutive days playing',
    tiers: {
      bronze:   { threshold: 3,  label: 'On a Roll',     desc: '3-day streak' },
      silver:   { threshold: 7,  label: 'Week Warrior',  desc: '7-day streak' },
      gold:     { threshold: 14, label: 'Fortnight',     desc: '14-day streak' },
      platinum: { threshold: 30, label: 'Month Strong',  desc: '30-day streak' },
      diamond:  { threshold: 60, label: 'Unbreakable',   desc: '60-day streak' },
    },
    check: (stats) => stats.bestStreak,
  },

  social: {
    name: 'Social',
    icon: '🤝',
    description: 'Unique players battled',
    tiers: {
      bronze:   { threshold: 1,  label: 'First Rival',   desc: 'Battle 1 player' },
      silver:   { threshold: 5,  label: 'Social Disc',   desc: 'Battle 5 players' },
      gold:     { threshold: 15, label: 'Disc Circle',   desc: 'Battle 15 players' },
      platinum: { threshold: 30, label: 'Known Name',    desc: 'Battle 30 players' },
      diamond:  { threshold: 50, label: 'Course Legend', desc: 'Battle 50 players' },
    },
    check: (stats) => stats.uniqueOpponents,
  },

  traveler: {
    name: 'Traveler',
    icon: '✈️',
    description: 'States played in',
    tiers: {
      bronze:   { threshold: 2,  label: 'Road Tripper',    desc: 'Play in 2 states' },
      silver:   { threshold: 5,  label: 'State Hopper',    desc: 'Play in 5 states' },
      gold:     { threshold: 10, label: 'Disc Drifter',    desc: 'Play in 10 states' },
      platinum: { threshold: 20, label: 'Coast to Coast',  desc: 'Play in 20 states' },
      diamond:  { threshold: 35, label: 'Disc Nomad',      desc: 'Play in 35 states' },
    },
    check: (stats) => stats.uniqueStates,
  },

  local_legend: {
    name: 'Local Legend',
    icon: '📍',
    description: 'Repeat visits to same course',
    tiers: {
      bronze:   { threshold: 5,   label: 'Regular',       desc: '5 visits to one course' },
      silver:   { threshold: 10,  label: 'Home Base',     desc: '10 visits to one course' },
      gold:     { threshold: 25,  label: 'Local Fav',     desc: '25 visits to one course' },
      platinum: { threshold: 50,  label: 'Course Keeper', desc: '50 visits to one course' },
      diamond:  { threshold: 100, label: 'Immortal',      desc: '100 visits to one course' },
    },
    check: (stats) => stats.maxSameCourseVisits,
  },

  weekend_warrior: {
    name: 'Weekend Warrior',
    icon: '🎉',
    description: 'Weekend rounds played',
    tiers: {
      bronze:   { threshold: 5,   label: 'Weekend Starter', desc: '5 weekend rounds' },
      silver:   { threshold: 15,  label: 'TGIF',            desc: '15 weekend rounds' },
      gold:     { threshold: 30,  label: 'Weekend Pro',     desc: '30 weekend rounds' },
      platinum: { threshold: 50,  label: 'Perpetual Weekend', desc: '50 weekend rounds' },
      diamond:  { threshold: 100, label: 'Weekend GOAT',    desc: '100 weekend rounds' },
    },
    check: (stats) => stats.weekendRounds,
  },

  night_owl: {
    name: 'Night Owl',
    icon: '🌙',
    description: 'Evening check-ins (8PM–midnight)',
    tiers: {
      bronze:   { threshold: 3,   label: 'Night Flyer',   desc: '3 night check-ins' },
      silver:   { threshold: 10,  label: 'Moondisc',      desc: '10 night check-ins' },
      gold:     { threshold: 25,  label: 'Creature',      desc: '25 night check-ins' },
      platinum: { threshold: 50,  label: 'Nocturnal',     desc: '50 night check-ins' },
      diamond:  { threshold: 100, label: 'Night Legend',  desc: '100 night check-ins' },
    },
    check: (stats) => stats.nightCheckins,
  },

  early_bird: {
    name: 'Early Bird',
    icon: '🌅',
    description: 'Morning check-ins (5AM–9AM)',
    tiers: {
      bronze:   { threshold: 3,   label: 'Early Riser',  desc: '3 morning check-ins' },
      silver:   { threshold: 10,  label: 'Dawn Patrol',  desc: '10 morning check-ins' },
      gold:     { threshold: 25,  label: 'Sunrise Disc', desc: '25 morning check-ins' },
      platinum: { threshold: 50,  label: 'First Light',  desc: '50 morning check-ins' },
      diamond:  { threshold: 100, label: 'Solar Disc',   desc: '100 morning check-ins' },
    },
    check: (stats) => stats.morningCheckins,
  },

  weatherproof: {
    name: 'Weatherproof',
    icon: '🌧️',
    description: 'Playing in rain, cold, or heat',
    tiers: {
      bronze:   { threshold: 1,  label: 'Drizzle Disc',   desc: '1 weather check-in' },
      silver:   { threshold: 5,  label: 'Storm Chaser',   desc: '5 weather check-ins' },
      gold:     { threshold: 15, label: 'All-Weather',    desc: '15 weather check-ins' },
      platinum: { threshold: 30, label: 'Elemental',      desc: '30 weather check-ins' },
      diamond:  { threshold: 50, label: 'Forces of Nature', desc: '50 weather check-ins' },
    },
    check: (stats) => stats.weatherCheckins,
  },

  trailblazer: {
    name: 'Trailblazer',
    icon: '🚀',
    description: 'First player to check in at a course',
    tiers: {
      bronze:   { threshold: 1,  label: 'Pioneer',       desc: 'First at 1 course' },
      silver:   { threshold: 3,  label: 'Pathfinder',    desc: 'First at 3 courses' },
      gold:     { threshold: 10, label: 'Frontier Disc', desc: 'First at 10 courses' },
      platinum: { threshold: 25, label: 'Explorer',      desc: 'First at 25 courses' },
      diamond:  { threshold: 50, label: 'Disc Cartographer', desc: 'First at 50 courses' },
    },
    check: (stats) => stats.trailblazerCourses,
  },

  seasonal: {
    name: 'Seasonal',
    icon: '🍂',
    description: 'Play all four seasons',
    tiers: {
      bronze:   { threshold: 1, label: 'One Season',     desc: 'Play in any season' },
      silver:   { threshold: 2, label: 'Half Year',      desc: 'Play in 2 seasons' },
      gold:     { threshold: 3, label: 'Three Seasons',  desc: 'Play in 3 seasons' },
      platinum: { threshold: 4, label: 'Full Calendar',  desc: 'Play in all 4 seasons' },
      diamond:  { threshold: 8, label: 'Year-Round Pro', desc: 'Play in all 4 seasons, 2 years running' },
    },
    check: (stats) => stats.seasonsPlayed,
  },

  collection: {
    name: 'Collection',
    icon: '📦',
    description: 'Complete all courses in a city',
    tiers: {
      bronze:   { threshold: 1,  label: 'City Disc',     desc: 'Complete 1 city' },
      silver:   { threshold: 3,  label: 'Town Tour',     desc: 'Complete 3 cities' },
      gold:     { threshold: 5,  label: 'Regional Ace',  desc: 'Complete 5 cities' },
      platinum: { threshold: 10, label: 'Metro Master',  desc: 'Complete 10 cities' },
      diamond:  { threshold: 20, label: 'Atlas Disc',    desc: 'Complete 20 cities' },
    },
    check: (stats) => stats.completedCities,
  },
};

/**
 * Given a player's stats object, return all badges that should now be earned
 * but aren't yet in the existing set.
 *
 * @param {Object} stats
 * @param {Set} existingBadges — Set of `${category}:${tier}` strings already earned
 * @returns {Array} Array of { category, tier, def } objects for newly earned badges
 */
function evaluateBadges(stats, existingBadges) {
  const newBadges = [];

  for (const [category, def] of Object.entries(BADGE_DEFINITIONS)) {
    const value = def.check(stats);
    for (const tier of BADGE_TIERS) {
      const key = `${category}:${tier}`;
      if (existingBadges.has(key)) continue;
      const tierDef = def.tiers[tier];
      if (value >= tierDef.threshold) {
        newBadges.push({ category, tier, def, tierDef });
      }
    }
  }

  return newBadges;
}

// ──────────────────────────────────────────────
// TIER COLORS (used in UI)
// ──────────────────────────────────────────────
const TIER_COLORS = {
  bronze:   { bg: 'rgba(180,100,40,0.15)', border: 'rgba(205,127,50,0.5)',  text: '#cd7f32', glow: 'rgba(205,127,50,0.3)' },
  silver:   { bg: 'rgba(160,160,160,0.12)', border: 'rgba(192,192,192,0.5)', text: '#c0c0c0', glow: 'rgba(192,192,192,0.25)' },
  gold:     { bg: 'rgba(212,175,55,0.15)', border: 'rgba(255,215,0,0.5)',   text: '#ffd700', glow: 'rgba(255,215,0,0.3)' },
  platinum: { bg: 'rgba(100,220,200,0.12)', border: 'rgba(100,220,200,0.5)', text: '#7cf5e4', glow: 'rgba(100,220,200,0.3)' },
  diamond:  { bg: 'rgba(120,160,255,0.15)', border: 'rgba(150,200,255,0.6)', text: '#a0c8ff', glow: 'rgba(150,200,255,0.4)' },
};

/**
 * Grant XP to a player, inserting an xp_transaction record.
 * Automatically applies any active XP boosts.
 * Returns the actual XP granted.
 *
 * @param {Object} client — pg client in transaction
 * @param {Number} playerId
 * @param {String} eventType
 * @param {Object} metadata
 * @param {Array}  activeBoosts — optional pre-fetched boosts array (avoids extra query)
 */
async function grantXp(client, playerId, eventType, metadata = {}, activeBoosts = null) {
  const baseAmount = XP_EVENTS[eventType];
  if (!baseAmount) throw new Error(`Unknown XP event: ${eventType}`);

  // Apply XP boost if any are active
  let finalAmount = baseAmount;
  let boostPercent = 0;
  let boostLabel = null;

  try {
    let boosts = activeBoosts;
    if (!boosts) {
      // Use SAVEPOINT so a failed boost query doesn't abort the outer transaction
      await client.query('SAVEPOINT boost_check');
      try {
        const boostResult = await client.query(
          `SELECT boost_type, effect_value FROM active_boosts
           WHERE player_id = $1 AND boost_type = 'boost_xp' AND expires_at > NOW()
           ORDER BY expires_at DESC LIMIT 1`,
          [playerId]
        );
        boosts = boostResult.rows;
        await client.query('RELEASE SAVEPOINT boost_check');
      } catch (_qe) {
        await client.query('ROLLBACK TO SAVEPOINT boost_check');
        boosts = [];
      }
    }
    const xpBoost = boosts.find ? boosts.find(b => b.boost_type === 'boost_xp') : boosts[0];
    if (xpBoost) {
      boostPercent = xpBoost.effect_value;
      finalAmount = Math.round(baseAmount * (1 + boostPercent / 100));
      boostLabel = `🔥 +${boostPercent}% XP boost`;
    }
  } catch (_e) {
    // Non-fatal — boost check failure should not block XP grant
    finalAmount = baseAmount;
  }

  await client.query(
    'INSERT INTO xp_transactions (player_id, event_type, xp_amount, metadata) VALUES ($1, $2, $3, $4)',
    [playerId, eventType, finalAmount, JSON.stringify({ ...metadata, base_xp: baseAmount, boost_percent: boostPercent })]
  );

  const result = await client.query(
    'UPDATE players SET xp = xp + $1 WHERE id = $2 RETURNING xp',
    [finalAmount, playerId]
  );

  // Update cached level
  const newXp = result.rows[0].xp;
  const newLevel = getLevelFromXp(newXp);
  await client.query('UPDATE players SET level = $1 WHERE id = $2', [newLevel, playerId]);

  return { amount: finalAmount, baseAmount, boostPercent, boostLabel, newXp, newLevel };
}

// ──────────────────────────────────────────────
// GOLD CURRENCY SYSTEM
// ──────────────────────────────────────────────

/**
 * Gold earned per gameplay event.
 * Battle wins scale: daily=40, weekly=75, monthly=150 (if winner)
 * Lose participation: 10 (any cadence)
 * Challenge: daily=15, weekly=40, monthly=100
 */
const GOLD_EVENTS = {
  // Check-in events
  checkin_new_course:  25,  // first visit to a course
  checkin_return:      10,  // return visit

  // Round completion
  round_complete:      20,  // any round
  round_complete_18:   35,  // 18-hole round (stacks with round_complete — addl bonus)

  // Scorecard shot types (per occurrence within round)
  birdie:               5,
  eagle:               15,
  ace:                 50,

  // Battle results
  battle_win_daily:    40,
  battle_win_weekly:   75,
  battle_win_monthly: 150,
  battle_loss:         10,  // participation (any cadence)

  // Challenges
  challenge_daily:     15,
  challenge_weekly:    40,
  challenge_monthly:  100,

  // Badge & level-up
  badge_unlock:        20,
  level_up:            50,

  // Exploration milestone gold
  state_champion_first: 200,  // First completed state
};

/**
 * Get the total active gold boost multiplier for a player.
 * Returns a factor like 1.0 (no boost), 1.25 (25% boost), etc.
 *
 * @param {Object} client — pg client
 * @param {Number} playerId
 * @returns {Number} multiplier
 */
async function getActiveGoldBoostMultiplier(client, playerId) {
  try {
    // Use SAVEPOINT so a failed boost query doesn't abort the outer transaction
    await client.query('SAVEPOINT gold_boost_check');
    const result = await client.query(
      `SELECT ab.effect_value
       FROM active_boosts ab
       WHERE ab.player_id = $1 AND ab.boost_type = 'boost_gold' AND ab.expires_at > NOW()`,
      [playerId]
    );
    await client.query('RELEASE SAVEPOINT gold_boost_check');
    if (result.rows.length === 0) return 1.0;
    // Stack boosts additively (cap at 200%)
    const totalPct = result.rows.reduce((sum, r) => sum + parseInt(r.effect_value), 0);
    return 1 + Math.min(totalPct, 200) / 100;
  } catch (_e) {
    try { await client.query('ROLLBACK TO SAVEPOINT gold_boost_check'); } catch (_) {}
    // Non-fatal — if boost check fails, use no multiplier
    return 1.0;
  }
}

/**
 * Grant gold to a player atomically.
 * Applies active gold boost multipliers.
 * Records an audit entry in gold_transactions.
 *
 * @param {Object} client — pg client in transaction
 * @param {Number} playerId
 * @param {String} eventType — key in GOLD_EVENTS
 * @param {Object} metadata
 * @param {Number} [overrideAmount] — skip GOLD_EVENTS lookup (for per-occurrence grants)
 * @returns {{ base, multiplier, amount, newGold }}
 */
async function grantGold(client, playerId, eventType, metadata = {}, overrideAmount = null) {
  const base = overrideAmount !== null ? overrideAmount : (GOLD_EVENTS[eventType] || 0);
  if (base <= 0) return { base: 0, multiplier: 1, amount: 0, newGold: null };

  const multiplier = await getActiveGoldBoostMultiplier(client, playerId);
  const amount = Math.round(base * multiplier);

  await client.query(
    `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [playerId, amount, eventType, JSON.stringify(metadata)]
  );

  const result = await client.query(
    `UPDATE players SET gold = gold + $1 WHERE id = $2 RETURNING gold`,
    [amount, playerId]
  );

  return { base, multiplier, amount, newGold: result.rows[0].gold };
}

module.exports = {
  totalXpForLevel,
  getLevelFromXp,
  getLevelProgress,
  getLevelTitle,
  LEVEL_TITLES,
  XP_EVENTS,
  GOLD_EVENTS,
  BADGE_DEFINITIONS,
  BADGE_TIERS,
  TIER_COLORS,
  evaluateBadges,
  grantXp,
  grantGold,
  getActiveGoldBoostMultiplier,
  getCheckinMilestone,
  getCourseMilestone,
  getRoundMilestone,
  getStateMilestone,
};
