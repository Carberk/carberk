# 33 — Search & discovery

## Summary

How buyers find Listings. The release ships the discovery journey approved for the Google Play review build ([ADR-0051](../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md)). Home shows new Listings and an obvious brand/model entry. Buyers pick a brand and models, or search for them, and land on a separate Results screen that they can sort and refine. Favorites saves Listings. Saved searches, broad filter coverage and free-text search over Listing descriptions are not part of the release.

## Why it exists

Maral (the first-time buyer persona) needs to slice through thousands of Listings to find "Toyota Camry, 2018-2020, under 200k TMT, in Aşgabat." Without good search, she'd give up and go back to Telegram channels.

## Reference and bounds

- **Auto.ru is the structural reference for this journey** (ADR-0051). It shapes Home, the pickers, Search, Results, Sort and Search parameters. It is not a visual template or a feature list.
- **AutoTM keeps its own design tokens and its five tabs** (Search, Favorites, Sell, Messages, Cabinet), plus anonymous browsing and the [00-vision anti-goals](../00-vision.md#anti-goals-things-we-explicitly-will-not-build) (no paid placement).
- **Kolesa is no longer the reference for Home, search, filters or Results.** [ADR-0034](../../adr/0034-kolesa-ux-findability-reference.md) is superseded for these surfaces.
- **Approved specs:** the [release screen map resolution](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344#issuecomment-5759595278) and the [listing content resolution](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/351#issuecomment-5761811759). Their clickable prototypes live on the read-only branches `prototype/release-screen-map` and `prototype/listing-content`.
- **Reference captures** (`AR-…`, `KZ-…` IDs below) are indexed in [the reference screens index](../ui/research/reference-screens-2026-09-21.md).

## What it does (user-visible behavior)

### Navigation

- The Search tab's first screen is called **Home** in specs.
- First launch goes Launch → Language choice → Welcome → Home. There is no sign-in wall.
- Tapping the active tab again returns it to its first screen. Each tab keeps its own history.

### Home

- 🔍 in the header opens **Search**.
- A **"Brand, model"** card shows the live Listing count and opens the **Brand picker**.
- A **New listings** feed, newest first, uses the Home grid card (see [32 — Listings](32-listings.md#cards)). "See all" opens Results with no filters.
- The feed is the chronological feed. There is no "Recommended for you" ranking (ADR-0051).
- Home has **no filters and no safety banner**.
- No first-open GPS permission prompt. Home is useful before sign-in and before any location permission.

References: AR-01-001, AR-01-002.

### Brand picker

- Picks **exactly one brand**.
- A search field that matches any spelling, then Recent, then Popular with Listing counts, then A to Z.
- **Every row shows the brand logo**, with a letter fallback when no logo is uploaded.
- Tapping a brand opens the Model picker.

References: AR-08-002, AR-08-003.

### Model picker

- Any number of models, or none. None means every model of the brand.
- Has a search field.
- Opened from Home or Results: **"Show N listings"** opens Results; **"More filters"** opens Search parameters; **"Change brand"** returns to the Brand picker.
- Opened from inside Search parameters: it ends with **"Done"**, which returns to the form.

References: AR-08-004, AR-08-005.

### Search (🔍)

- Finds **brands and models together**. A brand result opens Results for the whole brand; a model result opens Results for that model.
- Russian, English and Turkmen spellings match, with transliteration and one forgiven typo.
- **Years are understood:** "camry 2018", "лексус 2014-2019" and "2018" set the year range too.
- Before typing, it shows Recent and Popular brands.
- Search covers the brand/model catalog only. Searching Listing titles and descriptions is not part of the release.

### Recent

- The last 10 brand/model choices, brand-only ones included.
- Stored **on the device only**, shown in the Brand picker and in Search, and clearable.
- It is not a saved search: no sync and no alerts.

### Results

After Auto.ru AR-05-001 and AR-05-003.

- **Header:** "N listings", the price range of the matches, the current order, and ⇅ **Sort**.
- **Condition switch:** All / New / Used.
- **One brand/model card** in Auto.ru's style ("Toyota Camry, +2", "Change models", ✕ to clear), with no model chips. Tapping it opens the Model picker with the current models ticked.
- **Filters row:** ⚙ Filters with a count badge, plus removable chips for city, price and year. The row floats at the bottom while scrolling.
- **Cards:** the Results large card (see [32 — Listings](32-listings.md#cards)).
- **Behavior:**
  - Applying anything updates Results in place.
  - With no brand and no model, Results is the full feed of all Listings.
  - Returning from a Listing keeps the Results and their scroll position.
  - With no match, the filter chips stay visible so the buyer can loosen them.

### Sort

A sheet on Results with six orders, the current one marked:

- **Newest first** (default)
- Cheapest first
- Most expensive first
- Newest year first
- Oldest year first
- Lowest mileage first

The current order is always shown in the Results header. There is no hidden ranking.

### Search parameters

- A **full-screen form**, replacing the old filter bottom sheet.
- Holds condition, city, brand, model, year and price.
- A sticky **"Show N listings"** button applies the form and opens Results. Back discards unapplied edits.
- City uses the Region → City picker.
- Reached from the Results Filters chip, the Model picker's "More filters", and "All filters" in Search.

References: AR-02-002, AR-02-003.

### Sign-in on action

- Browsing, Search, Results, Listing detail and Call need no sign-in.
- ♡ Favorite, Message, Ask the seller and Report listing need a signed-in User.
- Sign-in returns to the same screen, keeps Results behind it, and then finishes the waiting action.
- Cancelling sign-in drops the waiting action.

### Location discovery

Per [ADR-0022](../../adr/0022-city-first-listing-location.md), AutoTM uses a city-first location model:

- Search filters by `regionId` and `cityId`.
- AutoTM does not request GPS on app open.
- A later "Use my location" control may map foreground GPS to the nearest catalog City, then apply that City as a temporary filter. It is not part of the release.
- The app may remember the last selected city locally for convenience, but does not write a permanent "home city" to the User's profile.
- Future catalog `City.latitude` / `City.longitude` centroids can support nearest-city lookup. They are catalog metadata, not user tracking data.

Location filters are explicit. Nearby Listings are never silently ranked above newer ones.

### Search and location analytics

Search analytics are allowed for product planning and admin dashboard reporting, but they stay city-level:

- Track selected `regionId` / `cityId`, filter families used, sort order, result-count bucket, zero-result searches, favorite, call/Conversation start, and Listing city for conversion analysis.
- Use these aggregates to decide where to seed catalog data, recruit dealers, moderate suspicious Listing clusters, and prioritize future city expansion.
- Do not store raw GPS coordinates, exact device location, exact map pins, or home-city profile fields for analytics.

### Favorites

- Tap ♡ on a Listing to save it; tap the filled ♥ to remove it.
- The Favorites tab lists saved Listings only. Its card and the Hide sold switch are specified in [32 — Listings](32-listings.md#cards).
- Tapping the filled ♥ on a Favorites card removes the card at once and shows a toast with **Undo**. The removal itself is delayed until the toast ends, so Undo cancels it and the card returns to its place; Undo never re-adds the Listing.
- Approved states ([#352](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/352), prototype `prototype/favorites-conversations`):
  - **Signed out:** "Sign in to see your Favorites" with a Sign in button and a line telling the User to tap ♡ on a Listing to save it.
  - **Loading:** skeleton cards with the same shape as the large card.
  - **Empty:** "No favorites yet", a line on saving Listings to find them later, and a **Browse listings** button that opens Home.
  - **Error:** "Could not load", a line on checking the connection, and a **Retry** button.
  - **"No active listings":** when Hide sold hides every saved Listing, the screen says "No active listings", says that sold Listings are hidden and that turning off Hide sold shows them, and offers **Browse listings**.
  - **List:** the Hide sold switch at the top with the hidden count, then the large cards.
- There is no "Need help?" link and no support entry on Favorites; support is Cabinet → Help ([34 — Conversations](34-conversations.md#support)).

### Rejected for the release

These were considered in the screen-map review and turned down:

- **Home:** a safety banner or prepayment warnings, filters, and a personalized feed.
- **Search and filters:** several brands at once, brand exclusion, generations, radius search, relevance or "best deal" sorting, and saved searches with alerts.
- **Cards and detail:** comparisons, and credit, valuation or history-report badges.
- **Marketing:** stories, category tiles, ads and promoted cards.

### Later candidates

Each needs its own decision and evidence from the release:

- More filters: mileage, engine type, gearbox, drive, body type, seller type, "only with photo", and "posted within".
- An "Exclude damaged" filter, which [ADR-0052](../../adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md) left undecided.
- Free-text search over Listing titles and descriptions.
- Saved searches ([Feature 35](35-subscriptions.md)).
- Other vehicle categories ([ADR-0035](../../adr/0035-multi-vertical-platform-direction.md)).

## Screens / states

| Screen | States to prove |
|---|---|
| Home | Loading, offline, empty catalog, populated |
| Brand picker | Loading, error, no match, logo missing (letter fallback) |
| Model picker | Loading, error, no match |
| Search | Empty with Recent, empty without Recent, typing, no match, loading, offline |
| Results | Loading, offline, no match with chips still shown, all Listings (no brand), brand only, several models, each sort order, scrolled with floating chips, end of list, a Listing round trip that keeps the scroll position |
| Sort sheet | Each order selected |
| Search parameters | Default, filled, count loading, count error, invalid range |
| City picker | Loading, error |
| Sign-in on action | Completed (action finished), cancelled (action dropped) |

## Data references

- `apps/api/src/modules/listings/CONTEXT.md` — feed, filters and sort live here
- `apps/api/src/modules/catalog/CONTEXT.md` — brands, models, cities and brand logos
- `apps/mobile/src/listings/CONTEXT.md` — today's mobile discovery screens

## Decisions

- [ADR-0051](../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md) — Auto.ru is the structural reference for mobile discovery; supersedes ADR-0034 for Home, search, filters and Results
- [ADR-0034](../../adr/0034-kolesa-ux-findability-reference.md) — Kolesa findability reference, superseded for these surfaces
- [ADR-0035](../../adr/0035-multi-vertical-platform-direction.md) — cars-first, multi-vertical later; its browse-route clauses are superseded by ADR-0051
- [ADR-0052](../../adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md) — condition disclosure; "Exclude damaged" filter not decided
- [ADR-0022](../../adr/0022-city-first-listing-location.md) — city-first location search; explicit GPS only later
- [ADR-0023](../../adr/0023-first-party-product-analytics.md) — first-party analytics only; search analytics stay in AutoTM-owned storage
- [ADR-0027](../../adr/0027-mlp-beta-scope.md) — MLP beta scope; saved searches deferred
- [Sprint 8](../sprints/sprint-08-private-beta-polish.md) — Favorites pulled into S8a and shipped as saved Listings

## Phase

**Phase 1, Google Play review build.** Home, the pickers, Search, Recent, Results, Sort, Search parameters, sign-in on action and Favorites ship. Everything under "Later candidates" is a post-release bet.

## Out of scope

- Map-based search — Phase 2
- Distance/radius search — revisit only after nearest-city filtering proves insufficient
- First-open GPS prompt — rejected; location permission must be user-initiated
- Comparison (side-by-side) — Phase 3
- Voice search — Phase ∞
- Personalized ranking or recommendations — needs its own capability decision (ADR-0051)

## Open questions

- None open for the release journey. Brand logo sourcing is settled in [#350](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/350): brands without a cleared logo file get the letter fallback.
