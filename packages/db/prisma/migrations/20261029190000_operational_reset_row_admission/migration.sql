-- Additive operator-owned operational reset row admission (#901). No grant, ordinary
-- cap or historical migration changes. Only the fixed executor's authenticated operator
-- principal, which owns this namespace, can admit, dispose and finish one exact sealed
-- DELETE plan. Directly owning guards gain a DELETE-only branch; ordinary branches remain.
CREATE SCHEMA staging_clean_reset_rows;
REVOKE ALL ON SCHEMA staging_clean_reset_rows FROM PUBLIC;

-- Committed admission records digests and counts only. Sealed full OLD tuples live in a
-- transaction-local temporary table, so disposed credentials never persist in a receipt.
CREATE TABLE staging_clean_reset_rows.admissions (
 operation_id text PRIMARY KEY, binding jsonb NOT NULL, sealed_state jsonb NOT NULL,
 plan_digest text NOT NULL, tuple_count integer NOT NULL,
 backend_pid integer NOT NULL, full_transaction_id text NOT NULL, admitted_at timestamptz NOT NULL
);
CREATE TABLE staging_clean_reset_rows.completions (
 operation_id text PRIMARY KEY REFERENCES staging_clean_reset_rows.admissions(operation_id),
 result jsonb NOT NULL, completed_at timestamptz NOT NULL
);
REVOKE ALL ON staging_clean_reset_rows.admissions, staging_clean_reset_rows.completions FROM PUBLIC;

CREATE FUNCTION staging_clean_reset_rows.classification() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT '{"_prisma_migrations":"retain-protected","audit_logs":"delete","blocked_users":"delete","blog_posts":"refuse-if-nonempty","body_types":"retain-reference","brands":"retain-reference","business_enquiry_audits":"delete","campaign_preparations":"refuse-if-nonempty","cities":"retain-reference","colors":"retain-reference","content_reports":"delete","conversation_participants":"delete","conversations":"delete","dealership_invitations":"delete","dealership_members":"delete","dealerships":"delete","diagnostic_audits":"delete","diagnostic_center_assignments":"delete","diagnostic_centers":"refuse-if-approved","diagnostic_continuity_proofs":"delete","diagnostic_continuity_requests":"delete","diagnostic_evidence":"delete","diagnostic_identity_evidence":"delete","diagnostic_identity_provenance":"delete","diagnostic_identity_records":"delete","diagnostic_order_assignments":"delete","diagnostic_ownership_components":"delete","diagnostic_ownership_grants":"delete","diagnostic_pdf_artifacts":"delete","diagnostic_reports":"delete","diagnostic_source_anchors":"delete","diagnostic_source_commands":"refuse-if-nonempty","diagnostic_template_versions":"delete","drive_types":"retain-reference","engine_types":"retain-reference","exchange_rates":"retain-reference","favorites":"delete","fcm_devices":"delete","generations":"retain-reference","history_artifact_cleanup":"delete","history_artifacts":"delete","history_bookings":"delete","history_capacity_days":"delete","history_deliveries":"delete","history_orders":"delete","history_payments":"delete","history_provider_allowances":"delete","history_purchase_intents":"delete","history_quotes":"delete","history_refunds":"delete","inspection_interests":"delete","inspection_orders":"delete","listing_drafts":"delete","listing_media":"delete","listing_view_days":"delete","listing_view_fingerprints":"delete","listings":"delete","market_knowledge_dataset_sources":"refuse-if-nonempty","market_knowledge_datasets":"refuse-if-nonempty","market_knowledge_sources":"refuse-if-nonempty","measurement_investigation_exports":"delete","measurement_outbox":"delete","measurement_principals":"delete","measurement_records":"delete","measurement_rollups":"delete","measurement_state":"retain-protected","measurement_visits":"delete","media_upload_cleanups":"delete","media_uploads":"delete","messages":"delete","models":"retain-reference","notification_history":"delete","notification_preferences":"delete","otp_requests":"delete","owned_vehicles":"delete","regions":"retain-reference","saved_searches":"delete","service_attachments":"delete","service_audits":"delete","service_conversations":"delete","service_erasure_fences":"delete","service_messages":"delete","service_outbox":"delete","service_push_subscriptions":"delete","service_read_states":"delete","sessions":"delete","staff_grants":"delete","support_cases":"delete","totp_backup_codes":"delete","totp_enrollments":"delete","transmissions":"retain-reference","users":"delete","vehicle_history_requests":"delete","verified_contact_phones":"delete","video_cleanup_work":"delete","video_generations":"delete","video_grants":"delete","video_process_work":"delete","video_upload_sessions":"delete"}'::jsonb
$fn$;

-- Fixed child-first order over the actual FK graph. Proofs precede report evidence/PDF,
-- reports, requests, anchors, components and identity evidence, so invalidators and anchor
-- effects find no target. Verified against the live graph at the end of this migration.
CREATE FUNCTION staging_clean_reset_rows.delete_order() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT ARRAY['diagnostic_continuity_proofs','diagnostic_evidence','diagnostic_pdf_artifacts','diagnostic_reports','diagnostic_continuity_requests','diagnostic_source_anchors','diagnostic_ownership_components','diagnostic_identity_evidence','audit_logs','blocked_users','blog_posts','business_enquiry_audits','campaign_preparations','content_reports','conversation_participants','dealership_invitations','dealership_members','diagnostic_audits','diagnostic_center_assignments','diagnostic_identity_provenance','diagnostic_identity_records','diagnostic_order_assignments','diagnostic_ownership_grants','diagnostic_source_commands','favorites','history_artifact_cleanup','history_bookings','history_deliveries','history_artifacts','history_payments','history_provider_allowances','history_purchase_intents','history_refunds','history_orders','history_capacity_days','history_quotes','inspection_interests','inspection_orders','diagnostic_template_versions','diagnostic_centers','listing_drafts','listing_media','listing_view_days','listing_view_fingerprints','market_knowledge_dataset_sources','market_knowledge_datasets','market_knowledge_sources','measurement_investigation_exports','measurement_outbox','measurement_records','measurement_rollups','measurement_visits','measurement_principals','media_upload_cleanups','media_uploads','messages','conversations','notification_history','notification_preferences','otp_requests','owned_vehicles','saved_searches','service_audits','service_erasure_fences','service_messages','service_attachments','service_outbox','service_push_subscriptions','fcm_devices','service_read_states','service_conversations','staff_grants','support_cases','totp_backup_codes','totp_enrollments','vehicle_history_requests','listings','dealerships','verified_contact_phones','video_cleanup_work','video_generations','video_grants','sessions','users','video_process_work','video_upload_sessions']::text[]
$fn$;

-- Self references are disposed leaf-first: a row goes only after every remaining row that
-- refers to it, so RESTRICT/CASCADE/SET NULL actions find nothing.
CREATE FUNCTION staging_clean_reset_rows.self_references() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT '{"diagnostic_identity_evidence":"supersedesId","diagnostic_reports":"predecessorId","users":"suspendedById"}'::jsonb
$fn$;

-- Certified self-reference edges must be acyclic before any disposal effect. The fixed
-- DELETE loop can remove a self-reference leaf, but it cannot lawfully widen to an UPDATE
-- or cascade when a row participates in a cycle.
CREATE FUNCTION staging_clean_reset_rows.has_certified_self_reference_cycle() RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE relation_name text; self_column text; has_cycle boolean;
BEGIN
 FOR relation_name,self_column IN
   SELECT key,value#>>'{}' FROM jsonb_each(staging_clean_reset_rows.self_references()) ORDER BY key
 LOOP
  EXECUTE format($sql$
    WITH RECURSIVE edges AS (
      SELECT id::text AS node,%1$I::text AS next_node
      FROM public.%2$I
      WHERE %1$I IS NOT NULL
    ), walk(start_node,node,path) AS (
      SELECT node,node,ARRAY[node]::text[] FROM edges
      UNION ALL
      SELECT w.start_node,e.next_node,w.path||e.next_node
      FROM walk w JOIN edges e ON e.node=w.node
      WHERE NOT e.next_node=ANY(w.path)
    )
    SELECT EXISTS (
      SELECT 1 FROM walk w JOIN edges e ON e.node=w.node
      WHERE e.next_node=w.start_node
    )
  $sql$,self_column,relation_name) INTO has_cycle;
  IF has_cycle THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $fn$;

-- Exact FK columns/actions and trigger/function definitions the fixed plan was proved against.
CREATE FUNCTION staging_clean_reset_rows.graph() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(coalesce(string_agg(d,chr(10) ORDER BY d COLLATE "C"),''),'UTF8')),'hex') FROM (
  SELECT 'fk:'||k.conrelid::regclass::text||':'||k.conname||':'||pg_get_constraintdef(k.oid)||':'||k.condeferrable::text||':'||k.condeferred::text AS d
   FROM pg_constraint k WHERE k.contype='f' AND k.connamespace='public'::regnamespace
  UNION ALL SELECT 'trigger:'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid))
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
 ) g
