# Game Design Document: Fieldwork

> Working title. *Fieldwork* is the disc golf term for solo practice throws in an open
> field — which is exactly what this is. Alternates: **Throw Lab**, **Circle One**.

---

## 1. Executive Summary

| | |
| :--- | :--- |
| **Game Title** | Fieldwork (working) |
| **Genre** | Arcade throw simulator / training game |
| **Platform** | A page in `web/`, played in the Capacitor WebView — ships with a push to `main` |
| **Target Audience** | Existing Disc Golf Go players: beginners who can't yet feel *why* a throw failed, and intermediates grinding a specific shot |
| **Session Length** | 60–90 seconds for one hole. Thumb-sized sessions, playable in a parking lot |

**Core Loop:**

```
Read hole + wind  ➔  Pick disc from bag  ➔  Set release angle (hyzer/flat/anhyzer)
     ➔  Throw meter (power, then release snap)  ➔  Watch flight resolve
     ➔  Land / putt out  ➔  Score vs par  ➔  Coach card: what went wrong + the lesson
     ➔  XP + gold  ➔  Lesson unlocks a disc  ➔  Better bag, harder holes
```

**The one thing that makes this not just another golf game:** the app already knows 134
lessons across 13 categories. The game diagnoses *why* a throw missed — nose-up, too much
power for the disc's speed, wrong disc for a headwind — and hands the player the lesson
that teaches that exact fix. Every other golf game tells you that you missed. This one
tells you why, from a library you already own.

**What this is not:** not multiplayer, not 3D, not a round tracker, not an IAP surface.
The RPG features (battles, crews, crew wars) were dropped in the training pivot; this
must not quietly rebuild them.

---

## 2. Core Gameplay Mechanics

### 2.1 The Throw System

Three inputs, taken in order, all with one thumb. This replaces the three-click golf
meter with something disc-specific — a disc has an *angle* as well as a power, and angle
is the thing beginners get wrong.

**Input 1 — Release angle (pre-throw).** A dial on the left edge, dragged up/down:

| Angle | Effect | Real-world name |
| :--- | :--- | :--- |
| −30° to −5° | Disc finishes left hard, lands flat and stops | Hyzer |
| −5° to +5° | Full flight path expressed | Flat |
| +5° to +30° | Disc turns right, extends right, may flip up | Anhyzer |

**Input 2 — Power.** A vertical meter that fills while the thumb is held. Release to lock.
Critically, **more power is not better**: exceeding a disc's rated speed makes it turn over
and burn right. This is the central teaching mechanic — the game punishes the exact
instinct every beginner has, then explains it.

**Input 3 — Release snap.** A moving marker crosses a narrow window immediately after
power locks. Tapping inside it gives a clean release; early tips the nose up (kills
distance ~35%), late rolls the wrist (adds unwanted turn).

**Accessibility:** a "simple mode" toggle collapses this to power + angle, with snap
auto-scored at 85%. Onboarding uses simple mode for the first three holes.

### 2.2 Flight Physics

Do **not** attempt real aerodynamics. Model the flight from the disc's four published
flight numbers, tuned by feel against real footage. The numbers are already the language
the Disc Selection category (13 lessons) teaches, so the simulation and the curriculum
stay consistent.

```
speed  (1–14)   initial velocity ceiling and how long the disc holds its line
glide  (1–7)    lift; extends the middle phase of the flight
turn   (+1..−5) high-speed rightward drift (RHBH), peaks early
fade   (0–5)    low-speed leftward hook, unavoidable, dominates the last quarter

lateral(t) = turn_force · f_hs(t, power_ratio) + fade_force · f_ls(t) + release_angle
    power_ratio = throw_power / disc.speed
    f_hs(t)  peaks near t ≈ 0.35, scales with power_ratio — overpower a disc and this
             term dominates, producing the classic beginner's right-side burn
    f_ls(t)  ramps from t ≈ 0.7 to 1.0 regardless of power — fade always arrives

distance   = base(speed) · glide_factor · power · cos(nose_angle) · wind_term
```

