-- Matched BOTH-visit automatic public continuity. This is additive: historical
-- proof predicates and all private/comparative fences remain unchanged. Automatic
-- admission is fail-closed unless both visits have an unchanged source anchor,
-- every retained raw row has its persisted ownership component/grant, the exact
-- first slots agree, and the current publisher binding remains valid.

CREATE FUNCTION diagnostic_public_automatic_ownership_bound(proof diagnostic_continuity_proofs, ao inspection_orders, b inspection_orders) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 WITH visits(order_id,commissioner_id,selected_id,selected_hash,is_candidate,binding_index) AS (
   SELECT ao.id,ao."commissionerId",proof.content->'predecessor'->>'identityRecordId',proof.content->'predecessor'->>'identityRecordHash',false,0
   UNION ALL
   SELECT b.id,b."commissionerId",proof.content->'candidate'->>'identityRecordId',proof.content->'candidate'->>'identityRecordHash',true,1
 ), anchors AS (
   SELECT v.*,a.state,a."firstRecordId",a.source
   FROM visits v JOIN diagnostic_source_anchors a ON a."orderId"=v.order_id
 ), record_rows AS (
   SELECT a.order_id,a.commissioner_id,a.selected_id,a.selected_hash,a.is_candidate,a.binding_index,a.state,a."firstRecordId",a.source,
     r.id raw_id,r.observation,r."orderVersion",r."observationHash",r."erasedAt" raw_erased,
     c.state component_state,c."orderId" component_order,c."orderVersion" component_version,c.scope component_scope,c."erasedAt" component_erased,c."grantId",c."sourceListingId",c."identityDigest",c."sellerId",c."commissionerId" component_commissioner,
     c."businessId" component_business,c."membershipId" component_membership,c.rights component_rights,c."rightsUntil" component_rights_until,
     g.state grant_state,g."orderId" grant_order,g."listingId" grant_listing,g."identityDigest" grant_digest,g."sellerId" grant_seller,
     g."commissionerId" grant_commissioner,g."businessId" grant_business,g."membershipId" grant_membership,g.rights grant_rights,
     g."rightsUntil" grant_rights_until,g."erasedAt" grant_erased
   FROM anchors a JOIN diagnostic_identity_records r ON r."orderId"=a.order_id
     LEFT JOIN diagnostic_ownership_components c ON c."identityRecordId"=r.id
     LEFT JOIN diagnostic_ownership_grants g ON g.id=c."grantId"
 ), valid_visits AS (
   SELECT a.*
   FROM anchors a
   WHERE a.state='unchanged' AND a."firstRecordId" IS NOT NULL AND a.source IS NOT NULL
     AND a.source->>'audience'='listing_public' AND a.source->>'listingId' IS NOT NULL AND a.source->>'commissionerId'=a.commissioner_id
     AND jsonb_typeof(proof.bindings->'ownership')='array' AND jsonb_array_length(proof.bindings->'ownership')=2
     AND proof.bindings->'ownership'->a.binding_index->>'state'=a.state
     AND proof.bindings->'ownership'->a.binding_index->>'originalRecordId'=a."firstRecordId"
     AND proof.bindings->'ownership'->a.binding_index->>'selectedRecordId'=a.selected_id
     AND proof.bindings->'ownership'->a.binding_index->>'currentRecordId'=(
       SELECT r.id FROM diagnostic_identity_records r WHERE r."orderId"=a.order_id ORDER BY r."orderVersion" DESC,r.id DESC LIMIT 1)
     AND NOT EXISTS (
       SELECT 1 FROM record_rows x
       WHERE x.order_id=a.order_id AND (
         x.raw_erased IS NOT NULL OR x.component_erased IS NOT NULL OR x.component_order IS DISTINCT FROM x.order_id OR
         x.component_version IS DISTINCT FROM x."orderVersion" OR x.component_scope IS DISTINCT FROM 'diagnostic_ownership_continuity' OR x.component_state IS DISTINCT FROM 'available' OR x."grantId" IS NULL OR
         x.grant_state IS DISTINCT FROM 'available' OR x.grant_erased IS NOT NULL OR x.grant_order IS DISTINCT FROM x.order_id OR
         x.grant_listing IS NULL OR x.grant_digest IS NULL OR x.grant_seller IS NULL OR x.grant_commissioner IS DISTINCT FROM a.commissioner_id OR
         x.component_commissioner IS DISTINCT FROM x.grant_commissioner OR x."sourceListingId" IS DISTINCT FROM x.grant_listing OR
         x."identityDigest" IS DISTINCT FROM x.grant_digest OR x."sellerId" IS DISTINCT FROM x.grant_seller OR
         x.component_business IS DISTINCT FROM x.grant_business OR x.component_membership IS DISTINCT FROM x.grant_membership OR
         x.component_rights_until IS NULL OR x.grant_rights_until IS NULL OR x.component_rights_until<=(clock_timestamp() AT TIME ZONE 'UTC') OR
         proof."rightsUntil">x.component_rights_until OR proof."rightsUntil">x.grant_rights_until OR
         x.grant_rights_until<=(clock_timestamp() AT TIME ZONE 'UTC') OR x.component_rights_until>x.grant_rights_until OR
         diagnostic_ownership_rights_valid(x.grant_rights,x.grant_rights_until) IS NOT TRUE OR
         diagnostic_ownership_rights_valid(x.component_rights,x.component_rights_until) IS NOT TRUE OR
         (x.component_rights-'schedule') IS DISTINCT FROM (x.grant_rights-'schedule') OR
         x."observationHash" IS DISTINCT FROM encode(sha256(convert_to('["diagnostic-identity-record/v1",'||to_json(x.order_id)::text||','||x."orderVersion"::text||','||
           (x.observation->'observedAt')::text||','||(x.observation->'mileageKm')::text||','||(x.observation->'method')::text||','||
           (x.observation->'vin')::text||','||(x.observation->'manualReference')::text||']','UTF8')),'hex') OR
         x.source->>'listingId' IS DISTINCT FROM x.grant_listing OR
         x.grant_digest IS DISTINCT FROM encode(sha256(convert_to('['||(x.source->'listing'->'id')::text||','||(x.source->'listing'->'sellerId')::text||','||
           (x.source->'listing'->'businessId')::text||','||COALESCE(to_json(upper(btrim(x.source->'listing'->>'vin')))::text,'null')||','||
           (x.source->'listing'->'brandId')::text||','||(x.source->'listing'->'modelId')::text||','||(x.source->'listing'->'year')::text||']','UTF8')),'hex') OR x.source->'listing'->>'id' IS DISTINCT FROM x.grant_listing OR
         x.source->'listing'->>'sellerId' IS DISTINCT FROM x.grant_seller OR
         x.source->'listing'->>'businessId' IS DISTINCT FROM x.grant_business OR
         x.source->>'commissionerId' IS DISTINCT FROM x.grant_commissioner OR
         x.source->>'memberId' IS DISTINCT FROM x.grant_membership
       )
     )
     AND EXISTS (SELECT 1 FROM record_rows x WHERE x.order_id=a.order_id AND x.raw_id=a."firstRecordId"
       AND NOT EXISTS (SELECT 1 FROM record_rows earlier WHERE earlier.order_id=a.order_id AND earlier."orderVersion"<x."orderVersion"))
     AND proof.bindings->'ownership'->a.binding_index->'records'=(
       SELECT jsonb_agg(jsonb_build_object('id',x.raw_id,'orderVersion',x."orderVersion",'observationHash',x."observationHash",
         'ownership',jsonb_build_object('state','available','listingId',x.grant_listing,'listingIdentityDigest',x.grant_digest,
           'sellerId',x.grant_seller,'commissionerId',x.grant_commissioner,'businessId',x.grant_business,'membershipId',x.grant_membership),
         'grantId',x."grantId",'rights',x.component_rights,'rightsUntil',to_char(x.component_rights_until,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY x."orderVersion")
       FROM record_rows x WHERE x.order_id=a.order_id)
     AND NOT EXISTS (SELECT 1 FROM record_rows x JOIN record_rows first ON first.order_id=x.order_id AND first.raw_id=a."firstRecordId"
       WHERE x.order_id=a.order_id AND ROW(x.grant_listing,x.grant_digest,x.grant_seller,x.grant_commissioner,x.grant_business,x.grant_membership)
         IS DISTINCT FROM ROW(first.grant_listing,first.grant_digest,first.grant_seller,first.grant_commissioner,first.grant_business,first.grant_membership))
     AND EXISTS (SELECT 1 FROM record_rows x WHERE x.order_id=a.order_id AND x.raw_id=a.selected_id AND x."observationHash"=a.selected_hash)
     AND (NOT a.is_candidate OR NOT EXISTS (SELECT 1 FROM record_rows newer WHERE newer.order_id=a.order_id AND newer."orderVersion">
       (SELECT selected."orderVersion" FROM record_rows selected WHERE selected.order_id=a.order_id AND selected.raw_id=a.selected_id)))
 ), first_rows AS (
   SELECT v.order_id,v.commissioner_id,v."firstRecordId",r.grant_listing,r.grant_digest,r.grant_seller,r.grant_commissioner,r.grant_business,r.grant_membership
   FROM valid_visits v JOIN record_rows r ON r.order_id=v.order_id AND r.raw_id=v."firstRecordId"
 )
 SELECT EXISTS (
   SELECT 1 FROM valid_visits va JOIN valid_visits vb ON va.is_candidate=false AND vb.is_candidate=true AND va.order_id<>vb.order_id
    JOIN first_rows fa ON fa.order_id=va.order_id JOIN first_rows fb ON fb.order_id=vb.order_id
   WHERE fa.grant_listing=fb.grant_listing AND fa.grant_digest=fb.grant_digest AND fa.grant_seller=fb.grant_seller
     AND fa.grant_commissioner=fb.grant_commissioner AND fa.grant_business IS NOT DISTINCT FROM fb.grant_business
     AND fa.grant_membership IS NOT DISTINCT FROM fb.grant_membership
 )
$$;

CREATE OR REPLACE FUNCTION diagnostic_continuity_proof_bound(proof diagnostic_continuity_proofs) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (SELECT 1 FROM diagnostic_reports a JOIN inspection_orders ao ON ao.id=a."orderId"
   JOIN inspection_orders b ON b.id=proof."candidateOrderId"
   WHERE a.id=proof."predecessorReportId" AND ao.id=proof."predecessorOrderId" AND ao.id<>b.id
    AND a."erasedAt" IS NULL AND ao."erasedAt" IS NULL AND b."erasedAt" IS NULL AND ao.synthetic AND b.synthetic
    AND a.status IN ('finalized','withdrawn') AND b.status='arrived'
    AND ao."physicalAuthorization" IS NOT NULL AND b."physicalAuthorization" IS NOT NULL
    AND a.audience=ao.audience AND ao."commissionerId" IS NOT NULL AND b."commissionerId" IS NOT NULL
    AND ((a.audience='buyer_private' AND b.audience='buyer_private' AND ao."commissionerId"=b."commissionerId")
      OR (a.audience='listing_public' AND b.audience='listing_public' AND
        ((proof.content->>'method'='comparative_attestation' AND diagnostic_public_continuity_bound(proof,ao,b))
         OR (proof.content->>'method'='automatic_normalized_vin' AND public.diagnostic_source_guards_ready() AND diagnostic_public_continuity_bound(proof,ao,b)
           AND diagnostic_public_automatic_ownership_bound(proof,ao,b)))))
    AND a.version=(proof.content->'predecessor'->>'reportVersion')::int
    AND a."snapshotHash"=proof.content->'predecessor'->>'snapshotHash'
    AND a."identityRecordId"=proof.content->'predecessor'->>'identityRecordId'
    AND a."identityRecordHash"=proof.content->'predecessor'->>'identityRecordHash'
    AND b.version=(proof.content->'candidate'->>'orderVersion')::int
    AND NOT EXISTS (SELECT 1 FROM diagnostic_reports s WHERE s."predecessorId"=a.id OR s."orderId"=b.id))
$$;