$fn$;

CREATE FUNCTION staging_clean_reset_rows.require_operator() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
DECLARE owned oid;
BEGIN
 SELECT nspowner INTO owned FROM pg_namespace WHERE nspname='staging_clean_reset_rows';
 IF owned IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname=current_user)
   OR EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='staging_clean_reset_rows' AND a.grantee<>owned)
   OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='staging_clean_reset_rows'::regnamespace AND (c.relowner<>owned OR (c.relkind='r' AND c.relacl IS NULL)))
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.relnamespace='staging_clean_reset_rows'::regnamespace AND a.grantee<>owned)
   OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='staging_clean_reset_rows'::regnamespace AND (p.proowner<>owned OR p.prosecdef))
 THEN RAISE EXCEPTION 'operational_reset_operator_required'; END IF;
END $fn$;

-- Server observation. Row content is hashed, never returned.
CREATE FUNCTION staging_clean_reset_rows.observe() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE t text; disposition text; rows_json jsonb; counts jsonb:='{}'; content jsonb:='{}'; retained jsonb:='{}'; definitions text; sequences jsonb;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname NOT IN ('information_schema','public','staging_clean_reset_rows','staging_clean_reset'))
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
  UNION ALL SELECT 'trigger:'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN ('public'::regnamespace,'staging_clean_reset_rows'::regnamespace) AND NOT t.tgisinternal
  UNION ALL SELECT 'function:'||pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'staging_clean_reset_rows'::regnamespace) AND p.prokind IN ('f','p')
  UNION ALL SELECT 'index:'||pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace
  UNION ALL SELECT 'enum:'||t.typname||':'||e.enumsortorder||':'||e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace='public'::regnamespace
 ) d;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',sequencename,'last',last_value,'start',start_value,'increment',increment_by,'cycle',cycle) ORDER BY sequencename),'[]') INTO sequences FROM pg_sequences WHERE schemaname='public';
 RETURN jsonb_build_object('schema',encode(sha256(convert_to(definitions,'UTF8')),'hex'),
  'retained',encode(sha256(convert_to(retained::text,'UTF8')),'hex'),
  'disposable',encode(sha256(convert_to(content::text,'UTF8')),'hex'),'counts',counts,'sequences',sequences);