Emergent behaviours worth having, because each one is a lesson the app already teaches:

- **Hyzer flip** — anhyzer release + understable disc + high power flattens mid-flight into
  a long straight finish. Feels great to land. Directly rewards understanding turn.
- **Nose-up stall** — early snap at high power dumps distance. The single most common
  beginner fault and invisible without a diagnosis.
- **Headwind flip** — wind makes a disc act more understable. Teaches wind reading.
- **Forced fade** — every disc comes back left eventually; you cannot bomb straight forever.

Fixed 60 Hz physics tick, decoupled from render. Flight resolves in 2–4 seconds of real
time, with a skip-to-result tap.

### 2.3 Lie Conditions

| Lie | Power transmission | Notes |
| :--- | :--- | :--- |
| Tee pad | 100% | Full run-up available |
| Fairway | 92% | Standstill penalty |
| Light rough | 75% | Narrowed snap window |
| Schule / deep | 55% | Angle dial locked to hyzer, forced escape shot |
| Behind tree | — | Line-of-sight blocked; must shape around or pitch out |
| OB | +1 stroke | Re-throw from the previous lie |
| Circle 2 (10–20 m) | Putting model | Wind still applies |
| Circle 1 (<10 m) | Putting model | Wind ignored inside 5 m |

### 2.4 Putting

Own minigame, because putting is its own category (10 lessons) and its own failure mode.
Pull-back-and-release aim with a distance arc, chains modelled as a strike volume:

- Hitting chains centre-mass drops in.
- Hitting the rim or outer band can **spit out** — a real, demoralising event that the
  Putting lessons address directly. Spit-out rate rises with excess power.
- Wind pushes the line in circle 2. Push putt vs spin putt (an actual lesson:
  `push-vs-spin-putt`) becomes a selectable style with different wind resistance.

---

## 3. Equipment: The Bag

Discs replace clubs. The bag is the progression system.

| Class | Speed | Role | Starting disc |
| :--- | :--- | :--- | :--- |
| Putter | 1–3 | Putting, short approach, straight and predictable | ✅ Unlocked |
| Midrange | 4–6 | 50–90 m control, the workhorse | ✅ Unlocked |
| Fairway driver | 7–9 | Controlled distance, needs real power to fly right | 🔒 Lesson |
| Distance driver | 10–14 | Maximum distance, punishing when overpowered | 🔒 Lesson + gold |

**Two starting discs only.** A beginner given fourteen discs learns nothing. Constraint
is the teaching tool — and it's what the Disc Selection lessons actually advise.

**Unlocks come from two places:**

1. **Lessons.** Completing a lesson unlocks a thematically matching disc. Completing
   `driving` lessons unlocks fairway drivers. This makes the training library the
   literal progression tree rather than a thing bolted on beside it.
2. **Gold.** Cosmetic plastics and stamps bought through the existing vault
   (`POST /api/vault/buy`, balance at `GET /api/gold/balance`). No new currency.

Every disc carries its flight numbers on the face in the selection UI, so the player
reads flight numbers hundreds of times without being taught them explicitly.

---

## 4. The Coach Card — the core differentiator

After every throw the game records what happened and names the fault:

| Detected fault | Diagnosis shown | Category linked |
| :--- | :--- | :--- |
| `power_ratio > 1.15` + right miss | "You overpowered it. That disc turns over above its rated speed." | `disc-selection` |
| Early snap, distance < 70% expected | "Nose up on release — that's where your distance went." | `form-technique` |
| Headwind + understable disc | "Headwinds make a disc act more understable. You needed more stability." | `course-strategy` |
| Fade into trouble on a blind line | "The fade was always coming. Plan the finish, not the flight." | `course-strategy` |
| 3+ missed C1 putts in a session | "Your stroke is drifting under pressure." | `putting` / `mental-game` |
| Distance falling across a session | "You're fatiguing — power fades before accuracy does." | `fitness-warmup` |

