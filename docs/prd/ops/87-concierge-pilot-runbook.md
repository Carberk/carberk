# 87 — Concierge pilot runbook

> **Status:** S9a desk artifact — ready to execute when S9b trigger is met.  
> **S9b trigger:** Founder is physically in Turkmenistan **or** one trusted helper is on-ground with the pilot mechanic.  
> **Scope:** Manual concierge inspections only. No inspector app, no payments, no tier badges, no deployment/on-site cutover.

---

## Relationship to the app pilot

The proposed [ADR-0101](../../adr/0101-app-pilot-separate-from-manual-inspections.md) changes only the sequence: once accepted, the 20-user Ashgabat app pilot may run after its own readiness gates without waiting for this inspection experiment. This runbook keeps its qualified mechanic, local coordination, consent, safety and no-payment requirements. A trusted equipment handler is not a pilot mechanic by default. This document does not authorize either pilot, restore the in-app inspection-demand prompt deferred by ADR-0057, or expand report-service scope.

## Purpose

This runbook makes the S9b on-ground trust pilot executable by a founder or trusted helper, using only a human mechanic, a printed/hand-filled rubric, and a simple PDF template. It is a follow-on to the S9a remote trust-signals work ([`sprints/sprint-09-trust-wedge.md`](../sprints/sprint-09-trust-wedge.md)) and to the Phase 0 pilot described in [`business/inspection-program.md`](../business/inspection-program.md).

The pilot tests the single biggest risk in the trust wedge: **does a real buyer, facing a real purchase decision, value a third-party inspection enough to use it and eventually pay for it?** ([ADR-0037](../../adr/0037-trust-inspection-competitive-wedge.md))

---

## S9a vs S9b boundary

| | S9a (remote) | S9b (on-ground TM) |
|---|---|---|
| **Who does it** | Founder / remote team | Founder or trusted helper + pilot mechanic |
| **Location** | China / anywhere with dev stack | Turkmenistan, Aşgabat first |
| **Output** | Trust signals, fake-door demand instrument (removed from the app by ADR-0057), rubric v1, this runbook | 5-10 free inspections + case studies + demand summary |
| **Software needed** | S8a app + S9a changes | No new software; hand-filled rubric + PDF template |
| **Go/no-go decision** | Prepares inputs | Feeds the later betting-table decision |

**S9a is not S9b.** Nothing in this runbook should be interpreted as creating S9b code, schemas, issues, or execution work now.

---

## Pilot goal

Run **5-10 free manual inspections** for real buyers with active car-buying decisions, producing **3-5 written case studies** and a **demand-measurement summary** that the later betting table can use to decide whether to build the full Phase 2 inspection program.

### Success looks like

- At least 5 friendly buyers completed a free inspection.
- The mechanic filled the rubric v1 for every inspection.
- Each buyer answered the post-inspection feedback questions.
- At least 3 case studies are written in the anonymized template below.
- A one-page go/no-go input is recorded for the betting table.

### No-go boundaries

Stop or pause the pilot if any of these happen:

- The mechanic cannot commit to at least 5 inspections within 4 weeks.
- Fewer than 3 buyers with real, active buy-decisions can be recruited.
- Any participant asks for payment processing, a warranty, or legal/insurance documentation.
- Safety or coercion concerns emerge from buyer/seller feedback.
- Founder or trusted helper is not available to coordinate logistics and consent in person or by trusted local contact.

---

## Pilot roles

| Role | Count | Responsibilities | Ideal profile |
|---|---|---|---|
| **Pilot coordinator** | 1 | Recruits mechanic + buyers; schedules inspections; handles consent; collects feedback; writes case studies; stores data securely. | Founder or one trusted helper with local TM relationships and WhatsApp/Telegram reach. |
| **Pilot mechanic** | 1 | Performs inspections using rubric v1; takes photos; fills the report template; notes observations in plain language. | 5+ years hands-on mechanic experience in TM; Russian and/or Turkmen; has own transportation or can reach seller locations in Aşgabat; detail-oriented; not actively selling cars on the side. |
| **Friendly buyers** | 5-10 | Have an active car-buying decision; attend inspection; answer feedback questions. | Known to coordinator or mechanic by trust; actively comparing listings or about to meet a seller; not compensated for participation. |
| **Sellers** | 5-10 (matched to buyer listings) | Bring car to agreed location or allow inspection at their place; sign seller consent. | Sellers of listings the buyer is seriously considering. |