END $fn$;

-- Admission seals every server-observed disposable OLD tuple for this backend and full
-- transaction. Caller JSON is bound into the record; it grants nothing by itself.
CREATE FUNCTION staging_clean_reset_rows.prepare(binding jsonb,expected jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE t text; actual jsonb; total bigint; plan_size bigint; digest text; tuples integer; current_op text; target jsonb;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 target:=binding->'targetIdentity';
 IF (jsonb_typeof(binding)='object'
  AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(binding) k)=ARRAY['candidate','closureEvidenceDigest','closureGeneration','expectedInventory','operationId','owner','planDigest','reservationId','targetIdentity']
  AND binding->>'operationId' ~ '^[a-f0-9]{32}$' AND binding->>'reservationId' ~ '^[a-f0-9]{32}$'
  AND binding->>'owner' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' AND binding->>'candidate' ~ '^[a-f0-9]{40}$'
  AND binding->>'closureGeneration' ~ '^[a-f0-9]{32}$' AND binding->>'closureEvidenceDigest' ~ '^[a-f0-9]{64}$'
  AND binding->>'planDigest' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(binding->'expectedInventory')='object'
  AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(binding->'expectedInventory') k)=ARRAY['disposable','retained','schema']
  AND binding#>>'{expectedInventory,schema}' ~ '^[a-f0-9]{64}$' AND binding#>>'{expectedInventory,retained}' ~ '^[a-f0-9]{64}$'
  AND binding#>>'{expectedInventory,disposable}' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(target)='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(target) k)=ARRAY['environmentId','origins','projectId','services']
  AND jsonb_typeof(target->'services')='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(target->'services') k)=ARRAY['api','worker']
  AND jsonb_typeof(target->'origins')='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(target->'origins') k)=ARRAY['database']
  AND target->>'projectId' ~ '^[a-zA-Z0-9-]{1,80}$' AND target->>'environmentId' ~ '^[a-zA-Z0-9-]{1,80}$'
  AND target#>>'{services,api}' ~ '^[a-zA-Z0-9-]{1,80}$' AND target#>>'{services,worker}' ~ '^[a-zA-Z0-9-]{1,80}$'
  AND target#>>'{origins,database}' ~ '^postgres(ql)?://postgres\.railway\.internal(:[0-9]{1,5})?/[A-Za-z0-9_]{1,63}$') IS NOT TRUE
 THEN RAISE EXCEPTION 'operational_reset_binding'; END IF;
 PERFORM set_config('lock_timeout','10s',true);
 PERFORM set_config('statement_timeout','240s',true);
 IF current_setting('server_version_num')::int>=170000 THEN PERFORM set_config('transaction_timeout','240s',true); END IF;
 -- Table-before-namespace order: every classified public table, then the operator store.
 FOR t IN SELECT key FROM jsonb_each(staging_clean_reset_rows.classification()) ORDER BY key LOOP
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
 END LOOP;
 LOCK TABLE staging_clean_reset_rows.admissions, staging_clean_reset_rows.completions IN ACCESS EXCLUSIVE MODE;
 IF to_regclass('pg_temp.operational_reset_sealed') IS NOT NULL OR EXISTS(SELECT 1 FROM staging_clean_reset_rows.admissions a
   WHERE NOT EXISTS(SELECT 1 FROM staging_clean_reset_rows.completions c WHERE c.operation_id=a.operation_id))
 THEN RAISE EXCEPTION 'operational_reset_active_admission'; END IF;
 IF EXISTS(SELECT 1 FROM staging_clean_reset_rows.admissions a WHERE a.operation_id=prepare.binding->>'operationId')
 THEN RAISE EXCEPTION 'operational_reset_operation_completed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend')
 THEN RAISE EXCEPTION 'operational_reset_other_backend'; END IF;
 IF staging_clean_reset_rows.graph() IS DISTINCT FROM staging_clean_reset_rows.certified_graph()
 THEN RAISE EXCEPTION 'operational_reset_unsupported_graph'; END IF;
 actual:=staging_clean_reset_rows.observe();
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'operational_reset_inventory_changed'; END IF;
 SELECT coalesce(sum(value::bigint),0) INTO total FROM jsonb_each_text(actual->'counts') c
  WHERE staging_clean_reset_rows.classification()->>c.key NOT LIKE 'retain%';
 IF total>10000 THEN RAISE EXCEPTION 'operational_reset_plan_limit'; END IF;
 -- users.avatarUploadId (NO ACTION) and media_uploads.userId (CASCADE) form an actual
 -- cross-table cycle; certified self-reference cycles are refused by the same pre-effect
 -- contract. No DELETE-only order disposes either shape without a cascade or UPDATE.
 IF EXISTS(SELECT 1 FROM public.users WHERE "avatarUploadId" IS NOT NULL)
   OR staging_clean_reset_rows.has_certified_self_reference_cycle()
 THEN RAISE EXCEPTION 'operational_reset_unsupported_cycle'; END IF;
 CREATE TEMP TABLE operational_reset_sealed(relation text NOT NULL, old_hash text NOT NULL, old jsonb NOT NULL) ON COMMIT DROP;
 FOR t IN SELECT key FROM jsonb_each(staging_clean_reset_rows.classification()) WHERE value#>>'{}' NOT LIKE 'retain%' ORDER BY key LOOP
  EXECUTE format('INSERT INTO pg_temp.operational_reset_sealed SELECT %L,md5(to_jsonb(r)::text),to_jsonb(r) FROM public.%I r',t,t);
 END LOOP;
 CREATE INDEX ON pg_temp.operational_reset_sealed(relation,old_hash);
 SELECT count(*),coalesce(sum(octet_length(old::text)+octet_length(relation)),0),
  encode(sha256(convert_to(coalesce(string_agg(relation||' '||old::text,chr(10) ORDER BY relation COLLATE "C",old::text COLLATE "C"),''),'UTF8')),'hex')
  INTO tuples,plan_size,digest FROM pg_temp.operational_reset_sealed;
 IF tuples<>total OR plan_size>8388608 THEN RAISE EXCEPTION 'operational_reset_plan_limit'; END IF;
 current_op:=binding->>'operationId';
 INSERT INTO staging_clean_reset_rows.admissions(operation_id,binding,sealed_state,plan_digest,tuple_count,backend_pid,full_transaction_id,admitted_at)
 VALUES(current_op,binding,actual,digest,tuples,pg_backend_pid(),pg_current_xact_id()::text,clock_timestamp());
 RETURN jsonb_build_object('operationId',current_op,'tupleCount',tuples,'planDigest',digest);
