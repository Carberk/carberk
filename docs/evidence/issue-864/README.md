# Issue 864 native evidence

**Code head:** `350baae1` on `agent/issue-864`, captured on 2026-10-13.

**Device and build:**
- iOS Simulator iPhone 16e (iOS 26.2, 390 pt wide), owned by this session.
- Development client built on 2026-10-11. Its native dependencies match this branch: no Expo, React Native or native-module version changes since.
- JavaScript served by `native:metro --env staging --port 8864`.

**Backend:** staging, browsed anonymously and read-only. No data was created or changed.

**Delay harness:**
- An uncommitted local edit held the Listing detail request for 4 s. It was reverted after capture and is not part of the PR.
- This delay makes the card-seeded preview and the deep-link skeleton visible long enough to capture.
- Images were not delayed.

**Photo shapes:** measured from the served `detail.webp` headers.
- #65/#67: 1200×800, 3:2.
- #66 photo 2: 600×800, portrait 3:4.
- Demo inventory: 1920×1440, 4:3.

Staging had no 16:9 or square photo. Those shapes are covered by the rendered route tests in `listingDetailHero.spec.tsx`.

Every image pairs the loading state (left) with the loaded detail (right) unless noted.

| Image | State | What it shows |
|---|---|---|
| [01](01-home-card-3x2-preview-vs-loaded.png) | Home card → preview → loaded, 3:2 photo | Same full-width 4:3 frame, same contained photo with thin neutral bands top and bottom, nothing moves. This sparse test listing has no power, drive, body or colour, so their placeholders drop out when it loads (see residuals). |
| [02](02-home-card-4x3-preview-vs-loaded.png) | Home card → preview → loaded, 4:3 photo | The photo fills the frame edge to edge, with no bands and no crop. Year, mileage, gearbox and engine sit in their final cells; power and drive placeholders become values in place; rows match. The exchange badge appears only with detail (out of scope). |
| [03](03-gallery-swipe-3x2-portrait-4x3.png) | Loaded gallery swipe: 3:2, portrait 3:4, 4:3 | The frame keeps one height on every photo; the portrait photo is shown whole between neutral bands. Photo 1's white side margins are inside that uploaded image file (verified by downloading `detail.webp`), not drawn by the app. |
| [04](04-deep-link-skeleton-vs-loaded.png) | Deep link (no cached card): skeleton → loaded | Back button, same 4:3 frame, title, price and date lines, Specifications heading, 3-column grid and rows land where the loaded text does. The photo then shows its ThumbHash, then the image, in the same frame. |
| [05](05-no-photo-deep-link-skeleton-vs-loaded.png) | Deep link to a Listing without photos | The skeleton frame and the loaded No photos tile have the same height. |
| [06](06-large-text-preview-vs-loaded.png) | iOS text size XXXL (above the 1.3 breakpoint), preview → loaded | Both use two columns in the same order; the photo frame is identical. |

Before: the founder's 2.0.4 captures (preview cropped by cover in a 0.65 × width frame; loaded detail contained with grey side bars) and the red route tests at `78b4abca`.

**Reduce Motion:** not affected. This change adds no animation; placeholders reuse `Skeleton`, whose pulse already stops under Reduce Motion.

## Residuals, outside this issue's scope

- **Exchange/installment badges and the Call button:** the badges appear only when detail loads, and Call drops out when the seller takes no calls. `ListingSummary` carries neither, so the preview cannot reserve them without an API change.
- **Power, drive, body and colour:** these are optional in the Sell wizard, and the summary does not say whether a Listing has them. The preview holds placeholders for them; on a sparse Listing those placeholders drop out when detail loads. Exact placement would need these fields, or presence flags, in `ListingSummary`.
- **The `list` placeholder (3:2 centre crop)** aligns with the contained `detail` photo for photos between 4:3 and 3:2. A wider or taller photo opened from a Home grid card rescales once when its `detail` size arrives. Results cards already load `detail`.
