# 62 — Buy flow (browse → contact → meet)

## Summary

Maral wants to buy her first car. In the MLP beta, the journey is deliberately small: browse, filter, inspect a listing, contact the seller, and meet offline.

S8a adds saved-listing Favorites to this loop. Saved-search notifications, dealer showrooms, public Garage trust signals, and post-purchase surveys remain post-MLP bets. The Conversation itself is specified in [34 — Conversations](../features/34-conversations.md).

## Goal

- Prove buyers can find real listings
- Prove sellers respond to buyer contact
- Keep the first loop simple enough to observe and fix quickly

## Step-by-step

### Step 1 — Discover

- Maral opens Home (anonymous OK) and browses New listings
- Picks a brand and models, or searches for them, and lands on Results
- Refines with explicit condition, city, price and year filters, and sorts
- Screens and states: [33 — Search & discovery](../features/33-search-discovery.md)
- No first-open GPS prompt
- No saved-search carousel

### Step 2 — Inspect

- She opens a listing detail page
- Checks photos, price, mileage, city, seller block, and description
- She cannot share the listing URL from the app yet: Share and Copy link are both hidden until a public web Listing page and App Links exist (#495, #322)
- She cannot compare side-by-side in the MLP beta

### Step 3 — Contact the seller

- She taps **Message**
- If anonymous, OTP auth opens and then resumes the same action
- A per-listing Conversation opens
- She sends: "Is it still available?"

### Step 4 — Seller replies

- Aman opens his Messages list
- He sees the listing-scoped thread
- He replies in text
- He gets a push notification, and sees read state, typing and presence as in [34 — Conversations](../features/34-conversations.md)

### Step 5 — Negotiate

- Back-and-forth text conversation
- If they need extra photos, they can send an image in the Conversation; voice calls happen outside the app
- The goal is to learn whether AutoTM creates enough buyer-seller contact, not to solve every negotiation workflow immediately

### Step 6 — Meet

- Off-platform — they meet at a public location
- Maral inspects the car, decides whether to buy
- Transaction stays off-platform; no in-app payment, escrow, or scheduling
- Aman marks the listing as sold if the deal completes. An existing Conversation stays open, with a Sold badge and a link to other cars of the same model

## Trust building moments

| Moment | MLP trust signal |
|---|---|
| Browsing | Clear photos, price, city, mileage, and description |
| Listing detail | Seller tenure and visible contact path |
| Contact | Conversation is scoped to the listing |
| Safety | Report listing/user is visible once minimal admin ships |

Post-MLP candidates include public Garage, response-time stats, richer moderation and seller history. Proposed dealer identity and factual diagnostic reports are specified below; the earlier inspection-tier proposal is being reconciled.

## Failure modes (and mitigations)

- **Maral can't find the right car** → Capture the repeated-search pain; shape saved searches only if this repeats.
- **Seller doesn't reply** → Capture response-delay data; push already notifies the seller of new Messages.
- **Seller is rude / scammer** → Report → admin moderation.
- **Listing was misrepresented** → Report → admin review; optional diagnostic reports are a separately gated service proposal.

## References

- [Feature 32 — Listings](../features/32-listings.md)
- [Feature 33 — Search](../features/33-search-discovery.md)
- [Feature 34 — Conversations](../features/34-conversations.md)
- [ADR-0027 — MLP beta scope](../../adr/0027-mlp-beta-scope.md)
- [ADR-0022 — City-first listing location](../../adr/0022-city-first-listing-location.md)

## Open questions

- Should the seller be able to hide their phone number until the buyer messages? (Post-MLP trust/UX decision)
- Which beta metric is the strongest contact-quality signal: message sent, seller reply, or meeting confirmed?


## Proposed dealer and diagnostic journey, 2026-10-14

Target revision, pending ADR formalization and approved UI. Current release behavior above is not evidence these features exist.

- Mixed results show private/dealer seller identity using existing cards. A dealer name opens its public showroom; seller-type filtering is explicit. See [38](../features/38-showroom.md).
- Listing and showroom links allow public browser reading without installation or sign-in, once their real pages and native associations work. Sold/unavailable states remain truthful. See [flow 67](67-dealer-workspace-and-sharing.md).
- A dated **public** diagnostic report is free for interested buyers to read. It describes observations at the recorded mileage/time, not a condition guarantee or accident-history certification. It does not boost ranking.
- A buyer can instead request a private inspection with vehicle-owner authorization. The car comes to a center, initially the own Aşgabat center. Report access is limited to the commissioning buyer and authorized staff. The seller or another buyer does not gain access through Listing ownership or payment by someone else.
- If buyer A receives a private report and declines the car, buyer B cannot unlock that document. B may request a new inspection. Declining the car alone does not undo the completed service; refunds, complaints and failed-service handling require an explicit policy before live bookings.
- Seller-authorized public Listing inspections use the same inspection workflow with a different audience. All findings are released together; seller/dealer cannot select favorable results. Private-to-public conversion is excluded from the proposed first launch.

[50 — Diagnostic reports](../features/50-reports-tier.md) and [flow 66](66-diagnostic-inspection.md) own consent, report state and service-readiness details. Buying the car remains an off-platform decision; diagnostic payment at the center is distinct from vehicle purchase, dealer access and any online payment system.
