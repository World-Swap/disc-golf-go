# Disc Golf Go — store listings

Copy for the App Store and Google Play. Kept at the repo root, not under
`web/`, because everything under `web/` is served publicly.

Every number here was recounted from the source data, not carried over from
the previous listing — which is how "3,500+ courses" survived for months at
**2.3× the real figure**. See "What was wrong" at the bottom.

**Positioning** (`CLAUDE.md` → Positioning): the training library leads, Throw
Lab is second and is a **game**, and courses/check-in are not the pitch. The
old listings ended on "PLAY REAL COURSES" with a course count as the closer;
they now end on courses as the place you *take* the training.

---

## Google Play

### Short description  (80 char limit)

```
134 coached disc golf lessons from the pros. Learn the shot, then go throw it.
```

### Full description  (4000 char limit)

```
Disc Golf Go turns pro coaching into lower scores. Work through a structured training library built around videos from the people actually worth learning from — then take it to the course.

LEARN FROM THE PROS AND THE TOP CHANNELS
134 lessons draw on 62 creators: touring pros plus the coaching channels that do most of the real teaching. Gannon Buhr, Ricky Wysocki, Paul McBeth, Simon Lizotte, Eagle McMahon, Kristin Tattar, Paige Pierce, Scott Stokely, Nate Sexton, Calvin Heimburg, Paul Ulibarri, Isaac Robinson, Overthrow Disc Golf, Latitude 64, Disc Golf Strong and more.

Every lesson pairs one video that earns its place with the key takeaways and a companion guide — no filler, no 40-minute vlog to scrub through.

134 COACHED LESSONS · 13 SKILL PATHS
• Getting Started — everything for your first round
• Form & Technique — grip, stance, reach-back, release
• Putting — Circle 1 and 2, routine, drills, nerves
• Driving & Distance — run-up, timing, power, control
• Approach & Upshots — the 50–150 ft scoring zone
• Forehand / Sidearm — mechanics, distance, utility
• Disc Selection — flight numbers, stability, building a bag
• Course Strategy — shot selection and reading conditions
• Mental Game — routine, focus, composure under pressure
• Fitness & Warmup — move well, build power, stay healthy
• Tournament & Competition — prepare for and manage a real event
• Rules & Etiquette — official rules, marking a lie, course courtesy

UNLOCK THE CREATORS
Complete a lesson to unlock its coach in the Vault's Creators tab — 199 videos organized by the people who made them, earned one lesson at a time.

EARN XP · CLIMB THE RANKS
Finish lessons to earn XP, hit milestones and rise up the leaderboard. A rotating daily challenge gives you one thing to work on each day.

THROW LAB — A DISC GOLF GAME
Can't get to a course? Throw Lab is a game built into the app. Tap for power, tap for your release angle, and watch the fade come back. Three discs with real flight numbers, 21 illustrated holes, and a line after every throw telling you what that shot actually did. Play a quick round for the fun of it, or enter the daily and weekly tournaments, where everybody plays the same course and the board is shared.

TAKE IT TO THE COURSE
1,536 real courses across 48 states. Check in when you get there, keep a card hole by hole, and the app remembers your best round at every course you play.

Free to play. Start training today.
```

---

## App Store

### Subtitle  (30 char limit)

```
Coached by the pros
```

### Promotional text  (170 char limit — editable without review)

```
134 video lessons from touring pros and the channels that coach them — plus Throw Lab, a disc golf game for when you can't get out to a course.
```

### Description  (4000 char limit)

```
Disc Golf Go turns pro coaching into lower scores. Work through a structured training library built around videos from the people actually worth learning from — then take it to the course.

LEARN FROM THE PROS AND THE TOP CHANNELS
134 lessons draw on 62 creators: touring pros plus the coaching channels that do most of the real teaching — Gannon Buhr, Ricky Wysocki, Paul McBeth, Simon Lizotte, Eagle McMahon, Kristin Tattar, Paige Pierce, Scott Stokely, Nate Sexton, Calvin Heimburg, Paul Ulibarri, Isaac Robinson, Overthrow Disc Golf, Latitude 64, Disc Golf Strong and more.

Every lesson pairs one video that earns its place with the key takeaways and a companion guide — no filler, no 40-minute vlog to scrub through.

134 COACHED LESSONS · 13 SKILL PATHS
From your first grip to tournament nerves: Getting Started, Form & Technique, Putting, Driving & Distance, Approach & Upshots, Forehand/Sidearm, Disc Selection, Course Strategy, Mental Game, Fitness & Warmup, Tournament & Competition, and Rules & Etiquette.

UNLOCK THE CREATORS
Complete a lesson to unlock its coach in the Vault's Creators tab — 199 videos organized by the people who made them, earned one lesson at a time.

EARN XP · CLIMB THE RANKS
Finish lessons to earn XP, hit milestones and rise up the leaderboard. A rotating daily challenge gives you one thing to work on each day.

THROW LAB — A DISC GOLF GAME
Can't get to a course? Throw Lab is a game built into the app. Tap for power, tap for your release angle, and watch the fade come back. Three discs with real flight numbers, 21 illustrated holes, and a line after every throw telling you what that shot actually did. Play a quick round for the fun of it, or enter the daily and weekly tournaments, where everybody plays the same course and the board is shared.

TAKE IT TO THE COURSE
1,536 real courses across 48 states. Check in when you get there, keep a card hole by hole, and the app remembers your best round at every course you play.

Free to play. Start training today.
```

---

## What was wrong in the old listings

| Claim | Reality | Why it matters |
| --- | --- | --- |
| **3,500+ real courses nationwide** | **1,536** across 48 states | Overstated by **2.3×**. The old figure counted the OpenStreetMap tee and basket rows that the placeholder prune deleted — individual baskets, not courses. A false claim in a live store listing. |
| **13 touring pros** | **62 creators**; no pro count is quoted any more | Wrong *and* an undersell. It also erased the coaching channels that do most of the teaching. Which creators count as "touring pros" is a judgement, and the last number put on it was wrong in both directions. |
| **200+ videos** | **199** distinct (204 references) | 199 is not "200+". |
| **hand-drawn holes** | generated, not drawn by hand | Also corrected on the promo page and in `SOCIAL_POSTS.md`; they are "illustrated" now. |
| *(no mention of Throw Lab)* | It is the app's second pillar | Both listings omitted it entirely. |
| Closed on **PLAY REAL COURSES** | Courses are not the pitch | Every disc golf app has a course list. It now closes on courses as where you *take* the training. |

The Play listing said "13 TOURING PROS" and then named twelve.

## Keeping it true

If the library grows these change: lessons (134), skill paths (13), creators
(62), distinct videos (199), courses (1,536), states (48), hole designs (21).
`npm run lessons:audit` checks the lesson half; the course figures come from
`src/db/data/courses.ts` filtered through `isPlaceholderCourseName`.
