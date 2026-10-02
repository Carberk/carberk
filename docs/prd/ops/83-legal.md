# 83 — Legal documents (Privacy Policy, Terms of Service, Posting rules)

## Why this doc exists

Apple App Store and Google Play Store both require:

- A Privacy Policy URL at submission time
- Terms of Service for any app that handles user accounts and user-generated content

Plus EU GDPR (if we ever serve EU users — relevant for TM diaspora) and TM data law require disclosures. This PRD page outlines **what content** these legal docs must include. The actual legal text should be reviewed by a Turkmenistan-licensed lawyer before launch.

## Where they live

- Reviewer-production URLs: `https://autotm.bagtyyar.dev/<lang>/legal/privacy`, `https://autotm.bagtyyar.dev/<lang>/legal/terms` and `https://autotm.bagtyyar.dev/<lang>/legal/posting-rules`
- Staging uses `https://staging.autotm.bagtyyar.dev` with the same localized paths.
- Mobile selects `EXPO_PUBLIC_WEB_URL` per EAS build profile. Web uses runtime `WEB_BASE_URL` for canonical links, set to the same public origin.
- The founder must confirm Railway custom domains and external-network TLS/page loads before Play submission. #496 tracks this hosting evidence; recording these URLs does not establish availability.
- Served by `apps/web` as static markdown rendered server-side
- Linked from mobile app (Settings → About → Privacy / Terms / Posting rules)
- Linked from admin app (footer)
- Required versions: RU + TK + EN (trilingual)

## Consent UX in auth

Sign-in uses implicit agreement copy on the phone or email entry screen:

> By continuing, you agree to the Terms and Privacy Policy.

The Terms and Privacy Policy labels link to the canonical public web URLs above, opened from mobile via an in-app browser or custom tab when available. Do not add a checkbox in S2 unless legal review requires explicit recorded acceptance.

If explicit recorded acceptance is required later, record the accepted terms version, privacy version, locale, and timestamp during first account creation or Sign-in Code verification. This is a legal-review follow-up, not part of the S2 sign-in implementation.

## Privacy Policy — required sections

| Section | Content |
|---|---|
| **What we collect** | Phone number (sign-in), email address when the User signs in by email or adds/changes one on the account ([ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md)), the Listing contact phone the seller confirms by SMS ([ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md)), name and profile photo if enabled, location (region/city) selected by user or attached to a listing as car location, listings the user posts, simple contact-thread messages, device info needed for debugging (model, OS, app version), IP address for rate limiting/security, photo uploads, VIN if the user enters one |
| **Future collections if features ship** | Push token (if native push ships), video uploads (if video ships), garage vehicle data (if Garage ships), blog content (if Bortzhurnal ships), inspection data (if reports ship) |
| **What we do NOT collect** | We do NOT track location via GPS in the MLP beta. We do not store raw GPS coordinates in saved searches or location analytics. We do NOT have third-party advertising SDKs. We do NOT add open tracking, tracking pixels, or tracked links to the emails we send ([ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md)). We do NOT sell data. |
| **Why we collect it** | Account creation, listing display, search functionality, communication between users, fraud prevention, app store policy compliance |
| **Who can see it** | Public: name/avatar if shown, active listings, public listing photos, listing location city/region, and the Listing contact phone the seller chose. Private: the phone number and email address used to sign in (unless the seller also chose that phone as a Listing contact phone), contact-thread messages except admin moderation, exact location pin if a future phase adds it. Public Garage, public blog posts, response-time stats, and inspection reports are visible only if those later features ship. |
| **Sharing with third parties** | MLP beta uses AutoTM-owned auth and hosting. Sign-in codes sent by email are delivered by an email delivery provider located in the United States, which receives the email address and the message containing the code and keeps them for 30 days; the policy names the provider's country and retention, not the vendor ([ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md)). If native push ships later, Firebase Cloud Messaging (Google) and Apple Push Notification Service receive the recipient's device token and notification payload. We do not share data with advertisers, brokers, or other third parties. |
| **Data retention** | User data retained while account is active. An authenticated user can delete the account in the app from Cabinet > Profile > Delete account. The public web deletion page accepts either Sign-in Method and confirms the request with a code sent to that phone number or email address ([ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md)). After account deletion: 30-day grace period during which either Sign-in Method recovers the account, then PII removed and both the phone number and the email address freed. Listings, messages, moderation reports, and audit rows are preserved with "Deleted user" / historical attribution for audit trail. S8 must verify implementation matches this before beta; the S2 hard-delete endpoint is not the beta target. |
| **User rights** | Right to access (export your data), right to delete (account deletion in-app or on the public web deletion page), right to correct (edit profile/listing fields), right to opt out of marketing notifications if marketing notifications ever ship |
| **Children's privacy** | App not intended for users under 18 (consistent with auto purchase being adult-only); we do not knowingly collect data from minors |
| **Cookies (web only)** | HTTP-only session cookies for admin login in `apps/admin`; `apps/api` still accepts bearer auth only. No analytics cookies in the MLP beta. |
| **Security** | HTTPS in transit; bcrypt-hashed refresh tokens; encrypted-at-rest disk; TM-hosted servers; admin actions audit-logged |
| **Contact** | Email + physical address for privacy inquiries |
| **Changes to policy** | Users notified in-app or through the documented beta support channel when policy changes materially; effective date displayed |
| **Jurisdiction** | Turkmenistan law applies |

## Terms of Service — required sections

