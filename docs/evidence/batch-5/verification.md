# Batch 5 verification

PR #827, issues #819 / #820 / #821. Code checked at `256b7a2a` after the worklet runtime fix and test URL repair, including the clean merge of `origin/main` at `9336faeacbf688a25b38d2ca37b9a702dc70eb38`. Android manual verification is delegated to the founder for the new cloud build; it is untested by the agent and does not block this release under the founder instruction on issue #820.

## Regression evidence

| Criterion | Red checkpoint and observed failure | Green proof |
|---|---|---|
| #819 cover finishes before later photos | `7165731a`, rendered `useUploadQueue` with eight deferred compressions and PUTs: expected started PUTs `[1]`, received `[1,2]` while cover was held open | `1229de24`, same file passes 24/24; after cover completion two later uploads run concurrently, current grid order and photo IDs remain intact |
| #820 drop keeps UI offsets until reordered grid commits | `1229de24`, rendered `Step2Photos`: expected native shared values `[0,4,119,119]` before parent props commit, received `[-1,-1,0,0]` | `e23bb40a`, 52/52 Photos tests pass; offsets clear after reordered props commit; combined focused run 76/76 |
| #820 serialized native drag worklet | `7a6ab10f`, Babel/Expo-transformed worklet reproduces `TypeError: clamp is not a function`; [native error](08-drag-worklet-error.png) shows the same failure | `f4720cae` moves helper before caller so the closure captures the initialized helper; 59/59 focused Photos/layout/worklet tests pass |
| #820 cross-row target / cover / scroll lock / tap path | Existing red evidence in PR Execution state, original commits `9f946e96` and earlier | Rendered Photos and WizardLayout behavior tests pass in mobile full suite; tap sheet also proved natively below |
| #821 blue read ticks and contrast | Original red evidence retained in PR Execution state at `f4eab1a6` | Full mobile suite includes rendered read/delivered checks and computed contrast; native bubble and list screenshots in both themes below |

## Local gates

Historical gates at the reviewed source `255a06ec3c90e04ae58f1d0e0adbb02b385976a9` passed after the runtime fix and test URL repair: `pnpm test:unit` (mobile 3332, API 2013 with one existing skipped test, DB 64, worker 194); `pnpm typecheck` (11 tasks); affected mobile ESLint (no errors, ignored `tailwind.config.js` warning); `pnpm check:agent-docs`; `pnpm check:glossary`; `pnpm test:native-session` (8 tests); `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check`; `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear`.

The fresh worktree needed a non-secret placeholder DATABASE_URL for Prisma generation and explicit `pnpm --filter @auto-tm/db generate` before the repository unit gate. Its first attempt lacked generated Prisma source; no code change was needed. No local Docker daemon/container runtime was running. No local release binary was built or tested. The hosted required `pr` check supplies container-backed integration evidence and must be green before merge.

## Native iOS proof

The founder explicitly selected shared staging for this check. SDK 55 existing development client, iPhone 17 Pro iOS 26.2, simulator `D8081755-61D5-42FE-AFAD-E44DAAF6BA7F`, isolated Metro 8082. The guarded helper present at the historical reviewed source printed `OK: Metro serves staging`, verified `/readyz` 200 and API/socket/media origins in its served bundle. Existing Metro 8081 and the other iPhone 17 simulator were left untouched. Staging was not reseeded. A new BMW 3 Series 2022 draft was created for verification and saved separately from the pre-existing Toyota draft.