END $fn$;

-- The unfinished admission held by this backend and full transaction, if any.
CREATE FUNCTION staging_clean_reset_rows.held() RETURNS staging_clean_reset_rows.admissions
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $fn$
DECLARE held staging_clean_reset_rows.admissions;
BEGIN
 SELECT a.* INTO held FROM staging_clean_reset_rows.admissions a WHERE a.backend_pid=pg_backend_pid()
  AND a.full_transaction_id=pg_current_xact_id_if_assigned()::text
  AND NOT EXISTS(SELECT 1 FROM staging_clean_reset_rows.completions c WHERE c.operation_id=a.operation_id);
 IF held.operation_id IS NOT NULL AND clock_timestamp()-held.admitted_at>interval '240 seconds'
 THEN RAISE EXCEPTION 'operational_reset_transaction_expired'; END IF;
 RETURN held;
END $fn$;

-- Row admission: exact sealed full OLD tuple only. False when this transaction holds none.
CREATE FUNCTION staging_clean_reset_rows.allows_old(relation_name text,old_row jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
BEGIN
 IF (staging_clean_reset_rows.held()).operation_id IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.operational_reset_sealed s WHERE s.relation=relation_name
   AND s.old_hash=md5(old_row::text) AND s.old=old_row)
 THEN RAISE EXCEPTION 'operational_reset_old_tuple_changed'; END IF;
 RETURN true;
END $fn$;

-- Statement admission binds the selected relation to the sealed plan; rows still check OLD.
CREATE FUNCTION staging_clean_reset_rows.allows_relation(relation_name text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
BEGIN
 IF (staging_clean_reset_rows.held()).operation_id IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.operational_reset_sealed s WHERE s.relation=relation_name)
 THEN RAISE EXCEPTION 'operational_reset_relation_unsealed'; END IF;
 RETURN true;
END $fn$;

