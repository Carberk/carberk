# 38 — Free dealer workspace and public showroom

> Approved campaign target, 2026-10-14. Founder approved product direction and final policy defaults. [ADR-0103](../../adr/0103-free-dealer-business-ownership-and-enquiries.md) formalizes the material decision. This specifies delivery, not current implementation or live-business activation.

## Outcome and boundaries

Identifiable car-selling businesses manually approved by founder use free tools inside Carberk. Brokers, paid tiers, ranking boosts, multi-location, bulk import and automatic lead routing are excluded initially. Personal staff logins, one business per account and one protected owner retain ADR-0013. Business verification records checked evidence and never certifies vehicle condition.

Keep Search, Favorites, Sell, Messages and Cabinet. Cabinet opens the business workspace. Existing Sell offers Personal/Showroom for eligible members before drafting; Inventory fixes the business context. Same seven-step wizard, validation, contact proof, minimum photos, media recovery and review. Display owning business before drafting and on Review; switching workspace never silently moves drafts/media.

## Admission, membership and contact

Founder approves admission with auditable business identity evidence and truthful description of what was checked. Owner invites staff to redeem through personal sign-in. Tokens are single-use, recipient-bound, expiring/revocable and cannot grant access to the wrong account, duplicate membership or a second business. Delivery transport and expiry are bounded engineering choices; synthetic invitation checks never send to real recipients.

Protect the last/only owner against removal or account deletion until an audited founder recovery establishes a replacement. Recovery cannot expose personal sign-in secrets. Platform admission/recovery is a scoped platform privilege, separate from business Owner/Sales and general analytics investigation.

This protection must not block account deletion under ADR-0032. If deletion leaves no active owner, revoke the person's access, preserve business assets and suspend business operation for audited founder recovery. Do not automatically promote another member or preserve unnecessary personal data.

Owner controls business details and contact proof. Confirmed business contact belongs to the business, with authorized-actor attribution and existing purpose-bound SMS security. Seven-day reuse governs new uses; changing number requires new proof. Sales can publish with current business proof but cannot alter it. Personal proof/sign-in rules retain their existing behavior. Membership alone cannot verify a number.

## Ownership and inventory

Business owns drafts, Listings, adopted media and enquiries; creator/editor remains attributable. Owner/Sales create/edit/publish/mark sold business cars. Current members read business enquiries. Owner alone changes settings/membership/reassignment. Personal inventory and conversations remain separate; joining does not transfer them. Personal-to-business transfer is deferred.

Draft, Active, Sold and Archived UI states preserve moderation/lifecycle rules. Weekly availability review records confirmation without changing publishedAt or ranking. No automatic stale hiding. Staff removal/revocation requeues assigned enquiries, preserves stock/history and denies further API, realtime, push and private-file access, including stale sessions. Account deletion of a creator must not archive/delete/restore business-owned stock. Business suspension hides public showroom/inventory and blocks new publication/contact; individual member suspension does not erase business assets. Restoration cannot revive independently moderated content.

## Shared enquiries

Business enquiries remain Listing-scoped. Showroom Message guides buyers to a car; no generic listing-less conversation is introduced. New enquiries enter Unassigned; atomic claim has one winner. All current members may read responsibility and response history. Owner reassigns/reopens/closes; assignment and Open/Closed are separate. Staff attribution survives departure. Existing conversation continuation after sold follows current contact lifecycle, without enabling new enquiry from a sold shared page. Personal and service/support conversations retain their own authorization policy.

## Public discovery, showroom and sharing

Mixed results reuse current card design with truthful dealer identity and seller-type filter; business name opens showroom. No dealer/inspection ranking advantage. Compact name/logo/checked identity/city/contact/address appear before active inventory, then description/hours/services. Empty inventory is explicit; sold stock is not available inventory. Initial workspace counts cover active cars, drafts, review due and unanswered enquiries; do not invent response-time, transaction or completed-call statistics.

External sharing includes BOTH Listing and showroom, system share sheet and Copy link, anonymous mobile web reader, optional opening in app and genuine HTTPS associations. Use configured canonical public web origin, safe stable target/locales/slug redirects. Sign-in only for actions that need it. Sold stays sold and blocks new enquiry; removed/moderated/suspended hides suppressed content. First-party cache metadata must follow current state; external cached previews cannot be guaranteed fresh. Private inspection existence/content never enters public tags/counts/cards.

Available public diagnostic reports use the neutral localized action "Inspection report available" on Results cards AND detail, opening complete findings/date/mileage. No checkmark/pass/quality guarantee or boost. No buyer-private indicator. Withdrawn/unavailable report association removes the action. Feature 50 owns eligibility.

## Design and languages

Preserve current mobile tokens, navigation and wizard. All dealer/staff/admin screens support TK/RU/EN including navigation, validation, loading/empty/error/denied states and generated user-facing exports. Keep original source/provider documents in their supplied language. Phone-sized browser prototypes establish review intent, not native security/runtime evidence.

## Executable acceptance

- D1: wrong-account/expired/revoked/duplicate invitation cannot activate membership; one-business and last-owner invariants survive concurrency and deletion/recovery.
- D2: personal/business draft context stays explicit; current membership and valid business contact proof authorize publish; revoked context preserves saved work without allowing publication.
- D3: business stock/media/history survive creator deletion/removal; personal paths retain existing behavior.
- D4: current members read; concurrent claim has one winner; owner reassigns; removal requeues and revokes HTTP/socket/push/file access.
- D5: suspension/public lifecycle, search seller filter, detail identity, inventory counts and cache metadata agree; independently moderated content stays hidden on restore.
- D6: Listing/showroom links handle installed/uninstalled, signed-in/out, sold/unknown/removed/suspended and safe locale/redirect failure.
- D7: actual rendered TK/RU/EN interfaces preserve accessibility/theme/text scale; final native/browser acceptance covers only changed critical paths.

## Owners and references

ADR-0103; Identity 30, Listings 32, Conversations 34, diagnostic reports 50, flow 67. Cross-context access uses injected ports, not internal application imports. Additive migrations and current source/tests govern compatibility. Live admission needs checked business facts and named operator; passing synthetic fixtures does not establish verification.
