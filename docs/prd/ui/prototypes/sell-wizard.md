# Sell wizard, drafts and My listings: analysis and prototype note

Issue: [#354 Prototype the Sell wizard, drafts, and My listings states](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354).
Prototype: [`sell-wizard.prototype.html`](sell-wizard.prototype.html), a throwaway single file in the style of the Cabinet prototype at `8402d60`.
Source read: `origin/main` at `3309977`. Date: 2026-10-02.

Nothing here is approved. A ★ marks the writer's recommendation. RU and TK wording that does not come from `apps/mobile/src/i18n/resources.ts` is a draft and has not been checked by a native speaker.

## 1. What must be respected

| Rule | Source |
|---|---|
| Five tabs; Sell is a tab | #344 |
| Cabinet has one "My listings" row with a total; tabs are Active · Drafts · Archive; Sold sits inside Archive; no "List a car" on Cabinet; bottom-sheet pickers; plain rows; Help used sparingly | #353, founder decisions of 2026-10-02 |
| Every Listing contact phone is verified by SMS; no account phone is needed to sell; a verified extra number is reusable for 7 days and never becomes a Sign-in Method | ADR-0056 |
| Codes: 6 digits, 5 minutes, 5 wrong attempts, 5 requests per number per 24 hours, resend wait 60 s × 2ⁿ | ADR-0054 |
| No Share anywhere | PR #499 |
| Keep Drafts, Active, Sold, Archive, Relist, Edit, Delete, a no-action "Blocked" label; defer Under review, Rejected, expiry; a sold Listing cannot return to active | #353 |
| Photos are compressed on the phone to at most 5 MB; video, when it exists, is at most 60 s | #354, ADR-0008 |
| Brand, model, generation, year and VIN are locked after publishing; edits stay local until Save changes | `LOCKED_FIELDS`, ADR-0024 |

## 2. Today's wizard, read from source

Eight steps, defined in `packages/contracts/src/schemas/wizard.ts` and driven by `apps/mobile/src/listings/wizard/wizardMachine.ts`. Each step depends on all earlier ones. Errors appear after the first tap on Continue.

| # | Step | Fields | Required | Rules |
|---|---|---|---|---|
| 1 | VIN | VIN | no | up to 17 characters; Skip button; helper text promises auto-fill, but nothing decodes a VIN (ADR-0053) |
| 2 | Photos | photos from Camera or Library | at least 1 | up to 20; Continue needs one photo already uploaded (`photosUploading`) |
| 3 | Vehicle | Brand, Model, Generation, Year | Brand, Model, Year | Year is a typed number, 1900 to next year; pickers are searchable sheets |
| 4 | Specs | Condition, Mileage, Damaged / needs repair, Known issues, Color, Body, Transmission, Drive, Engine type, Power | Condition, Mileage for used, Damaged | Known issues up to 1000 characters (ADR-0052) |
| 5 | Price | Amount, Currency (TMT, USD, AED), Exchange possible, Installment | Amount | above 0, up to 999 999 999; switching currency clears the amount |
| 6 | Location | Region, City, Area | Region, City | Area up to 200 characters; car location, not the seller's (ADR-0022) |
| 7 | Contact | Description, Contact phone, Phone calls, In-app chat | Description, one contact method | Description up to 2000; the phone is free text, unchecked |
| 8 | Review | checklist with Edit links, preview | all steps valid, uploads finished | Publish |

Around the steps:

- **Sell tab entry** (`app/(tabs)/sell.tsx`): signed out shows "Start listing", which opens a sign-in dialog. With a draft: a "Latest draft" card with Continue, then New listing, then "My listings & drafts". Tapping New listing creates a server draft at once.
- **Autosave** (`useWizardAutosave.ts`): debounced save on change, forced save on every step change, three retries (1 s, 2 s, 4 s), then "Could not save" with Retry. No offline persistence.
- **Leaving**: the header button says Cancel and opens "Discard listing?". There is no save-and-close; the draft survives only if the seller leaves some other way.
- **Photos** (`uploadStaging/`): picker files are copied, resized to 2400 px JPEG at quality 0.8, recompressed at 0.6 if still over 5 MB, then uploaded through a presigned URL, two at a time, with two automatic retries for retryable errors. States: `selected`, `compressed`, `presigned`, `uploading`, `uploaded`, `attached`, `failed`, `waiting_for_network`, `lost`. Error kinds: network, rate limited, server (presign), upload failed (PUT), local file missing (not retryable). First photo is the cover; reorder by drag or by Move up, Move down, Set as cover; Remove.
- **Publish** (`PublishListing.ts`): requires brand, model, year, city, region, price, currency, condition, description, one contact method, one attached photo, mileage for used cars and the Damaged answer. Creates the Listing as `active`, deletes the draft, then the app shows a toast and opens Listing detail.
- **My listings** (`app/listings/manage.tsx`): tabs Active, Sold, Archived, Drafts. Cards have Open and Edit. A banned Listing is returned by the API but matches no tab.
- **Owner actions** (`OwnerActions.tsx`): bar with Edit and Mark as sold; menu with Archive, Republish (archived only), Delete. Each asks for confirmation.
- **Status transitions** (`ListingStatus.ts`): active → sold or archived; sold → archived; archived → active; banned → nothing.
- **Edit** (`app/listings/[id]/edit.tsx`): the same wizard opened at Review, VIN and Vehicle disabled, "Save changes", "Leave edit mode?" on exit.

### Built and not built

| Area | Built today | Planned or missing |
|---|---|---|
| Wizard, drafts, autosave, resume | yes | a draft cap (none exists, no expiry either) |
| Photo queue and all its states | yes | nothing |
| Video | API accepts `video/mp4` up to 10 MB and one video per Listing | no mobile picker or compressor, no transcoder in the worker, no player on Listing detail; deferred by ADR-0027 and PRD 32 |
| Contact phone | free-text field stored unchecked | all of ADR-0056: purpose-bound codes, the verified-contact-phone record, the 7-day window, checks on publish, republish and edit |
| Publish | straight to `active` | Under review and Rejected are enum values only |
| My listings | four tabs | three tabs; a place for a banned Listing; a count for the Cabinet row |
| Mark sold | yes | the "buyer from AutoTM?" answer (`MarkSold.ts` takes no such field); the 14-day auto-archive in PRD 32 has no job |
| Relist, Archive, Delete, Edit | yes | the phone check on relist |

### Where source and documents disagree

- PRD 32 and the draft payload schema say seven steps (`currentStep` max 7); the wizard has eight.
- PRD 32 lets the seller continue while photos upload; the Photos step blocks Continue until one photo is uploaded.
- Flow 61 lists a "Share to WhatsApp" button after publishing; PR #499 removed Share.
- Flow 61 puts "Discard draft" in a header overflow menu; the app has a Cancel button that discards.
- #344 says selling needs a verified account phone; ADR-0056 replaced that.

## 3. Reference screens

Viewed locally from the read-only archive. No image was copied into the repository.

### Auto.ru selling, AR-50-002 to AR-50-056

| Screens | What they show | Use for AutoTM |
|---|---|---|
| 002 to 004 | Sell tab "Объявления": illustration, one green button, a promo-code link; a sheet offers a car from the Garage or a category | One clear button. Promo codes, Garage and categories are out of scope |
| 005 to 007 | Prelude: licence plate, "not registered in Russia", stock status, then VIN with "Skip" | Nothing asked before the car. VIN stays optional |
| 008 to 017 | "Step N of 17", one question per screen, back and ✕, auto-advance: brand (search, logos), model, year list, body with pictures, engine, gearbox, modification, colour swatches. A toast says "1 parameter filled in for you" | Car first; pickers that chain; a year list. Seventeen screens is too many for AutoTM's field set |
| 018 to 023 | Photos, step 11: empty state with four angle placeholders, system gallery, grid of thumbnails with × and a spinner while uploading, an Add tile, "best angles" or manual order, a hint about trim recognition | Photos mid-flow; an Add tile in the grid; upload shown on the tile. No automatic ordering |
| 024 to 026 | Trim (skippable), then history: mileage as a large number, title type, owners, a "damaged or not running" switch | A large numeric input; Damaged as one plain question |
| 027 to 030 | Description with a rules link, a "generate description" button, "only on Auto.ru" and right-hand-drive switches | A description hint and a rules link. No generated text |
| 031 to 035 | Phone, step 15: several numbers with checkboxes, call hours per number, "disable chats", "chat only", then contacts: name, email, city ("cannot be changed after publishing"), viewing place | The phone as its own late step with rows to pick from. Call hours and several numbers are out of scope |
| 036 to 040 | Price last, large input, a fair-price badge and estimate, "exchange possible" with an explanation sheet | Large price input and the exchange switch. No estimate |
| 041 to 042 | VIN at the very end | VIN is not a first step |
| 043 to 045 | A paid "listing type" screen, "Publish for free", then "Done!" with three check marks and "Complete the listing" | Publishing is one free action. The success screen is option B of D8 |
| 046 to 052 | Edit: one long page of collapsible sections with "filled 22 of 28", Save in the header and at the bottom, a damage diagram | A section list for editing. No completeness score, no diagram |
| 053 to 056 | Paid promotion, then the Sell tab as the seller's own list: views, calls, saves, "60 days until removal", Edit and Remove from sale | Edit and Remove from sale as the two owner actions. No promotion, no expiry |

Not in the captures: drafts, an archive, status tabs, a blocked Listing, phone verification by code.

### Kolesa selling and removal, KZ-50-001 to KZ-50-039, KZ-51-001 to KZ-51-005

| Screens | What they show | Use for AutoTM |
|---|---|---|
| 001 to 002 | "Подать" tab opens a category list with a rules link | The rules link at publish |
| 003 to 008 | Brand (search, popular, all), model, year list, then one "modification" screen with chips for engine, drive, gearbox, steering. Progress bar, "Save and close" top right | Popular brands first; ✕ that keeps the draft; several short choices on one screen |
| 009 to 013 | Condition: mileage, customs cleared (required), damaged switch, "to order"; then price | Mileage and Damaged together |
| 014 to 016 | Photos after price: "I'll add later", a gallery-or-camera sheet, "Main photo" label, drag to reorder | The add sheet; a cover label. AutoTM still needs one photo |
| 017 to 031 | Description: groups of option chips with counters, colour list, a text field with 0/2100 | A character counter. Option chips are out of scope |
| 032 to 033 | City: search, popular cities, regions; contacts: the account phone with a switch, "add a phone number" | One city list grouped by region; the account phone preselected |
| 034 to 036 | Paid promotion, a document step, "Thank you, the listing is under review" | None; AutoTM publishes at once |
| 037 to 039 | Cabinet: "My listings" with "On site" and "With moderator"; the listing card with Edit and Remove from sale | Two actions on the card is option B of D9 |
| KZ-51 | Remove from sale asks a reason (sold here, sold elsewhere, changed my mind, other), then moves the Listing to "In archive" | Sold folded into the archive (already decided); the reason sheet is option B of D10 |

## 4. Keep, change, drop

| Today | Verdict | In the prototype | Why |
|---|---|---|---|
| Step 1 is VIN alone | drop as a step | VIN is an optional field at the bottom of Car | Nothing decodes it; both references ask for the car first; the helper text promised auto-fill |
| Brand, Model, Generation, Year | change | First step. Pickers chain; Year is a list | Auto.ru and Kolesa both do this; fewer taps and no typing |
| Condition, Mileage, Damaged, Known issues, optional specs | keep | Same fields and rules; optional specs under "More details" | ADR-0052 is recent and tested |
| Photos: 1 to 20, compression, cover, reorder, retry, remove | keep, moved | Third step; every queue state has a tile, and errors also list under the grid with Retry or Remove | Both references ask for photos mid-flow |
| Continue on Photos needs an uploaded photo | change | Continue needs one photo picked; Publish waits for uploads | PRD 32 says the seller can continue while photos upload |
| Price, currency, Exchange, Installment | keep | Currency is three inline buttons | Three options do not need a sheet |
| Location as its own step with Region and City | change | One City picker grouped by region, on the Description step | The city decides the region |
| Description | keep | Next to the place | |
| Contact phone as free text | change | ADR-0056: quick picks, another number by code, 7-day reuse | Accepted decision, not built yet |
| Calls and chat switches | keep | On the Contact step | |
| Review with checklist and preview | keep | A card preview, one list of sections with Change, blockers above Publish | |
| Header Cancel that discards | change | ✕ saves and closes; Delete draft lives in My listings | The draft is already saved; Kolesa and Auto.ru both keep it |
| Autosave with Retry | keep | "Saved", "Saving...", "Not saved. Retry" under the progress bar | |
| Sell entry: latest draft, New listing, My listings | keep | Adds "All drafts" and a draft limit | |
| My listings: four tabs | change | Active · Drafts · Archive | Founder decision in #353 |
| Banned Listing in no tab | change | In Active with a "Blocked" label, no actions | Founder decision in #353 |
| Edit at Review with locked identity | keep | Same shape | |
| Toast and Listing detail after publish | keep | "Share to WhatsApp" from flow 61 is not shown | PR #499 |
| Video | drop for the release | Designed behind D6 option B | ADR-0027; nothing is built on mobile or in the worker |

Recommended steps: **Car → Details and condition → Photos → Price → Description and place → Contact → Check and publish** (seven).

## 5. How the prototype behaves

- **Sell tab.** Signed out: one "Sign in" button. No drafts: "List a car" and a "My listings" row. With drafts: the latest draft with Continue, New listing, "All drafts" when there are several, "My listings". At five drafts New listing explains the limit and opens Drafts.
- **Wizard.** The tab bar is hidden. Header: back, "New listing", "Step N of 7", ✕. Continue is always enabled; tapping it with gaps shows the errors under the fields. An upload chip in the header follows the seller to later steps and opens Photos.
- **Leaving.** ✕ saves and closes with "Saved to Drafts". An untouched new Listing leaves no draft. If the last save failed, a dialog offers Retry, Leave anyway, Keep editing. Resuming opens the step the seller left.
- **Photos.** Add opens a Camera or Gallery sheet. Tiles show Compressing, In queue, Uploading with a bar, Waiting for network, Retry, Failed, Lost. Tapping a tile offers Set as cover, Move earlier, Move later, Remove, and Retry when it can help. At 20 the Add tile is disabled. A photo still over 5 MB after compression fails with Remove only. With D6 option B, a video over 60 s is refused before a tile appears, and one over 10 MB after compression fails with Remove only.
- **Contact phone.** The sign-in phone is preselected and needs no code. Extra numbers confirmed in the last 7 days are rows with the days left. "Another number" opens a number screen and a code screen with a line saying what the code allows. Wrong code counts down the attempts; five wrong locks the code; expired asks for a new one; resend waits; the daily limit says so and shows the one Help link. Typing a number that is already confirmed skips the code. A draft whose number has passed its 7 days asks to confirm it again. An email-only User sees a short explanation and must confirm a number.
- **Check and publish.** A card preview, the sections with Change, and a rules line. Publish lists what blocks it: missing steps by name, photos still uploading, failed photos. Failures keep the wizard open: server error, offline, missing exchange rate for a USD or AED price, contact phone rejected.
- **My listings.** Tabs with counts; loading skeleton, error with Retry, an empty state per tab. A row opens the Listing in owner view; a draft row resumes. ⋯ opens the actions: Active has Edit, Mark as sold, Remove from sale, Delete; a removed Listing has Relist, Edit, Delete; a sold Listing has Delete; a draft has Continue and Delete draft; a blocked Listing has none. Each action confirms. Relisting a Listing whose number is past its 7 days asks for a code first.
- **Edit.** A section list with Change; Car is locked; a changed step returns with Done; Save changes is enabled after a change; leaving with changes asks first; a failed save keeps the screen.
- **Entry points.** Cabinet's "My listings" row and the Sell tab's row open the same My listings screen, each on its own tab's stack.

## 6. Decisions for the founder

| # | Question | Options | ★ |
|---|---|---|---|
| D1 | Sell tab when drafts exist | A: latest draft first, Continue is the main button. B: New listing first, drafts as rows | A |
| D2 | Step order and grouping | A: Car, Details, Photos, Price, Description and place, Contact, Check. B: the same with Photos second. C: today's 8 steps | A |
| D3 | Field pickers | A: bottom sheets that chain Brand, Model, Year, Generation. B: full-screen lists as Auto.ru | A |
| D4 | Leaving mid-way | A: ✕ saves and closes. B: a sheet every time (Save draft, Delete draft, Keep editing) | A |
| D5 | Draft limit | A: up to 5 drafts. B: no limit, as today | A |
| D6 | Video in the release | A: photos only. B: photos and one video up to 60 s | A |
| D7 | Contact phone when calls are off | A: always required. B: only when calls are on | A |
| D8 | After publishing | A: open the Listing in owner view with a toast. B: a success screen first | A |
| D9 | Actions on a My listings row | A: ⋯ opens a bottom sheet. B: two buttons on the row, the rest under ⋯ | A |
| D10 | Taking a Listing off the market | A: two actions, Mark as sold and Remove from sale. B: one "Remove from sale" with a reason sheet | A |
| D11 | Location fields | A: one City picker grouped by region. B: Region, then City | A |

Reasons, in the same order:

1. A returning seller almost always wants the Listing already started. This is today's behaviour and PRD 32.
2. Both references start with the car and ask for photos in the middle. Photos third still leaves three steps for uploads to finish. Choose B if slow networks matter more than a gentle start.
3. Sheets are what the app has and what the founder chose for Cabinet. Chaining gives Auto.ru's speed without its screen count.
4. The draft is already on the server, so ✕ should not threaten to delete it.
5. Drafts hold uploaded photos. With no cap and a draft created on every tap, abandoned drafts pile up. Five is a guess; the number is the founder's.
6. The picker, the compressor, the transcoder and the player do not exist. Option B shows the states for when they do. The issue asks that the 60 s limit be respected; it does not say video ships in this release, so this needs a clear answer.
7. One rule for everyone, and it is ADR-0056 as written. Option B would let an email-only User sell with no phone and needs an ADR amendment.
8. The Listing in owner view is the confirmation and already offers the next actions. It is today's behaviour and the #344 map.
9. Plain rows, as the founder asked for Cabinet.
10. Both actions exist in the API and in the Cabinet stub, and "Mark as sold" is the result most sellers want. Option B is tidier with Sold inside Archive but needs an API field and a wording change in the Cabinet stub.
11. One tap fewer; the region follows from the city.

## 7. Changes to other prototypes

None were made. The Cabinet prototype at `8402d60` already matches on everything that connects the two files: the "My listings" row and its total (Listings plus drafts), the three tabs, Sold inside Archive, the Blocked label in Active with no actions, the action names, and no "List a car" on Cabinet. Its My listings and Sell screens are marked as stubs that point to #354.

Small differences that follow from undecided options here, to settle after the founder decides rather than now:

| Cabinet stub at `8402d60` | This prototype | Depends on |
|---|---|---|
| Sell tab: "List a car" first, "Continue draft" as a row | Latest draft and Continue first | D1 |
| Removed Listing: Relist, Delete | Relist, Edit, Delete (the API allows editing an archived Listing) | none; a stub omission |
| Draft action in English: "Discard" | "Delete draft" (RU is already "Удалить черновик") | none; wording |
| "The Sell wizard is designed in #354" toast and stub notes | replaced by this prototype | none |

## 8. Conflicts with approved decisions

- None in the recommended options.
- D7 option B conflicts with ADR-0056 and is marked so.
- D10 option B changes an action line in the Cabinet stub the founder has seen.
- The issue text says "selling needs a verified phone (founder, 2026-09-21)". ADR-0056 of 2026-09-22 superseded that with the per-Listing rule; the prototype follows the ADR, as #353 did.

## 9. Open facts

- **Draft cap.** No API rule exists. The number and whether the oldest draft should expire are open.
- **Listing count.** The Cabinet row's total needs a count endpoint, or the row ships without a number.
- **Resume step.** The draft payload stores `currentStep` up to 7. A new step order needs a new mapping for drafts saved by the old wizard.
- **Photos Continue rule.** Letting the seller continue with a picked but not yet uploaded photo changes `StepPhotosSchema`.
- **Contact phone API.** ADR-0056 names the rules but no endpoint, error code or SMS text exists. The prototype assumes one "send code" and one "confirm code" call, and a publish error that sends the seller back to Contact.
- **Daily limit copy.** The SMS budget is shared with sign-in (ADR-0054). Whether the screen should say when the seller can try again is open.
- **Exchange-rate error.** `EXCHANGE_RATE_MISSING` exists on publish; PRD 32 wants an inline helper on Price. The prototype shows it at publish only.
- **Sold reason.** PRD 32 asks whether the buyer came from AutoTM; nothing stores the answer.
- **Auto-archive of sold Listings.** PRD 32 says 14 days; no job exists. With Sold inside Archive the rule may no longer be needed.
- **Blocked Listing.** The prototype shows one neutral line. Whether the owner should see a reason or a way to appeal is not decided; no Help link was added.
- **Drag to reorder.** The app supports drag; the prototype only has Move earlier and Move later.
- **Wording.** New RU and TK strings need a native check, in particular "Tapgyr", "Habarlaşmak", "Petiklenen".

## 10. Verification

Headless Chrome over loopback HTTP, driven through CDP. Scripts and results are in `/tmp/autotm-354-sell-20261002/`; screenshots are in `/tmp/autotm-prototypes/sell-wizard-shots/`. Counts are in the hand-off report for this commit.

Not verified: repository unit, typecheck and lint gates (the prototype touches no application code); any native Android behaviour; real uploads, SMS delivery or timing; RU and TK wording.