-- Fixed child-first DELETE of exactly the sealed tuples. A tuple changed by any earlier
-- effect no longer matches and remains, so disposal refuses instead of widening.
CREATE FUNCTION staging_clean_reset_rows.dispose() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE t text; self_column text; removed bigint; total bigint:=0; remaining bigint; matching text;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 IF (staging_clean_reset_rows.held()).operation_id IS NULL THEN RAISE EXCEPTION 'operational_reset_unadmitted'; END IF;
 FOREACH t IN ARRAY staging_clean_reset_rows.delete_order() LOOP
  CONTINUE WHEN NOT EXISTS(SELECT 1 FROM pg_temp.operational_reset_sealed WHERE relation=t);
  matching:=format('EXISTS(SELECT 1 FROM pg_temp.operational_reset_sealed s WHERE s.relation=%L AND s.old_hash=md5(to_jsonb(r)::text) AND s.old=to_jsonb(r))',t);
  self_column:=staging_clean_reset_rows.self_references()->>t;
  LOOP
   IF self_column IS NULL THEN EXECUTE format('DELETE FROM public.%I r WHERE %s',t,matching);
   ELSE EXECUTE format('DELETE FROM public.%I r WHERE %s AND NOT EXISTS(SELECT 1 FROM public.%I c WHERE c.%I=r.id)',t,matching,t,self_column);
   END IF;
   GET DIAGNOSTICS removed=ROW_COUNT;
   total:=total+removed;
   EXIT WHEN self_column IS NULL OR removed=0;
  END LOOP;
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO remaining;
  IF remaining<>0 THEN RAISE EXCEPTION 'operational_reset_dispose_incomplete:%',t; END IF;
 END LOOP;
 RETURN jsonb_build_object('deleted',total);
END $fn$;

-- Completion: exact disposable absence, unchanged schema/retained state and binding,
-- then one immutable completion. Commit is refused without it.
CREATE FUNCTION staging_clean_reset_rows.finish(operation text,result jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE held staging_clean_reset_rows.admissions; after_state jsonb; t text; remaining bigint;
BEGIN
 PERFORM staging_clean_reset_rows.require_operator();
 held:=staging_clean_reset_rows.held();
 IF held.operation_id IS NULL OR held.operation_id<>operation THEN RAISE EXCEPTION 'operational_reset_unadmitted'; END IF;
 IF jsonb_typeof(result)<>'object' OR octet_length(result::text)>16384 THEN RAISE EXCEPTION 'operational_reset_result'; END IF;
 FOR t IN SELECT key FROM jsonb_each(staging_clean_reset_rows.classification()) WHERE value#>>'{}' NOT LIKE 'retain%' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO remaining;
  IF remaining<>0 THEN RAISE EXCEPTION 'operational_reset_dispose_incomplete:%',t; END IF;
 END LOOP;
 after_state:=staging_clean_reset_rows.observe();
 IF after_state->'schema' IS DISTINCT FROM held.sealed_state->'schema' OR after_state->'retained' IS DISTINCT FROM held.sealed_state->'retained'
  OR after_state->'sequences' IS DISTINCT FROM held.sealed_state->'sequences'
  OR staging_clean_reset_rows.graph() IS DISTINCT FROM staging_clean_reset_rows.certified_graph()
 THEN RAISE EXCEPTION 'operational_reset_retained_changed'; END IF;
 INSERT INTO staging_clean_reset_rows.completions(operation_id,result,completed_at)
 VALUES(held.operation_id,jsonb_build_object('executor',result,'server',after_state-'counts'-'sequences'),clock_timestamp());
 RETURN jsonb_build_object('operationId',held.operation_id,'tupleCount',held.tuple_count);
END $fn$;

CREATE FUNCTION staging_clean_reset_rows.must_finish() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staging_clean_reset_rows.completions WHERE operation_id=NEW.operation_id)
 THEN RAISE EXCEPTION 'operational_reset_unfinished'; END IF;
 RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER operational_reset_must_finish AFTER INSERT ON staging_clean_reset_rows.admissions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staging_clean_reset_rows.must_finish();

CREATE FUNCTION staging_clean_reset_rows.immutable_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'operational_reset_receipt_immutable'; END $fn$;
CREATE TRIGGER operational_reset_immutable_admission BEFORE UPDATE OR DELETE ON staging_clean_reset_rows.admissions
FOR EACH ROW EXECUTE FUNCTION staging_clean_reset_rows.immutable_receipt();
CREATE TRIGGER operational_reset_admission_no_truncate BEFORE TRUNCATE ON staging_clean_reset_rows.admissions
FOR EACH STATEMENT EXECUTE FUNCTION staging_clean_reset_rows.immutable_receipt();
CREATE TRIGGER operational_reset_immutable_completion BEFORE UPDATE OR DELETE ON staging_clean_reset_rows.completions
FOR EACH ROW EXECUTE FUNCTION staging_clean_reset_rows.immutable_receipt();
CREATE TRIGGER operational_reset_completion_no_truncate BEFORE TRUNCATE ON staging_clean_reset_rows.completions
FOR EACH STATEMENT EXECUTE FUNCTION staging_clean_reset_rows.immutable_receipt();

