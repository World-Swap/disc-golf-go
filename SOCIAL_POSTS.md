# Disc Golf Go — social posts

Images: `web/img/social/` — committed, and therefore also live at
`https://discgolfgo.com/img/social/<file>` if you want to link one rather than
upload it. **This file deliberately sits at the repo root, not in that folder**:
everything under `web/` is served by `express.static`, so the posting notes
below would otherwise be public at `/img/social/POSTS.md`.

Four posts, each with a Facebook and an Instagram version of the same idea.
Every number below was recounted from `src/db/data/lessons.ts` and the course
seed, not taken from the marketing copy. That is how the last two errors were
caught: "13 touring pros" outlived the figure by weeks, and "64 creators" was
inflated by two channels each credited under two spellings (the real count is
**62**).

No specific "touring pros" count is quoted anywhere below. The honest line is
the one the site uses — *touring pros and the channels that coach them* —
because which creators count as touring pros is a judgement, and the last
number put on it was wrong in both directions.

**Links**
- App Store — https://apps.apple.com/us/app/disc-golf-go/id6768128686
- Google Play — https://play.google.com/store/apps/details?id=the.discgolfgo.app

**Every post links to https://discgolfgo.com**, never discgolfgo.app. The goal
is installs: .com is the landing page that carries the store badges, while .app
is the web app itself — sending people straight there is how you get a browser
user instead of a download. The store links above are for the places that take
a direct one (an Instagram link sticker, a Facebook app-install ad).

---

## 1 · Coached by the pros
**Image:** `web/img/social/ig-square-lessons.png` (1080×1080, IG feed) · use the same art on FB

### Facebook
> Most rounds don't make you better. Structured practice does.
>
> Disc Golf Go breaks the game into 13 skill paths — putting, driving, forehand, course strategy, the mental game — and fills them with **134 video lessons** from the people actually worth learning from: **62 creators** — touring pros and the channels that coach them, including Gannon Buhr, Scott Stokely, Paul McBeth, Ricky Wysocki, Simon Lizotte, Kristin Tattar and Paige Pierce.
>
> Every lesson is short, has one video that earns its place, and gives you XP when you finish it. So you always know what to work on next.
>
> Free to start — iOS and Android. 👇
> https://discgolfgo.com

### Instagram
> Stop throwing. Start training. 🥏
>
> 134 video lessons · 13 skill paths · 62 creators — pros and top channels.
>
> Pick a weakness. Get a lesson. Earn the XP. Take it to the course.
>
> Free on iOS & Android — link in bio.
>
> #discgolf #discgolftips #discgolflife #discgolfeveryday #putting #forehand #backhand #discgolfcourse #teampractice #discgolfer

---

## 2 · A new course every day  ⚠️ see the note at the bottom
**Image:** `web/img/social/fb-link-daily.png` (1200×630, FB link/feed) — the strongest of the four

### Facebook
> **New: a daily tournament.** ☀️
>
> One course. Everybody plays it. One entry — and it's spent the moment you tee off, so there's no restarting until the score suits you. At midnight UTC it's gone and a new course is drawn.
>
> The weekly tournament is still there with its two entries, and both have their own leaderboard, so you can chase a day or chase a week.
>
> 18 holes, in your pocket, free.
> https://discgolfgo.com

### Instagram
> One course. One entry. One day. ⏳
>
> A new daily tournament just landed — everyone plays the same 18 holes, your entry is spent the second you tee off, and at midnight it's gone.
>
> The weekly is still running too. Two boards, two chases.
>
> Free on iOS & Android — link in bio.
>
> #discgolf #discgolftournament #dailychallenge #discgolflife #discgolfeveryday #compete #discgolfer #leaderboard

---

## 3 · 1,536 courses. 48 states.
**Image:** `web/img/social/ig-portrait-courses.png` (1080×1350, IG feed portrait — best feed real estate)

### Facebook
> Your home course is in here. So are 1,535 others.
>
> Disc Golf Go carries **1,536 courses across 48 states**. Check in when you're standing on the tee, keep a card hole by hole, and see your best round at every course you've played.
>
> Then take it further: a career record that counts your rounds, birdies, aces and days played, and public boards for all of it.
>
> Free to start.
> https://discgolfgo.com

### Instagram
> 1,536 courses. 48 states. 🗺️
>
> Check in on the tee. Keep a card. Watch your best round at every course you play.
>
> What's your home course? 👇
>
> Free on iOS & Android — link in bio.
>
> #discgolf #discgolfcourse #discgolflife #homecourse #discgolfeveryday #roadtrip #discgolfer #discgolfcommunity

---

## 4 · Practice in your pocket  (Throw Lab)
**Image:** `web/img/social/ig-story-throwlab.png` (1080×1920, IG/FB Story or Reel cover)

### Facebook
> Can't get to a course today? Throw Lab is a disc golf game built into the app.
>
> Tap for power, tap for your release angle. Three discs with real flight numbers, fade that always comes back, and a coaching line after every throw telling you what that shot actually did.
>
> Play a quick round, or play a real course from the 1,536 in the app — its own holes and lengths, across 21 hand-drawn hole templates. It pays real XP either way.
>
> Free on iOS and Android.
> https://discgolfgo.com

### Instagram
> Rained off? Play anyway. 🌧️🥏
>
> Throw Lab: tap for power, tap for your angle. Real flight numbers, real fade, real XP — and you can play any of the 1,536 real courses in the app.
>
> Free on iOS & Android — link in bio.
>
> #discgolf #discgolfgame #throwlab #discgolflife #mobilegame #discgolfeveryday #practice #discgolfer

---

## Posting notes

- **Post 2 needs one check first.** The daily tournament merged today and goes
  out with the next Render deploy. Open the Play tab and confirm the daily card
  is there before you post it — everything else in these posts has been live
  for a while.
- **Nothing in these images is generated.** Every piece of art is a file the app
  already ships, so the baskets are the logo's basket by construction and no
  illustrated figure is holding a disc:

  | Post | Art |
  | --- | --- |
  | 1 · Coached by the pros | `web/img/shot-home.webp` — a real screenshot of the home screen, whose own hero reads *Coached by the pros* |
  | 2 · A new course every day | `web/img/cards/daily.webp` — the target card |
  | 3 · 1,536 courses | `web/img/cards/course.webp` — the aerial fairway |
  | 4 · Throw Lab | `web/img/cards/throw-lab.webp` + `web/img/shot-game.webp` |

  `cards/training.webp` and `cards/ranks.webp` were deliberately **not** used:
  both silhouettes hold a disc.

  There is no disc in anyone's hand anywhere in the set. Post 1 used to show the
  lesson screen, whose video thumbnail is a photo of a pro holding one; the home
  screen says the same thing better, because its hero banner carries the post's
  own headline.
- **Type is composited, not generated**, from the exact strings above, so there
  are no spelling artefacts to proofread.
- **Sizes:** 1080×1080 (IG feed), 1200×630 (FB link preview), 1080×1350 (IG
  portrait), 1080×1920 (Story). The FB one is sized for a link card, so it will
  not crop badly in the feed.
- **Numbers to keep true.** If the library grows, these change: lessons (134),
  skill paths (13), creators (62), video references (204 / 199 distinct),
  courses (1,536), states (48), hole templates (21). `npm run lessons:audit`
  checks the lesson half; the course figures come from `src/db/data/courses.ts`
  filtered through `isPlaceholderCourseName`.
