// services/login-streak.js — daily login-streak update + streak badge grants.
// Called from GET /api/players/me inside an open transaction (client). Mutates
// the passed-in player row `p` (login_streak/best_streak/xp) to reflect the
// update, and returns the streak-XP grant, or null when the player already
// logged in today or hit no streak milestone. The caller owns the transaction.

const { grantXp, grantGold, evaluateBadges } = require('../routes/xp-engine');

async function applyLoginStreak(client, p) {
  const today = new Date().toISOString().split('T')[0];
  const lastLogin = p.last_login_date ? p.last_login_date.toISOString().split('T')[0] : null;
  if (lastLogin === today) return null;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  // Consecutive day continues the streak; anything else (first login or a gap) resets to 1.
  const newStreak = lastLogin === yesterday ? (p.login_streak || 0) + 1 : 1;
  const newBest = Math.max(newStreak, p.best_streak || 0);

  await client.query(
    'UPDATE players SET last_login_date = $1, login_streak = $2, best_streak = $3 WHERE id = $4',
    [today, newStreak, newBest, p.id]
  );
  p.login_streak = newStreak;
  p.best_streak = newBest;

  const streakEvent = { 3: 'login_streak_3', 7: 'login_streak_7', 14: 'login_streak_14', 30: 'login_streak_30' }[newStreak] || null;
  if (!streakEvent) return null;

  const r = await grantXp(client, p.id, streakEvent, { streak: newStreak });
  p.xp = r.newXp;
  const loginXpGranted = { event: streakEvent, amount: r.amount, newXp: r.newXp, streak: newStreak };

  // Evaluate streak badges — non-fatal; a badge/gold failure must not break login.
  try {
    const badgeStats = {
      uniqueCourses: 0, totalCheckins: 0, totalRounds: p.total_rounds,
      challengesCompleted: 0, battleWins: p.battle_wins, bestStreak: newBest,
      uniqueOpponents: 0, uniqueStates: 0, maxSameCourseVisits: 0,
      weekendRounds: 0, nightCheckins: 0, morningCheckins: 0, weatherCheckins: 0,
      trailblazerCourses: 0, seasonsPlayed: 0, completedCities: 0,
    };
    const existing = await client.query('SELECT category, tier FROM player_badges WHERE player_id = $1', [p.id]);
    const existingSet = new Set(existing.rows.map(r2 => `${r2.category}:${r2.tier}`));
    const newBadges = evaluateBadges(badgeStats, existingSet);
    for (const badge of newBadges) {
      await client.query(
        'INSERT INTO player_badges (player_id, category, tier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [p.id, badge.category, badge.tier]
      );
      // SAVEPOINT so a gold-grant failure doesn't poison the whole transaction.
      try {
        await client.query('SAVEPOINT badge_gold');
        await grantGold(client, p.id, 'badge_unlock', { category: badge.category, tier: badge.tier });
        await client.query('RELEASE SAVEPOINT badge_gold');
      } catch (_e) {
        try { await client.query('ROLLBACK TO SAVEPOINT badge_gold'); } catch (_) {}
      }
    }
  } catch (badgeErr) {
    console.error('[login-streak] Badge evaluation error:', badgeErr.message);
  }

  return loginXpGranted;
}

module.exports = { applyLoginStreak };
