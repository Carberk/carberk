# Hi-Fi — Mobile Home / Search tab

Maps to `apps/mobile/app/(tabs)/(search)/index.tsx` and
`apps/mobile/src/listings/feed/HomeHeader.tsx`.
Governing journey: [Search and discovery](../../features/33-search-discovery.md),
[ADR-0051](../../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md).
Issue #719 quiets the entry card after the accepted #695 visual baseline.

## Purpose and hierarchy

Home is the chronological New listings feed. The AutoTM wordmark and Search
button lead into discovery; the compact Brand/model card opens the Brand picker.
New listings and See all sit above the two-column photo grid. See all opens
unfiltered Results. Home has no filters, safety banner or personalized ranking.

```text
AutoTM                                  Search
[ car  Brand, model                           › ]
[      localized live Listing count             ]
New listings                            See all
[ Listing photo ]       [ Listing photo ]
[ price / model ]       [ price / model ]
```

## Home entry card

- Raised `bg-card` on `bg-background`; neutral `border-hairline border-border`
  edge, `rounded-2xl` (24dp). No heavy shadow or filled icon discs.
- Horizontal inset 16dp, padding 16dp horizontally / 12dp vertically, gap 12dp,
  minimum height 64dp. The whole card is one button; the chevron is decorative.
- Title: `text-body` (16/22), `font-semibold text-foreground`, one line with
  existing shrink-to-fit fallback for localized labels.
- Count: `text-footnote` (13/18), `text-muted-foreground`, tabular figures;
  localized number formatting. It is metadata, not a second heading.
- Plain Car icon: 24dp, muted foreground, stroke 1.8. Plain ChevronRight:
  16dp, muted foreground. Neither is an independent control.
- Keep the existing solid pressed surface and `PressableScale` surface feedback.
  This card adds no translucent material or native blur.

Header Search keeps its 44dp RNR icon button, accessible localized Search label
and navigation to Search. The New listings section keeps `SectionHeader` and
See all's 44dp button. Listing grid cards and feed recovery actions are unchanged.

## Required states and native proof

| State | Header/card | Feed |
|---|---|---|
| Populated | Localized title and live count | Two columns, newest first; Favorite and detail actions |
| Empty catalog | Zero count when returned; card still opens picker | Existing no-listings copy and Sell action |
| Loading | Count skeleton while count pending; all discovery actions available | Existing grid skeleton |
| Offline/error | No fabricated count when unavailable; cached count may remain | Existing FeedError and Retry |

Capture the affected Home states in light/dark, covering EN/RU/TK, and inspect
small viewport / large font expansion. Ensure the card, Search and See all remain
reachable with TalkBack and meet the 44dp minimum. Grid/empty/error content must
clear the floating tab bar and Android system navigation. Existing Reduce Motion
feedback must remain functional; the card is opaque under Reduce Transparency.
Rendered tests prove content and actions; native captures prove actual typography,
layout and colors. Missing states are missing evidence, not implied passes.

## Copy and behavior

Reuse the existing `brandModel`, `listingsCount`, `newListings`, `seeAll` and
`search` translations. Do not hard-code RU/TK/EN text. Preserve anonymous browsing,
viewer-aware Favorites, pending-action replay and retained navigation destinations.
No keyboard interaction belongs to the Home header.

The [#719 preservation comment](https://github.com/Carberk/carberk/issues/719#issuecomment-6909443228) records the separate
accessibility concerns, subsequent source fixes and unresolved native proof.
