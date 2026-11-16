# AutoTM Ad Sales Strategy

> **Status**: Strategy doc, drafted 2026-05-18. Mutable; not an ADR.
> **First matters in**: Post-MLP marketplace bets. Ads should not distract from the MLP beta loop.
> **Why it exists**: Per [product boundaries](../../../README.md#product-boundaries), AutoTM bans paid placement on listings. Third-party advertising is the alternative ad-revenue stream that respects that constraint. The detail page + feed + blog generate ~10-100M impressions/year by Year 3 — sellable inventory if monetized thoughtfully.

---

## The honest pitch — what we're actually selling

**Display + native + sponsorship advertising slots to TM businesses whose customers overlap with car buyers/sellers.** Not Google AdSense; not programmatic. Direct sales to a manageable number of TM advertisers — banks, insurance, parts retailers, service centers, paint shops, tire shops, manufacturer-affiliated dealers (where they're not posing as listing-sellers).

The economic model: 100% direct sales from a 2-3 person team. No programmatic ad exchange. No third-party ad networks (air-gap kills this anyway — no Google Ad Manager, no Facebook Audience Network).

This is a slower revenue stream than dealer subscriptions but **infrastructure-light, high-margin, and compounding**. Every new listing detail page = more impressions = more sellable inventory.

---

## Why this exists (despite "no paid placement")

Important to draw the line clearly. Vision.md bans:
- Featured / promoted listings
- Pay-to-rank ordering manipulation
- Paid placement that misleads buyers about why a listing is shown first

Vision.md does NOT ban:
- Display ads in marketplace surfaces (banner ads, native sponsored content, sidebar ads)
- Sponsored content on the blog (Bortzhurnal — post-MLP)
- Loan calculator + insurance widgets that route to specific brands
- Newsletter sponsorships
- B2B partnership integrations (bank pre-qualification, insurance leads)

The principle: ads are **clearly labeled as advertising** and **never affect what listings rank higher or are shown to a given buyer**. Listings are listings; ads are ads; the boundary is bright.

This positions AutoTM ethically (no pay-to-win marketplace) while still capturing a real advertising revenue stream from adjacent service categories.

---

## Ad inventory — what we have to sell

### High-value inventory

| Surface | Format | Typical size | Estimated annual impressions at Year 3 (~150k MAU) |
|---|---|---|---|
| **Listing detail page — sidebar (desktop)** | Display banner 300×600 | Sticky right rail | ~30M |
| **Listing detail page — below specs (mobile + desktop)** | Native sponsored card | Full-width inline | ~50M |
| **Listing detail page — loan calculator widget** | Native widget (interactive) | Inline section | ~15M (when user opens) |
| **Listing detail page — insurance quote widget** | Native widget | Inline below loan widget | ~10M |
| **Listing feed — every 8th card (mobile)** | Native ad card matching listing card design | Same size as listing card | ~80M |
| **Listing feed — top banner (web)** | Display 728×90 | Top of feed page | ~25M |
| **Blog (Bortzhurnal) — article content** | Sponsored content + inline display | Various | ~20M (by Year 3 with SEO traffic) |
| **Blog — sidebar** | Display 300×250 | Article sidebar | ~30M |
| **Email newsletter (when launched, Year 2+)** | Sponsored block | Footer of newsletter | ~5M opens/year |
| **Inspection report viewer page (Phase 2+)** | Display + native (service-relevant) | Inline | ~10M (when reports become common) |

**Total annual impressions at Year 3 maturity**: ~275M.

### Inventory we deliberately won't sell

- **Listing card decoration** — no "highlighted" / "premium" listings inside the feed itself. Pure chronological.
- **Search result ranking influence** — never. Listings ranked algorithmically; ads are visually distinct slots.
- **Above-the-fold takeover** on detail pages — keeps user trust that the page is about the listing, not the ad
- **Misleading ad creative** — no fake "AutoTM verified" / "Official partner" claims unless they're real
- **Interstitial / popup ads** — never on mobile; possibly limited "newsletter signup" interstitials but not paid ads

### Pricing models

| Format | Pricing | Rationale |
|---|---|---|
| **Display banner (300×600 sidebar)** | CPM $1.50-3.00 | Standard banner rates; TM advertisers won't pay much more |
| **Native sponsored card (feed)** | CPM $2.50-5.00 | Higher engagement than banner; charge premium |
| **Loan calculator widget** | $2,500-5,000/month sponsorship per bank, exclusive | One bank "owns" the slot; high-value placement |
| **Insurance quote widget** | $1,500-3,500/month sponsorship per insurer | Same model |
| **Blog sponsored article** | $300-800 per article | Editorial; AutoTM team writes; advertiser approves |
| **Blog display ad** | CPM $1.00-2.50 | Lower than detail page; lower intent |
| **Email newsletter sponsor block** | $200-500 per send | Once-weekly newsletter; small but engaged audience |
| **Inspection report viewer ads (Phase 2)** | CPM $3.00-6.00 | Highest-intent surface; person actively making purchase decision |

Pricing is **negotiable per advertiser** — most TM ad sales will be quarterly contracts at custom rates. Posted rates above are anchor points.

### Revenue projections (Year-by-year)

| Year | MAU | Annual impressions | Avg CPM | Annual ad revenue |
|---|---|---|---|---|
| 1 | 15k | ~30M | $0.80 | **~$25k** |
| 2 | 50k | ~100M | $1.40 | **~$140k** |
| 3 | 150k | ~275M | $1.80 | **~$495k** |
| 4 | 200k | ~400M | $2.20 | **~$880k** |
| 5 (peak) | 250k | ~500M | $2.50 | **~$1.25M** |

Year 5 peak: **~$1M-1.5M from advertising alone**. Less than dealer subs (Year 5 ~$500k-1M) but compounds reliably.

These are gross — minus sales staff costs (see below) for net.

---

## The 6 target advertiser categories

Realistic TM advertiser pool. Each category has 5-50 potential advertisers:

### 1. Banks (auto loans)

**Why they'll buy**: Auto loans are a high-margin product. Buyer making a $20k decision = high-intent lead. TM has limited banks (Halkbank, Türkmenistan Banky, etc.) — ~5-10 viable advertisers.

**Pitch**: "Reach 50,000 active car buyers per month in your country. Loan calculator widget on every listing → instant pre-qualification → leads to your bank."

**Pricing tier**: $2,500-5,000/month sponsorship (exclusive loan calculator widget) OR $0.30-0.50 per qualified lead.

**Tough negotiation points**: Banks have small marketing budgets in TM. Selling them on digital is a culture shift. Pitch ROI: "Cost per qualified loan applicant on AutoTM = $X; vs your branch acquisition cost = $Y." Need to compute Y from their data.

### 2. Insurance companies

**Why they'll buy**: Auto insurance is mandatory in TM. Every car needs OSAGO + many buy KASKO. Sale leads.

**Pitch**: "Insurance quote widget. User buys car → contemplates insurance → gets quote from your company."

**Pool size**: ~10-15 insurance companies in TM.

**Pricing**: $1,500-3,500/month sponsorship OR $0.20-0.40 per quote lead.

**Risk**: Insurance pricing is heavily regulated in TM. They may have less flex on marketing budgets. Start with 1-2 receptive insurers; expand from there.

### 3. Parts retailers + e-commerce parts platforms

**Why they'll buy**: Buyers + sellers both buy parts. Sellers prepping car for sale ("I need new spark plugs before listing"); buyers maintaining recently-bought car.

**Pitch**: Native ad cards in feed + sidebar display + blog content ("How to replace your timing belt — sponsored by X").

**Pool size**: ~30-50 parts retailers (mostly small) + 1-2 nascent online parts platforms.

**Pricing**: CPM $1.50-3.00 + CPC $0.20-1.50.

**Sales motion**: Smaller advertisers; could be self-serve via a future ad portal (Year 2-3).

### 4. Service centers + workshops

**Why they'll buy**: Pre-purchase inspection alternatives, post-purchase maintenance, repair services.

**Pitch**: "Targeted by city — only shown to listings in your service area. Buyers who need a mechanic see you first."

**Pool size**: ~100-200 service centers across TM; only ~30-50 have any digital marketing budget.

**Pricing**: $50-200/month sponsorship per service center (cheap; high volume).

**Risk**: Most TM service centers operate without digital presence; teaching them what advertising means is a sales-cycle blocker. Acquisition cost-per-customer is high relative to ARPU. May require dedicated SMB sales role.

### 5. Tire shops + paint shops + specialty services

**Why they'll buy**: Mid-size businesses; cars need tires + body repair routinely.

**Pitch**: Similar to service centers but slightly different vertical messaging.

**Pricing**: $100-300/month sponsorship.

**Sales motion**: Probably bundled with service center campaigns; same sales team.

### 6. Manufacturer-affiliated dealers (when they're not just listing sellers)

**Why they'll buy**: Brand-building campaigns ("Toyota authorized dealer in Aşgabat") distinct from listing-level activity. Tied to broader marketing budgets.

**Pitch**: Brand sponsorship slot — banner ads + content + newsletter mentions.

**Pool size**: ~10-20 brand-authorized dealers in TM.

**Pricing**: $1,000-3,000/month for premium "brand showcase" placements.

**Note**: These overlap with dealer subscriptions (see [`dealer-subscriptions.md`](dealer-subscriptions.md)). Brand sponsorship is incremental on top of regular PRO dealer subscription.

---

## Sales motion — how do we actually sell this

### Realistic sales structure by year

| Year | Sales team | Pipeline | Focus |
|---|---|---|---|
| 1 | Founder + part-time helper | 10-20 conversations, 3-5 advertisers signed | Banks + 1-2 insurance pioneers (lighthouse customers) |
| 2 | 1 dedicated sales person + founder | 50+ conversations, 15-20 advertisers signed | Expand to insurance + service centers; first parts retailer |
| 3 | 2 sales people + sales manager | 100+ conversations, 30-50 advertisers | All categories represented; renewals are the engine |
| 5 (mature) | 3-4 sales people + manager + 1 ops/account-mgmt | Stable book of ~80-150 active advertisers | Quarterly contract renewals + new advertiser acquisition |

### The sales cycle (realistic for TM advertisers)

1. **Lead generation** (Week 0): Outbound — cold calls + LinkedIn (limited use in TM) + in-person visits to bank/insurance HQs in Aşgabat. Founder networking critical in early days.
2. **Discovery meeting** (Week 1-2): In-person preferred. Demo AutoTM. Show traffic stats. Understand their current marketing.
3. **Proposal** (Week 2-4): Custom proposal with mock-up of ad placement, pricing, expected impressions.
4. **Negotiation** (Week 4-8): Pricing, exclusivity, contract terms. TM business culture: relationship-driven, multiple meetings expected.
5. **Contract signing** (Week 8-12): Quarterly or annual contracts. Cash up-front or invoiced monthly.
6. **Onboarding** (Week 12+): Ad creative collection + integration + first campaign live.

**Total cycle**: 2-4 months from cold contact to live ad. Plan accordingly for revenue ramp.

### Account management — the recurring revenue mechanism

After first contract, retention matters more than new acquisition. For every $1 spent on new acquisition, $0.30-0.50 on account management/renewal.

Quarterly business reviews with each advertiser:
- Performance report (impressions delivered, clicks, lead estimates)
- Renewal pitch + upsell opportunities
- Listen to feedback ("ads not working in X surface")
- Iterate creative + targeting

Goal: 70-80% renewal rate by Year 2-3.

### What we offer advertisers — the actual deck

Standard sales presentation (~10-15 slides):

1. AutoTM in TM: market position, MAU, growth trajectory (proof of audience)
2. Audience demographics (age, gender mix, geography, intent signals)
3. Why advertise on AutoTM (in-market buyers; high-intent surface; brand-safe content)
4. Ad inventory map (showing all surfaces)
5. Pricing tiers (rate card + custom packages)
6. Case studies (start with anonymized "Bank A increased loan inquiries 3x" — fabricated initially, real by Year 2)
7. Creative specifications (sizes, file formats, copy guidelines)
8. Reporting + analytics (what the advertiser sees post-campaign)
9. Contract terms + renewal rates
10. Onboarding timeline

Honest acknowledgment: this deck is 80% identical to any AdSense pitch deck. The differentiation is **AutoTM is the only TM marketplace at this scale + we're the only ad inventory of this kind in this market**. Defensible moat through audience concentration, not deck creativity.

---

## Software integration — what we actually build

### Post-MLP bet — basic ad delivery

Minimum viable infrastructure:

- **Ad slot system in `apps/api`**: a `ads` bounded context (or part of `admin/`) that owns:
  - `AdCampaign` entity: advertiser, surfaces, dates, budget, creative URL
  - `AdSlot` enum: 'listing-detail-sidebar', 'listing-feed-card', 'blog-article-inline', etc.
  - `AdImpression` log: when shown + which user + which ad (consent-aware)
  - `AdClick` log: same but for clicks
- **Frontend integration**: `<AdSlot slotKey="listing-detail-sidebar" />` component on web + `<AdSlot>` on mobile. Component fetches active ads for the slot; renders + records impression.
- **Admin dashboard expansion**: Create/edit campaigns; upload creative; view performance reports
- **Tracking**: Impression counter (real-time); click tracking via `/r/click/:id` redirect endpoint that logs + redirects

Total effort: ~3-4 weeks of focused dev.

### Phase 2-3 — sophisticated targeting + lead capture

- **Targeting**: by city, by listing category (luxury vs. budget), by user demographics (where available)
- **A/B testing**: rotate creative; measure CTR
- **Lead capture forms**: loan calculator + insurance quote widgets that capture user info + route to advertiser
- **Self-serve advertiser portal** (Year 2-3): smaller advertisers (parts retailers, service centers) self-onboard, upload creative, set budget. Founder/sales team free for big accounts.
- **Reporting API**: advertisers can pull their own performance data

### Privacy + consent

TM has limited data protection regulation, but global best practices matter:
- Don't share user PII with advertisers without consent
- Lead capture forms collect only the data needed for the partner
- Buyers should be able to disable ad personalization in settings

---

## Building trust with advertisers

Advertisers in TM are skeptical of digital marketing. They've been burned by inflated metrics. Trust strategy:

### Year 1 — credibility foundation

- **Founder personally pitches first 5-10 advertisers.** Trust transfer.
- **Detailed performance reports** — share raw impression data, not just summary numbers. Open-book transparency.
- **First contract is short** (1-3 months) at favorable pricing — let advertiser see results before committing.
- **Money-back / make-good policy** — if delivered impressions are below 80% of promised, refund difference or extend campaign.

### Year 2-3 — case studies + benchmarks

- Anonymized case studies: "Bank A spent $X, generated Y leads, ROI Z" (with their permission)
- Industry benchmarks: "TM marketplace ads avg CPM $1.80; AutoTM delivers $2.30 — premium audience"
- Third-party verification (Year 3+): if TM gets digital advertising audit firms, partner with them

### What kills advertiser trust

- Inflated impression counts (bot traffic, accidental refreshes counted)
- Vague reporting ("you got good reach")
- Slow payment cycles when AutoTM owes them refunds
- Repeated creative rejection without clear feedback

---

## Edge cases + failure modes

### Sales failures

**1. No advertiser appetite — pipeline never materializes.**

- **Probability**: Moderate. TM digital advertising is nascent.
- **Detection**: Month 6 post-launch, if no signed contracts → red flag.
- **Mitigation**:
  - Start with banks (most receptive; loan products are obvious fit)
  - Free trial campaigns for first 3 advertisers — proof of concept
  - Pivot to performance-based pricing (CPM → CPC → CPL) if they want low-risk testing

**2. CPMs collapse — supply > demand.**

- **Probability**: Low in Year 1-2 (no supply). High in Year 4-5 if many advertisers create alternative options.
- **Mitigation**: Lock advertisers into annual contracts with auto-renew at fixed rates. Pricing power is highest before competition emerges.

**3. One advertiser dominates revenue — concentration risk.**

- **Risk**: Bank A signs huge deal; suddenly they're 40% of revenue; they pull contract → revenue cliff
- **Mitigation**: No single advertiser >20% of revenue. Reject deals that would concentrate too much. Diversify aggressively.

**4. Government regulation tightens — what we can show changes.**

- **Probability**: Always possible in TM.
- **Mitigation**: Conservative creative review; lawyer reviews ad guidelines annually; never run politically sensitive content

### Operational failures

**5. Ad creative quality is terrible — user trust degrades.**

- **Probability**: High. Many TM advertisers don't have professional creative resources.
- **Mitigation**: AutoTM offers creative services (template + light copywriting) for $200-500 add-on. Mandatory creative review; reject anything below quality bar.

**6. Tracking inflated / inaccurate — advertisers feel cheated.**

- **Risk**: Inevitable bug or double-counting in our impression code. Advertiser sees mismatch with their landing-page analytics.
- **Mitigation**: Conservative counting (count after viewable for 1+ seconds; not just delivered to DOM). Reconciliation calls with advertisers showing how counts work.

**7. Brand safety incident — ad appears next to inappropriate listing.**

- **Risk**: Bank ad appears next to a listing for a salvage-title car. Advertiser furious.
- **Mitigation**: Sell ad slots by category (banks → all listings; vs. luxury brands → cars > 50k TMT). Quick "pause campaign on listings matching X" toggle for crises.

**8. Ad blocker adoption on web.**

- **Probability**: Low in TM (lower ad-blocker usage than US/EU); rising over time.
- **Mitigation**: Native ads (in-feed sponsored cards) bypass most blockers because they're not iframe-based. Pricing premium for native vs banner reflects this.

### Mobile-specific failures

**9. Mobile in-app ads have lower CTR than web — pricing pressure.**

- **Reality**: True. Mobile feed sponsored cards CTR usually 30-50% of web banner.
- **Mitigation**: Price mobile and web separately. Be honest with advertisers about expected CTR per surface.

**10. iOS App Store / Google Play rejection due to ad-heavy UX.**

- **Probability**: Low if we stay under standard ad density. Apple/Google have policies but enforce them lightly.
- **Mitigation**: Max 1 ad per 8 listing cards in feed. Never above-the-fold takeovers. Test in beta before submission.

### Revenue failures

**11. Year 3 revenue hits $200k not $500k.**

- **Probability**: Moderate. TM advertiser market may be smaller than estimated.
- **Mitigation**: Plan multiple revenue streams (subscriptions + inspections); ads are 1 of 3. If ads underperform, leaning harder on the others is okay.

**12. AutoTM acquisition cost > ad revenue per advertiser.**

- **Risk**: Sales cycle is 3-month; sales person costs $1500-3000/month; first contract $2-5k. May lose money on customer acquisition initially.
- **Mitigation**: Targets for first 12 months: average contract size $5k+, LTV 3+ years. Calculate CAC/LTV monthly; pause sales hiring if ratio is bad.

---

## Biases I'm working against — explicit self-check

**Bias 1**: I'm assuming digital ad markets work in TM like they do in KZ/UA/RU. **Counter**: TM may be 5-10 years behind those markets in digital advertising maturity. Mitigation: pilot with banks (most mature digital marketers) before broader push; don't assume parts retailers buy ads at all initially.

**Bias 2**: I'm assuming CPM is the right pricing model. **Counter**: TM advertisers may prefer fixed sponsorships (predictable spend) over CPM (variable). Mitigation: lead with sponsorship pricing; offer CPM as alternative; iterate based on what advertisers actually buy.

**Bias 3**: I'm assuming 100M+ impressions is "valuable inventory." **Counter**: If CTR is low (e.g., 0.05% on mobile sponsored cards), advertisers get few actual leads. They may discount the impressions accordingly. Mitigation: optimize for high-engagement formats (native > banner; widget > display); be data-honest about CTR in pitches.

**Bias 4**: I'm assuming the sales team will be available + affordable. **Counter**: Good ad-sales people in TM may be rare or expensive. Even if hired, they may not understand digital ad sales (different from traditional media). Mitigation: founder pitches first 10 advertisers; build the sales playbook from real wins before hiring; hire from related industries (digital marketing agencies) rather than traditional media.

**Bias 5**: I'm assuming advertisers will want quarterly contracts. **Counter**: They may want monthly (lower commitment) or annual (better rates). Mitigation: offer all three; quarterly default; monthly +20%; annual -10%.

**Bias 6**: I'm assuming the blog (Bortzhurnal) drives meaningful ad inventory. **Counter**: TM SEO traffic may be hard to build. Yandex + Google rankings in Turkmenistan are smaller traffic sources than in larger markets. Mitigation: blog ad revenue is icing-on-cake, not core. Don't depend on it for Year 1-2 revenue.

**Bias 7**: I'm not accounting for the operational drag of ad ops. **Counter**: Each advertiser = creative collection + review + integration + reporting + renewal. 50 advertisers = real ops burden. Mitigation: invest in self-serve portal early (Year 2); each advertiser self-serves submissions; AutoTM team reviews + approves.

**Bias 8**: I'm assuming ads coexist peacefully with the marketplace UX. **Counter**: If ads degrade UX (slower pages, less trust), they cannibalize the listings/dealer business. Mitigation: A/B test ad placements rigorously; measure listing engagement before/after; pull ad placements that hurt core metrics by >5%.

---

## Open questions / TBD

1. **Bank receptiveness**: Are TM banks ready to spend $2k-5k/month on digital ads? Specific pre-launch conversations needed.
2. **Insurance market**: Same. Especially: do they have separate marketing budgets vs. just commission-driven sales?
3. **Self-serve advertiser portal**: Build in Year 2 or wait until Year 3? Trades off engineering effort vs. ops scalability.
4. **Lead-form data ownership**: When AutoTM captures a loan application, do we keep a copy or just forward to the bank? Affects retention + repeat-marketing potential.
5. **Government advertisers (TM Telecom, etc.)**: Can/should we accept government ad spend? Political implications.
6. **Sales person hiring**: Where do we find ad-sales talent in TM? Possibly Russian-speaking from KZ/RU diaspora returning.
7. **Email deliverability**: When newsletter launches, TM email providers may be quirky. Pre-test before launching newsletter sponsorships.

---

## Success metrics

| Metric | Year 1 target | Year 3 target | Year 5 (peak) target |
|---|---|---|---|
| **Signed advertisers** | 3-5 | 25-40 | 80-150 |
| **MRR from ads** | $1k-3k | $30k-50k | $90k-130k |
| **Annual ad revenue** | $25k | $400k-600k | $1M-1.5M |
| **Avg contract size** | $5k | $15k | $25k |
| **Advertiser retention (12-month renewal)** | 60% | 75% | 80% |
| **Sales team cost as % of ad revenue** | 80% (founder time mostly) | 30% | 20% |
| **CPM average across surfaces** | $0.80 | $1.80 | $2.50 |

If at Year 2 we're below $50k MRR from ads → consider whether ad strategy needs major rethink (different categories, different pricing, different sales motion).

---

## Cross-references

- [Product boundaries](../../../README.md#product-boundaries) — Anti-goals: no paid placement
- [`../03-roadmap.md`](../03-roadmap.md) — ads are a post-MLP bet, not part of the MLP beta
- [`../features/`](../features/) — future feature PRD for `34-advertising.md` (TBD)
- [`inspection-program.md`](inspection-program.md) — inspection report viewer pages = prime ad inventory
- [`dealer-subscriptions.md`](dealer-subscriptions.md) — dealers + advertisers overlap (brand-authorized dealers may pay for both subscription + brand sponsorship)
