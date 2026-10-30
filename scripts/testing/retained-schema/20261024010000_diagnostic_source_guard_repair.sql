-- Forward repair of the held kernel. Strict guards remain DISABLED.
-- No automatic admission, caller integration, legacy backfill or activation.
-- Historical migrations and retained mirrors are immutable. Recovery closes
-- preparation/guards in a later forward migration; never restore old anchors.
-- Campaign prelude and full purge/effect closure are still acceptance blockers.

CREATE FUNCTION public.diagnostic_source_guard_specs() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $specs$
 SELECT '[
 {"table":"users","insert":false,"delete":true,"update":["id","phone","phoneVerifiedAt","email","emailVerifiedAt","role","suspendedAt","deletionScheduledAt"]},
 {"table":"dealerships","insert":false,"delete":true,"update":["id","status","admissionMode","admittedAt"]},
 {"table":"dealership_members","insert":true,"delete":true,"update":["id","userId","dealershipId","role","status"]},
 {"table":"listings","insert":true,"delete":true,"update":["id","sellerId","businessId","vin","brandId","modelId","year","deletedAt","status"]},
 {"table":"inspection_orders","insert":true,"delete":true,"update":["id","centerId","templateVersionId","commissionerId","requestKey","audience","listingId","status","version","epoch","physicalAuthorization","publicationAuthorization","observedVehicle","listingIdentityDigest","associationValidatedAt","identityEvidenceGeneration","synthetic","createdAt","updatedAt","erasedAt"]},
 {"table":"diagnostic_reports","insert":true,"delete":true,"update":["id","orderId","templateVersionId","predecessorId","reinspection","audience","status","version","state","snapshot","snapshotHash","identityRecordId","identityRecordHash","identityEvidenceId","identityEvidenceHash","continuityRequestId","continuityRequestSessionId","continuityProofId","reinspectionOrderVersion","finalizedAt","withdrawnAt","withdrawalReason","createdAt","updatedAt","erasedAt"]},
 {"table":"diagnostic_centers","insert":true,"delete":true,"update":["id","code","planCode","names","operationalApproval","createdAt"]},
 {"table":"diagnostic_template_versions","insert":true,"delete":true,"update":["id","centerId","version","definition","synthetic","publishedById","publishedAt"]},
 {"table":"diagnostic_center_assignments","insert":true,"delete":true,"update":["id","centerId","userId","capability","qualifiedUntil","assignedAt","revokedAt"]},
 {"table":"diagnostic_order_assignments","insert":true,"delete":true,"update":["id","orderId","userId","capability","assignedAt","revokedAt"]},
 {"table":"staff_grants","insert":true,"delete":true,"update":["userId","capability","grantedAt","revokedAt"]},
 {"table":"sessions","insert":false,"delete":true,"update":["id","userId","expiresAt","adminTotpExpiresAt"]},
 {"table":"totp_enrollments","insert":false,"delete":true,"update":["id","userId","encryptedSecret","verifiedAt","createdAt","updatedAt"]},
 {"table":"totp_backup_codes","insert":false,"delete":true,"update":["id","totpEnrollmentId","codeHash","usedAt"]},
 {"table":"diagnostic_continuity_proofs","insert":true,"delete":true,"update":["requestId","id","predecessorReportId","candidateOrderId","predecessorOrderId","issuerId","issuerSessionId","linkingTechnicianId","content","bindings","rightsUntil","issuedAt","invalidatedAt","consumedReportId","consumedAt","erasedAt"]},
 {"table":"diagnostic_continuity_requests","insert":true,"delete":true,"update":["id","createdAt","actorId","sessionId","orderId","kind"]},
 {"table":"diagnostic_identity_records","insert":true,"delete":true,"update":["id","orderId","orderVersion","observation","observationHash","recordedById","recordedAt","erasedAt"]},
 {"table":"diagnostic_identity_evidence","insert":true,"delete":true,"update":["id","orderId","orderVersion","identityRecordId","observationHash","identifiers","provenance","rights","rightsUntil","supersedesId","explanation","recordHash","recordedById","recordedAt","erasedAt"]},
 {"table":"diagnostic_identity_provenance","insert":true,"delete":true,"update":["id","orderId","contentType","declaredSizeBytes","rights","rightsUntil","objectKey","sha256","sizeBytes","mime","state","epoch","createdById","createdAt","verifiedAt","cleanupRequestedAt","cleanupCompletedAt","erasedAt"]},
 {"table":"diagnostic_ownership_grants","insert":true,"delete":true,"update":["id","orderId","state","listingId","identityDigest","sellerId","commissionerId","businessId","membershipId","grantorId","grantorMembershipId","sessionId","rights","rightsUntil","declaredAt","erasedAt"]},
 {"table":"diagnostic_ownership_components","insert":true,"delete":true,"update":["grantId","identityRecordId","orderId","orderVersion","state","scope","sourceListingId","identityDigest","sellerId","commissionerId","businessId","membershipId","rights","rightsUntil","declaredById","declaredAt","erasedAt"]},
 {"table":"diagnostic_audits","insert":true,"delete":true,"update":["id","centerId","orderId","actorId","action","details","createdAt"]}
]'::jsonb
$specs$;

CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
 SELECT NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) m
  CROSS JOIN (VALUES ('zz_diagnostic_source_presence',2),
                     ('zz_diagnostic_source_effective',3),
                     ('zz_diagnostic_source_target',3)) names(name,timing)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
    AND t.tgname=names.name AND t.tgenabled='O'
    AND (t.tgtype::int & 3)=names.timing)
 ) AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.diagnostic_source_registry()) m
  WHERE m->>'table'<>'diagnostic_source_anchors' AND NOT EXISTS (
   SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(m->>'table'))
    AND t.tgname='diagnostic_source_no_truncate' AND t.tgenabled='O')
 ) AND NOT EXISTS (
  -- Refuse preparation if later DDL has installed a BEFORE ROW mutator after
  -- the final effective check. Privileged DDL remains outside runtime authority.
  SELECT 1 FROM pg_trigger t
  JOIN jsonb_array_elements(public.diagnostic_source_guard_specs()) m
   ON t.tgrelid=to_regclass('public.'||(m->>'table'))
  WHERE (t.tgtype::int & 3)=3 AND NOT t.tgisinternal AND t.tgenabled='O'
   AND t.tgname COLLATE "C">'zz_diagnostic_source_effective' COLLATE "C"
   AND t.tgname<>'zz_diagnostic_source_target'
 )
$$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_row_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_row jsonb; after_row jsonb; spec jsonb;
BEGIN
 SELECT value INTO spec FROM jsonb_array_elements(public.diagnostic_source_guard_specs())
  WHERE value->>'table'=TG_TABLE_NAME;
 IF spec IS NULL THEN RAISE EXCEPTION 'diagnostic_source_guard_table'; END IF;
 before_row:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 IF TG_OP='INSERT' AND (spec->>'insert')::boolean IS NOT TRUE THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_NARGS=0
  AND public.diagnostic_source_project(before_row,spec->'update')
   IS NOT DISTINCT FROM public.diagnostic_source_project(after_row,spec->'update') THEN
  RETURN NEW;
 END IF;
 -- UPDATE OF is a target-list check even for equal tuples. This prevents a
 -- no-op write on an uncovered row from reaching existing AFTER invalidators.
 -- The other trigger checks changes introduced by earlier BEFORE mutators,
 -- including primary-key changes on otherwise scalar statements.
 PERFORM public.diagnostic_assert_source_write(TG_TABLE_NAME,TG_OP,before_row,after_row);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DO $install$
DECLARE m jsonb; t text; columns text; events text;
BEGIN
 FOR m IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_registry()) LOOP
  t:=m->>'table';
  IF t='diagnostic_source_anchors' THEN CONTINUE; END IF;
  EXECUTE format('DROP TRIGGER diagnostic_source_presence ON public.%I',t);
  EXECUTE format('DROP TRIGGER diagnostic_source_effective ON public.%I',t);
  -- TRUNCATE remains refused for every managed source/dependency table after
  -- activation. Dependency-only DML keeps its existing owner's protocol.
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER diagnostic_source_no_truncate',t);
 END LOOP;
 FOR m IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_guard_specs()) LOOP
  t:=m->>'table';
  SELECT string_agg(format('%I',value),',' ORDER BY i) INTO columns
   FROM jsonb_array_elements_text(m->'update') WITH ORDINALITY x(value,i);
  events:=CASE WHEN (m->>'insert')::boolean THEN 'INSERT OR ' ELSE '' END
   ||'DELETE OR UPDATE OF '||columns;
  EXECUTE format('CREATE TRIGGER zz_diagnostic_source_presence BEFORE %s ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.diagnostic_source_statement_guard()',events,t);
  EXECUTE format('CREATE TRIGGER zz_diagnostic_source_effective BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_row_guard()',t);
  EXECUTE format('CREATE TRIGGER zz_diagnostic_source_target BEFORE UPDATE OF %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.diagnostic_source_row_guard(''target'')',columns,t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zz_diagnostic_source_presence',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zz_diagnostic_source_effective',t);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER zz_diagnostic_source_target',t);
 END LOOP;
