-- Forward-only dormant correction. Ordinary User creation needs no receipt.
-- Preparation takes ALL User keys before ANY User rows. An ordinary INSERT
-- must participate before its unique-index entries and immediate AFTER-row
-- suspendedById FK. Never wait here: its outer transaction may hold rows already.
CREATE FUNCTION public.diagnostic_user_insert_fence() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE destination_key integer;
BEGIN
 -- Exact namespace/tuple encoding of diagnostic_source_lock_keys for both
 -- Sign-in Method unique slots. Null slots have no unique destination key.
 -- Sort/deduplicate physical hashes, including a possible same-class collision.
 FOR destination_key IN
  SELECT DISTINCT hashtext(jsonb_build_array('unique',jsonb_build_array(field),jsonb_build_object(field,value))::text) AS key
  FROM (VALUES ('phone',NEW.phone),('email',NEW.email)) slots(field,value)
  WHERE value IS NOT NULL ORDER BY key
 LOOP
  IF NOT pg_try_advisory_xact_lock(897100,destination_key) THEN
   RAISE EXCEPTION 'diagnostic_source_user_insert_busy' USING ERRCODE='40001'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
-- Runs before the final effective/target checks; it never changes the tuple.
CREATE TRIGGER zz_diagnostic_source_creation_fence BEFORE INSERT ON public.users
 FOR EACH ROW EXECUTE FUNCTION public.diagnostic_user_insert_fence();
ALTER TABLE public.users DISABLE TRIGGER zz_diagnostic_source_creation_fence;

ALTER FUNCTION public.diagnostic_source_guards_ready() RENAME TO diagnostic_source_guards_ready_before_user_insert;
CREATE FUNCTION public.diagnostic_source_guards_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.diagnostic_source_guards_ready_before_user_insert() AND EXISTS (
  SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.users'::regclass
   AND t.tgname='zz_diagnostic_source_creation_fence'
   AND t.tgfoid='public.diagnostic_user_insert_fence()'::regprocedure
   AND t.tgenabled='O' AND t.tgtype::int=7)
$$;
