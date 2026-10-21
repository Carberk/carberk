# AutoTM Domain Glossary

This document is the canonical English engineering vocabulary for AutoTM. It defines what domain terms mean; it does not describe implementation status, future capability, user-facing translations, or delivery scope.

Charter decisions and accepted ADRs take precedence over this glossary. When a vocabulary decision changes materially, update the glossary through the ADR process defined by [ADR-0042](../adr/0042-domain-glossary-authority-and-mutability.md).

## Cross-context

**Marketplace Role**

The platform-wide identity assigned to a User: buyer, seller, moderator, or admin. It is independent of any Dealership Member role.

_Avoid_: Account type, dealership role

## Identity

**Dealership**

An identifiable car-selling business whose inventory and enquiries belong to the business independently of the people who manage them.

_Avoid_: Shared dealer login, paid seller tier

**User**

A person who signs in to AutoTM with a Sign-in Code sent to one of their Sign-in Methods, and who holds one Marketplace Role. Dealership permissions are not encoded in this identity.

_Avoid_: Account, customer

**Sign-in Method**

A phone number or email address that belongs to exactly one User and that the User proved they control by confirming a Sign-in Code sent to it. A User has at most one of each kind, and a live User has at least one.

_Avoid_: Login, credential, contact method

**Sign-in Code**

A short-lived numeric code sent to a phone or email to prove control of it, used to sign in, to add or change a Sign-in Method, or to request account deletion.

_Avoid_: Password, OTP, magic link

**Display Name**

The name shown for a User: the name the User set, or their Generated Name while they have set none.

_Avoid_: Username, nickname, handle

**Generated Name**

The name a User has until they set one, a prefix in the reader's language and a number the server assigned to the User, such as Driver 4821. The number is not unique and never changes.

_Avoid_: Default name, random name

**Assigned Avatar**

One of the car pictures bundled in the app, chosen by the server for a User when the User is created and shown whenever the User has no Profile Photo.

_Avoid_: Default avatar, placeholder avatar

**Profile Photo**

The one public picture a User uploads to show in place of their Assigned Avatar. The User can replace or remove it and a moderator can remove it, after which the Assigned Avatar shows again.

_Avoid_: Avatar photo, user picture, custom avatar

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

**Business Enquiry**

A Listing-scoped discussion between a buyer and a Dealership, handled by its authorized members with shared business responsibility.

_Avoid_: Personal staff lead, showroom-wide chat

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

## Cross-context

**Service Conversation**

A user's private communication with a Carberk-operated service, whose purpose and authorized staff access are independent of a Listing buyer/seller Conversation.

_Avoid_: Support seller, fake Listing chat

**Support Case**

An assistance or appeal request handled by Carberk Support, with its own response, closure and reopening lifecycle. It is not a Content Report or paid history order.

_Avoid_: Assistance complaint, paid lookup

**Vehicle History Request**

An enquiry to Carberk about available third-party vehicle history. It can begin without a VIN or purchase and can lead to one Vehicle History Order.

_Avoid_: Inspection request, diagnosis

**Vehicle History Order**

A user's accepted purchase of available provider history for one confirmed VIN under an agreed offer and fulfilment commitment.

_Avoid_: Paid inspection, condition check

**Provider Report Artifact**

An original dated report document or link attributed to a vehicle-history provider, with its source and permitted use. It is distinct from Carberk's physical diagnostic findings.

_Avoid_: Carberk inspection score, complete vehicle history

**Vehicle History Archive**

Carberk's internal collection of permitted vehicle-history artifacts and attributed observations, preserving provenance and access/use restrictions separately from purchaser communications and payment evidence.

_Avoid_: Public report library, unrestricted company data

**Service Assignment**

The named operator's current responsibility for a service request or case, changed through an explicit handover. It grants only the access appropriate to that service and role.

_Avoid_: Global operator role, dealer permission

## Reports

**Inspection Order**

A request for a physical vehicle inspection with its own appointment, authorization and service lifecycle.

_Avoid_: Provider lookup, inspection interest

**Inspection Report**

Recorded physical vehicle observations and their scope, evidence, inspection date and mileage, released to an explicitly authorized private or public audience.

_Avoid_: Vehicle guarantee, condition grade

**Checklist Version**

A fixed edition of the checks and assessment rules used for an inspection.

_Avoid_: Mutable live rubric, pass score

**Report Snapshot**

An immutable released version of an Inspection Report, preserving its observations and audience through linked corrections.

_Avoid_: Editable final report, latest template

**Diagnostic Visit Identity Record**

Immutable evidence of the vehicle identity observed at one physical inspection, with its method, identifiers and restricted provenance. Corrections append evidence without rewriting the original record.

_Avoid_: Vehicle registry, editable identity snapshot

**Diagnostic Continuity Proof**

A restricted, single-use record binding a predecessor report and new Inspection Order to exact identity evidence and versions. It proves reinspection continuity under ADR-0108 without transferring report access, findings or consent.

_Avoid_: VIN equality, transferable report authorization

## Listings

**Listing View**

A countable opening of full Listing detail by an eligible viewer, distinct from a card preview or a detail-data fetch.

_Avoid_: Impression, contact intent
