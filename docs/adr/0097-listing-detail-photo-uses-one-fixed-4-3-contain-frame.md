# ADR-0097: Listing detail photo uses one fixed 4:3 contain frame

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

Sellers mostly pick photos they already have, so shapes vary.

## Decision

Every Listing detail photo state uses one full-width frame at 4:3, `height = width × 3/4`:
- the card-seeded preview;
- the deep-link skeleton;
- every photo in the gallery;
- the No photos tile.

The preview and the gallery draw each photo whole (`contentFit="contain"`) on the neutral muted surface, and never crop it. A photo wider than 4:3 is pinned to the frame's bottom, so it rests on the title and its band sits at the top, behind the status bar and Back; a taller photo is centred between side bands. The frame never changes height while detail loads or as the buyer swipes.

Before a photo's `detail` size loads, the frame shows only what will not move when it does. For a cover its ThumbHash reads as about 4:3, the card's cached 3:2 `list` crop shows at the frame's centre over the blurred hash filling the frame. Any other shape shows only its blurred hash at the hash's shape, pinned as the photo is, never the crop. The photo viewer, feed and Results cards keep their own framing.

This supersedes only ADR-0096's sentence describing the Listing detail gallery exception against 3:2 framing. ADR-0096's whole-photo intent and its other decisions remain in force.

## Consequences

### Positive

- A 4:3 photo, the common case, fills the width with no bars and no crop, and the photo no longer moves from tap to loaded.
- Vehicle content is never cut off, whatever the photo's shape.

### Negative / accepted costs

- The hero is about 39 pt taller on a 390 pt screen, so the title and price start lower.
- 3:2 and 16:9 photos show a neutral band at the top, behind the status bar, and portrait photos at the sides.
- A non-4:3 cover is blurred, not sharp, until its `detail` size loads. A 3:2 cover, which its ThumbHash cannot tell from 4:3, settles 16 pt lower when it does.

### Neutral

- Server variants are unchanged: `list` keeps its 3:2 cover crop and `detail`/`fullscreen` keep natural proportions.

## Alternatives considered

- **Cover crop in a fixed frame:** cuts bumpers, roofs or damage from photos that aren't 4:3, which the founder rejected.
- **Frame sized to each photo:** moves the price and contact bar on every swipe and needs server-measured dimensions; no peer does it.
- **A 16:9 or 3:2 frame:** puts side bars or crops on the common 4:3 photo.
- **Blurred fill:** no professional peer uses it, and `blurRadius` on this expo-image version uses RenderScript on Android.
- **Forcing sellers to crop to 4:3:** the picker crops only to a square on iOS and cannot crop a multi-selection. It adds per-photo work and risks cutting the car.

## References

- [ADR-0096](0096-webp-only-photos.md), [ADR-0051](0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md)
- Issues #864, #866, #867
- `apps/mobile/src/listings/CONTEXT.md`
- [Expo ImagePicker SDK 55](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/), [Auto.ru photo rules](https://yandex.ru/support/autoru/ru/car-rules-ads)
