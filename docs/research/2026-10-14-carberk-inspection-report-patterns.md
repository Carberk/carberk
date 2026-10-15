# Body panel report references

Research date: 2026-10-14. Primary provider samples only. These are providers' published examples, not independent proof of inspection quality or permission to reuse their artwork. No code or repository files changed.

## 1. Istanbul Garage, a directly readable panel-status example

Official sample page: https://www.istanbulgarage.com.tr/oto-ekspertiz-hizmetleri/oto-ekspertiz-raporu/

Original sample image linked from that page: https://www.istanbulgarage.com.tr/wp-content/uploads/2020/09/Oto-Ekspertiz-Sonuc-Raporu-2-1.png

Observed visually: a watermarked Ford Fiesta body/paint report with left side, right side, overhead, front and rear views. Boxes sit on named panels. Visible labels mean original, repainted, replaced, and plastic. The sample marks the hood and right front fender replaced, doors repainted, roof and trunk original. A notes field records findings beyond the diagram.

This is the closest simple reference for the founder's requested repaint/replacement map. The displayed material category for bumpers is not a condition verdict. Do not turn plastic into pass, or assume an original panel is free of scratches. The dated example is 2019 and uses generic artwork rather than a model-matched Fiesta drawing.

Downloaded image: /tmp/carberk-body-map-references/istanbul-body.png

## 2. Toyota Walton Motors, diagram linked to structured findings

Official sample page: https://inspection.toyotawalton.com/sample-report

Official detailed PDF: https://inspection.toyotawalton.com/assets/samples/sample-detailed-report.pdf

Official explanation: https://inspection.toyotawalton.com/blog/car-inspection-report-explained-score-pbx-marks

Downloaded and visually inspected PDF page 3. Its exploded diagram has colored letter markers and a separate findings table identifying panel, view, code, proposed action and inspector remarks. P describes paint/surface damage, B deformation, X cuts/cracks/missing parts. RP records repaint, RL replacement; numeric suffixes describe size. The legend also includes OK. Repaint history is distinguished from current damage. Its table can record an issue whose marker is difficult to locate, so the table is essential.

Limits: this is an explicitly published demo, not an actual customer's inspection. Its explanation and PDF disagree about some size thresholds. The PDF footnote describes levels 1 through 4 although the displayed code legend uses 1 through 3. Do not import its scoring or thresholds uncritically. The PDF was accessible with curl when the search fetcher timed out.

Downloaded PDF: /tmp/carberk-body-map-references/toyota-walton-detailed.pdf
Rendered body page: /tmp/carberk-body-map-references/toyota-walton-body.png

## 3. Otorapor, professional multi-page body inspection examples

Official sample collection: https://otorapor.com/ornek-oto-ekspertiz-raporlari

Direct provider images: https://otorapor.com/upload/gorseller/ornekrapor25/kaporta1.jpg and https://otorapor.com/upload/gorseller/ornekrapor25/kaporta2.jpg

The collection explicitly separates body, engine, mechanical, dynamometer, OBD and brake/suspension report examples. The first body sheet uses a multi-view drawing with handwritten findings. The second places callouts beside side-view panels. This demonstrates that a body map is one inspection section rather than a substitute for the whole mechanical report.

Access limit: the published images are low resolution. The root researcher visually inspected them; I verified the official collection and direct image links but cannot confidently transcribe every small legend label from the available resolution. Do not claim an exact Otorapor universal color legend from these images. Istanbul Garage provides the clearer status-label reference.

## Supplemental sources, with narrower authority

Loginet's own auction-sheet explanation: https://www.logi-net.com/learn-with-us/inspection-sheet. It explains scratch, dent, repaint, corrosion and replacement codes. This is an exporter explaining auction documents, not the auction house defining a universal standard. Its text groups X/XX together in one place, so it is insufficient authority for a precise replacement distinction.

VehReports software sample supplied by the root researcher: https://vehreports.com/assets/sample-condition-report-car.pdf. Root observed a five-view numbered damage map on page 4. Treat it as a condition-report software/rental workflow example, not independent vehicle certification. This agent's search fetcher could not access the PDF.

## Proposed lessons for Carberk, not settled decisions

Use stable named panels and multiple views, with a table that remains usable without the illustration. Store condition findings separately from observed repaint/replacement history, plus optional paint-thickness readings with units, notes and evidence photos. Allow unknown and not checked; never default unmarked panels to original or undamaged. Marking one door repainted cannot establish accident cause, structural safety or hidden history.

Avoid color-only encoding. Use localized text labels and distinguish current damage from repair history. Use model/body-style-appropriate owned or licensed drawings, with fallback panel lists. A damage marker needs a panel ID and finding ID, not just image coordinates.

Separate report audiences. Buyer-commissioned inspection can remain private. Public attachment to a private or dealer Listing should require a separately recorded publication decision and vehicle match. Paying for the inspection does not itself establish permission to publish another person's contact/documents. The public PDF should omit private customer details, while a controlled customer copy may contain agreed details. These are recommendations to grill, not requirements confirmed by the user.