**Compensation for the pilot:**

- Mechanic: paid a flat fee or per-inspection fee agreed before pilot starts. Suggested: 100-200 TMT per inspection as a pilot honorarium, plus any transport costs. This is **not** the Phase 2 compensation model; it is a learning-budget expense.
- Buyers and sellers: **no payment**. The inspection is free.

---

## Recruiting steps

### Step 1 — Recruit the pilot mechanic (1 week before first inspection)

1. Ask your personal network for a trustworthy, experienced mechanic in Aşgabat.
2. Vet for conflicts of interest: not flipping cars, not working for a competing marketplace, not related to any likely seller.
3. Explain the pilot honestly:
   - 5-10 free inspections over ~4 weeks.
   - Use the rubric v1; take required photos; fill the PDF template by hand.
   - No app, no tablet, no OBD-II integration required. A Bluetooth OBD-II scanner is optional if the mechanic already owns one and knows how to use it.
   - Pay is a flat pilot honorarium, not tied to what the report says.
4. Share the rubric v1 artifact (produced by S9a T6, `docs/prd/business/inspection-rubric-v1.md`) and ask for feedback. Record feedback in the pilot notes.
5. Confirm schedule availability and reachable areas of Aşgabat.

### Step 2 — Recruit friendly buyers (continuous, 1-2 weeks)

1. Reach out to 10-15 people you trust who are actively shopping for a used car.
2. Screen for real intent: they should have at least one listing they are seriously considering in the next 2 weeks.
3. Explain the offer:
   - Free AutoTM inspection of one car they are considering.
   - No obligation to buy or not buy.
   - They must be present at the inspection.
   - They will answer a short feedback questionnaire afterward.
4. Aim for 5-10 confirmed buyers. Over-recruit because some will drop out.

### Step 3 — Match buyers to sellers/listings

1. Ask each buyer to share the listing or seller contact they are considering.
2. Coordinator contacts the seller and explains the free inspection pilot.
3. Seller must agree to:
   - Bring the car to the agreed location at the agreed time, or allow the mechanic to inspect at the seller's location.
   - Sign the seller consent form.
   - Allow photos of the car for the report.
4. If a seller refuses, note it as a data point (seller-refusal count) and move to the next buyer/listing.

---

## Consent script

Use these scripts verbatim or adapt for tone. Every participant must give **verbal + written/Telegram** consent before the inspection. Keep a screenshot or saved message as a record.

### Buyer consent script

> "AutoTM is running a small free pilot: a mechanic inspects the car you're thinking about buying and gives you a simple report. The inspection is free. You do not have to buy the car, and the report is yours. We will ask you 5-10 questions afterward about whether it helped. We will not use your name in any case study. Your seller will also need to agree. Do you want to take part?"

Buyer must confirm:
- [ ] They understand the inspection is free and optional.
- [ ] They are actively considering buying this specific car.
- [ ] They will be present during the inspection.
- [ ] They agree to answer the post-inspection feedback questions.
- [ ] They understand AutoTM is not promising the car is good or bad and is not providing a warranty.

### Seller consent script

> "A potential buyer is working with AutoTM's pilot inspection program. A mechanic would like to inspect your car for free and give the buyer a report. You do not pay anything. The mechanic will take photos of the car as part of the report. The buyer decides what to do with the information. You can refuse, and it will not affect your listing. Do you agree?"

Seller must confirm:
- [ ] They understand the inspection is free and optional.
- [ ] They allow the mechanic to inspect the car.
- [ ] They allow photos of the car for the report.
- [ ] They understand AutoTM is not providing a warranty or legal certification.
- [ ] They can refuse without penalty.

### Mechanic consent script

> "You are helping AutoTM test whether buyers value a professional used-car inspection. For each inspection, please follow the rubric, take the required photos, fill the report template, and write notes in plain language. Your pay is fixed for the pilot and does not depend on what the report says. If you find a safety issue that the buyer should know about, please flag it clearly. We may ask you for feedback on the rubric after a few inspections."

Mechanic must confirm:
- [ ] They understand pay is fixed and not tied to report outcomes.
- [ ] They will follow the rubric v1 to the best of their ability.
- [ ] They will flag safety issues clearly to the buyer/coordinator.
- [ ] They will not accept side payments from sellers or buyers during the pilot.

