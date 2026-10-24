# B1 kernel coverage at the held continuation checkpoint

This is an inventory of authored code and remaining work, not an activation checklist or a claim of accepted coverage. All six caller groups remain unintegrated by instruction. The source kernel is NOT READY for parent acceptance. The current registry has broader dependency guards than the approved exclusions permit. No production activation DDL is supplied.

## Finite operations

| Operations | Declared source writes | Server-derived effects currently authored | Remaining kernel obligation |
|---|---|---|---|
| listing_create/change/delete | listings | Current public-order association null/version increment; unused proof invalidation; sticky anchors | Exact DELETE cascades/SET NULL effects and all UPDATE-OF no-op combinations |
| member_create/replace/remove/eligibility | dealership_members | Negative user/OWNER slots, affected user footprint, proof invalidation, sticky membership identity changes | Concurrent absent-owner/replacement scenarios; role/status-specific completeness |
| business_eligibility | dealerships | Root business footprint and proof invalidation | Exact guard/exclusion coverage |
| account_schedule/restore | users.deletionScheduledAt only | Retained subject graph and proof invalidation; no ownership transition for temporary eligibility | Mandatory invalidation for effective OLD/NEW combinations beyond the declared tuple |
| account_purge | Finite insert/update/delete table allowlists in diagnostic_source_allows | Dependency lock union, existing ownership-disposer composition, anchor erasure | Complete server-derived cleanup/attribution/FK effects instead of caller-declared plans |
| order_create/change | Orders, assignments, audit; declared center/template/bootstrap inserts | NEW-order shell; proof invalidation and sticky order identity transition | Derive center/template/bootstrap effects instead of requiring arbitrary child plans |
| observation_append | Order update, raw/component/audit INSERT | Narrow observed-identity initialization; first-slot claim/seal; live-state completion | Full mutation/expiry/revoke race matrix |
| ownership_grant/revoke/expire | Grants/components/proofs/requests/audit as enumerated | Existing authenticated source guards retained; disposal wrapper clears anchors | Complete derived proof/request disposal effects and use-time race scenarios |
| report_change | Reports/audit | Retained report/proof closure and invalidation | Mandatory audit/lineage/cascade derivation |
| proof_issue/consume/expire | Proof/request/report/audit as enumerated | Both endpoint discovery; existing SQL authority/atomicity retained | Complete derived request cascades, audit requirements and consumed-payload disposal matrix |
| identity_material_change | Order/raw/evidence/provenance/audit | Material closure and raw/component anchor erasure hooks | Existing disposer effect coverage across all retained material |
| staff_eligibility/session_change | Enumerated staff/assignment/center/template or Session/TOTP tables | User/Session/qualification dependency keys; unused-proof invalidation | Campaign-only Session creation exclusion and qualified bootstrap coverage |

## Future caller groups and exclusions

| Group | Existing entrypoints | Kernel connection | Required caller phase / excluded campaign prelude |
|---|---|---|---|
| 1 DB/schema | New DB module, migration, retained mirror, schema/profile/static inventory | Authored; direct INSERT preparation, DELETE completion, deferred live-state checks | Parent kernel acceptance missing; no activation |
| 2 Identity/account | Account UoWs, DeleteMe/RecoverAccount, PrismaBusinessRepository, Session/TOTP/Staff/User repositories | account/member/business/session/staff operations; root subjects and dependencies | All callbacks/receipts/authority checks unmodified. Ordinary invitation/settings/display-name/Session-create need a separate persisted-ownership campaign prelude, which is NOT authored |
| 3 Listing/admin | PrismaListingRepository, PublishListing, moderation outer transactions and supplied-tx adapters | listing/account operations | No caller edits. Scalar price/media/favorite/view operations remain excluded by design; dependency registry currently guards too broadly and must be narrowed before activation. All campaign-trigger paths need the same complete prelude |
| 4 Diagnostics | Intake/capture/grants/bindings/authority/reports/proofs/evidence/campaign admission | order/observation/grant/report/proof/material operations; center/template total suborder | No caller edits. Center/bootstrap derived effects and exact request/audit cascades incomplete |
| 5 Dependencies/worker | Measurement bootstrap/capture; service messaging; account purge and three erasure writers; artifact disposal | Service/video/collector/TOTP physical key map and root-only dependency discovery | No opposing-order caller changes. Real service actor union, upload work, collector and attribution-null effects need complete mandatory derivation. Lease-only/scalar dependency writes must retain their exclusions |
| 6 Fixtures/bootstrap/admission | Staff and synthetic center bootstrap; existing legitimate HTTP fixtures; domain/adapter/SQL automatic admission | New real-SQL fixture suite only | Complete caller fixture batch unstarted. Existing automatic201 unchanged and CLOSED. Actual authenticated seller/current OWNER grants remain required. SQL fixtures do not establish customer consent |

