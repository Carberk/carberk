# ADR-0102: Pilot first-party scorecard and scoped diagnostic investigation

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Supersedes**: ADR-0027's broader-admin deferral only for the bounded pilot Improvement capability
- **Complements**: ADR-0023 first-party measurement

## Context

ADR-0023 selects first-party analytics; ADR-0027 defers the full admin dashboard. The founder approved core pilot measurement, a realistic-data Improvement walkthrough, separate aggregate/investigation permissions and audited detailed access. This requires a limited capability exception, not admission of the full admin backlog.

## Decision

Before real-user invitations, the admitted pilot requires the first-party core scorecard and self-hosted diagnostics specified in 85 and 81. Improvement includes Overview first, Journeys & returns and Reliability & fixes; scoped filters and a filter-preserving evidence drawer; seven completed UTC days versus the previous seven, Today separate and incomplete comparisons withheld. All admin and analytics workspaces support Turkmen, Russian and English, including navigation, screens, charts, filters, forms, validation, empty/loading/error/denied states and user-facing exports. Locale switching preserves authorized task/filter state and selects localized labels, number/date formats and export headings. Keep stable technical identifiers and original provider artifacts unchanged; identify source language rather than inventing translated originals. This final founder requirement supersedes the earlier Russian-only initial Improvement exception. Verify all three locales and affected layouts in consolidated acceptance.

Analytics access is founder-only initially, with separately enforced aggregate/investigation permissions and explicit audited later individual grants. Detailed pseudonymous timeline reads and narrowly scoped investigative exports require a reason and successful audit. This permission grants no private Message evidence access. Fixes reference existing GitHub issues with owner/status/evidence and human verification.

Retain ADR-0023's first-party architecture and exclusions. The shared feature event contract includes video within its approved phase; dealer/report extensions await their owning scopes. Broader admin/moderation/Support, BI exports, audit CSV and retention-management UI remain deferred or separately owned. No independent analytics platform, warehouse or automatic task/deploy/rollback system is introduced.

The first Google Play reviewer submission still excludes this capability. Broad default-on collection is a preference subject to applicable basis, required rights/disclosures, field limits and phase-specific storage/transfer readiness; no universal collection authorization is established by this decision.

Durable permitted vehicle/market knowledge and anonymous commercial insight follow the separate [ADR-0107](0107-durable-permitted-vehicle-market-knowledge.md). This dashboard decision does not independently change raw retention or private/provider rights.

## Consequences

### Positive

- The pilot has actionable product/reliability evidence without admitting the full admin dashboard.
- Permissions and audited investigation have explicit decision history.

### Negative / accepted costs

- Contract, permission, lifecycle and native/deployed evidence work is required before real-user readiness.
- Regional applicability may defer longitudinal measurement; founder preference alone cannot enable it.

### Neutral

- Existing moderation, account recovery, inspection-demand deferral and separate release authority remain.

## Alternatives considered

- Only infrastructure dashboards. Rejected because they do not answer the accepted marketplace questions.
- Full admin analytics platform or third-party product SDK. Not selected; the campaign is bounded and first-party.
- Unrestricted raw exports or staff-wide investigation. Rejected by the scoped access decisions.

## References

- [ADR-0023](0023-first-party-product-analytics.md)
- [ADR-0027](0027-mlp-beta-scope.md)
- [Parent #602](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/602)
- [Measurement specification](../prd/ops/85-launch-analytics-plan.md)
- [Diagnostics specification](../prd/ops/81-monitoring-alarms.md)
- [Approved interaction design](../prd/ui/analytics-improvement.md)
