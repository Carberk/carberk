-- Additive operator-only admission. No product guard, grant or ordinary cap changes.
-- This does not activate the reset executor. Historical migrations remain immutable.
CREATE SCHEMA staging_clean_reset_rows;
REVOKE ALL ON SCHEMA staging_clean_reset_rows FROM PUBLIC;
CREATE TABLE staging_clean_reset_rows.operations (
 operation_id text PRIMARY KEY, binding jsonb NOT NULL, expected jsonb NOT NULL,
 plan jsonb NOT NULL, plan_digest text NOT NULL,
 backend_pid integer NOT NULL, full_transaction_id text NOT NULL,
 admitted_at timestamptz NOT NULL, result jsonb
);
REVOKE ALL ON staging_clean_reset_rows.operations FROM PUBLIC;

CREATE FUNCTION staging_clean_reset_rows.classification() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT '{"_prisma_migrations":"retain-protected","audit_logs":"delete","blocked_users":"delete","blog_posts":"refuse-if-nonempty","body_types":"retain-reference","brands":"retain-reference","business_enquiry_audits":"delete","campaign_preparations":"refuse-if-nonempty","cities":"retain-reference","colors":"retain-reference","content_reports":"delete","conversation_participants":"delete","conversations":"delete","dealership_invitations":"delete","dealership_members":"delete","dealerships":"delete","diagnostic_audits":"delete","diagnostic_center_assignments":"delete","diagnostic_centers":"refuse-if-approved","diagnostic_continuity_proofs":"delete","diagnostic_continuity_requests":"delete","diagnostic_evidence":"delete","diagnostic_identity_evidence":"delete","diagnostic_identity_provenance":"delete","diagnostic_identity_records":"delete","diagnostic_order_assignments":"delete","diagnostic_ownership_components":"delete","diagnostic_ownership_grants":"delete","diagnostic_pdf_artifacts":"delete","diagnostic_reports":"delete","diagnostic_source_anchors":"delete","diagnostic_source_commands":"refuse-if-nonempty","diagnostic_template_versions":"delete","drive_types":"retain-reference","engine_types":"retain-reference","exchange_rates":"retain-reference","favorites":"delete","fcm_devices":"delete","generations":"retain-reference","history_artifact_cleanup":"delete","history_artifacts":"delete","history_bookings":"delete","history_capacity_days":"delete","history_deliveries":"delete","history_orders":"delete","history_payments":"delete","history_provider_allowances":"delete","history_purchase_intents":"delete","history_quotes":"delete","history_refunds":"delete","inspection_interests":"delete","inspection_orders":"delete","listing_drafts":"delete","listing_media":"delete","listing_view_days":"delete","listing_view_fingerprints":"delete","listings":"delete","market_knowledge_dataset_sources":"refuse-if-nonempty","market_knowledge_datasets":"refuse-if-nonempty","market_knowledge_sources":"refuse-if-nonempty","measurement_investigation_exports":"delete","measurement_outbox":"delete","measurement_principals":"delete","measurement_records":"delete","measurement_rollups":"delete","measurement_state":"retain-protected","measurement_visits":"delete","media_upload_cleanups":"delete","media_uploads":"delete","messages":"delete","models":"retain-reference","notification_history":"delete","notification_preferences":"delete","otp_requests":"delete","owned_vehicles":"delete","regions":"retain-reference","saved_searches":"delete","service_attachments":"delete","service_audits":"delete","service_conversations":"delete","service_erasure_fences":"delete","service_messages":"delete","service_outbox":"delete","service_push_subscriptions":"delete","service_read_states":"delete","sessions":"delete","staff_grants":"delete","support_cases":"delete","totp_backup_codes":"delete","totp_enrollments":"delete","transmissions":"retain-reference","users":"delete","vehicle_history_requests":"delete","verified_contact_phones":"delete","video_cleanup_work":"delete","video_generations":"delete","video_grants":"delete","video_process_work":"delete","video_upload_sessions":"delete"}'::jsonb
$fn$;

CREATE FUNCTION staging_clean_reset_rows.require_operator() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
DECLARE owned oid;
BEGIN
 SELECT nspowner INTO owned FROM pg_namespace WHERE nspname='staging_clean_reset_rows';
 IF owned IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname=current_user)
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='staging_clean_reset_rows.operations'::regclass AND relowner=owned AND relacl IS NOT NULL)
   OR EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
     WHERE n.nspname='staging_clean_reset_rows' AND a.grantee<>owned)
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE c.oid='staging_clean_reset_rows.operations'::regclass AND a.grantee<>owned)
 THEN RAISE EXCEPTION 'operational_reset_operator_required'; END IF;
END $fn$;

