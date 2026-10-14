# Listing detail integration evidence, 2026-10-14

PR [#868](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/868) groups parent #866 and slices #864, #867, #869 and #870. Code head `82cd46ff` folds #869 `d49cdea28744d24e97a4160230939a46195eb3e8` into `180eca51bb71df4867784202de52553651a5471e`. Base at this verification was `bb30e348ca5d6a986e7e095b161ce5750d3d8731`. This receipt covers that code head. A subsequent main merge needs proportionate verification recorded in the PR Execution state.

## Automated evidence

| Gate | Result at code head 82cd46ff |
| --- | --- |
| Frozen pnpm install | Pass; no lockfile change |
| `pnpm test:unit` | Pass, 10/10 tasks; mobile 314 files / 3,455 tests; API 2,055 passed / 2 intentionally skipped |
| Repository `pnpm typecheck` | Pass, 11/11 tasks; unreachable non-secret URL supplied only for Prisma generation |
| API, mobile, contracts lint | Pass, 5/5 Turbo tasks including dependencies |
| Focused detail/viewer/card render suites | Pass, 9 files / 169 tests |
| `pnpm test:root` | Pass |
| `pnpm check:runtime-imports` | Pass |
| `pnpm check:glossary` | Pass |
| Expo dependency alignment | Pass, intentional TypeScript exemption |
| Clean iOS Expo export | Pass, 8.6 MB Hermes bundle |
| API compilation | Pass |
| Diff whitespace / ADR-0097 approved-text comparison | Pass |
| Hosted full repository/container gate | [38517157271](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/38517157271), api/db/frontend/static and required pr all success |

Turbo reused unchanged task outputs where applicable. Focused command:

```sh
pnpm --filter @auto-tm/mobile exec vitest run src/listings/components/PhotoViewer.spec.tsx src/listings/components/PhotoGallery.spec.tsx src/listings/components/photoTransitionMath.spec.ts src/listings/components/DetailPhotoStrip.spec.tsx src/listings/detail/listingDetailHero.spec.tsx src/listings/feed/ListingGridCard.spec.tsx src/listings/feed/ListingLargeCard.spec.tsx src/listings/favorites/FavoriteListingCard.spec.tsx test/screens/results.spec.tsx
```

## Acceptance map

| Scope | Automated evidence | Native acceptance |
| --- | --- | --- |
| #864 strip and stable preview/loaded/deep-link layout | DetailPhotoStrip, PhotoGallery, listingDetailHero render suites; red strip checkpoint 4af1e0f1 and green e65b82e2 preserved | Pending founder signoff |
| #867 optional-field preview placement and safe contact-bar presence | Contract preview schemas; ListFeed/ListMyListings/ListMyFavorites application suites; complete/sparse and missing-contact-phone hero tests | Pending founder signoff |
| #869 transition math and open/current-photo close/Reduce Motion wiring | Pure photoTransitionMath and rendered PhotoGallery/PhotoViewer suites; presentation measurement-race red c5d1003a, green b33aaa18; two-frame return-measurement regression test d49cdea2 | Pending founder signoff |
| #870 removed count chips, retained New/+N | ListingGridCard/ListingLargeCard/FavoriteListingCard/Results rendered suites; red f0156a19, green 98a8314b | Pending founder signoff |

The PR body preserves detailed red/green history, historical #865 review disposition and evidence limitations. No recovered raw output is available for #864's new strip red checkpoint. Existing contain-frame captures are historical. Large-text-labelled v3 captures showed Sell and are invalid. Earlier #869 e291da9b recording showed fade-only opening/return and is retained as defect evidence; it does not prove the later measurement fixes on native.

## Founder-owned native acceptance

[Founder disposition](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/868#issuecomment-6161631291) explicitly authorizes integration, automated checks, independent review, accepted fixes and merge before the founder performs the final simulator checks. Missing captures do not block that authorized merge sequence and remain pending founder signoff. No native appearance, smoothness, no-flicker, gesture arbitration, Android offsets or OS Reduce Motion pass is claimed here.

Founder checks on the final merged source must cover rest/scrolled opening, portrait/square/landscape crops, current-photo return after paging, offscreen fade, unzoomed dismiss/spring-back, paging/zoom arbitration, Reduce Motion, light/dark, one/no photos, sold/archived, larger text, deep links, complete/sparse preview transitions and Home/Results/Favorites count policy. Coordinator supplies the final numbered checklist and source/backend handoff.

The release/AAB build hold remains in force until founder acceptance. This integration session did not operate devices, Metro, native/cloud/release binaries, deployments, production media, or provider quota. Native-tree debug instrumentation, artificial loading delay and generated router changes were not incorporated.

## Decisions and finalization

ADR-0097's accepted inset-strip text from `7ea3789c171eba5e59ee0d405beba55f9169cd85` is unchanged. The [#864 founder decision record](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/864#issuecomment-6158141909) records approval. There is no pending ADR/product decision in this group. The founder's transition plan uses 380 ms open, 250 ms close and 150 ms chrome/Reduce Motion, superseding #869's older approximate 280 ms wording.

#874 view counting is excluded from this release source. Coordinator owns final main reconciliation, one independent Standards/Spec review at the fixed verified head, accepted fixes and protected merge. This evidence commit follows the green code-head hosted check under ADR-0091.