## Turkey: different business models, checked 14 October 2026

- [OTORAPOR's own service description](https://otorapor.com/oto-ekspertiz-uzmanligi) describes an inspection service and says it does not broker or buy/sell cars. Its operational roles include reception creating work orders, technicians and a foreman explaining results. These are provider statements, not independent verification of quality.
- [sahibinden Oto360 inspection](https://www.sahibinden.com/oto360/oto-ekspertiz) describes purchase of inspection packages delivered by partners, with the marketplace acting as intermediary. Search-index text was accessible; direct fetch returned HTTP 429. Do not assume its current exact checkout or report permissions were tested.
- [arabam.com Trink Sat help](https://www.arabam.com/yardim/trink-sat) describes an offer based on seller-entered condition, an appointment and inspection, and a revised offer when findings differ. This is a vehicle acquisition model, distinct from selling a neutral inspection to a buyer.
- These sources do not establish a universal Turkish rule allowing a second buyer to access a previous buyer's privately commissioned report. Do not infer publication rights from inspection payment or from the presence of a report-query page.

## Additional inspected visual references

- [RAC advanced inspection sample](https://www.rac.co.uk/pdfs/vehicle-inspections/advanced-report.pdf) has bodywork narrative, named panels, measurements discussed in context and finding photographs. Paint and securing-bolt observations support the engineer's interpretation in that sample. Carberk should preserve observations and evidence separately from an accident-history assertion.
- [vehReports sample condition report](https://vehreports.com/assets/sample-condition-report-car.pdf), page 4, has five exterior views and numbered damage/type markers. Later sections hold finding details and photos. This is a first-party software demonstration for rental handover, not a pre-purchase certification or independent proof of the vendor's reliability. Do not copy rental liability rules, legal thresholds, severity scoring or branding.

## Carberk audience direction and remaining policy

Founder agreed to the two-audience recommendation in the subsequent PRD-update request. The following details remain shaping proposals, with the canonical target now in features 50/51 and flow 66. No production behavior is established here. One technical inspection workflow records the intended audience at intake:

1. Buyer private inspection. Buyer commissions the service, vehicle owner authorizes physical access, and the report is accessible to the buyer and assigned authorized staff. A seller, dealer member or subsequent buyer does not gain access through listing ownership. Do not reveal the private inspection's existence in public listing metadata.
2. Seller/dealer listing inspection. Seller authorizes publication before work starts. All findings, limitations and later corrections appear together in the public report; no selecting favorable panels. Public readership is free. Commissioning the inspection may have the center's agreed service fee. Free dealer access remains unchanged.

Example: buyer A commissions private report and walks away. The completed service was delivered, so not buying alone is not a proposed refund trigger. B does not receive A's report. B may order a fresh private inspection with owner authorization. A seller who wants a public report can book a listing inspection. The first version can omit private-to-public conversion. If conversion is later allowed, require explicit commissioner release, seller authorization, staff review, current identity/date/mileage and unchanged full findings. Reusing an existing inspection snapshot must not be represented as a new inspection.

Inspection state and audience must be separate. A published/final private report is finalized for its authorized audience, not publicly discoverable. Invoice payer, requester, vehicle owner, listing owner and report audience are distinct fields. Public routes, PDF downloads and evidence image URLs need the same audience enforcement. Never put private reports behind a publicly guessable link. Prototype role switches do not provide that security.

When damage, repairs, mileage change or elapsed time warrant a new inspection remains an operational decision. Always show recorded date and mileage; do not promise a validity period before center approval. New inspections and corrections preserve history and link superseded versions appropriately within authorized visibility.

## Original printable review artifact

`output/pdf/carberk-kuzow-barlag-kartasy-tk.pdf` is a two-page Turkmen paper worksheet. Five original schematic vehicle views, a text legend, numbered finding references, measurement/evidence fields and mechanic feedback prompts. All areas start unassessed. No real diagnosis or accident claim is present. It supplements the earlier 36-item capability checklist. Both pages rendered and visually checked. Mechanic and fluent Turkmen terminology review still needed. The staff portal has not yet received the diagram editor or private/public permissions.

Suggested digital interaction: choose vehicle side/view and named panel, add one or several findings, record current damage separately from repair evidence, link overview/close-up photos and measurement context. Keep a textual panel picker for small screens and a list equivalent to the map. Stable finding IDs connect portal, buyer reader and PDF. Colors may help but text codes and numbers carry meaning in monochrome printing. Clear/normal, finding, not checked and not applicable need explicit assessment values; an unmarked map is not a clean bill of health.


## Center-only correction

The founder clarified that the larger inspection-program document is the scaling plan. Preserve future capacity/staff/branch strategy, separate from one-center launch. Cars are inspected at centers at every stage. The previous traveling-inspector assumption is rejected. Updated proposed PRDs are under docs/prd; research examples do not define service operations.
