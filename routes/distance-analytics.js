/**
 * Distance Analytics — Disc Golf Go
 *
 * Computes distance metrics from GPS path data and unlocks distance-based achievements.
 * Called after round completion (fire-and-forget, non-fatal).
 */

// ── Haversine distance in meters ─────────────────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minimum distance threshold to count a GPS segment as a "throw" (not walking between points)
const THROW_THRESHOLD_M = 10;

/**
 * Compute distance metrics from an ordered array of {lat, lng} points.
 * Returns:
 *   totalDistanceM     — sum of all segment distances (full walk)
 *   longestSegmentM    — largest single segment distance (longest throw proxy)
 */
function computePathMetrics(points) {
  if (!points || points.length < 2) {
    return { totalDistanceM: 0, longestSegmentM: 0 };
  }
  let totalDistanceM = 0;
  let longestSegmentM = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(
      parseFloat(points[i - 1].lat), parseFloat(points[i - 1].lng),
      parseFloat(points[i].lat),     parseFloat(points[i].lng)
    );
    totalDistanceM += d;
    if (d >= THROW_THRESHOLD_M && d > longestSegmentM) {
      longestSegmentM = d;
    }
  }

  return { totalDistanceM, longestSegmentM };
}

// ── Distance Achievement Definitions ─────────────────────────────────────────
// achievement_type strings stored in player_achievements
const DISTANCE_ACHIEVEMENTS = [
  {
    type: 'dist_walker_100',
    name: '100-Meter Walker',
    icon: '🚶',
    description: 'Walk 100m total in a single round',
    xpReward: 150,
    goldReward: 50,
    // check(roundMetrics, lifetimeStats) → bool
    check: (round) => round.totalDistanceM >= 100,
  },
  // 'dist_throw_500' disabled — "throw distance" is calculated from GPS segment gaps,
  // not actual throw input, making the number meaningless. Re-enable when real throw
  // tracking exists.
  // {
  //   type: 'dist_throw_500',
  //   name: '500 Throw Meter',
  //   icon: '🥏',
  //   description: 'Accumulate 500m in throw distances across all rounds',
  //   xpReward: 250,
  //   goldReward: 75,
  //   check: (_round, lifetime) => lifetime.totalThrowM >= 500,
  // },
  {
    type: 'dist_ace_historian',
    name: 'Ace Historian',
    icon: '📜',
    description: 'Complete 5 rounds at courses that have a GPS path on file',
    xpReward: 300,
    goldReward: 100,
    check: (_round, lifetime) => lifetime.gpsRoundCount >= 5,
  },
  {
    type: 'dist_fairway_beast',
    name: 'Fairway Beast',
    icon: '🌿',
    description: 'Walk ≥500m in a single round',
    xpReward: 350,
    goldReward: 125,
    // Simplified: use total distance walked >= 500m per round as proxy for "80% fairway coverage"
    check: (round) => round.totalDistanceM >= 500,
  },
  {
    type: 'dist_course_conqueror',
    name: 'Course Conqueror',
    icon: '👑',
    description: 'Walk ≥1km in a single round',
    xpReward: 500,
    goldReward: 200,
    check: (round) => round.totalDistanceM >= 1000,
  },
];

/**
 * Main entry point — compute analytics + check achievements after a round completes.
 * Completely non-fatal: catches all errors internally.
 *
 * @param {object} pool   — pg Pool
 * @param {number} roundId
 * @param {number} playerId
 * @param {number|null} courseId
 * @returns {Promise<{ analytics: object|null, newAchievements: Array }>}
 */
