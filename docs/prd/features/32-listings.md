# 32 — Listings

## Summary

The core economic object: car ads. Sellers create listings via a 7-step wizard, with photos, brand/model/generation specs, price, and location. Buyers browse anonymously, inspect listing detail, and contact the seller. Video media is deferred out of the MLP beta and should not appear in the Sprint 4 mobile create wizard.

## Why it exists

A marketplace without listings is empty. This is the central feature; everything else (chat, search, notifications) revolves around it.

## What it does (user-visible behavior)

### Create wizard (7 steps for MVP)

1. **VIN entry** — optional manual text only in Sprint 4; no OCR, decoder, checking, or auto-fill promise in the mobile wizard. Skip button is prominent. VIN decoding is deferred until a real decoder exists ([ADR-0053](../../adr/0053-defer-vin-decoding-until-a-real-decoder-exists.md)).
2. **Photo capture** — pick from library OR camera; min 1, max 20; freeform photo set with lightweight guidance only; client-side compress + reorder UI; first photo = cover and gets a Cover badge; drag-reorder changes cover; failed uploads expose Retry + Remove
3. **Brand → Model → Generation → Year** — input-like rows open searchable picker sheets; Brand first, Model disabled until Brand, Generation optional/skippable when no catalog data exists, Year required
4. **Condition** (`used` default / `new`) + **Mileage** (visible and required for used cars; optional/hidden for new cars) + optional completeness fields: **Color**, **Body type**, **Transmission**, **Drive type**, **Engine type**, **Engine power**. These completeness fields do not block publish in Sprint 4. The seller condition disclosure also lives in this step ([ADR-0052](../../adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md)): **Damaged / needs repair** (yes/no, required to publish and kept on edit) and optional **Known issues** free text (up to 1000 characters).
5. **Price + Currency** (TMT default / USD / AED) + **Seller terms**. Switching currency clears the amount instead of auto-converting; non-TMT shows approximate TMT using admin FX; missing non-TMT FX blocks publish with an inline helper. Optional terms: Exchange possible and Installment possible. No separate negotiable toggle in Sprint 4. Price is always the full asking price, never a down payment.
6. **Car location** — Region + City + optional area/landmark text ("Aşgabat, 30 mkr"). This is the physical location where the car can be inspected, not the seller's current GPS location.
7. **Description + Verified Contact Phone + Contact preferences** — description is required but has no minimum word count beyond non-empty, max 2000 chars. Store seller text exactly as written; no auto-translation or language selector in Sprint 4. The contact phone defaults to the seller's verified account phone when one exists; a different `+993` number, or any number for an email-only User, must be confirmed with a purpose-bound SMS code before Continue / Publish. Calls/chat switches have at-least-one validation; chat can be enabled now with honest helper text that messaging launches later. No separate Preview route in Sprint 4; show a compact Review summary above Publish.

Navigation is linear Next/Back in Sprint 4. The compact Review summary can link back to completed steps for corrections; do not build arbitrary step-jump navigation. Drafts auto-save to the server while editing and force-save on step transition. Do not promise offline draft persistence in Sprint 4. Resume on next visit. If drafts exist, Sell opens a lightweight entry with latest draft as the primary Continue action and New listing as secondary; full draft management belongs in My Listings. Discard draft lives in the wizard header overflow menu and requires destructive confirmation.

### Listing location policy

Per [ADR-0022](../../adr/0022-city-first-listing-location.md), listing location means **car location**:

- The listing stores the city/region where the car is physically available for inspection.
- A user posting for a dealer, family member, or remote seller chooses the car's city, not their own current location.
- Phase 1 does not store exact listing GPS coordinates.
- `locationText` is optional area/landmark text, not a home-address field. UX copy should discourage exact private addresses ("Do not enter your home address. Add only the area where the car can be inspected.").
- Dealer showroom location may become more precise later because it is a business location. Inspection or meeting coordinates are private appointment data, not public listing data.

### Listing contact phone policy

Per [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md), every Listing contact phone is verified before it can be used:

