# Issue 374 evidence

Photo viewer, instant loading from cached cards, and Ask the seller on Listing detail. Branch `agent/issue-374`, based on `origin/main` at c4bc044 (after #373 merged as PR 466) and merged with `origin/main` through 6073324. Approved specs: issue comments on #344 (release screen map) and #351 (Listing content), prototype branches read only.

## Acceptance evidence

| Criterion | Behaviour test (rendered) | Native evidence (iPhone 17 simulator) |
|---|---|---|
| Tapping a photo opens the viewer at that photo; swipe, pinch zoom and thumbnails work; ✕ returns the gallery to the same photo | `PhotoViewer.spec.tsx` (counter, thumbnails, thumbnail jump, swipe, ✕ and system back return the index), `PhotoViewer.zoom.spec.tsx` (paging locks while zoomed), `PhotoGallery.spec.tsx` (opens at the tapped photo, closing scrolls the gallery to the viewer's photo), `zoomMath.spec.ts` (zoom clamps), `listingDetailPreviewViewerAsk.spec.tsx` (from the detail screen) | [Open at 1 / 6, thumbnails, ♡, Call + Message](viewer-open.png); [swiped to 2 / 6](viewer-swiped-to-2.png); thumbnail jump then [pinch zoom](viewer-zoomed.png) (a one-finger drag while zoomed moved the photo and did not page); [✕ back on 5 / 6](viewer-closed-back-on-same-photo.png) |
| Opening a Listing from any card shows photo, title, price, spec line, city and date at once; the contact bar stays disabled until the detail loads | `useListingPreview.spec.tsx` (feed, Results-filtered, Favorites and My listings caches), `ListingPreview.spec.tsx`, `listingDetailPreviewViewerAsk.spec.tsx` (preview, disabled bar, then loaded and enabled in place; no bar for the owner or a closed Listing) | [Home card tapped with only the API process paused](instant-loading-from-card.png), then [the same Listing after the API resumed](detail-loaded-after-preview.png). The owner's Listing also opened from My listings: [owner view](owner-no-chips-top.png) |
| A deep link shows a plain skeleton | `listingDetailPreviewViewerAsk.spec.tsx` (no card cached: skeleton, no contact bar, no title or price) | [Deep link to a Listing outside the cache, API paused](deep-link-plain-skeleton.png) |
| Ask the seller chips open the Conversation with the question pre-filled and unsent | `AskSellerChips.spec.tsx` (four intents, signed-in open with `draft`, signed-out `requireSignIn` then replay, other-Listing replay ignored, pending and retry), `MessageComposer.draft.spec.tsx`, `conversations-draft.spec.tsx` (the Conversation route shows the draft and sends only on Send), `useReplayAuthAction.spec.tsx` | [Chips](ask-seller-chips.png); [signed out: sign-in](signed-out-ask-goes-to-sign-in.png); after the mock SMS code, [the Conversation opened with "Can I see the car?" in the composer, "No messages yet"](conversation-prefilled.png) |
| Chips hidden for the owner and for sold Listings | `AskSellerChips.spec.tsx`, `listingDetailPreviewViewerAsk.spec.tsx` (owner, sold and archived; also no ♡ and no Call + Message in the viewer) | [Owner, top](owner-no-chips-top.png) and [scrolled](owner-no-chips-scrolled.png); [sold, top](sold-no-chips-top.png) and [scrolled](sold-no-chips-scrolled.png); [viewer opened by the owner: no ♡, no Call + Message](viewer-owner-no-heart-no-contact.png) |
| Mobile gate | See the PR's Execution state for the commands and results | n/a |
| `CONTEXT.md` describes the viewer, cache seeding and Ask the seller | `apps/mobile/src/listings/CONTEXT.md` | n/a (documentation exemption) |

## Red evidence

[red-before-implementation.md](red-before-implementation.md): the specs were run against do-nothing placeholders before any production code: 54 of 72 tests failed on the unmet criteria. The red checkpoint was pushed as 8682a8c. The log is unedited, so its command names `listingDetail374.spec.tsx`, which was renamed to `listingDetailPreviewViewerAsk.spec.tsx` in `85d3e7f` (squashed into `0d122e7` on `main`). Two later changes to the specs, after production code: `UNSAFE_queryByType(Modal)` checks became `Close`-button checks (the mock Modal element stays in the tree when closed), and non-null assertions became a `first()` helper for lint. Neither weakened an assertion.

The deep-link skeleton was already #373 behaviour. Its red failure at the placeholder checkpoint was only the missing `detail-skeleton` testID (see `red-before-implementation.md`). The test that stays green against the placeholder by design is `useListingPreview.spec.tsx` "has nothing for a deep link".

Known evidence limit: no native capture shows Call enabled. Every captured Listing has `canCall=false`, so on the device only Message shows the disabled-to-enabled change. Call's enabled state after load rests on the rendered test in `listingDetailPreviewViewerAsk.spec.tsx` ("keeps the contact bar disabled… then enables it in place").

## Native setup and boundaries

Own services: Compose project `autotm374r-20261001` (Postgres 35474, Redis 36474, MinIO 39474/39475), API 3474 with `SMS_DRIVER=mock`, Metro 8474 started with `--clear`, iPhone 17 `38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`, bundle `tm.auto.app`, all inside one `guarded-run` session. The iPhone 16e was not touched. `ui:fixture` seeded 12 Listings with real photographs. SQL against this runtime database only: five extra `listing_media` rows on one Listing (six photos), one Listing sold, one Listing reassigned to the buyer account to show the owner view. Sign-in used fixture phone +99361000009 and the code the mock SMS driver wrote to the API log. Instant loading and the deep-link skeleton were captured with only this session's API process paused (SIGSTOP) and then resumed.

Not shown by that first session (now covered by the Railway captures below, except as noted): dark mode, a separate thumbnail-jump capture, pinch back to fitted, the no-photo fallback and a gesture recording. Still not shown: double-tap zoom, and swipe-down to close (the approved prototype carries it only as a hint; see below). The viewer closes with ✕ and the system back gesture. Android was not run: the macOS host has no `adb`.

Compose project note: the first project name `autotm374-20261001` left one exited Redis container record that Docker lists but cannot remove after a Docker Desktop restart, so the session used `autotm374r-20261001`.

Context7: `/software-mansion/react-native-gesture-handler` (`Gesture.Pinch`, `Pan`, `Tap`, `Race`, `Simultaneous`; `GestureHandlerRootView` inside a Modal for Android), `/websites/swmansion_react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`, `withTiming`; Reanimated 4 moves `runOnJS` to `scheduleOnRN` in `react-native-worklets`), `/tanstack/query` (`placeholderData` and `initialData` from another query's cache; a separate typed preview was chosen instead, see `CONTEXT.md`), `/expo/expo` (expo-image source, `cachePolicy`).

## Railway PR 478 captures (ADR-0075)

Taken against the PR backend, with Docker absent: no Docker daemon runs on this Mac (`docker info` reports no server, no Compose project was started). The first-session captures above used a local Compose stack; these use Railway.

| Item | Value |
|---|---|
| Environment | `auto.tm-rewrite-pr-478`, `82447457-0203-45c9-aa95-dee938d17df3`, project `176ddec0-dd65-4087-b82c-798599fc2ebe` |
| Deployed source | `5ce5a9832c755de353605aafc648a845b9f132f5` (merge of `origin/main` 6073324 into this branch). `/readyz` reported that SHA with Postgres, Redis and MinIO `ok`. |
| Deployments (all `SUCCESS`) | api `716e1e63-a65a-4362-a9c5-d86bf7c6ae32`, worker `a8ae5af9-9b4e-420a-8b47-56ca748c8170`, MinIO `7681fdbf-1284-4ce6-b15b-869827b87c0a`, admin `1f1d6489-4278-4539-8eed-4be6e5d11072`, web `445390ee-407f-4fc2-a6ab-a23e94edb6bc` |
| Environment repair | Only PR 478: MinIO moved from the unpullable `quay.io/minio/minio:latest` to the ADR-0074 digest-pinned `cgr.dev/chainguard/minio` (start command, health path, `RAILWAY_RUN_UID=0`, as staging has it); `MINIO_PUBLIC_URL` (api), `NEXT_PUBLIC_MINIO_PUBLIC_URL` (admin, web), `NEXT_PUBLIC_API_URL` (admin, web), `ADMIN_ORIGIN` and `SOCKET_IO_CORS_ORIGIN` now reference this environment's own service domains instead of literal staging hostnames. Values are not recorded here. |
| Seed | `railway ssh … node /app/scripts/native-pr-seed.mjs --remote` in the PR 478 API container: reference catalog, three fixture users, twelve Listings with 0, 1 and 2 photos, brand logos |
| Device | iPhone 17 `3A8BB230-13C9-4624-8239-395A6E887D4C` ("AutoTM Queue B iPhone 17"), development client `tm.auto.app`, `-RCT_jsLocation 127.0.0.1:8484`. The iPhone 16e was not touched. Dark captures used `xcrun simctl ui … appearance dark`. |
| Metro and backend wiring | Metro 8484 with `EXPO_PUBLIC_MEDIA_URL` set to the PR 478 MinIO host and `EXPO_PUBLIC_WS_URL` to the PR 478 API. `EXPO_PUBLIC_API_URL` pointed at a small local forwarder (`127.0.0.1:8585`, a throwaway script outside the repository) that relays every request unchanged to the PR 478 API. It can hold single-Listing reads, which is the only way to keep the detail response pending against a remote backend (the first session paused its own API process). With nothing held, every call reached PR 478 normally. |
| Sign-in | Fixture buyer phone, mock OTP read from the PR 478 API service logs. No code or token is in any capture. |

| Criterion or state | Capture |
|---|---|
| Instant loading, light: card tapped, detail held; photo, title, price, spec line, city and date shown, skeletons below, contact bar disabled | [01](railway-pr478/01-light-instant-loading-from-card.jpg), then [02](railway-pr478/02-light-detail-loaded-after-preview.jpg) after releasing |
| Instant loading, dark | [10](railway-pr478/10-dark-instant-loading-from-card.jpg), then [11 dark detail loaded](railway-pr478/11-dark-detail-loaded.jpg) |
| Deep link shows a plain skeleton (cold launch, Listing reads held, no card cached) | [03](railway-pr478/03-light-deep-link-plain-skeleton.jpg) |
| Viewer, dark, opens at the tapped photo with counter, ✕, ♡, thumbnails and Call + Message | [12](railway-pr478/12-dark-viewer-open-1-of-2.jpg) |
| Thumbnail strip jumps to another photo (counter 2 / 2, selected thumbnail) | [13](railway-pr478/13-dark-viewer-thumbnail-jump-2-of-2.jpg) |
| ✕ returns the gallery to the same photo (detail hero and counter show 2 / 2) | [14](railway-pr478/14-dark-viewer-closed-gallery-on-same-photo.jpg) |
| Pinch zoom, then back to fitted, then paging works again | [15 zoomed](railway-pr478/15-dark-viewer-pinch-zoomed.jpg), [16 fitted again](railway-pr478/16-dark-viewer-pinch-back-fitted.jpg), [17 swiped to 1 / 2](railway-pr478/17-dark-viewer-paging-works-after-pinch.jpg) |
| Gesture recording: thumbnail jump, ✕, reopen, pinch out, pinch in, swipe, ✕ (21 s, idle time cut, 360 px wide) | [viewer-swipe-pinch-close.mp4](railway-pr478/viewer-swipe-pinch-close.mp4) |
| No-photo fallback: detail shows "Нет фото" and Ask the seller; tapping the hero opens no viewer | [18](railway-pr478/18-dark-no-photo-detail.jpg), [19 after the tap](railway-pr478/19-dark-no-photo-tap-opens-no-viewer.jpg) (identical by design) |
| Ask the seller chips; signed out goes to sign-in; Conversation opens with the question unsent | [04](railway-pr478/04-light-ask-seller-chips.jpg), [05](railway-pr478/05-light-signed-out-ask-goes-to-sign-in.jpg), [06](railway-pr478/06-light-conversation-prefilled.jpg) |

Re-captured after the main merge (#468 changed Results and the shared cards, not detail): instant loading, loaded detail, deep link, chips, sign-in redirect and the prefilled Conversation. The owner and sold captures (`owner-*`, `sold-*`, `viewer-owner-*`) stay as the first session took them: the PR 478 fixtures have no sold Listing and the owner state needs a seller sign-in, and no code in the owner or sold paths changed in the merge. The Vitest specs for those states passed again on the merged head (163 files, 1256 tests).

The viewer's pinch needs a two-finger path of about ten samples; a six-sample path was not recognised, so the first zoom attempt did nothing. This is a property of the simulator touch injection, not of the screen. Double-tap zoom was not captured.

Swipe-down to close: the approved prototype (`prototype/listing-content`, AR-11-004) has the caption "Swipe down or ✕ to close", but neither the approved listing-content resolution (#351) nor the issue's acceptance criteria require it. It is not implemented; ✕ and the system back gesture close the viewer.

Observation, unproven as a defect: twice, a tap on the detail's back arrow within about a second of closing the viewer did nothing, and the next tap worked. It may be the Modal still closing; it was not investigated.