The card shows **one** fault (the largest contributor), one sentence of coaching pulled
from that lesson's `content_body.tips`, and a **Watch the fix** button opening the lesson.
Completing it from there goes through the existing `POST /api/training/completions`, so it
awards lesson XP, feeds the streak bonus, and counts toward milestones with no new
plumbing.

Verified data shape — lessons already carry exactly what the card needs:

```json
{ "slug": "putting-fundamentals", "category_slug": "putting", "xp_reward": 10,
  "content_type": "video_embed",
  "content_body": { "tips": ["Balanced, repeatable stance — the same setup every putt.",
                             "Push toward the chains with your legs and core, not just the arm.",
                             "Follow through toward the pole; keep your eyes on one link."] } }
```

One card per hole maximum, and never two cards for the same fault in a row. The failure
mode to avoid is a game that nags.

---

## 5. Game Modes

**Field Work** *(the practice range)* — open field, no par, no score. Throw as many as you
like with any disc, distance markers every 25 m. Pure feel-building and the default first
experience. This is where the physics teaches itself.

**Hole Challenge** — a single real hole drawn from the `courses` table, using real par and
hole count (3,550+ courses, `hole_details` JSONB for per-hole par and distance). Three
stars: complete it, make par, make birdie.

**Putting Ladder** — 5 m to 20 m, advancing a step on each make, back two on a miss. Mirrors
the Putting category's drill structure. The most honest skill test in the game.

**Daily Round** — 3 holes, fixed seed shared by every player that day, one attempt. Ties
into the existing `player_daily_challenges` table; a played round completes the day's
challenge. Leaderboard reuses `GET /api/challenges/leaderboard`.

**Your Home Course** *(later phase)* — generate holes from a course the player has actually
checked in at, using its stored hole data. The strongest retention hook in the design:
practice the hole you're about to play.

---

## 6. Art Direction

The logo is the game's thesis: an orange disc **already in the chains**. That is the win
state, and it's the loading mark, the scoring icon, and the basket sprite.

Palette is fixed by `web/styles/tokens.css` — no new brand colours:

| Token | Hex | Use in game |
| :--- | :--- | :--- |
| `--color-orange` | `#fc6414` | The disc, active UI, the made-putt flash |
| `--color-ink` | `#202020` | Basket, trees, silhouettes, text |
| `--color-bone` | `#f7f4ef` | Sky, negative space |
| fairway green | `#2e7d57` | Terrain bands, fairway/rough distinction |

**Flat vector, high contrast, no textures.** Everything is `<canvas>` primitives and a
handful of inline SVG paths — the same charcoal-silhouette-on-bone look the marketing site
already uses. This is a hard constraint, not a style preference: it keeps the whole game
under a few hundred KB, renders at 60 fps on a five-year-old Android, and needs no asset
pipeline, no sprite sheets, and no build step.

Camera: side-on during flight with the disc held at one-third screen height, panning to
top-down for the approach and putt. Two views, one transition, no free camera.

---

## 7. Technical Design

### Constraints inherited from the existing stack

- **It's a page, not an app.** `web/game.html` + `web/js/game/*.js`, added to the `PAGES`
  map in `src/http/static.ts`. It ships when `main` deploys — no store release, which is
  the same property that let today's sign-in fix reach every player in 20 seconds.
- **Vanilla JS, no build step.** `web/` has no bundler and shouldn't grow one for this.
  ES modules loaded directly; `DGG.API` from `web/js/app.js` for all calls, so the game
  inherits the session handling, cookie mirror and token refresh already in place.
- **Canvas 2D, never WebGL.** Battery, low-end Android, and WebView driver variance.
- **Portrait, one thumb, 44 px minimum targets.** Played standing in a field.
- **Offline-tolerant.** Physics is fully client-side; results queue in `localStorage` and
  submit on reconnect. A player on a course with bad signal must still be able to play.
- **Server never simulates.** It validates plausibility (bounds, timing, throw count) and
  awards XP. Fully authoritative physics isn't worth the complexity for a solo game, but
  unbounded client-reported XP is an obvious cheat vector and the leaderboard is public.