- The wizard pre-fills the seller's verified account phone when present. Keeping it needs no new code, and it remains available as a quick pick if the seller selects another number.
- A seller may use a different `+993` number without changing their Sign-in Methods. The wizard sends a 6-digit contact-phone code to that number, and the seller cannot continue until it is confirmed.
- A confirmed extra number becomes that seller's **Verified Contact Phone** for 7 days from confirmation. During that window it appears as a quick pick with days left and can be reused on new Listings without another code. After the window, the next new use needs a fresh code.
- A Verified Contact Phone never becomes a Sign-in Method. Several sellers may verify the same number, and a seller may verify a number that is another User's sign-in phone, because the holder of that SIM shared the purpose-specific code.
- The server rejects publishing or republishing unless the submitted contact phone is either the seller's verified account phone or one of that seller's currently reusable Verified Contact Phones. An edit that changes the contact phone applies the same check; an unrelated edit may keep the Listing's existing contact phone after its reuse window expires.
- A published Listing keeps its contact phone after the 7-day reuse window ends. The window limits new uses, not existing published contact paths.
- Contact-phone codes are purpose-bound and cannot sign anyone in. Sign-in codes cannot verify a Listing contact phone.
- The SMS copy must explain that the code lets someone show the number on a car Listing and should be shared only if the recipient agreed.

### Media upload + refresh behavior

- Selected photos are compressed into an app-owned local staging area before upload.
- Upload starts as early as possible and runs in the background relative to the wizard UI. The user can continue later steps while media uploads.
- Background upload is best-effort only. If the app is backgrounded, killed, or the network drops, uploads may pause/fail; on reopen/reconnect the app retries from the staged compressed file as a whole-file retry.
- Publish is blocked until at least one photo is attached successfully and there are no required pending or failed uploads.
- The server records each presigned upload for the User who requested it. Only that User can publish or attach it, and each upload backs one photo; a known or copied storage key authorizes nothing ([ADR-0077](../../adr/0077-server-recorded-upload-provenance-for-listing-media.md)). Retrying the same attach returns the existing photo.
- Phase 1 does not promise byte-level resumable/multipart uploads, full offline listing creation, or guaranteed OS-level background upload.
- Listing/feed screens use last-seen data while reconnecting, then refresh on app foreground/reconnect. This is not an offline browsing mode promise.
- Remote listing images are displayed through a native image cache (`expo-image` in mobile) using immutable media URLs. TanStack Query caches listing JSON, not image/video bytes.
- Listing video playback is deferred with the video media UX. We do not promise offline video playback or persistent video caching.

### Cards

