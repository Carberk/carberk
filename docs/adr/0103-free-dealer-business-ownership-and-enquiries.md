# ADR-0103: Free dealer workspaces own inventory and enquiries

- **Status**: Accepted
- Date: 2026-10-14
- Decider: Carberk founder
- Relationships: Complements ADR-0013 and its one-business membership invariant; scoped post-MLP capability admission under ADR-0027; extends ADR-0056 contact-proof authority to a business principal without weakening personal proof. Preserves ADR-0098 delivery and immutable historical decisions.

## Context

Current Listing/draft/contact ownership and Conversations are User-based. Dealership tables and a membership lookup are scaffolding, not a business workspace. Staff departure must not delete inventory or retain access to business enquiries. Free dealer access and business identity must not become paid placement or a claim about vehicle condition.

## Decision

Approved identifiable car-selling businesses receive free tools inside the existing Carberk app. Founder manually approves business admission and records the checked identity evidence. Brokers are excluded initially. One account belongs to at most one business. Each business has one protected owner; owner loss/removal/deletion uses audited founder recovery before ownership can become vacant. Staff authenticate personally; owner and sales membership are separate from Marketplace Role.

Sole-owner protection prevents ordinary membership actions from orphaning a business; it does not deny the User's account-deletion rights under ADR-0032. Deletion revokes the departing person's access and puts an ownerless business into a protected suspended recovery state until the founder appoints a verified replacement. Preserve business assets without retaining personal information beyond its permitted purpose or automatically granting another staff member ownership.

The business owns its drafts, Listings, media adoption and listing-scoped enquiries. Creating/changing Users remain attributable. Owners control membership, settings, public contact verification and enquiry reassignment. Current members may read business enquiries. Sales members create/edit/publish/mark sold business inventory and atomically claim Unassigned enquiries. Removing membership revokes HTTP, realtime, notification and private-media access and requeues assignments; it preserves business assets and reply history. Owner may reassign/reopen/close business enquiries. Closing follow-up does not fabricate a sale. Existing personal inboxes and inventory remain separate.

Owner-controlled business contact proof is bound to the business and the authorized actor, uses existing purpose-bound verification and seven-day reuse for new uses, and never creates a Sign-in Method. Membership alone is not phone proof. Changing the number requires fresh authority/proof; departing staff do not invalidate valid business-owned proof. Current personal contact rules remain.

Joining never moves personal Listings. Personal-to-business transfer is deferred. Membership/draft context must be explicit before drafting and on Review; use the existing seven-step wizard and five tabs. Business suspension hides its public showroom/inventory, blocks new business publication/contact, and retains authorized history. Suspending/removing one member does not archive business stock. Restoration must not republish independently moderated content.

Public Listing and showroom links support anonymous mobile web reading and real native HTTPS associations. Sold links stay Sold with no new enquiry; moderated/removed content stays hidden. Share sheet and Copy link activate after these prerequisites. Use the configured canonical public web origin, supported locale routing, stable identifiers/redirects and no new purchased domain by assumption.

Mixed discovery uses truthful business identity and a seller-type filter. Weekly availability review does not reset publishedAt or ranking. No automatic stale hiding, paid tier, boost, bulk import, multi-location, shared login or separate dealer app. A checked business is not a checked vehicle.

All dealer management and related staff/admin surfaces support TK/RU/EN, including failure states and generated user-facing exports. Raw provider/source artifacts retain their original language.

## Consequences

Business-principal authorization must replace creator-only assumptions in affected write/read/media paths through injected owning-context ports. Account deletion, contact proof, drafts, Conversations, sockets and push need regression and access-revocation proof. Additive migrations preserve existing personal behavior and old-client contracts. One business per account reduces initial migration/permission complexity; broader cardinality and transfers require another deliberate policy change.

## Alternatives

Shared business login loses attribution and safe revocation. Creator-owned Listings behind a workspace switch fail staff departure. Separate app or paid dealer tiers add unrequested delivery and entitlement work. Automatic personal transfers break privacy and association continuity.

## Acceptance and activation

Prove current-member/removed-member permissions, atomic claiming, sole-owner protection/recovery, ownership under creator deletion, contact-proof delegation and publication through the existing wizard. Verify public link lifecycle and no private report metadata leakage. Native/deployed evidence follows consolidated campaign acceptance. Admission of actual businesses uses real checked evidence and named operator readiness; synthetic tests do not establish a verified business.

## References

- docs/prd/features/38-showroom.md; docs/prd/flows/67-dealer-workspace-and-sharing.md
- docs/prd/features/30-identity.md; 32-listings.md; 34-conversations.md
- Founder final campaign decision record, 2026-10-14