### New schema

Three tables. Names match the existing snake_case convention.

```
game_sessions   id, player_id, mode, course_id (nullable), hole_number, seed,
                strokes, par, completed, xp_awarded, gold_awarded, created_at

game_throws     id, session_id, throw_number, disc_id, power, power_ratio, angle,
                snap_error, wind_speed, wind_dir, distance_m, lateral_m,
                lie_from, lie_to, fault_code            ← telemetry that drives coach cards

player_discs    id, player_id, disc_slug, unlocked_via ('lesson'|'gold'|'starter'),
                lesson_id (nullable), created_at        ← unique per (player, disc)
```

`game_throws.fault_code` is the whole coaching system: aggregate it per player and the
app can recommend lessons from demonstrated weakness rather than from a quiz. That data
doesn't exist anywhere today.

### New endpoints

```
GET  /api/game/config           discs, unlock state, today's seed
GET  /api/game/hole/:courseId   real hole data for Hole Challenge
POST /api/game/sessions         start a session (server issues the seed)
POST /api/game/sessions/:id     submit result → validate → award XP/gold → coach card
GET  /api/game/stats            per-fault breakdown, feeds recommendations
```

Reuses without modification: XP and levels (`totalXpForLevel(n) = 125·n·(n−1)`, tiers
Rookie / Player / Advanced / Pro at 0 / 500 / 2000 / 5000 XP), gold and the vault, the
training completion flow, the daily challenge table, the leaderboard.

### Economy

Tuned so the game feeds the app and never replaces it:

| Action | Reward |
| :--- | :--- |
| Complete a hole | 5 XP |
| Par | +5 XP |
| Birdie | +15 XP, 10 gold |
| Daily Round completed | 50 XP, 25 gold |
| Putting Ladder personal best | 20 XP |
| **Lesson completed from a coach card** | **Existing lesson XP + streak bonus** |

Deliberately, a lesson is worth more than a hole. The game is the hook; the library is
the product. If grinding holes ever out-earns learning, the design has failed.

---

## 8. Build Phases

Each phase is independently shippable and independently *useful* — no phase is only
valuable once a later one lands.

**Phase 1 — Does it feel good? (the only phase that matters)**
One hole, one disc, throw meter, flight physics, canvas render. No server, no XP, no
accounts. Purely: is throwing this disc satisfying? If it isn't fun here, no amount of
progression will save it, and the honest move is to stop.

**Phase 2 — The bag.** Four disc classes, flight numbers, wind, lie conditions. The
physics gets its teaching power.

**Phase 3 — Real holes and real rewards.** Course data, par, scoring, XP/gold wiring,
`game_sessions`. It becomes part of the app.

**Phase 4 — The coach.** Fault detection, coach cards, lesson deep links, `game_throws`
telemetry. **This is the actual product** — phases 1–3 are a golf game; this is the
training game they asked for.

**Phase 5 — Daily Round, ladder, leaderboard.** Retention.

**Phase 6 — Home course generation.** The retention hook worth the most, and the one
requiring the most course data quality.

---

## 9. Open Questions

1. **Left-handed / forehand players.** Flight numbers assume RHBH. A mirror toggle is
   cheap if built in from Phase 2 and expensive if retrofitted. The Forehand category
   (7 lessons) implies the audience exists.
2. **Real disc names.** Real moulds (Destroyer, Buzzz, Aviar) are trademarked. Generic
   archetypes avoid the issue; licensing is a business conversation, not a design one.
3. **Difficulty floor.** Is a beginner's first throw satisfying, or humiliating? Field
   Work being the default entry exists to protect against this — worth testing on a
   genuine beginner before Phase 3.
4. **Does it cannibalise?** If players grind the game instead of watching lessons, the
   economy above is wrong and the coach card needs to become the only route to unlocks.

---

*Design grounded in the existing app: 13 training categories, 134 lessons, 3,550+ courses,
the XP/tier curve in `src/modules/progression/level.ts`, the gold and vault economy, and
the brand palette in `web/styles/tokens.css`.*
