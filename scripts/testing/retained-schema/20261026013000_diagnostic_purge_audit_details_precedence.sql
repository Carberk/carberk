-- Forward-only JSON extraction precedence correction; no policy or activation change.
CREATE OR REPLACE FUNCTION public.diagnostic_account_purge_effects(c jsonb) RETURNS jsonb
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
  patch:=jsonb_build_object('details',(r->'details')-'reason');
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