| Section | Content |
|---|---|
| **Eligibility** | Must be 18+; must agree to abide by these terms |
| **Account responsibilities** | Sign-in is a code sent to a phone number or an email address, with no password; the account always keeps at least one Sign-in Method ([ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md)). User responsible for keeping access to those methods secure and for keeping codes to themselves; AutoTM never asks for a code; user responsible for content they post |
| **Acceptable use** | Listings must be for real cars user owns or represents; no scams, fraud, harassment, illegal content, intellectual property infringement |
| **Listing accuracy and contact phone** | Sellers represent their listings accurately; misrepresentation may result in suspension. Publishing, republishing, or changing a Listing's contact phone requires a verified contact phone — the seller's verified phone Sign-in Method or another +993 number confirmed with a purpose-specific SMS code. Verification only allows showing the number on the Listing and never makes it a Sign-in Method; email-only sellers need no phone Sign-in Method; sellers may only use a number they are entitled to use ([ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md)) |
| **Prohibited content** | Spam, duplicate listings, stolen vehicles, vehicles with active liens (without disclosure), illegal modifications |
| **Communication** | Users agree to receive transactional messages needed to operate the service (sign-in codes by SMS or email, Listing contact-phone codes, and contact-thread messages). Native push and marketing notifications require the later notification feature and marketing remains opt-in. |
| **Disclaimer** | AutoTM is a marketplace; we do not own / inspect / warrant listed cars (except where Phase 2 inspection report explicitly applies). Transactions are between users. |
| **Inspection reports (Phase 2)** | Reports are AutoTM's good-faith assessment; not a warranty; buyers should perform independent verification |
| **Dealer terms** | Dealer accounts, PRO badge, and dealership verification are post-MLP features. If shipped, dealers are responsible for accuracy of all listings under their account. |
| **Termination** | Users can delete their account in-app at any time, or request deletion on the public web deletion page with the phone number or email address on the account; either Sign-in Method recovers the account during the 30-day grace period; AutoTM can suspend accounts that violate these terms |
| **Liability** | AutoTM not liable for user-to-user disputes, transactions, or content (within legal limits) |
| **Modifications** | We may update terms; material changes communicated in-app or through the documented beta support channel |
| **Governing law** | Turkmenistan |
| **Contact** | Email + physical address |

## Posting rules — required sections

Every rule must map to something the product or its moderators enforce. Do not add policy that nothing enforces.

| Section | Content and what enforces it |
|---|---|
| **What you may list** | A real vehicle the seller owns or may sell; one Listing per vehicle (moderators block duplicates); brand, model, year and VIN are locked after publish |
| **Photos** | Photos of the actual vehicle (moderators act on misleading reports); 1 to 20 photos; JPEG or WebP up to 5 MB each, compressed by the app |
| **Price, description and contact** | Price above zero in TMT, USD or AED; description required, up to 2,000 characters, damage question answered, mileage for a used vehicle; calls, chat or both enabled; a contact phone the seller is entitled to use. The page does not yet claim SMS verification of the contact phone: [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md) is decided but the publish check is not implemented |
| **What is not allowed** | The Listing report reasons the app offers (spam, scam or fraud, misleading information, wrong category), plus the Terms' prohibited content |
| **What happens when a Listing breaks the rules** | Listings go live on publish with no pre-review; moderators can block a Listing and suspend an account, with a recorded reason |
| **Reporting and support** | How to report from Listing detail; support email and phone |

## Format

- Plain Markdown rendered server-side by Next.js
- Versioned (URL: `/legal/privacy/v1`, latest also at `/legal/privacy`)
- Effective date shown prominently
- Print-friendly (CSS print stylesheet)

## When to update

- Material changes (new data collection, new third-party integration, expanded liability): publish new version + in-app announcement via admin broadcast
- Minor typo / clarification fixes: edit in place, increment "Last revised" date

## App Store / Play Store submission checklist

- [ ] Privacy Policy URL: `https://autotm.bagtyyar.dev/en/legal/privacy`
- [ ] Google Play account-deletion URL: `https://autotm.bagtyyar.dev/en/account/delete`
- [ ] Privacy nutrition label (Apple) filled in to match what the Privacy Policy says
- [ ] Data Safety section (Google Play) filled in to match
- [ ] "Account Deletion" feature: shows the in-app `/me/delete` flow and the public web deletion page Google Play requires (see [Feature 30](../features/30-identity.md))
- [ ] Data safety (Google Play) declares the email address per [ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md) — owned by [#391](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/391), not by this policy page
- [ ] No third-party SDKs that share data without disclosure
- [ ] No ATT prompt needed in the MLP beta (no ad SDKs)

## Open questions

- Do we need a Cookies Policy separately, or fold into Privacy Policy? (TM doesn't strictly require; folding into Privacy is fine for MLP beta)
- Translation review: should TK + RU versions go through a separate legal review or is translating the EN version enough? (Likely separate review by TM lawyer)
- DMCA / IP infringement notice mechanism — needed for App Store? (US-style DMCA isn't required in TM; add a generic "report IP violation" flow in Phase 2)

## References

- [Feature 30 — Identity](../features/30-identity.md) — account deletion implementation
- [ADR-0054 — Phone or email sign-in share one User](../../adr/0054-phone-or-email-sign-in-share-one-user.md) — Sign-in Methods, deletion by phone or email
- [ADR-0055 — Resend sends sign-in codes from the worker](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md) — US email delivery provider, 30-day records, no tracking
- [ADR-0056 — Listing contact phones are verified](../../adr/0056-listing-contact-phones-are-verified.md) — verified Listing contact phone replaces the phone Sign-in Method publish gate
- [ADR-0022 — City-first listing location](../../adr/0022-city-first-listing-location.md) — city-level listing/search location policy
- [ADR-0023 — First-party product analytics](../../adr/0023-first-party-product-analytics.md) — no third-party analytics SDKs in the MLP beta
- [GRILL-OUTCOME §19](../../../GRILL-OUTCOME.md) — outstanding action item #7