-- Exact sealed-OLD DELETE admission ahead of the original parent check. All original
-- ordinary branches are unchanged.
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

-- The source anchor guard gains the same branch ahead of its source-receipt and parent
-- checks. Everything after it is the unchanged 20261024050000 definition.
CREATE OR REPLACE FUNCTION public.diagnostic_source_anchor_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE receipt public.diagnostic_source_commands; raw public.diagnostic_identity_records; component public.diagnostic_ownership_components;
 grant_row public.diagnostic_ownership_grants; oid text; plan jsonb; initial boolean;
BEGIN
 IF TG_OP='DELETE' AND current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
  IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
 END IF;
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
 SELECT * INTO receipt FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text;
 IF receipt.id IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.scope) s WHERE s->>'table'='inspection_orders' AND s->'key'->>'id'=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_receipt'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS (SELECT 1 FROM public.inspection_orders WHERE id=oid) THEN RAISE EXCEPTION 'diagnostic_source_anchor_immutable'; END IF;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  IF receipt.command->>'operation' NOT IN ('order_create','intake_create') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(receipt.command->'rows') r
   WHERE r->>'table'='inspection_orders' AND r->'key'->>'id'=oid AND r->>'verb'='insert') THEN RAISE EXCEPTION 'diagnostic_source_no_anchor_backfill'; END IF;
  NEW.state:='pending'; NEW."firstRecordId":=NULL; NEW.source:=public.diagnostic_source_anchor_origin(oid); NEW."createdTransaction":=pg_current_xact_id()::text;
  RETURN NEW;
 END IF;
 IF (OLD.state='unchanged' AND NEW.state NOT IN ('unchanged','changed','erased'))
  OR NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."createdTransaction" IS DISTINCT FROM OLD."createdTransaction"
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

-- The ownership guard gains the same branch ahead of its raw-existence check. Everything
-- else is the unchanged 20261023090000 definition.
CREATE OR REPLACE FUNCTION diagnostic_ownership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE raw diagnostic_identity_records; o inspection_orders; l listings; m dealership_members; expected text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
   IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM diagnostic_identity_records WHERE id=OLD."identityRecordId") THEN RAISE EXCEPTION 'diagnostic_ownership_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."identityRecordId",NEW."orderId",NEW."orderVersion") IS DISTINCT FROM ROW(OLD."identityRecordId",OLD."orderId",OLD."orderVersion")
   OR (NEW."declaredById" IS NOT NULL AND NEW."declaredById" IS DISTINCT FROM OLD."declaredById")
   OR (OLD.state IN ('unavailable','erased') AND NEW IS DISTINCT FROM OLD)
   OR (OLD.state='available' AND NEW.state NOT IN ('available','erased'))
   OR (NEW.state='available' AND (to_jsonb(NEW)-'declaredById') IS DISTINCT FROM (to_jsonb(OLD)-'declaredById'))
  THEN RAISE EXCEPTION 'diagnostic_ownership_immutable'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO raw FROM diagnostic_identity_records WHERE id=NEW."identityRecordId" AND "ownershipCaptureTransaction"=pg_current_xact_id()::text;
 SELECT * INTO o FROM inspection_orders WHERE id=NEW."orderId";
 IF (raw.id IS NOT NULL AND raw."orderId"=NEW."orderId" AND raw."orderVersion"=NEW."orderVersion"
   AND raw."erasedAt" IS NULL AND o.id IS NOT NULL AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL
   AND o."observedVehicle"=raw.observation) IS NOT TRUE OR NEW.state='erased' THEN RAISE EXCEPTION 'diagnostic_ownership_binding'; END IF;
 IF NEW.state='unavailable' THEN RETURN NEW; END IF;
 SELECT * INTO l FROM listings WHERE id=o."listingId";
 IF l."businessId" IS NOT NULL THEN SELECT * INTO m FROM dealership_members WHERE "userId"=o."commissionerId"; END IF;
 -- PostgreSQL sha256(bytea) avoids introducing a new extension. Assemble exactly
 -- the existing JSON.stringify array, preserving spaces inside source values.
 expected:=encode(sha256(convert_to('['||to_json(l.id)::text||','||to_json(l."sellerId")::text||','||COALESCE(to_json(l."businessId")::text,'null')||','||COALESCE(to_json(upper(btrim(l.vin)))::text,'null')||','||to_json(l."brandId")::text||','||to_json(l."modelId")::text||','||COALESCE(to_json(l.year)::text,'null')||']','UTF8')),'hex');
 IF (o.audience='listing_public' AND l.id IS NOT NULL AND l."deletedAt" IS NULL
   AND NEW.scope='diagnostic_ownership_continuity' AND NEW."sourceListingId"=l.id AND NEW."identityDigest"=expected
   AND NEW."sellerId"=l."sellerId" AND NEW."commissionerId"=o."commissionerId"
   AND EXISTS (SELECT 1 FROM users u WHERE u.id=l."sellerId" AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
   AND EXISTS (SELECT 1 FROM users u WHERE u.id=o."commissionerId" AND u."deletionScheduledAt" IS NULL AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL))
   AND NEW."businessId" IS NOT DISTINCT FROM l."businessId"
   AND ((l."businessId" IS NULL AND NEW."membershipId" IS NULL) OR
    (l."businessId" IS NOT NULL AND m.id IS NOT NULL AND m."dealershipId"=l."businessId" AND m.status='active' AND NEW."membershipId"=m.id))
   AND NEW."declaredById"=raw."recordedById" AND NEW."declaredAt"=raw."recordedAt"
   AND NEW."rightsUntil">clock_timestamp() AT TIME ZONE 'UTC' AND diagnostic_ownership_rights_valid(NEW.rights,NEW."rightsUntil")
   AND NOT EXISTS (SELECT 1 FROM diagnostic_identity_records earlier LEFT JOIN diagnostic_ownership_components c ON c."identityRecordId"=earlier.id
    WHERE earlier."orderId"=o.id AND earlier."orderVersion"<raw."orderVersion" AND
     (c.state IS DISTINCT FROM 'available' OR c."rightsUntil" IS NULL OR c."rightsUntil"<=clock_timestamp() AT TIME ZONE 'UTC'))) IS NOT TRUE
 THEN RAISE EXCEPTION 'diagnostic_ownership_source'; END IF;
 RETURN NEW;
