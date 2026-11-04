# Wireframe - Mobile Create Listing Wizard

> **2026-05-19 closure note.** At sprint-4 closure two structural decisions diverged from this wireframe and are not reflected below: (1) Review is now its own step (Step 8 of 8), not an inline section at the bottom of Step 7; (2) field errors render inline directly under each input, not as a global stack at the top of the step body. See sprint-04 retro for rationale. The rest of this document remains the authoritative shape for the wizard.

Issue: GitHub #93, S4 mobile 7-step listing wizard + drafts + upload staging

References:
- `docs/prd/features/32-listings.md`
- `docs/prd/flows/61-create-listing.md`
- `docs/prd/sprints/sprint-04-listings-crud.md`
- `docs/prd/sprints/sprint-04-listings-crud-pre-retro.md`
- `docs/prd/features/31-catalog.md`
- `docs/adr/0022-city-first-listing-location.md`
- `docs/agents/nativewind-v4.md` - mobile UI stack guide. Implementation agents must map each named primitive to React Native Reusables (RNR) and keep mobile components inside `apps/mobile`.

> Primitive-to-RNR map:
> - Wizard CTAs, camera/library actions, retry/remove actions -> `Button`
> - VIN, year, mileage, price, phone, description, area/landmark, engine power -> `Input` or textarea composition around `Input`
> - Brand/model/generation/location/spec pickers -> `Sheet`
> - Header overflow -> `DropdownMenu`
> - Discard confirmation -> `AlertDialog`
> - Calls/chat/exchange/installment -> `Switch`
> - Cover, upload state, seller terms -> `Badge`
> - Wizard step progress and photo upload progress -> `Progress`
> - Inline loading placeholders -> `Skeleton`
> - Save/publish feedback -> `Toast`
> - Edit-mode locked fields -> `Tooltip` or inline helper

==============================================
WIREFRAME - Sell entry
Platform: mobile
==============================================

## Purpose

Start the S4 sell flow from the Sell tab, either by continuing the latest draft or creating a new listing.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Sell                                       │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ Latest draft                          │ │
│ │ 2018 Toyota Camry                     │ │
│ │ Saved 2 min ago                       │ │
│ │ 8 photos, price missing               │ │
│ │ [Continue draft]                      │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ [New listing]                              │
└────────────────────────────────────────────┘
```

If no drafts exist, the Sell tab creates or opens the wizard directly; no draft list screen appears in #93.

## Numbered content blocks

1. **Screen title** - Plain Sell tab title.
2. **Latest draft card** - The most recently updated draft only, not a full draft list.
3. **Continue draft CTA** - Opens the latest draft at the last completed step.
4. **New listing CTA** - Creates a new `ListingDraft` and opens Step 1.

## Interactions

- Tapping block 3 -> open wizard with server draft payload and staged media state.
- Tapping block 4 -> create a new draft, then open Step 1.
- Full draft management lives in My Listings / #94.
- Sell-from-Garage entry is not shown in #93.

## States

- **Loading**: `Skeleton` card while latest draft loads.
- **Empty**: no entry card; open/create wizard directly.
- **Error**: inline retry row, "Could not load draft. Try again."
- **Offline**: no offline draft promise; show last local route only if already mounted.

## Content / copy

- Title: "Sell"
- Card label: "Latest draft"
- Primary CTA: "Continue draft"
- Secondary CTA: "New listing"
- Error: "Could not load draft. Try again."

==============================================
WIREFRAME - Wizard shell
Platform: mobile
==============================================

## Purpose

Provide the shared structure for all seven wizard steps: progress, autosave status, overflow actions, and linear navigation.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ [<] Sell car                         [...] │
│ Step 3 of 7                     Saved      │
│ [==========--------------------------]     │
├────────────────────────────────────────────┤
│                                            │
│ Step content                               │
│                                            │
│                                            │
├────────────────────────────────────────────┤
│ [Back]                            [Continue]│
└────────────────────────────────────────────┘

Overflow menu:
┌──────────────────────────────┐
│ Discard draft                │
└──────────────────────────────┘
```

## Numbered content blocks

1. **Back icon** - Returns to the previous route or previous step depending on route context.
2. **Title** - `Sell car`; edit mode changes this to `Edit listing`.
3. **Overflow menu** - Contains destructive draft action only.
4. **Step + save status** - `Step N of 7`, plus `Saving...`, `Saved`, or `Could not save - Retry`.
5. **Progress** - Linear progress indicator; not a tappable stepper.
6. **Footer** - `Back` + `Continue`; Step 7 uses `Back` + `Publish`.

