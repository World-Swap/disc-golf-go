# Event assets

Finished images for Disc Golf Go events — made to be **downloaded and posted or
printed by hand**, the same way `store-assets/` holds the Play and App Store
uploads.

**This folder is deliberately NOT under `web/`.** Everything under `web/` is
served by `express.static`, so anything put there is public at a guessable URL
whether or not a page links to it. These are post-ready files with no page
behind them, so they live outside it — the same reason `SOCIAL_POSTS.md` sits at
the repo root rather than beside the images it describes.

One folder per event, named for the event, plus `graphics/` for the brand art
that is not tied to any one event.

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
```

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
