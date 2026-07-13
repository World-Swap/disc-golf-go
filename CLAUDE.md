# Disc Golf Go — CLAUDE.md

## What this app does
Disc Golf Go is a mobile-first web app and Android native app where disc golfers track rounds, check in at real courses (GPS-gated), battle other players with disc golf trivia/challenges, earn XP and badges, and collect gold/vault items. Players must physically be at a course to start a round.

## Stack
Express.js + PostgreSQL (Neon) · Node.js · Deployed on Render · Android via Capacitor · Custom domain: discgolfgo.app

## Directory map
- `server.js` — app entry point; middleware + route mounts (wiring only)
- `routes/` — one file per feature area (auth, courses, rounds, battles, challenges, players, leaderboard, checkins, admin, vault, gold, upload, xp-engine, distance-analytics, delete-account, crews, crew-wars, story, feedback, reviews, referrals, onboarding, campaign, training, training-notifications)
- `migrations/` — node-pg-migrate SQL migration files; all DDL lives here
- `middleware/` — auth middleware (JWT validation)
- `public/` — static frontend assets (HTML, CSS, JS, images); `app.css` is the unified design system (tokens, shared components) linked by all app pages
- `lib/` — shared utilities
- `scripts/` — one-off scripts (linting, audits, iOS patch, Android branding: generate-capacitor-assets-sources.js, write-android-styles.js, generate-ios-splash.js, bump-android-version.js, ensure-android-permissions.js)
- `android/` — Capacitor-generated Android native project; committed with branded icons/splash assets
- `resources/` — @capacitor/assets source images (icon-only.png, icon-background.png, splash.png, splash-dark.png); `AppIcon.appiconset/` holds iOS 1024x1024 icon
- `debug/` — debug/test utilities (not in production path)