## Physical table/key/trigger/FK inventory

Namespaces use the two-int advisory API. Each table has a separate first-int namespace; signed second-int hashes are deduplicated and numerically sorted. JSON arrays/objects encode PK/unique/OWNER slots. Existing campaign locks retain their single-bigint namespace. The registry's references include actual Prisma FK mappings plus explicit scalar retained/video graph edges. Catalog/reference tables are excluded from this source kernel; no catalog mutation is authorized.

All registered tables currently receive dormant presence/effective-row/TRUNCATE guards except anchors, whose specialized guards remain active. This broad installation is a known acceptance gap for dependency-only and ordinary excluded writers. Effective-row checks run AFTER ROW to observe all BEFORE-trigger changes. That differs from the design's requested BEFORE ROW ordering and needs parent review before acceptance.

| Rank | Table | Exact PK columns | Two-int namespace | Graph/FK endpoints used in discovery |
|---|---|---|---|---|
| 1 | `users` | `id` | 897100 | avatarUploadId → media_uploads(id); suspendedById → users(id) |
| 2 | `dealerships` | `id` | 897200 | none |
| 3 | `dealership_members` | `id` | 897300 | dealershipId → dealerships(id); userId → users(id) |
| 4 | `listings` | `id` | 897400 | pendingVideoGenerationId → video_generations(id); activeVideoGenerationId → video_generations(id); businessId → dealerships(id); sellerId → users(id) |
| 4 | `listing_drafts` | `id` | 897401 | businessId → dealerships(id); userId → users(id) |
| 5 | `inspection_orders` | `id` | 897500 | centerId → diagnostic_centers(id); templateVersionId → diagnostic_template_versions(id); commissionerId → users(id); listingId → listings(id) |
| 6 | `diagnostic_reports` | `id` | 897600 | orderId → inspection_orders(id); templateVersionId → diagnostic_template_versions(id); predecessorId → diagnostic_reports(id); identityRecordId → diagnostic_identity_records(id); identityEvidenceId → diagnostic_identity_evidence(id) |
| 7 | `diagnostic_centers` | `id` | 897700 | none |
| 7 | `diagnostic_template_versions` | `id` | 897701 | centerId → diagnostic_centers(id); publishedById → users(id) |
| 7 | `diagnostic_center_assignments` | `id` | 897702 | centerId → diagnostic_centers(id); userId → users(id) |
| 7 | `diagnostic_order_assignments` | `id` | 897703 | orderId → inspection_orders(id); userId → users(id) |
| 7 | `staff_grants` | `userId`, `capability` | 897704 | userId → users(id) |
| 7 | `sessions` | `id` | 897705 | userId → users(id) |
| 7 | `totp_enrollments` | `id` | 897706 | userId → users(id) |
| 7 | `totp_backup_codes` | `id` | 897707 | totpEnrollmentId → totp_enrollments(id) |
| 8 | `diagnostic_continuity_proofs` | `id` | 897800 | predecessorReportId → diagnostic_reports(id); candidateOrderId → inspection_orders(id); predecessorOrderId → inspection_orders(id); issuerId → users(id); linkingTechnicianId → users(id); issuerSessionId → sessions(id) |
| 8 | `diagnostic_continuity_requests` | `id` | 897801 | actorId → users(id); sessionId → sessions(id); orderId → inspection_orders(id) |
| 9 | `diagnostic_identity_records` | `id` | 897900 | orderId → inspection_orders(id); recordedById → users(id) |
| 9 | `diagnostic_identity_evidence` | `id` | 897901 | orderId → inspection_orders(id); identityRecordId → diagnostic_identity_records(id); supersedesId → diagnostic_identity_evidence(id); recordedById → users(id) |
| 9 | `diagnostic_identity_provenance` | `id` | 897902 | orderId → inspection_orders(id); createdById → users(id) |
| 9 | `diagnostic_ownership_grants` | `id` | 897903 | orderId → inspection_orders(id); listingId → listings(id); sellerId → users(id); commissionerId → users(id); grantorId → users(id); businessId → dealerships(id); membershipId → dealership_members(id); grantorMembershipId → dealership_members(id); sessionId → sessions(id) |
| 9 | `diagnostic_ownership_components` | `identityRecordId` | 897904 | grantId → diagnostic_ownership_grants(id); identityRecordId → diagnostic_identity_records(id); orderId → inspection_orders(id); sourceListingId → listings(id); sellerId → users(id); commissionerId → users(id); businessId → dealerships(id); membershipId → dealership_members(id); declaredById → users(id) |
| 9 | `diagnostic_source_anchors` | `orderId` | 897905 | orderId → inspection_orders(id); firstRecordId → diagnostic_identity_records(id) |
| 10 | `support_cases` | `id` | 898000 | customerId → users(id); assigneeId → users(id); sourceListingId → listings(id) |
| 10 | `vehicle_history_requests` | `id` | 898001 | customerId → users(id); assigneeId → users(id); sourceListingId → listings(id) |
| 10 | `service_conversations` | `id` | 898002 | supportCaseId → support_cases(id); historyRequestId → vehicle_history_requests(id) |
| 10 | `history_quotes` | `id` | 898003 | requestId → vehicle_history_requests(id) |
| 10 | `history_orders` | `id` | 898004 | requestId → vehicle_history_requests(id); quoteId → history_quotes(id) |
| 10 | `history_payments` | `id` | 898005 | orderId → history_orders(id) |
| 10 | `history_purchase_intents` | `id` | 898006 | orderId → history_orders(id) |
| 10 | `history_refunds` | `id` | 898007 | orderId → history_orders(id) |
| 10 | `history_bookings` | `id` | 898008 | orderId → history_orders(id) |
| 10 | `history_artifacts` | `id` | 898009 | none |
| 10 | `history_deliveries` | `id` | 898010 | orderId → history_orders(id); artifactId → history_artifacts(id); purchaseIntentId → history_purchase_intents(id) |
| 10 | `history_artifact_cleanup` | `artifactId` | 898011 | none |
| 10 | `service_attachments` | `id` | 898012 | conversationId → service_conversations(id); uploaderId → users(id) |
| 10 | `service_messages` | `id` | 898013 | conversationId → service_conversations(id); senderId → users(id); attachmentId → service_attachments(id) |
| 10 | `service_read_states` | `conversationId`, `userId` | 898014 | conversationId → service_conversations(id); userId → users(id) |
| 10 | `service_push_subscriptions` | `id` | 898015 | sessionId → sessions(id); deviceId → fcm_devices(id); conversationId → service_conversations(id) |
| 10 | `service_outbox` | `id` | 898016 | conversationId → service_conversations(id) |
| 10 | `service_erasure_fences` | `conversationId` | 898017 | conversationId → service_conversations(id) |
| 11 | `media_uploads` | `id` | 898100 | businessId → dealerships(id); userId → users(id) |
| 11 | `video_upload_sessions` | `id` | 898101 | userId → users(id); uploadId → media_uploads(id); listingId → listings(id) |
| 11 | `video_generations` | `id` | 898102 | listingId → listings(id); uploadId → media_uploads(id); sessionId → video_upload_sessions(id) |
| 11 | `video_process_work` | `generationId` | 898103 | uploadId → media_uploads(id); sessionId → video_upload_sessions(id); generationId → video_generations(id) |
| 11 | `video_grants` | `id` | 898104 | ownerUserId → users(id); ownerSessionId → sessions(id); listingId → listings(id); generationId → video_generations(id) |
| 11 | `video_cleanup_work` | `id` | 898105 | uploadId → media_uploads(id); sessionId → video_upload_sessions(id); generationId → video_generations(id) |
| 11 | `media_upload_cleanups` | `uploadId` | 898106 | uploadId → media_uploads(id) |
| 11 | `listing_media` | `id` | 898107 | listingId → listings(id); uploadId → media_uploads(id) |
| 11 | `diagnostic_evidence` | `id` | 898108 | reportId → diagnostic_reports(id) |
| 11 | `diagnostic_pdf_artifacts` | `id` | 898109 | reportId → diagnostic_reports(id) |
| 12 | `measurement_state` | `key` | 898200 | none |
| 12 | `measurement_principals` | `id` | 898201 | userId → users(id) |
| 12 | `measurement_visits` | `id` | 898202 | principalId → measurement_principals(id); linkedAccountId → measurement_principals(id) |
| 12 | `measurement_records` | `id` | 898203 | principalId → measurement_principals(id); visitId → measurement_visits(id) |
| 12 | `measurement_outbox` | `id` | 898204 | principalId → measurement_principals(id) |
| 12 | `measurement_investigation_exports` | `id` | 898205 | none |
| 12 | `measurement_rollups` | `key` | 898206 | none |
| 13 | `diagnostic_audits` | `id` | 898300 | centerId → diagnostic_centers(id); orderId → inspection_orders(id); actorId → users(id) |
| 13 | `service_audits` | `id` | 898301 | actorId → users(id) |
| 13 | `audit_logs` | `id` | 898302 | actorId → users(id) |
| 13 | `dealership_invitations` | `id` | 898303 | dealershipId → dealerships(id); recipientUserId → users(id) |
| 13 | `owned_vehicles` | `id` | 898304 | userId → users(id); dealershipId → dealerships(id) |
| 13 | `blocked_users` | `id` | 898305 | blockerId → users(id); blockedId → users(id) |
| 13 | `favorites` | `id` | 898306 | userId → users(id); listingId → listings(id) |
| 13 | `saved_searches` | `id` | 898307 | userId → users(id) |
| 13 | `conversations` | `id` | 898308 | businessId → dealerships(id); listingId → listings(id); buyerId → users(id); sellerId → users(id) |
| 13 | `conversation_participants` | `id` | 898309 | conversationId → conversations(id); userId → users(id) |
| 13 | `messages` | `id` | 898310 | conversationId → conversations(id) |
| 13 | `fcm_devices` | `id` | 898311 | userId → users(id) |
| 13 | `notification_history` | `id` | 898312 | userId → users(id) |
| 13 | `notification_preferences` | `id` | 898313 | userId → users(id) |
| 13 | `verified_contact_phones` | `id` | 898314 | sellerId → users(id) |
| 13 | `otp_requests` | `id` | 898315 | userId → users(id) |
| 13 | `content_reports` | `id` | 898316 | reporterUserId → users(id); reviewedById → users(id) |
| 13 | `inspection_interests` | `id` | 898317 | listingId → listings(id); requesterUserId → users(id) |
| 13 | `business_enquiry_audits` | `id` | 898318 | conversationId → conversations(id) |