async function processRoundDistanceAnalytics(pool, roundId, playerId, courseId) {
  const result = { analytics: null, newAchievements: [] };

  try {
    // 1. Fetch GPS path for this round
    const pathResult = await pool.query(
      `SELECT lat, lng FROM round_tracking WHERE round_id = $1 ORDER BY recorded_at ASC`,
      [roundId]
    );
    const points = pathResult.rows;

    // Compute metrics
    const { totalDistanceM, longestSegmentM } = computePathMetrics(points);

    // 2. Store analytics (upsert — safe to call multiple times)
    await pool.query(
      `INSERT INTO round_analytics (round_id, player_id, course_id, total_distance_m, longest_segment_m, point_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (round_id) DO UPDATE
         SET total_distance_m = EXCLUDED.total_distance_m,
             longest_segment_m = EXCLUDED.longest_segment_m,
             point_count = EXCLUDED.point_count,
             computed_at = NOW()`,
      [roundId, playerId, courseId, totalDistanceM, longestSegmentM, points.length]
    );

    // 3. Update lifetime stats on player
    await pool.query(
      `UPDATE players SET
         total_distance_m = total_distance_m + $2,
         longest_throw_m  = GREATEST(longest_throw_m, $3)
       WHERE id = $1`,
      [playerId, totalDistanceM, longestSegmentM]
    );

    result.analytics = { totalDistanceM, longestSegmentM, pointCount: points.length };

    // 4. Compute lifetime stats needed for achievement checks
    const lifetimeRow = await pool.query(
      `SELECT total_distance_m, longest_throw_m FROM players WHERE id = $1`,
      [playerId]
    );
    const lt = lifetimeRow.rows[0] || { total_distance_m: 0, longest_throw_m: 0 };

    // GPS-tracked rounds count
    const gpsRoundsRow = await pool.query(
      `SELECT COUNT(DISTINCT round_id) as cnt FROM round_analytics WHERE player_id = $1 AND point_count >= 2`,
      [playerId]
    );
    const gpsRoundCount = parseInt(gpsRoundsRow.rows[0].cnt) || 0;

    // Sum of longest throws across all rounds = proxy for "accumulated throw meters"
    const throwSumRow = await pool.query(
      `SELECT COALESCE(SUM(longest_segment_m), 0) as total_throw_m FROM round_analytics WHERE player_id = $1`,
      [playerId]
    );
    const totalThrowM = parseFloat(throwSumRow.rows[0].total_throw_m) || 0;

    const lifetimeStats = {
      totalDistanceM: parseFloat(lt.total_distance_m) || 0,
      longestThrowM: parseFloat(lt.longest_throw_m) || 0,
      totalThrowM,
      gpsRoundCount,
    };

    // 5. Load already-earned achievements to avoid duplicate grants
    const earnedResult = await pool.query(
      `SELECT achievement_type FROM player_achievements WHERE player_id = $1`,
      [playerId]
    );
    const alreadyEarned = new Set(earnedResult.rows.map(r => r.achievement_type));

    // 6. Check each distance achievement
    for (const ach of DISTANCE_ACHIEVEMENTS) {
      if (alreadyEarned.has(ach.type)) continue; // already unlocked

      const unlocked = ach.check(result.analytics, lifetimeStats);
      if (!unlocked) continue;

      // Grant the achievement
      await pool.query(
        `INSERT INTO player_achievements (player_id, achievement_type, earned_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [playerId, ach.type]
      );

      // Award XP
      try {
        await pool.query(
          `UPDATE players SET xp = xp + $2 WHERE id = $1`,
          [playerId, ach.xpReward]
        );
        await pool.query(
          `INSERT INTO xp_transactions (player_id, xp_amount, event_type, metadata)
           VALUES ($1, $2, 'achievement_unlock', $3)`,
          [playerId, ach.xpReward, JSON.stringify({ achievement: ach.type })]
        );
      } catch (_e) { /* non-fatal */ }

      // Award Gold
      try {
        await pool.query(
          `UPDATE players SET gold = gold + $2 WHERE id = $1`,
          [playerId, ach.goldReward]
        );
        await pool.query(
          `INSERT INTO gold_transactions (player_id, amount, event_type, metadata)
           VALUES ($1, $2, 'achievement_unlock', $3)`,
          [playerId, ach.goldReward, JSON.stringify({ achievement: ach.type })]
        );
      } catch (_e) { /* non-fatal */ }

      result.newAchievements.push({
        type: ach.type,
        name: ach.name,
        icon: ach.icon,
        description: ach.description,
        xp_reward: ach.xpReward,
        gold_reward: ach.goldReward,
      });
    }
  } catch (err) {
    // Completely non-fatal — never breaks round completion
    console.error('Distance analytics error (non-fatal):', err.message);
  }

  return result;
}

/**
 * Get distance stats for a player (for profile page).
 */
async function getPlayerDistanceStats(pool, playerId) {
  try {
    const playerRow = await pool.query(
      `SELECT total_distance_m, longest_throw_m FROM players WHERE id = $1`,
      [playerId]
    );
    const p = playerRow.rows[0] || { total_distance_m: 0, longest_throw_m: 0 };

    const analyticsRow = await pool.query(
      `SELECT COUNT(*) as gps_rounds,
              MAX(total_distance_m) as best_round_distance_m,
              MAX(longest_segment_m) as longest_throw_ever_m
       FROM round_analytics WHERE player_id = $1 AND point_count >= 2`,
      [playerId]
    );
    const a = analyticsRow.rows[0] || {};

    // Distance achievements with unlock status
    const earnedResult = await pool.query(
      `SELECT achievement_type, earned_at FROM player_achievements WHERE player_id = $1`,
      [playerId]
    );
    const earnedMap = {};
    for (const row of earnedResult.rows) earnedMap[row.achievement_type] = row.earned_at;

    const achievements = DISTANCE_ACHIEVEMENTS.map(ach => ({
      type: ach.type,
      name: ach.name,
      icon: ach.icon,
      description: ach.description,
      xp_reward: ach.xpReward,
      gold_reward: ach.goldReward,
      earned: !!earnedMap[ach.type],
      earned_at: earnedMap[ach.type] || null,
    }));

    return {
      total_distance_m: parseFloat(p.total_distance_m) || 0,
      longest_throw_m: parseFloat(p.longest_throw_m) || 0,
      gps_rounds: parseInt(a.gps_rounds) || 0,
      best_round_distance_m: parseFloat(a.best_round_distance_m) || 0,
      longest_throw_ever_m: parseFloat(a.longest_throw_ever_m) || 0,
      achievements,
    };
  } catch (err) {
    console.error('Get distance stats error:', err.message);
    return { total_distance_m: 0, longest_throw_m: 0, gps_rounds: 0, best_round_distance_m: 0, longest_throw_ever_m: 0, achievements: [] };
  }
}

module.exports = {
  processRoundDistanceAnalytics,
  getPlayerDistanceStats,
  DISTANCE_ACHIEVEMENTS,
  haversineMeters,
  computePathMetrics,
};