END $$;

-- The identity evidence guard gains the same branch ahead of its parent-order check.
-- Everything else is the unchanged 20261021130000 definition.
CREATE OR REPLACE FUNCTION diagnostic_identity_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item JSONB;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
   IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_evidence_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."erasedAt" IS NOT NULL OR NEW."recordedById" IS NULL OR jsonb_typeof(NEW.provenance)<>'array' OR jsonb_array_length(NEW.provenance)=0
   OR jsonb_typeof(NEW.identifiers)<>'array' OR jsonb_array_length(NEW.identifiers)=0 OR (NEW."supersedesId" IS NULL) <> (NEW.explanation IS NULL)
   OR NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o.version=NEW."orderVersion" AND o."erasedAt" IS NULL AND o.synthetic)
   OR NOT EXISTS (SELECT 1 FROM diagnostic_identity_records i WHERE i.id=NEW."identityRecordId" AND i."orderId"=NEW."orderId"
    AND i."erasedAt" IS NULL AND i."observationHash"=NEW."observationHash")
   OR (NEW."supersedesId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_identity_evidence p WHERE p.id=NEW."supersedesId"
    AND p."orderId"=NEW."orderId" AND p."erasedAt" IS NULL AND p."orderVersion"<NEW."orderVersion"))
  THEN RAISE EXCEPTION 'diagnostic_identity_evidence_binding'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.provenance) LOOP
   IF NOT EXISTS (SELECT 1 FROM diagnostic_identity_provenance p WHERE p.id=item->>'id' AND p."orderId"=NEW."orderId" AND p.state='verified'
    AND p."cleanupRequestedAt" IS NULL AND p."erasedAt" IS NULL AND p.sha256=item->>'sha256' AND p.mime=item->>'mime' AND p."sizeBytes"=(item->>'sizeBytes')::int)
   THEN RAISE EXCEPTION 'diagnostic_identity_evidence_binding'; END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."orderVersion",NEW."identityRecordId",NEW."supersedesId",NEW."rightsUntil",NEW."recordedAt")
   IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."orderVersion",OLD."identityRecordId",OLD."supersedesId",OLD."rightsUntil",OLD."recordedAt")
  OR (NEW."recordedById" IS NOT NULL AND NEW."recordedById" IS DISTINCT FROM OLD."recordedById")
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."erasedAt" IS NULL AND ROW(NEW."observationHash",NEW.identifiers,NEW.provenance,NEW.rights,NEW.explanation,NEW."recordHash")
   IS DISTINCT FROM ROW(OLD."observationHash",OLD.identifiers,OLD.provenance,OLD.rights,OLD.explanation,OLD."recordHash"))
 THEN RAISE EXCEPTION 'diagnostic_identity_evidence_immutable'; END IF;
 RETURN NEW;
END $$;

