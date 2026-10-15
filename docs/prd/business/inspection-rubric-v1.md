# Inspection rubric v1 and pilot report template

> 2026-10-14 scope note: this is the historical S9b concierge-pilot input, not the approved checklist for the center service. The new proposal is center-based at every stage, initially one own center in Aşgabat. Neither this 54-item pilot rubric, the separate 36-item mechanic capability PDF nor the body-map worksheet establishes final mechanical scope. Center staff must validate checks, equipment and wording. [Feature 50](../features/50-reports-tier.md) owns the software target and [inspection strategy](inspection-program.md) separates first launch from scaling. Historical pilot instructions below do not authorize traveling inspectors, live bookings or published claims for the new service.

> **Status:** S9a pilot artifact for S9b free concierge inspections.
> **Scope:** Manual, hand-filled inspections only. No paid product, no warranty, no insurance promise, no legal title verification, no software implementation.
> **Owner:** Founder or trusted helper plus one pilot mechanic.
> **Review required before S9b:** A founder and a consulting mechanic must sign off that the checks are realistic for a 45-75 minute used-car inspection in Turkmenistan.

This document is the working rubric for the S9b concierge inspection pilot described in [`sprint-09-trust-wedge.md`](../sprints/sprint-09-trust-wedge.md) and [`87-concierge-pilot-runbook.md`](../ops/87-concierge-pilot-runbook.md). It exists to test whether real buyers value an independent AutoTM inspection before AutoTM builds the full Phase 2 reports product.

It is deliberately simple: print it, fill it by hand, take photos, and send the buyer a plain report. The later Phase 2 product may replace this with an inspector app, server-generated PDFs, QR verification, paid booking, tier badges, and report storage. None of that is promised here.

## How to mark items

Every item must be marked with exactly one result:

| Result | Meaning |
|---|---|
| **Pass** | Checked and no meaningful concern found for the car's age, mileage, and market category. |
| **Note** | Wear, uncertainty, maintenance need, cosmetic issue, or buyer-relevant observation that is not a clear failure. |
| **Fail** | Safety issue, major defect, mismatch, leak, warning sign, suspected tampering, or repair need that should materially affect the buyer's decision. |
| **Not checked** | Could not be checked safely, legally, or within the pilot's equipment/time limits. Must include a reason. |

For every **Note**, **Fail**, or **Not checked**, write a short plain-language note. For every **Fail**, take at least one close-up photo if visible.

## Pilot scoring guidance

This scoring is for the pilot report's summary only. It does **not** create public AutoTM tier badges and does **not** bind the future Phase 2 scoring model.

| Summary rating | Rule of thumb | Buyer-facing wording |
|---|---|---|
| **Strong candidate** | 0 Fail items, 0-5 Note items, no safety-critical concern, no serious OBD-II concern. | "No major issues found in this pilot inspection. Review normal wear notes before buying." |
| **Candidate with reservations** | 0-2 Fail items or 6-12 Note items, no unresolved safety-critical concern. | "Potentially buyable, but negotiate or verify the flagged issues first." |
| **High-risk candidate** | 3+ Fail items, any safety-critical Fail, suspected mileage/VIN/document mismatch, or serious drivetrain/structural concern. | "Do not proceed without an independent workshop check and price adjustment." |
| **Incomplete inspection** | More than 10 Not checked items, no test drive, no VIN/document check, or weather/location prevents meaningful inspection. | "This inspection was too limited for a reliable recommendation." |

Safety-critical Fail examples: brake hydraulic leak, severe tire damage, steering play that feels unsafe, frame/structural damage, overheating, transmission slipping, unresolved airbag/ABS warning, or VIN/document mismatch.

## Rubric checklist

