# Report alignment with the current Carberk mobile app

This pass compared the live iOS Listing detail screen, the committed light-mode Listing detail and Profile captures, and their current source. It changes the local report prototype and PDF artifacts, not the mobile application.

## Evidence used

- `apps/mobile/global.css`: the native page is HSL(60 7% 95%), not white; raised groups are white. Native destructive text is HSL(15 85% 38%), separate from brand red. This overrides generic shared palette assumptions.
- `packages/ui/tokens/mobile.ts`: Geist for headings and reading, Geist Mono for data; 34/40 display, 22/28 headline, 18/24 subhead, 16/22 body, 13/18 footnote; 24dp grouped surfaces; 52dp default buttons and 44dp header controls.
- `apps/mobile/components/account/MenuRow.tsx`: 16dp padding, 36dp leading disc, 12dp gap, grouped rows and dividers.
- `apps/mobile/components/ui/button.tsx`: black is the default action. Red is a distinct brand variant; every action is not automatically red.
- `apps/mobile/components/navigation/StackHeader.tsx`: tonal circular controls, the same heading family, no mandatory large brand header on each pushed screen.
- `apps/mobile/src/listings/detail/ListingPreview.tsx`: flat page sections, restrained separators, label/value specifications.
- `docs/evidence/release-emulator-pass/024-listing-detail-en-light.png` and `022-profile-en-light.png`: visual references checked against current source. The currently running PR868 iOS Listing detail was also inspected without changing its state; it confirms the warm page, large text, neutral controls and floating action treatment, but is not evidence that this report is integrated.

## Result

| Area | Applied treatment |
| --- | --- |
| Page and groups | Warm native page and white grouped surfaces, 16px phone gutters, 24px group radii. |
| Typography | Existing bundled Geist hierarchy; Geist Mono only for report identifiers, dates, mileage, reference numbers and measurement values. No extra font family introduced. |
| Actions | Black PDF action with 52px minimum height; circular 44px tonal overview control; blue functional links. |
| Findings | Native-style grouped rows, 36px numbered discs, 16px padding, 12px gaps and 13px descriptions. |
| Technical diagrams | Shared original orthographic sedan vectors, restrained panel boundaries, finer wheel rings/lugs, stable finding numbers. Generic geometry explicitly labelled. |
| Phone/tablet | One car view at a time, five view selectors, large touch targets and expandable descriptions. |
| Desktop | Five simultaneous views with a findings column; no duplicated report data or independently authored results. |
| PDF | Separate A4 composition using the same vectors, findings, brand assets and report version. |

The overview control returns to the report's beginning in this standalone reader. Native implementation should use the existing StackHeader and real navigation back to the originating Listing. The phone prototype is browser HTML, not React Native; native text scaling, safe-area behavior and screen-reader parity remain integration work.

## Validation

Inspected phone and desktop renders; checked 320, 390, 768 and 1440 CSS pixel widths, responsive view visibility, all view switches and marker-to-finding expansion. Rendered and inspected the four-page sample and two-page blank worksheet. Verified Turkmen text extraction. Generic detector warnings for Geist are intentional brand alignment; its group-padding warning is a false positive because the child summary/body rows carry 16px padding, matching MenuRow. No production package or runtime changes were made.