## Interactions

- Tapping Continue -> validates the current step, forces server autosave, then moves forward.
- Tapping Back -> moves to the previous step without arbitrary jump behavior.
- Tapping overflow Discard draft -> opens `AlertDialog`.
- Review summary on Step 7 may deep-link back to completed steps only.

## States

- **Saving**: status text says "Saving..." and Continue stays disabled during forced step-transition save.
- **Saved**: status text says "Saved".
- **Save error**: stay on current step; show `Could not save - Retry`.
- **Edit mode**: same shell, title `Edit listing`, final CTA `Save changes`.

## Content / copy

- Title: "Sell car"
- Edit title: "Edit listing"
- Save error: "Could not save - Retry"
- Discard menu item: "Discard draft"

==============================================
WIREFRAME - Discard draft confirmation
Platform: mobile
==============================================

## Purpose

Prevent accidental loss of a server draft and staged media.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ dimmed wizard                              │
│                                            │
│      ┌──────────────────────────────┐      │
│      │ Discard draft?               │      │
│      │ This removes your draft and  │      │
│      │ staged photos for this       │      │
│      │ listing.                     │      │
│      │                              │      │
│      │ [Cancel]     [Discard draft] │      │
│      └──────────────────────────────┘      │
└────────────────────────────────────────────┘
```

## Interactions

- Cancel -> closes dialog, no state change.
- Discard draft -> calls `DELETE /api/v1/listings/drafts/:id`, clears staging directory, returns to Sell tab.

## States

- **Loading**: destructive CTA shows loading state.
- **Error**: keep dialog open; show "Could not discard draft. Try again."

==============================================
WIREFRAME - Step 1: VIN
Platform: mobile
==============================================

## Purpose

Capture optional VIN/chassis text without promising OCR, decode, or autofill in Sprint 4.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 1 of 7                     Saved      │
│ [====--------------------------------]     │
│                                            │
│ VIN or chassis number                      │
│ Optional. You can fill details manually.   │
│                                            │
│ VIN / chassis number                       │
│ ┌────────────────────────────────────────┐ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ No checking is done in this version.       │
│                                            │
│ [Skip]                           [Continue]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Title + helper** - Explains VIN is optional.
2. **VIN input** - Plain text input.
3. **No-decode helper** - Honest Sprint 4 limitation.
4. **Skip / Continue** - Both can proceed because VIN is optional.

## Interactions

- Typing VIN -> stores `vin` in draft payload.
- Tapping Skip -> clears or leaves VIN empty and advances.
- No OCR, camera, check, decode, or autofill action appears.

## States

- **Empty**: valid; Continue enabled.
- **Error**: only local text length/format guard if needed; no decoder error state.

## Content / copy

- Title: "VIN or chassis number"
- Helper: "Optional. You can fill details manually."
- Limitation: "No checking is done in this version."
- Skip: "Skip"

==============================================
WIREFRAME - Step 2: Photos
Platform: mobile
==============================================

## Purpose

Let sellers add 1-20 photos, start staging/upload immediately, reorder photos, and resolve upload failures.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 2 of 7                     Saved      │
│ [========----------------------------]     │
│                                            │
│ Add photos                                 │
│ [Camera] [Library]                         │
│                                            │
│ Tips: [Front] [Interior] [Odometer]        │
│                                            │
│ ┌────────┐ ┌────────┐ ┌────────┐          │
│ │ Cover  │ │ 65%    │ │ Failed │          │
│ │ photo  │ │ upload │ │ Retry  │          │
│ └────────┘ └────────┘ │ Remove │          │
│ ┌────────┐ ┌────────┐ └────────┘          │
│ │ photo  │ │ photo  │                     │
│ └────────┘ └────────┘                     │
│                                            │
│ First photo is cover. Drag to reorder.     │
│                                            │
│ [Back]                          [Continue]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Add actions** - Camera and Library buttons.
2. **Helper chips** - Front, Interior, Odometer. Guidance only, no required angle checklist.
3. **Photo grid** - First item has `Cover` badge.
4. **Upload progress** - Thumbnail overlay with `Progress`.
5. **Failed thumbnail** - Retry and Remove actions.
6. **Footer validation** - Continue disabled until at least one photo exists locally or is queued; Publish later requires at least one attached photo and no required unresolved upload.

## Interactions

- Camera -> opens camera picker.
- Library -> opens multi-select library picker.
- Selecting photos -> compress to staging and upload in background.
- Dragging photos -> changes sort order and cover.
- Retry -> retries whole-file upload from staged compressed file.
- Remove -> removes local staged file or attached media from draft.
- Continue -> allowed while uploads are in progress; final Publish remains blocked until uploads are clean.

## States

- **Empty**: show add actions and helper; Continue disabled until at least one photo selected.
- **Uploading**: progress overlay per thumbnail.
- **Failed**: Retry + Remove on that thumbnail.
- **Waiting for network**: badge on affected thumbnails; no offline draft promise.
- **Max 20**: disable Camera/Library add once 20 photos selected.

## Content / copy

- Title: "Add photos"
- Helper: "Photos under 5 MB upload faster."
- Cover helper: "First photo is cover. Drag to reorder."
- Failed label: "Upload failed"

==============================================
WIREFRAME - Step 3: Vehicle identity
Platform: mobile
==============================================

## Purpose

Collect structured vehicle identity through searchable catalog sheets, with required Year and optional Generation.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 3 of 7                     Saved      │
│ [============------------------------]     │
│                                            │
│ Vehicle                                   │
│                                            │
│ Brand                                      │
│ [ Toyota                              > ]  │
│                                            │
│ Model                                      │
│ [ Camry                               > ]  │
│                                            │
│ Generation                                 │
│ [ Not specified                       > ]  │
│ No generations for this model yet.         │
│                                            │
│ Year *                                     │
│ [ 2018                                  ]  │
│                                            │
│ [Back]                          [Continue]│
└────────────────────────────────────────────┘
```