## Database
- `beta_signups` — Android closed beta waitlist; name, email (unique), created_at
- `password_reset_tokens` — single-use 1-hour tokens for password reset flow; invalidated after use
- `players` — user accounts, XP, stats, total_distance_m (lifetime GPS); is_guest, onboarding_completed, onboarding_skipped, experience_level (new/experienced), guest_uuid (for guest players); total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed (admin-editable; admin stats endpoint computes live from source tables)
- `onboarding_events` — tracks onboarding funnel events (onboard_loaded, experience_selected, tutorial_started/completed/skipped, signup_prompted, guest_played_first_throw) per player/session; powers skip rate and completion analytics
- `courses` — all disc golf courses globally (3,550+); GPS coords, holes, par, terrain, difficulty, fees, amenities, PDGA ID; `hole_details` JSONB per-hole par/distance; Texas has 425 courses (Houston, Austin, San Antonio, Dallas/Fort Worth, Lubbock, El Paso, Tyler/East TX), North Carolina has 110 courses, Minnesota has 66 courses, Georgia has 64 courses, Wisconsin has 57 courses, Ohio has 88+ courses (includes Idlewild, Brent Hambrick), California has 160+ courses
- `checkins` — player GPS check-ins at courses (gates round start/end)
- `rounds` — active/completed rounds; hole-by-hole scoring; `layout_id` FK to course_layouts (nullable, ON DELETE SET NULL)
- `round_holes` — per-hole scores within rounds
- `round_tracking` — GPS path data during rounds
- `round_analytics` — derived distance/stats from round_tracking
- `achievements` — earned badges/milestones per player
- `player_challenges` — active challenge assignments
- `player_challenge_slots` — slot state within challenges
- `battles` — PvP battle sessions between players
- `battle_scores` — per-hole battle scoring
- `battle_item_choices` — item selections in battles
- `usd_transactions` — real-money transactions (placeholder; no IAP active)
- `pageviews` — analytics page view tracking
- `deletion_requests` — GDPR/CCPA account deletion requests
- `round_players` — group round roster (player_id, round_id, is_host); one row per player per round
- `round_player_holes` — per-player per-hole scores for co-players (host scores stay in round_holes)
- `admin_audit_log` — tracks all admin stat modifications (player_id, action, field, old/new value, timestamp)
- `player_course_bests` — one row per (player, course) tracking best score_vs_par and best_round_id; updated on each round completion
- `notifications` — admin-composed in-app notifications; id, title, message, is_active, created_at
- `user_notification_dismissals` — tracks which players have permanently dismissed which notifications; player_id, notification_id, dismissed_at
- `admin_emails` — audit log of admin email blasts; subject, body, recipient_type (all/individual), recipients JSONB, recipient_count, status (sent/partial/failed), sent_at
- `course_layouts` — named hole configurations per course (e.g. "Default", "Short Loop"); is_default flag; one default per course
- `course_holes` — per-hole par/distance/notes records for a given layout; unique per (layout_id, hole_number)
- `crews` — crew groups; boss_id, home_course_id, logo_url, disbanded_at (soft delete)
- `crew_members` — one row per (crew, player); role: boss / manager / member (manager = boss minus disband/transfer); `xp` column tracks per-member crew XP (non-transferable)
- `crew_invites` — URL-safe invite tokens; 7-day expiry; accepted_at marks use
- `crew_gold` — crew treasury; one row per crew (gold balance)
- `crew_rounds` — one row per crew group play session; links to host round, course, crew
- `crew_round_players` — links each player's round_id to a crew_round session; unique per (crew_round, player)
- `crew_wars` — crew-vs-crew war sessions; challenging/defending crew IDs, course, duration, timer; `challenge_type` (target/open), `window_duration_hours` (open challenges), `scheduled_start_at` (deferred target challenges); no entry fee — platform funds winner reward
- `crew_war_players` — best round per player per war; auto-linked on round completion at war course
- `crew_notifications` — crew-level alerts (war_started, war_ended, war_challenge); sent to crew bosses/managers; with read_at tracking
- `crew_items` — items won by crew via war victories; id, crew_id, item_type (cosmetic/xp_boost/gold_boost/badge), item_name, assigned_to (player_id nullable), war_id; boss/manager distributes via vault UI
- `story_chapters` — 8 career chapters (First Flight → Disc Golf Immortal); locked/unlocked per-player based on main quest completion; chapters unlock sequentially as main quests are completed
- `story_quests` — 40+ career quests across 8 chapters; types: main (sequential unlock) + side (parallel); each has trigger_event (ROUND_COMPLETE, BATTLE_WIN, TRAINING_COMPLETE, etc.), target_value, reward_xp/gold/badge/item; `mission_type` column (watch_and_learn / skill_check / course_apply / daily_challenge), `training_link` (category slug hint), `is_daily` flag; quest types: main (28 total) and side (16+)
- `quest_progression` — per-player quest progress; tracks progress count, completed flag, completed_at; auto-populated via DB triggers on rounds and checkins; manually checked via routes/story.js engine for event-based quests
- `xp_log` — XP transaction log for story quest rewards and other sources; player_id, source, amount, context, created_at
- `daily_challenge_pool` — pool of daily training challenges (watch_and_learn / skill_check / course_apply / general); key, title, description, xp_reward, gold_reward, training_slug; round-robins assignment to players at midnight UTC
- `player_daily_challenges` — player daily challenge assignments; unique per (player_id, challenge_date); denormalized title/desc/xp/gold so reads don't join; progress + completed tracking with rewards awarded on completion
- `quest_progression` — per-player quest progress; tracks progress count, completed flag, completed_at; auto-populated via DB triggers on rounds and checkins; manually checked via routes/story.js engine for event-based quests
- `xp_log` — XP transaction log for story quest rewards and other sources; player_id, source, amount, context, created_at
- `feedback` — visitor-submitted feedback from the landing page; name (optional), email (optional), category (Feedback/Suggestion/Bug Report), message, created_at; indexes on category and created_at
- `course_reviews` — player star ratings (1–5) and text reviews per course; one review per player per course; unique constraint on (player_id, course_id)
- `referral_codes` — per-player unique 8-char invite codes (unlimited or max_uses); nullable expires_at
- `referral_activations` — tracks every referral from click through reward; status: pending/activated/rewarded; referrer_id, friend_id, code_used, expires_at, reward_type, reward_amount; drives gold/XP reward tiers
- `referral_events` — analytics funnel events: referral_link_clicked, referral_share, referral_signup, referral_first_round; tracks code, referrer_id, user_id, user_agent, referer, created_at
- `training_categories` — skill topic groups for the training content library; name, slug, icon, sort_order, is_active, skill_level (enum: beginner/intermediate/advanced/all_levels)
- `training_lessons` — individual lessons within categories; title, slug, description, content_type (tip_card/guide/video_embed/quiz), content_body JSONB, difficulty, xp_reward, sort_order, skill_level (enum: beginner/intermediate/advanced/all_levels); 7 categories with 72 lessons as of 2026-06-27
- `training_completions` — per-player lesson completion tracking; unique per (player_id, lesson_id); drives XP awards via POST endpoint
- `player_training_notification_settings` — per-player notification preferences; tips_on/off + frequency, reminders_on/off, mission_alerts_on/off, achievement_alerts_on/off, push_enabled
- `training_notifications` — individual training notifications per player; type (daily_tip/training_reminder/mission_alert/achievement/reengagement), title, message, lesson_id FK, is_read, created_at; unread count indexed
- `training_milestones` — per-player training achievement milestones; milestone_key (e.g. first_lesson, lessons_10), reward_gold; unique per (player_id, milestone_key); awarded atomically during lesson completion

