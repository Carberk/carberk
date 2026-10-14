# ADR-0097: Listing detail photos use an inset 4:3 cover strip

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Founder
- **Supersedes**: [ADR-0096](0096-webp-only-photos.md)'s Listing detail gallery framing sentence only

## Context

In the 2.0.4 release, Listing detail draws the hero photo in a full-width frame `0.65 × width` tall. The card-seeded preview drew it with cover fit. ADR-0096's founder exception switched only the loaded gallery to contain fit. So when detail replaced the preview, a typical 4:3 phone photo stopped being cropped, shrank to about 87% of the width, and showed grey side bars (#864).

Research for #864 (2026-10-13):
- mobile.de, AutoScout24, Cars.com, CarGurus and both Autotraders frame listing photos at a fixed 4:3, measured on their live mobile pages.
- Auto.ru's seller rules require 4:3. Google Vehicle Ads recommends 4:3.
- Phone cameras shoot 4:3 by default.
- No measured marketplace resizes the frame per photo, and none uses a blurred fill.

A first decision on 2026-10-13 put every photo whole (contain fit) in one full-width 4:3 frame under the status bar. It was built and tried on device. Photos that are not 4:3 showed neutral bands, the bands needed a pinned position, and the card's cached photo could show under the loading frame only for about-4:3 covers. On 2026-10-14 the founder replaced it, before merge, with Auto.ru's detail layout. The Results card strip already shows photos this way (`ListingPhotoStrip`), and it already loads the `detail` size at 4:3 cover.

## Decision

Listing detail's photos sit in a horizontal strip of fixed 4:3 tiles, inset by the page margin:
- **Header:** a plain row (Back, ♡, ⋯ as plain icons) on the page background under the status bar, in the page's flow. The photos start 8 pt below it. A hairline appears under the row once the page scrolls, and the price and title appear in it once the photos have scrolled away.
- **Margins:** 16 pt left and right for the photos and every section below them.
- **Tiles:** width = screen − 16 pt − 16 pt, height = width × 3/4. The right margin holds a 2 pt square seam and a sliver of the next photo. Every photo is cover-fit, so all show at one shape.
- **Strip:** only its two outer ends are rounded (12 pt), as on the Results card strip. It snaps one photo per swipe; a middle photo shows a sliver on both sides, and the last lines up with the right margin. One photo is one tile from margin to margin. No photos is the same tile in grey with "No photos".
- **No counter on detail.** Each photo is read as "Photo n of N" by a screen reader. The full-screen viewer keeps its `n / N` counter and still shows each photo whole at its natural shape.
- **Sold / archived:** the status strip runs across the bottom of each tile, inside its rounded corners.
- **One page background** from the status bar to the bottom bar; grey only for No photos and loading.

The card-seeded preview, the loaded detail and the deep-link skeleton use this same header row and strip geometry. Each tile loads the `detail` size through the same address as the Results card strip and the viewer, so a photo the card decoded paints from memory, over the photo's ThumbHash until it loads. The feed and Results cards keep their own framing.

This supersedes only ADR-0096's sentence describing the Listing detail gallery exception against 3:2 framing. ADR-0096's whole-photo intent stays in force in the photo viewer, and its other decisions remain in force.

## Consequences

### Positive

- A 4:3 photo, the common case, shows complete. No photo moves from tap to loaded, and the card's photo shows at once.
- One shape, one fit and one geometry across preview, loaded and skeleton. The detail needs no per-shape position, underlay or shape detection.
- The sliver says there are more photos without a counter on the photo.

### Negative / accepted costs

- A photo that is not 4:3 is cropped on detail: 16:9 loses its sides, and square and portrait photos lose their top and bottom. The viewer shows the whole photo.
- A tile is 32 pt narrower than the screen, so a photo is about 8% smaller than a full-width one.

### Neutral

- Server variants are unchanged: `list` keeps its 3:2 cover crop and `detail`/`fullscreen` keep natural proportions.
- The tap-to-viewer expand transition and swipe-down to close are a separate issue (#869).

## Alternatives considered

- **One full-width 4:3 contain frame (2026-10-13):** built and tried on device. It showed bands on every photo that is not 4:3 and needed shape-dependent loading layers; the founder replaced it.
- **Cover crop in a full-width frame:** no hint of further photos; the counter has to sit on the photo.
- **Frame sized to each photo:** moves the price and contact bar on every swipe and needs server-measured dimensions; no peer does it.
- **Blurred fill:** no professional peer uses it, and `blurRadius` on this expo-image version uses RenderScript on Android.
- **Forcing sellers to crop to 4:3:** the picker crops only to a square on iOS and cannot crop a multi-selection. It adds per-photo work and risks cutting the car.

## References

- [ADR-0096](0096-webp-only-photos.md), [ADR-0051](0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md)
- Issues #864, #866, #867, #869
- `apps/mobile/src/listings/CONTEXT.md`, `apps/mobile/src/listings/components/DetailPhotoStrip.tsx`
- [Expo ImagePicker SDK 55](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/), [Auto.ru photo rules](https://yandex.ru/support/autoru/ru/car-rules-ads)