END $install$;

-- Keep the existing AFTER UPDATE/DELETE trigger on provenance. Compare the
-- effective rows after BEFORE mutators, excluding only lease bookkeeping.
-- Real material/rights/cleanup/erasure changes keep all existing proof effects.
CREATE OR REPLACE FUNCTION public.diagnostic_continuity_source_changed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r JSONB; prior JSONB; oid TEXT; uid TEXT; sid TEXT;
BEGIN
 IF TG_OP='DELETE' THEN r=to_jsonb(OLD); ELSE r=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='diagnostic_identity_provenance' THEN
   IF (to_jsonb(OLD)-ARRAY['writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode'])
     IS NOT DISTINCT FROM (r-ARRAY['writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode']) THEN RETURN NULL; END IF;
  ELSIF to_jsonb(OLD) IS NOT DISTINCT FROM r THEN RETURN NULL;
  END IF;
 END IF;
 IF TG_TABLE_NAME='inspection_orders' THEN oid=r->>'id';
 ELSIF TG_TABLE_NAME IN ('diagnostic_reports','diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance','diagnostic_order_assignments') THEN oid=r->>'orderId';
 ELSIF TG_TABLE_NAME='users' THEN uid=r->>'id';
 ELSIF TG_TABLE_NAME IN ('staff_grants','diagnostic_center_assignments') THEN uid=r->>'userId';
 ELSIF TG_TABLE_NAME='sessions' THEN sid=r->>'id'; END IF;
 UPDATE public.diagnostic_continuity_proofs p SET "invalidatedAt"=CURRENT_TIMESTAMP
 WHERE p."invalidatedAt" IS NULL AND p."consumedReportId" IS NULL AND
  (p."candidateOrderId"=oid OR p."predecessorOrderId"=oid OR p."issuerId"=uid OR p."linkingTechnicianId"=uid OR p."issuerSessionId"=sid);
 -- No proof has a retention exception from its bound material's erasure fence.
 IF TG_TABLE_NAME IN ('diagnostic_identity_records','diagnostic_identity_evidence','diagnostic_identity_provenance')
  AND ((r->>'erasedAt') IS NOT NULL OR (r->>'cleanupRequestedAt') IS NOT NULL) THEN
  DELETE FROM public.diagnostic_continuity_proofs p WHERE p."candidateOrderId"=oid OR p."predecessorOrderId"=oid;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_source_insert_receipt() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE before_scope jsonb; after_scope jsonb; c jsonb; keys jsonb; campaigns jsonb; n jsonb; t text; ns text; k jsonb;
