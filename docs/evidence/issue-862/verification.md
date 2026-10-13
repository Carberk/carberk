# Listing-reference geometry repair

Issue [#862](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/862), PR [#863](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/863), delegated release outcome #832.

## Source and scope

Product-code/test head `b0fdac4eced510deebc4efaebd04a9ee118702c9`, main base `54b29afa6c9ded0dfc57370ed041f6a70074900d`. Production candidate `a0b4015418cd9fde2b192926948b95aca6e6cf09` changes exactly one existing MessageBubble class expression. Nondeleted `post_ref` gets `w-full` within its existing `max-w-[80%]`; ordinary text/image and deleted Messages keep their sizing. No fixed height, ThumbHash/media/API change, new design or native package/config change.

Ops tested the identical production change with the existing release hash implementation, combining release `904a48099230499d8d3d76714cb3312ec0c0529f` and candidate into temporary detached source `9244b1715466767d42c0dac0d3d854a1a20fe641`. This is test-only combined source, not a child-to-parent merge or a new release. Backend source remained release904. Ops exclusively owned the device and Metro. Android Debug 41, package `tm.auto.app`, used the existing installed client. No new APK or local release binary was built.

## Acceptance evidence

| Criterion | Before | After and limits |
|---|---|---|
| Definite bounded width, readable card and natural height | [Original actual sent cards](before-active-dark.png) collapse, hide title/price/status and overlap | [Clean actual light](after-active-light.png), [final clean actual dark](after-active-dark-final-clean.png), [320 dp/font1.0](after-active-light-320-font100.png), [cold 320 dp/font1.3](after-active-light-cold-320-font130.png) show cover, title, price, status and footer. Price wraps and height grows on the cold larger-font run. |
| Both directions, long titles and unavailable states | Visual look is red-test exempt | Render-only actual-component fixtures show own/received active, received sold and own archived references at [light full width](harness-light-full-font100.png), [light 320 dp](harness-light-320-font100.png), [dark full width](harness-dark-full-font100.png) and [dark 320 dp](harness-dark-320-font100.png). [Cold narrow larger-font fixture](harness-light-cold-320-font130.png) preserves full active/sold text and footer in the visible states; the archived footer is below this capture's viewport and is covered by the normal-font scrolled captures. |
| Actions and unaffected kinds | Corrected pushed red `94830737275cf88fac5185034330a130884999be` fails 3/28 for missing width policy in own/received/sold containers | Same rendered test at b0fdac4e passes 28/28, including active Listing navigation and long-press callbacks, unavailable non-tappability and unchanged text/image/deleted sizing. [Actual BMW tap](actual-bmw-tap-detail.png) opens the matching Listing. Existing aged own references offer no eligible action, so no native long-press sheet pass is claimed; rendered tests prove callback behavior when an eligible action is supplied. |


The fixture route mounted the actual MessageBubble and PostRefCard using valid domain-shaped local props. It sent no Messages, called no API/DB/auth/provider, and had no media key; the existing No image box exercises reserved cover geometry. Actual BMW/Kia cards separately prove real image covers and Conversation layout. Harness screenshots prove rendered states, not real message sending, navigation or media delivery. The temporary fixture and numeric probes were removed before final clean actual-route proof.

At baseline, physical viewport is 1080×2400, density 420 and font scale 1.0. The temporary narrow viewport was 840×1866, 320 dp; font-growth runs use 1.3. Ops restored baseline settings afterward.

## Parent release gate

Root reconciled ownership: this main-based child owns existing card geometry; main intentionally lacks the unmerged hash contract. Known-hash pending-preview and loaded handoff proof remains with #824/#832 final combined release acceptance. #848 and production remain gated on ops proof. Geometry screenshots and rendered width tests cannot prove that media gate, and this child does not claim it passed.

## Runtime attribution and negative observations

Earlier apparent candidate failures still showed collapsed cards because executed JS was stale. The owned Metro was in CI mode without watching; its served bundle initially omitted newly added probes. After clearing/restarting Metro, the native process recorded all six boundaries and both original cards became readable. [Numeric-only trace](numeric-layout.txt) gives row 411.4286 dp, bubble 303.6190 dp, content/card 271.6190 dp and text-column 177.5238 dp; natural card heights 84.19/84.57 dp. This verifies usable bounded geometry, without claiming a particular internal Yoga failure mechanism.

After stripping probes and restarting Metro, clean Android bundle SHA256 was `4fd4fdc192acb53588ee5cd0d98d58e2d6366c3fbb0496dc62e4cff87ef83117`, with zero probe prefixes and the conditional width rule present. Final post-harness clean bundle has the same hash and 18,466,436 bytes, zero fixture/probe markers, and the conditional width rule present. Source components match clean temporary 9244b171, with no fixture route. The cold actual dark screenshot and matching Listing tap were captured afterward.

[Hot font1.3 negative](hot-font130-320-limitation.png) clipped glyphs in status/footer and unrelated header/day text. A genuinely cold native process start at the same configuration passes the real cards and render-only harness. This is a hot native-configuration caveat, not a claimed persistent card defect; no extra font-metrics source change was made. JS reload alone did not refresh native configuration reliably.

## Verification

At exact product-code/test head b0fdac4e:

| Gate | Result |
|---|---|
| `pnpm --filter @auto-tm/mobile test src/conversations/components/MessageBubble.spec.tsx` | 28/28 pass. Corrected red checkpoint 94830737 failed specifically on missing `w-full`. Renderer pins supplied policy, not Yoga or pixels. |
| `pnpm test:unit` | 10/10 workspace tasks pass; mobile 305 files/3345 tests. |
| `pnpm typecheck` | 11/11 workspace tasks pass. |
| `pnpm --filter @auto-tm/mobile lint` | Pass. |
| `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check` | Pass. |
| `pnpm --filter @auto-tm/mobile exec expo export -p ios --clear` | Pass. |
| `pnpm test:root` | 203/203 pass. |
| Hosted required `pr` [run 38394351277](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/38394351277) | Success at exact b0fdac4e, including API, DB, frontend and static gates. Container-backed evidence is hosted per ADR0075. |

No native/config/dependency change requires a rebuilt client. The controlled JS update in the existing installed client supplies runtime evidence; #832 excludes a new staging APK and local release binary. This writer started no Metro or device process.

## Design and documentation

Feature34 Message types requires an embedded tappable Listing reference. This repair is trivial current-state conformance. The conversations overview's ownership/boundaries are unchanged, so no source inventory update is needed.

Official [NativeWind v4 width](https://www.nativewind.dev/docs/tailwind/sizing/width) documents native `w-full` support. Official [React Native 0.83 dimensions](https://reactnative.dev/docs/0.83/height-and-width) says percentage dimensions require a defined parent size. These support the candidate; native proof supplies the actual result.