-- The identity provenance guard gains the same branch ahead of its parent-order check.
-- Everything else is the unchanged 20261021130000 definition.
CREATE OR REPLACE FUNCTION diagnostic_identity_provenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
   IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_identity_provenance_immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'staged' OR NEW."objectKey" IS NOT NULL OR NEW."erasedAt" IS NOT NULL OR NEW."cleanupRequestedAt" IS NOT NULL OR NEW."createdById" IS NULL
   OR NOT EXISTS (SELECT 1 FROM inspection_orders o WHERE o.id=NEW."orderId" AND o."erasedAt" IS NULL AND o.synthetic)
  THEN RAISE EXCEPTION 'diagnostic_identity_provenance_binding'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW."orderId",NEW."contentType",NEW."declaredSizeBytes",NEW."rightsUntil",NEW."createdAt")
   IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."contentType",OLD."declaredSizeBytes",OLD."rightsUntil",OLD."createdAt")
  OR (OLD."objectKey" IS NOT NULL AND ROW(NEW."objectKey",NEW.sha256,NEW."sizeBytes",NEW.mime) IS DISTINCT FROM ROW(OLD."objectKey",OLD.sha256,OLD."sizeBytes",OLD.mime))
  OR (OLD."objectKey" IS NULL AND NEW."objectKey" IS NOT NULL AND (OLD.state<>'staged' OR OLD."cleanupRequestedAt" IS NOT NULL))
  OR (NEW."erasedAt" IS NULL AND NEW.rights IS DISTINCT FROM OLD.rights)
  OR (OLD."erasedAt" IS NOT NULL AND NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt")
  OR (NEW."createdById" IS NOT NULL AND NEW."createdById" IS DISTINCT FROM OLD."createdById")
  OR (OLD."cleanupRequestedAt" IS NOT NULL AND NEW."cleanupRequestedAt" IS DISTINCT FROM OLD."cleanupRequestedAt")
  OR (OLD.state IN ('cleanup_pending','removed') AND NEW.state IN ('staged','verified'))
 THEN RAISE EXCEPTION 'diagnostic_identity_provenance_immutable'; END IF;
 RETURN NEW;
END $$;

-- The ownership grant guard gains the same branch ahead of its parent-order check.
-- Everything else is the unchanged 20261023120000 definition.
CREATE OR REPLACE FUNCTION diagnostic_ownership_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user=(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='staging_clean_reset_rows') THEN
   IF staging_clean_reset_rows.allows_old(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inspection_orders WHERE id=OLD."orderId") THEN RAISE EXCEPTION 'diagnostic_ownership_grant_immutable'; END IF;
  RETURN OLD;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
   OR (NEW IS DISTINCT FROM OLD AND (OLD.state='erased' OR NEW.state<>'erased')) THEN RAISE EXCEPTION 'diagnostic_ownership_grant_immutable'; END IF;
  IF NEW.state='erased' AND EXISTS (SELECT 1 FROM diagnostic_ownership_components WHERE "grantId"=OLD.id AND state='available') THEN RAISE EXCEPTION 'diagnostic_ownership_grant_disposal_required'; END IF;
  RETURN NEW;
 END IF;
 IF diagnostic_ownership_grant_current(NEW,clock_timestamp() AT TIME ZONE 'UTC') IS NOT TRUE
  OR EXISTS (SELECT 1 FROM diagnostic_identity_records WHERE "orderId"=NEW."orderId")
  OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=NEW."sessionId" AND s."userId"=NEW."grantorId" AND s."expiresAt">clock_timestamp() AT TIME ZONE 'UTC')
 THEN RAISE EXCEPTION 'diagnostic_ownership_grant_source'; END IF;
 RETURN NEW;
END $$;

-- Certify the final graph only after every owning guard change above, and prove the fixed
-- order: exact disposable set, every non-self FK child before its parent except the refused
-- avatar cycle, and no retained table referencing disposable data.
DO $certify$
DECLARE disposable text[]; ordered text[]:=staging_clean_reset_rows.delete_order(); k record;
BEGIN
 SELECT array_agg(key ORDER BY key) INTO disposable FROM jsonb_each(staging_clean_reset_rows.classification()) WHERE value#>>'{}' NOT LIKE 'retain%';
 IF disposable IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ordered) x) OR cardinality(ordered)<>(SELECT count(DISTINCT x) FROM unnest(ordered) x)
 THEN RAISE EXCEPTION 'operational_reset_order_inventory'; END IF;
 FOR k IN SELECT c.relname AS child,p.relname AS parent,f.conname FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_class p ON p.oid=f.confrelid
   WHERE f.contype='f' AND f.connamespace='public'::regnamespace LOOP
  IF k.parent=ANY(disposable) AND NOT k.child=ANY(disposable) THEN RAISE EXCEPTION 'operational_reset_retained_reference:%',k.conname; END IF;
  CONTINUE WHEN k.child=k.parent OR NOT k.child=ANY(disposable) OR k.conname='users_avatarUploadId_fkey';
  IF array_position(ordered,k.child)>array_position(ordered,k.parent) THEN RAISE EXCEPTION 'operational_reset_order:%',k.conname; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=f.confrelid AND f.connamespace='public'::regnamespace)
   <>(SELECT count(*) FROM jsonb_each(staging_clean_reset_rows.self_references())) THEN RAISE EXCEPTION 'operational_reset_self_reference'; END IF;
 EXECUTE format('CREATE FUNCTION staging_clean_reset_rows.certified_graph() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS %L',
  format('SELECT %L::text',staging_clean_reset_rows.graph()));
END $certify$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staging_clean_reset_rows FROM PUBLIC;