Approved in the [listing content resolution](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/351#issuecomment-5761811759). Auto.ru's structure, AutoTM's tokens ([ADR-0051](../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md)).

- **Home "New listings": a two-column grid** (AR-01-002).
  - Rounded photo with ♡ on it, then the price, "Brand Model" on one line, and "year, km" ("year, New" for new cars).
  - No city, gearbox, fuel or badges.
  - About six Listings fit on the first screen. The Home card does not become the large card.
- **Results: the large card** (AR-05-001).
  - Photos follow the Listing. None gives one "No photos" frame, one gives a single wide photo, and two or more give a two-photo grid (62% and 38%). A 📷 photo count sits on the photos only when there are more than one.
  - Then the price, the "km · gearbox · fuel" line, "Brand Model, year", and "city · date". ♡ sits bottom-right.
- **Favorites: the large card with contact buttons** (AR-36-001, AR-36-002).
  - The large card plus **Call** and **Message** buttons and a filled ♥. Tapping ♥ removes the card at once, with Undo.
  - A **Hide sold** switch, on by default, hides sold and removed-from-sale Listings and says how many are hidden. Turned off, they show dimmed and labelled, without contact buttons.
  - Deleted and banned Listings never appear. No recommendations block.
- **Rules for every card:**
  - Price in TMT only.
  - Title on one line with an ellipsis, and no generation.
  - Missing fields drop out of the spec line, with no placeholders.
  - Date as "Today", "Yesterday", "12 Sep", or "3 Mar 2025" for earlier years.
  - City only, no area text.
  - No "Phone verified" and no seller-terms badges. The only badges are Sold and Removed from sale, and only in Favorites. Home and Results never contain sold or archived Listings.
  - Loading skeletons have the same shape as the card.

### Listing detail

Top to bottom, in Auto.ru's order:

1. **Photos**, full width, with an "n / N" counter.
2. **"Brand Model Generation, year".** Derived; there is no manual title field.
3. **Price**, plus Exchange possible / Installment possible when set. These terms are informational: AutoTM does not finance, broker, match exchange vehicles, or verify payment terms.
4. **"date · city".**
5. **Specifications:** six key specs as a grid (year, mileage, gearbox, fuel, power, drive), then rows for condition (new/used), body, colour and VIN. The VIN row shows only when the seller entered one.
6. **Seller's description**, clamped to 3 lines with "More".
7. **Ask the seller** quick questions. They reuse the four QuickReplies intents and open the Conversation with the text ready to send.
8. **Condition, as stated by the seller:** Damaged / needs repair, and Known issues when given ([ADR-0052](../../adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md)). The heading keeps anyone from reading them as verified.
9. **Seller card:** the seller's display name (fallback "Private seller"), "Private seller", "On AutoTM since" with the join month, and city · area. There is no "Phone verified" badge; how buyers learn that contact phones are verified is set by [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md).
10. **Report listing.**
11. **Footer:** ID · Published · Updated.

That is the whole screen. Video is added below the photos only when the video media UX ships.

- **Contact bar:** Call (opens the phone dialer directly, with no warning sheet) and Message stick to the bottom of the screen. The Call area carries one short caption that AutoTM verifies seller numbers by SMS; the fuller explanation lives on the public trust page, not as a per-Listing badge or extra detail link.
- **Collapsing header:** once the photos scroll away, it turns solid and shows the price plus "Brand Model, year". Back, ♡ and ⋯ (which holds Report listing) stay put on active Listings. ⋯ is hidden whenever it would be empty: on sold and removed Listings, and on active Listings when report entry is disabled. A buyer then sees only Back on sold and removed Listings; the freed width goes to the title. There is no Share or Copy link action: both stay hidden until a public web Listing page and App Links exist ([#495](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/495), decided in [#322](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/322)).
- **Photo viewer:** black, full screen, with "n / N", ✕, ♡, swipe, pinch zoom, a thumbnail strip, and Call + Message. Closing it returns the gallery to the same photo.
- **Sign-in on action:** ♡, Message, Ask the seller and Report listing need sign-in, then return to this Listing and finish the action. Call needs nothing. See [33 — Search & discovery](33-search-discovery.md#sign-in-on-action).
- **VIN decoding:** a decoded-VIN section appears only when the VIN is actually decoded. With no real decoder bound, it never appears; there is no "not provided" or "not decoded" state ([ADR-0053](../../adr/0053-defer-vin-decoding-until-a-real-decoder-exists.md)).

**Detail states**

- **Owner viewing their own Listing:** no Call or Message bar.
  - A status card with views and saves. Only owners see these counts; buyers never see view counts.
  - The original currency under the price.
  - Edit and Mark sold in the bottom bar; Archive and Delete in ⋯ (Republish for archived Listings). Share is hidden, as above.
- **Sold / Removed from sale (`sold`, `archived`):** closed for new contact.
  - A banner on the photo and a greyed price.
  - ♡, the contact bar, Ask the seller and Report listing are hidden.
  - A "See other Brand Model" link opens Results filtered by that brand and model. It is a plain filter, not a recommendation.
  - An **existing** Conversation about the Listing stays open for Messages: the Conversation shows a Sold (or Removed from sale) badge and a banner linking to other cars of the same model, and the composer stays on ([34 — Conversations](34-conversations.md#closed-and-sold-listings)).
- **Deleted / banned for a buyer (404):** "This listing is no longer available", with Go to Home and Back.
- **Loading:** the photo, title, price, spec line, city and date come straight from the tapped card's cache. The rest loads behind skeletons, and the contact bar is disabled until it does. Deep links use a plain skeleton.

**Removed from detail** by the approved design:

- The "VIN history" section in its empty states (the VIN stays as a specification row).
- The Sprint 9a "Request AutoTM inspection" fake door, together with the sheet that opened after publishing ([ADR-0057](../../adr/0057-defer-the-in-app-inspection-demand-signal.md)).
- The "How to buy safely" link to auto.tm/trust.
- View counts for buyers.
- A similar-listings block. "See other Brand Model" on a closed Listing is the only link to other Listings.

### Edit listing

- Same wizard, pre-filled
- Published edits PATCH the `Listing` directly. They do not create or autosave a `ListingDraft`; drafts are only for pre-publish listing creation.
- Edit changes stay local inside the edit screen until the seller taps **Save changes**. Buyers keep seeing the old published listing while the seller is editing, including the old photo set.
- Locked identity fields: VIN, brand, model, generation, and year cannot be changed; they define the identity of the car.
- Saving a changed contact phone follows the same verification rule as publishing: it must be the seller's verified account phone or a currently reusable Verified Contact Phone.
- Owners can update photo order, add photos, and remove photos after publishing. The first photo remains the cover. Photo edits are staged locally in edit mode and applied only on **Save changes**. New photo uploads may start during editing for responsiveness, but uploaded files are not public until attached on Save; abandoned unattached uploads are storage orphans for cleanup. This is locked by [ADR-0024](../../adr/0024-owner-post-publish-photo-editing.md).
- Change price (price-change history kept for analytics)

### Mark sold

- Button in My Listings: "Mark as sold"
- Confirm modal: "This car is sold. Is the buyer from AutoTM?" (yes / no — analytics signal)
- Listing transitions to `sold` state and is auto-archived after 14 days. Buyers see it labelled Sold on detail and in Favorites, then Removed from sale once archived; it never appears in Home or Results.
- Garage entry (if linked) auto-updates to `status=sold`

### Listing states

| State | Visible to | Action available |
|---|---|---|
| `draft` | Owner only | Continue / discard |
| `active` | Public | Favorite, Message, owner-edit |
| `sold` | Detail and Favorites only, labelled Sold; never in Home or Results | Closed for new contact: no Call, Message, Ask the seller, ♡ or Report, and no new Conversation. An existing Conversation stays open for Messages, with a Sold badge and a banner linking to other cars of the same model |
| `archived` | Owner + admin; a buyer reaching it from Favorites or a link sees it closed, labelled Removed from sale; never in Home or Results | Closed for new contact, as `sold`; an existing Conversation behaves as for `sold` (badge, banner, composer on); owner can republish |
| `banned` | Owner sees a generic ban notice; not in feed/search/favorites or non-owner detail | New contact and Messages disabled; existing Conversations stay readable, with a one-line notice in place of the composer; owner edit/mark-sold/archive/republish/delete blocked until admin unban |
| deleted (soft-deleted) | Not shown on any buyer surface; a buyer reaching it gets "This listing is no longer available" | No contact; existing Conversations stay readable, with a one-line notice in place of the composer |

Chat switched off on a Listing (`allowChat` off) also leaves an existing Conversation readable with a one-line notice in place of the composer. Conversation-side rules are in [34 — Conversations](34-conversations.md#closed-and-sold-listings).

## Screens / states

| Screen | State | Notes |
|---|---|---|
| Wizard step 1 (VIN) | Empty | Optional, skip button prominent |
| Wizard step 2 (photos) | <1 photo | Submit disabled; helper text |
| Wizard step 3 (vehicle identity) | Missing year | Continue disabled; year is required for marketplace-quality listings |
| Wizard step 4 (specs) | Used car missing mileage | Continue disabled; mileage is required for used-car listings |
| Wizard step 7 (contact) | Different phone or email-only seller | Send contact-phone code, block Continue / Publish until confirmed, then offer the number as a quick pick for 7 days |
| Wizard | Upload failed | Retry button per failed photo |
| Wizard | Network slow | Show progress + "Slow connection" badge |
| Listing detail | Loading | Card fields from the tapped card's cache; the rest behind skeletons; contact bar disabled until loaded |
| Listing detail | Signed out | Call works; ♡, Message, Ask the seller and Report listing lead to sign-in, then finish the action here |
| Listing detail | Owner viewing own | No contact bar; status card with views and saves; Edit / Mark sold in the bar; Archive / Delete in ⋯ |
| Listing detail | Sold / Removed from sale | Banner on the photo, greyed price; contact, ♡, Ask and Report hidden; "See other Brand Model" link |
| Listing detail | Deleted, or banned for a buyer | "This listing is no longer available", with Go to Home and Back |
| Listing detail | Banned, owner | Generic ban notice; admin reasons stay internal |
| Listing detail | Opened from a report (admin view) | All actions + moderation toolbar |
| Conversation | Listing sold / Removed from sale | Badge on the Listing card and an inline banner linking to other cars of the same model; composer on ([34](34-conversations.md#closed-and-sold-listings)) |
| Conversation | Listing banned or deleted, or chat switched off | One-line notice in place of the composer; history readable |
| My listings | Empty | "List your first car" CTA |
| My listings | Has drafts | "Continue draft" pinned at top |

## Data references

- `apps/api/src/modules/listings/CONTEXT.md`
- `apps/api/src/modules/catalog/CONTEXT.md` (referenced by ID)
- Entities: `Listing`, `ListingMedia`, `Favorite`, `ListingDraft`

## Decisions

- [ADR-0001](../../adr/0001-architecture.md) — Listings as bounded context
- [ADR-0008](../../adr/0008-media.md) — Photo + video pipeline
- [ADR-0007](../../adr/0007-i18n.md) — Single-locale content
- [ADR-0022](../../adr/0022-city-first-listing-location.md) — City-first listing location; no exact listing GPS in Phase 1
- [ADR-0024](../../adr/0024-owner-post-publish-photo-editing.md) — Owners may edit photos after publishing
- [ADR-0027](../../adr/0027-mlp-beta-scope.md) — MLP beta scope; video and adjacent platform features deferred
- [ADR-0037](../../adr/0037-trust-inspection-competitive-wedge.md) — Trust and inspection as the competitive wedge, amended by ADR-0052, ADR-0053 and ADR-0057
- [ADR-0051](../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md) — Auto.ru is the structural reference for cards and discovery; AutoTM keeps its own tokens
- [ADR-0052](../../adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md) — Condition disclosure is "Damaged / needs repair" plus Known issues
- [ADR-0053](../../adr/0053-defer-vin-decoding-until-a-real-decoder-exists.md) — VIN decoding deferred; the section shows only when decoded
- [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md) — Listing contact phones are verified; no per-Listing "Phone verified" badge; no account-phone requirement for email-only sellers
- [ADR-0057](../../adr/0057-defer-the-in-app-inspection-demand-signal.md) — No in-app inspection demand signal for the release; the concierge pilot measures demand

## Phase

**Phase 1 MLP beta.** Photos, listing create/edit/detail, and mark-sold ship now. Video, advanced trust signals, and adjacent platform features are post-MLP bets.

## Out of scope

- Listing auto-renewal / bumping (Phase 1.5 if needed)
- Featured / promoted listings (paid placement) — explicitly against vision
- Listing expiry (never automatic in MVP; sellers mark sold/archived themselves)
- Exact listing GPS coordinates, first-open GPS prompt, and map/radius search in Phase 1
- Map view in feed (Phase 2+ only if city-first search proves insufficient)
- Compare 2 listings side-by-side (Phase 3)

## Open questions

- Auto-archive policy for `active` listings older than X months — yes or no?
- Should the seller be able to hide their phone number until the buyer messages? (Auto.ru does this — "защищён" badge)
- Photo watermarking — Phase 2 once we have AutoTM-staffed media

### Trust + moderation signals (surfaced during pre-S4 grill 2026-05-18)

These are future product capabilities — most map to Phase 2 trust-layer work alongside inspection reports. Captured here so the foundation laid in S4 (audit log, port abstractions, `pending_review` enum value) supports them cleanly when their sprints arrive.

- **Flipper / re-seller detection** — Auto.ru exposes "active listings count" + "listings history" + "average time-to-sell" on the seller profile page so buyers can self-detect flippers. AutoTM equivalent should ship after seller profile/admin trust work is bet on. No explicit "flipper" label — let data speak.
- **"First owner" claim** — Seller self-declares «первый хозяин» equivalent in the wizard; admin verifies post-hoc via registration documents or trust signals. Buyer-side filter is post-MLP if added. Implementation: `Listing.isFirstOwner: Boolean @default(false)` + admin verification flag.
- **Phone-number-reuse detection** — "5 other listings from this phone number" surfaced on listing detail (Auto.ru pattern). Phase 2 candidate; keys on the Listing's Verified Contact Phone, not on `Listing.contactPhone ?? seller.phoneE164`. Strong flipper signal.
- **Edit-triggered re-review** — Auto.ru flags edits that change >50% of photos, drop price >30% in 24h, or rewrite >50% of description. AutoTM equivalent should land in Phase 2 alongside trust tiers. S4's AuditLog scope captures price changes + state transitions; Phase 2 needs to add audit entries for media operations + description edits to enable detection.
- **Inspected-listing edit policy** — When trust tier exists (Phase 2 inspection reports), structural edits (specs, condition, photos) should invalidate the tier until re-inspection; metadata edits (price, description) should not. Decide policy when S11-S15 plan.
- **Inappropriate / non-car photo screening** — MLP beta auto-publishes everything; reactive moderation ships in S7. A later trust bet should add self-hosted ML screening: NudeNet for NSFW, YOLO or CLIP for car-detection, pHash for stolen-photo detection (all offline-compatible per air-gap constraint). Implementation: `MediaContentClassifierPort` ships in S4 with `NullContentClassifier` adapter; trust bet swaps in `MlContentClassifier`. Failed classifications transition listing to `pending_review` status (enum value already in schema).
- **Stolen photo detection** — Auto.ru fingerprints photos via perceptual hashing (pHash) to catch reuse across listings. Self-hostable. Phase 2 candidate; companion to NSFW classifier.
- **Reporting flow** — "Report this listing" button on listing detail page + authenticated `POST /listings/:id/report` endpoint + admin queue. Ships in S7 alongside `banned` status activation. The route stays resource-shaped for client ergonomics, but report creation is implemented in `admin/` as a generic `ContentReport`; `listings/` only validates the listing target through a port. Listing reports are accepted only for currently `active` listings. Draft, archived, banned, soft-deleted, and other non-public listings return `NOT_FOUND`; visible but non-reportable states such as `sold` return `VALIDATION_FAILED` / `REPORT_TARGET_NOT_REPORTABLE`. Sellers cannot report their own listings; the API rejects own-listing reports with `VALIDATION_FAILED` / `SELF_REPORT_NOT_ALLOWED`, and owner-facing UI should hide the report action where ownership is known. If an event is needed, `admin/` emits `ContentReportCreated`, not a listing-owned `ListingReported` event. Report submission does not change `Listing.status` or public visibility; pending reports do not block owner archive/delete flows while the listing remains owner-actionable; only explicit admin ban hides a listing. S7 bans only active listings and unbans them back to active; there is no `previousStatus` restoration model. Banned listings are omitted from public feed/search/favorites and non-owner detail, while owner surfaces show only a generic banned notice. Owner routes cannot edit, change media, mark sold, archive, republish, or delete a banned listing until admin unban. Unban does not clean up favorites, emit saved-search events, or resolve/dismiss pending reports. Banning blocks new contact/new messages for that listing but does not auto-close existing conversations. Listing owners see no report metadata, and admin free-text reasons stay internal. The status mutation remains owned by `listings/` behind `ListingsAdminPort`; `admin/` does not write listing rows directly. Successful ban/unban may emit internal `ListingBanned` / `ListingUnbanned` events after commit, but S7 ships no user-facing consumers, notifications, conversation system messages, or worker jobs from those events.
