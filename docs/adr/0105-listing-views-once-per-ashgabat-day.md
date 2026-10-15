# ADR-0105: Listing views count each viewer once per Ashgabat day, using an anonymous install id

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: AutoTM founder; three grilling rounds and the complete ADR draft, index row, Accepted status and four additional clauses approved on 2026-10-14 ([issue #874](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/874))
- **Supersedes**: one cell of [ADR-0021](0021-feed-ranking-port.md)'s future-signals table, "`viewCount` (S4 adds; S8 increments via worker)", for who increments `viewCount` only. The rest of ADR-0021 stays in force.

## Context

ADR-0021 added `Listing.viewCount` for a future ranking signal and planned a worker to increment it. Nothing in the current application increments it, though Listing detail returns it, and the owner status card renders saves only, with a source comment that views are not counted yet. The founder wants Listing detail to show views as Auto.ru does: the lifetime total and today's figure (#874).

Several things shape how a view can be counted:
- `GET /listings/:id` is not a view. Results-card Call, the Conversation call phone, the edit screen, the relist sheet and query refetches all read detail.
- The detail endpoint is public. The public JWT guard may populate authenticated identity, but current signed-out detail requests carry no stable anonymous identifier for dedupe.
- #872 and PR #875 are merged and provide Asia/Ashgabat Listing dates. This decision uses the same UTC+5 calendar day.
- `PrismaListingRepository.update()` writes back stale `viewCount`/`favoriteCount`, and Prisma `@updatedAt` moves on any update, which changes "Updated" and reorders My listings.
- ADR-0023's first-party analytics pipeline (raw events, worker rollups) is not built. Play Data safety currently declares no app-interaction data because `viewCount` has no User attached.

## Decision

**A Listing view is an explicit app signal, counted once per viewer per Listing per Asia/Ashgabat calendar day. A signed-out viewer is identified by a random anonymous app install id, and only a short-lived salted fingerprint of it is stored.**

- **Signal.** The app sends a dedicated "viewed" signal (`POST /listings/:id/views`) after about 2 s on the full Listing detail screen, once per screen visit. The card-seeded preview and every `GET /listings/:id` never count.
- **Viewer.** Use the random install id whenever the app supplies it, whether signed in or signed out. Use the account id only when no install id is supplied; without either identifier, the signal is not countable. Owner/admin exclusion still uses authenticated identity. This keeps signing in during one Ashgabat day from counting the same installation twice. The app creates its install id at first launch. The install id is random, not linked to the phone or a person, and a reinstall resets it.
- **Not counted.** The owner, admins, traffic that is not the app's signal (existing rate limit), and Listings that are not `active`.
- **Storage.** Derive each day's salt from a server secret and the Asia/Ashgabat calendar day. Different days use different derived salts. Keep the secret in server configuration; never store or log the raw viewer key. Dedupe stores only a one-way salted fingerprint of (viewer key + Listing + Ashgabat day), deleted after 2 days by a worker job. Durable data is per-Listing per-day counts and the lifetime total. No raw view events and no advertising ids are kept.
- **Writes.** The API increments the counts with raw SQL that leaves `updatedAt` alone. Full-row Listing writes no longer write the counters.
- **Lifecycle.** Edit leaves the count untouched. Relist and account restore keep the lifetime total and keep counting. Sold and archived Listings stop counting and keep their total.
- **Display.** Figures are current when detail loads, not live; the viewer's own view is not added on screen. Buyers see the total and today's figure on active Listings only; the owner always sees them. A zero total shows nothing, and a zero today shows the total only.
- **Disclosure.** The privacy policy (en/ru/tk) gains the founder-approved "Listing views" sentence, and Play Data safety declares both App interactions and Device or other IDs as collected, not shared, for app functionality in the same change that ships the install id.

This is not ADR-0023 product analytics: it emits no analytics events and keeps ADR-0023's ban on advertising identifiers.

## Consequences

### Positive

- Buyers and owners see a meaningful number that prefetch, Call taps and refetches cannot inflate.
- The privacy footprint is small: no stored identifier outlives 2 days, and durable data is counts only.
- ADR-0021's `viewCount` finally carries real data for a later ranking decision.

### Negative / accepted costs

- The app now collects an identifier, so the privacy policy and Play Data safety change, and the "no app interactions" answer no longer holds.
- A reinstall, or a second device, counts the same person again that day.
- The per-IP rate limit is in memory per replica, so a determined script can still inflate counts somewhat.
- Two new tables and a cleanup job to run; repository writes must exclude the counters.

### Neutral

- Owner analytics, counts on My listings or Results cards, and ranking by views remain out of scope.
- #871 and PR #876 are merged, preserving original publishedAt on relist/account restore with the repair migration; view counts retain their lifecycle rule independently.

## Alternatives considered

- **Count on `GET /listings/:id`:** Call, edit, relist and refetches read detail too, so counts would be inflated.
- **Store the install id or raw view events:** more than dedupe needs, and a longer-lived identifier to disclose and protect.

## References

- [ADR-0021](0021-feed-ranking-port.md), [ADR-0023](0023-first-party-product-analytics.md)
- Issues #874, #871, #872
- [PRD 32 Listings](../prd/features/32-listings.md), [83 Legal](../prd/ops/83-legal.md), [88 Play Console submission](../prd/ops/88-play-console-submission.md)

## Integration and separation

Delivery follows accepted ADR-0098, not the superseded preparation-era separate issue PR topology. The linked retention-worker slice is a collection release prerequisite. Actual cleanup and disclosures must work before shipping the install identifier. API and hosting/error logs redact the raw identifier.

This counter remains app-only, Ashgabat-day, install-first and admin-excluded. Analytics keeps its UTC windows, separate account/guest visit identities and genuine-admin eligibility. No raw counter identifiers/fingerprints flow into longitudinal analytics. Public web/crawler GETs never count. Native timer starts only on focused foreground full-detail data, cancels on departure/background, and never blocks reading.