### 1. Body and frame

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 1 | VIN plate and visible body stamping area show no obvious tampering, grinding, repaint over stamp, or mismatch with documents. | [ ] | [ ] | [ ] | [ ] | |
| 2 | Front bumper, grille, headlights, and hood alignment are even and do not suggest unrepaired front impact damage. | [ ] | [ ] | [ ] | [ ] | |
| 3 | Rear bumper, trunk/hatch, taillights, and rear panel gaps are even and do not suggest unrepaired rear impact damage. | [ ] | [ ] | [ ] | [ ] | |
| 4 | Left and right side panel gaps are reasonably consistent across doors, fenders, and quarter panels. | [ ] | [ ] | [ ] | [ ] | |
| 5 | Roof pillars, rocker panels, and visible structural seams have no obvious deformation, heavy filler, cracking paint, or poor repair signs. | [ ] | [ ] | [ ] | [ ] | |
| 6 | Paint condition is consistent enough that obvious repaint, mismatched panels, overspray, or sanding marks are documented. | [ ] | [ ] | [ ] | [ ] | |
| 7 | Glass, mirrors, windshield, and lights have no major cracks, water intrusion, loose mounting, or unsafe visibility issue. | [ ] | [ ] | [ ] | [ ] | |
| 8 | Door, hood, trunk/hatch, and fuel door open, close, latch, and seal normally. | [ ] | [ ] | [ ] | [ ] | |
| 9 | Visible rust on body, under door edges, wheel arches, trunk floor edge, and underbody is absent or minor for vehicle age. | [ ] | [ ] | [ ] | [ ] | |

### 2. Engine bay and fluids

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 10 | Engine starts cold or warm without abnormal delay, heavy smoke, rough knocking, or repeated stalling. | [ ] | [ ] | [ ] | [ ] | |
| 11 | Idle is stable after startup with no severe vibration, misfire feel, or abnormal engine noise. | [ ] | [ ] | [ ] | [ ] | |
| 12 | Engine oil level and visible condition are acceptable, with no obvious metal particles, fuel smell, or sludge on cap/dipstick. | [ ] | [ ] | [ ] | [ ] | |
| 13 | Coolant level and visible condition are acceptable, with no oil contamination, rust sludge, or strong overheating evidence. | [ ] | [ ] | [ ] | [ ] | |
| 14 | Brake fluid level and visible condition are acceptable, with no obvious contamination or critically low level. | [ ] | [ ] | [ ] | [ ] | |
| 15 | Power steering fluid, transmission fluid dipstick if present, washer fluid, and other accessible reservoirs are checked for level/leaks. | [ ] | [ ] | [ ] | [ ] | |
| 16 | Engine bay has no active oil, coolant, fuel, or brake-fluid leak visible during inspection. | [ ] | [ ] | [ ] | [ ] | |
| 17 | Belts, hoses, radiator, visible fan, and accessible wiring are not cracked, loose, cut, swollen, or poorly repaired. | [ ] | [ ] | [ ] | [ ] | |
| 18 | Exhaust smoke after warm-up is normal: no persistent blue smoke, heavy white smoke, or excessive black smoke. | [ ] | [ ] | [ ] | [ ] | |

### 3. Transmission and drivetrain

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 19 | Automatic transmission engages Drive and Reverse without harsh shock, long delay, or abnormal noise. | [ ] | [ ] | [ ] | [ ] | |
| 20 | Manual clutch take-up, pedal feel, and gear engagement are acceptable, with no obvious slipping or grinding. | [ ] | [ ] | [ ] | [ ] | |
| 21 | Gear changes during low-speed and normal acceleration are smooth enough for vehicle type and age. | [ ] | [ ] | [ ] | [ ] | |
| 22 | No transmission slipping, flare, shudder, or warning light appears during the test drive. | [ ] | [ ] | [ ] | [ ] | |
| 23 | CV joints, driveshafts, prop shaft, and axle boots show no obvious tears, grease leakage, or knocking on turns. | [ ] | [ ] | [ ] | [ ] | |
| 24 | Differential, transfer case if present, and visible drivetrain housings show no active leaks or abnormal noise. | [ ] | [ ] | [ ] | [ ] | |
| 25 | Four-wheel-drive or all-wheel-drive mode, if equipped and safely testable, engages without warning or abnormal noise. | [ ] | [ ] | [ ] | [ ] | |
| 26 | Parking brake holds the car under a basic safe test and releases normally. | [ ] | [ ] | [ ] | [ ] | |
| 27 | No drivetrain warning messages are present on the dashboard during startup and test drive. | [ ] | [ ] | [ ] | [ ] | |

