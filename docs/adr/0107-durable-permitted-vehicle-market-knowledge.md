# ADR-0107: Durable permitted vehicle and market knowledge

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Complements**: ADR-0023 first-party product analytics
- **Amends**: #605 and PRD 85 aggregate-retention planning only for genuinely non-identifying permitted vehicle/market business datasets

## Context

The founder wants a durable Turkmenistan vehicle-market knowledge base and lawful commercial anonymized insights. The final grilling rejected a blanket service/inspection purge and clarified that names and identifiable customer/contact records are not the commercial product. The prior analytics plan caps all aggregates at 24 months. Useful anonymous business knowledge needs a qualified retention class distinct from raw personal data, private service evidence and restricted provider material.

## Decision

Carberk retains genuinely anonymized, lawfully reusable vehicle/market business observations and statistics indefinitely where rights and applicable obligations permit, otherwise for the longest justified permitted period. This explicitly replaces the blanket 24-month aggregate limit only for registered qualified business datasets. Ordinary product and diagnostic aggregates remain 24 months; raw product events remain 90 days and individual diagnostics 30 days. Neither this decision nor the business objective creates indefinite personal/private/provider-data retention.

Before admission to the durable class, record provenance, allowed purpose/reuse/redistribution, source and derivation version, identifiability review, retention/deletion restrictions and destination/access controls. A pseudonym, hashed VIN, omitted name or small-group threshold alone does not establish anonymity. Prevent reasonable singling out, linkage, subtraction and repeated-query inference. Do not retain actor reverse mappings in commercial anonymous datasets. Failed rights or anonymization assessment excludes or quarantines the derivative until safe permitted use is established.

Optional self-reported age bands and coarse residence city/region may support named useful market questions after purpose, basis, notices, rights, minimization and age-related applicability review. Unknown/unprovided is valid. Raw account-linked demographics remain personal, restricted and deletable; exact retention and any profile persistence need explicit purpose justification before collection. Do not collect exact birth dates, addresses or continuous precise location merely to compute insights, infer private traits from photos/messages, or equate Listing/search market with residence.

Keep buyer-private inspections, private conversations/payment evidence and provider-licensed artifacts separate. Public access permission or source purchase does not establish commercial redistribution rights. VINs and rare vehicle histories require identifiability assessment. Personal deletion/withdrawal, private audiences and applicable provider restrictions remain enforceable through sources, reversible derivatives, exports and recovery copies. Genuinely anonymous lawful outputs may survive actor deletion only when no person can reasonably be identified and no source restriction requires removal.

This campaign delivers data foundations and controlled derivation with synthetic fixtures. It does not authorize a sales portal, actual sale/disclosure, live demographic collection, new paid license or bypass of operator/applicability gates. Any future commercial export requires its concrete schema, audience, rights and reidentification review before release.

## Consequences

### Positive

- Useful permitted market knowledge survives ordinary raw-event expiry.
- Commercial insight is separated from identifiable customer records and private/provider material.
- Optional coarse demographic analysis can be assessed against an explicit purpose.

### Negative / accepted costs

- Provenance, rights, anonymization and recovery controls require implementation and ongoing review.
- Rare vehicle/demographic combinations may need suppression or generalization that limits commercial usefulness.
- Unresolved rights or identifiability may prevent indefinite retention or resale of particular sources and derivatives.

### Neutral

- Existing raw analytics/diagnostic retention, deletion and first-party infrastructure remain.
- The earlier rejected blanket service/inspection durations are not reinstated; owning service specifications determine justified personal/private retention.
- No actual collection, service activation or commercial disclosure is approved by this record.

## Alternatives considered

- Keep the blanket 24-month aggregate cap. Rejected for qualified durable business knowledge by the founder's final direction.
- Keep every record indefinitely or sell raw customers. Rejected because the accepted commercial output is anonymous insight and rights still constrain sources.
- Treat hashes or five-person cells as automatic anonymity. Rejected because linkage and combined-query risks remain.

## References

- [ADR-0023](0023-first-party-product-analytics.md)
- [Measurement and market-data specification](../prd/ops/85-launch-analytics-plan.md)
- [Legal/data boundaries](../prd/ops/83-legal.md)
- [Collection requirements research](../research/2026-10-14-carberk-collection-requirements.md)
- [Existing analytics parent #602](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/602)
- [Campaign #897](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897), final founder-approved campaign scope, 2026-10-14.
