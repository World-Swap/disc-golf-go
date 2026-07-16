// src/db/schema.ts — full schema reconstruction (the live DB was empty).
// Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, safe to
// run on every boot. Columns reconstructed from the repo queries + CLAUDE.md.
// Tables for dropped features (rounds/battles/crews) are created empty because
// some read/delete paths still reference them.

export const SCHEMA_SQL = `
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
`;
