# Listings

Listings owns listing lifecycle, drafts, media associations, favorites, discovery reads, and listing-contact verification. Its source and tests define allowed state transitions and edit restrictions. Product scope comes from the owning Listings and Search specifications.

A Verified Contact Phone is independent of a User's Sign-in Methods. Preserve verification and publish gates instead of inferring contact eligibility from the identity phone. Owner mutations and public reads have different visibility and suspension rules. Banned listings cannot be restored through ordinary owner transitions.

Listing detail exposes the auto-numbered public ID and the seller's display name and join date through `SellerProfilePort`, backed by identity's exported `SELLER_PROFILE_READ_PORT`. Summaries carry no seller data. Under ADR-0056 no response carries a per-Listing phone-trust signal; every displayed contact number is already verified.

The seller condition disclosure is `{ damaged, knownIssuesText? }` ([ADR-0052](../../../../../docs/adr/0052-seller-condition-disclosure-is-damaged-plus-known-issues.md)). Publish rejects a draft without a `damaged` answer as `INVALID_DRAFT_PAYLOAD` with a `conditionDisclosure` field error, and edit rejects any change to a Listing that has no answer unless the patch supplies one (`DAMAGED_REQUIRED`); a disclosure patch without `damaged` already fails the edit request schema (`VALIDATION_ERROR`). A Listing with no answer (only possible for rows from before the migration) returns no `conditionDisclosure`. A supplied disclosure replaces its optional Known issues text; omitting that text clears it, while omitting the entire disclosure preserves it.

Media upload staging and server attachment are distinct steps. Preserve ownership checks, image limits, ordering, and variant behavior.

Listing media is authorized by server-recorded upload provenance ([ADR-0079](../../../../../docs/adr/0079-server-recorded-upload-provenance-for-listing-media.md)). Presign records a Media Upload for the calling User. Publish and attach adopt only that User's unadopted upload whose stored object still matches it (`UploadAdoptionGuard`); a known or forged key authorizes nothing, and object keys are public in Listing detail. `listing_media.uploadId` is unique, so an upload backs one media row. Removal deletes the row and its upload together and cleans storage only for the caller that released an adopted upload nobody else references. Rows from before the record (backfilled, or duplicates left with no upload) never trigger storage deletes. Retrying an attach on the same Listing returns the existing media row. Unattached uploads and their objects are not swept yet. Database columns alone do not guarantee consistency among every optional catalog ID; inspect the actual validators before claiming a relationship is enforced.

Ranking/filtering belongs to the existing read adapters. Other contexts use exported read/admin ports. When changing publication, contact, or deletion, inspect conversation and moderation consumers as well as mobile create/edit flows.

Feed price sort and price-range counts read the stored `Listing.priceTmt` ([ADR-0061](../../../../../docs/adr/0061-stored-tmt-listing-price-for-feed-sort-and-range.md)). Publish, edit, and republish write it in the same statement as the Listing; after any `exchange_rates` change an operator must run the recompute (`packages/db` `listing-prices:recompute`). Display prices and the `priceMin`/`priceMax` filter convert at request time, so a stale `priceTmt` mis-orders and mis-counts but never shows a wrong price. The public feed pages in six orders (`newest` default, `price_asc`, `price_desc`, `year_desc`, `year_asc`, `mileage_asc`) with per-order keyset cursors, alongside `GET /api/v1/listings/count` (match count with the TMT price range of the matches) and `GET /api/v1/listings/filter-options/brands` (active-Listing counts per brand).

## Start here

- [Module composition](listings.module.ts)
- [Lifecycle and invariants](domain/Listing.ts)
- [Publish gate and tests](application/PublishListing.ts)
- [Read boundary](domain/ports/ListingsReadPort.ts)
- [Persistence and ranking tests](infrastructure)
- [HTTP integration tests](presentation)
- [Mobile flow](../../../../mobile/src/listings/CONTEXT.md)
- [Product requirements](../../../../../docs/prd/features/32-listings.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
