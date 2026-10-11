# Batch 5 verification

PR #827, issues #819 / #820 / #821. Code checked after the worklet runtime fix `f4720cae` and its test URL typecheck repair, including the merge of `origin/main` at `e7cb113b`. Android native proof is the remaining acceptance gate.

## Regression evidence

| Criterion | Red checkpoint and observed failure | Green proof |
|---|---|---|
| #819 cover finishes before later photos | `7165731a`, rendered `useUploadQueue` with eight deferred compressions and PUTs: expected started PUTs `[1]`, received `[1,2]` while cover was held open | `1229de24`, same file passes 24/24; after cover completion two later uploads run concurrently, current grid order and photo IDs remain intact |
| #820 drop keeps UI offsets until reordered grid commits | `1229de24`, rendered `Step2Photos`: expected native shared values `[0,4,119,119]` before parent props commit, received `[-1,-1,0,0]` | `e23bb40a`, 52/52 Photos tests pass; offsets clear after reordered props commit; combined focused run 76/76 |
| #820 serialized native drag worklet | `7a6ab10f`, Babel/Expo-transformed worklet reproduces `TypeError: clamp is not a function`; [native error](08-drag-worklet-error.png) shows the same failure | `f4720cae` moves helper before caller so the closure captures the initialized helper; 59/59 focused Photos/layout/worklet tests pass |
| #820 cross-row target / cover / scroll lock / tap path | Existing red evidence in PR Execution state, original commits `9f946e96` and earlier | Rendered Photos and WizardLayout behavior tests pass in mobile full suite; tap sheet also proved natively below |
| #821 blue read ticks and contrast | Original red evidence retained in PR Execution state at `f4eab1a6` | Full mobile suite includes rendered read/delivered checks and computed contrast; native bubble and list screenshots in both themes below |

## Local gates

All pass after the runtime fix and test URL repair: `pnpm test:unit` (mobile 3332, API 2013 with one existing skipped test, DB 64, worker 194); `pnpm typecheck` (11 tasks); affected mobile ESLint (no errors, ignored `tailwind.config.js` warning); `pnpm check:agent-docs`; `pnpm check:glossary`; `pnpm test:native-session` (8 tests); `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check`; `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear`.

The fresh worktree needed a non-secret placeholder DATABASE_URL for Prisma generation and explicit `pnpm --filter @auto-tm/db generate` before the repository unit gate. Its first attempt lacked generated Prisma source; no code change was needed. No local Docker daemon/container runtime was running. No local release binary was built or tested. The hosted required `pr` check supplies container-backed integration evidence and must be green before merge.

## Native iOS proof

The founder explicitly selected shared staging for this check. SDK 55 existing development client, iPhone 17 Pro iOS 26.2, simulator `D8081755-61D5-42FE-AFAD-E44DAAF6BA7F`, isolated Metro 8082. The guarded helper printed `OK: Metro serves staging`, verified `/readyz` 200 and API/socket/media origins in its served bundle. Existing Metro 8081 and the other iPhone 17 simulator were left untouched. Staging was not reseeded. A new BMW 3 Series 2022 draft was created for verification and saved separately from the pre-existing Toyota draft.

| State | Evidence | Result |
|---|---|---|
| Eight selected photos numbered in tap order | [Picker](01-picker-ordered-eight.png) | pass |
| Cover uploads alone, others queue | [Cover uploading](02a-upload-progress.png), [native recording](photos-native.mp4), around 7s in original capture | pass |
| Cover completed before photos 2/3 upload | [Cover finished](02b-cover-finished.png), same recording, around 8.5s in original capture | pass |
| All eight finish in unchanged picker order | [Uploaded grid](02-eight-photos-uploaded.png) | pass |
| Tap opens Make cover / Move / Remove / Cancel sheet | [Photo 3 sheet](03-tap-action-sheet.png) | pass |
| Read blue ticks on list, light and dark | [Light list](04-messages-read-light.png), [dark list](07-messages-read-dark.png) | pass |
| Read blue ticks and Read label on own bubbles, light and dark | [Light conversation](05-bubble-read-light.png), [dark conversation](06-bubble-read-dark.png) | pass |
| Held cross-row drag, live neighbour shift, locked scrolling and stable drop | User explicitly authorized Kimi computer-control tool, invoked from this Codex model. 1000ms hold: [row1 to row3](09-ios-row1-to-row3.png), [back to row1](10-ios-row3-to-row1.png), [cover](11-ios-drop-cover.png), [native recording](ios-drag-native.mp4). Grid shifts while held, page remains stationary and drops keep the target order. | iOS pass |
| Scroll restored after drag | Short swipe with no hold moves the page, revealing the actions hint: [after drop](12-ios-scroll-restored.png). Tap sheet was proved earlier. | iOS pass |
| Android gesture behavior | Reusable SDK55 development client is assigned on emulator-5554; launch agent owns it temporarily, then hands it over for the remaining gesture proof | missing native evidence |

## Documentation and API lookup

The mutable conversations PRD D6 and conversations overview were updated in the original batch. Listings overview still matches compression concurrency 1, current grid-priority uploads and accessible photo actions. Merged ADRs are unchanged. The catalog now has 130 brands after #831; the old logo count in PR Execution state was corrected.

Context7 `/websites/swmansion_react-native-reanimated` confirms shared-value updates from JS are asynchronous, and writes should happen in callbacks/effects rather than React render. The new reset runs in a layout effect after reordered props commit. The upload scheduling correction is internal policy and needs no external API lookup.

Context7 resolution for Expo ImagePicker was unavailable after one narrower retry because its monthly quota was exhausted. Fallback to [official SDK 55 ImagePicker documentation](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/) confirms `orderedSelection` is supported on iOS 15+, shows numbered badges in tap order and returns assets in that order. Native picker screenshot independently proves the option on this client.

The hosted `pr` run at `f4720cae` rejected the new test because React Native global `URL` and Node `URL` types differed. Passing `.href` to `fileURLToPath` fixes that test-only collision; repository typecheck passes again. Runtime worklet hoisting lookup used [official Reanimated documentation](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/#hoisting) after the Context7 quota failure; worklets are not hoisted, matching the captured undefined helper.
