# 63 — External Listing sharing entry

> Revised target flow, 2026-10-14. External sharing of both an individual Listing and a public showroom is part of the founder's proposed dealer scope. [Flow 67 — Dealer workspace and external sharing](67-dealer-workspace-and-sharing.md#journey-4-share-a-car-or-the-whole-showroom) owns the complete link round trip, metadata and lifecycle matrix. This stable filename is retained for existing references.

## Entry and dependencies

A viewer opens a Listing, chooses the system share sheet or Copy link and sends its canonical HTTPS URL. The recipient reads public vehicle content in Carberk when installed/associated, or in a mobile-friendly browser without installation or sign-in. Public showroom links follow the same contract.

Share and Copy link currently remain hidden until the public Listing page and App Links exist, as decided in [#322](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/322) and tracked in [#495](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/495). Scope reopening does not establish those capabilities. Verify the actual browser page, native association, current availability and preview metadata before enabling controls.

Canonical host, locale routing, stable IDs/slug redirects and deferred-install behavior remain open. Do not treat an old example URL as the approved hostname. A sold Listing stays clearly sold with no new enquiry; removed/moderated content stays hidden. Third-party previews may be cached, so the live page is authoritative. Never put a private diagnostic report or its existence into public share metadata.

## Separate internal sharing

A Listing card or attachment sent inside an existing Carberk Conversation belongs to [34 — Conversations](../features/34-conversations.md). It is distinct from external system sharing and is not implied implemented by this flow's historical filename.

## References

- [38 — Dealer workspace and showroom](../features/38-showroom.md)
- [32 — Listings](../features/32-listings.md)
- [67 — Full dealer and external sharing journeys](67-dealer-workspace-and-sharing.md)
- [50 — Inspection report audience](../features/50-reports-tier.md)