---

## Free-inspection flow

### Before the inspection

1. Coordinator confirms buyer + seller + mechanic availability.
2. Coordinator sends location and time to all three.
3. Buyer and seller give consent (screenshot or saved message).
4. Coordinator sends the mechanic the listing basics: make, model, year, approximate price, seller phone, location.
5. Mechanic prints or opens the rubric v1 + PDF template.

### During the inspection (~45-75 minutes)

1. Mechanic arrives, introduces self as AutoTM pilot inspector.
2. Mechanic performs visual + under-hood + underbody + optional OBD-II check per rubric v1.
3. Mechanic takes required photos:
   - Front 3/4, rear 3/4, both sides, interior dashboard (with odometer), engine bay, underbody if safely possible, close-ups of any flagged issues.
4. Mechanic marks each rubric item as Pass / Note / Fail / N/A and writes a 1-2 sentence note for every Note or Fail.
5. Mechanic gives the buyer a plain-language verbal summary at the end (e.g., "good overall; brake pads will need replacement soon").
6. Mechanic does **not** tell the seller what to price the car at.

### After the inspection

1. Mechanic fills the PDF template by hand or by typing into the template file.
2. Mechanic sends the completed PDF + rubric + photos to the coordinator within 24 hours.
3. Coordinator sends the PDF report to the buyer.
4. Coordinator sends the buyer the feedback questionnaire (see Metrics below).
5. Coordinator records the result in the pilot log.

---

## What to measure

Record every data point in a single spreadsheet or note. Do not rely on memory.

### Demand and funnel metrics

| Metric | How to count | Why it matters |
|---|---|---|
| **Buyer offers made** | Number of friendly buyers who said yes to a free inspection | Real-world uptake from interested buyers |
| **Seller acceptances** | Number of sellers who agreed | Seller-side friction |
| **Inspections completed** | Number of inspections where mechanic filled a rubric | Pilot throughput |
| **Drop-off reason** | Why each buyer/seller/mechanic did not complete | Qualitative input for go/no-go |

### Buyer feedback metrics

Ask every buyer after they receive the report:

1. Did the report change your decision about this car? (yes / no / still deciding)
2. If yes, how? (bought / negotiated price down / walked away / other: ___)
3. Was anything in the report surprising?
4. Would you have paid for this inspection if it cost **200 TMT** (~$23)? (yes / no / maybe)
5. Would you have paid for this inspection if it cost **500 TMT** (~$57)? (yes / no / maybe)
6. Would you recommend AutoTM's inspection to a friend buying a car? (0-10 scale)
7. What was the main reason you did or did not find the inspection useful?
8. What would make the report more useful?

> **Note on price points:** 200 TMT and 500 TMT are learning probes, not the final Phase 2 pricing. Use them to map the demand curve; see [`business/inspection-program.md`](../business/inspection-program.md) for the planned seller-paid / buyer-paid tracks.

### Mechanic feedback metrics

Ask the mechanic after every 2-3 inspections:

1. Was the rubric clear enough to follow?
2. Were there items you could not check due to time, tools, or car access?
3. Did you feel pressure from buyer or seller to inflate or soften findings?
4. How long did the inspection actually take?
5. What would make this faster or easier?

### Report outcome metrics

For each completed inspection, record:

- Make / model / year
- Asking price
- Highest-severity finding (Pass only / minor wear / moderate issue / safety issue)
- Whether the buyer's decision changed
- Whether the buyer would pay 200 TMT
- Whether the buyer would pay 500 TMT
- Would-recommend score (0-10)

---

## Case-study template

Write 3-5 anonymized case studies. Replace real names and identifying details. Each case study should fit on one page.

```markdown
## Case study #N — [Anonymized label, e.g., "2016 Camry, Aşgabat"]

**Situation:** Buyer was considering a [year make model] listed at [price]. They had [seen the car once / not yet seen it / were comparing two cars].

**Inspection:** Mechanic inspected the car at [location type: seller's home / public lot / etc.] on [date]. Inspection took [minutes].

**Key findings:** [2-4 bullet summary; e.g., "No accident signs; brake pads at ~20%; check-engine light traced to O2 sensor; tires matched front, mismatched rear."]

**Buyer decision:** [Bought / negotiated price down by X / walked away / still deciding].

**Would-pay signal:** [200 TMT yes/no/maybe; 500 TMT yes/no/maybe].

**Would-recommend:** [0-10].

**Buyer quote (anonymized):** "[One sentence that captures their reaction.]"

**What we learned:** [One sentence tying this case to the pilot's go/no-go question.]
```

