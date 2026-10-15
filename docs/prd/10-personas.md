# 10 — Personas

Five personas. Each one's primary jobs-to-be-done shape feature priorities.

> Names and details are illustrative; do not invent additional personas without strong evidence.

---

## Aman — Private Seller

**Profile**
- 32, lives in Aşgabat
- Sells his Lada Granta because he's upgrading to a Chery Tiggo 7
- Will use AutoTM for ~2 weeks then disappear until next car change
- Uses Russian primarily; reads Turkmen fine

**Jobs-to-be-done**
1. Post a listing with minimum friction (he has 15 min while waiting at a kafe)
2. Receive serious inquiries, filter out tire-kickers
3. Negotiate price via chat without giving out his real phone too early
4. Mark sold and disappear

**Critical features for Aman**
- Listing wizard ≤7 steps with photo capture flow
- Chat that's reliable (push notifications fire)
- Block / report on a chat-by-chat basis
- Sell-from-Garage shortcut (if he tracked his Lada there)
- Edit listing easily ("oh, I forgot to mention winter tires")

---

## Maral — Private Buyer (first-time)

**Profile**
- 28, lives in Türkmenabat
- Looking for her first car, budget ~120,000 TMT
- Cautious — has never bought a used car before
- Prefers Turkmen UI; reads Russian content fine

**Jobs-to-be-done**
1. Browse listings to learn what's available + at what prices
2. Save searches so she gets pinged when new options come up
3. Compare options (does she want a Lada, a Geely, or a Hyundai?)
4. Ask sellers questions without committing to a phone call
5. Avoid scams

**Critical features for Maral**
- Anonymous browsing (she's not committed yet — login wall would lose her)
- Powerful filters (price range, year, mileage, brand)
- Saved searches with push when matching cars appear
- Favorites + comparison (Phase 3)
- Clear seller information (PRO badge for dealers, tenure)
- (Phase 2) Tier badge to flag inspected cars

---

## Ata — Power Buyer / Enthusiast

**Profile**
- 45, lives in Aşgabat
- Owns 3 cars (his daily, his weekend car, his project)
- Always watching the market — has a "dream car" he's saving for (Mercedes E-Class)
- Writes blog posts about car ownership; reads other people's posts
- Bilingual RU+TK fluent, prefers Russian

**Jobs-to-be-done**
1. Track his garage publicly (status flex)
2. Follow people whose taste he respects (blogs, listings)
3. Get notified the moment his dream car shows up
4. Share interesting listings to friends in WhatsApp

**Critical features for Ata**
- Garage with Dream cars + linked SavedSearches
- Bortzhurnal blog (write + follow)
- Deep-link sharing that unfurls beautifully in WhatsApp/Telegram
- Saved-search matches that feel timely (not 24h later)

---

## Ilýa — Dealership Sales Rep

**Profile**
- 36, works at "BAH Awto" in Aşgabat
- Lists 20-50 cars at any time; cars rotate weekly
- Communicates with dozens of potential buyers daily
- Wants a truthful business identity and accurate public inventory
- Russian primary

**Jobs-to-be-done**
1. Post many listings efficiently (bulk-friendly UX)
2. Claim and respond to shared business enquiries with visible staff responsibility
3. Show checked business identity without implying vehicle quality
4. Share his showroom URL externally

**Critical features for Ilýa**
- Personal staff sign-in with authorized access to business-owned inventory and enquiries
- Listing creation that's fast on repeat (catalog autocomplete, copy-from-similar)
- Chat with multiple conversations triage-able (mute, archive, "important" pinning)
- Public showroom page with hours, logo, listings, contact
- Explicit personal/business context and durable handover when staff leave

---

## Bagtyýar — AutoTM Admin

**Profile**
- The platform operator (and possibly: the developer)
- Uses desktop (admin.auto.tm) all day
- Cares about: zero scams, healthy SMS gateway, growth metrics

**Jobs-to-be-done**
1. Triage incoming reports and act on them within hours
2. Review business identity and membership without certifying vehicle condition
3. Monitor SMS gateway health (5 phones humming = OTPs flowing)
4. Handle authorized service notices, operational failures and founder decisions
5. Audit who did what (the buck stops at the audit log)

**Critical features for Bagtyýar**
- Admin dashboard with priority queues (reports, pending verifications)
- Phone OTP + TOTP 2FA for security
- Per-phone SMS gateway health view
- Purpose-scoped service/moderation queues and explicit staff grants
- Searchable audit with separately authorized sensitive investigation/export
- Scoped inspection operations and TK/RU/EN analytics/admin interfaces

---

## Edna — Center technician

**Profile**
- AutoTM-employed mechanic
- Inspects vehicles brought to the center; actual throughput depends on validated scope and equipment
- Uses a scoped tablet/desktop workspace, records observations and attaches evidence
- Russian primary

**Jobs-to-be-done**
1. Receive inspection assignments
2. Complete a pinned checklist with photos, measurements and explicit unchecked items
3. Submit complete findings for the audience-appropriate authorized review
4. Re-inspect if seller fixes something

The approved center-service campaign follows [feature 50](features/50-reports-tier.md). Public reports need a different qualified reviewer; technician status never grants full marketplace-admin or private analytics access. Actual service opening waits for center/staff/equipment readiness. No traveling-inspector operation is included.

---

## Anti-personas (NOT building for)

- **Cross-border buyers** — listing logistics across borders is out of scope
- **Auction enthusiasts** — fixed-price model only
- **Crypto buyers** — fiat only
- **Test-drive bookers** — out of scope; arrange manually via chat
