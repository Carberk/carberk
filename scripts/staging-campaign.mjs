/** Fixed reservation-owned auth prerequisite graph. Serialized with the remote program.
 * No caller SQL, token minting, fixed OTP codes, media or scenario state imports.
 */
export function campaignMain(input, { sql, uuid, exists }) {
  const profile = 'campaign897-identities-v1';
  if (input.profile !== profile || !/^[a-f0-9]{40}$/.test(input.candidate ?? '')) throw new Error();
  const n = input.namespace;
  const aliases = ['buyer-a', 'owner', 'sales-a', 'coordinator'];
  const identities = aliases.map(alias => ({ alias, id: uuid(`campaign897:${input.candidate}:${alias}`),
    email: `${alias}.${input.id}.${input.candidate.slice(0, 12)}@campaign897.invalid` }));
  const coordinator = identities[3].id;
  const capabilities = ['staff.manage', 'founder.control'];
  const tables = ['users', 'sessions', 'otp_requests', 'totp_enrollments', 'totp_backup_codes', 'staff_grants', 'audit_logs'];
  const lock = `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s';
    LOCK TABLE ${tables.map(t => `public.${t}`).join(',')} IN SHARE ROW EXCLUSIVE MODE;
    SELECT pg_advisory_xact_lock(hashtextextended('${n}',0));`;
  const binding = `DO $guard$ BEGIN
    IF (SELECT count(*) FROM "${n}".campaign_manifest) <> 1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}')
    THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_entities) <> 4 OR EXISTS(
      SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN
      (${identities.map(u => `('${u.alias}','${u.id}','${u.email}')`).join(',')}))
    THEN RAISE EXCEPTION 'Campaign identities changed'; END IF;
  END $guard$;`;
  // Every actual row is hashed by the tracking trigger. Never copy auth secrets into receipts.
  const guard = `${binding}
    DO $guard$ BEGIN
      IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE t.tgname='${n}_auth' AND t.tgenabled='O' AND ns.nspname='${n}' AND p.proname='track_auth' AND
          t.tgrelid IN (${tables.map(t => `'public.${t}'::regclass`).join(',')})) <> ${tables.length}
      THEN RAISE EXCEPTION 'Campaign tracking unavailable'; END IF;
      IF EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id OR u.email=e.email
        WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='users' AND r.row_key=jsonb_build_object('id',u.id) AND NOT r.deleted)) OR
        EXISTS(SELECT 1 FROM public.otp_requests o JOIN "${n}".campaign_entities e ON o.destination=e.email
        WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',o.id) AND NOT r.deleted))
      THEN RAISE EXCEPTION 'Untracked campaign identity or OTP'; END IF;
    END $guard$;
    DO $guard$ DECLARE r record; actual text; fk record; foreign_rows bigint; BEGIN
      FOR r IN SELECT * FROM "${n}".campaign_records WHERE NOT deleted LOOP
        IF r.table_name NOT IN (${tables.map(t => `'${t}'`).join(',')}) THEN RAISE EXCEPTION 'Unknown campaign table'; END IF;
        EXECUTE format('SELECT md5(to_jsonb(t)::text) FROM public.%I t WHERE %s FOR UPDATE',r.table_name,
          CASE WHEN r.table_name='staff_grants' THEN format('"userId"=%L AND capability=%L',r.row_key->>'userId',r.row_key->>'capability') ELSE format('id=%L',r.row_key->>'id') END) INTO actual;
        IF actual IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'Untracked campaign mutation'; END IF;
        IF r.row_key ? 'id' THEN
          FOR fk IN SELECT c.conrelid::regclass AS source, c.conrelid, a.attname AS column_name, cardinality(c.conkey) AS columns, cardinality(c.confkey) AS target_columns,
            (SELECT attname FROM pg_attribute WHERE attrelid=c.confrelid AND attnum=c.confkey[1]) AS target_column,
            (SELECT ns.nspname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE cl.oid=c.conrelid) AS source_schema
            FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.contype='f' AND c.confrelid=format('public.%I',r.table_name)::regclass LOOP
            IF fk.columns <> 1 OR fk.target_columns <> 1 OR fk.target_column <> 'id' THEN RAISE EXCEPTION 'Composite campaign reference'; END IF;
            EXECUTE format('SELECT count(*) FROM %s child WHERE %I=$1 AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records owned WHERE $3=''public'' AND NOT owned.deleted AND owned.table_name=$2 AND owned.row_key=CASE WHEN $2=''staff_grants'' THEN jsonb_build_object(''userId'',to_jsonb(child)->>''userId'',''capability'',to_jsonb(child)->>''capability'') ELSE jsonb_build_object(''id'',to_jsonb(child)->>''id'') END)',fk.source,fk.column_name)
              INTO foreign_rows USING r.row_key->>'id', (SELECT relname FROM pg_class WHERE oid=fk.conrelid), fk.source_schema;
            IF foreign_rows <> 0 THEN RAISE EXCEPTION 'Foreign campaign reference'; END IF;
          END LOOP;
        END IF;
      END LOOP;
    END $guard$;`;
  if (!exists && input.kind === 'fixture') {
    sql(`BEGIN; ${lock}
      CREATE SCHEMA "${n}";
      CREATE TABLE "${n}".campaign_manifest(reservation_id text PRIMARY KEY, candidate text NOT NULL, profile text NOT NULL, state text NOT NULL CHECK(state IN ('identities','cleaning','disposed')));
      INSERT INTO "${n}".campaign_manifest VALUES('${input.id}','${input.candidate}','${profile}','identities');
      CREATE TABLE "${n}".campaign_entities(alias text PRIMARY KEY,user_id text UNIQUE NOT NULL,email text UNIQUE NOT NULL);
      INSERT INTO "${n}".campaign_entities VALUES ${identities.map(u => `('${u.alias}','${u.id}','${u.email}')`).join(',')};
      CREATE TABLE "${n}".campaign_records(table_name text NOT NULL,row_key jsonb NOT NULL,row_hash text NOT NULL,version bigint NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false, PRIMARY KEY(table_name,row_key));
      CREATE TABLE "${n}".campaign_events(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,table_name text NOT NULL,row_key jsonb NOT NULL,mutation text NOT NULL,row_hash text NOT NULL,observed_at timestamptz NOT NULL DEFAULT now());
      DO $guard$ BEGIN
        IF EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id OR u.email=e.email) OR
          EXISTS(SELECT 1 FROM public.otp_requests o JOIN "${n}".campaign_entities e ON o.destination=e.email)
        THEN RAISE EXCEPTION 'Campaign identity collision'; END IF;
        IF EXISTS(SELECT 1 FROM public.audit_logs WHERE id IN (${capabilities.map(c => `'${uuid(`campaign897:${input.candidate}:audit:${c}`)}'`).join(',')}))
        THEN RAISE EXCEPTION 'Campaign audit collision'; END IF;
      END $guard$;
      CREATE FUNCTION "${n}".track_auth() RETURNS trigger LANGUAGE plpgsql AS $track$
      DECLARE value jsonb; prior jsonb; subject text; previous_subject text; tracked boolean; lifecycle text; key jsonb; fingerprint text;
      BEGIN
        value := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        prior := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
        IF TG_TABLE_NAME='users' THEN
          SELECT user_id INTO subject FROM "${n}".campaign_entities WHERE user_id=value->>'id' OR email=value->>'email';
          SELECT user_id INTO previous_subject FROM "${n}".campaign_entities WHERE user_id=prior->>'id' OR email=prior->>'email';
        ELSIF TG_TABLE_NAME='otp_requests' THEN
          SELECT user_id INTO subject FROM "${n}".campaign_entities WHERE user_id=value->>'userId' OR email=value->>'destination';
          SELECT user_id INTO previous_subject FROM "${n}".campaign_entities WHERE user_id=prior->>'userId' OR email=prior->>'destination';
        ELSIF TG_TABLE_NAME='totp_backup_codes' THEN
          SELECT t."userId" INTO subject FROM public.totp_enrollments t JOIN "${n}".campaign_entities e ON e.user_id=t."userId" WHERE t.id=value->>'totpEnrollmentId';
          SELECT t."userId" INTO previous_subject FROM public.totp_enrollments t JOIN "${n}".campaign_entities e ON e.user_id=t."userId" WHERE t.id=prior->>'totpEnrollmentId';
        ELSIF TG_TABLE_NAME='audit_logs' THEN
          SELECT user_id INTO subject FROM "${n}".campaign_entities WHERE user_id=value->>'actorId' OR (value->>'targetType'='User' AND user_id=value->>'targetId') LIMIT 1;
          SELECT user_id INTO previous_subject FROM "${n}".campaign_entities WHERE user_id=prior->>'actorId' OR (prior->>'targetType'='User' AND user_id=prior->>'targetId') LIMIT 1;
        ELSE
          SELECT user_id INTO subject FROM "${n}".campaign_entities WHERE user_id=value->>'userId';
          SELECT user_id INTO previous_subject FROM "${n}".campaign_entities WHERE user_id=prior->>'userId';
        END IF;
        key := CASE WHEN TG_TABLE_NAME='staff_grants' THEN jsonb_build_object('userId',value->>'userId','capability',value->>'capability') ELSE jsonb_build_object('id',value->>'id') END;
        SELECT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=key AND NOT deleted) INTO tracked;
        IF subject IS NULL AND previous_subject IS NULL AND NOT tracked THEN RETURN NULL; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('${n}',0));
        SELECT state INTO lifecycle FROM "${n}".campaign_manifest;
        IF lifecycle='disposed' THEN RAISE EXCEPTION 'Disposed campaign cannot be resurrected'; END IF;
        IF lifecycle='identities' AND TG_OP='UPDATE' AND (subject IS DISTINCT FROM previous_subject OR value->>'id' IS DISTINCT FROM prior->>'id' OR (TG_TABLE_NAME='staff_grants' AND value->>'capability' IS DISTINCT FROM prior->>'capability'))
          THEN RAISE EXCEPTION 'Campaign reference transfer refused'; END IF;
        IF lifecycle='identities' THEN
          IF subject IS NULL THEN RAISE EXCEPTION 'Campaign ownership missing'; END IF;
          IF TG_TABLE_NAME='users' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=value->>'id' AND email=value->>'email') OR
            value->>'phone' IS NOT NULL OR value->>'avatarKey' IS NOT NULL OR value->>'avatarUploadId' IS NOT NULL OR value->>'avatarUrl' IS NOT NULL OR
            value->>'role' <> CASE WHEN subject='${identities[1].id}' THEN 'seller' ELSE 'buyer' END OR value->>'emailVerifiedAt' IS NULL OR
            value->>'suspendedAt' IS NOT NULL OR value->>'suspendedById' IS NOT NULL OR value->>'deletionScheduledAt' IS NOT NULL OR TG_OP='DELETE')
            THEN RAISE EXCEPTION 'Campaign identity authority changed'; END IF;
          IF TG_TABLE_NAME='otp_requests' AND (value->>'businessId' IS NOT NULL OR value->>'phone' IS NOT NULL OR value->>'purpose'<>'sign_in' OR value->>'channel'<>'email' OR
            NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=subject AND email=value->>'destination') OR
            (value->>'userId' IS NOT NULL AND value->>'userId'<>subject)) THEN RAISE EXCEPTION 'Unsupported campaign OTP'; END IF;
          IF TG_TABLE_NAME='staff_grants' AND (subject<>'${coordinator}' OR value->>'capability' NOT IN (${capabilities.map(c => `'${c}'`).join(',')}))
            THEN RAISE EXCEPTION 'Unsupported campaign grant'; END IF;
          IF TG_TABLE_NAME='audit_logs' AND (value->>'targetType'<>'User' OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=value->>'targetId') OR
            (value->>'actorId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=value->>'actorId')))
            THEN RAISE EXCEPTION 'Foreign campaign audit'; END IF;
        END IF;
        IF lifecycle='identities' AND ((SELECT count(*) FROM "${n}".campaign_records) >= 128 AND NOT tracked OR
          (SELECT count(*) FROM "${n}".campaign_events) >= 2048) THEN RAISE EXCEPTION 'Campaign auth graph limit'; END IF;
        fingerprint := md5(value::text);
        INSERT INTO "${n}".campaign_records(table_name,row_key,row_hash,deleted) VALUES(TG_TABLE_NAME,key,fingerprint,TG_OP='DELETE')
          ON CONFLICT(table_name,row_key) DO UPDATE SET row_hash=excluded.row_hash,version="${n}".campaign_records.version+1,deleted=excluded.deleted;
        INSERT INTO "${n}".campaign_events(table_name,row_key,mutation,row_hash) VALUES(TG_TABLE_NAME,key,TG_OP,fingerprint);
        RETURN NULL;
      END $track$;
      ${tables.map(t => `CREATE TRIGGER "${n}_auth" AFTER INSERT OR UPDATE OR DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION "${n}".track_auth();`).join('\n')}
      ${identities.map(u => `INSERT INTO public.users(id,email,"emailVerifiedAt","displayName",locale,role,"updatedAt") VALUES('${u.id}','${u.email}',now(),'Carberk synthetic ${u.alias}','ru','${u.alias === 'owner' ? 'seller' : 'buyer'}',now());`).join('\n')}
      ${capabilities.map(c => `INSERT INTO public.staff_grants("userId",capability) VALUES('${coordinator}','${c}');
        INSERT INTO public.audit_logs(id,"actorId",action,"targetType","targetId",details) VALUES('${uuid(`campaign897:${input.candidate}:audit:${c}`)}',NULL,'STAFF_CAPABILITY_BOOTSTRAP','User','${coordinator}','{"capability":"${c}","reason":"Synthetic reservation ${input.id} campaign897 prerequisites"}');`).join('\n')}
      ${guard} COMMIT;`);
    exists = true;
  }
  if (exists) {
    sql(`BEGIN; ${lock} ${guard} COMMIT;`);
    const state = sql(`SELECT state FROM "${n}".campaign_manifest;`);
    if (input.kind === 'fixture' && state !== 'identities') throw new Error();
    if (state === 'identities' && sql(`SELECT count(*) FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id AND u.email=e.email;`) !== '4') throw new Error();
    if (input.kind === 'reset' && state !== 'disposed') {
      // Delivery jobs and sink records are separate authorities. This bounded profile
      // has no reviewed cleanup adapter for them, so even an expired/deleted OTP
      // requires explicit disposition rather than a false database-only success.
      if (sql(`SELECT count(*) FROM "${n}".campaign_records WHERE table_name='otp_requests';`) !== '0') throw new Error();
      // Locks fence all allowed auth writers. FK inventory above refuses every untracked child,
      // including ON DELETE CASCADE/SET NULL references. No cascade is used for disposal.
      sql(`BEGIN; ${lock} ${guard}
        DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name='otp_requests') THEN RAISE EXCEPTION 'Owned OTP delivery requires disposition'; END IF; END $guard$;
        UPDATE "${n}".campaign_manifest SET state='cleaning';
        ${['totp_backup_codes', 'sessions', 'otp_requests', 'totp_enrollments', 'staff_grants'].map(t => `DELETE FROM public.${t} t USING "${n}".campaign_records r WHERE r.table_name='${t}' AND NOT r.deleted AND
          ${t === 'staff_grants' ? `r.row_key=jsonb_build_object('userId',t."userId",'capability',t.capability)` : `r.row_key=jsonb_build_object('id',t.id)`};`).join('\n')}
        UPDATE public.audit_logs a SET "actorId"=NULL, "targetType"='SyntheticCampaign', "targetId"='${input.id}', details='{"profile":"${profile}","disposition":"redacted-synthetic-audit"}'
          FROM "${n}".campaign_records r WHERE r.table_name='audit_logs' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',a.id);
        DELETE FROM public.users u USING "${n}".campaign_entities e WHERE u.id=e.user_id;
        UPDATE "${n}".campaign_manifest SET state='disposed';
        ${guard}
        DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs') THEN RAISE EXCEPTION 'Incomplete campaign disposal'; END IF; END $guard$;
        COMMIT;`);
    }
  } else {
    // An unknown/lost namespace is never proof of absence: check deterministic identities/methods.
    if (sql(`SELECT (SELECT count(*) FROM public.users WHERE id IN (${identities.map(u => `'${u.id}'`).join(',')}) OR email IN (${identities.map(u => `'${u.email}'`).join(',')})) + (SELECT count(*) FROM public.otp_requests WHERE destination IN (${identities.map(u => `'${u.email}'`).join(',')}));`) !== '0') throw new Error();
  }
  const state = exists ? sql(`SELECT state FROM "${n}".campaign_manifest;`) : 'disposed';
  const retainedAudits = exists ? Number(sql(`SELECT count(*) FROM "${n}".campaign_records WHERE table_name='audit_logs' AND NOT deleted;`)) : 0;
  const receipt = { fixtures: state === 'disposed' ? 'absent' : 'present', namespace: n, profile, candidate: input.candidate,
    state, identities: state === 'disposed' ? 0 : 4, protectedReceipt: `${n}.campaign_entities`, retainedAudits,
    auth: 'normal-endpoints-required', deliveryCleanup: 'unsupported-after-otp', tombstone: exists && state === 'disposed' };
  if (input.kind === 'probe') {
    if (sql('SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;') !== '0') throw new Error();
    const migrations = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`));
    if (JSON.stringify(migrations) !== JSON.stringify(input.expectedMigrations) || !['unchanged', 'retained-additive'].includes(input.schemaDisposition)) throw new Error();
    Object.assign(receipt, { sha: input.target, schema: input.schemaDisposition, migrations });
  }
  console.log(JSON.stringify(receipt));
}
