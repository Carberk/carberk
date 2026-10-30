-- Finite effect closure only. No activation, admission, backfill or caller integration.
-- The User tombstone survives purge. SQL resolves all other effects from persisted ownership.
CREATE OR REPLACE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $registry$
 SELECT '[
 {"table":"users","pk":["id"],"fields":["id","phone","phoneVerifiedAt","email","emailVerifiedAt","role","suspendedAt","deletionScheduledAt","displayName","avatarKey","avatarUploadId","avatarUrl"],"unique":[["phone"],["email"],["avatarUploadId"]],"refs":[{"table":"media_uploads","columns":["avatarUploadId"],"target":["id"]},{"table":"users","columns":["suspendedById"],"target":["id"]}],"rank":1,"namespace":897100,"suborder":897100},
 {"table":"dealerships","pk":["id"],"fields":["id","status","admissionMode","admittedAt"],"unique":[["slug"]],"refs":[],"rank":2,"namespace":897200,"suborder":897200},
 {"table":"dealership_members","pk":["id"],"fields":["id","userId","dealershipId","role","status"],"unique":[["userId"]],"refs":[{"table":"dealerships","columns":["dealershipId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":3,"namespace":897300,"suborder":897300},
 {"table":"listings","pk":["id"],"fields":["id","sellerId","businessId","vin","brandId","modelId","year","deletedAt","status","contactPhone","activeVideoGenerationId","pendingVideoGenerationId","activeVideoRevision"],"unique":[["publicNumber"]],"refs":[{"table":"video_generations","columns":["pendingVideoGenerationId"],"target":["id"]},{"table":"video_generations","columns":["activeVideoGenerationId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":4,"namespace":897400,"suborder":897400},
 {"table":"listing_drafts","pk":["id"],"fields":["businessId","id","userId","payload","createdAt","updatedAt"],"unique":[],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":4,"namespace":897401,"suborder":897401},
 {"table":"inspection_orders","pk":["id"],"fields":["id","centerId","templateVersionId","commissionerId","requestKey","audience","listingId","status","version","epoch","physicalAuthorization","publicationAuthorization","observedVehicle","listingIdentityDigest","associationValidatedAt","identityEvidenceGeneration","synthetic","createdAt","updatedAt","erasedAt"],"unique":[["commissionerId","requestKey"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"diagnostic_template_versions","columns":["templateVersionId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":5,"namespace":897500,"suborder":897500},
 {"table":"diagnostic_reports","pk":["id"],"fields":["id","orderId","templateVersionId","predecessorId","reinspection","audience","status","version","state","snapshot","snapshotHash","identityRecordId","identityRecordHash","identityEvidenceId","identityEvidenceHash","continuityRequestId","continuityRequestSessionId","continuityProofId","reinspectionOrderVersion","finalizedAt","withdrawnAt","withdrawalReason","createdAt","updatedAt","erasedAt"],"unique":[["predecessorId"],["continuityRequestId"],["continuityProofId"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"diagnostic_template_versions","columns":["templateVersionId"],"target":["id"]},{"table":"diagnostic_reports","columns":["predecessorId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"diagnostic_identity_evidence","columns":["identityEvidenceId"],"target":["id"]}],"rank":6,"namespace":897600,"suborder":897600},
 {"table":"diagnostic_centers","pk":["id"],"fields":["id","code","planCode","names","operationalApproval","createdAt"],"unique":[["code"]],"refs":[],"rank":7,"namespace":897700,"suborder":897700},
 {"table":"diagnostic_template_versions","pk":["id"],"fields":["id","centerId","version","definition","synthetic","publishedById","publishedAt"],"unique":[["centerId","version"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"users","columns":["publishedById"],"target":["id"]}],"rank":7,"namespace":897701,"suborder":897701},
 {"table":"diagnostic_center_assignments","pk":["id"],"fields":["id","centerId","userId","capability","qualifiedUntil","assignedAt","revokedAt"],"unique":[["centerId","userId","capability"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897702,"suborder":897702},
 {"table":"diagnostic_order_assignments","pk":["id"],"fields":["id","orderId","userId","capability","assignedAt","revokedAt"],"unique":[["orderId","userId","capability"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897703,"suborder":897703},
 {"table":"staff_grants","pk":["userId","capability"],"fields":["userId","capability","grantedAt","revokedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897704,"suborder":897704},
 {"table":"sessions","pk":["id"],"fields":["id","userId","expiresAt","adminTotpExpiresAt"],"unique":[["refreshTokenHash"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897705,"suborder":897705},
 {"table":"totp_enrollments","pk":["id"],"fields":["id","userId","encryptedSecret","verifiedAt","createdAt","updatedAt"],"unique":[["userId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897706,"suborder":897706},
 {"table":"totp_backup_codes","pk":["id"],"fields":["id","totpEnrollmentId","codeHash","usedAt"],"unique":[],"refs":[{"table":"totp_enrollments","columns":["totpEnrollmentId"],"target":["id"]}],"rank":7,"namespace":897707,"suborder":897707},
 {"table":"diagnostic_continuity_proofs","pk":["id"],"fields":["requestId","id","predecessorReportId","candidateOrderId","predecessorOrderId","issuerId","issuerSessionId","linkingTechnicianId","content","bindings","rightsUntil","issuedAt","invalidatedAt","consumedReportId","consumedAt","erasedAt"],"unique":[["requestId"],["consumedReportId"]],"refs":[{"table":"diagnostic_reports","columns":["predecessorReportId"],"target":["id"]},{"table":"inspection_orders","columns":["candidateOrderId"],"target":["id"]},{"table":"inspection_orders","columns":["predecessorOrderId"],"target":["id"]},{"table":"users","columns":["issuerId"],"target":["id"]},{"table":"users","columns":["linkingTechnicianId"],"target":["id"]},{"table":"sessions","columns":["issuerSessionId"],"target":["id"]}],"rank":8,"namespace":897800,"suborder":897800},
 {"table":"diagnostic_continuity_requests","pk":["id"],"fields":["id","createdAt","actorId","sessionId","orderId","kind"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]},{"table":"sessions","columns":["sessionId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]}],"rank":8,"namespace":897801,"suborder":897801},
 {"table":"diagnostic_identity_records","pk":["id"],"fields":["id","orderId","orderVersion","observation","observationHash","recordedById","recordedAt","erasedAt"],"unique":[["orderId","orderVersion"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["recordedById"],"target":["id"]}],"rank":9,"namespace":897900,"suborder":897900},
 {"table":"diagnostic_identity_evidence","pk":["id"],"fields":["id","orderId","orderVersion","identityRecordId","observationHash","identifiers","provenance","rights","rightsUntil","supersedesId","explanation","recordHash","recordedById","recordedAt","erasedAt"],"unique":[["supersedesId"],["orderId","orderVersion"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"diagnostic_identity_evidence","columns":["supersedesId"],"target":["id"]},{"table":"users","columns":["recordedById"],"target":["id"]}],"rank":9,"namespace":897901,"suborder":897901},
 {"table":"diagnostic_identity_provenance","pk":["id"],"fields":["id","orderId","contentType","declaredSizeBytes","rights","rightsUntil","objectKey","sha256","sizeBytes","mime","state","epoch","writeLeaseUntil","cleanupLeaseUntil","cleanupAttempts","cleanupFailureCode","createdById","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt","erasedAt"],"unique":[["objectKey"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["createdById"],"target":["id"]}],"rank":9,"namespace":897902,"suborder":897902},
 {"table":"diagnostic_ownership_grants","pk":["id"],"fields":["id","orderId","state","listingId","identityDigest","sellerId","commissionerId","businessId","membershipId","grantorId","grantorMembershipId","sessionId","rights","rightsUntil","declaredAt","erasedAt"],"unique":[["orderId"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"users","columns":["grantorId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"dealership_members","columns":["membershipId"],"target":["id"]},{"table":"dealership_members","columns":["grantorMembershipId"],"target":["id"]},{"table":"sessions","columns":["sessionId"],"target":["id"]}],"rank":9,"namespace":897903,"suborder":897903},
 {"table":"diagnostic_ownership_components","pk":["identityRecordId"],"fields":["grantId","identityRecordId","orderId","orderVersion","state","scope","sourceListingId","identityDigest","sellerId","commissionerId","businessId","membershipId","rights","rightsUntil","declaredById","declaredAt","erasedAt"],"unique":[["orderId","orderVersion"]],"refs":[{"table":"diagnostic_ownership_grants","columns":["grantId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"dealership_members","columns":["membershipId"],"target":["id"]},{"table":"users","columns":["declaredById"],"target":["id"]}],"rank":9,"namespace":897904,"suborder":897904},
 {"table":"diagnostic_source_anchors","pk":["orderId"],"fields":["orderId","state","firstRecordId","source","createdTransaction"],"unique":[],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["firstRecordId"],"target":["id"]}],"rank":9,"namespace":897905,"suborder":897905},
 {"table":"support_cases","pk":["id"],"fields":["id","customerId","assigneeId","assignmentVersion","sourceListingId","status","closedAt","unansweredSince","awaitingCustomerSince","priority","investigationState","escalatedAt","mode","createdAt","updatedAt"],"unique":[["customerId"]],"refs":[{"table":"users","columns":["customerId"],"target":["id"]},{"table":"users","columns":["assigneeId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]}],"rank":10,"namespace":898000,"suborder":898000},
 {"table":"vehicle_history_requests","pk":["id"],"fields":["id","customerId","assigneeId","assignmentVersion","sourceListingId","proposedVin","confirmedVin","status","mode","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["customerId"],"target":["id"]},{"table":"users","columns":["assigneeId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]}],"rank":10,"namespace":898001,"suborder":898001},
 {"table":"service_conversations","pk":["id"],"fields":["id","purpose","supportCaseId","historyRequestId","lifecycleEpoch","lastSequence","erasedAt","createdAt"],"unique":[["supportCaseId"],["historyRequestId"]],"refs":[{"table":"support_cases","columns":["supportCaseId"],"target":["id"]},{"table":"vehicle_history_requests","columns":["historyRequestId"],"target":["id"]}],"rank":10,"namespace":898002,"suborder":898002},
 {"table":"history_quotes","pk":["id"],"fields":["erasedAt","id","requestId","vin","amount","providers","preflightOutcome","preflightEvidence","refundRule","windowStart","windowEnd","feasible","offeredById","createdAt","supersededAt","acceptedAt"],"unique":[],"refs":[{"table":"vehicle_history_requests","columns":["requestId"],"target":["id"]},{"table":"users","columns":["offeredById"],"target":["id"]}],"rank":10,"namespace":898003,"suborder":898003},
 {"table":"history_orders","pk":["id"],"fields":["recoveryOfferedAt","recoveryOfferedDeadline","recoveryOfferExpiresAt","version","id","requestId","quoteId","day","morning","state","holdExpiresAt","paidAt","receivedAt","promiseAt","recoveryUsed","recoveryAgreedAt","recoveryDeadline","escalatedAt","rights","erasedAt","createdAt","updatedAt"],"unique":[["requestId"],["quoteId"]],"refs":[{"table":"vehicle_history_requests","columns":["requestId"],"target":["id"]},{"table":"history_quotes","columns":["quoteId"],"target":["id"]}],"rank":10,"namespace":898004,"suborder":898004},
 {"table":"history_payments","pk":["id"],"fields":["verifiedFunds","id","orderId","clientPaymentId","attachmentId","claim","amount","receivedAt","confirmedAt","confirmedById","evidence","state","createdAt"],"unique":[["orderId","clientPaymentId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["confirmedById"],"target":["id"]}],"rank":10,"namespace":898005,"suborder":898005},
 {"table":"history_purchase_intents","pk":["id"],"fields":["sourceArtifactId","id","orderId","vin","providers","state","externalReference","createdById","createdAt","reconciledAt"],"unique":[["orderId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["createdById"],"target":["id"]},{"table":"history_artifacts","columns":["sourceArtifactId"],"target":["id"]}],"rank":10,"namespace":898006,"suborder":898006},
 {"table":"history_refunds","pk":["id"],"fields":["id","orderId","reason","state","approvedById","approvedAt","executedById","executedAt","executionReference","createdAt"],"unique":[["orderId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["approvedById"],"target":["id"]},{"table":"users","columns":["executedById"],"target":["id"]}],"rank":10,"namespace":898007,"suborder":898007},
 {"table":"history_bookings","pk":["id"],"fields":["id","orderId","clientBookingId","vin","providers","amount","refundRule","windowStart","windowEnd","acceptedAt","erasedAt"],"unique":[["orderId","clientBookingId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]}],"rank":10,"namespace":898008,"suborder":898008},
 {"table":"history_artifacts","pk":["id"],"fields":["id","provider","vin","originalDate","mileageObservedAt","mileageValue","mileageUnit","vehicleIdentity","sourceObservations","sourceListingId","acquiredForOrderId","objectKey","sha256","sizeBytes","expectedPages","verifiedPages","rights","provenance","state","verifiedById","verifiedAt","createdAt","restrictedAt","removedAt"],"unique":[["objectKey"]],"refs":[{"table":"users","columns":["verifiedById"],"target":["id"]},{"table":"history_orders","columns":["acquiredForOrderId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]}],"rank":10,"namespace":898009,"suborder":898009},
 {"table":"history_deliveries","pk":["id"],"fields":["id","orderId","artifactId","purchaseIntentId","sharedLink","linkApprovedAt","deliveredById","deliveredAt","erasedAt"],"unique":[["orderId","artifactId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]},{"table":"history_artifacts","columns":["artifactId"],"target":["id"]},{"table":"history_purchase_intents","columns":["purchaseIntentId"],"target":["id"]},{"table":"users","columns":["deliveredById"],"target":["id"]}],"rank":10,"namespace":898010,"suborder":898010},
 {"table":"history_artifact_cleanup","pk":["artifactId"],"fields":["artifactId","objectKey","sha256","epoch","requestedAt","completedAt"],"unique":[],"refs":[{"table":"history_artifacts","columns":["artifactId"],"target":["id"]}],"rank":10,"namespace":898011,"suborder":898011},
 {"table":"service_attachments","pk":["id"],"fields":["id","conversationId","uploaderId","lifecycleEpoch","category","visibility","state","stagingKey","objectKey","contentType","expectedBytes","sizeBytes","sha256","filename","rights","createdAt","expiresAt","adoptedAt","removedAt"],"unique":[["stagingKey"],["objectKey"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["uploaderId"],"target":["id"]}],"rank":10,"namespace":898012,"suborder":898012},
 {"table":"service_messages","pk":["id"],"fields":["id","conversationId","sequence","clientMessageId","senderId","senderKind","visibility","body","attachmentId","requestHash","createdAt"],"unique":[["attachmentId"],["conversationId","senderId","clientMessageId"],["conversationId","sequence"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["senderId"],"target":["id"]},{"table":"service_attachments","columns":["attachmentId"],"target":["id"]}],"rank":10,"namespace":898013,"suborder":898013},
 {"table":"service_read_states","pk":["conversationId","userId"],"fields":["conversationId","userId","lastSequence","updatedAt"],"unique":[],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":10,"namespace":898014,"suborder":898014},
 {"table":"service_push_subscriptions","pk":["id"],"fields":["id","sessionId","deviceId","conversationId","lifecycleEpoch","createdAt","updatedAt"],"unique":[["sessionId","deviceId","conversationId"]],"refs":[{"table":"sessions","columns":["sessionId"],"target":["id"]},{"table":"fcm_devices","columns":["deviceId"],"target":["id"]},{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898015,"suborder":898015},
 {"table":"service_outbox","pk":["id"],"fields":["id","conversationId","eventType","sequence","visibility","lifecycleEpoch","createdAt","deliveredAt","attempts","nextAttemptAt"],"unique":[["conversationId","eventType","sequence"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898016,"suborder":898016},
 {"table":"service_erasure_fences","pk":["conversationId"],"fields":["conversationId","epoch","objectKeys","erasedAt","cleanupCompletedAt"],"unique":[],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898017,"suborder":898017},
 {"table":"media_uploads","pk":["id"],"fields":["businessId","id","userId","key","kind","contentType","sizeBytes","writeProtocol","objectKeys","createdAt","state","claimToken","claimTargetType","claimTargetId","claimDeadline","retiredAt"],"unique":[["key"]],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":11,"namespace":898100,"suborder":898100},
 {"table":"video_upload_sessions","pk":["id"],"fields":["protocolVersion","targetKind","targetId","targetRevision","storageUploadId","posterMs","idempotencyKey","idempotencyHash","completionFence","cancelledAt","completedAt","id","uploadId","userId","listingId","state","sourceKey","sizeBytes","sha256","expiresAt","createdAt","updatedAt"],"unique":[["uploadId"],["userId","idempotencyKey"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":11,"namespace":898101,"suborder":898101},
 {"table":"video_generations","pk":["id"],"fields":["sessionId","completionFence","targetRevision","processingVersion","sourceSha256","sourceWidth","sourceHeight","id","listingId","uploadId","state","manifest","durationMs","posterKey","createdAt","readyAt","retiredAt"],"unique":[],"refs":[{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]}],"rank":11,"namespace":898102,"suborder":898102},
 {"table":"video_process_work","pk":["generationId"],"fields":["generationId","uploadId","sessionId","completionFence","targetRevision","processingVersion","state","attempts","nextAttemptAt","leaseToken","leaseExpiresAt","lastError","createdAt","updatedAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898103,"suborder":898103},
 {"table":"video_grants","pk":["id"],"fields":["ownerUserId","ownerSessionId","id","secretHash","listingId","generationId","purpose","expiresAt","revokedAt","createdAt"],"unique":[["secretHash"]],"refs":[{"table":"users","columns":["ownerUserId"],"target":["id"]},{"table":"sessions","columns":["ownerSessionId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898104,"suborder":898104},
 {"table":"video_cleanup_work","pk":["id"],"fields":["id","uploadId","sessionId","generationId","writeProtocol","sourceKey","storageUploadId","objectKeys","state","attempts","nextAttemptAt","leaseToken","leaseExpiresAt","lastError","createdAt","updatedAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898105,"suborder":898105},
 {"table":"media_upload_cleanups","pk":["uploadId"],"fields":["uploadId","key","objectKeys","writeProtocol","status","attempts","nextAttemptAt","lastError","createdAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]}],"rank":11,"namespace":898106,"suborder":898106},
 {"table":"listing_media","pk":["id"],"fields":["id","listingId","kind","key","sortOrder","width","height","durationMs","posterKey","thumbHash","createdAt","uploadId"],"unique":[["uploadId"]],"refs":[{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]}],"rank":11,"namespace":898107,"suborder":898107},
 {"table":"diagnostic_evidence","pk":["id"],"fields":["writeLeaseUntil","cleanupLeaseUntil","cleanupAttempts","cleanupFailureCode","id","reportId","findingId","objectKey","sha256","sizeBytes","mime","state","epoch","createdById","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt"],"unique":[["objectKey"]],"refs":[{"table":"diagnostic_reports","columns":["reportId"],"target":["id"]},{"table":"users","columns":["createdById"],"target":["id"]}],"rank":11,"namespace":898108,"suborder":898108},
 {"table":"diagnostic_pdf_artifacts","pk":["id"],"fields":["id","reportId","snapshotHash","locale","rendererVersion","generation","epoch","state","objectKey","sha256","sizeBytes","attempts","retryAt","failureCode","leaseUntil","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt"],"unique":[["objectKey"],["reportId","locale","rendererVersion","generation"]],"refs":[{"table":"diagnostic_reports","columns":["reportId"],"target":["id"]}],"rank":11,"namespace":898109,"suborder":898109},
 {"table":"measurement_state","pk":["key"],"fields":["key","epoch"],"unique":[],"refs":[],"rank":12,"namespace":898200,"suborder":898200},
 {"table":"measurement_principals","pk":["id"],"fields":["id","pseudonym","generation","epoch","kind","userId","capabilityHash","expiresAt","createdAt"],"unique":[["pseudonym"],["generation"],["userId"],["capabilityHash"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":12,"namespace":898201,"suborder":898201},
 {"table":"measurement_visits","pk":["id"],"fields":["id","principalId","linkedAccountId","startedAt","foregroundAt","endedAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]},{"table":"measurement_principals","columns":["linkedAccountId"],"target":["id"]}],"rank":12,"namespace":898202,"suborder":898202},
 {"table":"measurement_records","pk":["id"],"fields":["id","principalId","visitId","event","origin","environment","population","conversionEligible","occurredAt","receivedAt","expiresAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]},{"table":"measurement_visits","columns":["visitId"],"target":["id"]}],"rank":12,"namespace":898203,"suborder":898203},
 {"table":"measurement_outbox","pk":["id"],"fields":["id","principalId","generation","epoch","environment","population","conversionEligible","event","createdAt","expiresAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]}],"rank":12,"namespace":898204,"suborder":898204},
 {"table":"measurement_investigation_exports","pk":["id"],"fields":["id","actorId","sessionId","epoch","reason","auditId","scope","evidence","createdAt","expiresAt","revokedAt"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]},{"table":"sessions","columns":["sessionId"],"target":["id"]}],"rank":12,"namespace":898205,"suborder":898205},
 {"table":"measurement_rollups","pk":["key"],"fields":["key","version","epoch","environment","population","windowFrom","windowTo","completeThrough","inputDigest","lateRecords","metrics","generatedAt","expiresAt"],"unique":[],"refs":[],"rank":12,"namespace":898206,"suborder":898206},
 {"table":"diagnostic_audits","pk":["id"],"fields":["id","centerId","orderId","actorId","action","details","createdAt"],"unique":[],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898300,"suborder":898300},
 {"table":"service_audits","pk":["id"],"fields":["id","actorId","purpose","resourceId","action","reason","targetStaffId","assignmentVersion","createdAt"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898301,"suborder":898301},
 {"table":"audit_logs","pk":["id"],"fields":["id","actorId","action","targetType","targetId","details","createdAt"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898302,"suborder":898302},
 {"table":"dealership_invitations","pk":["id"],"fields":["id","dealershipId","recipientUserId","role","tokenHash","expiresAt","revokedAt","redeemedAt","createdAt"],"unique":[["tokenHash"]],"refs":[{"table":"dealerships","columns":["dealershipId"],"target":["id"]},{"table":"users","columns":["recipientUserId"],"target":["id"]}],"rank":13,"namespace":898303,"suborder":898303},
 {"table":"owned_vehicles","pk":["id"],"fields":["id","userId","dealershipId","brand","model","year","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"dealerships","columns":["dealershipId"],"target":["id"]}],"rank":13,"namespace":898304,"suborder":898304},
 {"table":"blocked_users","pk":["id"],"fields":["id","blockerId","blockedId","createdAt"],"unique":[["blockerId","blockedId"]],"refs":[{"table":"users","columns":["blockerId"],"target":["id"]},{"table":"users","columns":["blockedId"],"target":["id"]}],"rank":13,"namespace":898305,"suborder":898305},
 {"table":"favorites","pk":["id"],"fields":["id","userId","listingId","createdAt"],"unique":[["userId","listingId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":13,"namespace":898306,"suborder":898306},
 {"table":"saved_searches","pk":["id"],"fields":["id","userId","filters","pushEnabled","lastDigestAt","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898307,"suborder":898307},
 {"table":"conversations","pk":["id"],"fields":["businessId","assigneeId","enquiryState","version","id","listingId","buyerId","sellerId","createdAt","updatedAt","lastMessageAt","lastMessageId","firstBuyerMessageId","firstSellerReplyId"],"unique":[["listingId","buyerId"]],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"users","columns":["buyerId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":13,"namespace":898308,"suborder":898308},
 {"table":"conversation_participants","pk":["id"],"fields":["id","conversationId","userId","createdAt","mutedAt","lastReadAt","lastDeliveredAt"],"unique":[["conversationId","userId"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898309,"suborder":898309},
 {"table":"messages","pk":["id"],"fields":["id","conversationId","senderId","body","metadata","createdAt","deletedAt","clientMessageId"],"unique":[["conversationId","senderId","clientMessageId"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]}],"rank":13,"namespace":898310,"suborder":898310},
 {"table":"fcm_devices","pk":["id"],"fields":["id","userId","token","createdAt","updatedAt","deviceId","registeredAt","lastUsedAt","invalidatedAt"],"unique":[["token"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898311,"suborder":898311},
 {"table":"notification_history","pk":["id"],"fields":["id","userId","title","body","data","deliveryDetails","readAt","createdAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898312,"suborder":898312},
 {"table":"notification_preferences","pk":["id"],"fields":["id","userId","optOuts"],"unique":[["userId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898313,"suborder":898313},
 {"table":"verified_contact_phones","pk":["id"],"fields":["id","sellerId","phone","confirmedAt","createdAt","updatedAt"],"unique":[["sellerId","phone"]],"refs":[{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":13,"namespace":898314,"suborder":898314},
 {"table":"otp_requests","pk":["id"],"fields":["id","destination","phone","codeHash","expiresAt","verifiedAt","attempts","userId","businessId","ip","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898315,"suborder":898315},
 {"table":"content_reports","pk":["id"],"fields":["id","reporterUserId","targetType","targetId","reason","details","status","reviewedById","reviewedAt","createdAt","messageContext"],"unique":[],"refs":[{"table":"users","columns":["reporterUserId"],"target":["id"]},{"table":"users","columns":["reviewedById"],"target":["id"]}],"rank":13,"namespace":898316,"suborder":898316},
 {"table":"inspection_interests","pk":["id"],"fields":["id","listing_id","requester_user_id","side","willingness_to_pay_tmt","created_at","updated_at"],"unique":[["listing_id","requester_user_id"]],"refs":[{"table":"listings","columns":["listing_id"],"target":["id"]},{"table":"users","columns":["requester_user_id"],"target":["id"]}],"rank":13,"namespace":898317,"suborder":898317},
 {"table":"business_enquiry_audits","pk":["id"],"fields":["id","conversationId","version","actorId","action","previousAssigneeId","assigneeId","enquiryState","createdAt"],"unique":[["conversationId","version"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]}],"rank":13,"namespace":898318,"suborder":898318}
]'::jsonb
$registry$;

-- Internal representation only. Callers cannot supply derived effects or patches.
CREATE FUNCTION public.diagnostic_purge_effect(t text, r jsonb, patch jsonb, remove boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path = pg_catalog, public AS $$
 SELECT jsonb_build_object('table',t,'key',public.diagnostic_source_key(t,r),
  'verb',CASE WHEN remove THEN 'delete' ELSE 'update' END,'expected',jsonb_build_object('source',public.diagnostic_source_project(r,public.diagnostic_source_meta(t)->'fields')),
  'next',CASE WHEN remove THEN NULL ELSE public.diagnostic_source_normalize(t,r||patch) END,'derived','purge')
$$;

CREATE FUNCTION public.diagnostic_account_purge_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE uid text:=c->'roots'->0->'key'->>'id'; at_time timestamp:=(c->>'cutoff')::timestamp;
 effects jsonb:='[]'; x record; r jsonb; patch jsonb; dispose jsonb; own_orders text[]; own_conversations text[];
 own_history text[]; own_history_orders text[]; own_support text[]; own_video text[]; removed_proofs text[];
 account public.users; owned boolean; held boolean; anonymous boolean; fresh boolean; fenced boolean; keys jsonb; prior jsonb;
BEGIN
 SELECT * INTO account FROM public.users WHERE id=uid;
 IF account.id IS NULL OR account."deletionScheduledAt" IS NULL OR account."deletionScheduledAt">at_time THEN
  RAISE EXCEPTION 'diagnostic_source_purge_not_due'; END IF;
 dispose:=public.diagnostic_ownership_disposal_scope(uid,at_time,NULL);
 SELECT COALESCE(array_agg(id),'{}') INTO own_orders FROM public.inspection_orders WHERE "commissionerId"=uid;
 SELECT COALESCE(array_agg(id),'{}') INTO own_support FROM public.support_cases WHERE "customerId"=uid;
 SELECT COALESCE(array_agg(id),'{}') INTO own_history FROM public.vehicle_history_requests WHERE "customerId"=uid;
 SELECT COALESCE(array_agg(id),'{}') INTO own_history_orders FROM public.history_orders WHERE "requestId"=ANY(own_history);
 SELECT COALESCE(array_agg(id),'{}') INTO own_conversations FROM public.service_conversations WHERE "supportCaseId"=ANY(own_support) OR "historyRequestId"=ANY(own_history);
 SELECT COALESCE(array_agg(id),'{}') INTO own_video FROM public.media_uploads WHERE "userId"=uid AND "businessId" IS NULL AND "writeProtocol"='video-v1';
 -- Payload disposal covers retained OLD bindings and consumed edges. Report retry
 -- IDs/version remain on surviving reports; they are deliberately not proof FKs.
 SELECT COALESCE(array_agg(p.id),'{}') INTO removed_proofs FROM public.diagnostic_continuity_proofs p WHERE
  p."issuerId"=uid OR p."linkingTechnicianId"=uid OR p."candidateOrderId"=ANY(own_orders) OR p."predecessorOrderId"=ANY(own_orders)
  OR p."candidateOrderId" IN (SELECT "orderId" FROM public.diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(dispose->'c')))
  OR p."predecessorOrderId" IN (SELECT "orderId" FROM public.diagnostic_ownership_components WHERE "identityRecordId" IN (SELECT jsonb_array_elements_text(dispose->'c')))
  OR p.bindings->'predecessor'->>'commissionerId'=uid OR p.bindings->'candidate'->>'commissionerId'=uid
  OR p.bindings->'predecessor'->'listingBinding'->>'sellerId'=uid OR p.bindings->'candidate'->'listingBinding'->>'sellerId'=uid;
 -- Finite owner union below. Each branch is the existing owner policy, not a
 -- generic FK eraser. Attribution targets include foreign customers' records.
 FOR x IN SELECT to_jsonb(t) AS row FROM public.users t WHERE t.id=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('users',r,jsonb_build_object('phone',NULL,'phoneVerifiedAt',NULL,'email',NULL,'emailVerifiedAt',NULL,'displayName',NULL,'avatarKey',NULL,'avatarUploadId',NULL,'avatarUrl',NULL,'deletionScheduledAt',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.sessions t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('sessions',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.totp_enrollments t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('totp_enrollments',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.totp_backup_codes t WHERE t."totpEnrollmentId" IN (SELECT id FROM public.totp_enrollments WHERE "userId"=uid) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('totp_backup_codes',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.fcm_devices t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('fcm_devices',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.notification_history t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('notification_history',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.notification_preferences t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('notification_preferences',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.saved_searches t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('saved_searches',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.favorites t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('favorites',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.owned_vehicles t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('owned_vehicles',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.blocked_users t WHERE t."blockerId"=uid OR t."blockedId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('blocked_users',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.dealership_members t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('dealership_members',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.listing_drafts t WHERE t."userId"=uid AND t."businessId" IS NULL LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('listing_drafts',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.verified_contact_phones t WHERE t."sellerId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('verified_contact_phones',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.otp_requests t WHERE t."userId"=uid OR (t."userId" IS NULL AND t.destination IN (account.phone,account.email)) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('otp_requests',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_messages t WHERE t."conversationId"=ANY(own_conversations) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_messages',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_outbox t WHERE t."conversationId"=ANY(own_conversations) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_outbox',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_read_states t WHERE t."userId"=uid OR t."conversationId"=ANY(own_conversations) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_read_states',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_push_subscriptions t WHERE t."conversationId"=ANY(own_conversations) OR t."sessionId" IN (SELECT id FROM public.sessions WHERE "userId"=uid) OR t."deviceId" IN (SELECT id FROM public.fcm_devices WHERE "userId"=uid) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_push_subscriptions',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_order_assignments t WHERE t."userId"=uid OR t."orderId"=ANY(own_orders) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_order_assignments',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_center_assignments t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_center_assignments',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_continuity_proofs t WHERE t.id=ANY(removed_proofs) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_proofs',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_continuity_requests t WHERE t."actorId"=uid OR t."sessionId" IN (SELECT id FROM public.sessions WHERE "userId"=uid) OR t."orderId"=ANY(own_orders)
  OR t.id IN (SELECT "requestId" FROM public.diagnostic_continuity_proofs WHERE id=ANY(removed_proofs))
  OR t.id IN (SELECT "continuityRequestId" FROM public.diagnostic_reports WHERE "orderId"=ANY(own_orders) OR state->>'authorId'=uid) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_requests',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.measurement_principals t WHERE t."userId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_principals',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.measurement_visits t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) OR t."linkedAccountId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_visits',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.measurement_records t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) OR t."visitId" IN
  (SELECT id FROM public.measurement_visits WHERE "principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) OR "linkedAccountId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid)) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_records',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.measurement_outbox t WHERE t."principalId" IN (SELECT id FROM public.measurement_principals WHERE "userId"=uid) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_outbox',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.measurement_investigation_exports t WHERE true LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('measurement_investigation_exports',r,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.listings t WHERE t."sellerId"=uid AND t."businessId" IS NULL LOOP
  r:=x.row; patch:='{}';
  patch:=jsonb_build_object('contactPhone',NULL);
  IF r->>'activeVideoGenerationId' IS NOT NULL OR r->>'pendingVideoGenerationId' IS NOT NULL THEN
   patch:=patch||jsonb_build_object('activeVideoGenerationId',NULL,'pendingVideoGenerationId',NULL,'activeVideoRevision',(r->>'activeVideoRevision')::int+1); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('listings',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_reports t WHERE t."orderId"=ANY(own_orders) OR (t."erasedAt" IS NULL AND (t.state->>'authorId'=uid OR t.state->>'reviewerId'=uid)) LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_orders);
  IF owned AND r->>'erasedAt' IS NULL THEN
   patch:=jsonb_build_object('erasedAt',at_time,'version',(r->>'version')::int+1,'updatedAt',at_time,
    'identityRecordId',NULL,'identityRecordHash',NULL,'identityEvidenceId',NULL,'identityEvidenceHash',NULL,
    'withdrawalReason',CASE WHEN r->>'status'='withdrawn' THEN '[erased]' ELSE NULL END,
    'state',r->'state'||jsonb_build_object('authorId',NULL,'reviewerId',NULL,'returnReason',NULL,'correctionReason',NULL,'withdrawalReason',CASE WHEN r->>'status'='withdrawn' THEN '[erased]' ELSE NULL END));
  ELSIF NOT owned THEN
   patch:=jsonb_build_object('version',(r->>'version')::int+1,'updatedAt',at_time,'state',r->'state'||jsonb_build_object(
    'authorId',CASE WHEN r->'state'->>'authorId'=uid THEN NULL ELSE r->'state'->>'authorId' END,
    'reviewerId',CASE WHEN r->'state'->>'reviewerId'=uid THEN NULL ELSE r->'state'->>'reviewerId' END));
  END IF;
  IF r->>'continuityRequestId' IS NOT NULL AND (patch->>'erasedAt' IS NOT NULL OR (r->'state'->>'authorId'=uid AND patch->'state'->>'authorId' IS NULL)) THEN
   patch:=patch||jsonb_build_object('continuityRequestId',NULL,'continuityRequestSessionId',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_reports',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_identity_records t WHERE t."orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) OR t."recordedById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'orderId' IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) THEN
   patch:=jsonb_build_object('observation',NULL,'observationHash',NULL,'recordedById',NULL,'erasedAt',COALESCE(r->>'erasedAt',at_time::text));
  ELSIF r->>'recordedById'=uid THEN patch:=jsonb_build_object('recordedById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_identity_records',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_identity_evidence t WHERE t."orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) OR t."recordedById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'orderId' IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) THEN
   patch:=jsonb_build_object('observationHash',NULL,'identifiers',NULL,'provenance',NULL,'rights',NULL,'explanation',NULL,'recordHash',NULL,'recordedById',NULL,'erasedAt',COALESCE(r->>'erasedAt',at_time::text));
  ELSIF r->>'recordedById'=uid THEN patch:=jsonb_build_object('recordedById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_identity_evidence',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_identity_provenance t WHERE t."orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) OR t."createdById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'orderId' IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL) THEN
   patch:=jsonb_build_object('rights',NULL,'createdById',NULL,'erasedAt',COALESCE(r->>'erasedAt',at_time::text),'state','cleanup_pending','epoch',gen_random_uuid()::text,'cleanupRequestedAt',COALESCE(r->>'cleanupRequestedAt',at_time::text),'cleanupCompletedAt',NULL);
  ELSIF r->>'createdById'=uid THEN patch:=jsonb_build_object('createdById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_identity_provenance',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_components t WHERE (t.state='available' AND t."identityRecordId" IN (SELECT jsonb_array_elements_text(dispose->'c'))) OR t."declaredById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'state'='available' AND dispose->'c' ? (r->>'identityRecordId') THEN
   patch:=jsonb_build_object('grantId',NULL,'scope',NULL,'sourceListingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,'businessId',NULL,'membershipId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredById',NULL,'declaredAt',NULL,'state','erased','erasedAt',at_time);
  ELSE patch:=jsonb_build_object('declaredById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_components',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_grants t WHERE t.state='available' AND t.id IN (SELECT jsonb_array_elements_text(dispose->'g')) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_grants',r,jsonb_build_object('listingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,'businessId',NULL,'membershipId',NULL,'grantorId',NULL,'grantorMembershipId',NULL,'sessionId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredAt',NULL,'state','erased','erasedAt',at_time),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_source_anchors t WHERE t.state<>'erased' AND (t.source->>'commissionerId'=uid OR t.source->'listing'->>'sellerId'=uid OR t.source->>'memberUserId'=uid
  OR t."firstRecordId" IN (SELECT jsonb_array_elements_text(dispose->'c'))
  OR t."orderId" IN (SELECT "orderId" FROM public.diagnostic_ownership_grants WHERE id IN (SELECT jsonb_array_elements_text(dispose->'g')))) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_source_anchors',r,jsonb_build_object('state','erased','source',NULL,'firstRecordId',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.inspection_orders t WHERE t."commissionerId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('inspection_orders',r,jsonb_build_object('commissionerId',NULL,'physicalAuthorization',NULL,'publicationAuthorization',NULL,'observedVehicle',NULL,'listingId',NULL,'listingIdentityDigest',NULL,'associationValidatedAt',NULL,'erasedAt',COALESCE(r->>'erasedAt',at_time::text),'epoch',gen_random_uuid()::text,'identityEvidenceGeneration',(r->>'identityEvidenceGeneration')::int+1,'version',(r->>'version')::int+1,'updatedAt',at_time),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_evidence t WHERE t."reportId" IN (SELECT id FROM public.diagnostic_reports WHERE "orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL)) OR t."createdById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'reportId' IN (SELECT id FROM public.diagnostic_reports WHERE "orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL)) THEN
   patch:=jsonb_build_object('state','cleanup_pending','epoch',gen_random_uuid()::text,'cleanupRequestedAt',COALESCE(r->>'cleanupRequestedAt',at_time::text),'cleanupCompletedAt',NULL)||jsonb_build_object('createdById',NULL);
  ELSIF r->>'createdById'=uid THEN patch:=jsonb_build_object('createdById',NULL);
  END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_evidence',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_pdf_artifacts t WHERE t."reportId" IN (SELECT id FROM public.diagnostic_reports WHERE "orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL)) LOOP
  r:=x.row; patch:='{}';
  IF r->>'reportId' IN (SELECT id FROM public.diagnostic_reports WHERE "orderId" IN (SELECT id FROM public.inspection_orders WHERE "commissionerId"=uid AND "erasedAt" IS NULL)) THEN
   patch:=jsonb_build_object('state','cleanup_pending','epoch',gen_random_uuid()::text,'cleanupRequestedAt',COALESCE(r->>'cleanupRequestedAt',at_time::text),'cleanupCompletedAt',NULL);
  END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_pdf_artifacts',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_template_versions t WHERE t."publishedById"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_template_versions',r,jsonb_build_object('publishedById',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_audits t WHERE t."actorId"=uid OR t."orderId"=ANY(own_orders) LOOP
  r:=x.row; patch:='{}';
  patch:=jsonb_build_object('details',r->'details'-'reason');
  IF r->>'actorId'=uid THEN patch:=patch||jsonb_build_object('actorId',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_audits',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_conversations t WHERE t.id=ANY(own_conversations) AND t."erasedAt" IS NULL LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_conversations',r,jsonb_build_object('erasedAt',at_time,'lifecycleEpoch',(r->>'lifecycleEpoch')::int+1),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_attachments t WHERE t."conversationId"=ANY(own_conversations) OR t."uploaderId"=uid LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'conversationId'=ANY(own_conversations);
  IF owned THEN
   SELECT purpose='history',"erasedAt" IS NULL INTO anonymous,fresh FROM public.service_conversations WHERE id=r->>'conversationId';
   SELECT EXISTS(SELECT 1 FROM public.service_erasure_fences WHERE "conversationId"=r->>'conversationId') INTO fenced;
   held:=COALESCE((r->'rights'->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz;
   anonymous:=anonymous AND r->>'category'='vehicle_observation' AND r->'rights'->>'identifiability'='anonymous' AND r->'rights'->'schedule'->>'kind'='permitted_knowledge';
   IF (fresh OR fenced) AND (r->>'objectKey' IS NULL OR (fresh AND NOT held AND anonymous IS FALSE) OR EXISTS
    (SELECT 1 FROM public.service_erasure_fences f WHERE f."conversationId"=r->>'conversationId' AND f."objectKeys" ? (r->>'objectKey'))) THEN
    patch:=jsonb_build_object('state','removed','removedAt',at_time,'uploaderId',NULL); END IF;
  END IF;
  IF r->>'uploaderId'=uid THEN patch:=patch||jsonb_build_object('uploaderId',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_attachments',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_messages t WHERE t."senderId"=uid AND NOT(t."conversationId"=ANY(own_conversations)) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_messages',r,jsonb_build_object('senderId',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.service_audits t WHERE t."actorId"=uid OR t."resourceId"=ANY(own_support) OR t."resourceId"=ANY(own_history) LOOP
  r:=x.row; patch:='{}';
  patch:=jsonb_build_object('reason',NULL);
  IF r->>'actorId'=uid THEN patch:=patch||jsonb_build_object('actorId',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('service_audits',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.support_cases t WHERE t."customerId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('support_cases',r,jsonb_build_object('customerId',NULL,'assigneeId',NULL,'sourceListingId',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.vehicle_history_requests t WHERE t."customerId"=uid LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('vehicle_history_requests',r,jsonb_build_object('customerId',NULL,'assigneeId',NULL,'sourceListingId',NULL,'proposedVin',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_deliveries t WHERE t."orderId"=ANY(own_history_orders) OR t."deliveredById"=uid LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_history_orders);
  SELECT COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz INTO held FROM public.history_orders WHERE id=r->>'orderId';
  IF owned THEN patch:=jsonb_build_object('sharedLink',NULL,'deliveredById',NULL,'erasedAt',at_time); END IF;
  IF r->>'deliveredById'=uid THEN patch:=patch||jsonb_build_object('deliveredById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_deliveries',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_payments t WHERE t."orderId"=ANY(own_history_orders) OR t."confirmedById"=uid LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_history_orders);
  SELECT COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz INTO held FROM public.history_orders WHERE id=r->>'orderId';
  IF owned AND NOT COALESCE(held,false) THEN patch:=jsonb_build_object('claim',NULL,'attachmentId',NULL,'evidence',NULL,'confirmedById',NULL); END IF;
  IF r->>'confirmedById'=uid THEN patch:=patch||jsonb_build_object('confirmedById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_payments',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_purchase_intents t WHERE t."orderId"=ANY(own_history_orders) OR t."createdById"=uid LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_history_orders);
  SELECT COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz INTO held FROM public.history_orders WHERE id=r->>'orderId';
  IF owned THEN patch:=jsonb_build_object('vin',NULL,'externalReference',NULL,'createdById',NULL); END IF;
  IF r->>'createdById'=uid THEN patch:=patch||jsonb_build_object('createdById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_purchase_intents',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_refunds t WHERE t."orderId"=ANY(own_history_orders) OR t."approvedById"=uid OR t."executedById"=uid LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_history_orders);
  SELECT COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz INTO held FROM public.history_orders WHERE id=r->>'orderId';
  IF owned AND NOT COALESCE(held,false) THEN patch:=jsonb_build_object('approvedById',NULL,'executedById',NULL,'reason','[erased]','executionReference',CASE WHEN r->>'state'='executed' THEN '[erased]' ELSE NULL END); END IF;
  IF r->>'approvedById'=uid THEN patch:=patch||jsonb_build_object('approvedById',NULL); END IF;
  IF r->>'executedById'=uid THEN patch:=patch||jsonb_build_object('executedById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_refunds',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_bookings t WHERE t."orderId"=ANY(own_history_orders) LOOP
  r:=x.row; patch:='{}';
  owned:=r->>'orderId'=ANY(own_history_orders);
  SELECT COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz INTO held FROM public.history_orders WHERE id=r->>'orderId';
  IF owned THEN patch:=jsonb_build_object('vin',NULL,'erasedAt',at_time); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_bookings',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_orders t WHERE t.id=ANY(own_history_orders) LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_orders',r,jsonb_build_object('erasedAt',at_time,'rights',jsonb_build_object('category','payment_evidence','schedule',r->'rights'->'schedule','hold',r->'rights'->'hold')),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_artifacts t WHERE t."acquiredForOrderId"=ANY(own_history_orders) OR t."verifiedById"=uid LOOP
  r:=x.row; patch:='{}';
  IF r->>'acquiredForOrderId'=ANY(own_history_orders) THEN
   patch:=jsonb_build_object('acquiredForOrderId',NULL,'sourceListingId',NULL,'verifiedById',NULL,'provenance',NULL);
   IF NOT COALESCE(r->'rights'->>'identifiability'='anonymous' AND r->'rights'->'use' ? 'archive' AND r->'rights'->'use' ? 'redistribute',false) THEN
    patch:=patch||jsonb_build_object('restrictedAt',at_time,'vehicleIdentity',NULL,'mileageValue',NULL,'mileageUnit',NULL,'mileageObservedAt',NULL,'sourceObservations','[]'::jsonb,'state','restricted'); END IF;
  END IF;
  IF r->>'verifiedById'=uid THEN patch:=patch||jsonb_build_object('verifiedById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_artifacts',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.history_quotes t WHERE t."offeredById"=uid OR (t."erasedAt" IS NULL AND EXISTS (SELECT 1 FROM public.vehicle_history_requests h JOIN public.service_conversations v ON v."historyRequestId"=h.id WHERE h.id=t."requestId" AND (h."customerId"=uid OR (h."customerId" IS NULL AND v."erasedAt" IS NOT NULL)))) LOOP
  r:=x.row; patch:='{}';
  IF r->>'erasedAt' IS NULL AND EXISTS (SELECT 1 FROM public.vehicle_history_requests h JOIN public.service_conversations v ON v."historyRequestId"=h.id WHERE h.id=r->>'requestId' AND (h."customerId"=uid OR (h."customerId" IS NULL AND v."erasedAt" IS NOT NULL))) THEN
   patch:=jsonb_build_object('vin',NULL,'preflightEvidence',NULL,'offeredById',NULL,'erasedAt',at_time);
  ELSIF r->>'offeredById'=uid THEN patch:=jsonb_build_object('offeredById',NULL); END IF;
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('history_quotes',r,patch,false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.media_uploads t WHERE (t.id=ANY(own_video) OR t.id=account."avatarUploadId") AND t.state NOT IN ('RETIRED','DELETED') LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('media_uploads',r,jsonb_build_object('state','RETIRED','retiredAt',at_time,'claimToken',NULL,'claimDeadline',NULL),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.video_upload_sessions t WHERE t."uploadId"=ANY(own_video) AND t.state NOT IN ('CLEANUP_PENDING','DELETED') LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_upload_sessions',r,jsonb_build_object('state','CLEANUP_PENDING','cancelledAt',at_time,'updatedAt',at_time),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.video_generations t WHERE t."uploadId"=ANY(own_video) AND t.state<>'RETIRED' LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_generations',r,jsonb_build_object('state','RETIRED','retiredAt',at_time),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.video_process_work t WHERE t."uploadId"=ANY(own_video) AND t.state IN ('PENDING','PROCESSING') LOOP
  r:=x.row; patch:='{}';
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_process_work',r,jsonb_build_object('state','CANCELLED','lastError','VIDEO_ACCOUNT_PURGED','updatedAt',at_time),false));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.video_grants t WHERE
 (t."revokedAt" IS NULL AND (t."ownerUserId"=uid OR t."generationId" IN (SELECT id FROM public.video_generations WHERE "uploadId"=ANY(own_video))))
 OR t."ownerSessionId" IN (SELECT id FROM public.sessions WHERE "userId"=uid) LOOP
  r:=x.row;
  IF r->>'ownerSessionId' IN (SELECT id FROM public.sessions WHERE "userId"=uid) THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_grants',r,'{}',true));
  ELSE effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('video_grants',r,jsonb_build_object('revokedAt',at_time))); END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(v) AS row FROM public.service_conversations v WHERE v.id=ANY(own_conversations) AND v."erasedAt" IS NULL LOOP
  r:=x.row;
  SELECT COALESCE(jsonb_agg(a."objectKey") FILTER (WHERE a."objectKey" IS NOT NULL),'[]') INTO keys FROM public.service_attachments a
   WHERE a."conversationId"=r->>'id' AND NOT(COALESCE((a.rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz)>at_time::timestamptz)
   AND NOT(r->>'purpose'='history' AND a.category='vehicle_observation' AND a.rights->>'identifiability'='anonymous' AND a.rights->'schedule'->>'kind'='permitted_knowledge');
  prior:=public.diagnostic_source_read('service_erasure_fences',jsonb_build_object('conversationId',r->>'id'));
  patch:=COALESCE(prior,jsonb_build_object('conversationId',r->>'id','erasedAt',at_time,'cleanupCompletedAt',NULL))||jsonb_build_object('epoch',(r->>'lifecycleEpoch')::int+1,'objectKeys',COALESCE(prior->'objectKeys','[]')||keys,'cleanupCompletedAt',NULL);
  effects:=effects||jsonb_build_array(jsonb_build_object('table','service_erasure_fences','key',jsonb_build_object('conversationId',r->>'id'),'verb',CASE WHEN prior IS NULL THEN 'insert' ELSE 'update' END,'expected',CASE WHEN prior IS NULL THEN '"absent"'::jsonb ELSE jsonb_build_object('source',prior) END,'next',public.diagnostic_source_normalize('service_erasure_fences',patch),'derived','purge'));
 END LOOP;
 FOR x IN SELECT to_jsonb(u) AS row FROM public.media_uploads u WHERE u.id=account."avatarUploadId" AND u.state NOT IN ('RETIRED','DELETED') LOOP
  r:=x.row;
  IF NOT EXISTS(SELECT 1 FROM public.media_upload_cleanups WHERE "uploadId"=r->>'id') THEN
   patch:=jsonb_build_object('uploadId',r->>'id','key',r->'key','objectKeys',r->'objectKeys','writeProtocol',r->'writeProtocol','status',CASE WHEN r->>'writeProtocol'='conditional-v1' THEN 'PENDING' ELSE 'LEGACY_PENDING' END,'attempts',0,'nextAttemptAt',at_time,'lastError',NULL,'createdAt',at_time,'completedAt',NULL);
   effects:=effects||jsonb_build_array(jsonb_build_object('table','media_upload_cleanups','key',jsonb_build_object('uploadId',r->>'id'),'verb','insert','expected','absent','next',public.diagnostic_source_normalize('media_upload_cleanups',patch),'derived','purge'));
  END IF;
 END LOOP;
 -- Durable exact inventory precedes retirement; malformed V1 refuses atomically.
 FOR x IN SELECT to_jsonb(u) AS row FROM public.media_uploads u WHERE u.id=ANY(own_video) AND u.state NOT IN ('RETIRED','DELETED') LOOP
  r:=x.row;
  SELECT to_jsonb(v)||jsonb_build_object('generation',to_jsonb(g),'work',to_jsonb(w),'cleanup',to_jsonb(z)) INTO prior
   FROM public.video_upload_sessions v JOIN public.video_generations g ON g.id=v.id AND g."uploadId"=v."uploadId"
   LEFT JOIN public.video_process_work w ON w."generationId"=g.id LEFT JOIN public.video_cleanup_work z ON z.id='session:'||v.id
   WHERE v."uploadId"=r->>'id';
  IF prior IS NULL OR r->>'kind'<>'video' OR prior->>'protocolVersion' IS DISTINCT FROM '1' OR prior->>'sourceKey' IS DISTINCT FROM
   'video/v1/'||(r->>'id')||'/'||(prior->>'id')||'/source.mp4' OR r->>'key' IS DISTINCT FROM prior->>'sourceKey'
   OR (prior->'generation'->'manifest'<>'null' AND (jsonb_typeof(prior->'generation'->'manifest'->'assets') IS DISTINCT FROM 'array'
    OR jsonb_array_length(CASE WHEN jsonb_typeof(prior->'generation'->'manifest'->'assets')='array' THEN prior->'generation'->'manifest'->'assets' ELSE '[]'::jsonb END)>1024)) THEN RAISE EXCEPTION 'diagnostic_source_purge_video_inventory'; END IF;
  SELECT COALESCE(jsonb_agg(k ORDER BY k),'[]') INTO keys FROM (
   SELECT DISTINCT a->>'key' k FROM jsonb_array_elements(COALESCE(NULLIF(prior->'generation'->'manifest'->'assets','null'),'[]')) a
   UNION SELECT jsonb_array_elements_text(COALESCE(NULLIF(prior->'cleanup'->'objectKeys','null'),'[]'))
  ) z WHERE k IS NOT NULL;
  IF jsonb_array_length(keys)>1024 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(keys) z(k) WHERE
   k NOT LIKE 'video/v1/'||(r->>'id')||'/'||(prior->>'id')||'/%' OR substring(k FROM length('video/v1/'||(r->>'id')||'/'||(prior->>'id')||'/')+1)
    !~ '^(master\.m3u8|poster\.jpg|(240|360|720)/(index\.m3u8|seg-[0-9]+\.ts))$') THEN RAISE EXCEPTION 'diagnostic_source_purge_video_inventory'; END IF;
  patch:=COALESCE(NULLIF(prior->'cleanup','null'),jsonb_build_object('id','session:'||(prior->>'id'),'uploadId',r->>'id','sessionId',prior->>'id','generationId',prior->>'id',
   'writeProtocol','video-v1','sourceKey',prior->>'sourceKey','storageUploadId',prior->'storageUploadId','attempts',0,'lastError',NULL,'createdAt',at_time))||jsonb_build_object(
   'objectKeys',keys,'state','PENDING','nextAttemptAt',GREATEST(at_time+interval '15 minutes',COALESCE((prior->'work'->>'leaseExpiresAt')::timestamp,at_time))+interval '2 minutes',
   'completedAt',NULL,'leaseToken',NULL,'leaseExpiresAt',NULL,'updatedAt',at_time);
  effects:=effects||jsonb_build_array(jsonb_build_object('table','video_cleanup_work','key',jsonb_build_object('id','session:'||(prior->>'id')),
   'verb',CASE WHEN prior->'cleanup'='null' THEN 'insert' ELSE 'update' END,
   'expected',CASE WHEN prior->'cleanup'='null' THEN '"absent"'::jsonb ELSE jsonb_build_object('source',public.diagnostic_source_project(prior->'cleanup',public.diagnostic_source_meta('video_cleanup_work')->'fields')) END,
   'next',public.diagnostic_source_normalize('video_cleanup_work',patch),'derived','purge'));
 END LOOP;
 RETURN effects;
END $$;


-- The ownership worker and explicit revocation share one persisted disposal
-- selector. Source intent names grants; proof/component/anchor plans are refused.
CREATE FUNCTION public.diagnostic_source_disposal_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb:='[]'; e jsonb; d jsonb; x record; r jsonb; patch jsonb; at_time timestamp:=COALESCE((c->>'cutoff')::timestamp,clock_timestamp() AT TIME ZONE 'UTC');
 components jsonb:='[]'; orders jsonb:='[]'; grants jsonb:='[]'; raw_ids jsonb:='[]';
BEGIN
 SELECT COALESCE((c->>'cutoff')::timestamp,min(COALESCE((z->'next'->>'erasedAt')::timestamp,(z->'next'->>'cleanupRequestedAt')::timestamp)),at_time) INTO at_time FROM jsonb_array_elements(c->'rows') z;
 IF at_time>clock_timestamp() AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'diagnostic_source_future_cutoff'; END IF;
 IF c->>'operation' IN ('ownership_revoke','ownership_expire') THEN
  FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='diagnostic_ownership_grants' LOOP
   IF e->>'verb'<>'update' OR e->'next'->>'state'<>'erased' THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
   IF c->>'operation'='ownership_expire' AND (e->'expected'->'source'->>'rightsUntil')::timestamp>at_time THEN RAISE EXCEPTION 'diagnostic_source_disposal_not_due'; END IF;
   d:=public.diagnostic_ownership_disposal_scope(NULL,at_time,e->'key'->>'id');
   components:=components||d->'c'; grants:=grants||d->'g';
  END LOOP;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table' IN ('diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance') LOOP
  IF e->>'verb'='delete' OR e->'next'->>'erasedAt' IS NOT NULL OR e->'next'->>'cleanupRequestedAt' IS NOT NULL THEN
   orders:=orders||jsonb_build_array(e->'expected'->'source'->>'orderId');
   IF e->>'table'='diagnostic_identity_records' THEN raw_ids:=raw_ids||jsonb_build_array(e->'key'->>'id'); END IF;
  END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_components t WHERE
  (t.state='available' AND components ? t."identityRecordId") OR (t.state='available' AND raw_ids ? t."identityRecordId") LOOP
  r:=x.row; orders:=orders||jsonb_build_array(r->>'orderId');
  patch:=jsonb_build_object('state','erased','grantId',NULL,'scope',NULL,'sourceListingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,
   'businessId',NULL,'membershipId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredById',NULL,'declaredAt',NULL,'erasedAt',at_time);
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_components',r,patch));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_ownership_grants t WHERE t.state='available' AND grants ? t.id LOOP
  r:=x.row;
  patch:=jsonb_build_object('state','erased','listingId',NULL,'identityDigest',NULL,'sellerId',NULL,'commissionerId',NULL,'businessId',NULL,'membershipId',NULL,
   'grantorId',NULL,'grantorMembershipId',NULL,'sessionId',NULL,'rights',NULL,'rightsUntil',NULL,'declaredAt',NULL,'erasedAt',at_time);
  -- The grant is the intended source row, but its actual erasure tuple is fixed
  -- by policy. It cannot preserve a writable fake payload in a purported erasure.
  SELECT value INTO e FROM jsonb_array_elements(c->'rows') z WHERE z->>'table'='diagnostic_ownership_grants' AND z->'key'->>'id'=r->>'id';
  IF e IS NOT NULL AND e->'next' IS DISTINCT FROM public.diagnostic_source_normalize('diagnostic_ownership_grants',r||patch) THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
  IF e IS NULL THEN effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_ownership_grants',r,patch)); END IF;
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_continuity_proofs t WHERE orders ? t."candidateOrderId" OR orders ? t."predecessorOrderId" LOOP
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_proofs',x.row,'{}',true));
 END LOOP;
 FOR x IN SELECT to_jsonb(t) AS row FROM public.diagnostic_source_anchors t WHERE t.state<>'erased' AND
  (components ? t."firstRecordId" OR raw_ids ? t."firstRecordId" OR t."orderId" IN (SELECT "orderId" FROM public.diagnostic_ownership_grants WHERE grants ? id)) LOOP
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_source_anchors',x.row,jsonb_build_object('state','erased','source',NULL,'firstRecordId',NULL)));
 END LOOP;
 RETURN effects;
END $$;
-- Purge has one intended source mutation. The caller cannot declare its effects.
ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_purge;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE parsed jsonb; effect jsonb;
BEGIN
 parsed:=public.diagnostic_source_parse_before_purge(c);
 IF parsed->>'operation' IN ('ownership_revoke','ownership_expire') AND EXISTS(SELECT 1 FROM jsonb_array_elements(parsed->'rows') x WHERE x->>'table' NOT IN ('diagnostic_ownership_grants','diagnostic_audits')) THEN RAISE EXCEPTION 'diagnostic_source_disposal_intent'; END IF;
 PERFORM public.diagnostic_source_disposal_effects(parsed);
 IF parsed->>'operation'='account_purge' THEN
  IF jsonb_array_length(parsed->'roots')<>1 OR parsed->'roots'->0->>'table'<>'users'
   OR jsonb_array_length(parsed->'rows')<>1 OR parsed->'rows'->0->>'table'<>'users'
   OR parsed->'rows'->0->>'verb'<>'update' OR parsed->'rows'->0->'key' IS DISTINCT FROM parsed->'roots'->0->'key' THEN
   RAISE EXCEPTION 'diagnostic_source_purge_intent'; END IF;
  SELECT value INTO effect FROM jsonb_array_elements(public.diagnostic_account_purge_effects(parsed)) WHERE value->>'table'='users';
  IF parsed->'rows'->0->'next' IS DISTINCT FROM effect->'next' THEN RAISE EXCEPTION 'diagnostic_source_purge_intent'; END IF;
 END IF;
 RETURN parsed;
END $$;

-- Every derived target, including absent cleanup keys, joins discovery BEFORE locks.
ALTER FUNCTION public.diagnostic_source_scope(jsonb) RENAME TO diagnostic_source_scope_before_purge;
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE roots jsonb:=c->'roots'; e jsonb;
BEGIN
 IF c->>'operation'='account_purge' THEN
  FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_account_purge_effects(c)) LOOP
   roots:=roots||jsonb_build_array(jsonb_build_object('table',e->'table','key',e->'key'));
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(roots) x WHERE x->>'table' LIKE 'measurement_%') THEN
   roots:=roots||jsonb_build_array(jsonb_build_object('table','measurement_state','key',jsonb_build_object('key','collector'))); END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_disposal_effects(c)) LOOP
  roots:=roots||jsonb_build_array(jsonb_build_object('table',e->'table','key',e->'key')); END LOOP;
 RETURN public.diagnostic_source_scope_before_purge(c||jsonb_build_object('roots',roots));
END $$;
ALTER FUNCTION public.diagnostic_source_effects(jsonb,jsonb) RENAME TO diagnostic_source_effects_before_purge;
CREATE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; e jsonb; q record;
BEGIN
 IF c->>'operation'='account_purge' THEN
  effects:=public.diagnostic_account_purge_effects(c);
  -- Required invalidations of retained foreign proofs still use existing triggers.
  FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_effects_before_purge(c,scope))
   WHERE value->>'derived'='invalidation' LOOP
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(effects) p WHERE p->'table'=e->'table' AND p->'key'=e->'key') THEN
    e:=e||jsonb_build_object('required',EXISTS(SELECT 1 FROM jsonb_array_elements(effects) p WHERE public.diagnostic_source_invalidates(p,e->'next') IS TRUE));
    effects:=effects||jsonb_build_array(e); END IF;
  END LOOP;
 ELSE
  effects:=public.diagnostic_source_effects_before_purge(c,scope);
  FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_disposal_effects(c)) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'rows') p WHERE p->'table'=e->'table' AND p->'key'=e->'key') THEN RAISE EXCEPTION 'diagnostic_source_overlapping_derived_effect'; END IF;
   effects:=COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(effects) p WHERE NOT(p->'table'=e->'table' AND p->'key'=e->'key')),'[]')||jsonb_build_array(e);
  END LOOP;
 END IF;
 -- Actual request trigger and Session/order FK effects. Surviving report minimum
 -- proof ID/order-version remains immutable; only its personal request pair clears.
 FOR q IN SELECT to_jsonb(r) AS row FROM public.diagnostic_continuity_requests r WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(effects) p WHERE
   (p->>'table'='diagnostic_continuity_proofs' AND p->>'verb'='delete' AND p->'expected'->'source'->>'requestId'=r.id)
   OR (p->>'table'='sessions' AND p->>'verb'='delete' AND p->'key'->>'id'=r."sessionId")
   OR (p->>'table'='inspection_orders' AND p->'next'->>'erasedAt' IS NOT NULL AND p->'key'->>'id'=r."orderId")
   OR (p->>'table'='diagnostic_reports' AND p->'expected'->'source'->>'continuityRequestId'=r.id
    AND (p->>'verb'='delete' OR p->'next'->>'erasedAt' IS NOT NULL OR (p->'expected'->'source'->'state'->>'authorId' IS NOT NULL AND p->'next'->'state'->>'authorId' IS NULL)))
 ) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(effects) e WHERE e->>'table'='diagnostic_continuity_requests' AND e->'key'->>'id'=q.row->>'id') THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_requests',q.row,'{}',true)); END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(effects) e WHERE NOT EXISTS
  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=e->'table' AND n->'key'=e->'key')) THEN RAISE EXCEPTION 'diagnostic_source_effect_outside_scope'; END IF;
 RETURN effects;
END $$;

-- Intermediate owner writes may clear the same attribution twice. They may only
-- move fields between their persisted OLD and server-derived final values.
-- Completion below demands the entire final tuple; no partial tuple can commit.
CREATE FUNCTION public.diagnostic_purge_tuple(e jsonb,r jsonb,final boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE f text; v jsonb; old_row jsonb:=e->'expected'->'source'; target jsonb:=e->'next';
BEGIN
 IF r IS NULL THEN RETURN false; END IF;
 FOR f,v IN SELECT key,value FROM jsonb_each(target) LOOP
  IF r->f IS NOT DISTINCT FROM v THEN CONTINUE; END IF;
  IF NOT final AND r->f IS NOT DISTINCT FROM old_row->f THEN CONTINUE; END IF;
  IF f='epoch' AND target->f IS DISTINCT FROM old_row->f AND jsonb_typeof(v)='string'
   AND r->>f ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND r->f IS DISTINCT FROM old_row->f THEN CONTINUE; END IF;
  IF f='createdAt' AND e->>'verb'='insert' AND (r->>f)::timestamp>=date_trunc('milliseconds',transaction_timestamp()::timestamp)
   AND (r->>f)::timestamp<=clock_timestamp()::timestamp+interval '1 millisecond' THEN CONTINUE; END IF;
  IF f='objectKeys' AND e->>'table' IN ('service_erasure_fences','video_cleanup_work')
   AND (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(r->f)) IS NOT DISTINCT FROM
       (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(v)) THEN CONTINUE; END IF;
  RETURN false;
 END LOOP;
 RETURN true;
END $$;
ALTER FUNCTION public.diagnostic_assert_source_write(text,text,jsonb,jsonb) RENAME TO diagnostic_assert_source_write_before_purge;
CREATE FUNCTION public.diagnostic_assert_source_write(table_name text,operation text,old_row jsonb,new_row jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE receipt public.diagnostic_source_commands; e jsonb; k jsonb; old_source jsonb; new_source jsonb;
BEGIN
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 k:=public.diagnostic_source_key(table_name,COALESCE(old_row,new_row));
 SELECT value INTO e FROM jsonb_array_elements(receipt.effects) p WHERE p->>'table'=table_name AND p->'key'=k;
 IF e->>'derived' IS DISTINCT FROM 'purge' THEN
  PERFORM public.diagnostic_assert_source_write_before_purge(table_name,operation,old_row,new_row); RETURN; END IF;
 old_source:=public.diagnostic_source_project(old_row,public.diagnostic_source_meta(table_name)->'fields');
 new_source:=public.diagnostic_source_project(new_row,public.diagnostic_source_meta(table_name)->'fields');
 IF e->>'verb'='delete' THEN
  -- Existing invalidation can run before a proof payload is disposed. No other
  -- intermediate mutation or late scope extension is authorized by this branch.
  IF operation='UPDATE' AND table_name='diagnostic_continuity_proofs' AND
   (old_source-'invalidatedAt') IS NOT DISTINCT FROM ((e->'expected'->'source')-'invalidatedAt') AND
   (new_source-'invalidatedAt') IS NOT DISTINCT FROM (old_source-'invalidatedAt') AND new_source->>'invalidatedAt' IS NOT NULL THEN RETURN; END IF;
  IF operation='UPDATE' AND table_name='video_grants' AND (new_source-'revokedAt') IS NOT DISTINCT FROM (old_source-'revokedAt')
   AND old_source IS NOT DISTINCT FROM e->'expected'->'source' AND (new_source->>'revokedAt')::timestamp=(receipt.command->>'cutoff')::timestamp THEN RETURN; END IF;
  IF operation<>'DELETE' OR (old_source IS DISTINCT FROM e->'expected'->'source'
   AND NOT(table_name='diagnostic_continuity_proofs' AND (old_source-'invalidatedAt') IS NOT DISTINCT FROM ((e->'expected'->'source')-'invalidatedAt'))
   AND NOT(table_name='video_grants' AND (old_source-'revokedAt') IS NOT DISTINCT FROM ((e->'expected'->'source')-'revokedAt'))) THEN RAISE EXCEPTION 'diagnostic_source_effect_mismatch'; END IF;
 ELSE
  IF operation<>upper(e->>'verb') OR public.diagnostic_purge_tuple(e,new_source,false) IS NOT TRUE
   OR (operation='UPDATE' AND public.diagnostic_purge_tuple(e,old_source,false) IS NOT TRUE) THEN RAISE EXCEPTION 'diagnostic_source_effect_mismatch'; END IF;
 END IF;
END $$;

-- A second completion trigger augments the existing source/anchor checks. It is
-- shared by finish and direct DELETE. Derived fields stay server-owned on INSERT.
CREATE FUNCTION public.diagnostic_purge_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; actual jsonb;
BEGIN
 PERFORM public.diagnostic_assert_source(OLD.id,OLD.command->>'operation');
 FOR e IN SELECT value FROM jsonb_array_elements(OLD.effects) WHERE value->>'derived'='purge' LOOP
  actual:=public.diagnostic_source_project(public.diagnostic_source_read(e->>'table',e->'key'),public.diagnostic_source_meta(e->>'table')->'fields');
  IF e->>'verb'='delete' THEN
   IF actual IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
  ELSIF public.diagnostic_purge_tuple(e,actual,true) IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
 END LOOP;
 RETURN OLD;
END $$;
CREATE TRIGGER diagnostic_purge_completion BEFORE DELETE ON public.diagnostic_source_commands FOR EACH ROW EXECUTE FUNCTION public.diagnostic_purge_completion();

-- Dependency-only writes keep their ordinary ownership/lease protocol. When a
-- source receipt is live, its selected union is mandatory and cannot be widened.
CREATE FUNCTION public.diagnostic_purge_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation'='account_purge') THEN
  PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $install$
DECLARE t text;
BEGIN
 FOR t IN SELECT value->>'table' FROM jsonb_array_elements(public.diagnostic_source_registry()) WHERE value->>'table' NOT IN
  (SELECT value->>'table' FROM jsonb_array_elements(public.diagnostic_source_guard_specs())) LOOP
  EXECUTE format('CREATE TRIGGER zz_diagnostic_source_purge BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.diagnostic_purge_row_guard()',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zz_diagnostic_source_purge',t);
 END LOOP;
END $install$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE e jsonb; actual jsonb; m jsonb;
BEGIN
 PERFORM public.diagnostic_assert_source(OLD.id,OLD.command->>'operation');
 FOR e IN SELECT value FROM jsonb_array_elements(OLD.effects) WHERE value->>'derived' IS DISTINCT FROM 'purge' LOOP
  m:=public.diagnostic_source_meta(e->>'table'); actual:=public.diagnostic_source_project(public.diagnostic_source_read(e->>'table',e->'key'),m->'fields');
  IF e->>'derived'='invalidation' THEN
   IF (e->>'required')::boolean IS TRUE AND actual->'invalidatedAt'='null' THEN RAISE EXCEPTION 'diagnostic_source_missing_invalidation'; END IF;
   IF actual IS NULL OR (actual-'invalidatedAt') IS DISTINCT FROM ((e->'next')-'invalidatedAt') THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
  ELSIF e->>'verb'='delete' THEN
   IF actual IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
  ELSIF actual IS DISTINCT FROM e->'next' THEN RAISE EXCEPTION 'diagnostic_source_final_effect'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_anchors a WHERE a."firstRecordId" IS NULL AND a.state<>'erased'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.command->'rows') r WHERE r->>'table'='diagnostic_identity_records' AND r->>'verb'='insert' AND r->'next'->>'orderId'=a."orderId")) THEN RAISE EXCEPTION 'diagnostic_source_unsealed_anchor'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.command->'rows') r WHERE r->>'table'='inspection_orders' AND r->>'verb'='insert'
  AND NOT EXISTS (SELECT 1 FROM public.diagnostic_source_anchors a WHERE a."orderId"=r->'key'->>'id')) THEN RAISE EXCEPTION 'diagnostic_source_missing_anchor'; END IF;
 RETURN OLD;
END $$;

ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_purge;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_purge() AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_registry()) m WHERE m->>'table' NOT IN
   (SELECT value->>'table' FROM jsonb_array_elements(public.diagnostic_source_guard_specs()))
  AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
   AND t.tgname='zz_diagnostic_source_purge' AND t.tgenabled='O' AND t.tgfoid='public.diagnostic_purge_row_guard()'::regprocedure))
$$;