### 4. Suspension, brakes, wheels, and tires

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 28 | Front suspension has no obvious excessive play, broken components, severe bushing wear, or unsafe looseness in a basic check. | [ ] | [ ] | [ ] | [ ] | |
| 29 | Rear suspension has no obvious excessive play, broken components, severe bushing wear, or unsafe looseness in a basic check. | [ ] | [ ] | [ ] | [ ] | |
| 30 | Shock absorbers/struts show no severe leakage, broken mounts, or unstable bounce behavior. | [ ] | [ ] | [ ] | [ ] | |
| 31 | Steering has no excessive free play, heavy pull, vibration, grinding, or unsafe looseness during static check/test drive. | [ ] | [ ] | [ ] | [ ] | |
| 32 | Brake pedal feel is firm enough and does not sink, pulse severely, or feel unsafe. | [ ] | [ ] | [ ] | [ ] | |
| 33 | Braking during test drive is straight and controlled, with no severe pull, grinding, vibration, or warning light. | [ ] | [ ] | [ ] | [ ] | |
| 34 | Brake discs/drums and pads/shoes, where visible without disassembly, do not show severe wear, cracks, or obvious damage. | [ ] | [ ] | [ ] | [ ] | |
| 35 | Tires have acceptable tread depth, even wear, no exposed cord, bulges, cuts, or unsafe age/damage signs. | [ ] | [ ] | [ ] | [ ] | |
| 36 | Wheels/rims, lug nuts, and spare tire/tool kit if present have no obvious safety issue or missing critical parts. | [ ] | [ ] | [ ] | [ ] | |

### 5. Electrical, lights, and interior

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 37 | Dashboard warning lights illuminate at key-on and expected safety/engine warnings turn off after startup. | [ ] | [ ] | [ ] | [ ] | |
| 38 | Headlights, high beams, brake lights, reverse lights, turn signals, hazard lights, fog lights if equipped, and license-plate lights work. | [ ] | [ ] | [ ] | [ ] | |
| 39 | Wipers, washers, horn, mirrors, windows, central locking, and basic switches work normally. | [ ] | [ ] | [ ] | [ ] | |
| 40 | Air conditioning/heater fan, temperature change, defrost, and basic ventilation operate enough for buyer use. | [ ] | [ ] | [ ] | [ ] | |
| 41 | Battery condition is acceptable by visual check/start behavior, with no loose terminals, heavy corrosion, or charging warning. | [ ] | [ ] | [ ] | [ ] | |
| 42 | Alternator/charging behavior appears normal by dashboard indicators and basic voltage check if equipment is available. | [ ] | [ ] | [ ] | [ ] | |
| 43 | Seats, seatbelts, headrests, and visible airbag covers are present and not obviously damaged or missing. | [ ] | [ ] | [ ] | [ ] | |
| 44 | Interior condition, odors, moisture, seat wear, trim damage, and signs of water intrusion are documented. | [ ] | [ ] | [ ] | [ ] | |
| 45 | Infotainment, rear camera/sensors if equipped, instrument cluster, and basic controls work or faults are documented. | [ ] | [ ] | [ ] | [ ] | |

### 6. VIN, documents, mileage, and test-drive observations

