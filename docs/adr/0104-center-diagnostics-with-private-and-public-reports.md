# ADR-0104: Center diagnostics preserve report audience and observation history

- **Status**: Accepted
- Date: 2026-10-14
- Decider: Carberk founder
- Relationships: Amends ADR-0037 manual-pilot-before-inspector-software sequencing and ADR-0057 inspection-CTA restriction only for a real ready service. Preserves the fake-door prohibition, first-party data boundaries, paid-placement ban and ADR-0098 delivery.

## Context

The founder is preparing one center in Aşgabat and requests software delivery alongside mechanical validation. Earlier tier/scoring and traveling-inspector proposals do not describe this service. Buyer-private reports and seller-authorized public reports have different audiences. Payment, vehicle ownership and Listing ownership do not grant disclosure rights.

## Decision

Deliver one center-based service plan for personal/dealer vehicles, a responsive scoped staff workspace, versioned checklists/maps/evidence, immutable finalized reports, authorized readers and stored PDFs. Cars come to centers at every stage. Software work continues while the center is prepared; public requests require approved real equipment/checklist, price, duration, capacity, consent, staff and payment/refund process. Manual appointments and payment at the center are initial operations. Diagnosis is optional after ordinary Listing publication, never a new wizard gate.

Buyer-private reports belong to their recorded authorized audience, commissioning buyer and specifically authorized center staff. Sellers, dealer staff and later buyers gain no access through ownership/membership/known URL. No private-to-public conversion or private-report resale. Public Listing reports require recorded physical access and separate publication consent before inspection, observed identity matching, authorized review and complete findings. Public readership is free.

Assigned technicians author. Scoped reviewers finalize; public reports require a different qualified reviewer, private reports permit explicitly audited self-review by an authorized reviewer. Checklist managers publish future template versions. No scope grants full marketplace admin or analytics access. Privileged release/withdrawal requires current scoped elevated authority and audit. Removed staff lose access through stale sessions, sockets, downloads and evidence URLs.

Started work pins its checklist. Blank/unchecked is never Normal. Stable panel/finding IDs connect diagrams, text, measurements and photos; observed damage, repair evidence and supported history remain distinct. Material condition changes require a new physical inspection. Corrections create linked immutable successors with original observation date/mileage; new inspections record new observations. Identity/ownership changes require public association revalidation. Mask public identifiers and use documented manual matching when VIN is unavailable/nonstandard. Show date/mileage and limitations, never a guaranteed validity interval.

The complete authorized reader may release while PDF is pending/failed/retrying. PDF generation uses the same finalized snapshot and locale; retry does not create a new report revision. Withdrawal removes public access and available badges while preserving authorized history under the applicable retention/rights rules. Already downloaded copies cannot be silently revoked. Seller disputes use correction/reinspection, never selective fault deletion. Service failure escalates to correction/reinspection at company cost or founder refund decision; actual refund method is an activation input.

Results cards and Listing detail show a neutral localized "Inspection report available" action only for a currently available authorized public report. It opens complete findings and date/mileage. No quality/pass guarantee, green approval checkmark, grade, boost or private-report existence leak. Withdrawn/removed/unavailable associations lose the badge across reads and caches.

Retain permitted useful vehicle/market observations and genuinely anonymized insights indefinitely where lawful rights permit, otherwise for the longest justified permitted period. Separate personal linkage, intake/contact/chat/payment records, private reports, provider restrictions and dispute holds. No blanket 90-day service or 24-month inspection purge is approved. No raw customer sale, private-report commercial disclosure or data-sales portal. Provenance, permitted purpose, retention/deletion, identifiability and export restrictions must be enforceable before real collection or disclosure. Existing telemetry retention remains unchanged. VINs/pseudonyms are not inherently anonymous.

All staff/admin/reader/export interfaces support TK/RU/EN. Preserve original provider documents; generated translations retain findings/measurements and do not invent source translations.

## Consequences

Software preparation and real-service activation become separate gates. Identity/assignment/audience enforcement must cover API, storage, caches, metadata, PDF jobs and exports. Versioned history and long-term data rights need explicit classified records, not one global TTL or public bucket. The center must validate mechanics and terminology; synthetic samples are not certification. No Gold/Silver/Bronze, condition guarantee, traveling inspectors, online payment or automatic ranking advantage is introduced.

## Alternatives

Automatically publishing buyer-funded results confuses payment with disclosure. Creator/Listing ownership cannot authorize private reports. Mutable final reports erase evidence. Reusing InspectionInterest as booking advertises unavailable service. Blocking all software until center opening prevents independent preparation already requested.

## Acceptance

Exercise private Buyer A versus seller/Buyer B denial, public consent/matching, reviewer separation/audited private self-review, removal while working, template pinning, corrections/reinspection/history, PDF failure/retry/parity, withdrawal/badge invalidation and classified retention/export enforcement. Verify actual generated TK/RU/EN PDFs and protected delivery during final acceptance. Real request activation requires the separate operational inputs above.

## References

- docs/prd/features/50-reports-tier.md; 51-pdf-export.md; docs/prd/flows/66-diagnostic-inspection.md
- docs/prd/business/inspection-program.md; https://github.com/bagtyyarkovusov/auto.tm-rewrite/blob/4f1aebd826d898274e5ecdd31f18fcc51eb74178/output/campaign-review-20261014/README.md
- Founder final campaign decision record, 2026-10-14
