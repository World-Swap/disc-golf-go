# Disc Golf Go — CLAUDE.md

## What this app does
Disc Golf Go is a mobile-first web app and Android native app where disc golfers track rounds, check in at real courses (GPS-gated), battle other players with disc golf trivia/challenges, earn XP and badges, and collect gold/vault items. Players must physically be at a course to start a round.

## Stack
Express.js + PostgreSQL (Neon) · Node.js · Deployed on Render · Android via Capacitor · Custom domain: discgolfgo.app

## Directory map
- `server.js` — app entry point; middleware + route mounts (wiring only)
- `routes/` — one file per feature area (auth, courses, rounds, battles, challenges, players, leaderboard, checkins, admin, vault, gold, upload, xp-engine, distance-analytics, delete-account, crews, crew-wars, story, feedback, reviews)
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
- `players` — user accounts, XP, stats, total_distance_m (lifetime GPS); total_birdies, total_aces, total_checkins, total_courses_visited, challenges_completed (admin-editable; admin stats endpoint computes live from source tables)
- `courses` — all disc golf courses globally (2,790+); GPS coords, holes, par, terrain, difficulty, fees, amenities, PDGA ID; `hole_details` JSONB per-hole par/distance; North Carolina has 110 courses, Minnesota has 66 courses, Georgia has 64 courses, Wisconsin has 57 courses, Ohio has 88+ courses (includes Idlewild, Brent Hambrick), Southern California has 34 courses
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
- `story_quests` — 40+ career quests across 8 chapters; types: main (sequential unlock) + side (parallel); each has trigger_event (ROUND_COMPLETE, BATTLE_WIN, etc.), target_value, reward_xp/gold/badge/item; quest types: main (28 total) and side (16+)
- `quest_progression` — per-player quest progress; tracks progress count, completed flag, completed_at; auto-populated via DB triggers on rounds and checkins; manually checked via routes/story.js engine for event-based quests
- `xp_log` — XP transaction log for story quest rewards and other sources; player_id, source, amount, context, created_at
- `feedback` — visitor-submitted feedback from the landing page; name (optional), email (optional), category (Feedback/Suggestion/Bug Report), message, created_at; indexes on category and created_at
- `course_reviews` — player star ratings (1–5) and text reviews per course; one review per player per course; unique constraint on (player_id, course_id)

## External integrations
- **Neon PostgreSQL** — database (DATABASE_URL env var); shared between staging and production
- **Render** — hosting (web service); auto-deploy on push to main
- **Cloudflare R2** — image/asset CDN (via POLSIA_R2_BASE_URL)
- **Polsia API** — Stripe payment verification (POLSIA_API_URL)
- **Capacitor / GitHub Actions** — Android AAB + iOS IPA CI/CD; iOS uploads to TestFlight via App Store Connect API; see `IOS_BUILD.md`

## Recent changes
- 2026-06-01: Added course rating and review API endpoints — POST/DELETE `/api/courses/:id/reviews` (authenticated), GET `/api/courses/:id/reviews` (public with avg_rating + total_reviews summary). Migration creates `course_reviews` table with unique constraint per player-course pair.
- 2026-05-30: Fixed Android AAB zero permissions — `cap sync` was stripping permissions from AndroidManifest.xml. Added `scripts/ensure-android-permissions.js` post-sync hook that verifies and restores ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, INTERNET permissions and GPS hardware feature. Wired as `capacitor:sync:after` hook and prepended to all android build scripts in package.json.
- 2026-05-30: Widened check-in radius from 500m to 800m — real-world GPS error on Android (50-200m) + course coordinate variance (parking lot vs basket) caused false "too far" failures. 800m accommodates a 600m course span + 150m GPS error with margin. Updated CHECKIN_RADIUS_METERS in `routes/checkins.js`, checkin_only bounding box in `routes/courses.js`, and all 500m thresholds in `public/checkin.html`.
- 2026-05-30: Fixed Android check-in location bug — removed Capacitor plugin dependency, uses `navigator.geolocation` (browser API) with user-agent detection (`appendUserAgent: 'DiscGolfGoApp'` + Android WebView `wv` token) for platform-appropriate error messages.
- 2026-05-29: Fixed Android profile empty data bug — SW_POLICY guard was throwing uncaught error that killed the entire `<script>` block in `profile.html`, preventing `loadProfile()` from running on Capacitor native builds. Converted throw to console.warn. Also: hid profile-content by default (prevents placeholder flash), wired `/api/players/me` to return real checkin/course/badge stats from DB instead of hardcoded zeros.
- 2026-05-28: GPS adaptive accuracy + battery optimization: motion-triggered GPS (pause when stationary >30s via DeviceMotionEvent stdDev, resume on movement), battery-aware interval halving (5s→10s when battery <20%), batch upload (20-point buffer + 15s flush timer) via new POST /api/rounds/:id/track-batch; Douglas-Peucker polyline smoothing preserved.
