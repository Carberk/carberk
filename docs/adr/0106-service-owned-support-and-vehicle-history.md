# ADR-0106: Service-owned Support and Vehicle History preserve separate policies

- **Status**: Accepted
- **Date**: 2026-10-14
- **Deciders**: Carberk founder
- **Relationship**: Complements ADR-0001, ADR-0013, ADR-0032 and ADR-0042. Admits the bounded post-review service capability deferred by ADR-0027 without changing the original reviewer-release scope. Does not authorize new external provider egress or change existing analytics retention.

## Context

Listing Conversations are buyer/seller discussion about a Listing, unique for a buyer and Listing. Their access, blocking, suspension and Listing-availability rules are unsuitable for business assistance, restricted-user appeals and paid orders with an operator queue. The current Reports context captures physical-inspection interest; it does not sell provider-history reports. Physical diagnostic inspections and content moderation reports are distinct purposes.

The founder approved a 100 TMT available-provider history service, general Support and a bounded operator workspace. Provider rights, real payment methods and actual daily allowance are not established by supplied PDFs, account access or the stated 100/day allowance. Software preparation must remain useful without making paid external calls or promising unverified capacity.

The business objective is durable permitted vehicle/market knowledge and genuinely anonymized commercial insights. It does not imply unrestricted retention or sale of private chats, personal records, payment evidence, buyer-private diagnostic reports or licensed provider documents. The proposed blanket 90-day service and 24-month diagnostic purge was rejected; existing Support and analytics purpose-specific policies were not thereby revoked.

## Decision

Carberk implements separate Support and Vehicle History domain owners, sharing business-messaging and operator-workspace capabilities through explicit public ports while retaining purpose-specific case, order, access and retention policies.

Support owns assistance and appeals, its case lifecycle and response clock. Vehicle History owns enquiries, accepted quotes, verified payments, capacity commitments, provider fulfilment and delivery, refunds and licensed provider-artifact archive. Business messaging owns service-scoped communications, attachment association and read/delivery state; it does not decide whether a payment is verified, a report is usable or a case may be retained. Identity owns staff capability grants and sessions. Moderation, dealership membership, diagnostics and analytics retain their independent access boundaries. A named staff member may hold several explicit capabilities; marketplace admin status is not a universal private-record reader.

Existing Listing Conversation and Message definitions remain Listing-scoped. No fake Listing, buyer/seller account or InspectionInterest row represents a service request. An optional source Listing is context and cannot grant its seller or dealer access to private service data or change the confirmed order VIN. Physical diagnostic findings are not provider history, and neither creates a public quality guarantee.

The Vehicle History offer is 100 TMT for available Carfax or AutoCheck history, both when obtainable and either alone sufficient. Assigned operators select permitted archived or newly obtained artifacts. Delivered artifacts retain source and original date; standard copy does not promise a fresh/current pull. A usable PDF and shared link accompany delivered provider history. The customer may share provided artifacts where supplier rights permit. Public Listing publication is outside this service decision.

Durable vehicle and market records carry provenance, identifiability, permitted purpose, supplier/use/redistribution restrictions and retention/deletion controls. Retain them indefinitely only where rights and applicable obligations permit, otherwise for the longest justified permitted period. Personal links, contacts, service communications, payment evidence and restricted artifacts remain separately governed. VINs and reversible pseudonyms are not automatically anonymous. No raw customer-data sale, data sales portal or actual commercial disclosure is authorized. No unapproved fixed personal-data duration or indefinite private-chat default is introduced; fail closed for live collection when a required schedule or basis is absent.

Software and synthetic verification proceed before commercial activation. Provider connection, paid lookup, report redistribution/sample use, payments/refunds and public availability require their concrete documented agreement, authorization and operational evidence. Private storage, server-side capability and assignment checks, auditable transitions and deletion enforcement apply independently of client navigation. All operator/admin, analytics and inspection interfaces support Turkmen, Russian and English; original provider artifacts are preserved rather than invented translations.

## Consequences

### Positive

- Assistance/appeals remain available independently of a Listing and paid history orders cannot inherit marketplace chat rules accidentally.
- Shared transport and workspace components can be reused without merging service policy or granting technicians/moderators all private records.
- Synthetic preparation and manual adapter boundaries allow software progress while supplier and payment evidence is collected.
- Provenance and rights classification support a durable useful vehicle dataset without treating removal of names as anonymization.

### Negative / accepted costs

- Separate case/order schemas, capabilities, purpose-scoped storage and lifecycle jobs require new behavior and independent verification.
- Manual payment/provider fulfilment requires reconciliation of uncertain outcomes and measured staffing capacity.
- Supplier rights or a missing personal-data schedule can block live operation even after software is complete.
- Authorized downloads/shared links may be copied outside Carberk. In-app authorization cannot recall those copies or promise supplier-link permanence.

### Neutral

- Current inspection-interest capture and Listing Conversations retain their owners; their existing behavior is not evidence the new services are implemented.
- Existing General Support 90-day-after-closure/account-deletion policy and analytics schedules remain purpose-specific unless explicitly amended.
- No broad catalog editor, arbitrary seller edits, broadcasts, impersonation, hosting promotion or data sales tooling is included.

## Alternatives considered

- Add a special seller or fake Listing for Support/orders. Rejected because Listing safety/availability and identity contracts would conceal business ownership and block appeals.
- Put history sales in inspection-interest Reports. Rejected because expression of inspection demand, physical findings and licensed provider history are different domain purposes.
- Share one service policy for every business chat. Rejected because Support retention, order commitments, payment evidence and private diagnostic readership differ.
- Stop all software until commercial readiness. Rejected because explicit synthetic/manual boundaries allow reversible engineering progress without real collection or purchases.
- Retain every customer record forever or apply one blanket purge duration. Rejected because permitted durable vehicle knowledge and personal/private/provider records require different rights and obligations.

## References

- [Architecture](0001-architecture.md), [identity roles](0013-user-role-split.md), [account deletion](0032-account-deletion-grace-period.md), [glossary authority](0042-domain-glossary-authority-and-mutability.md).
- [Vehicle History](../prd/features/53-vehicle-history.md), [Support](../prd/features/54-support.md), [service flow](../prd/flows/68-service-requests.md), [workspace design](../prd/ui/service-workspace.md).
- [Listing Conversations](../prd/features/34-conversations.md), [bounded admin](../prd/features/40-admin.md), [physical reports](../prd/features/50-reports-tier.md).
- [Support #500](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/500), [admin #746](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/746).

- [Campaign parent #897](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897) and [portable synthetic service prototype](https://github.com/bagtyyarkovusov/auto.tm-rewrite/blob/4f1aebd826d898274e5ecdd31f18fcc51eb74178/output/campaign-review-20261014/service-workspace/index.html).