## Picker sheet pattern

```text
┌────────────────────────────────────────────┐
│ Select brand                         [X]   │
│ [ Search brands ]                          │
│                                            │
│ Popular                                    │
│ Toyota                                     │
│ Mercedes-Benz                              │
│ Hyundai                                    │
│                                            │
│ All brands                                 │
│ ...                                        │
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Brand trigger row** - Opens searchable `Sheet`.
2. **Model trigger row** - Disabled until Brand selected; sheet scoped to Brand.
3. **Generation trigger row** - Disabled until Model selected; optional.
4. **Generation empty state** - "No generations for this model yet."
5. **Year input** - Required; no generated default.

## Interactions

- Selecting Brand -> clears Model and Generation if previous values conflict.
- Selecting Model -> enables Generation.
- Skipping Generation -> allowed.
- Missing Year -> Continue disabled with inline helper.

## States

- **Brand missing**: Model/Generation disabled.
- **No generation data**: empty sheet state; row value remains "Not specified".
- **Missing year**: inline error "Year is required."
- **Edit mode**: VIN, Brand, Model, Generation, Year disabled with locked helper.

## Content / copy

- Title: "Vehicle"
- Generation empty: "No generations for this model yet."
- Missing year: "Year is required."
- Locked helper: "This field cannot be changed after publishing."

==============================================
WIREFRAME - Step 4: Specs
Platform: mobile
==============================================

## Purpose

Capture required condition and used-car mileage, plus optional completeness specs.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 4 of 7                     Saved      │
│ [================--------------------]     │
│                                            │
│ Specs                                      │
│                                            │
│ Condition                                  │
│ [Used] [New]                               │
│                                            │
│ Mileage, km *                              │
│ [ 62000                                ]   │
│                                            │
│ Optional details                           │
│ [ Color              White             > ] │
│ [ Body type          Sedan             > ] │
│ [ Transmission       Automatic         > ] │
│ [ Drive type         Front-wheel       > ] │
│ [ Engine type        Petrol            > ] │
│ [ Engine power       181 hp              ] │
│                                            │
│ [Back]                          [Continue]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Condition segmented control** - Defaults to Used.
2. **Mileage input** - Required only when Used.
3. **Optional spec rows** - Completeness fields; do not block publish in Sprint 4.

## Interactions

- Switching to New -> mileage becomes optional or hidden.
- Switching back to Used -> mileage visible and required.
- Optional rows -> open searchable `Sheet` where applicable.

## States

- **Used missing mileage**: Continue disabled; inline error "Mileage is required for used cars."
- **New**: mileage optional/hidden; no mileage validation.
- **Catalog empty**: row can stay unset; publish still allowed.

## Content / copy

- Title: "Specs"
- Section: "Optional details"
- Missing mileage: "Mileage is required for used cars."

==============================================
WIREFRAME - Step 5: Price and seller terms
Platform: mobile
==============================================

## Purpose

Collect full asking price, currency, local-market seller terms, and honest FX/payment helper copy.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 5 of 7                     Saved      │
│ [====================----------------]     │
│                                            │
│ Price                                      │
│                                            │
│ Amount *                                   │
│ [ 105000                               ]   │
│                                            │
│ Currency                                   │
│ [TMT] [USD] [AED]                          │
│ About 367500 TMT                           │
│                                            │
│ Seller terms                               │
│ [off] Exchange possible                    │
│ [off] Installment possible                 │
│                                            │
│ Enter the full asking price. AutoTM does   │
│ not finance or verify seller payment terms.│
│                                            │
│ [Back]                          [Continue]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Amount input** - Positive amount required.
2. **Currency segmented control** - TMT default; USD/AED supported.
3. **Approximate TMT helper** - Shown for USD/AED when FX exists.
4. **Seller terms switches** - Exchange possible, Installment possible. Optional, default off.
5. **Payment disclaimer** - Full asking price only; no down payment or financing workflow.

## Interactions

- Switching currency after amount entered -> clears amount, focuses price input, and shows helper to enter the new-currency price.
- Non-TMT with missing FX -> current step can continue, but final Publish is blocked with helper.
- Exchange/Installment switches -> stored as booleans, not publish-blocking.
- No separate negotiable toggle.

## States

- **Missing price**: Continue disabled; inline error.
- **Invalid price**: amount must be greater than zero.
- **FX missing**: helper "Exchange rate unavailable. Try TMT or contact support."
- **Seller term selected**: later listing cards/detail show small badges.

## Content / copy

- Title: "Price"
- FX helper: "About 367500 TMT"
- FX missing: "Exchange rate unavailable. Try TMT or contact support."
- Disclaimer: "Enter the full asking price. AutoTM does not finance or verify seller payment terms."

==============================================
WIREFRAME - Step 6: Location
Platform: mobile
==============================================

## Purpose

Capture city-first car inspection location without asking for GPS, maps, or exact home address.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 6 of 7                     Saved      │
│ [========================------------]     │
│                                            │
│ Car location                               │
│                                            │
│ Region *                                   │
│ [ Ahal                                > ]  │
│                                            │
│ City *                                     │
│ [ Ashgabat                            > ]  │
│                                            │
│ Area / landmark                            │
│ [ 30 mkr near Lukoil                   ]   │
│                                            │
│ Choose where the car can be inspected.     │
│ Do not enter your home address.            │
│                                            │
│ [Back]                          [Continue]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Region picker** - Required.
2. **City picker** - Required, scoped to selected Region.
3. **Area / landmark input** - Optional `locationText`.
4. **Privacy helper** - Discourages exact private addresses.

## Interactions

- Selecting Region -> clears City if incompatible.
- City disabled until Region is selected.
- Area / landmark stays free text.
- No current-location button, GPS prompt, map pin, or exact address field.

## States

- **Missing region/city**: Continue disabled with inline helper.
- **No cities for region**: picker sheet empty state and retry.
- **Edit mode**: location fields remain editable.

## Content / copy

- Title: "Car location"
- Helper: "Choose where the car can be inspected. Do not enter your home address."

==============================================
WIREFRAME - Step 7: Description, contact, review
Platform: mobile
==============================================

## Purpose

Collect seller description and contact preferences, then show a compact publish review without a separate preview route.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ Step 7 of 7                     Saved      │
│ [====================================]     │
│                                            │
│ Description                               │
│ [ Well kept Camry. Service done on time. ] │
│ [ Minor scratches on rear bumper.        ] │
│ 48 / 2000                                  │
│                                            │
│ Contact                                    │
│ Phone                                      │
│ [ +99362XXXXXX                         ]   │
│ [on] Calls                                 │
│ [on] Chat                                  │
│ Chat will become available when messaging  │
│ launches.                                  │
│                                            │
│ Review                                     │
│ Photos        8 attached              >    │
│ Car           2018 Toyota Camry       >    │
│ Price         105000 TMT              >    │
│ Terms         Exchange, Installment   >    │
│ Location      Ashgabat                >    │
│ Contact       Calls + chat            >    │
│                                            │
│ [Back]                            [Publish]│
└────────────────────────────────────────────┘
```