BEGIN
 IF public.diagnostic_source_guards_ready() IS NOT TRUE THEN RAISE EXCEPTION 'diagnostic_source_dormant'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'diagnostic_source_isolation'; END IF;
 IF EXISTS (SELECT 1 FROM public.diagnostic_source_commands WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'diagnostic_source_nested'; END IF;
 IF EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.granted AND
  ((l.locktype='relation' AND l.mode IN ('RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
    AND l.relation IN (SELECT to_regclass('public.'||(m->>'table')) FROM jsonb_array_elements(public.diagnostic_source_registry()) m))
   OR (l.locktype='advisory' AND l.objsubid=2 AND l.classid BETWEEN 897100 AND 898399)
   OR (l.locktype='advisory' AND l.objsubid=1 AND EXISTS (
    SELECT 1 FROM pg_namespace n WHERE n.nspname ~ '^cf_[a-f0-9]{32}$'
     AND l.classid::bigint=((hashtextextended(n.nspname,0)>>32)&4294967295)
     AND l.objid::bigint=(hashtextextended(n.nspname,0)&4294967295))))) THEN RAISE EXCEPTION 'diagnostic_source_preheld_lock'; END IF;
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


CREATE OR REPLACE FUNCTION public.diagnostic_source_scope(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE s jsonb:='{}'; prior jsonb; root jsonb; m jsonb; r jsonb; ref jsonb; k jsonb; n jsonb; t text; q text;
 disposal jsonb; subjects jsonb:='[]'; selectors jsonb:='{}'; inventory jsonb:='[]'; current_rows jsonb; step integer:=0;
BEGIN
 FOR root IN SELECT value FROM jsonb_array_elements(c->'roots') UNION ALL SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  s:=public.diagnostic_source_add(s,root->>'table',root->'key');
  selectors:=public.diagnostic_source_add(selectors,root->>'table',root->'key');
  IF root->>'table'='dealership_members' THEN
   r:=public.diagnostic_source_read('dealership_members',root->'key');
   -- The membership selector includes OLD and proposed NEW business OWNER
   -- sets, not only their FK endpoint rows. Rediscovery must see a concurrently
   -- inserted membership after the absent-user/OWNER-key wait.
   selectors:=public.diagnostic_source_add(selectors,'dealerships',jsonb_build_object('id',r->'dealershipId'));
   selectors:=public.diagnostic_source_add(selectors,'dealerships',jsonb_build_object('id',root->'next'->'dealershipId'));
   IF r->>'userId' IS NOT NULL THEN subjects:=subjects||jsonb_build_array(r->>'userId'); END IF;
   IF root->'next'->>'userId' IS NOT NULL THEN subjects:=subjects||jsonb_build_array(root->'next'->>'userId'); END IF;
  END IF;
  IF root->>'table'='inspection_orders' THEN s:=public.diagnostic_source_add(s,'diagnostic_source_anchors',jsonb_build_object('orderId',root->'key'->'id')); END IF;
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
   IF t='diagnostic_source_anchors' THEN
    q:=q||' OR to_jsonb(x)->''source''->>''commissionerId'' IN (SELECT jsonb_array_elements_text($2)) OR to_jsonb(x)->''source''->''listing''->>''sellerId'' IN (SELECT jsonb_array_elements_text($2))
     OR to_jsonb(x)->''source''->>''memberUserId'' IN (SELECT jsonb_array_elements_text($2))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->''listings'',''[]'')) z WHERE z->>''id''=to_jsonb(x)->''source''->>''listingId'')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->''dealership_members'',''[]'')) z WHERE z->>''id''=to_jsonb(x)->''source''->>''memberId'')';
   END IF;
   FOR ref IN SELECT value FROM jsonb_array_elements(m->'refs') WHERE jsonb_array_length(value->'columns')=1 LOOP
    IF ref->>'table'='users' AND (c->>'operation'='account_purge' OR (m->>'rank')::int<=9) THEN
     q:=q||format(' OR to_jsonb(x)->>%L IN (SELECT jsonb_array_elements_text($2))',ref->'columns'->>0);
    ELSIF ref->>'table' IN ('listings','dealerships','dealership_members') AND (m->>'rank')::int BETWEEN 3 AND 9 THEN
     q:=q||format(' OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($3->%L,''[]'')) z WHERE z->>%L=to_jsonb(x)->>%L)',ref->>'table',ref->'target'->>0,ref->'columns'->>0);
    ELSIF ref->>'table' IN ('inspection_orders','diagnostic_reports','diagnostic_identity_records','diagnostic_continuity_proofs')
     OR (c->>'operation'='account_purge' AND ref->>'table' IN ('support_cases','vehicle_history_requests','service_conversations','history_orders','history_artifacts','media_uploads','video_upload_sessions','video_generations','measurement_principals','measurement_visits','sessions','totp_enrollments')) THEN
     q:=q||format(' OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->%L,''[]'')) z WHERE z->>%L=to_jsonb(x)->>%L)',ref->>'table',ref->'target'->>0,ref->'columns'->>0);
    END IF;
   END LOOP;
   EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)),''[]'') FROM public.%I x WHERE %s OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE($1->%L,''[]'')) z WHERE to_jsonb(x) @> z)',t,q,t)
    INTO current_rows USING s,subjects,selectors;
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
    IF t='diagnostic_source_anchors' THEN
     s:=public.diagnostic_source_add(s,'listings',jsonb_build_object('id',r->'source'->>'listingId'));
     s:=public.diagnostic_source_add(s,'users',jsonb_build_object('id',r->'source'->>'commissionerId'));
     s:=public.diagnostic_source_add(s,'users',jsonb_build_object('id',r->'source'->'listing'->>'sellerId'));
     s:=public.diagnostic_source_add(s,'dealership_members',jsonb_build_object('id',r->'source'->>'memberId'));
     s:=public.diagnostic_source_add(s,'dealerships',jsonb_build_object('id',r->'source'->>'memberBusinessId'));
    END IF;
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
