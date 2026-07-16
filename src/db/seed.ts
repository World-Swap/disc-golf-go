// src/db/seed.ts — starter content for a fresh database. Applied once (guarded
// by an empty training_categories check). Real disc-golf training content:
// lessons link to pro instructional channels, resources to company/pro guides.

export const SEED_SQL = `
-- ── training categories ───────────────────────────────────────────────────
INSERT INTO training_categories (name, slug, description, icon, sort_order, skill_level) VALUES
  ('Form & Technique', 'form-technique', 'Grip, stance, reach-back and follow-through — the foundation of every throw.', '🥏', 1, 'all_levels'),
  ('Putting', 'putting', 'Dial in your circle 1 and circle 2 game.', '🎯', 2, 'all_levels'),
  ('Driving & Distance', 'driving', 'Add controlled distance off the tee.', '🚀', 3, 'all_levels'),
  ('Disc Selection', 'disc-selection', 'Flight numbers, stability, and building your bag.', '💿', 4, 'all_levels'),
  ('Mental Game', 'mental-game', 'Focus, routine, and composure under pressure.', '🧠', 5, 'all_levels'),
  ('Course Strategy', 'course-strategy', 'Course management, risk/reward, and reading conditions.', '🗺️', 6, 'all_levels');

-- ── lessons (video_embed with a pro channel + rich description) ────────────
INSERT INTO training_lessons (category_id, title, slug, description, difficulty, content_type, content_body, xp_reward, sort_order, youtube_url, youtube_title, youtube_channel) VALUES
  ((SELECT id FROM training_categories WHERE slug='form-technique'), 'Backhand Basics', 'backhand-basics', 'Grip, stance and a smooth pull for a repeatable backhand.', 'beginner', 'video_embed', '{"sections":[{"heading":"Grip","body":"Power grip: four fingers under the rim, firm but not tense."},{"heading":"Pull","body":"Lead with the elbow, keep the disc close to your chest, and pull across your body in a straight line."}]}', 15, 1, 'https://www.youtube.com/@OverthrowDiscGolf', 'Backhand form fundamentals', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='form-technique'), 'Reach Back & Timing', 'reach-back-timing', 'Sequence your reach-back so power arrives at release, not before.', 'intermediate', 'video_embed', '{"sections":[{"heading":"Timing","body":"Weight shifts from back to front foot as the disc reaches full extension."}]}', 15, 2, 'https://www.youtube.com/@dannylindahl', 'Timing & the swing', 'Danny Lindahl'),
  ((SELECT id FROM training_categories WHERE slug='form-technique'), 'Forehand Fundamentals', 'forehand-flick', 'Build a reliable flick for shot-shaping and control.', 'intermediate', 'video_embed', '{"sections":[{"heading":"Grip","body":"Two fingers against the inside rim; use a firm wrist snap."}]}', 15, 3, 'https://www.youtube.com/@FoundationDiscGolf', 'Forehand for beginners', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='form-technique'), 'Balance & Follow-Through', 'follow-through', 'Stay balanced through release for consistency and accuracy.', 'beginner', 'tip_card', '{"tips":["Finish with your weight on your front foot.","Let your momentum rotate you toward the target.","A controlled finish means a controlled throw."]}', 10, 4, 'https://www.youtube.com/@DiscGolfStrong', 'Balance in your throw', 'Disc Golf Strong'),

  ((SELECT id FROM training_categories WHERE slug='putting'), 'Putting Stance & Grip', 'putting-stance', 'A stable base and repeatable grip for circle 1.', 'beginner', 'video_embed', '{"sections":[{"heading":"Stance","body":"Staggered or square — pick one and repeat it every time."}]}', 15, 1, 'https://www.youtube.com/@RobbieCDiscGolf', 'Putting fundamentals', 'Robbie C Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='putting'), 'Push vs Spin Putt', 'push-putt-vs-spin', 'Understand the two putting styles and choose yours.', 'intermediate', 'guide', '{"sections":[{"heading":"Push","body":"Uses body and legs to loft the disc — steady in wind."},{"heading":"Spin","body":"Uses wrist snap for a flatter, faster line."}]}', 15, 2, 'https://www.youtube.com/@OverthrowDiscGolf', 'Push vs spin putting', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='putting'), 'Build a Putting Routine', 'putting-routine', 'A pre-putt routine that holds up under pressure.', 'intermediate', 'tip_card', '{"tips":["Same footwork every putt.","One deep breath before release.","Commit to the line — never decelerate."]}', 10, 3, 'https://www.youtube.com/@FoundationDiscGolf', 'Putting routine', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='putting'), 'Putting in Wind', 'windy-putting', 'Adjust height and power for headwinds and tailwinds.', 'advanced', 'tip_card', '{"tips":["Headwind: putt lower and firmer.","Tailwind: reduce power, the wind carries it.","Crosswind: aim into the wind side of the basket."]}', 20, 4, 'https://www.youtube.com/@dannylindahl', 'Wind putting', 'Danny Lindahl'),

  ((SELECT id FROM training_categories WHERE slug='driving'), 'The X-Step', 'x-step', 'A rhythmic run-up that builds momentum into the throw.', 'intermediate', 'video_embed', '{"sections":[{"heading":"Rhythm","body":"Walk it slowly first; the X-step is about timing, not speed."}]}', 15, 1, 'https://www.youtube.com/@dannylindahl', 'The X-step explained', 'Danny Lindahl'),
  ((SELECT id FROM training_categories WHERE slug='driving'), 'Hyzer & Anhyzer', 'hyzer-anhyzer', 'Shape shots with disc angle.', 'beginner', 'guide', '{"sections":[{"heading":"Hyzer","body":"Top edge tilted toward you — the disc finishes left (RHBH)."},{"heading":"Anhyzer","body":"Top edge tilted away — the disc finishes right (RHBH)."}]}', 15, 2, 'https://www.youtube.com/@FoundationDiscGolf', 'Hyzer vs anhyzer', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='driving'), 'Distance Mechanics', 'distance-mechanics', 'Where distance really comes from — and where it does not.', 'advanced', 'video_embed', '{"sections":[{"heading":"Leverage","body":"Distance is timing and leverage, not arm strength."}]}', 20, 3, 'https://www.youtube.com/@OverthrowDiscGolf', 'How to throw farther', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='driving'), 'Understanding Disc Speed', 'disc-speed', 'Why faster discs are not always farther for you.', 'beginner', 'tip_card', '{"tips":["Slower discs are easier to control and often go farther for new players.","Arm speed must match disc speed.","Start with speed 5-7 fairway drivers."]}', 10, 4, 'https://www.youtube.com/@DiscGolfStrong', 'Disc speed for beginners', 'Disc Golf Strong');

INSERT INTO training_lessons (category_id, title, slug, description, difficulty, content_type, content_body, xp_reward, sort_order, youtube_url, youtube_title, youtube_channel) VALUES
  ((SELECT id FROM training_categories WHERE slug='disc-selection'), 'Reading Flight Numbers', 'flight-numbers', 'Speed, glide, turn and fade — what the four numbers mean.', 'beginner', 'guide', '{"sections":[{"heading":"The four numbers","body":"Speed / Glide / Turn / Fade. Turn is high-speed behavior, Fade is low-speed finish."}]}', 15, 1, 'https://www.youtube.com/@FoundationDiscGolf', 'Flight numbers explained', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='disc-selection'), 'Best Discs for Beginners', 'starter-discs', 'A short, forgiving starter lineup.', 'beginner', 'tip_card', '{"tips":["Putter: a straight, comfortable putt & approach disc.","Midrange: a stable, do-everything mid.","Fairway driver: a controllable speed 6-7."]}', 10, 2, 'https://www.youtube.com/@OverthrowDiscGolf', 'Best beginner discs', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='disc-selection'), 'Building Your First Bag', 'building-a-bag', 'Cover every distance with as few discs as possible.', 'intermediate', 'guide', '{"sections":[{"heading":"Slots","body":"Putter, approach, straight mid, overstable mid, fairway, distance driver."}]}', 15, 3, 'https://www.youtube.com/@FoundationDiscGolf', 'Building a bag', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='disc-selection'), 'Understanding Stability', 'stability-explained', 'Overstable, stable, understable — and when to use each.', 'intermediate', 'tip_card', '{"tips":["Understable: turns right, good for beginners and turnovers (RHBH).","Overstable: fights turn, reliable in wind and forehands."]}', 15, 4, 'https://www.youtube.com/@dannylindahl', 'Disc stability', 'Danny Lindahl'),

  ((SELECT id FROM training_categories WHERE slug='mental-game'), 'Pre-Shot Routine', 'pre-shot-routine', 'A repeatable routine that quiets the mind.', 'beginner', 'tip_card', '{"tips":["Pick your line before you step up.","One practice motion, then commit.","Same routine on hole 1 and hole 18."]}', 10, 1, 'https://www.youtube.com/@DiscGolfStrong', 'Mental routine', 'Disc Golf Strong'),
  ((SELECT id FROM training_categories WHERE slug='mental-game'), 'Staying Present', 'staying-present', 'Play one shot at a time.', 'intermediate', 'guide', '{"sections":[{"heading":"One shot","body":"You can only throw the shot in front of you. Score takes care of itself."}]}', 15, 2, 'https://www.youtube.com/@FoundationDiscGolf', 'Focus on the course', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='mental-game'), 'Bounce Back', 'bounce-back', 'Reset after a bogey so it does not become three.', 'intermediate', 'tip_card', '{"tips":["Take a breath and let the last hole go.","Play the safe, high-percentage next shot."]}', 15, 3, 'https://www.youtube.com/@OverthrowDiscGolf', 'Mental reset', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='mental-game'), 'Practice with Purpose', 'practice-mindset', 'Fieldwork and putting drills that actually transfer.', 'advanced', 'guide', '{"sections":[{"heading":"Reps","body":"Track makes and misses. Practice the shots you fear, not the ones you love."}]}', 20, 4, 'https://www.youtube.com/@dannylindahl', 'Practice that works', 'Danny Lindahl'),

  ((SELECT id FROM training_categories WHERE slug='course-strategy'), 'Course Management 101', 'course-management', 'Score by avoiding big numbers, not chasing birdies.', 'beginner', 'guide', '{"sections":[{"heading":"Play your game","body":"Choose the shot you can hit 8 out of 10 times."}]}', 15, 1, 'https://www.youtube.com/@FoundationDiscGolf', 'Course management', 'Foundation Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='course-strategy'), 'Risk vs Reward', 'risk-reward', 'When to go for it and when to lay up.', 'intermediate', 'tip_card', '{"tips":["Weigh the birdie upside against the bogey downside.","Water and OB change the math — respect them."]}', 15, 2, 'https://www.youtube.com/@OverthrowDiscGolf', 'Risk vs reward', 'Overthrow Disc Golf'),
  ((SELECT id FROM training_categories WHERE slug='course-strategy'), 'Reading Wind & Weather', 'reading-wind', 'Let conditions pick your disc and line.', 'advanced', 'guide', '{"sections":[{"heading":"Wind","body":"Overstable into a headwind; understable with a tailwind."}]}', 20, 3, 'https://www.youtube.com/@dannylindahl', 'Playing in wind', 'Danny Lindahl'),
  ((SELECT id FROM training_categories WHERE slug='course-strategy'), 'Scouting a New Hole', 'scouting-holes', 'A quick checklist before you tee off somewhere new.', 'beginner', 'tip_card', '{"tips":["Find the trouble first (OB, water, dense woods).","Pick a landing zone, then a disc to reach it."]}', 10, 4, 'https://www.youtube.com/@DiscGolfStrong', 'Scouting holes', 'Disc Golf Strong');

-- ── resources (blogs / guides / reports from companies & pros) ─────────────
INSERT INTO lesson_resources (lesson_id, title, url, author, credentials, resource_type, display_order) VALUES
  ((SELECT id FROM training_lessons WHERE slug='backhand-basics'), 'How to Throw a Backhand', 'https://udisc.com/blog/post/how-to-throw-a-disc-golf-backhand', 'UDisc', 'UDisc Learn', 'article', 1),
  ((SELECT id FROM training_lessons WHERE slug='forehand-flick'), 'Forehand Technique Guide', 'https://www.innovadiscs.com/home/disc-golf-education/', 'Innova Discs', 'Manufacturer education', 'guide', 1),
  ((SELECT id FROM training_lessons WHERE slug='flight-numbers'), 'Understanding Flight Ratings', 'https://www.innovadiscs.com/home/disc-golf-faq/flight-ratings-system/', 'Innova Discs', 'Flight rating system', 'guide', 1),
  ((SELECT id FROM training_lessons WHERE slug='starter-discs'), 'Best Discs for Beginners', 'https://udisc.com/blog/post/best-disc-golf-discs-for-beginners', 'UDisc', 'UDisc Learn', 'article', 1),
  ((SELECT id FROM training_lessons WHERE slug='putting-routine'), 'The Mental Side of Putting', 'https://udisc.com/blog', 'UDisc', 'UDisc Learn', 'article', 1),
  ((SELECT id FROM training_lessons WHERE slug='course-management'), 'Course Management Tips', 'https://www.dgpt.com/news/', 'Disc Golf Pro Tour', 'Pro tour coverage', 'report', 1);

-- ── daily challenge pool ───────────────────────────────────────────────────
INSERT INTO daily_challenge_pool (key, title, description, challenge_type, target_value, xp_reward, gold_reward) VALUES
  ('daily_lesson', 'Learn Something New', 'Complete one training lesson today.', 'watch_and_learn', 1, 30, 10),
  ('daily_two', 'Double Down', 'Complete two training lessons today.', 'skill_check', 2, 60, 20),
  ('daily_category', 'Focus Session', 'Complete a lesson in your weakest category.', 'course_apply', 1, 40, 15);

-- ── shop items + boosts ────────────────────────────────────────────────────
INSERT INTO items (name, description, icon, type, effect_value, duration_minutes, rarity, gold_cost) VALUES
  ('XP Boost', '+50% XP for 1 hour.', '🔥', 'boost_xp', 50, 60, 'uncommon', 150),
  ('Gold Boost', '+50% gold for 1 hour.', '💰', 'boost_gold', 50, 60, 'uncommon', 150),
  ('Focus Token', 'A cosmetic badge of dedication.', '🎯', 'cosmetic', 0, 0, 'rare', 300);

INSERT INTO vault_items (name, description, icon, rarity, type, effect_value, duration_minutes) VALUES
  ('XP Boost', '+50% XP for 1 hour.', '🔥', 'uncommon', 'boost_xp', 50, 60),
  ('Gold Boost', '+50% gold for 1 hour.', '💰', 'uncommon', 'boost_gold', 50, 60);

-- ── story missions (Training Missions tab) ─────────────────────────────────
INSERT INTO story_quests (quest_key, title, description, objective, chapter_number, quest_type, mission_type, training_link, trigger_event, trigger_conditions, target_value, reward_xp, reward_gold, sort_order) VALUES
  ('m_first_lesson', 'First Flight', 'Complete your very first training lesson.', 'Complete 1 lesson', 1, 'main', 'watch_and_learn', 'form-technique', 'TRAINING_COMPLETE', '{}', 1, 50, 25, 1),
  ('m_form_focus', 'Dial the Form', 'Complete 3 Form & Technique lessons.', 'Complete 3 form lessons', 1, 'side', 'skill_check', 'form-technique', 'TRAINING_COMPLETE', '{"category_slug":"form-technique"}', 3, 100, 50, 2),
  ('m_putting_pro', 'Circle 1 Lock', 'Complete 3 Putting lessons.', 'Complete 3 putting lessons', 1, 'side', 'skill_check', 'putting', 'TRAINING_COMPLETE', '{"category_slug":"putting"}', 3, 100, 50, 3),
  ('m_five_lessons', 'Student of the Game', 'Complete 5 lessons total.', 'Complete 5 lessons', 1, 'main', 'watch_and_learn', NULL, 'TRAINING_COMPLETE', '{}', 5, 150, 75, 4);

-- ── a few starter courses (Play / Courses tab) ─────────────────────────────
INSERT INTO courses (name, city, state, country, lat, lng, holes, hole_count, par, difficulty, pdga_rating) VALUES
  ('Maple Hill', 'Leicester', 'MA', 'US', 42.2470, -71.9090, 18, 18, 55, 'advanced', '1000'),
  ('Winthrop Gold (Fox Run Meadows)', 'Rock Hill', 'SC', 'US', 34.9330, -81.0290, 18, 18, 68, 'advanced', '1000'),
  ('DeLaveaga', 'Santa Cruz', 'CA', 'US', 36.9950, -122.0080, 27, 27, 81, 'advanced', '975'),
  ('Milo McIver', 'Estacada', 'OR', 'US', 45.3160, -122.3410, 18, 18, 60, 'intermediate', '950'),
  ('Flip City', 'Shelby', 'MI', 'US', 43.5490, -86.3060, 24, 24, 72, 'intermediate', '950');
`;
