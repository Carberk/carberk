# B1 finite effect coverage inventory

Authored source coverage only. No PostgreSQL execution or acceptance. This is additive to the immutable a67 incomplete receipt. The same 77 tables, physical primary keys, class namespaces and total suborder remain. No table or FK is newly created. The per-table selector references below identify the lock/dependency closure. `semantic` references are persisted attribution or ownership selectors, not physical FKs and never cascade authority. Catalog FKs outside this finite graph remain unchanged; their parent rows are never deleted here.

| Table | Physical key | Rank / total suborder | Effect or dependency | References to finite parents |
|---|---|---|---|---|
| users | id | 1 / 897100 | finite effect | avatarUploadId → media_uploads.id [NoAction]; suspendedById → users.id [SetNull] |
| dealerships | id | 2 / 897200 | lock-only / held behavior | none |
| dealership_members | id | 3 / 897300 | finite effect | dealershipId → dealerships.id [default]; userId → users.id [Cascade] |
| listings | id | 4 / 897400 | finite effect | pendingVideoGenerationId → video_generations.id [SetNull]; activeVideoGenerationId → video_generations.id [SetNull]; businessId → dealerships.id [Restrict]; sellerId → users.id [Cascade] |
| listing_drafts | id | 4 / 897401 | finite effect | businessId → dealerships.id [Restrict]; userId → users.id [Cascade] |
| inspection_orders | id | 5 / 897500 | finite effect | centerId → diagnostic_centers.id [Restrict]; templateVersionId → diagnostic_template_versions.id [Restrict]; commissionerId → users.id [SetNull]; listingId → listings.id [SetNull] |
| diagnostic_reports | id | 6 / 897600 | finite effect | orderId → inspection_orders.id [Restrict]; templateVersionId → diagnostic_template_versions.id [Restrict]; predecessorId → diagnostic_reports.id [Restrict]; identityRecordId → diagnostic_identity_records.id [Restrict]; identityEvidenceId → diagnostic_identity_evidence.id [Restrict] |
| diagnostic_centers | id | 7 / 897700 | server-derived center insert; current/absent dependency | none |
| diagnostic_template_versions | id | 7 / 897701 | publication source; current/absent version dependency | centerId → diagnostic_centers.id [Restrict]; publishedById → users.id [SetNull] |
| diagnostic_center_assignments | id | 7 / 897702 | derived operator/campaign qualification; current reception dependencies | centerId → diagnostic_centers.id [Restrict]; userId → users.id [Cascade] |
| diagnostic_order_assignments | id | 7 / 897703 | derived current reception intake assignment | orderId → inspection_orders.id [Cascade]; userId → users.id [Cascade] |
| staff_grants | userId, capability | 7 / 897704 | lock-only / held behavior | userId → users.id [Cascade] |
| sessions | id | 7 / 897705 | finite effect | userId → users.id [Cascade] |
| totp_enrollments | id | 7 / 897706 | finite effect | userId → users.id [Cascade] |
| totp_backup_codes | id | 7 / 897707 | finite effect | totpEnrollmentId → totp_enrollments.id [Cascade] |
| diagnostic_continuity_proofs | id | 8 / 897800 | finite effect | predecessorReportId → diagnostic_reports.id [Restrict]; candidateOrderId → inspection_orders.id [Restrict]; predecessorOrderId → inspection_orders.id [semantic]; issuerId → users.id [semantic]; linkingTechnicianId → users.id [semantic]; issuerSessionId → sessions.id [semantic] |
| diagnostic_continuity_requests | id | 8 / 897801 | finite effect | actorId → users.id [Cascade]; sessionId → sessions.id [Cascade]; orderId → inspection_orders.id [Cascade] |
| diagnostic_identity_records | id | 9 / 897900 | finite effect | orderId → inspection_orders.id [Cascade]; recordedById → users.id [SetNull] |
| diagnostic_identity_evidence | id | 9 / 897901 | finite effect | orderId → inspection_orders.id [Cascade]; identityRecordId → diagnostic_identity_records.id [Cascade]; supersedesId → diagnostic_identity_evidence.id [Cascade]; recordedById → users.id [SetNull] |
| diagnostic_identity_provenance | id | 9 / 897902 | finite effect | orderId → inspection_orders.id [Cascade]; createdById → users.id [SetNull] |
| diagnostic_ownership_grants | id | 9 / 897903 | finite effect | orderId → inspection_orders.id [Cascade]; listingId → listings.id [semantic]; sellerId → users.id [semantic]; commissionerId → users.id [semantic]; grantorId → users.id [semantic]; businessId → dealerships.id [semantic]; membershipId → dealership_members.id [semantic]; grantorMembershipId → dealership_members.id [semantic]; sessionId → sessions.id [semantic] |
| diagnostic_ownership_components | identityRecordId | 9 / 897904 | finite effect | grantId → diagnostic_ownership_grants.id [NoAction]; identityRecordId → diagnostic_identity_records.id [Cascade]; orderId → inspection_orders.id [semantic]; sourceListingId → listings.id [semantic]; sellerId → users.id [semantic]; commissionerId → users.id [semantic]; businessId → dealerships.id [semantic]; membershipId → dealership_members.id [semantic]; declaredById → users.id [semantic] |
| diagnostic_source_anchors | orderId | 9 / 897905 | finite effect | orderId → inspection_orders.id [Cascade]; firstRecordId → diagnostic_identity_records.id [semantic] |
| support_cases | id | 10 / 898000 | finite effect | customerId → users.id [Restrict]; assigneeId → users.id [SetNull]; sourceListingId → listings.id [SetNull] |
| vehicle_history_requests | id | 10 / 898001 | finite effect | customerId → users.id [Restrict]; assigneeId → users.id [SetNull]; sourceListingId → listings.id [SetNull] |
| service_conversations | id | 10 / 898002 | finite effect | supportCaseId → support_cases.id [Restrict]; historyRequestId → vehicle_history_requests.id [Restrict] |
| history_quotes | id | 10 / 898003 | finite effect | requestId → vehicle_history_requests.id [Restrict]; offeredById → users.id [semantic] |
| history_orders | id | 10 / 898004 | finite effect | requestId → vehicle_history_requests.id [Restrict]; quoteId → history_quotes.id [Restrict] |
| history_payments | id | 10 / 898005 | finite effect | orderId → history_orders.id [Restrict]; confirmedById → users.id [semantic] |
| history_purchase_intents | id | 10 / 898006 | finite effect | orderId → history_orders.id [Restrict]; createdById → users.id [semantic]; sourceArtifactId → history_artifacts.id [semantic] |
| history_refunds | id | 10 / 898007 | finite effect | orderId → history_orders.id [Restrict]; approvedById → users.id [semantic]; executedById → users.id [semantic] |
| history_bookings | id | 10 / 898008 | finite effect | orderId → history_orders.id [Restrict] |
| history_artifacts | id | 10 / 898009 | finite effect | verifiedById → users.id [semantic]; acquiredForOrderId → history_orders.id [semantic]; sourceListingId → listings.id [semantic] |
| history_deliveries | id | 10 / 898010 | finite effect | orderId → history_orders.id [Restrict]; artifactId → history_artifacts.id [Restrict]; purchaseIntentId → history_purchase_intents.id [Restrict]; deliveredById → users.id [semantic] |
| history_artifact_cleanup | artifactId | 10 / 898011 | lock-only / held behavior | artifactId → history_artifacts.id [semantic] |
| service_attachments | id | 10 / 898012 | finite effect | conversationId → service_conversations.id [Restrict]; uploaderId → users.id [SetNull] |
| service_messages | id | 10 / 898013 | finite effect | conversationId → service_conversations.id [Restrict]; senderId → users.id [SetNull]; attachmentId → service_attachments.id [Restrict] |
| service_read_states | conversationId, userId | 10 / 898014 | finite effect | conversationId → service_conversations.id [Restrict]; userId → users.id [Cascade] |
| service_push_subscriptions | id | 10 / 898015 | finite effect | sessionId → sessions.id [Cascade]; deviceId → fcm_devices.id [Cascade]; conversationId → service_conversations.id [Restrict] |
| service_outbox | id | 10 / 898016 | finite effect | conversationId → service_conversations.id [Restrict] |
| service_erasure_fences | conversationId | 10 / 898017 | finite effect | conversationId → service_conversations.id [Restrict] |
| media_uploads | id | 11 / 898100 | finite effect | businessId → dealerships.id [Restrict]; userId → users.id [Cascade] |
| video_upload_sessions | id | 11 / 898101 | finite effect | userId → users.id [semantic]; uploadId → media_uploads.id [semantic]; listingId → listings.id [semantic] |
| video_generations | id | 11 / 898102 | finite effect | listingId → listings.id [semantic]; uploadId → media_uploads.id [semantic]; sessionId → video_upload_sessions.id [semantic] |
| video_process_work | generationId | 11 / 898103 | finite effect | uploadId → media_uploads.id [semantic]; sessionId → video_upload_sessions.id [semantic]; generationId → video_generations.id [semantic] |
| video_grants | id | 11 / 898104 | finite effect | ownerUserId → users.id [Cascade]; ownerSessionId → sessions.id [Cascade]; listingId → listings.id [semantic]; generationId → video_generations.id [semantic] |
| video_cleanup_work | id | 11 / 898105 | finite effect | uploadId → media_uploads.id [semantic]; sessionId → video_upload_sessions.id [semantic]; generationId → video_generations.id [semantic] |
| media_upload_cleanups | uploadId | 11 / 898106 | finite effect | uploadId → media_uploads.id [semantic] |
| listing_media | id | 11 / 898107 | lock-only / held behavior | listingId → listings.id [Cascade]; uploadId → media_uploads.id [NoAction] |
| diagnostic_evidence | id | 11 / 898108 | finite effect | reportId → diagnostic_reports.id [Restrict]; createdById → users.id [semantic] |
| diagnostic_pdf_artifacts | id | 11 / 898109 | finite effect | reportId → diagnostic_reports.id [Restrict] |
| measurement_state | key | 12 / 898200 | lock-only / held behavior | none |
| measurement_principals | id | 12 / 898201 | finite effect | userId → users.id [Cascade] |
| measurement_visits | id | 12 / 898202 | finite effect | principalId → measurement_principals.id [Cascade]; linkedAccountId → measurement_principals.id [Cascade] |
| measurement_records | id | 12 / 898203 | finite effect | principalId → measurement_principals.id [Cascade]; visitId → measurement_visits.id [Cascade] |
| measurement_outbox | id | 12 / 898204 | finite effect | principalId → measurement_principals.id [Cascade] |
| measurement_investigation_exports | id | 12 / 898205 | finite effect | actorId → users.id [semantic]; sessionId → sessions.id [semantic] |
| measurement_rollups | key | 12 / 898206 | lock-only / held behavior | none |
| diagnostic_audits | id | 13 / 898300 | derived exact intake/publication/operator/campaign audit; purge attribution | centerId → diagnostic_centers.id [Restrict]; orderId → inspection_orders.id [Restrict]; actorId → users.id [SetNull] |
| service_audits | id | 13 / 898301 | finite effect | actorId → users.id [SetNull] |
| audit_logs | id | 13 / 898302 | derived staff operator audit; otherwise lock-only | actorId → users.id [SetNull] |
| dealership_invitations | id | 13 / 898303 | lock-only / held behavior | dealershipId → dealerships.id [Cascade]; recipientUserId → users.id [Cascade] |
| owned_vehicles | id | 13 / 898304 | finite effect | userId → users.id [Cascade]; dealershipId → dealerships.id [default] |
| blocked_users | id | 13 / 898305 | finite effect | blockerId → users.id [Cascade]; blockedId → users.id [Cascade] |
| favorites | id | 13 / 898306 | finite effect | userId → users.id [Cascade]; listingId → listings.id [Cascade] |
| saved_searches | id | 13 / 898307 | finite effect | userId → users.id [Cascade] |
| conversations | id | 13 / 898308 | lock-only / held behavior | businessId → dealerships.id [Restrict]; listingId → listings.id [Cascade]; buyerId → users.id [Cascade]; sellerId → users.id [Cascade] |
| conversation_participants | id | 13 / 898309 | lock-only / held behavior | conversationId → conversations.id [Cascade]; userId → users.id [Cascade] |
| messages | id | 13 / 898310 | lock-only / held behavior | conversationId → conversations.id [Cascade] |
| fcm_devices | id | 13 / 898311 | finite effect | userId → users.id [Cascade] |
| notification_history | id | 13 / 898312 | finite effect | userId → users.id [Cascade] |
| notification_preferences | id | 13 / 898313 | finite effect | userId → users.id [Cascade] |
| verified_contact_phones | id | 13 / 898314 | finite effect | sellerId → users.id [Cascade] |
| otp_requests | id | 13 / 898315 | finite effect | userId → users.id [default] |
| content_reports | id | 13 / 898316 | lock-only / held behavior | reporterUserId → users.id [SetNull]; reviewedById → users.id [SetNull] |
| inspection_interests | id | 13 / 898317 | lock-only / held behavior | listingId → listings.id [semantic]; requesterUserId → users.id [semantic] |
| business_enquiry_audits | id | 13 / 898318 | lock-only / held behavior | conversationId → conversations.id [Cascade] |

Physical deletion boundary is unchanged from the prior receipt: Session → video grants/service push subscriptions/continuity requests; device → service push subscriptions; TOTP enrollment → backup codes; measurement principal → visits/records/outbox including linked account visits; visit → records. Those CASCADE effects are selected before locking and checked at final completion. Overlaps are deduplicated. The User tombstone, orders, reports, raw records, History artifact bytes and foreign graphs are retained. Proof/request/report cleanup uses the explicit triggers in the completion receipt, including intentionally non-FK retry minima.

The source guard specification remains the held 22-table selective set; the other 55 finite tables retain the dormant `zz_diagnostic_source_purge` guard. Only its live `staff_bootstrap` AuditLog branch is added. Presence/target/effective guards, statement preparation fences and incoming FK actions take no new late locks from these changes. Existing owner/lease-only writes outside a live source receipt keep their original protocol.