## External integrations
- **Neon PostgreSQL** — database (DATABASE_URL env var); shared between staging and production
- **Render** — hosting (web service); auto-deploy on push to main
- **Cloudflare R2** — image/asset CDN (via POLSIA_R2_BASE_URL)
- **Polsia API** — Stripe payment verification (POLSIA_API_URL)
- **Capacitor / GitHub Actions** — Android AAB + iOS IPA CI/CD; iOS uploads to TestFlight via App Store Connect API; see `IOS_BUILD.md`

## Recent changes
- 2026-06-27: Training content expansion — added 32 lessons (+2 new categories: Tournament & Competition, Rules & Etiquette), expanded Course Strategy (+6), Mental Game (+4), Form & Technique (+4), Disc Selection (+2). Total: 72 lessons across 7 categories. No API changes — existing endpoints auto-serve new content.
- 2026-06-23: Bug fix — restored missing DB tables/columns from failed pivot migrations. Migration `fix_missing_pivot_tables` creates: `training_milestones`, `daily_challenge_pool`, `player_daily_challenges`, `onboarding_events`, and adds `story_quests.mission_type/training_link/is_daily` columns. Seeds 7 starter daily challenges. Fixes `/api/home/state`, `/api/story/missions`, `/api/story/daily`, `/api/training/milestones`, and onboarding event tracking.
- 2026-06-23: Training Content Expansion — 3 New Categories + Advanced Tier. Migration adds `skill_level` column (enum: beginner/intermediate/advanced/all_levels) to `training_categories` and `training_lessons`. Three new categories seeded: Course Strategy (10 lessons), Mental Game (7 lessons), Fitness & Warmup (7 lessons) — 24 new lessons total. Two advanced lessons added to Form & Technique and two to Disc Selection. `GET /api/training/categories` and `/categories/:slug/lessons` support `?level=` filter. `training.html` updated with "Advanced" and "All Levels" filter tabs; category cards show level badge; lesson list shows skill level badge.
- 2026-06-23: Training Missions — Quest System Rebrand. Quests tab → Training Missions tab. New `mission_type` (watch_and_learn / skill_check / course_apply / daily_challenge) and `training_link` columns on `story_quests`. New `daily_challenge_pool` + `player_daily_challenges` tables. `GET /api/story/missions` returns missions + daily challenge. `GET /api/story/daily` returns today's challenge (auto-assigns if none). Lesson completion (`POST /api/training/completions`) fires `checkMissionsFromTraining` + `advanceDailyChallenge` triggers. `scripts/daily-challenge-assign.js` runs at midnight UTC. New `public/missions.html` with daily challenge banner, mission type badges, progress bars. Seeded Watch & Learn + Skill Check + Course Apply missions across chapters 1-2. All crons in `polsia.toml` [[crons]].
- 2026-06-23: XP/Progression Redesign — Training Completion + Skill Tiers. New `training_streaks` table + `xp_transactions.source` column. `POST /api/training/completions` now awards: lesson XP + streak bonus (3+ consecutive days = 25 XP) + category completion bonus (100 XP when all lessons done). `GET /api/players/xp-history` returns source breakdown, training stats, milestones, weekly XP. `routes/xp-engine.js` adds `getSkillTier/getSkillTierProgress` (Rookie/Player/Advanced/Pro from XP). `GET /api/players/me` includes `skill_tier` + `skill_tier_progress`. `GET /api/leaderboard` includes tier per player. `home.html` shows skill tier badge in level banner. `profile.html` gets skill tier pill + XP breakdown section. `training.html` adds level-up celebration overlay with confetti animation + bonus XP toasts for streaks/category complete.
- 2026-06-23: Home Screen Redesign — Training First Navigation. New `GET /api/home/state` endpoint in `routes/training.js` aggregates player stats + training progress for the home screen. New `public/home.html` — training-first home screen with XP level banner, daily challenge, per-category training progress, next recommended lesson, and "Apply Your Training" play CTA. Root (`/`) now serves home.html (client-side auth check). All 16+ app pages updated to new 6-tab bottom nav: Home · Training · Play · Ranks · Vault · Profile. Onboarding completion now redirects to `/home` (not `/scorecard`). Training is the default entry point for all users.
- 2026-06-23: Skill Assessment — Skill Level Tracking + Recommendations. New `GET /api/training/recommendations` returns personalized next lesson, category focus, and advanced content for the player's skill tier. Training Profile section added to profile.html (skill badge, overall progress bar, per-category progress, next recommended lesson, training streak). Training hub (training.html) shows tier-appropriate headline, skill tier badge, and recommended lesson card. Leaderboard now shows skill tier badge (icon + tier name) next to each player's level pill. new route `routes/training.js` with GET /categories, /categories/:slug/lessons, /lessons/:id, /completions, /progress; single-page JS-routed `public/training.html` handles hub, category, and lesson views; seeded 2 categories (Form & Technique, Disc Selection) with 10 lessons (tip_card + guide types); XP awards on completion, idempotent re-completion; no GPS dependency.
- 2026-06-19: Added `routes/campaign.js` — internal bulk ops including POST `/api/internal/referral-campaign` which generates missing referral codes and sends personalized referral emails to all players with accounts.
- 2026-06-10: Implemented onboarding flow re-sequence — deferred registration (guest play first), collapsed tutorial to 1 interactive throw step with contextual tooltip, added "Play as Guest" default CTA and "Have you played before?" experience-level path (experienced skips to course select); scorecard.html guards with /api/onboarding/status redirect; analytics tracked in `onboarding_events` table per event type/cohort; `routes/onboarding.js` and `public/onboard.html`.
- 2026-06-10: Added "Bring a Friend" referral program landing page (`public/referrals.html`), API (`routes/referrals.js`) with GET /api/referrals/me, GET /api/referrals/validate/:code, POST /api/referrals/claim; migration creates `referral_codes` and `referral_redemptions` tables; register.html shows referral banner and auto-claims on signup; tier rewards: 1=50G, 3=150G+100XP, 5=250G+250XP, 10=500G+500XP; new player gets +25 XP on claim.
- 2026-06-03: Imported ~256 Texas courses from PDGA directory (Dallas, Houston, Austin, San Antonio, Fort Worth, El Paso, Lubbock, Tyler/East TX) with Default layouts. TX total now 425 courses. Script: `scripts/insert-texas-courses.js`.
- 2026-06-03: Client-side UI locking for battle/crew war scorecards — `GET /api/battles/:id/locked-params` and `GET /api/crew/wars/:id/locked-params` return locked course/layout/holes; scorecard.html checks for `?battle_id=` or `?crew_war_id=` URL params, pre-locks course search, layout picker, hole picker, and multiplayer section; 422 responses surface a clear "round doesn't match the battle requirements" message.
- 2026-06-02: Imported ~110 Northern & Central California courses (Sacramento, Fresno/Clovis, Stockton/Modesto, Bakersfield/Visalia/Hanford, East Bay, Chico/Redding) with Default layouts and par-3 hole records; plus 13 new Central Valley courses with accurate PDGA GPS coordinates. CA total now ~160 courses.
- 2026-06-01: Added course rating and review API endpoints — POST/DELETE `/api/courses/:id/reviews` (authenticated), GET `/api/courses/:id/reviews` (public with avg_rating + total_reviews summary). Migration creates `course_reviews` table with unique constraint per player-course pair.
- 2026-05-30: Widened check-in radius from 500m to 800m — real-world GPS error on Android (50-200m) + course coordinate variance (parking lot vs basket) caused false "too far" failures. 800m accommodates a 600m course span + 150m GPS error with margin. Updated CHECKIN_RADIUS_METERS in `routes/checkins.js`, checkin_only bounding box in `routes/courses.js`, and all 500m thresholds in `public/checkin.html`.
