// src/db/schema.ts — full schema reconstruction (the live DB was empty).
// Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, safe to
// run on every boot. Columns reconstructed from the repo queries + CLAUDE.md.
// Tables for dropped features (rounds/battles/crews) are created empty because
// some read/delete paths still reference them.

export const SCHEMA_SQL = `
-- ── seed bookkeeping ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seed_meta (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content_version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seed_meta_singleton CHECK (id = 1)
);

-- ── identity ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  player_uuid TEXT UNIQUE,
  display_name TEXT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  gold INTEGER NOT NULL DEFAULT 0,
  profile_photo_url TEXT,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  guest_uuid TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  experience_level TEXT,
  login_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  battle_wins INTEGER NOT NULL DEFAULT 0,
  battle_losses INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER NOT NULL DEFAULT 0,
  total_birdies INTEGER NOT NULL DEFAULT 0,
  total_aces INTEGER NOT NULL DEFAULT 0,
  total_checkins INTEGER NOT NULL DEFAULT 0,
  total_courses_visited INTEGER NOT NULL DEFAULT 0,
  total_distance_m NUMERIC NOT NULL DEFAULT 0,
  challenges_completed INTEGER NOT NULL DEFAULT 0,
  training_streak_days INTEGER NOT NULL DEFAULT 0,
  training_streak_last_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);

-- ── progression ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_transactions (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  event_type TEXT,
  xp_amount INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xptx_player ON xp_transactions(player_id);

CREATE TABLE IF NOT EXISTS gold_transactions (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  event_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goldtx_player ON gold_transactions(player_id);

CREATE TABLE IF NOT EXISTS xp_log (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  source TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_badges (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  tier TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, category, tier)
);

CREATE TABLE IF NOT EXISTS player_achievements (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  achievement_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, achievement_type)
);

-- ── training ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  skill_level TEXT NOT NULL DEFAULT 'all_levels'
);

CREATE TABLE IF NOT EXISTS training_lessons (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  difficulty TEXT DEFAULT 'beginner',
  content_type TEXT DEFAULT 'tip_card',
  content_body JSONB,
  xp_reward INTEGER NOT NULL DEFAULT 10,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  skill_level TEXT NOT NULL DEFAULT 'all_levels',
  youtube_url TEXT,
  youtube_title TEXT,
  youtube_channel TEXT
);
CREATE INDEX IF NOT EXISTS idx_lessons_category ON training_lessons(category_id);
-- Stable identity for reseeds: content is upserted by slug so lesson ids never
-- churn, which keeps training_completions (player progress + leaderboard XP) valid.
-- Drop any accidental slug collisions first (no-op on clean data; NULL slugs are
-- never "equal" in SQL so they're untouched) so the unique index can't fail boot.
DELETE FROM training_lessons a USING training_lessons b WHERE a.slug = b.slug AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_slug ON training_lessons(slug);

CREATE TABLE IF NOT EXISTS lesson_resources (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT,
  credentials TEXT,
  resource_type TEXT DEFAULT 'article',
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resources_lesson ON lesson_resources(lesson_id);

CREATE TABLE IF NOT EXISTS training_completions (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS training_streaks (
  player_id INTEGER PRIMARY KEY,
  streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_date DATE,
  streak_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_milestones (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  milestone_key TEXT NOT NULL,
  reward_gold INTEGER NOT NULL DEFAULT 0,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, milestone_key)
);

-- What the player told us in the training assessment. One row per player: a
-- retake overwrites it rather than appending, because a path is built from who
-- they are NOW, and a history of old answers would only be read to rebuild the
-- current one.
--
-- goals and weakness are JSONB arrays rather than TEXT[] because every answer is
-- validated against the question catalogue before it is written (parseAnswers),
-- so the column never needs to constrain membership -- and JSONB is what the
-- rest of this schema already uses for lists.
-- The profile photo / club logo, stored as BYTES IN POSTGRES rather than in
-- object storage. That is a deliberate trade, not a shortcut: the old avatar
-- upload went to Polsia R2 and was dropped in the rebuild, so this app has no
-- bucket and no credentials for one, and adding a storage provider to ship a
-- 256px avatar is the larger change. Images are resized and re-encoded by the
-- browser before they are sent, so a row here is tens of kilobytes.
--
-- Its own table, not a column on players: that table is SELECTed with * in
-- several places and on every leaderboard read, and a BYTEA column would then
-- be dragged into every one of those queries. Nothing joins this table -- the
-- bytes are only ever fetched by the one endpoint that serves them.
CREATE TABLE IF NOT EXISTS player_photos (
  player_id INTEGER PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_training_profile (
  player_id INTEGER PRIMARY KEY,
  skill_level TEXT NOT NULL,
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  weakness JSONB NOT NULL DEFAULT '[]'::jsonb,
  tournament TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_notifications (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  type TEXT,
  title TEXT,
  message TEXT,
  lesson_id INTEGER,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trainnotif_player ON training_notifications(player_id);

CREATE TABLE IF NOT EXISTS player_training_notification_settings (
  player_id INTEGER PRIMARY KEY,
  tips_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tips_frequency TEXT NOT NULL DEFAULT 'daily',
  reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mission_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  achievement_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── story / missions / daily ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_chapters (
  id SERIAL PRIMARY KEY,
  chapter_number INTEGER NOT NULL,
  title TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS story_quests (
  id SERIAL PRIMARY KEY,
  quest_key TEXT UNIQUE,
  title TEXT,
  description TEXT,
  objective TEXT,
  chapter_number INTEGER DEFAULT 1,
  quest_type TEXT DEFAULT 'main',
  mission_type TEXT,
  training_link TEXT,
  is_daily BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_event TEXT,
  trigger_conditions JSONB,
  target_value INTEGER NOT NULL DEFAULT 1,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_gold INTEGER NOT NULL DEFAULT 0,
  reward_badge_key TEXT,
  reward_item_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  xp_to_unlock_next INTEGER
);

CREATE TABLE IF NOT EXISTS quest_progression (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  quest_id INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE (player_id, quest_id)
);

CREATE TABLE IF NOT EXISTS daily_challenge_pool (
  id SERIAL PRIMARY KEY,
  key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  challenge_type TEXT DEFAULT 'general',
  target_value INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  gold_reward INTEGER NOT NULL DEFAULT 0,
  training_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS player_daily_challenges (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  challenge_date DATE NOT NULL,
  pool_id INTEGER,
  title TEXT,
  description TEXT,
  challenge_type TEXT,
  target_value INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  gold_reward INTEGER NOT NULL DEFAULT 0,
  training_slug TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE (player_id, challenge_date)
);

-- ── leaderboard ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  total_xp INTEGER NOT NULL DEFAULT 0,
  lessons_completed INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  challenges_won INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ
);

-- ── vault (training content) + shop (items) ───────────────────────────────
CREATE TABLE IF NOT EXISTS vault_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT DEFAULT 'common',
  type TEXT,
  effect_value INTEGER,
  duration_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS vault_training_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  preview TEXT,
  icon TEXT,
  gold_cost INTEGER NOT NULL DEFAULT 0,
  item_type TEXT,
  content TEXT,
  instructor_name TEXT,
  youtube_url TEXT,
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_vault_training_unlocks (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, item_id)
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  type TEXT,
  effect_value INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  rarity TEXT DEFAULT 'common',
  gold_cost INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_inventory (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_via TEXT DEFAULT 'drop',
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, item_id)
);

CREATE TABLE IF NOT EXISTS active_boosts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  item_id INTEGER,
  boost_type TEXT,
  effect_value INTEGER NOT NULL DEFAULT 0,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boosts_player ON active_boosts(player_id);

-- ── courses / checkins / reviews ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  lat NUMERIC,
  lng NUMERIC,
  holes INTEGER,
  hole_count INTEGER,
  par INTEGER,
  terrain TEXT,
  terrain_type TEXT,
  difficulty TEXT,
  fees TEXT,
  amenities TEXT,
  course_length_ft INTEGER,
  elevation_change_ft INTEGER,
  designer TEXT,
  year_established INTEGER,
  pdga_rating TEXT,
  dgcoursereview_rating TEXT,
  rating NUMERIC,
  notable_features TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  pdga_course_id TEXT,
  hole_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_state ON courses(state);

CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  is_round_complete BOOLEAN NOT NULL DEFAULT FALSE,
  holes_logged INTEGER,
  weather_condition TEXT,
  event_flags JSONB,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkins_player ON checkins(player_id);
CREATE INDEX IF NOT EXISTS idx_checkins_course ON checkins(course_id);

CREATE TABLE IF NOT EXISTS course_reviews (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, course_id)
);

CREATE TABLE IF NOT EXISTS player_course_bests (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  best_score_vs_par INTEGER,
  best_round_id INTEGER,
  UNIQUE (player_id, course_id)
);

-- ── challenges ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  slug TEXT,
  title TEXT,
  description TEXT,
  difficulty TEXT DEFAULT 'easy',
  challenge_type TEXT,
  cadence TEXT DEFAULT 'permanent',
  target_value INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  course_id INTEGER,
  is_rotating BOOLEAN NOT NULL DEFAULT FALSE,
  is_pool_member BOOLEAN NOT NULL DEFAULT FALSE,
  active_from DATE,
  active_until DATE
);

CREATE TABLE IF NOT EXISTS active_challenge_slots (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL,
  cadence TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  UNIQUE (challenge_id, period_start)
);

CREATE TABLE IF NOT EXISTS player_challenges (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  challenge_id INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  UNIQUE (player_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS player_challenge_slots (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  slot_id INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  UNIQUE (player_id, slot_id)
);

-- ── notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  title TEXT,
  message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notification_dismissals (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  notification_id INTEGER NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, notification_id)
);

-- ── onboarding / referrals / feedback ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_events (
  id SERIAL PRIMARY KEY,
  player_id INTEGER,
  guest_uuid TEXT,
  event_type TEXT,
  experience_level TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_activations (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL,
  friend_id INTEGER,
  code_used TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_type TEXT,
  reward_amount INTEGER,
  expires_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referrer_id, code_used)
);

CREATE TABLE IF NOT EXISTS referral_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT,
  referral_code TEXT,
  referrer_id INTEGER,
  user_id INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  category TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── admin / analytics ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  player_id INTEGER,
  action TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_emails (
  id SERIAL PRIMARY KEY,
  subject TEXT,
  body TEXT,
  recipient_type TEXT,
  recipients JSONB,
  recipient_count INTEGER,
  status TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pageviews (
  id SERIAL PRIMARY KEY,
  path TEXT,
  ip TEXT,
  user_agent TEXT,
  session_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── legacy tables (dropped features; created empty so reads/deletes work) ──
CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  course_id INTEGER,
  layout_id INTEGER,
  status TEXT DEFAULT 'active',
  total_score INTEGER,
  total_par INTEGER,
  holes_count INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS round_holes (
  id SERIAL PRIMARY KEY, round_id INTEGER NOT NULL, hole_number INTEGER, score INTEGER, par INTEGER
);
CREATE TABLE IF NOT EXISTS round_tracking ( id SERIAL PRIMARY KEY, round_id INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS round_analytics ( id SERIAL PRIMARY KEY, round_id INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS battles (
  id SERIAL PRIMARY KEY, challenger_id INTEGER, opponent_id INTEGER, battle_type TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS crews (
  id SERIAL PRIMARY KEY, name TEXT, logo_url TEXT, boss_id INTEGER, home_course_id INTEGER, disbanded_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS crew_members (
  id SERIAL PRIMARY KEY, crew_id INTEGER, player_id INTEGER, role TEXT DEFAULT 'member', xp INTEGER DEFAULT 0
);

-- Scorecards: a player's own round at a real course, scored hole by hole.
-- Purpose-built rather than reviving the legacy rounds/* stubs above, which
-- nothing reads and whose live columns predate the training pivot.
CREATE TABLE IF NOT EXISTS scorecards (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  holes INTEGER NOT NULL,
  par INTEGER NOT NULL DEFAULT 0,
  strokes INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scorecards_player ON scorecards(player_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scorecards_course ON scorecards(player_id, course_id);

-- Throw Lab rounds. Per-round aggregates are stored so challenge progress and
-- the game leaderboard are plain aggregate queries over this one table.
CREATE TABLE IF NOT EXISTS game_rounds (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'quick',
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  holes INTEGER NOT NULL,
  par INTEGER NOT NULL,
  strokes INTEGER NOT NULL,
  vs_par INTEGER NOT NULL,
  birdies INTEGER NOT NULL DEFAULT 0,
  eagles INTEGER NOT NULL DEFAULT 0,
  aces INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_rounds_player ON game_rounds(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rounds_period ON game_rounds(created_at DESC);

-- One row per challenge a player has finished in a given period. Progress
-- itself is computed from game_rounds; this table exists so a reward is paid
-- exactly once. period_key is the day, ISO week, month, or 'all'.
CREATE TABLE IF NOT EXISTS player_game_challenges (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenge_key TEXT NOT NULL,
  period TEXT NOT NULL,
  period_key TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  gold_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, challenge_key, period_key)
);
CREATE INDEX IF NOT EXISTS idx_pgc_player ON player_game_challenges(player_id, completed_at DESC);

-- One tournament per period. The course is drawn at random the first time a
-- period is asked for and then fixed, so everyone playing it gets the same 18
-- holes — a tournament where players got different courses would not be one.
-- course_name is denormalised: the course row can go (the placeholder prune
-- deletes rows), and a past tournament still has to say where it was played.
--
-- The kind column is what makes this table hold both the weekly and the daily.
-- It is part of the key rather than a separate table because everything else
-- about them is identical: the same entries, the same board, the same placing.
-- week_key holds the period key of whichever kind it is (an ISO week for the
-- weekly, a date for the daily); renaming a live column that six queries read
-- is a worse trade than a slightly stale name.
-- (No backticks in this file: SCHEMA_SQL is a JS template literal.)
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'weekly',
  week_key TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  course_name TEXT NOT NULL,
  holes INTEGER NOT NULL DEFAULT 18,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing databases have the pre-kind shape: the column missing and a bare
-- UNIQUE on week_key. Both are fixed here rather than in a migration file,
-- because this schema is applied on every boot and has to be able to move a
-- live table forward. Every statement is a no-op the second time it runs.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'weekly';
DO $$
BEGIN
  -- The old single-column unique would reject the daily that shares a key
  -- shape with nothing, but more importantly it is simply the wrong key now.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tournaments'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (week_key)'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE tournaments DROP CONSTRAINT ' || quote_ident(conname)
        FROM pg_constraint
       WHERE conrelid = 'tournaments'::regclass AND contype = 'u'
         AND pg_get_constraintdef(oid) = 'UNIQUE (week_key)'
    );
  END IF;
END $$;
-- One tournament per (kind, period). This is the lock behind the lazy create:
-- two players opening the app at the same moment race to INSERT, one wins, and
-- the loser's ON CONFLICT DO NOTHING plus a re-read gets them the same row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_kind_key ON tournaments(kind, week_key);

-- One row per attempt, written when the round STARTS. That is the whole point:
-- an entry is spent the moment it begins, so walking away from a bad round
-- costs it. Without that a player could restart until they liked the score.
-- status: in_progress -> completed (a score) or abandoned (left, no score).
CREATE TABLE IF NOT EXISTS tournament_entries (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  par INTEGER,
  strokes INTEGER,
  vs_par INTEGER,
  game_round_id INTEGER REFERENCES game_rounds(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tournament_id, player_id, attempt)
);
CREATE INDEX IF NOT EXISTS idx_tourn_entries_board
  ON tournament_entries(tournament_id, vs_par, completed_at);
CREATE INDEX IF NOT EXISTS idx_tourn_entries_player
  ON tournament_entries(player_id, tournament_id);

CREATE TABLE IF NOT EXISTS scorecard_holes (
  id SERIAL PRIMARY KEY,
  scorecard_id INTEGER NOT NULL REFERENCES scorecards(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL,
  par INTEGER NOT NULL DEFAULT 3,
  strokes INTEGER,
  UNIQUE (scorecard_id, hole_number)
);

-- Uploads pulled from the instructional channels' own YouTube feeds. One row
-- per video; video_id is unique, so a refresh that sees the same upload again
-- updates the title rather than duplicating it. Nothing here is
-- player-specific -- it is one shared feed, refreshed on a schedule.
CREATE TABLE IF NOT EXISTS channel_videos (
  id SERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  -- The feed states this outright: an entry's alternate link is /shorts/<id>
  -- for a Short and /watch?v=<id> otherwise. Shorts are recorded but kept out
  -- of the feed -- these channels post a lot of clips, and a section meant to
  -- be instructional filled up with them. Stored rather than dropped so
  -- showing them later is a query change, not another pull.
  is_short BOOLEAN NOT NULL DEFAULT FALSE,
  -- Whether the feed shows it, which is not the same question as whether it
  -- is a Short. Most channels post clips we do not want; a few teach entirely
  -- in Shorts -- Scott Stokely's uploads are 100% Shorts, so excluding them
  -- made adding him show nothing at all. A channel can opt in, and this column
  -- records the outcome so is_short stays a plain fact about the video.
  feed_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  -- Whether this upload teaches something, decided from its title by
  -- modules/videos/teaches.ts and written by the refresh job. The lounge
  -- ignores it; the training feed shows nothing else, because a round of
  -- tournament coverage under "new training videos" is a lie about what the
  -- app is for.
  teaches BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE channel_videos ADD COLUMN IF NOT EXISTS is_short BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channel_videos ADD COLUMN IF NOT EXISTS feed_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- A bug report without the app version, the page it happened on and the device
-- is a report you cannot act on. Captured by the client and stored beside the
-- message, so it survives even when the notification email does not.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS player_id INTEGER;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE channel_videos ADD COLUMN IF NOT EXISTS teaches BOOLEAN NOT NULL DEFAULT FALSE;

-- Lessons generated from a new channel upload, rather than hand written.
--
-- The 134 curated lessons leave this NULL and are never touched by the
-- generator. A generated lesson is an ADDITION to whichever existing category
-- the video teaches -- nothing is re-filed or replaced.
--
-- The PARTIAL unique index is the exactly-once lock: the refresh job runs daily
-- and on every boot, so without it a restart would publish the same video again.
-- Partial because NULL is not distinct from NULL in a UNIQUE index in Postgres
-- 15+ only with NULLS NOT DISTINCT, and the curated rows must stay unconstrained.
ALTER TABLE training_lessons ADD COLUMN IF NOT EXISTS generated_from_video TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_generated_video
  ON training_lessons(generated_from_video) WHERE generated_from_video IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_videos_teaches ON channel_videos(teaches, published_at DESC);
-- No backfill here on purpose. This file runs on every boot, so an UPDATE
-- setting feed_hidden = is_short would undo the per-channel shorts opt-in
-- every time the app restarted. The refresh job owns this column and
-- reconciles each channel on its own run, including on boot.
-- The newest list and the per-creator lists are the only two reads.
CREATE INDEX IF NOT EXISTS idx_channel_videos_recent ON channel_videos(feed_hidden, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_videos_channel ON channel_videos(channel_id, feed_hidden, published_at DESC);

-- ── Rewards: levelling pays gold, gold buys coupons, coupons are real money ──
-- (No backticks in this file: SCHEMA_SQL is a JS template literal.)

-- One row per level a player has ALREADY been paid for. The UNIQUE is the whole
-- mechanism: gold for a level is granted inside a transaction that inserts here
-- first, so a retry, a concurrent request, or a level recomputed after an XP
-- correction can never pay twice.
CREATE TABLE IF NOT EXISTS player_level_rewards (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  gold_awarded INTEGER NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, level)
);
CREATE INDEX IF NOT EXISTS idx_player_level_rewards_player ON player_level_rewards(player_id);

-- An issued coupon. This is a BEARER INSTRUMENT with a cash value, so the row
-- is written to be auditable on its own: who it belongs to, what was paid, what
-- it promises, when it dies, and who redeemed it.
--
-- title/terms/face_value_usd are DENORMALISED on purpose. The catalogue in
-- rewards.catalog.ts will be edited, and an outstanding coupon must keep
-- promising what it promised when it was issued -- the same reasoning as
-- tournaments.course_name. Reading the live catalogue at redemption time would
-- let an edit silently change what someone is already holding.
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  player_id INTEGER NOT NULL,
  type_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  terms TEXT NOT NULL,
  face_value_usd INTEGER NOT NULL DEFAULT 0,
  gold_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_note TEXT,
  emailed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_coupons_player ON coupons(player_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status, expires_at);

-- Lessons completed at the moment this coupon was issued.
--
-- Coupons are earned by crossing lesson thresholds rather than bought with gold,
-- so this is the basis of the entitlement and worth recording on the row: it is
-- what lets the count be audited later without replaying training_completions.
-- gold_spent stays for the rows issued under the old gold pricing, and reads 0
-- on everything issued since.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS lessons_at_issue INTEGER;

-- ── Lesson engagement: evidence that a lesson was actually opened ──
-- (No backticks in this file: SCHEMA_SQL is a JS template literal.)
--
-- completeLesson had no gate at all: an authenticated POST marked a lesson done
-- and paid full XP, so the whole 134-lesson library -- 25,750 XP, level 14,
-- 1,000 gold, and now real coupons -- was reachable by clicking through, or by
-- a script in seconds.
--
-- These rows are CLIENT-REPORTED and therefore not proof of anything. They are
-- not meant to be: the point is to make clicking through cost roughly what
-- engaging costs, so the cheap attack stops being cheap. The timestamps are the
-- SERVER's, never the client's, because a self-reported dwell time is just a
-- number the caller chose.
CREATE TABLE IF NOT EXISTS lesson_engagement (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lesson_engagement_lookup
  ON lesson_engagement(player_id, lesson_id, event, created_at);
`;
