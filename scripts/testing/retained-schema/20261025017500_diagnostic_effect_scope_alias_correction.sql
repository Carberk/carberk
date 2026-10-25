-- Forward-only correction for local e versus derived-column ambiguity.
CREATE OR REPLACE FUNCTION public.diagnostic_source_effects_before_intake(c jsonb,scope jsonb) RETURNS jsonb
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
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(effects) item(effect) WHERE item.effect->>'table'='diagnostic_continuity_requests' AND item.effect->'key'->>'id'=q.row->>'id') THEN
   effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_continuity_requests',q.row,'{}',true)); END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(effects) item(effect) WHERE NOT EXISTS
  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=item.effect->'table' AND n->'key'=item.effect->'key')) THEN RAISE EXCEPTION 'diagnostic_source_effect_outside_scope'; END IF;
 RETURN effects;
END $$;

-- This is the effective name before publication200 renames the wrapper.
CREATE OR REPLACE FUNCTION public.diagnostic_source_effects(c jsonb,scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE effects jsonb; e jsonb;
BEGIN
 effects:=public.diagnostic_source_effects_before_finite_fk(c,scope);
 FOR e IN SELECT value FROM jsonb_array_elements(public.diagnostic_source_fk_effects(c)||public.diagnostic_source_member_effects(c)||public.diagnostic_source_account_effects(c)) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(effects) p WHERE p->'table'=e->'table' AND p->'key'=e->'key') THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(effects) p WHERE p=e) THEN RAISE EXCEPTION 'diagnostic_source_overlapping_derived_effect'; END IF;
  ELSE effects:=effects||jsonb_build_array(e); END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(effects) item(effect) WHERE NOT EXISTS
  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=item.effect->'table' AND n->'key'=item.effect->'key')) THEN RAISE EXCEPTION 'diagnostic_source_effect_outside_scope'; END IF;
 -- Recompute after the complete finite effect union. A derived report request
 -- clearing is still an actual UPDATE and must retain the existing invalidator.
 SELECT coalesce(jsonb_agg(CASE WHEN p->>'derived'='invalidation' THEN
  p||jsonb_build_object('required',EXISTS(SELECT 1 FROM jsonb_array_elements(effects) changed
   WHERE public.diagnostic_source_invalidates(changed,p->'next') IS TRUE)) ELSE p END),'[]') INTO effects
 FROM jsonb_array_elements(effects) p;
 RETURN effects;
END $$;

CREATE OR REPLACE FUNCTION public.diagnostic_intake_effects(c jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE admission jsonb; contract jsonb; effects jsonb; base jsonb; e jsonb; q jsonb; selected text[]; qualified text[];
 cid text; oid text; at_time timestamp(3):=transaction_timestamp() AT TIME ZONE 'UTC'; peer record;
BEGIN
 admission:=public.diagnostic_intake_campaign_command(c);
 IF admission IS NULL THEN RETURN public.diagnostic_intake_effects_before_composition(c); END IF;
 contract:=public.diagnostic_campaign_intake(admission);
 effects:=contract->'effects';
 IF c->>'operation'='template_publish' THEN
  RETURN effects||public.diagnostic_intake_effects_before_composition(c-'intent');
 END IF;
 -- Keep the exact 20261024100000 selected-subset rule. During first admission,
 -- only the one persisted-roster reception qualification is additionally possible.
 cid:=c->'rows'->0->'next'->>'centerId'; oid:=c->'rows'->0->'next'->>'id';
 SELECT array_agg(id ORDER BY id) INTO selected FROM jsonb_array_elements_text(c->'intent'->'receptionQualificationIds') id;
 SELECT coalesce(array_agg(a.id ORDER BY a.id),'{}') INTO qualified
  FROM public.diagnostic_center_assignments a JOIN public.users u ON u.id=a."userId"
  JOIN public.staff_grants g ON g."userId"=u.id AND g.capability=a.capability AND g."revokedAt" IS NULL
  WHERE a."centerId"=cid AND a.capability='diagnostics.reception' AND a."revokedAt" IS NULL
   AND a."qualifiedUntil">clock_timestamp()::timestamp AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL;
 FOR e IN SELECT value FROM jsonb_array_elements(effects) WHERE value->>'table'='diagnostic_center_assignments'
  AND value->'next'->>'capability'='diagnostics.reception' LOOP
  q:=e->'next';
  IF EXISTS(SELECT 1 FROM public.users u JOIN public.staff_grants g ON g."userId"=u.id AND g.capability='diagnostics.reception' AND g."revokedAt" IS NULL
   WHERE u.id=q->>'userId' AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL) THEN qualified:=array_append(qualified,q->>'id'); END IF;
 END LOOP;
 IF coalesce(cardinality(selected),0)=0 OR NOT selected<@qualified THEN RAISE EXCEPTION 'diagnostic_intake_reception_selection'; END IF;
 -- Original audit convention and transaction timestamp; rebuild only selected
 -- assignments, including the absent server-derived first qualification.
 base:=public.diagnostic_intake_effects_before_peer_selection(c-'intent');
 FOR e IN SELECT value FROM jsonb_array_elements(base) WHERE value->>'table'<>'diagnostic_order_assignments' LOOP
  effects:=effects||jsonb_build_array(e);
 END LOOP;
 FOR peer IN
  SELECT a.id,a."userId" AS uid,a.capability FROM public.diagnostic_center_assignments a WHERE a.id=ANY(selected)
  UNION ALL SELECT value->'next'->>'id',value->'next'->>'userId',value->'next'->>'capability'
   FROM jsonb_array_elements(contract->'effects') WHERE value->>'table'='diagnostic_center_assignments'
    AND value->'next'->>'id'=ANY(selected) LOOP
  q:=jsonb_build_object('id',public.diagnostic_intake_uuid('diagnostic-source:intake-assignment:'||oid||':'||peer.id),
   'orderId',oid,'userId',peer.uid,'capability',peer.capability,'assignedAt',at_time,'revokedAt',NULL);
  effects:=effects||jsonb_build_array(public.diagnostic_purge_effect('diagnostic_order_assignments',q,'{}',false)||jsonb_build_object('verb','insert','expected','absent'));
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(item.effect ORDER BY item.effect::text),'[]') FROM jsonb_array_elements(effects) item(effect));
END $$;
