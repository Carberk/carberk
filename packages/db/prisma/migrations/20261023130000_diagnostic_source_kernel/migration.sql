-- Expansion only. Automatic ownership admission remains CLOSED. No legacy anchor backfill.
-- All existing migrations and their retained mirrors remain immutable.
CREATE FUNCTION public.diagnostic_source_registry() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $registry$
 SELECT '[
  {"table":"users","pk":["id"],"fields":["id","phone","phoneVerifiedAt","email","emailVerifiedAt","role","suspendedAt","deletionScheduledAt"],"unique":[["phone"],["email"],["avatarUploadId"]],"refs":[{"table":"media_uploads","columns":["avatarUploadId"],"target":["id"]},{"table":"users","columns":["suspendedById"],"target":["id"]}],"rank":1,"namespace":897100},
  {"table":"dealerships","pk":["id"],"fields":["id","status","admissionMode","admittedAt"],"unique":[["slug"]],"refs":[],"rank":2,"namespace":897200},
  {"table":"dealership_members","pk":["id"],"fields":["id","userId","dealershipId","role","status"],"unique":[["userId"]],"refs":[{"table":"dealerships","columns":["dealershipId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":3,"namespace":897300},
  {"table":"listings","pk":["id"],"fields":["id","sellerId","businessId","vin","brandId","modelId","year","deletedAt","status"],"unique":[["publicNumber"]],"refs":[{"table":"video_generations","columns":["pendingVideoGenerationId"],"target":["id"]},{"table":"video_generations","columns":["activeVideoGenerationId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":4,"namespace":897400},
  {"table":"listing_drafts","pk":["id"],"fields":["businessId","id","userId","payload","createdAt","updatedAt"],"unique":[],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":4,"namespace":897401},
  {"table":"inspection_orders","pk":["id"],"fields":["id","centerId","templateVersionId","commissionerId","requestKey","audience","listingId","status","version","epoch","physicalAuthorization","publicationAuthorization","observedVehicle","listingIdentityDigest","associationValidatedAt","identityEvidenceGeneration","synthetic","createdAt","updatedAt","erasedAt"],"unique":[["commissionerId","requestKey"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"diagnostic_template_versions","columns":["templateVersionId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":5,"namespace":897500},
  {"table":"diagnostic_reports","pk":["id"],"fields":["id","orderId","templateVersionId","predecessorId","reinspection","audience","status","version","state","snapshot","snapshotHash","identityRecordId","identityRecordHash","identityEvidenceId","identityEvidenceHash","continuityRequestId","continuityRequestSessionId","continuityProofId","reinspectionOrderVersion","finalizedAt","withdrawnAt","withdrawalReason","createdAt","updatedAt","erasedAt"],"unique":[["predecessorId"],["continuityRequestId"],["continuityProofId"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"diagnostic_template_versions","columns":["templateVersionId"],"target":["id"]},{"table":"diagnostic_reports","columns":["predecessorId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"diagnostic_identity_evidence","columns":["identityEvidenceId"],"target":["id"]}],"rank":6,"namespace":897600},
  {"table":"diagnostic_centers","pk":["id"],"fields":["id","code","planCode","names","operationalApproval","createdAt"],"unique":[["code"]],"refs":[],"rank":7,"namespace":897700},
  {"table":"diagnostic_template_versions","pk":["id"],"fields":["id","centerId","version","definition","synthetic","publishedById","publishedAt"],"unique":[["centerId","version"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"users","columns":["publishedById"],"target":["id"]}],"rank":7,"namespace":897701},
  {"table":"diagnostic_center_assignments","pk":["id"],"fields":["id","centerId","userId","capability","qualifiedUntil","assignedAt","revokedAt"],"unique":[["centerId","userId","capability"]],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897702},
  {"table":"diagnostic_order_assignments","pk":["id"],"fields":["id","orderId","userId","capability","assignedAt","revokedAt"],"unique":[["orderId","userId","capability"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897703},
  {"table":"staff_grants","pk":["userId","capability"],"fields":["userId","capability","grantedAt","revokedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897704},
  {"table":"sessions","pk":["id"],"fields":["id","userId","expiresAt","adminTotpExpiresAt"],"unique":[["refreshTokenHash"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897705},
  {"table":"totp_enrollments","pk":["id"],"fields":["id","userId","encryptedSecret","verifiedAt","createdAt","updatedAt"],"unique":[["userId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":7,"namespace":897706},
  {"table":"totp_backup_codes","pk":["id"],"fields":["id","totpEnrollmentId","codeHash","usedAt"],"unique":[],"refs":[{"table":"totp_enrollments","columns":["totpEnrollmentId"],"target":["id"]}],"rank":7,"namespace":897707},
  {"table":"diagnostic_continuity_proofs","pk":["id"],"fields":["requestId","id","predecessorReportId","candidateOrderId","predecessorOrderId","issuerId","issuerSessionId","linkingTechnicianId","content","bindings","rightsUntil","issuedAt","invalidatedAt","consumedReportId","consumedAt","erasedAt"],"unique":[["requestId"],["consumedReportId"]],"refs":[{"table":"diagnostic_reports","columns":["predecessorReportId"],"target":["id"]},{"table":"inspection_orders","columns":["candidateOrderId"],"target":["id"]},{"table":"inspection_orders","columns":["predecessorOrderId"],"target":["id"]},{"table":"users","columns":["issuerId"],"target":["id"]},{"table":"users","columns":["linkingTechnicianId"],"target":["id"]},{"table":"sessions","columns":["issuerSessionId"],"target":["id"]}],"rank":8,"namespace":897800},
  {"table":"diagnostic_continuity_requests","pk":["id"],"fields":["id","createdAt","actorId","sessionId","orderId","kind"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]},{"table":"sessions","columns":["sessionId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]}],"rank":8,"namespace":897801},
  {"table":"diagnostic_identity_records","pk":["id"],"fields":["id","orderId","orderVersion","observation","observationHash","recordedById","recordedAt","erasedAt"],"unique":[["orderId","orderVersion"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["recordedById"],"target":["id"]}],"rank":9,"namespace":897900},
  {"table":"diagnostic_identity_evidence","pk":["id"],"fields":["id","orderId","orderVersion","identityRecordId","observationHash","identifiers","provenance","rights","rightsUntil","supersedesId","explanation","recordHash","recordedById","recordedAt","erasedAt"],"unique":[["supersedesId"],["orderId","orderVersion"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"diagnostic_identity_evidence","columns":["supersedesId"],"target":["id"]},{"table":"users","columns":["recordedById"],"target":["id"]}],"rank":9,"namespace":897901},
  {"table":"diagnostic_identity_provenance","pk":["id"],"fields":["id","orderId","contentType","declaredSizeBytes","rights","rightsUntil","objectKey","sha256","sizeBytes","mime","state","epoch","writeLeaseUntil","cleanupLeaseUntil","cleanupAttempts","cleanupFailureCode","createdById","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt","erasedAt"],"unique":[["objectKey"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["createdById"],"target":["id"]}],"rank":9,"namespace":897902},
  {"table":"diagnostic_ownership_grants","pk":["id"],"fields":["id","orderId","state","listingId","identityDigest","sellerId","commissionerId","businessId","membershipId","grantorId","grantorMembershipId","sessionId","rights","rightsUntil","declaredAt","erasedAt"],"unique":[["orderId"]],"refs":[{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"users","columns":["grantorId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"dealership_members","columns":["membershipId"],"target":["id"]},{"table":"dealership_members","columns":["grantorMembershipId"],"target":["id"]},{"table":"sessions","columns":["sessionId"],"target":["id"]}],"rank":9,"namespace":897903},
  {"table":"diagnostic_ownership_components","pk":["identityRecordId"],"fields":["grantId","identityRecordId","orderId","orderVersion","state","scope","sourceListingId","identityDigest","sellerId","commissionerId","businessId","membershipId","rights","rightsUntil","declaredById","declaredAt","erasedAt"],"unique":[["orderId","orderVersion"]],"refs":[{"table":"diagnostic_ownership_grants","columns":["grantId"],"target":["id"]},{"table":"diagnostic_identity_records","columns":["identityRecordId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]},{"table":"users","columns":["commissionerId"],"target":["id"]},{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"dealership_members","columns":["membershipId"],"target":["id"]},{"table":"users","columns":["declaredById"],"target":["id"]}],"rank":9,"namespace":897904},
  {"table":"support_cases","pk":["id"],"fields":["id","customerId","assigneeId","assignmentVersion","sourceListingId","status","closedAt","unansweredSince","awaitingCustomerSince","priority","investigationState","escalatedAt","mode","createdAt","updatedAt"],"unique":[["customerId"]],"refs":[{"table":"users","columns":["customerId"],"target":["id"]},{"table":"users","columns":["assigneeId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]}],"rank":10,"namespace":898000},
  {"table":"vehicle_history_requests","pk":["id"],"fields":["id","customerId","assigneeId","assignmentVersion","sourceListingId","proposedVin","confirmedVin","status","mode","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["customerId"],"target":["id"]},{"table":"users","columns":["assigneeId"],"target":["id"]},{"table":"listings","columns":["sourceListingId"],"target":["id"]}],"rank":10,"namespace":898001},
  {"table":"service_conversations","pk":["id"],"fields":["id","purpose","supportCaseId","historyRequestId","lifecycleEpoch","lastSequence","erasedAt","createdAt"],"unique":[["supportCaseId"],["historyRequestId"]],"refs":[{"table":"support_cases","columns":["supportCaseId"],"target":["id"]},{"table":"vehicle_history_requests","columns":["historyRequestId"],"target":["id"]}],"rank":10,"namespace":898002},
  {"table":"history_quotes","pk":["id"],"fields":["erasedAt","id","requestId","vin","amount","providers","preflightOutcome","preflightEvidence","refundRule","windowStart","windowEnd","feasible","offeredById","createdAt","supersededAt","acceptedAt"],"unique":[],"refs":[{"table":"vehicle_history_requests","columns":["requestId"],"target":["id"]}],"rank":10,"namespace":898003},
  {"table":"history_orders","pk":["id"],"fields":["recoveryOfferedAt","recoveryOfferedDeadline","recoveryOfferExpiresAt","version","id","requestId","quoteId","day","morning","state","holdExpiresAt","paidAt","receivedAt","promiseAt","recoveryUsed","recoveryAgreedAt","recoveryDeadline","escalatedAt","rights","erasedAt","createdAt","updatedAt"],"unique":[["requestId"],["quoteId"]],"refs":[{"table":"vehicle_history_requests","columns":["requestId"],"target":["id"]},{"table":"history_quotes","columns":["quoteId"],"target":["id"]}],"rank":10,"namespace":898004},
  {"table":"history_payments","pk":["id"],"fields":["verifiedFunds","id","orderId","clientPaymentId","attachmentId","claim","amount","receivedAt","confirmedAt","confirmedById","evidence","state","createdAt"],"unique":[["orderId","clientPaymentId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]}],"rank":10,"namespace":898005},
  {"table":"history_purchase_intents","pk":["id"],"fields":["sourceArtifactId","id","orderId","vin","providers","state","externalReference","createdById","createdAt","reconciledAt"],"unique":[["orderId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]}],"rank":10,"namespace":898006},
  {"table":"history_refunds","pk":["id"],"fields":["id","orderId","reason","state","approvedById","approvedAt","executedById","executedAt","executionReference","createdAt"],"unique":[["orderId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]}],"rank":10,"namespace":898007},
  {"table":"history_bookings","pk":["id"],"fields":["id","orderId","clientBookingId","vin","providers","amount","refundRule","windowStart","windowEnd","acceptedAt","erasedAt"],"unique":[["orderId","clientBookingId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]}],"rank":10,"namespace":898008},
  {"table":"history_artifacts","pk":["id"],"fields":["id","provider","vin","originalDate","mileageObservedAt","mileageValue","mileageUnit","vehicleIdentity","sourceObservations","sourceListingId","acquiredForOrderId","objectKey","sha256","sizeBytes","expectedPages","verifiedPages","rights","provenance","state","verifiedById","verifiedAt","createdAt","restrictedAt","removedAt"],"unique":[["objectKey"]],"refs":[],"rank":10,"namespace":898009},
  {"table":"history_deliveries","pk":["id"],"fields":["id","orderId","artifactId","purchaseIntentId","sharedLink","linkApprovedAt","deliveredById","deliveredAt","erasedAt"],"unique":[["orderId","artifactId"]],"refs":[{"table":"history_orders","columns":["orderId"],"target":["id"]},{"table":"history_artifacts","columns":["artifactId"],"target":["id"]},{"table":"history_purchase_intents","columns":["purchaseIntentId"],"target":["id"]}],"rank":10,"namespace":898010},
  {"table":"history_artifact_cleanup","pk":["artifactId"],"fields":["artifactId","objectKey","sha256","epoch","requestedAt","completedAt"],"unique":[],"refs":[],"rank":10,"namespace":898011},
  {"table":"service_attachments","pk":["id"],"fields":["id","conversationId","uploaderId","lifecycleEpoch","category","visibility","state","stagingKey","objectKey","contentType","expectedBytes","sizeBytes","sha256","filename","rights","createdAt","expiresAt","adoptedAt","removedAt"],"unique":[["stagingKey"],["objectKey"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["uploaderId"],"target":["id"]}],"rank":10,"namespace":898012},
  {"table":"service_messages","pk":["id"],"fields":["id","conversationId","sequence","clientMessageId","senderId","senderKind","visibility","body","attachmentId","requestHash","createdAt"],"unique":[["attachmentId"],["conversationId","senderId","clientMessageId"],["conversationId","sequence"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["senderId"],"target":["id"]},{"table":"service_attachments","columns":["attachmentId"],"target":["id"]}],"rank":10,"namespace":898013},
  {"table":"service_read_states","pk":["conversationId","userId"],"fields":["conversationId","userId","lastSequence","updatedAt"],"unique":[],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":10,"namespace":898014},
  {"table":"service_push_subscriptions","pk":["id"],"fields":["id","sessionId","deviceId","conversationId","lifecycleEpoch","createdAt","updatedAt"],"unique":[["sessionId","deviceId","conversationId"]],"refs":[{"table":"sessions","columns":["sessionId"],"target":["id"]},{"table":"fcm_devices","columns":["deviceId"],"target":["id"]},{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898015},
  {"table":"service_outbox","pk":["id"],"fields":["id","conversationId","eventType","sequence","visibility","lifecycleEpoch","createdAt","deliveredAt","attempts","nextAttemptAt"],"unique":[["conversationId","eventType","sequence"]],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898016},
  {"table":"service_erasure_fences","pk":["conversationId"],"fields":["conversationId","epoch","objectKeys","erasedAt","cleanupCompletedAt"],"unique":[],"refs":[{"table":"service_conversations","columns":["conversationId"],"target":["id"]}],"rank":10,"namespace":898017},
  {"table":"media_uploads","pk":["id"],"fields":["businessId","id","userId","key","kind","contentType","sizeBytes","writeProtocol","objectKeys","createdAt","state","claimToken","claimTargetType","claimTargetId","claimDeadline","retiredAt"],"unique":[["key"]],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":11,"namespace":898100},
  {"table":"video_upload_sessions","pk":["id"],"fields":["protocolVersion","targetKind","targetId","targetRevision","storageUploadId","posterMs","idempotencyKey","idempotencyHash","completionFence","cancelledAt","completedAt","id","uploadId","userId","listingId","state","sourceKey","sizeBytes","sha256","expiresAt","createdAt","updatedAt"],"unique":[["uploadId"],["userId","idempotencyKey"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":11,"namespace":898101},
  {"table":"video_generations","pk":["id"],"fields":["sessionId","completionFence","targetRevision","processingVersion","sourceSha256","sourceWidth","sourceHeight","id","listingId","uploadId","state","manifest","durationMs","posterKey","createdAt","readyAt","retiredAt"],"unique":[],"refs":[{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]}],"rank":11,"namespace":898102},
  {"table":"video_process_work","pk":["generationId"],"fields":["generationId","uploadId","sessionId","completionFence","targetRevision","processingVersion","state","attempts","nextAttemptAt","leaseToken","leaseExpiresAt","lastError","createdAt","updatedAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898103},
  {"table":"video_grants","pk":["id"],"fields":["ownerUserId","ownerSessionId","id","secretHash","listingId","generationId","purpose","expiresAt","revokedAt","createdAt"],"unique":[["secretHash"]],"refs":[{"table":"users","columns":["ownerUserId"],"target":["id"]},{"table":"sessions","columns":["ownerSessionId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898104},
  {"table":"video_cleanup_work","pk":["id"],"fields":["id","uploadId","sessionId","generationId","writeProtocol","sourceKey","storageUploadId","objectKeys","state","attempts","nextAttemptAt","leaseToken","leaseExpiresAt","lastError","createdAt","updatedAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]},{"table":"video_upload_sessions","columns":["sessionId"],"target":["id"]},{"table":"video_generations","columns":["generationId"],"target":["id"]}],"rank":11,"namespace":898105},
  {"table":"media_upload_cleanups","pk":["uploadId"],"fields":["uploadId","key","objectKeys","writeProtocol","status","attempts","nextAttemptAt","lastError","createdAt","completedAt"],"unique":[],"refs":[{"table":"media_uploads","columns":["uploadId"],"target":["id"]}],"rank":11,"namespace":898106},
  {"table":"listing_media","pk":["id"],"fields":["id","listingId","kind","key","sortOrder","width","height","durationMs","posterKey","thumbHash","createdAt","uploadId"],"unique":[["uploadId"]],"refs":[{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"media_uploads","columns":["uploadId"],"target":["id"]}],"rank":11,"namespace":898107},
  {"table":"diagnostic_evidence","pk":["id"],"fields":["writeLeaseUntil","cleanupLeaseUntil","cleanupAttempts","cleanupFailureCode","id","reportId","findingId","objectKey","sha256","sizeBytes","mime","state","epoch","createdById","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt"],"unique":[["objectKey"]],"refs":[{"table":"diagnostic_reports","columns":["reportId"],"target":["id"]}],"rank":11,"namespace":898108},
  {"table":"diagnostic_pdf_artifacts","pk":["id"],"fields":["id","reportId","snapshotHash","locale","rendererVersion","generation","epoch","state","objectKey","sha256","sizeBytes","attempts","retryAt","failureCode","leaseUntil","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt"],"unique":[["objectKey"],["reportId","locale","rendererVersion","generation"]],"refs":[{"table":"diagnostic_reports","columns":["reportId"],"target":["id"]}],"rank":11,"namespace":898109},
  {"table":"measurement_state","pk":["key"],"fields":["key","epoch"],"unique":[],"refs":[],"rank":12,"namespace":898200},
  {"table":"measurement_principals","pk":["id"],"fields":["id","pseudonym","generation","epoch","kind","userId","capabilityHash","expiresAt","createdAt"],"unique":[["pseudonym"],["generation"],["userId"],["capabilityHash"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":12,"namespace":898201},
  {"table":"measurement_visits","pk":["id"],"fields":["id","principalId","linkedAccountId","startedAt","foregroundAt","endedAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]},{"table":"measurement_principals","columns":["linkedAccountId"],"target":["id"]}],"rank":12,"namespace":898202},
  {"table":"measurement_records","pk":["id"],"fields":["id","principalId","visitId","event","origin","environment","population","conversionEligible","occurredAt","receivedAt","expiresAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]},{"table":"measurement_visits","columns":["visitId"],"target":["id"]}],"rank":12,"namespace":898203},
  {"table":"measurement_outbox","pk":["id"],"fields":["id","principalId","generation","epoch","environment","population","conversionEligible","event","createdAt","expiresAt"],"unique":[],"refs":[{"table":"measurement_principals","columns":["principalId"],"target":["id"]}],"rank":12,"namespace":898204},
  {"table":"measurement_investigation_exports","pk":["id"],"fields":["id","actorId","sessionId","epoch","reason","auditId","scope","evidence","createdAt","expiresAt","revokedAt"],"unique":[],"refs":[],"rank":12,"namespace":898205},
  {"table":"measurement_rollups","pk":["key"],"fields":["key","version","epoch","environment","population","windowFrom","windowTo","completeThrough","inputDigest","lateRecords","metrics","generatedAt","expiresAt"],"unique":[],"refs":[],"rank":12,"namespace":898206},
  {"table":"diagnostic_audits","pk":["id"],"fields":["id","centerId","orderId","actorId","action","details","createdAt"],"unique":[],"refs":[{"table":"diagnostic_centers","columns":["centerId"],"target":["id"]},{"table":"inspection_orders","columns":["orderId"],"target":["id"]},{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898300},
  {"table":"service_audits","pk":["id"],"fields":["id","actorId","purpose","resourceId","action","reason","targetStaffId","assignmentVersion","createdAt"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898301},
  {"table":"audit_logs","pk":["id"],"fields":["id","actorId","action","targetType","targetId","details","createdAt"],"unique":[],"refs":[{"table":"users","columns":["actorId"],"target":["id"]}],"rank":13,"namespace":898302},
  {"table":"dealership_invitations","pk":["id"],"fields":["id","dealershipId","recipientUserId","role","tokenHash","expiresAt","revokedAt","redeemedAt","createdAt"],"unique":[["tokenHash"]],"refs":[{"table":"dealerships","columns":["dealershipId"],"target":["id"]},{"table":"users","columns":["recipientUserId"],"target":["id"]}],"rank":13,"namespace":898303},
  {"table":"owned_vehicles","pk":["id"],"fields":["id","userId","dealershipId","brand","model","year","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"dealerships","columns":["dealershipId"],"target":["id"]}],"rank":13,"namespace":898304},
  {"table":"blocked_users","pk":["id"],"fields":["id","blockerId","blockedId","createdAt"],"unique":[["blockerId","blockedId"]],"refs":[{"table":"users","columns":["blockerId"],"target":["id"]},{"table":"users","columns":["blockedId"],"target":["id"]}],"rank":13,"namespace":898305},
  {"table":"favorites","pk":["id"],"fields":["id","userId","listingId","createdAt"],"unique":[["userId","listingId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]}],"rank":13,"namespace":898306},
  {"table":"saved_searches","pk":["id"],"fields":["id","userId","filters","pushEnabled","lastDigestAt","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898307},
  {"table":"conversations","pk":["id"],"fields":["businessId","assigneeId","enquiryState","version","id","listingId","buyerId","sellerId","createdAt","updatedAt","lastMessageAt","lastMessageId","firstBuyerMessageId","firstSellerReplyId"],"unique":[["listingId","buyerId"]],"refs":[{"table":"dealerships","columns":["businessId"],"target":["id"]},{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"users","columns":["buyerId"],"target":["id"]},{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":13,"namespace":898308},
  {"table":"conversation_participants","pk":["id"],"fields":["id","conversationId","userId","createdAt","mutedAt","lastReadAt","lastDeliveredAt"],"unique":[["conversationId","userId"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]},{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898309},
  {"table":"messages","pk":["id"],"fields":["id","conversationId","senderId","body","metadata","createdAt","deletedAt","clientMessageId"],"unique":[["conversationId","senderId","clientMessageId"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]}],"rank":13,"namespace":898310},
  {"table":"fcm_devices","pk":["id"],"fields":["id","userId","token","createdAt","updatedAt","deviceId","registeredAt","lastUsedAt","invalidatedAt"],"unique":[["token"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898311},
  {"table":"notification_history","pk":["id"],"fields":["id","userId","title","body","data","deliveryDetails","readAt","createdAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898312},
  {"table":"notification_preferences","pk":["id"],"fields":["id","userId","optOuts"],"unique":[["userId"]],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898313},
  {"table":"verified_contact_phones","pk":["id"],"fields":["id","sellerId","phone","confirmedAt","createdAt","updatedAt"],"unique":[["sellerId","phone"]],"refs":[{"table":"users","columns":["sellerId"],"target":["id"]}],"rank":13,"namespace":898314},
  {"table":"otp_requests","pk":["id"],"fields":["id","destination","phone","codeHash","expiresAt","verifiedAt","attempts","userId","businessId","ip","createdAt","updatedAt"],"unique":[],"refs":[{"table":"users","columns":["userId"],"target":["id"]}],"rank":13,"namespace":898315},
  {"table":"content_reports","pk":["id"],"fields":["id","reporterUserId","targetType","targetId","reason","details","status","reviewedById","reviewedAt","createdAt","messageContext"],"unique":[],"refs":[{"table":"users","columns":["reporterUserId"],"target":["id"]},{"table":"users","columns":["reviewedById"],"target":["id"]}],"rank":13,"namespace":898316},
  {"table":"inspection_interests","pk":["id"],"fields":["id","listingId","requesterUserId","side","willingnessToPayTmt","createdAt","updatedAt"],"unique":[["listingId","requesterUserId"]],"refs":[{"table":"listings","columns":["listingId"],"target":["id"]},{"table":"users","columns":["requesterUserId"],"target":["id"]}],"rank":13,"namespace":898317},
  {"table":"business_enquiry_audits","pk":["id"],"fields":["id","conversationId","version","actorId","action","previousAssigneeId","assigneeId","enquiryState","createdAt"],"unique":[["conversationId","version"]],"refs":[{"table":"conversations","columns":["conversationId"],"target":["id"]}],"rank":13,"namespace":898318}
]'::jsonb
$registry$;

CREATE FUNCTION public.diagnostic_source_meta(t text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT x FROM jsonb_array_elements(public.diagnostic_source_registry()) x WHERE x->>'table'=t
$$;
CREATE FUNCTION public.diagnostic_source_project(r jsonb, fields jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT CASE WHEN r IS NULL THEN NULL ELSE COALESCE(jsonb_object_agg(k,r->k),'{}') END
 FROM jsonb_array_elements_text(fields) k
$$;
CREATE FUNCTION public.diagnostic_source_key(t text, r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT public.diagnostic_source_project(r,public.diagnostic_source_meta(t)->'pk')
$$;
CREATE FUNCTION public.diagnostic_source_read(t text, k jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE r jsonb;
BEGIN
 IF public.diagnostic_source_meta(t) IS NULL THEN RAISE EXCEPTION 'diagnostic_source_table'; END IF;
 EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE to_jsonb(s) @> $1',t) INTO r USING k;
 RETURN r;
END $$;
CREATE FUNCTION public.diagnostic_source_add(s jsonb,t text,k jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
BEGIN
 IF k IS NULL OR k='null' OR k='{}' OR EXISTS (SELECT 1 FROM jsonb_each(k) x WHERE x.value='null') THEN RETURN s; END IF;
 IF public.diagnostic_source_meta(t) IS NULL OR public.diagnostic_source_key(t,k) IS DISTINCT FROM k THEN
  RAISE EXCEPTION 'diagnostic_source_key';
 END IF;
 IF NOT COALESCE(s->t,'[]') @> jsonb_build_array(k) THEN
  s:=jsonb_set(s,ARRAY[t],COALESCE(s->t,'[]')||jsonb_build_array(k),true);
 END IF;
 RETURN s;
END $$;
CREATE FUNCTION public.diagnostic_source_allows(op text,t text,v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT CASE op
 WHEN 'listing_create' THEN t='listings' AND v='insert'
 WHEN 'listing_change' THEN t='listings' AND v='update'
 WHEN 'listing_delete' THEN t='listings' AND v IN ('update','delete')
 WHEN 'member_create' THEN t='dealership_members' AND v='insert'
 WHEN 'member_replace' THEN t='dealership_members' AND v IN ('insert','update','delete')
 WHEN 'member_remove' THEN t='dealership_members' AND v='delete'
 WHEN 'member_eligibility' THEN t='dealership_members' AND v='update'
 WHEN 'business_eligibility' THEN t='dealerships' AND v='update'
 WHEN 'account_schedule' THEN t='users' AND v='update'
 WHEN 'account_restore' THEN t='users' AND v='update'
 WHEN 'account_purge' THEN
  (v='insert' AND t IN ('video_cleanup_work','media_upload_cleanups','service_erasure_fences','history_artifact_cleanup'))
  OR (v='update' AND public.diagnostic_source_meta(t) IS NOT NULL AND t NOT IN ('measurement_state','staff_grants','diagnostic_continuity_requests'))
  OR (v='delete' AND t IN ('users','sessions','staff_grants','dealership_members','dealership_invitations','owned_vehicles','blocked_users','favorites','saved_searches','conversation_participants','fcm_devices','notification_history','notification_preferences','verified_contact_phones','otp_requests','media_uploads','listing_media','listing_drafts','video_grants','totp_enrollments','totp_backup_codes','measurement_principals','measurement_visits','measurement_records','measurement_outbox','measurement_investigation_exports','diagnostic_continuity_proofs','diagnostic_continuity_requests','diagnostic_order_assignments','diagnostic_center_assignments'))
 WHEN 'order_create' THEN t IN ('inspection_orders','diagnostic_audits','diagnostic_centers','diagnostic_template_versions','diagnostic_center_assignments') AND v='insert'
 WHEN 'order_change' THEN t IN ('inspection_orders','diagnostic_order_assignments','diagnostic_audits') AND v IN ('insert','update','delete')
 WHEN 'observation_append' THEN (t='inspection_orders' AND v='update') OR (t IN ('diagnostic_identity_records','diagnostic_ownership_components','diagnostic_audits') AND v='insert')
 WHEN 'ownership_grant' THEN t IN ('diagnostic_ownership_grants','diagnostic_audits') AND v='insert'
 WHEN 'ownership_revoke' THEN t IN ('diagnostic_ownership_grants','diagnostic_ownership_components','diagnostic_continuity_proofs','diagnostic_continuity_requests','diagnostic_audits') AND v IN ('update','delete','insert')
 WHEN 'ownership_expire' THEN t IN ('diagnostic_ownership_grants','diagnostic_ownership_components','diagnostic_continuity_proofs','diagnostic_continuity_requests') AND v IN ('update','delete')
 WHEN 'report_change' THEN t IN ('diagnostic_reports','diagnostic_audits') AND v IN ('insert','update')
 WHEN 'proof_issue' THEN t IN ('diagnostic_continuity_proofs','diagnostic_continuity_requests','diagnostic_audits') AND v='insert'
 WHEN 'proof_consume' THEN (t='diagnostic_continuity_proofs' AND v='update') OR (t IN ('diagnostic_reports','diagnostic_continuity_requests','diagnostic_audits') AND v='insert')
 WHEN 'proof_expire' THEN t IN ('diagnostic_continuity_proofs','diagnostic_continuity_requests') AND v='delete'
 WHEN 'identity_material_change' THEN t IN ('inspection_orders','diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance','diagnostic_audits') AND v IN ('insert','update','delete')
 WHEN 'staff_eligibility' THEN t IN ('staff_grants','diagnostic_center_assignments','diagnostic_order_assignments','diagnostic_centers','diagnostic_template_versions') AND v IN ('insert','update','delete')
 WHEN 'session_change' THEN t IN ('sessions','totp_enrollments','totp_backup_codes') AND v IN ('insert','update','delete')
 ELSE false END
$$;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE r jsonb; m jsonb; old_source jsonb; k jsonb; root jsonb; seen jsonb:='[]'; op text:=c->>'operation';
BEGIN
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR c-ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign']<>'{}'
  OR NOT c ?& ARRAY['operation','roots','rows','actorUserId','sessionId','cutoff','campaign']
  OR jsonb_typeof(c->'roots') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'rows') IS DISTINCT FROM 'array'
  OR jsonb_array_length(c->'roots') NOT BETWEEN 1 AND 100 OR jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'diagnostic_source_command'; END IF;
 IF c->'cutoff'<>'null' AND ((c->>'cutoff')::timestamptz>clock_timestamp()) THEN RAISE EXCEPTION 'diagnostic_source_future_cutoff'; END IF;
 IF op IN ('ownership_expire','proof_expire','account_purge') AND c->'cutoff'='null' THEN RAISE EXCEPTION 'diagnostic_source_cutoff'; END IF;
 -- Campaign selectors are never accepted as authority from JSON.
 IF c->'campaign'<>'null' THEN RAISE EXCEPTION 'diagnostic_source_campaign_resolved_only'; END IF;
 FOR root IN SELECT value FROM jsonb_array_elements(c->'roots') LOOP
  IF root-ARRAY['table','key']<>'{}' OR public.diagnostic_source_meta(root->>'table') IS NULL
   OR public.diagnostic_source_key(root->>'table',root->'key') IS DISTINCT FROM root->'key'
   OR EXISTS (SELECT 1 FROM jsonb_each(root->'key') x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'diagnostic_source_root'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  m:=public.diagnostic_source_meta(r->>'table'); k:=r->'key';
  IF r-ARRAY['table','key','verb','expected','next']<>'{}' OR NOT r ?& ARRAY['table','key','verb','expected','next']
   OR public.diagnostic_source_allows(op,r->>'table',r->>'verb') IS NOT TRUE
   OR m IS NULL OR k IS NULL OR k='{}' OR public.diagnostic_source_key(r->>'table',k) IS DISTINCT FROM k
   OR EXISTS (SELECT 1 FROM jsonb_each(k) x WHERE jsonb_typeof(x.value)<>'string')
   OR seen @> jsonb_build_array(jsonb_build_object('table',r->>'table','key',k))
  THEN RAISE EXCEPTION 'diagnostic_source_row'; END IF;
  seen:=seen||jsonb_build_array(jsonb_build_object('table',r->>'table','key',k));
  old_source:=public.diagnostic_source_project(public.diagnostic_source_read(r->>'table',k),m->'fields');
  IF r->>'verb'='insert' THEN
   IF r->'expected'<>'"absent"' OR old_source IS NOT NULL THEN RAISE EXCEPTION 'diagnostic_source_expected_absent'; END IF;
  ELSIF jsonb_typeof(r->'expected') IS DISTINCT FROM 'object' OR r->'expected'-'source'<>'{}'
   OR old_source IS NULL OR r->'expected'->'source' IS DISTINCT FROM old_source
  THEN RAISE EXCEPTION 'diagnostic_source_stale'; END IF;
  IF r->>'verb'='delete' THEN
   IF r->'next'<>'null' THEN RAISE EXCEPTION 'diagnostic_source_next'; END IF;
  ELSIF jsonb_typeof(r->'next') IS DISTINCT FROM 'object'
   OR public.diagnostic_source_project(r->'next',m->'fields') IS DISTINCT FROM r->'next'
   OR NOT (r->'next') ?& ARRAY(SELECT jsonb_array_elements_text(m->'fields'))
   OR public.diagnostic_source_key(r->>'table',r->'next') IS DISTINCT FROM k
  THEN RAISE EXCEPTION 'diagnostic_source_next'; END IF;
  IF op IN ('account_schedule','account_restore') AND
   ((r->'expected'->'source')-'deletionScheduledAt') IS DISTINCT FROM ((r->'next')-'deletionScheduledAt') THEN RAISE EXCEPTION 'diagnostic_source_account_fields'; END IF;
 END LOOP;
 RETURN c;
END $$;

-- Discover from persisted rows on each invocation. No receipt/temp snapshot is read here.
CREATE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE s jsonb:='{}'; prior jsonb; root jsonb; m jsonb; r jsonb; ref jsonb; k jsonb; n jsonb; t text; q text;
 disposal jsonb; subjects jsonb:='[]'; inventory jsonb:='[]'; current_rows jsonb; step integer:=0;
BEGIN
 FOR root IN SELECT value FROM jsonb_array_elements(c->'roots') UNION ALL SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  s:=public.diagnostic_source_add(s,root->>'table',root->'key');
  IF root->>'table'='users' THEN subjects:=subjects||jsonb_build_array(root->'key'->>'id'); END IF;
  -- NEW references are discovered before any locks, including absent endpoints.
  FOR ref IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_meta(root->>'table')->'refs') LOOP
   k:='{}';
   FOR n IN SELECT jsonb_build_object('col',a.value,'target',b.value) FROM jsonb_array_elements_text(ref->'columns') WITH ORDINALITY a(value,i)
    JOIN jsonb_array_elements_text(ref->'target') WITH ORDINALITY b(value,i) USING(i) LOOP
    k:=k||jsonb_build_object(n->>'target',root->'next'->(n->>'col'));
   END LOOP;
   s:=public.diagnostic_source_add(s,ref->>'table',k);
  END LOOP;
 END LOOP;
 s:=public.diagnostic_source_add(s,'users',jsonb_build_object('id',c->'actorUserId'));
 s:=public.diagnostic_source_add(s,'sessions',jsonb_build_object('id',c->'sessionId'));
 -- Existing ownership disposal discovery includes retained OLD Listing/subjects and consumed edges.
 FOR n IN SELECT value FROM jsonb_array_elements(subjects) LOOP
  disposal:=public.diagnostic_ownership_disposal_scope(n#>>'{}',COALESCE((c->>'cutoff')::timestamp,clock_timestamp() AT TIME ZONE 'UTC'),NULL);
  FOR t,q IN SELECT * FROM (VALUES ('users','u'),('dealerships','b'),('listings','l'),('inspection_orders','o'),('diagnostic_reports','r'),('diagnostic_continuity_proofs','p')) v(t,q) LOOP
   FOR k IN SELECT value FROM jsonb_array_elements(disposal->q) LOOP s:=public.diagnostic_source_add(s,t,jsonb_build_object('id',k)); END LOOP;
  END LOOP;
 END LOOP;
 LOOP
  IF c->>'operation'='account_purge' AND COALESCE(jsonb_array_length(s->'measurement_principals'),0)>0 THEN
   s:=public.diagnostic_source_add(s,'measurement_state',jsonb_build_object('key','collector'));
  END IF;
  prior:=s; step:=step+1;
  IF step>100 OR (SELECT COALESCE(sum(jsonb_array_length(value)),0) FROM jsonb_each(s))>1000 THEN RAISE EXCEPTION 'diagnostic_source_scope_limit'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_registry()) LOOP
   t:=m->>'table';
   -- Only explicit root subjects expand inventory. Discovered participants never do.
   q:='false';
   FOR ref IN SELECT value FROM jsonb_array_elements(m->'refs') WHERE jsonb_array_length(value->'columns')=1 LOOP
    IF ref->>'table'='users' AND (c->>'operation'='account_purge' OR (m->>'rank')::int<=9) THEN
     q:=q||format(' OR to_jsonb(x)->>%L IN (SELECT jsonb_array_elements_text($2))',ref->'columns'->>0);
    ELSIF ref->>'table' IN ('inspection_orders','diagnostic_reports','diagnostic_identity_records','diagnostic_continuity_proofs')
     OR (ref->>'table' IN ('listings','dealerships','dealership_members') AND (m->>'rank')::int BETWEEN 3 AND 9)
     OR (c->>'operation'='account_purge' AND ref->>'table' IN ('support_cases','vehicle_history_requests','service_conversations','history_orders','history_artifacts','media_uploads','video_upload_sessions','video_generations','measurement_principals','measurement_visits','sessions','totp_enrollments')) THEN
     q:=q||format(' OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->%L,''[]'')) z WHERE z->>%L=to_jsonb(x)->>%L)',ref->>'table',ref->'target'->>0,ref->'columns'->>0);
    END IF;
   END LOOP;
   EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)),''[]'') FROM public.%I x WHERE %s OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->%L,''[]'')) z WHERE to_jsonb(x) @> z)',t,q,t)
    INTO current_rows USING s,subjects;
   FOR r IN SELECT value FROM jsonb_array_elements(current_rows) LOOP
    s:=public.diagnostic_source_add(s,t,public.diagnostic_source_key(t,r));
    FOR ref IN SELECT value FROM jsonb_array_elements(m->'refs') LOOP
     k:='{}';
     FOR n IN SELECT jsonb_build_object('col',a.value,'target',b.value) FROM jsonb_array_elements_text(ref->'columns') WITH ORDINALITY a(value,i)
      JOIN jsonb_array_elements_text(ref->'target') WITH ORDINALITY b(value,i) USING(i) LOOP
      k:=k||jsonb_build_object(n->>'target',r->(n->>'col'));
     END LOOP;
     s:=public.diagnostic_source_add(s,ref->>'table',k);
    END LOOP;
    -- Retained proof JSON may still name a Listing no longer on either order.
    IF t='diagnostic_continuity_proofs' THEN
     FOR n IN SELECT r->'bindings'->'predecessor' UNION ALL SELECT r->'bindings'->'candidate' LOOP
      s:=public.diagnostic_source_add(s,'listings',jsonb_build_object('id',n->'listingBinding'->'id'));
      s:=public.diagnostic_source_add(s,'users',jsonb_build_object('id',n->'commissionerId'));
      s:=public.diagnostic_source_add(s,'users',jsonb_build_object('id',n->'listingBinding'->'sellerId'));
      s:=public.diagnostic_source_add(s,'dealerships',jsonb_build_object('id',n->'listingBinding'->'businessId'));
     END LOOP;
    END IF;
   END LOOP;
  END LOOP;
  EXIT WHEN s=prior;
 END LOOP;
 FOR t,current_rows IN SELECT key,value FROM jsonb_each(s) ORDER BY key LOOP
  FOR k IN SELECT value FROM jsonb_array_elements(current_rows) ORDER BY value::text LOOP
   r:=public.diagnostic_source_read(t,k);
   inventory:=inventory||jsonb_build_array(jsonb_build_object('table',t,'key',k,'row',public.diagnostic_source_project(r,public.diagnostic_source_meta(t)->'fields')));
  END LOOP;
 END LOOP;
 RETURN inventory;
END $$;

CREATE FUNCTION public.diagnostic_source_campaigns(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE ns text; owned boolean; result jsonb:='[]';
BEGIN
 FOR ns IN SELECT n.nspname FROM pg_namespace n WHERE n.nspname ~ '^cf_[a-f0-9]{32}$' ORDER BY n.nspname LOOP
  IF to_regclass(format('%I.campaign_records',ns)) IS NULL OR to_regclass(format('%I.campaign_entities',ns)) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.campaign_records r JOIN jsonb_array_elements($1) s ON s->>''table''=r.table_name AND s->''key''=r.row_key)
   OR EXISTS (SELECT 1 FROM %I.campaign_entities e JOIN jsonb_array_elements($1) s ON s->>''table''=''users'' AND (s->''key''->>''id''=e.user_id OR s->''row''->>''email''=e.email))
   OR EXISTS (SELECT 1 FROM %I.campaign_entities e JOIN jsonb_array_elements($2->''rows'') s ON s->>''table''=''users'' AND s->''next''->>''email''=e.email)',ns,ns,ns)
   INTO owned USING scope,c;
  IF owned THEN result:=result||jsonb_build_array(ns); END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE result jsonb:='[]'; n jsonb; m jsonb; r jsonb; fields jsonb; key jsonb;
BEGIN
 FOR n IN SELECT value FROM jsonb_array_elements(scope) UNION ALL SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  m:=public.diagnostic_source_meta(n->>'table');
  result:=result||jsonb_build_array(jsonb_build_object('namespace',(m->>'namespace')::int,'key',hashtext(jsonb_build_array('pk',n->'key')::text)));
  FOR r IN SELECT n->'row' UNION ALL SELECT n->'next' LOOP
   IF r IS NULL OR r='null' THEN CONTINUE; END IF;
   FOR fields IN SELECT value FROM jsonb_array_elements(m->'unique') LOOP
    key:=public.diagnostic_source_project(r,fields);
    IF NOT EXISTS (SELECT 1 FROM jsonb_each(key) x WHERE x.value='null') THEN
     result:=result||jsonb_build_array(jsonb_build_object('namespace',(m->>'namespace')::int,'key',hashtext(jsonb_build_array('unique',fields,key)::text)));
    END IF;
   END LOOP;
   IF n->>'table'='dealership_members' THEN
    -- Business OWNER and unique-user absence slots also exist before an INSERT.
    result:=result||jsonb_build_array(jsonb_build_object('namespace',(m->>'namespace')::int,'key',hashtext(jsonb_build_array('owner',r->'dealershipId')::text)));
   END IF;
  END LOOP;
 END LOOP;
 RETURN (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'namespace')::int,(x->>'key')::int),'[]') FROM (SELECT DISTINCT value x FROM jsonb_array_elements(result)) d);
END $$;
CREATE TABLE public.diagnostic_source_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 full_transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text, command jsonb NOT NULL,
 scope jsonb NOT NULL DEFAULT '[]', lock_keys jsonb NOT NULL DEFAULT '[]', effects jsonb NOT NULL DEFAULT '[]',
 campaigns jsonb NOT NULL DEFAULT '[]', UNIQUE(backend_pid,full_transaction_id)
);
CREATE FUNCTION public.diagnostic_assert_source(receipt uuid,op text) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE id=receipt AND backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation'=op) THEN RAISE EXCEPTION 'diagnostic_source_receipt'; END IF;
END $$;
-- Derive effects from actual stored OLD rows, never caller-supplied lock/graph/effect fields.
CREATE FUNCTION public.diagnostic_source_invalidates(e jsonb,p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE t text:=e->>'table'; r jsonb:=COALESCE(NULLIF(e->'next','null'),e->'expected'->'source'); prior jsonb:=e->'expected'->'source'; oid text; uid text; sid text;
BEGIN
 IF e->>'verb'='update' AND r=prior THEN RETURN false; END IF;
 IF t='inspection_orders' THEN oid:=r->>'id';
 ELSIF t IN ('diagnostic_reports','diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance','diagnostic_order_assignments') THEN oid:=r->>'orderId';
 ELSIF t='users' THEN
  IF e->>'verb'<>'update' OR ROW(prior->'suspendedAt',prior->'deletionScheduledAt') IS NOT DISTINCT FROM ROW(r->'suspendedAt',r->'deletionScheduledAt') THEN RETURN false; END IF;
  uid:=r->>'id';
 ELSIF t IN ('staff_grants','diagnostic_center_assignments') THEN uid:=r->>'userId';
 ELSIF t='sessions' THEN sid:=r->>'id'; END IF;
 IF oid IN (p->>'candidateOrderId',p->>'predecessorOrderId') OR uid IN (p->>'issuerId',p->>'linkingTechnicianId') OR sid=p->>'issuerSessionId' THEN RETURN true; END IF;
 IF p->'bindings'->'candidate'->>'audience'<>'listing_public' THEN RETURN false; END IF;
 IF t='listings' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->'listingBinding'->>'id',p->'bindings'->'predecessor'->'listingBinding'->>'id'); END IF;
 IF t='dealerships' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->'listingBinding'->>'businessId',p->'bindings'->'predecessor'->'listingBinding'->>'businessId'); END IF;
 IF t='users' THEN RETURN r->>'id' IN (p->'bindings'->'candidate'->>'commissionerId',p->'bindings'->'predecessor'->>'commissionerId',p->'bindings'->'candidate'->'listingBinding'->>'sellerId',p->'bindings'->'predecessor'->'listingBinding'->>'sellerId'); END IF;
 IF t='dealership_members' THEN RETURN p->'bindings'->'candidate'->'listingBinding'->'publisher'->>'userId' IN (r->>'userId',prior->>'userId')
  AND p->'bindings'->'candidate'->'listingBinding'->>'businessId' IN (r->>'dealershipId',prior->>'dealershipId'); END IF;
 RETURN false;
END $$;

CREATE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE effects jsonb:=c->'rows'; n jsonb; r jsonb; source jsonb; changed_listing boolean:=false; row_plan jsonb;
BEGIN
 FOR row_plan IN SELECT value FROM jsonb_array_elements(c->'rows') WHERE value->>'table'='listings' AND value->>'verb'='update' LOOP
  source:=row_plan->'expected'->'source'; r:=row_plan->'next';
  changed_listing:=ROW(source->'sellerId',source->'businessId',source->'brandId',source->'modelId',source->'year',upper(btrim(source->>'vin')))
   IS DISTINCT FROM ROW(r->'sellerId',r->'businessId',r->'brandId',r->'modelId',r->'year',upper(btrim(r->>'vin')));
  IF changed_listing THEN
   FOR n IN SELECT value FROM jsonb_array_elements(scope) WHERE value->>'table'='inspection_orders'
    AND value->'row'->>'listingId'=source->>'id' AND value->'row'->>'audience'='listing_public'
    AND value->'row'->'erasedAt'='null' AND value->'row'->'associationValidatedAt'<>'null' LOOP
    r:=n->'row';
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(effects) x WHERE x->>'table'='inspection_orders' AND x->'key'=n->'key') THEN
     RAISE EXCEPTION 'diagnostic_source_overlapping_derived_effect';
    END IF;
    effects:=effects||jsonb_build_array(jsonb_build_object('table','inspection_orders','key',n->'key','verb','update','expected',jsonb_build_object('source',r),
     'next',r||jsonb_build_object('associationValidatedAt',NULL,'version',(r->>'version')::int+1),'derived','association'));
   END LOOP;
  END IF;
 END LOOP;
 -- Invalidation itself uses existing triggers. Any source operation may fire UPDATE-OF
 -- triggers even if a protected tuple compares equal. Completion requires invalidation
 -- only when that trigger's OLD/NEW whole-row predicate and target match actually hold.
 FOR n IN SELECT value FROM jsonb_array_elements(scope) WHERE value->>'table'='diagnostic_continuity_proofs'
  AND value->'row'->'invalidatedAt'='null' AND value->'row'->'consumedReportId'='null' LOOP
  r:=n->'row';
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(effects) x WHERE x->>'table'='diagnostic_continuity_proofs' AND x->'key'=n->'key') THEN
   effects:=effects||jsonb_build_array(jsonb_build_object('table','diagnostic_continuity_proofs','key',n->'key','verb','update','expected',jsonb_build_object('source',r),'next',r,'derived','invalidation','required',EXISTS (SELECT 1 FROM jsonb_array_elements(effects) x WHERE public.diagnostic_source_invalidates(x,r) IS TRUE)));
  END IF;
 END LOOP;
 RETURN effects;
END $$;
CREATE FUNCTION public.diagnostic_source_insert_receipt() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_scope jsonb; after_scope jsonb; c jsonb; keys jsonb; campaigns jsonb; n jsonb; t text; ns text; k jsonb;
BEGIN
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_registry()) m
  CROSS JOIN (VALUES ('diagnostic_source_presence'),('diagnostic_source_effective'),('diagnostic_source_no_truncate')) names(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(m->>'table')) AND t.tgname=names.name AND t.tgenabled='O')) THEN
  RAISE EXCEPTION 'diagnostic_source_dormant';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'diagnostic_source_isolation'; END IF;
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'diagnostic_source_nested'; END IF;
 IF EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted AND
  ((l.locktype='relation' AND l.mode IN ('RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
    AND l.relation IN (SELECT to_regclass('public.'||(m->>'table')) FROM jsonb_array_elements(public.diagnostic_source_registry()) m))
   OR (l.locktype='advisory' AND l.objsubid=2 AND l.classid BETWEEN 897100 AND 898399))) THEN RAISE EXCEPTION 'diagnostic_source_preheld_lock'; END IF;
 c:=public.diagnostic_source_parse(NEW.command);
 before_scope:=public.diagnostic_source_scope(c);
 campaigns:=public.diagnostic_source_campaigns(before_scope,c);
 IF campaigns<>'[]' THEN
  -- Same sorted table-before-namespace order as reset, including FK dependencies.
  FOR t IN SELECT m->>'table' FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY m->>'table' LOOP
   EXECUTE format('LOCK TABLE public.%I IN ROW EXCLUSIVE MODE',t);
  END LOOP;
  FOR ns IN SELECT jsonb_array_elements_text(campaigns) ORDER BY 1 LOOP PERFORM pg_advisory_xact_lock(hashtextextended(ns,0)); END LOOP;
 END IF;
 keys:=public.diagnostic_source_lock_keys(before_scope,c);
 FOR t IN SELECT m->>'table' FROM jsonb_array_elements(public.diagnostic_source_registry()) m ORDER BY (m->>'namespace')::int LOOP
  FOR n IN SELECT value FROM jsonb_array_elements(keys) WHERE (value->>'namespace')::int=(public.diagnostic_source_meta(t)->>'namespace')::int ORDER BY (value->>'key')::int LOOP
   PERFORM pg_advisory_xact_lock((n->>'namespace')::int,(n->>'key')::int);
  END LOOP;
  FOR k IN SELECT value->'key' FROM jsonb_array_elements(before_scope) WHERE value->>'table'=t ORDER BY (value->'key')::text LOOP
   EXECUTE format('SELECT 1 FROM public.%I s WHERE to_jsonb(s) @> $1 FOR UPDATE',t) USING k;
  END LOOP;
 END LOOP;
 -- This is a separate VOLATILE SQL invocation after all waits. PostgreSQL READ
 -- COMMITTED takes fresh command visibility for its database reads.
 after_scope:=public.diagnostic_source_scope(c);
 IF after_scope IS DISTINCT FROM before_scope OR public.diagnostic_source_lock_keys(after_scope,c) IS DISTINCT FROM keys
  OR public.diagnostic_source_campaigns(after_scope,c) IS DISTINCT FROM campaigns THEN RAISE EXCEPTION 'diagnostic_source_graph_changed'; END IF;
 PERFORM public.diagnostic_source_parse(c);
 NEW.id:=gen_random_uuid(); NEW.backend_pid:=pg_backend_pid(); NEW.full_transaction_id:=pg_current_xact_id()::text;
 NEW.command:=c; NEW.scope:=after_scope; NEW.lock_keys:=keys; NEW.campaigns:=campaigns;
 NEW.effects:=public.diagnostic_source_effects(c,after_scope);
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_source_insert_receipt BEFORE INSERT ON public.diagnostic_source_commands
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_insert_receipt();
CREATE FUNCTION public.diagnostic_prepare_source(command jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE result uuid;
BEGIN
 INSERT INTO public.diagnostic_source_commands(command) VALUES(command) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.diagnostic_source_forbid() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'diagnostic_source_immutable'; END $$;
CREATE TRIGGER diagnostic_source_receipt_no_update BEFORE UPDATE ON public.diagnostic_source_commands
 FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_forbid();
CREATE TRIGGER diagnostic_source_receipt_no_truncate BEFORE TRUNCATE ON public.diagnostic_source_commands
 FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_forbid();
CREATE FUNCTION public.diagnostic_source_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE e jsonb; actual jsonb; m jsonb;
BEGIN
 PERFORM public.diagnostic_assert_source(OLD.id,OLD.command->>'operation');
 FOR e IN SELECT value FROM jsonb_array_elements(OLD.effects) LOOP
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
CREATE TRIGGER diagnostic_source_completion BEFORE DELETE ON public.diagnostic_source_commands
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_completion();
CREATE FUNCTION public.diagnostic_finish_source(receipt_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE id=receipt_id AND backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'diagnostic_source_receipt'; END IF;
 DELETE FROM public.diagnostic_source_commands WHERE id=receipt_id;
END $$;
CREATE FUNCTION public.diagnostic_source_must_finish() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE id=NEW.id AND backend_pid=NEW.backend_pid
  AND full_transaction_id=NEW.full_transaction_id) THEN RAISE EXCEPTION 'diagnostic_source_unfinished'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER diagnostic_source_must_finish AFTER INSERT ON public.diagnostic_source_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_must_finish();

CREATE TABLE public.diagnostic_source_anchors (
 "orderId" text PRIMARY KEY REFERENCES public.inspection_orders(id) ON DELETE CASCADE,
 state text NOT NULL CHECK (state IN ('pending','unchanged','changed','unavailable','erased')),
 "firstRecordId" text, source jsonb, "createdTransaction" text NOT NULL,
 CHECK ((state='erased' AND source IS NULL AND "firstRecordId" IS NULL) OR (state<>'erased' AND source IS NOT NULL)),
 CHECK (state<>'unchanged' OR "firstRecordId" IS NOT NULL)
);
CREATE FUNCTION public.diagnostic_source_observed_identity(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
 SELECT CASE WHEN v IS NULL OR v='null' THEN NULL ELSE
  jsonb_build_object('method',v->'method','vin',upper(btrim(v->>'vin')),'manualReference',v->'manualReference') END
$$;
CREATE FUNCTION public.diagnostic_source_anchor_origin(oid text) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path = pg_catalog, public AS $$
 SELECT jsonb_build_object('listing',public.diagnostic_source_project(to_jsonb(l),'["id","sellerId","businessId","vin","brandId","modelId","year"]'),
  'commissionerId',o."commissionerId",'listingId',o."listingId",'audience',o.audience,
  'memberId',m.id,'memberUserId',m."userId",'memberBusinessId',COALESCE(m."dealershipId",l."businessId"),'memberRole',m.role)
 FROM public.inspection_orders o LEFT JOIN public.listings l ON l.id=o."listingId"
 LEFT JOIN public.dealership_members m ON m."userId"=o."commissionerId" AND m."dealershipId"=l."businessId" WHERE o.id=oid
$$;
CREATE FUNCTION public.diagnostic_source_anchor_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE receipt public.diagnostic_source_commands; raw public.diagnostic_identity_records; component public.diagnostic_ownership_components;
 grant_row public.diagnostic_ownership_grants; oid text; plan jsonb; initial boolean;
BEGIN
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF receipt.id IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.scope) s WHERE s->>'table'='inspection_orders' AND s->'key'->>'id'=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_receipt'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM public.inspection_orders WHERE id=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable'; END IF;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  IF receipt.command->>'operation'<>'order_create' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.command->'rows') r
   WHERE r->>'table'='inspection_orders' AND r->'key'->>'id'=oid AND r->>'verb'='insert') THEN RAISE EXCEPTION 'diagnostic_source_no_anchor_backfill'; END IF;
  NEW.state:='pending'; NEW."firstRecordId":=NULL; NEW.source:=public.diagnostic_source_anchor_origin(oid); NEW."createdTransaction":=pg_current_xact_id()::text;
  RETURN NEW;
 END IF;
 IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."createdTransaction" IS DISTINCT FROM OLD."createdTransaction"
  OR (OLD.state IN ('changed','unavailable','erased') AND NEW.state NOT IN (OLD.state,'erased'))
  OR (NEW.source IS DISTINCT FROM OLD.source AND NOT (NEW.state='erased' AND NEW.source IS NULL))
  OR (OLD."firstRecordId" IS NOT NULL AND NEW."firstRecordId" IS DISTINCT FROM OLD."firstRecordId" AND NEW.state<>'erased') THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable'; END IF;
 IF NEW.state='erased' THEN
  IF EXISTS (SELECT 1 FROM public.diagnostic_ownership_components c JOIN public.diagnostic_identity_records r ON r.id=c."identityRecordId"
   JOIN public.inspection_orders o ON o.id=r."orderId" WHERE c."identityRecordId"=OLD."firstRecordId" AND c.state='available' AND r."erasedAt" IS NULL AND o."erasedAt" IS NULL) THEN RAISE EXCEPTION 'diagnostic_source_anchor_disposal'; END IF;
  NEW.source:=NULL; NEW."firstRecordId":=NULL; RETURN NEW;
 END IF;
 IF OLD."firstRecordId" IS NULL AND NEW."firstRecordId" IS NOT NULL THEN
  IF receipt.command->>'operation'<>'observation_append' THEN RAISE EXCEPTION 'diagnostic_source_first_slot'; END IF;
  SELECT value INTO plan FROM jsonb_array_elements(receipt.command->'rows') r WHERE r->>'table'='diagnostic_identity_records'
   AND r->>'verb'='insert' AND r->'key'->>'id'=NEW."firstRecordId" AND r->'next'->>'orderId'=oid;
  SELECT * INTO raw FROM public.diagnostic_identity_records WHERE id=NEW."firstRecordId" AND "orderId"=oid AND "ownershipCaptureTransaction"=pg_current_xact_id()::text;
  SELECT * INTO component FROM public.diagnostic_ownership_components WHERE "identityRecordId"=raw.id AND "orderId"=oid;
  SELECT * INTO grant_row FROM public.diagnostic_ownership_grants WHERE id=component."grantId";
  IF plan IS NULL OR raw.id IS NULL OR component."identityRecordId" IS NULL THEN RAISE EXCEPTION 'diagnostic_source_first_slot'; END IF;
  -- Claim only the immutable first slot. A changed shell remains changed; a no-grant
  -- capture succeeds unavailable. Existing source/grant guards check exact bindings.
  IF OLD.state='pending' THEN
   NEW.state:=CASE WHEN component.state='available' AND public.diagnostic_ownership_grant_current(grant_row,clock_timestamp() AT TIME ZONE 'UTC') IS TRUE THEN 'unchanged' ELSE 'unavailable' END;
  ELSE NEW.state:=OLD.state; END IF;
 ELSIF NEW.state='unchanged' AND OLD.state<>'unchanged' THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_source_anchor_guard BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostic_source_anchors
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_anchor_guard();
CREATE TRIGGER diagnostic_source_anchor_no_truncate BEFORE TRUNCATE ON public.diagnostic_source_anchors
 FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_forbid();
CREATE FUNCTION public.diagnostic_source_order_shell() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 -- Expansion creates shells only for an explicitly prepared NEW order. No legacy reads or backfill.
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text AND command->>'operation'='order_create') THEN
  INSERT INTO public.diagnostic_source_anchors("orderId",state,source,"createdTransaction") VALUES(NEW.id,'pending','{}',pg_current_xact_id()::text);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER diagnostic_source_order_shell AFTER INSERT ON public.inspection_orders
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_order_shell();
CREATE FUNCTION public.diagnostic_seal_first_observation(receipt_id uuid,order_id text,raw_id text) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
BEGIN
 PERFORM public.diagnostic_assert_source(receipt_id,'observation_append');
 UPDATE public.diagnostic_source_anchors SET "firstRecordId"=raw_id WHERE "orderId"=order_id AND "firstRecordId" IS NULL AND state<>'erased';
 -- A legacy order has no shell and stays unavailable forever. A later raw never replaces the slot.
END $$;
CREATE FUNCTION public.diagnostic_source_anchor_live() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE a public.diagnostic_source_anchors;
BEGIN
 SELECT * INTO a FROM public.diagnostic_source_anchors WHERE "orderId"=NEW."orderId";
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF a.state='unchanged' AND NOT EXISTS (SELECT 1 FROM public.diagnostic_identity_records r
  JOIN public.diagnostic_ownership_components c ON c."identityRecordId"=r.id
  WHERE r.id=a."firstRecordId" AND r."orderId"=a."orderId" AND r."erasedAt" IS NULL AND c.state='available') THEN RAISE EXCEPTION 'diagnostic_source_anchor_live'; END IF;
 IF a.state='pending' AND EXISTS (SELECT 1 FROM public.diagnostic_identity_records WHERE "orderId"=a."orderId") THEN RAISE EXCEPTION 'diagnostic_source_unsealed_anchor'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER diagnostic_source_anchor_live AFTER INSERT OR UPDATE ON public.diagnostic_source_anchors
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_anchor_live();
CREATE FUNCTION public.diagnostic_source_transition() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_row jsonb; after_row jsonb; oid text; receipt public.diagnostic_source_commands; initial boolean:=false;
BEGIN
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF TG_TABLE_NAME='listings' THEN
  IF TG_OP='UPDATE' AND ROW(OLD."sellerId",OLD."businessId",OLD."brandId",OLD."modelId",OLD.year,upper(btrim(OLD.vin)))
   IS NOT DISTINCT FROM ROW(NEW."sellerId",NEW."businessId",NEW."brandId",NEW."modelId",NEW.year,upper(btrim(NEW.vin))) THEN RETURN NULL; END IF;
  UPDATE public.diagnostic_source_anchors a SET state='changed' WHERE a.state IN ('pending','unchanged')
   AND (a.source->>'listingId'=before_row->>'id' OR a.source->>'listingId'=after_row->>'id');
 ELSIF TG_TABLE_NAME='dealership_members' THEN
  IF TG_OP='UPDATE' AND ROW(OLD.id,OLD."userId",OLD."dealershipId",OLD.role) IS NOT DISTINCT FROM ROW(NEW.id,NEW."userId",NEW."dealershipId",NEW.role) THEN RETURN NULL; END IF;
  UPDATE public.diagnostic_source_anchors a SET state='changed' WHERE a.state IN ('pending','unchanged')
   AND (a.source->>'memberId'=before_row->>'id' OR a.source->>'memberId'=after_row->>'id'
    OR (a.source->>'commissionerId' IN (before_row->>'userId',after_row->>'userId') AND a.source->>'memberBusinessId' IN (before_row->>'dealershipId',after_row->>'dealershipId')));
 ELSIF TG_TABLE_NAME='inspection_orders' THEN
  oid:=after_row->>'id';
  IF ROW(OLD."listingId",OLD."commissionerId",OLD.audience) IS DISTINCT FROM ROW(NEW."listingId",NEW."commissionerId",NEW.audience) THEN
   UPDATE public.diagnostic_source_anchors SET state='changed' WHERE "orderId"=oid AND state IN ('pending','unchanged');
  ELSIF public.diagnostic_source_observed_identity(OLD."observedVehicle") IS DISTINCT FROM public.diagnostic_source_observed_identity(NEW."observedVehicle") THEN
   initial:=OLD."observedVehicle" IS NULL AND receipt.command->>'operation'='observation_append'
    AND EXISTS (SELECT 1 FROM public.diagnostic_source_anchors WHERE "orderId"=oid AND "firstRecordId" IS NULL AND state='pending')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.command->'rows') r WHERE r->>'table'='diagnostic_identity_records' AND r->>'verb'='insert' AND r->'next'->>'orderId'=oid
     AND public.diagnostic_source_observed_identity(r->'next'->'observation')=public.diagnostic_source_observed_identity(NEW."observedVehicle"));
   IF initial IS NOT TRUE THEN UPDATE public.diagnostic_source_anchors SET state='changed' WHERE "orderId"=oid AND state IN ('pending','unchanged'); END IF;
  END IF;
 ELSIF TG_TABLE_NAME='diagnostic_ownership_components' THEN
  IF NEW.state='erased' THEN UPDATE public.diagnostic_source_anchors SET state='erased',source=NULL,"firstRecordId"=NULL WHERE "firstRecordId"=NEW."identityRecordId" AND state<>'erased'; END IF;
 ELSIF TG_TABLE_NAME='diagnostic_identity_records' THEN
  IF TG_OP='DELETE' OR after_row->'erasedAt'<>'null' THEN
   UPDATE public.diagnostic_source_anchors SET state='erased',source=NULL,"firstRecordId"=NULL WHERE "firstRecordId"=before_row->>'id' AND state<>'erased';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER diagnostic_source_listing_transition AFTER UPDATE OR DELETE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_transition();
CREATE TRIGGER diagnostic_source_member_transition AFTER INSERT OR UPDATE OR DELETE ON public.dealership_members FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_transition();
CREATE TRIGGER diagnostic_source_order_transition AFTER UPDATE ON public.inspection_orders FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_transition();
CREATE TRIGGER diagnostic_source_component_erased AFTER UPDATE ON public.diagnostic_ownership_components FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_transition();
CREATE TRIGGER diagnostic_source_raw_erased AFTER UPDATE OR DELETE ON public.diagnostic_identity_records FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_transition();

CREATE FUNCTION public.diagnostic_assert_source_write(table_name text,operation text,old_row jsonb,new_row jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE receipt public.diagnostic_source_commands; e jsonb; old_source jsonb; new_source jsonb; k jsonb; fields jsonb;
BEGIN
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF receipt.id IS NULL THEN RAISE EXCEPTION 'diagnostic_source_unprepared'; END IF;
 fields:=public.diagnostic_source_meta(table_name)->'fields';
 old_source:=public.diagnostic_source_project(old_row,fields); new_source:=public.diagnostic_source_project(new_row,fields);
 k:=public.diagnostic_source_key(table_name,COALESCE(new_row,old_row));
 SELECT value INTO e FROM jsonb_array_elements(receipt.effects) r WHERE r->>'table'=table_name AND r->'key'=k AND r->>'verb'=lower(operation);
 IF e IS NULL THEN RAISE EXCEPTION 'diagnostic_source_uncovered_effect'; END IF;
 IF e->>'derived'='invalidation' THEN
  IF operation<>'UPDATE' OR old_source IS DISTINCT FROM e->'expected'->'source'
   OR (new_source-'invalidatedAt') IS DISTINCT FROM (old_source-'invalidatedAt') OR new_source->'invalidatedAt'='null' THEN RAISE EXCEPTION 'diagnostic_source_effect_mismatch'; END IF;
 ELSE
  IF (operation<>'INSERT' AND old_source IS DISTINCT FROM e->'expected'->'source')
   OR (operation<>'DELETE' AND new_source IS DISTINCT FROM e->'next') THEN RAISE EXCEPTION 'diagnostic_source_effect_mismatch'; END IF;
 END IF;
END $$;
CREATE FUNCTION public.diagnostic_source_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_row jsonb; after_row jsonb; fields jsonb;
BEGIN
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 fields:=public.diagnostic_source_meta(TG_TABLE_NAME)->'fields';
 IF TG_OP='UPDATE' AND public.diagnostic_source_project(before_row,fields) IS NOT DISTINCT FROM public.diagnostic_source_project(after_row,fields) THEN RETURN NEW; END IF;
 PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,before_row,after_row);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION public.diagnostic_source_statement_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'diagnostic_source_unprepared'; END IF;
 RETURN NULL;
END $$;
-- Dormant strict guards are an expand/activate boundary owned by the caller batch.
-- Enabling them is privileged forward DDL after complete caller/fixture/bootstrap proof.
-- There is deliberately no runtime GUC, role exemption or activation function.
DO $install$
DECLARE m jsonb; t text; columns text;
BEGIN
 FOR m IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_registry()) LOOP
  t:=m->>'table';
  SELECT string_agg(format('%I',value),',') INTO columns FROM jsonb_array_elements_text(m->'fields');
  EXECUTE format('CREATE TRIGGER diagnostic_source_presence BEFORE INSERT OR DELETE OR UPDATE OF %s ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_statement_guard()',columns,t);
  -- AFTER ROW observes effective NEW after every BEFORE trigger, including changes
  -- made by another trigger to columns absent from the original UPDATE target list.
  EXECUTE format('CREATE TRIGGER diagnostic_source_effective AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_row_guard()',t);
  EXECUTE format('CREATE TRIGGER diagnostic_source_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_forbid()',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER diagnostic_source_presence',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER diagnostic_source_effective',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER diagnostic_source_no_truncate',t);
 END LOOP;
END $install$;

-- Compose at the existing component-only disposal boundary. Report/raw pins, observation
-- date/mileage and consumed report retry minima remain owned by existing disposers.
ALTER FUNCTION public.diagnostic_dispose_ownership_scope(text,timestamp,text) RENAME TO diagnostic_dispose_ownership_scope_pre_kernel;
CREATE FUNCTION public.diagnostic_dispose_ownership_scope(subject_id text,cutoff timestamp,grant_id text) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE targets jsonb; removed integer;
BEGIN
 targets:=public.diagnostic_ownership_disposal_scope(subject_id,cutoff,grant_id);
 removed:=public.diagnostic_dispose_ownership_scope_pre_kernel(subject_id,cutoff,grant_id);
 UPDATE public.diagnostic_source_anchors a SET state='erased',source=NULL,"firstRecordId"=NULL WHERE a.state<>'erased' AND
  ((subject_id IS NOT NULL AND (a.source->>'commissionerId'=subject_id OR a.source->'listing'->>'sellerId'=subject_id
    OR a.source->>'memberUserId'=subject_id))
   OR a."firstRecordId" IN (SELECT jsonb_array_elements_text(targets->'c'))
   OR a."orderId" IN (SELECT g."orderId" FROM public.diagnostic_ownership_grants g WHERE g.id IN (SELECT jsonb_array_elements_text(targets->'g'))));
 RETURN removed;
END $$;