## Numbered content blocks

1. **Description textarea** - Required, max 2000, no auto-translation.
2. **Character count** - Count only; no minimum beyond non-empty.
3. **Phone input** - Prefilled from profile, editable per listing.
4. **Contact switches** - Calls and Chat default on; at least one required.
5. **Chat helper** - Honest S7 messaging note.
6. **Review summary** - Compact, not a separate preview route.
7. **Publish CTA** - Runs publish validation and creates active listing.

## Interactions

- Empty description -> Publish disabled and inline error.
- Turning both Calls and Chat off -> second switch action is rejected or shows inline error.
- Review row tap -> deep-links back to a completed step.
- Publish -> validates required fields, required clean media, FX availability, and contact method.
- Success -> `Toast` "Listing published", then route to new listing detail.

## States

- **Missing required data**: Review row shows inline issue and links back to step.
- **Pending upload**: Publish disabled with helper "Wait for photos to finish uploading."
- **Failed upload**: Publish disabled with helper "Retry or remove failed photos."
- **FX missing**: Publish disabled for non-TMT price.
- **Publish loading**: CTA loading state; form stays visible.
- **Publish error**: keep wizard state; show retry.

## Content / copy

- Title: "Description"
- Description helper: "Add condition, service history, and reason for selling."
- Chat helper: "Chat will become available when messaging launches."
- Publish success: "Listing published"