---

## Go/no-go input format for the betting table

After the pilot, produce a one-page summary in this exact format. The betting table uses it to decide whether to fund the Phase 2 inspection program.

```markdown
## S9b concierge pilot — go/no-go input

**Pilot dates:** [start] → [end]
**Inspections completed:** N / target 5-10
**Case studies written:** N / target 3-5

### Demand summary
- Friendly buyer offers made: N
- Seller acceptances: N / seller refusals: N
- Inspections completed: N

### Buyer willingness-to-pay
- Would pay 200 TMT: N / %
- Would pay 500 TMT: N / %
- Average would-recommend score: X / 10

### Decision impact
- Decision changed by report: N / %
- Of those: bought / negotiated / walked away: N / N / N

### Top qualitative objections
1. [objection from buyers or sellers]
2. [objection]
3. [objection]

### Mechanic feedback (one paragraph)
[Was the rubric usable? Did the mechanic feel independent? Any pressure or bribery risk?]

### Recommendation
- [ ] **Go** — pilot data supports building the Phase 2 inspection program.
- [ ] **No-go** — demand or operational risks are too high; do not build inspection ops now.
- [ ] **Pivot** — inspection demand exists, but the shape should change: [describe].

### Open questions before build
1. [e.g., liability insurance cost in TM]
2. [e.g., realistic inspector hiring pipeline]
3. [e.g., seller-paid vs buyer-paid model]
```

---

## Safety and ethics

These rules are non-negotiable. Violating any of them ends the pilot.

1. **No payment collection from buyers or sellers.** The pilot is free. Do not accept cash, transfers, or promises of future payment.
2. **No warranty promise.** The report is an opinion based on a point-in-time visual check. It does not guarantee the car.
3. **No legal or insurance promise.** AutoTM is not a licensed inspection body in this pilot.
4. **No pressure tactics.** Buyers can walk away. Sellers can refuse. No one is penalized for opting out.
5. **No in-app demand prompt, and no manufactured interest.** [ADR-0057](../../adr/0057-defer-the-in-app-inspection-demand-signal.md) removed the S9a "Request AutoTM inspection" fake door, so the pilot measures demand only from the metrics above. If a later ADR brings an in-app signal back, it must say "coming soon" or equivalent and record real interest.
6. **No conflict of interest.** The mechanic must not be related to sellers, flipping cars, or working for a competing marketplace.
7. **Data privacy.** Store buyer/seller names and phone numbers only in the coordinator's secure notes, not in public case studies.
8. **Safety first.** If a car is unsafe to inspect (e.g., lifted improperly, hostile location), skip it and record why.

---

## What this runbook does not do

This runbook intentionally does **not**:

- Create S9b execution issues, milestones, or sprints in the issue tracker.
- Create deployment or on-site cutover work (that remains a separately shaped deployment sprint).
- Create code, schemas, or bounded-context work for #216, #217, or any other issue.
- Build the full `reports/` bounded context ([ADR-0001](../../adr/0001-architecture.md)).
- Introduce payments, tier badges, inspector hiring ops, or warranty terms.

When S9b triggers, the coordinator follows this runbook and records outputs. The full Phase 2 inspection program is only funded if the betting table accepts the go/no-go input.

---

## References

- [`sprints/sprint-09-trust-wedge.md`](../sprints/sprint-09-trust-wedge.md) — S9a DoD + S9b outline
- [`business/inspection-program.md`](../business/inspection-program.md) — Phase 0 pilot + full program strategy
- [`business/README.md`](../business/README.md) — competitive context
- [`../00-vision.md`](../00-vision.md) — anti-goals, especially no test-drive scheduling and no escrow
- [ADR-0037](../../adr/0037-trust-inspection-competitive-wedge.md) — trust wedge rationale
- [ADR-0057](../../adr/0057-defer-the-in-app-inspection-demand-signal.md) — no in-app inspection demand signal; the pilot measures demand
- [ADR-0020](../../adr/0020-document-hierarchy-and-mutability.md) — doc mutability rules
- [ADR-0019](../../adr/0019-context-md-describes-current-state.md) — CONTEXT.md current-state rule
