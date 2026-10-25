\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE identity175_probe (id text PRIMARY KEY, value text);
CREATE TEMP TABLE identity175_trigger_log (seq bigint GENERATED ALWAYS AS IDENTITY, operation text);
CREATE FUNCTION pg_temp.identity175_probe_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO identity175_trigger_log(operation) VALUES(TG_OP);
 RETURN NEW;
END $$;
CREATE TRIGGER identity175_before BEFORE INSERT OR UPDATE ON identity175_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.identity175_probe_trigger();
INSERT INTO identity175_probe VALUES('existing','revoked');
TRUNCATE identity175_trigger_log RESTART IDENTITY;
INSERT INTO identity175_probe VALUES('existing','regranted') ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value;
SELECT array_agg(operation ORDER BY seq) AS native_upsert_before_trigger_order FROM identity175_trigger_log;
TRUNCATE identity175_trigger_log RESTART IDENTITY;
UPDATE identity175_probe SET value='explicit update' WHERE id='existing';
SELECT array_agg(operation ORDER BY seq) AS explicit_update_before_trigger_order FROM identity175_trigger_log;
SELECT jsonb_agg(value ORDER BY value) AS missing_caller_old_fields
FROM jsonb_array_elements_text(public.diagnostic_source_meta('users')->'fields')
WHERE value<>ALL(ARRAY['id','phone','phoneVerifiedAt','email','emailVerifiedAt','role','suspendedAt','suspendedById','suspensionReason','deletionScheduledAt']);
ROLLBACK;