## Authored executable PostgreSQL scenarios

`packages/db/tests/diagnostic-source-kernel.e2e.spec.ts` deploys actual migrations into the existing hosted Testcontainers pattern. It was not executed locally. It contains 20 test cases after parameter expansion. No test timeout/configuration was changed. New lock barriers query `pg_blocking_pids` with an unchanged five-second bound. Queries/results are never intercepted or faked.

Authored: direct forged receipt INSERT, direct DELETE final-effect refusal, normal finish/deferred completion, unclosed receipt COMMIT refusal, foreign backend/GUC/unknown-field/UPDATE/TRUNCATE refusals, pre-held User/order/center/template locks, unprepared bulk source scan refusal, ordinary scalar update, a BEFORE trigger changing effective protected fields, reversed input physical sequence, committed NEW-order phantom after initial discovery, rollback/no-grant/no-repin first slots, omitted seal, legacy backfill refusal, commissioner ABA, BOTH granted first captures and date/mileage-only observations, pre-capture Listing VIN ABA, temporary eligibility restore, a real physical advisory-key collision barrier with target isolation, and component-only disposal preserving raw observation content.

Not authored: all paired orderings of absent-member/OWNER slots and NEW raw/report/proof/grant/request IDs; actual two-distinct-resource hash collisions; retained consumed report/proof phantom edges; both-side later identity ABA across every protected identity field; grant expiry/revoke/use-time races; consumed proof/request payload erasure with surviving report minima; complete foreign isolation; account/service actor/upload/collector opposing orders; scalar User/Session campaign triggers in both orderings against preparation and reset table preludes; full covered/uncovered FK cascade success/refusal matrix. These are kernel scenario gaps, not tests claimed to exist or pass. No assertion or test family in the accepted base was removed or weakened.