| State | Evidence | Result |
|---|---|---|
| Eight selected photos numbered in tap order | [Picker](01-picker-ordered-eight.png) | pass |
| Cover uploads alone, others queue | [Cover uploading](02a-upload-progress.png), [native recording](photos-native.mp4), around 7s in original capture | pass |
| Cover completed before photos 2/3 upload | [Cover finished](02b-cover-finished.png), same recording, around 8.5s in original capture | pass |
| All eight finish in unchanged picker order | [Uploaded grid](02-eight-photos-uploaded.png) | pass |
| Tap opens Make cover / Move / Remove / Cancel sheet | [Photo 3 sheet](03-tap-action-sheet.png) | pass |
| Read blue ticks on list, light and dark | [Light list](04-messages-read-light.png), [dark list](07-messages-read-dark.png) | pass |
| Read blue ticks and Read label on own bubbles, light and dark | [Light conversation](05-bubble-read-light.png), [dark conversation](06-bubble-read-dark.png) | pass |
| Held cross-row drag, live neighbour shift, locked scrolling and stable drop | User explicitly authorized Kimi computer-control tool, invoked from this Codex model. 1000ms hold: [row 1 to row 3](09-ios-row1-to-row3.png), [back to row 1](10-ios-row3-to-row1.png), [cover](11-ios-drop-cover.png), [native recording](ios-drag-native.mp4). Grid shifts while held, page remains stationary and drops keep the target order. | iOS pass |
| Scroll restored after drag | Short swipe with no hold moves the page, revealing the actions hint: [after drop](12-ios-scroll-restored.png). Tap sheet was proved earlier. | iOS pass |
| Android gesture behavior | Founder instruction on [issue #820](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/820): "no need to use i will drag test msylef for that pass". Functionality remains required; the founder owns manual verification on the new cloud build. | untested by agent; founder delegated |

## Documentation and API lookup

The mutable conversations PRD D6 and conversations overview were updated in the original batch. Listings overview still matches compression concurrency 1, current grid-priority uploads and accessible photo actions. Merged ADRs are unchanged. The catalog now has 130 brands after #831; the old logo count in PR Execution state was corrected.

Context7 `/websites/swmansion_react-native-reanimated` confirms shared-value updates from JS are asynchronous, and writes should happen in callbacks/effects rather than React render. The new reset runs in a layout effect after reordered props commit. The upload scheduling correction is internal policy and needs no external API lookup.

Context7 resolution for Expo ImagePicker was unavailable after one narrower retry because its monthly quota was exhausted. Fallback to [official SDK 55 ImagePicker documentation](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/) confirms `orderedSelection` is supported on iOS 15+, shows numbered badges in tap order and returns assets in that order. Native picker screenshot independently proves the option on this client.

The hosted `pr` run at `f4720cae` rejected the new test because React Native global `URL` and Node `URL` types differed. Passing `.href` to `fileURLToPath` fixes that test-only collision; repository typecheck passes again. Runtime worklet hoisting lookup used [official Reanimated documentation](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/#hoisting) after the Context7 quota failure; worklets are not hoisted, matching the captured undefined helper.

## Android manual verification ownership

The founder explicitly delegated Android drag testing to themselves on the new cloud build and removed the agent native pass as a release blocker. There is no pending test-control permission and no claimed Android pass. Earlier bounded attempts booted an SDK 55 debug client on emulator-5554 against staging but did not perform fixture sign-in or establish gesture proof; Cua/Kimi Qt input did not produce a reliable guest interaction. No local release binary was built or tested. No further Android touch or boot was performed after the founder instruction.

## Founder iPhone report and source verification

The founder then reported that dragging from a lower row to the first still failed, and identified the iPhone simulator. Read-only inspection of assigned simulator `D8081755-61D5-42FE-AFAD-E44DAAF6BA7F` found Carberk PID 24558 with `-RCT_jsLocation 127.0.0.1:8084`. Port 8084 had stopped; only the unrelated user's Metro 8081 was listening. The launch-polish checkout at `a8cb9ba5677f096b23daf6a4be80e7bfd8c8d276` still had the old `PhotoThumbnail` `onLongPress` and `onTouchMove` implementation at lines 92/93. [Prior cached screen](14-ios-cached-older-bundle.png) records the inspected state. This was the earlier implementation, rather than Batch 5's verified Gesture Handler code.

The guarded helper preserved at the historical reviewed source then started fresh staging Metro 8082 at `256b7a2a`, verified API/socket/media origins, and relaunched only the assigned iPhone with the 8082 argument. A 500 ms hold moved the grass photo from row 3 column 2 to row 1 column 2. Neighbours shifted and the page stayed stationary: [rechecked first-row drop](13-ios-lower-row-to-first-500ms.png), [native recording](ios-lower-row-recheck.mp4). The reverse move restored the pre-test order. Existing screenshots 09 through 12 retain lower-row/cover/scroll proof from the earlier verified session.

The founder independently confirmed on the corrected bundle: "dragging is working it passed". The report is resolved by loading the correct source; no additional production change was needed. Subsequent native gestures stopped after that confirmation. Android remains untested by the agent and delegated to the founder.

All repository unit/typecheck, affected mobile lint, Expo dependency/iOS export and documentation gates were rerun after the main integration. The mobile suite passes 3332 tests across 304 files; API 2013 plus one existing skipped test, DB 64 and worker 194 pass. The unrelated intermittent profile-photo progress-bar failure did not recur in this run. Container-backed tests belong to the required hosted `pr` check.

## Accepted review fix round

The sole combined review at `255a06ec3c90e04ae58f1d0e0adbb02b385976a9` accepted three findings. Red checkpoint `f4ce1fc2` ran `pnpm --filter @auto-tm/mobile exec vitest run src/listings/uploadStaging/useUploadQueue.spec.tsx`: 5 failed, 24 passed. The restored lost-cover follower stayed `compressed` instead of `uploaded`; removal, reorder, last compression rejection and missing destination each started zero presigns instead of one. The same 29 tests pass with the fix. Original red checkpoint `d5df5922` is also retained.

This bounded round excludes terminal lost covers from the upload gate and wakes waiting uploads when compression fails or the seller removes/reorders a cover. Rendered-hook regressions preserve cover completion before followers, serial compression, two upload slots, grid IDs/order and no duplicate PUT after repeated wake/resume.

The native-session helper and its test, scripts and mandatory guidance were removed from this batch. [Issue #841](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/841) owns that separate tooling work, with the reviewed SHA above preserving its source. Native screenshots, recordings and helper results above remain historical evidence from that source; the helper is no longer present in this PR target. The existing native-pr-seed helper is retained. The three image links now use their actual checked-in filenames.

Fix-round local gates pass: `pnpm test:unit` (10 successful tasks, mobile 3337/3337 across 304 files freshly run; nine unchanged-workspace tasks reused Turbo cache); `pnpm typecheck` (11/11, mobile freshly run and ten cached); affected queue hook/test ESLint; `pnpm check:agent-docs`; `pnpm check:glossary`; `pnpm check:runtime-imports`; `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check`; `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear`. Container-backed tests remain the exact final head's hosted required `pr` gate. No new native build, simulator/emulator, live backend or production operation was performed in this fix round. Prior iOS agent/founder proof remains above; Android is still untested by the agent and delegated to the founder.