| # | Item | Pass | Note | Fail | Not checked | Mechanic note |
|---|---|---|---|---|---|---|
| 46 | VIN on documents matches visible VIN on the car and seller-provided listing data. | [ ] | [ ] | [ ] | [ ] | |
| 47 | Brand, model, year, engine, color, and body type match the documents and listing claim as far as visible. | [ ] | [ ] | [ ] | [ ] | |
| 48 | Mileage shown on odometer is recorded and does not obviously conflict with interior wear, service stickers, or seller statements. | [ ] | [ ] | [ ] | [ ] | |
| 49 | Ownership/registration documents were viewed for consistency only; no legal title guarantee is made. | [ ] | [ ] | [ ] | [ ] | |
| 50 | OBD-II scan, if available, completed and diagnostic trouble codes/readiness status recorded. | [ ] | [ ] | [ ] | [ ] | |
| 51 | Test drive includes startup, idle, low-speed maneuvering, acceleration, cruising, braking, steering, and parking if safe/legal. | [ ] | [ ] | [ ] | [ ] | |
| 52 | Test-drive handling feels stable: no severe pull, vibration, wandering, overheating, or unsafe noise. | [ ] | [ ] | [ ] | [ ] | |
| 53 | Seller claims about accident history, service history, number of owners, and known issues are recorded and compared with visible condition. | [ ] | [ ] | [ ] | [ ] | |
| 54 | Final buyer-relevant risks are summarized in plain language with recommended next step. | [ ] | [ ] | [ ] | [ ] | |

## Required photo checklist

Take normal overall photos even if no issue is found. Take close-ups for every Fail and material Note.

| Photo | Done | Notes |
|---|---|---|
| Front-left exterior angle | [ ] | |
| Front-right exterior angle | [ ] | |
| Rear-left exterior angle | [ ] | |
| Rear-right exterior angle | [ ] | |
| Dashboard with odometer visible | [ ] | |
| VIN plate/stamp area where safe/legal to photograph | [ ] | |
| Engine bay overall | [ ] | |
| Trunk/cargo area | [ ] | |
| Interior front seats and controls | [ ] | |
| Tire/wheel close-up, worst tire if uneven | [ ] | |
| OBD-II result screen if scan performed | [ ] | |
| Close-up of each Fail or material Note | [ ] | |

## Hand-filled pilot report template

Use this as the simple PDF/report structure for the S9b pilot. It can be copied into a document editor, exported as PDF, or printed and scanned. Keep the final report short enough that a buyer can read it in 5 minutes.

### Cover

| Field | Value |
|---|---|
| Report ID | S9B-[city]-[YYYYMMDD]-[number] |
| Inspection date/time | |
| Inspection location | |
| Buyer participant code | |
| Seller participant code | |
| Mechanic name / phone | |
| Coordinator name | |
| Vehicle | Brand / model / year / trim |
| VIN | |
| Odometer reading | |
| Listing URL or source | |
| Seller asking price | |
| Weather / lighting / inspection limits | |

### One-page summary

| Field | Value |
|---|---|
| Pilot summary rating | Strong candidate / Candidate with reservations / High-risk candidate / Incomplete inspection |
| Mechanic recommendation | Recommended / Recommended with reservations / Not recommended / Incomplete |
| Top 3 positives | 1.  2.  3. |
| Top 3 buyer risks | 1.  2.  3. |
| Immediate safety concern? | No / Yes: |
| Should buyer get a workshop check before purchase? | No / Yes: |
| Suggested negotiation points | |

### Rubric results summary

| Category | Pass count | Note count | Fail count | Not checked count | Main concern |
|---|---:|---:|---:|---:|---|
| Body and frame | | | | | |
| Engine bay and fluids | | | | | |
| Transmission and drivetrain | | | | | |
| Suspension, brakes, wheels, and tires | | | | | |
| Electrical, lights, and interior | | | | | |
| VIN, documents, mileage, and test-drive observations | | | | | |
| **Total** | | | | | |

### Issue notes

| Rubric item # | Result | What was found | Photo # | Buyer impact | Suggested next step |
|---|---|---|---|---|---|
| | Note / Fail / Not checked | | | | |
| | Note / Fail / Not checked | | | | |
| | Note / Fail / Not checked | | | | |
| | Note / Fail / Not checked | | | | |
| | Note / Fail / Not checked | | | | |
| | Note / Fail / Not checked | | | | |