==============================================
WIREFRAME - Edit mode variation
Platform: mobile
==============================================

## Purpose

Reuse the wizard for editing existing listings while protecting post-publish identity fields.

## ASCII wireframe

```text
┌────────────────────────────────────────────┐
│ [<] Edit listing                    [...]  │
│ Saved                                      │
├────────────────────────────────────────────┤
│ Vehicle                                   │
│                                            │
│ [ Toyota                         locked ]  │
│ [ Camry                          locked ]  │
│ [ XV70                           locked ]  │
│ [ 2018                           locked ]  │
│ This field cannot be changed after         │
│ publishing.                                │
│                                            │
│ Editable fields continue below...          │
│                                            │
│ [Back]                      [Save changes] │
└────────────────────────────────────────────┘
```

## Locked fields

- VIN
- Brand
- Model
- Generation
- Year

Photos are explicitly not locked after publishing. Owners can add, remove, and reorder photos in edit mode; reordering changes the cover photo. See [ADR-0024](../../../adr/0024-owner-post-publish-photo-editing.md).

## Interactions

- Locked rows are disabled and expose helper text or tooltip.
- Editable fields use the same step layouts.
- Photo editing uses the same photo-grid affordances where applicable: add, remove, retry failed upload, and reorder.
- Final CTA says `Save changes`, not `Publish`.

## States

- **Locked-field tap**: show tooltip/helper "This field cannot be changed after publishing."
- **Save loading**: CTA loading state.
- **Save error**: keep wizard state; show retry.

==============================================
Implementation notes
Platform: mobile
==============================================

## Required fields for Publish

- At least one attached photo
- No pending or failed required photo upload
- Brand
- Model
- Year
- Condition
- Mileage when Condition is Used
- Positive full asking price
- Currency
- Region
- City
- Non-empty Description
- At least one contact method: Calls or Chat
- Non-TMT FX rate available when price currency is USD or AED

## Non-blocking fields

- VIN
- Generation
- Color
- Body type
- Transmission
- Drive type
- Engine type
- Engine power
- Area / landmark
- Exchange possible
- Installment possible

## Customization preview

- **Picker rows** - custom composition wrapping `Button`/row primitives and opening RNR `Sheet`.
- **Photo grid item** - custom listing-wizard component using `Badge`, `Progress`, and `Button` actions.
- **Phone input** - custom composition around RNR `Input` if a `+993` prefix is rendered separately.
- **Description textarea** - custom multiline composition around input behavior if RNR `Input` alone is insufficient.
- **Review rows** - custom row composition using `Button` ghost/link behavior for completed-step deep links.

## Open questions for hi-fi

None blocking for #93. Hi-fi should decide exact RU/TK/EN copy, icon choices, row density, and final spacing.
