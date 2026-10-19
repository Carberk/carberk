# ADR-0099: Free dealer workspaces own business inventory and enquiries

- **Status**: Proposed preview; root ADR file not created
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Relationship**: Complements ADR-0013 and ADR-0027. Does not alter the MLP release or paid-placement prohibition.

## Context

Dealership/member schema scaffolding does not establish a functioning dealer experience. Current Listings, drafts, contact proofs and Conversations are User-based. Previous target documents disagree about onboarding and assume dealer subscriptions, generic PRO badges and future storefronts. The founder chooses free business tools in the same Carberk app and asks for listing and showroom sharing together.

## Decision

Carberk provides a free dealer workspace in the existing app, with business-owned inventory and enquiries, authorized through personal User membership.

Owners control membership/business details; sales staff manage business cars and claim enquiries. Enter through Cabinet, preserving the five tabs and the same listing wizard for personal and business publishing. Show the selected business on draft/review. Membership does not change Marketplace Role or transfer personal inventory. Staff departure must not delete business cars or reply history.

Dealer cars appear in mixed results with truthful business identity and an explicit seller-type filter. The business name opens its public showroom. An identity check does not certify car condition or improve ranking. External sharing covers both Listings and showrooms, with browser reading without installation/sign-in and accurate sold/unavailable states.

The feature remains readiness-gated post-MLP work. This decision does not schedule a sprint or approve live onboarding. Detailed membership cardinality, invitations, owner recovery, contact-proof delegation, removal handover, suspension and transfer policies remain in the PRD's open-decision list. Resolve them before the affected implementation; do not encode prototype defaults as approved behavior.

## Consequences

### Positive

- Personal sign-in and the existing wizard remain recognizable to staff.
- Business inventory and enquiries survive staff changes.
- Free access avoids subscription/entitlement infrastructure and preserves fair search.

### Negative / accepted costs

- Business ownership requires real migrations and authorization changes across Identity, Listings and Conversations.
- Shared inbox participation, notifications and realtime access need server enforcement, not a visual switcher.
- Free access leaves hosting/onboarding/support cost to the business and needs explicit abuse/capacity policy.

### Neutral

- Diagnostic service pricing is a separate physical-service decision.
- Current personal Listings and Conversations retain their existing behavior.
- Existing admin privileges do not become dealership permissions.

## Alternatives considered

- Separate dealer app: duplicates client delivery and obscures personal/business identity switching.
- Shared dealership login: loses personal attribution and safe staff removal.
- Paid dealer subscription/tier: conflicts with the founder's current free-access decision.
- Dealer dashboard with a separate publishing wizard: creates validation and recovery drift.

## References

- docs/prd/features/38-showroom.md
- docs/prd/flows/67-dealer-workspace-and-sharing.md
- docs/prd/features/30-identity.md
- docs/prd/features/32-listings.md
- docs/prd/features/34-conversations.md
- docs/adr/0013-user-role-split.md
- docs/adr/0027-mlp-beta-scope.md
- docs/adr/0056-listing-contact-phones-are-verified.md
- docs/prd/00-vision.md
