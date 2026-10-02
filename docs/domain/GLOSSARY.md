# AutoTM Domain Glossary

This document is the canonical English engineering vocabulary for AutoTM. It defines what domain terms mean; it does not describe implementation status, future capability, user-facing translations, or delivery scope.

Charter decisions and accepted ADRs take precedence over this glossary. When a vocabulary decision changes materially, update the glossary through the ADR process defined by [ADR-0042](../adr/0042-domain-glossary-authority-and-mutability.md).

## Cross-context

**Marketplace Role**

The platform-wide identity assigned to a User: buyer, seller, moderator, or admin. It is independent of any Dealership Member role.

_Avoid_: Account type, dealership role

## Identity

**User**

A person who signs in to AutoTM with a Sign-in Code sent to one of their Sign-in Methods, and who holds one Marketplace Role. Dealership permissions are not encoded in this identity.

_Avoid_: Account, customer

**Sign-in Method**

A phone number or email address that belongs to exactly one User and that the User proved they control by confirming a Sign-in Code sent to it. A User has at most one of each kind, and a live User has at least one.

_Avoid_: Login, credential, contact method

**Sign-in Code**

A short-lived numeric code sent to a phone or email to prove control of it, used to sign in, to add or change a Sign-in Method, or to request account deletion.

_Avoid_: Password, OTP, magic link

**Dealership Member**

The membership connecting a User to a Dealership and assigning an owner or sales role within that dealership. It is distinct from the User's Marketplace Role.

_Avoid_: Dealer user, dealer account

## Listings

**Listing**

A seller's offer of a vehicle to people browsing the marketplace.

_Avoid_: Advert, post

**Verified Contact Phone**

A `+993` phone number a seller proved can receive listing-contact SMS codes, so AutoTM may show it on that seller's Listing. It never signs the seller in, may belong to another person, and can be reused only while the Listings spec allows.

_Avoid_: Account phone, login phone, phone verified badge, credential

**Media Upload**

The server's record that one User presigned one photo or video upload, which can back one Listing media item. A storage key without the caller's Media Upload authorizes nothing.

_Avoid_: Pending file, staged key

## Conversations

**Conversation**

A discussion between a buyer and seller about a Listing.

_Avoid_: Chat room, inbox thread

**Message**

A single communication within a Conversation, authored by a participant or by AutoTM.

_Avoid_: Chat

## Admin

**Content Report**

A request for AutoTM moderators to review a reportable marketplace target for a stated concern.

_Avoid_: Complaint, support ticket
