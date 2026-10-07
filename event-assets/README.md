# Event assets

Finished media for Disc Golf Go — made to be **downloaded and posted or printed
by hand**, the same way `store-assets/` holds the Play and App Store uploads.
Mostly images; `video/` holds the promo film.

**This folder is deliberately NOT under `web/`.** Everything under `web/` is
served by `express.static`, so anything put there is public at a guessable URL
whether or not a page links to it. These are post-ready files with no page
behind them, so they live outside it — the same reason `SOCIAL_POSTS.md` sits at
the repo root rather than beside the images it describes.

One folder per event, named for the event, plus `graphics/` for the brand art
that is not tied to any one event and `video/` for finished film.

```
event-assets/
  graphics/
    hero.png                  2304x1296. The marketing hero from promo.html.
    event-card.png            2304x1296. The GENERIC events card (any event).
    course.png                1792x1008. Course selector.
    daily.png  lounge.png  ranks.png  throw-lab.png  training.png
                              1760x990. The rest of the feature cards.
    categories/               1760x990. All 13 training category cards.
  boulder-creek-re-run/
    card.png                  2400x1350. This event's own card art.
    social.png / social.jpg   1080x1350 frame at 3x -> 3240x4050. The FEED post.
    flyer.png  / flyer.jpg    2460x4527. Print, Stories, Facebook.
  video/
    promo.mp4                 1920x1080, 36.2s, h264. The promo film.
```

## `video/promo.mp4`

**The one ORIGINAL in this folder.** Everything else here is an export of art
the site serves as webp; this exists nowhere else, so there is no canonical copy
to go back to — if it is replaced, replace it here.

**It is silent, on purpose.** There is no licensed track, and a scratch one
would have to be fought off before a real one goes on. Lay audio over it.

Seven shots, each animated from brand art drawn to the four-colour spec
(cream `#F7F4EF`, green `#2E7D57`, ink `#202020`, orange `#FC6414`), with every
title composited in Inter afterwards rather than drawn by the model. The order
follows the positioning rules in `CLAUDE.md`: the training library leads and
takes four of the seven shots, Throw Lab appears once and only as a game
("Rained off? ... just for the fun of it"), and scorecards and check-in are not
mentioned at all. Every figure on screen was counted from
`src/db/data/lessons.ts`, not copied from a doc — 134 lessons, 13 skill paths,
199 distinct videos, 62 creators.

**It is 16:9 and a 9:16 cut is not a crop.** The captions sit in a lower-left
panel sized for this frame; a vertical version needs the text re-laid out, not
the sides trimmed.

Two things worth keeping from making it. The title panel is charcoal on most
shots but **cream on the tournament-gallery shot**, because a charcoal panel
measured 1.08:1 against that shot's crowd and lost its own edge — the swap is
measured, not taste, and that card carries no orange numeral so ink-on-cream
(10.2:1) was available. And the orange numerals are on charcoal rather than
cream because **on cream they measure 2.3:1**, below even the 3:1 large-text
threshold; the repo's darker orange only reached 2.7:1, so inverting the panel
was the fix that kept all four brand colours.

**`graphics/` and `card.png` are EXPORTS, not the originals.** The same three
pictures are what the site actually serves, as webp:

| here | what the site serves |
| --- | --- |
| `graphics/hero.png` | `web/img/hero.webp` (1600x900) |
| `graphics/event-card.png` | `web/img/cards/event.webp` (880x495) |
| `boulder-creek-re-run/card.png` | `web/img/events/boulder-creek-re-run.webp` (1200x675) |

...and every other PNG in `graphics/` mirrors the card of the same name under
`web/img/cards/` (the `categories/` ones under `web/img/cards/cat/`).

The **webp is canonical** — changing a PNG here changes nothing anyone sees.
These are bigger (rendered from the 2304x1296 originals, not upscaled from the
web copies) so they survive being printed or posted; the webps stay small
because pages show them at a few hundred pixels. If the art is ever redrawn,
re-export both or delete the stale PNG rather than leaving the two disagreeing.

**Do not "fix" these to the brand palette.** Only `hero`, `event-card` and the
Boulder Creek art are the strict four-colour set. The feature and category
cards are NOT: `cat/putting` is 87% teal `rgb(8,104,104)`, `cat/approach` is
95% brown `rgb(160,104,24)`, `throw-lab` uses a darker ink than `#202020`, and
each category card has its own hue by design. An early export snapped them all
onto the brand four and turned putting green and approach orange; it was caught
because those images then differed from the shipped card by 10-12 where the
others differed by under 3. Where these were enlarged, the edges are
re-hardened against **each image's own** palette, read out of that image, never
an assumed one.

PNG and JPG are the same image; take whichever the upload wants. The JPGs are
q95 with **no chroma subsampling** (4:4:4), so the orange does not smear at the
edges — ordinary 4:2:0 JPEG is visibly bad on this palette.

**Sizes are 3x on purpose.** Exporting at the nominal size and letting a
platform enlarge it is what makes a post look soft; measured, a native 3x export
carries 137% more edge energy than a 1x file blown up to the same display size.
Render at scale and let the platform downscale, never the other way round.

The captions that go with these are post 5 in `SOCIAL_POSTS.md`.

Not here: `web/img/events/boulder-creek-re-run.webp` is the event card art that
`web/events.html` actually renders, so it has to stay under `web/`. It is small
(1200x675) because the page shows it at ~356px.