### OBD-II notes

| Field | Value |
|---|---|
| Scan performed? | Yes / No |
| Scanner model | |
| Codes found | |
| Readiness monitors complete? | Yes / No / Unknown |
| Plain-language explanation | |
| Buyer next step | |

### Test-drive notes

| Field | Value |
|---|---|
| Test drive performed? | Yes / No |
| Approximate route / distance | |
| Startup and idle | |
| Acceleration | |
| Transmission behavior | |
| Steering and alignment | |
| Braking | |
| Noise/vibration/temperature | |
| Reason if not performed | |

### Limitations and non-promises

Include this text on every pilot report:

> This AutoTM pilot inspection is a point-in-time visual, functional, and basic diagnostic check performed for a free concierge pilot. It is not a warranty, insurance policy, legal title verification, accident-history guarantee, mileage guarantee, or workshop teardown. The mechanic did not dismantle the vehicle, lift it unless explicitly noted, open sealed components, verify hidden defects, or guarantee future reliability. Hidden mechanical, electrical, structural, legal, or mileage issues may still exist. The buyer remains responsible for the final purchase decision and may choose to obtain an independent workshop inspection before buying.

Additional non-promises:

- AutoTM does not guarantee that the seller owns the vehicle or has the legal right to sell it.
- AutoTM does not guarantee that documents are authentic beyond basic visual consistency checks.
- AutoTM does not guarantee that no prior accident, flood, mileage rollback, or major repair occurred.
- AutoTM does not promise buyer protection, refund, compensation, repair payment, or dispute resolution for this pilot.
- This report must not be advertised as a paid AutoTM inspection product or public trust badge.

### Buyer decision follow-up

Ask the buyer after they receive the report:

| Question | Answer |
|---|---|
| Did the inspection change your decision? | Yes / No / Not sure |
| Did you buy, reject, negotiate, or continue checking the car? | |
| Which finding mattered most? | |
| Would you have paid 200 TMT for this inspection? | Yes / No / Maybe |
| Would you have paid 500 TMT for this inspection? | Yes / No / Maybe |
| Would you recommend AutoTM inspection to a friend? | 0-10 |
| What was confusing or missing from the report? | |

### Mechanic/founder signoff

Before S9b use, complete this review:

| Check | Founder | Mechanic | Notes |
|---|---|---|---|
| Rubric can be completed in 45-75 minutes without a lift or teardown. | [ ] | [ ] | |
| Items are clear enough for a mechanic to mark consistently. | [ ] | [ ] | |
| The report is understandable to a non-mechanic buyer. | [ ] | [ ] | |
| Safety-critical failures are obvious and not buried in notes. | [ ] | [ ] | |
| The limitations text is included and not softened. | [ ] | [ ] | |
| Photo checklist is realistic on seller location. | [ ] | [ ] | |
| Pilot payment does not depend on a positive/negative result. | [ ] | [ ] | |

Signoff:

| Role | Name | Date | Signature / saved-message reference |
|---|---|---|---|
| Founder / coordinator | | | |
| Pilot mechanic | | | |

## Pilot storage notes

- Store the filled report, rubric photos, consent screenshots/messages, and buyer follow-up answers in a private folder controlled by the founder/coordinator.
- Do not publish participant names, phone numbers, VIN, address, or license plate in case studies.
- Use participant codes in public/internal summaries unless the participant explicitly approves attribution.
- Keep the raw pilot material long enough to write case studies and the go/no-go summary, then delete anything not needed for legal/accounting learning.

## Future Phase 2 notes

If the S9b pilot supports building the full inspection program, use this artifact as input only. The Phase 2 version should be reshaped into:

- A structured `RubricTemplate` and `InspectionReport` model.
- Inspector app workflow with required photos and offline tolerance.
- Server-generated PDF output with versioning.
- Public report verification and anti-forgery controls.
- A scoring model calibrated from real pilot findings and mechanic feedback.