CREATE FUNCTION staging_clean_reset_rows.observe() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE t text; disposition text; rows_json jsonb; counts jsonb:='{}'; content jsonb:='{}'; retained jsonb:='{}'; definitions text; sequences jsonb;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname NOT IN ('information_schema','public','staging_clean_reset_rows'))
 THEN RAISE EXCEPTION 'operational_reset_namespace_unqualified'; END IF;
 IF EXISTS(SELECT 1 FROM pg_event_trigger) OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind NOT IN ('r','i','S'))
 THEN RAISE EXCEPTION 'operational_reset_schema_unqualified'; END IF;
 IF (SELECT coalesce(jsonb_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public') IS DISTINCT FROM
    (SELECT jsonb_agg(key ORDER BY key) FROM jsonb_each(staging_clean_reset_rows.classification()))
 THEN RAISE EXCEPTION 'operational_reset_table_inventory'; END IF;
 FOR t,disposition IN SELECT key,value#>>'{}' FROM jsonb_each(staging_clean_reset_rows.classification()) ORDER BY key LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C"),''[]''::jsonb) FROM public.%I r',t) INTO rows_json;
  IF disposition='refuse-if-nonempty' AND jsonb_array_length(rows_json)<>0 THEN RAISE EXCEPTION 'operational_reset_protected_table:%',t; END IF;
  IF disposition='refuse-if-approved' AND EXISTS(SELECT 1 FROM jsonb_array_elements(rows_json) r WHERE r->'operationalApproval' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'operational_reset_approved_reference'; END IF;
  counts:=counts||jsonb_build_object(t,jsonb_array_length(rows_json));
  IF disposition LIKE 'retain%' THEN retained:=retained||jsonb_build_object(t,rows_json);
  ELSE content:=content||jsonb_build_object(t,rows_json); END IF;
 END LOOP;
 SELECT string_agg(d,chr(10) ORDER BY d COLLATE "C") INTO definitions FROM (
  SELECT 'class:'||c.oid::regclass::text||':'||c.relkind::text||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text AS d FROM pg_class c WHERE c.relnamespace='public'::regnamespace
  UNION ALL SELECT 'column:'||a.attrelid::regclass::text||':'||a.attnum||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'constraint:'||conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace
  UNION ALL SELECT 'trigger:'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
  UNION ALL SELECT 'function:'||pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
  UNION ALL SELECT 'index:'||pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace
  UNION ALL SELECT 'enum:'||t.typname||':'||e.enumsortorder||':'||e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace='public'::regnamespace
 ) d;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',sequencename,'last',last_value,'start',start_value,'increment',increment_by,'cycle',cycle) ORDER BY sequencename),'[]') INTO sequences FROM pg_sequences WHERE schemaname='public';
 RETURN jsonb_build_object('schema',encode(sha256(convert_to(definitions,'UTF8')),'hex'),
  'retained',encode(sha256(convert_to(retained::text,'UTF8')),'hex'),
  'disposable',encode(sha256(convert_to(content::text,'UTF8')),'hex'),'counts',counts,'sequences',sequences);
END $fn$;

CREATE FUNCTION staging_clean_reset_rows.prepare(binding jsonb,expected jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE t text; actual jsonb; plan jsonb:='[]'; entries jsonb; current_op text;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 IF (jsonb_typeof(binding)='object' AND binding-ARRAY['operationId','reservationId','owner','candidate','targetIdentity','closureGeneration','closureEvidenceDigest','executorDigest']='{}'
  AND binding ?& ARRAY['operationId','reservationId','owner','candidate','targetIdentity','closureGeneration','closureEvidenceDigest','executorDigest']
  AND binding->>'operationId' ~ '^[a-f0-9]{32}$' AND binding->>'reservationId' ~ '^[a-f0-9]{32}$'
  AND binding->>'owner' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' AND binding->>'candidate' ~ '^[a-f0-9]{40}$'
  AND binding->>'closureGeneration' ~ '^[a-f0-9]{32}$' AND binding->>'closureEvidenceDigest' ~ '^[a-f0-9]{64}$'
  AND binding->>'executorDigest' ~ '^[a-f0-9]{64}$'
  AND binding->'targetIdentity'=jsonb_build_object('projectId','176ddec0-dd65-4087-b82c-798599fc2ebe','environmentId','652abc79-fdb0-48b0-9f6c-ad0ff572d7b2','api','6db6f1b1-5c7a-4033-88d0-53f5f315bfc0','database','postgresql://postgres.railway.internal:5432/railway')) IS NOT TRUE
 THEN RAISE EXCEPTION 'operational_reset_binding'; END IF;
 PERFORM set_config('lock_timeout','10s',true);
 PERFORM set_config('statement_timeout','240s',true);
 PERFORM set_config('transaction_timeout','240s',true);
 FOR t IN SELECT key FROM jsonb_each(staging_clean_reset_rows.classification()) ORDER BY key LOOP
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
 END LOOP;
 LOCK TABLE staging_clean_reset_rows.operations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM staging_clean_reset_rows.operations WHERE result IS NULL)
 THEN RAISE EXCEPTION 'operational_reset_active_admission'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend')
 THEN RAISE EXCEPTION 'operational_reset_other_backend'; END IF;
 actual:=staging_clean_reset_rows.observe();
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'operational_reset_inventory_changed'; END IF;
 FOR t IN SELECT key FROM jsonb_each(staging_clean_reset_rows.classification()) WHERE value#>>'{}' NOT LIKE 'retain%' ORDER BY key LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''table'',%L,''old'',to_jsonb(r)) ORDER BY to_jsonb(r)::text COLLATE "C"),''[]''::jsonb) FROM public.%I r',t,t) INTO entries;
  plan:=plan||entries;
  IF jsonb_array_length(plan)>10000 OR octet_length(convert_to(plan::text,'UTF8'))>8388608 THEN RAISE EXCEPTION 'operational_reset_plan_limit'; END IF;
 END LOOP;
 current_op:=binding->>'operationId';
 INSERT INTO staging_clean_reset_rows.operations(operation_id,binding,expected,plan,plan_digest,backend_pid,full_transaction_id,admitted_at)
 VALUES(current_op,binding,expected,plan,encode(sha256(convert_to(plan::text,'UTF8')),'hex'),pg_backend_pid(),pg_current_xact_id()::text,clock_timestamp());
 RETURN jsonb_build_object('operationId',current_op,'tupleCount',jsonb_array_length(plan));
END $fn$;

CREATE FUNCTION staging_clean_reset_rows.must_finish() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM staging_clean_reset_rows.operations WHERE operation_id=NEW.operation_id AND result IS NULL)
 THEN RAISE EXCEPTION 'operational_reset_unfinished'; END IF;
 RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER operational_reset_must_finish AFTER INSERT ON staging_clean_reset_rows.operations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staging_clean_reset_rows.must_finish();

-- No finish or disposal permission is installed by this first admission slice.
-- Until the exact DELETE graph and server-side completion are qualified, every
-- admission must roll back and cannot authorize an ordinary product guard.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staging_clean_reset_rows FROM PUBLIC;

CREATE FUNCTION staging_clean_reset_rows.allows_old(relation_name text,old_row jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
DECLARE held staging_clean_reset_rows.operations;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 SELECT * INTO held FROM staging_clean_reset_rows.operations WHERE backend_pid=pg_backend_pid()
  AND full_transaction_id=pg_current_xact_id()::text AND result IS NULL;
 IF held.operation_id IS NULL THEN RETURN false; END IF;
 IF clock_timestamp()-held.admitted_at>interval '240 seconds' THEN RAISE EXCEPTION 'operational_reset_transaction_expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(held.plan) r WHERE r->>'table'=relation_name AND r->'old'=old_row)
 THEN RAISE EXCEPTION 'operational_reset_old_tuple_changed'; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION staging_clean_reset_rows.allows_old(text,jsonb) FROM PUBLIC;

CREATE FUNCTION staging_clean_reset_rows.immutable_admission() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'operational_reset_receipt_immutable'; END $fn$;
CREATE TRIGGER operational_reset_immutable_admission BEFORE UPDATE OR DELETE ON staging_clean_reset_rows.operations
FOR EACH ROW EXECUTE FUNCTION staging_clean_reset_rows.immutable_admission();
CREATE TRIGGER operational_reset_no_truncate BEFORE TRUNCATE ON staging_clean_reset_rows.operations
FOR EACH STATEMENT EXECUTE FUNCTION staging_clean_reset_rows.immutable_admission();
REVOKE ALL ON FUNCTION staging_clean_reset_rows.immutable_admission() FROM PUBLIC;

-- Exact DELETE-only operator admission. All original ordinary branches remain.
CREATE OR REPLACE FUNCTION diagnostic_identity_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."erasedAt" IS NOT NULL OR NEW."recordedById" IS NULL OR NOT EXISTS (SELECT 1 FROM inspection_orders o
    WHERE o.id=NEW."orderId" AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL AND o."observedVehicle"=NEW.observation)
  THEN RAISE EXCEPTION 'diagnostic_identity_record_binding'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
   IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_record_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."orderVersion",NEW."recordedAt") IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."orderVersion",OLD."recordedAt")
  OR (NEW."recordedById" IS NOT NULL AND NEW."recordedById" IS DISTINCT FROM OLD."recordedById")
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."erasedAt" IS NULL AND ROW(NEW.observation,NEW."observationHash") IS DISTINCT FROM ROW(OLD.observation,OLD."observationHash"))
 THEN RAISE EXCEPTION 'diagnostic_identity_record_immutable'; END IF;
 RETURN NEW;
END $$;
