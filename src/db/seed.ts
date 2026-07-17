// src/db/seed.ts — starter content for a fresh database. Applied once (guarded
// by an empty training_categories check in migrate.ts). The training library
// (categories, lessons, resources) and courses are the real content ported from
// the legacy app: see src/db/data/lessons.ts and src/db/data/courses.ts.

import type { PoolClient } from 'pg';
import { CATEGORIES, LESSONS } from './data/lessons';
import { COURSES } from './data/courses';

// Bump when the seeded content below changes so a deploy re-seeds. v1 was the
// initial placeholder; v2 the full legacy library (71 lessons / 671 courses);
// v3 expands courses to 1,900+ (curated set + all named US courses from OSM).
export const CONTENT_VERSION = 3;

// Clears the content tables before a re-seed (leaves players/progress intact).
// No FK constraints reference these, so order is not significant.
const RESET_CONTENT_SQL = `
DELETE FROM lesson_resources;
DELETE FROM training_lessons;
DELETE FROM training_categories;
DELETE FROM courses;
DELETE FROM daily_challenge_pool;
DELETE FROM items;
DELETE FROM vault_items;
DELETE FROM story_quests;
`;

// Non-content seed: daily challenges, shop/vault items, story missions.
const MISC_SEED_SQL = `
INSERT INTO daily_challenge_pool (key, title, description, challenge_type, target_value, xp_reward, gold_reward) VALUES
  ('daily_lesson', 'Learn Something New', 'Complete one training lesson today.', 'watch_and_learn', 1, 30, 10),
  ('daily_two', 'Double Down', 'Complete two training lessons today.', 'skill_check', 2, 60, 20),
  ('daily_category', 'Focus Session', 'Complete a lesson in your weakest category.', 'course_apply', 1, 40, 15);

INSERT INTO items (name, description, icon, type, effect_value, duration_minutes, rarity, gold_cost) VALUES
  ('XP Boost', '+50% XP for 1 hour.', '🔥', 'boost_xp', 50, 60, 'uncommon', 150),
  ('Gold Boost', '+50% gold for 1 hour.', '💰', 'boost_gold', 50, 60, 'uncommon', 150),
  ('Focus Token', 'A cosmetic badge of dedication.', '🎯', 'cosmetic', 0, 0, 'rare', 300);

INSERT INTO vault_items (name, description, icon, rarity, type, effect_value, duration_minutes) VALUES
  ('XP Boost', '+50% XP for 1 hour.', '🔥', 'uncommon', 'boost_xp', 50, 60),
  ('Gold Boost', '+50% gold for 1 hour.', '💰', 'uncommon', 'boost_gold', 50, 60);

INSERT INTO story_quests (quest_key, title, description, objective, chapter_number, quest_type, mission_type, training_link, trigger_event, trigger_conditions, target_value, reward_xp, reward_gold, sort_order) VALUES
  ('m_first_lesson', 'First Flight', 'Complete your very first training lesson.', 'Complete 1 lesson', 1, 'main', 'watch_and_learn', 'form-technique', 'TRAINING_COMPLETE', '{}', 1, 50, 25, 1),
  ('m_form_focus', 'Dial the Form', 'Complete 3 Form & Technique lessons.', 'Complete 3 form lessons', 1, 'side', 'skill_check', 'form-technique', 'TRAINING_COMPLETE', '{"category_slug":"form-technique"}', 3, 100, 50, 2),
  ('m_disc_iq', 'Disc IQ', 'Complete 3 Disc Selection lessons.', 'Complete 3 disc lessons', 1, 'side', 'skill_check', 'disc-selection', 'TRAINING_COMPLETE', '{"category_slug":"disc-selection"}', 3, 100, 50, 3),
  ('m_five_lessons', 'Student of the Game', 'Complete 5 lessons total.', 'Complete 5 lessons', 1, 'main', 'watch_and_learn', NULL, 'TRAINING_COMPLETE', '{}', 5, 150, 75, 4),
  ('m_ten_lessons', 'Grinder', 'Complete 10 lessons total.', 'Complete 10 lessons', 2, 'main', 'watch_and_learn', NULL, 'TRAINING_COMPLETE', '{}', 10, 300, 150, 5);
`;

export async function seedDatabase(client: PoolClient): Promise<void> {
  // Start clean so re-seeds (content version bumps) don't duplicate rows.
  await client.query(RESET_CONTENT_SQL);

  // ── categories ──
  for (const c of CATEGORIES) {
    await client.query(
      `INSERT INTO training_categories (name, slug, description, icon, sort_order, skill_level)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
      [c.name, c.slug, c.description, c.icon, c.sort_order, c.skill_level]
    );
  }
  const catRows = await client.query<{ id: number; slug: string }>('SELECT id, slug FROM training_categories');
  const catId = new Map(catRows.rows.map((r) => [r.slug, r.id]));

  // ── lessons + resources ──
  for (const l of LESSONS) {
    const cid = catId.get(l.category_slug);
    if (cid === undefined) continue;
    const res = await client.query<{ id: number }>(
      `INSERT INTO training_lessons
         (category_id, title, slug, description, difficulty, content_type, content_body,
          xp_reward, sort_order, skill_level, youtube_url, youtube_title, youtube_channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [cid, l.title, l.slug, l.description, l.difficulty, l.content_type,
        JSON.stringify(l.content_body), l.xp_reward, l.sort_order, l.skill_level,
        l.youtube_url, l.youtube_title, l.youtube_channel]
    );
    const lessonId = res.rows[0]!.id;
    let order = 1;
    for (const r of l.resources) {
      await client.query(
        `INSERT INTO lesson_resources (lesson_id, title, url, author, credentials, resource_type, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [lessonId, r.title, r.url, r.author, r.credentials, r.resource_type, order++]
      );
    }
  }

  // ── courses (batched multi-row insert; ~1,900 rows) ──
  const BATCH = 150;
  for (let i = 0; i < COURSES.length; i += BATCH) {
    const slice = COURSES.slice(i, i + BATCH);
    const params: unknown[] = [];
    const rows = slice.map((c, j) => {
      const b = j * 8;
      params.push(c.name, c.city, c.state, c.lat, c.lng, c.holes, c.par, c.difficulty);
      // country / hole_count / is_active are constant or mirror `holes`.
      return `($${b + 1}, $${b + 2}, $${b + 3}, 'US', $${b + 4}, $${b + 5}, $${b + 6}, $${b + 6}, $${b + 7}, $${b + 8}, TRUE)`;
    });
    await client.query(
      `INSERT INTO courses (name, city, state, country, lat, lng, holes, hole_count, par, difficulty, is_active)
       VALUES ${rows.join(', ')}`,
      params
    );
  }

  // ── daily challenges, items, missions ──
  await client.query(MISC_SEED_SQL);
}
