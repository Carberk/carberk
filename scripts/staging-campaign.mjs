/** Fixed reservation-owned auth prerequisite graph. Serialized with the remote program.
 * No caller SQL, token minting, fixed OTP codes, media or scenario state imports.
 */
export function campaignMain(input, { sql, uuid, exists, disposeDeliveries }) {
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
    IF (SELECT count(*) FROM "${n}".campaign_manifest) <> 1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}' AND delivery_version=1)
    THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_entities) <> 4 OR EXISTS(
      SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN
      (${identities.map(u => `('${u.alias}','${u.id}','${u.email}')`).join(',')}))
    THEN RAISE EXCEPTION 'Campaign identities changed'; END IF;
    IF (SELECT delivery_hash FROM "${n}".campaign_manifest) IS DISTINCT FROM
       (SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY request_id),'[]'::jsonb)::text) FROM "${n}".campaign_delivery_ledger d) OR
       EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger d WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities e WHERE e.email=d.email) OR
         NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',d.request_id))) OR
       EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND NOT EXISTS(
         SELECT 1 FROM "${n}".campaign_delivery_ledger d WHERE r.row_key=jsonb_build_object('id',d.request_id)))
    THEN RAISE EXCEPTION 'Campaign delivery journal changed'; END IF;
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
      CREATE TABLE "${n}".campaign_manifest(reservation_id text PRIMARY KEY, candidate text NOT NULL, profile text NOT NULL, state text NOT NULL CHECK(state IN ('identities','cleaning','disposed')), delivery_version integer NOT NULL DEFAULT 1, delivery_hash text NOT NULL DEFAULT md5('[]'));
      INSERT INTO "${n}".campaign_manifest(reservation_id,candidate,profile,state) VALUES('${input.id}','${input.candidate}','${profile}','identities');
      CREATE TABLE "${n}".campaign_entities(alias text PRIMARY KEY,user_id text UNIQUE NOT NULL,email text UNIQUE NOT NULL);
      INSERT INTO "${n}".campaign_entities VALUES ${identities.map(u => `('${u.alias}','${u.id}','${u.email}')`).join(',')};
      CREATE TABLE "${n}".campaign_delivery_ledger(request_id text PRIMARY KEY,email text NOT NULL,UNIQUE(request_id,email));
      CREATE TABLE "${n}".campaign_delivery_sink(request_id text PRIMARY KEY,email text NOT NULL,message jsonb NOT NULL,
        FOREIGN KEY(request_id,email) REFERENCES "${n}".campaign_delivery_ledger(request_id,email));
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
        IF lifecycle='cleaning' AND TG_OP<>'DELETE' AND NOT (TG_TABLE_NAME='audit_logs' AND TG_OP='UPDATE' AND
          value->>'actorId' IS NULL AND value->>'targetType'='SyntheticCampaign' AND value->>'targetId'='${input.id}' AND
          value->'details'=jsonb_build_object('profile','${profile}','disposition','redacted-synthetic-audit'))
          THEN RAISE EXCEPTION 'Cleaning campaign cannot accept auth writes'; END IF;
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
        IF TG_TABLE_NAME='otp_requests' AND lifecycle='identities' THEN
          INSERT INTO "${n}".campaign_delivery_ledger(request_id,email) VALUES(value->>'id',value->>'destination') ON CONFLICT DO NOTHING;
          IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger WHERE request_id=value->>'id' AND email=value->>'destination')
            THEN RAISE EXCEPTION 'Campaign delivery collision'; END IF;
          UPDATE "${n}".campaign_manifest SET delivery_hash=(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY request_id),'[]'::jsonb)::text) FROM "${n}".campaign_delivery_ledger d);
        END IF;
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
    if (['identities', 'cleaning'].includes(state) && sql(`SELECT count(*) FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id AND u.email=e.email;`) !== '4') throw new Error();
    if (input.kind === 'reset') {
      if (state !== 'disposed') {
        // Commit the fence before touching Redis. Interrupted disposal stays cleaning;
        // normal enqueue and mock send share this exact advisory lock and state check.
        sql(`BEGIN; ${lock} ${guard} UPDATE "${n}".campaign_manifest SET state='cleaning'; COMMIT;`);
      }
      const deliveries = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('requestId',request_id,'email',email) ORDER BY request_id),'[]') FROM "${n}".campaign_delivery_ledger;`));
      disposeDeliveries(deliveries, state === 'disposed');
      if (state !== 'disposed') {
      // Locks fence all allowed auth writers. FK inventory above refuses every untracked child,
      // including ON DELETE CASCADE/SET NULL references. No cascade is used for disposal.
      sql(`BEGIN; ${lock} ${guard}
        DELETE FROM "${n}".campaign_delivery_sink;
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
      if (sql(`SELECT count(*) FROM "${n}".campaign_delivery_sink;`) !== '0') throw new Error();
    }
  } else {
    // An unknown/lost namespace is never proof of absence: check deterministic identities/methods.
    if (sql(`SELECT (SELECT count(*) FROM public.users WHERE id IN (${identities.map(u => `'${u.id}'`).join(',')}) OR email IN (${identities.map(u => `'${u.email}'`).join(',')})) + (SELECT count(*) FROM public.otp_requests WHERE destination IN (${identities.map(u => `'${u.email}'`).join(',')}));`) !== '0') throw new Error();
  }
  const state = exists ? sql(`SELECT state FROM "${n}".campaign_manifest;`) : 'disposed';
  if (exists && state === 'disposed' && input.kind !== 'reset') {
    disposeDeliveries(JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('requestId',request_id,'email',email) ORDER BY request_id),'[]') FROM "${n}".campaign_delivery_ledger;`)), true);
    if (sql(`SELECT count(*) FROM "${n}".campaign_delivery_sink;`) !== '0') throw new Error();
  }
  const retainedAudits = exists ? Number(sql(`SELECT count(*) FROM "${n}".campaign_records WHERE table_name='audit_logs' AND NOT deleted;`)) : 0;
  const receipt = { fixtures: state === 'disposed' ? 'absent' : 'present', namespace: n, profile, candidate: input.candidate,
    state, identities: state === 'disposed' ? 0 : 4, protectedReceipt: `${n}.campaign_entities`, retainedAudits,
    auth: 'normal-endpoints-required', reservationId: input.id, cleanupVersion: 1,
    deliveryCleanup: state === 'disposed' && exists ? 'disposed' : 'pending',
    ...(state === 'disposed' && exists ? { queueJobs: 0, sinkRecords: 0 } : {}), tombstone: exists && state === 'disposed' };
  if (input.kind === 'probe') {
    if (sql('SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;') !== '0') throw new Error();
    const migrations = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`));
    if (JSON.stringify(migrations) !== JSON.stringify(input.expectedMigrations) || !['unchanged', 'retained-additive'].includes(input.schemaDisposition)) throw new Error();
    Object.assign(receipt, { sha: input.target, schema: input.schemaDisposition, migrations });
  }
  console.log(JSON.stringify(receipt));
}


/** Runs only inside the API service process. No scan, drain, obliterate or caller queue name. */

/** Fixed media-free storage profiles. V3 admits ordinary sign-in code requests, their normally
 * generated Sessions, owned staff TOTP enrollment, backup codes and current-Session elevation,
 * and disposes their exact deliveries and secret rows. */
export function businessMain(input, { sql, uuid, exists, disposeDeliveries }) {
  const bootstrapV3 = input.profile === 'campaign897-full-v3';
  const profile = bootstrapV3 ? 'campaign897-full-v3' : 'campaign897-business-v2';
  const version = bootstrapV3 ? 3 : 2;
  if (bootstrapV3 && (!/^[a-f0-9]{32}$/.test(input.id ?? '') || input.namespace !== `cf_${input.id}` ||
      !['fixture', 'reset'].includes(input.kind))) throw new Error('Campaign bootstrap scope refused');
  if (input.profile !== profile || !/^[a-f0-9]{40}$/.test(input.candidate ?? '')) throw new Error();
  if (input.kind === 'fixture' && input.candidate !== input.target) throw new Error('Campaign runtime candidate mismatch');
  let observation;
  if (input.kind === 'probe') {
    // The remote wrapper attests this runtime independently of the original
    // candidate binding. A restored main observes C; it must not rebind C to M.
    const sha = process.env.AUTOTM_COMMIT_SHA;
    if (sha !== input.target || !/^[a-f0-9]{40}$/.test(sha ?? '') ||
        !Array.isArray(input.expectedMigrations) || input.expectedMigrations.length === 0 ||
        !['unchanged', 'retained-additive'].includes(input.schemaDisposition)) throw new Error();
    if (sql('SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;') !== '0') throw new Error();
    const migrations = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`));
    if (JSON.stringify(migrations) !== JSON.stringify(input.expectedMigrations)) throw new Error();
    // The graph's integrity check below also verifies the captured schema hash.
    observation = { sha, migrations, schema: input.schemaDisposition };
  }
  const n = input.namespace;
  const aliases = ['buyer-a', 'buyer-b', 'owner', 'sales-a', 'sales-b', 'coordinator', 'support', 'history-fulfiller', 'payment-verifier', 'reception-steward', 'technician', 'independent-reviewer', 'private-reviewer', 'aggregate-viewer', 'investigator'];
  const identities = aliases.map(alias => ({ alias, id: uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:${alias}`), email: `${alias}.${input.id}.${input.candidate.slice(0, 12)}@campaign897.invalid` }));
  const owner = identities.find(identity => identity.alias === 'owner');
  const coordinator = identities.find(identity => identity.alias === 'coordinator');
  const rootId = uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:root`);
  const rootSlug = `campaign897-${input.id}-${input.candidate.slice(0, 12)}`;
  const rootContact = `+999${(BigInt(`0x${require('node:crypto').createHash('sha256').update(`${input.id}:${input.candidate}:business-contact`).digest('hex').slice(0, 12)}`) % 1000000000000n).toString().padStart(12, '0')}`;
  const contactPhone = bootstrapV3 ? `+9936${(BigInt(`0x${require('node:crypto').createHash('sha256').update(`campaign897-contact-phone-v1:${input.id}:${input.candidate}`, 'ascii').digest('hex')}`) % 10000000n).toString().padStart(7, '0')}` : null;
  const contactOwner = identities.find(identity => identity.alias === 'buyer-a');
  const tables = ['users', 'dealerships', 'dealership_members', 'dealership_invitations', 'listings', 'listing_drafts', 'conversations', 'conversation_participants', 'messages', 'business_enquiry_audits', 'favorites', 'verified_contact_phones', 'owned_vehicles', 'blocked_users', 'notification_preferences', 'content_reports', 'staff_grants', 'audit_logs'];
  // OTP requests, ordinary Sessions and owned staff TOTP join the bounded journal.
  if (bootstrapV3) tables.push('sessions', 'totp_enrollments', 'totp_backup_codes', 'otp_requests');
  // V3 ordinary staff grant/revoke (PrismaStaffAuthority.change): one composite grant transition
  // and one audit from a distinct current roster manager. Bootstrap rows stay fixed. The set is
  // packages/contracts StaffCapabilitySchema less founder.control, which is never grantable.
  const grantable = ['support.operations', 'history.fulfilment', 'history.payment.verify', 'history.payment.history', 'history.export', 'founder.refund.approve', 'staff.manage', 'founder.admission', 'founder.recovery', 'diagnostics.reception', 'diagnostics.technician', 'diagnostics.reviewer', 'diagnostics.templates', 'analytics.aggregate', 'analytics.investigate'].map(c => `'${c}'`).join(',');
  const founderControlled = ['history.export', 'history.payment.history', 'founder.refund.approve', 'founder.admission', 'founder.recovery', 'analytics.aggregate', 'analytics.investigate', 'staff.manage'].map(c => `'${c}'`).join(',');
  const bootstrapGrant = row => `(${row}->>'userId'='${coordinator.id}' AND ${row}->>'capability' IN ('staff.manage','founder.control'))`;
  const grantGuard = bootstrapV3 ? `IF TG_TABLE_NAME='staff_grants' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'userId') OR CASE WHEN ${bootstrapGrant('v_row')}
          THEN TG_OP<>'INSERT' OR v_row->>'revokedAt' IS NOT NULL
          ELSE v_row->>'capability' NOT IN (${grantable}) OR (TG_OP='INSERT' AND v_row->>'revokedAt' IS NOT NULL) OR (TG_OP='UPDATE' AND NOT coalesce(
            (prior->>'revokedAt' IS NULL AND v_row->>'revokedAt' IS NOT NULL AND v_row-'revokedAt'=prior-'revokedAt') OR
            (prior->>'revokedAt' IS NOT NULL AND v_row->>'revokedAt' IS NULL AND v_row-'revokedAt'-'grantedAt'=prior-'revokedAt'-'grantedAt'),false)) END) THEN RAISE EXCEPTION 'Unsupported campaign grant'; END IF;`
    : `IF TG_TABLE_NAME='staff_grants' AND (v_row->>'userId'<>'${coordinator.id}' OR v_row->>'capability' NOT IN ('staff.manage','founder.control')) THEN RAISE EXCEPTION 'Unsupported campaign grant'; END IF;`;
  // The audit follows its grant write in the same transaction, so the row already shows the
  // transition. Its actor must be a different roster User currently elevated with staff.manage,
  // and with founder.control for founder-controlled capabilities (UTC timestamp(3) columns).
  const grantAudit = bootstrapV3 ? ` AND NOT coalesce(TG_OP='INSERT' AND v_row->>'action' IN ('STAFF_CAPABILITY_GRANTED','STAFF_CAPABILITY_REVOKED') AND v_row->>'targetType'='User' AND
          EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'targetId') AND EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'actorId') AND v_row->>'actorId'<>v_row->>'targetId' AND
          jsonb_typeof(v_row->'details')='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_row->'details') k)=ARRAY['capability','previouslyActive','reason'] AND
          v_row->'details'->>'capability' IN (${grantable}) AND jsonb_typeof(v_row->'details'->'reason')='string' AND char_length(v_row->'details'->>'reason') BETWEEN 1 AND 1000 AND
          v_row->'details'->'previouslyActive'=to_jsonb(v_row->>'action'='STAFF_CAPABILITY_REVOKED') AND
          EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=v_row->>'targetId' AND g.capability=v_row->'details'->>'capability' AND (g."revokedAt" IS NULL)=(v_row->>'action'='STAFF_CAPABILITY_GRANTED')) AND
          EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=v_row->>'actorId' AND g.capability='staff.manage' AND g."revokedAt" IS NULL) AND
          (v_row->'details'->>'capability' NOT IN (${founderControlled}) OR EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=v_row->>'actorId' AND g.capability='founder.control' AND g."revokedAt" IS NULL)) AND
          EXISTS(SELECT 1 FROM public.sessions s JOIN "${n}".campaign_records r ON r.table_name='sessions' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',s.id)
            WHERE s."userId"=v_row->>'actorId' AND s."expiresAt">(now() AT TIME ZONE 'UTC') AND s."adminTotpExpiresAt">(now() AT TIME ZONE 'UTC')),false)` : '';
  // V3 synthetic admission (PrismaBusinessRepository.admit): one Dealership INSERT, its owner invitation and
  // BUSINESS_ADMITTED in one transaction. A non-owned Dealership INSERT records only its ID in this namespace's
  // transaction-local slot (one value, never persisted, reverted on rollback); UPDATE never writes it. The owned
  // owner invitation adopts exactly that Dealership. This defends ordinary code paths and concurrent traffic only:
  // same-role SQL can set the slot, as it can disable these triggers. Owner redemption, settings and ordinary
  // sales invitations/membership follow adoption; recovery stays closed.
  const createdSlot = `'${n}.created_dealership'`;
  const admissionColumns = ['id', 'slug', 'name', 'status', 'admissionMode', 'admittedAt', 'checkedEvidence', 'createdAt', 'updatedAt'].map(c => `'${c}'`).join(',');
  const admissionSlot = bootstrapV3 ? `
      IF TG_TABLE_NAME='dealerships' AND TG_OP='INSERT' AND NOT coalesce(owned,false) THEN PERFORM set_config(${createdSlot},v_row->>'id',true); END IF;` : '';
  const admissionAdoption = bootstrapV3 ? `IF lifecycle='identities' AND TG_TABLE_NAME='dealership_invitations' AND TG_OP='INSERT' AND v_row->>'dealershipId'<>'${rootId}' AND
        current_setting(${createdSlot},true)=v_row->>'dealershipId' AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name='dealerships' AND row_key=jsonb_build_object('id',v_row->>'dealershipId')) THEN
        SELECT to_jsonb(d) INTO adopted FROM public.dealerships d WHERE d.id=v_row->>'dealershipId';
        IF adopted IS NULL OR adopted->>'status'<>'recovery' OR adopted->>'admissionMode'<>'synthetic' OR adopted->>'admittedAt' IS NOT NULL OR adopted->>'slug'='${rootSlug}' OR
          char_length(adopted->>'name') NOT BETWEEN 2 AND 120 OR jsonb_typeof(adopted->'checkedEvidence')<>'string' OR char_length(adopted->>'checkedEvidence') NOT BETWEEN 3 AND 2000 OR
          EXISTS(SELECT 1 FROM jsonb_each(adopted) e WHERE e.key NOT IN (${admissionColumns}) AND e.value<>'null'::jsonb) OR
          v_row->>'role'<>'owner' OR v_row->>'redeemedAt' IS NOT NULL OR v_row->>'revokedAt' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'recipientUserId') OR
          (SELECT count(*) FROM public.dealership_invitations WHERE "dealershipId"=v_row->>'dealershipId')<>1 OR EXISTS(SELECT 1 FROM public.dealership_members WHERE "dealershipId"=v_row->>'dealershipId')
          THEN RAISE EXCEPTION 'Unsupported campaign admission'; END IF;
        PERFORM set_config(${createdSlot},'',true);
        INSERT INTO "${n}".campaign_records(table_name,row_key,row_hash) VALUES('dealerships',jsonb_build_object('id',adopted->>'id'),md5(adopted::text));
        INSERT INTO "${n}".campaign_events(table_name,row_key,mutation,row_hash) VALUES('dealerships',jsonb_build_object('id',adopted->>'id'),'INSERT',md5(adopted::text));
        admitting := true;
      END IF;
      ` : '';
  // Admitted businesses have one owner invitation and one immutable owner membership.
  // The root's original rules remain separate. Sales membership never changes the owner or business status.
  const ownerMember = (business, user) => `EXISTS(SELECT 1 FROM public.dealership_members om JOIN "${n}".campaign_records omr ON omr.table_name='dealership_members' AND NOT omr.deleted AND omr.version=1 AND omr.row_key=jsonb_build_object('id',om.id)
          WHERE om."dealershipId"=${business} AND om."userId"=${user} AND om.role='owner' AND om.status='active')`;
  const redeemedInvitation = (business, user) => `EXISTS(SELECT 1 FROM public.dealership_invitations i JOIN "${n}".campaign_records ir ON ir.table_name='dealership_invitations' AND NOT ir.deleted AND ir.version=2 AND ir.row_key=jsonb_build_object('id',i.id)
          WHERE i."dealershipId"=${business} AND i."recipientUserId"=${user} AND i.role='owner' AND i."redeemedAt" IS NOT NULL AND i."revokedAt" IS NULL)`;
  const redeemedSalesInvitation = (business, user) => `EXISTS(SELECT 1 FROM public.dealership_invitations i JOIN "${n}".campaign_records ir ON ir.table_name='dealership_invitations' AND NOT ir.deleted AND ir.version=2 AND ir.row_key=jsonb_build_object('id',i.id)
          WHERE i."dealershipId"=${business} AND i."recipientUserId"=${user} AND i.role='sales' AND i."redeemedAt" IS NOT NULL AND i."revokedAt" IS NULL)`;
  const activeOwner = (business) => `EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."dealershipId"=${business} AND m.role='owner' AND m.status='active' AND ${ownerMember(business, 'm."userId"')})`;
  const admissionClosed = bootstrapV3 ? `
        IF TG_TABLE_NAME='dealership_invitations' AND v_row->>'dealershipId'<>'${rootId}' AND NOT coalesce(admitting,false) AND NOT coalesce(
          TG_OP='UPDATE' AND prior->>'role'='owner' AND prior->>'redeemedAt' IS NULL AND prior->>'revokedAt' IS NULL AND v_row->>'redeemedAt' IS NOT NULL AND
          (prior->>'expiresAt')::timestamp>(now() AT TIME ZONE 'UTC') AND v_row-'redeemedAt' IS NOT DISTINCT FROM prior-'redeemedAt' AND
          EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'dealershipId' AND d.status='recovery') AND
          NOT EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."dealershipId"=v_row->>'dealershipId'),false) AND
          NOT coalesce(TG_OP='INSERT' AND v_row->>'role'='sales' AND v_row->>'redeemedAt' IS NULL AND v_row->>'revokedAt' IS NULL AND
            v_row->>'tokenHash' ~ '^[a-f0-9]{64}$' AND (v_row->>'expiresAt')::timestamp>(now() AT TIME ZONE 'UTC') AND
            EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'dealershipId' AND d.status='active') AND
            NOT EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."userId"=v_row->>'recipientUserId') AND
            (SELECT count(*) FROM public.dealership_invitations i WHERE i."dealershipId"=v_row->>'dealershipId' AND i."recipientUserId"=v_row->>'recipientUserId' AND i."revokedAt" IS NULL AND i."redeemedAt" IS NULL)=1 AND
            ${activeOwner("v_row->>'dealershipId'")} AND EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'recipientUserId'),false) AND
          NOT coalesce(TG_OP='UPDATE' AND prior->>'role'='sales' AND prior->>'redeemedAt' IS NULL AND prior->>'revokedAt' IS NULL AND v_row->>'revokedAt' IS NOT NULL AND
            v_row-'revokedAt' IS NOT DISTINCT FROM prior-'revokedAt' AND ${activeOwner("v_row->>'dealershipId'")},false) AND
          NOT coalesce(TG_OP='UPDATE' AND prior->>'role'='sales' AND prior->>'redeemedAt' IS NULL AND prior->>'revokedAt' IS NULL AND v_row->>'redeemedAt' IS NOT NULL AND
            (prior->>'expiresAt')::timestamp>(now() AT TIME ZONE 'UTC') AND v_row-'redeemedAt' IS NOT DISTINCT FROM prior-'redeemedAt' AND
            EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'dealershipId' AND d.status='active') AND ${activeOwner("v_row->>'dealershipId'")} AND
            NOT EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."userId"=v_row->>'recipientUserId'),false)
          THEN RAISE EXCEPTION 'Unsupported campaign business'; END IF;
        IF TG_TABLE_NAME='dealership_members' AND v_row->>'dealershipId'<>'${rootId}' AND NOT coalesce(TG_OP='INSERT' AND v_row->>'role'='owner' AND v_row->>'status'='active' AND
          ${redeemedInvitation("v_row->>'dealershipId'", "v_row->>'userId'")} AND
          (SELECT count(*) FROM public.dealership_members m WHERE m."dealershipId"=v_row->>'dealershipId')=1 AND
          EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'dealershipId' AND d.status='recovery'),false) AND NOT coalesce(
            TG_OP='INSERT' AND v_row->>'role'='sales' AND v_row->>'status'='active' AND ${redeemedSalesInvitation("v_row->>'dealershipId'", "v_row->>'userId'")} AND
            ${activeOwner("v_row->>'dealershipId'")} AND
            EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'dealershipId' AND d.status='active'),false) AND NOT coalesce(
            TG_OP='UPDATE' AND prior->>'role'='sales' AND prior->>'status' IN ('active','suspended') AND v_row->>'role'='sales' AND
            v_row->>'status' IN ('active','suspended') AND v_row-'status' IS NOT DISTINCT FROM prior-'status' AND ${activeOwner("v_row->>'dealershipId'")},false)
          THEN RAISE EXCEPTION 'Unsupported campaign business'; END IF;` : '';
  const smsHash = `(SELECT md5(jsonb_build_object('binding',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY reservation_id),'[]'::jsonb) FROM "${n}".campaign_sms_binding b),'ledger',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY request_id),'[]'::jsonb) FROM "${n}".campaign_sms_ledger l))::text))`;
  const contactBusiness = business => `EXISTS(SELECT 1 FROM public.dealerships d JOIN "${n}".campaign_records r ON r.table_name='dealerships' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',d.id)
    WHERE d.id=${business} AND d.id<>'${rootId}' AND d.status='active' AND d."admissionMode"='synthetic' AND d."admittedAt" IS NULL AND
    ${ownerMember('d.id', `'${contactOwner.id}'`)} AND ${redeemedInvitation('d.id', `'${contactOwner.id}'`)})`;
  const contactOtp = row => `${row}->>'purpose'='listing_contact_phone' AND ${row}->>'channel'='phone' AND
    ${row}->>'destination'='${contactPhone}' AND ${row}->>'phone'='${contactPhone}' AND ${row}->>'userId'='${contactOwner.id}' AND
    ${contactBusiness(`${row}->>'businessId'`)} AND EXISTS(SELECT 1 FROM "${n}".campaign_sms_binding b WHERE
      b.reservation_id='${input.id}' AND b.candidate='${input.candidate}' AND b.destination='${contactPhone}' AND
      (b.business_id IS NULL OR (b.business_id=${row}->>'businessId' AND b.owner_id=${row}->>'userId')))`;
  // Match OLD and NEW scalar references before the foreign-row early return. No second fence.
  const phoneGuard = bootstrapV3 ? `
      IF (SELECT state FROM "${n}".campaign_manifest)<>'disposed' AND (
        (TG_TABLE_NAME IN ('users','verified_contact_phones','otp_requests') AND
          ('${contactPhone}' IN (v_row->>'phone',prior->>'phone') OR (TG_TABLE_NAME='otp_requests' AND '${contactPhone}' IN (v_row->>'destination',prior->>'destination')))) OR
        (TG_TABLE_NAME IN ('dealerships','listings') AND '${contactPhone}' IN (v_row->>'contactPhone',prior->>'contactPhone'))) AND NOT coalesce(
          owned AND (((SELECT state FROM "${n}".campaign_manifest)='cleaning' AND TG_OP='DELETE') OR (TG_TABLE_NAME='otp_requests' AND ${contactOtp('v_row')}) OR
            (TG_TABLE_NAME='dealerships' AND EXISTS(SELECT 1 FROM "${n}".campaign_sms_binding b WHERE b.business_id=v_row->>'id' AND b.owner_id='${contactOwner.id}'))),false)
        THEN RAISE EXCEPTION 'Campaign phone collision'; END IF;` : '';
  const smsSchemaHash = `(SELECT md5(jsonb_build_object('columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM
    (SELECT attrelid,attnum,attname,atttypid,attnotnull,attgenerated FROM pg_attribute WHERE attrelid IN ('"${n}".campaign_sms_binding'::regclass,'"${n}".campaign_sms_ledger'::regclass,'"${n}".campaign_sms_sink'::regclass) AND attnum>0 AND NOT attisdropped) a),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid,'definition',pg_get_constraintdef(oid)) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid IN ('"${n}".campaign_sms_binding'::regclass,'"${n}".campaign_sms_ledger'::regclass,'"${n}".campaign_sms_sink'::regclass)))::text))`;
  const smsInventory = (pendingOtp = '') => bootstrapV3 ? `
    IF (SELECT sms_hash FROM "${n}".campaign_manifest) IS DISTINCT FROM ${smsHash} OR
      (SELECT sms_schema_hash FROM "${n}".campaign_manifest) IS DISTINCT FROM ${smsSchemaHash} OR
      (SELECT sms_contract_hash FROM "${n}".campaign_manifest) IS DISTINCT FROM md5(pg_get_functiondef('"${n}".campaign_sms_authority(text,text,text,text)'::regprocedure)) OR
      (SELECT count(*) FROM "${n}".campaign_sms_binding)<>1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_sms_binding WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND destination='${contactPhone}' AND
        ((business_id IS NULL AND owner_id IS NULL) OR (business_id IS NOT NULL AND owner_id='${contactOwner.id}'))) OR
      EXISTS(SELECT 1 FROM "${n}".campaign_sms_ledger l WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_sms_binding b WHERE l.reservation_id=b.reservation_id AND l.candidate=b.candidate AND l.destination=b.destination AND l.business_id=b.business_id AND l.owner_id=b.owner_id) OR
        l.purpose<>'listing_contact_phone' OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_events e WHERE e.table_name='otp_requests' AND e.row_key=jsonb_build_object('id',l.request_id) AND e.mutation='INSERT' AND e.row_hash=l.issue_row_hash) OR
        NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',l.request_id))) OR
      EXISTS(SELECT 1 FROM "${n}".campaign_sms_sink s WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_sms_ledger l WHERE l.request_id=s.request_id))
      THEN RAISE EXCEPTION 'Campaign SMS contract changed'; END IF;
    IF (SELECT state FROM "${n}".campaign_manifest)<>'disposed' AND (
      EXISTS(SELECT 1 FROM public.users WHERE phone='${contactPhone}') OR
      EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone='${contactPhone}') OR
      EXISTS(SELECT 1 FROM public.listings WHERE "contactPhone"='${contactPhone}') OR
      EXISTS(SELECT 1 FROM public.dealerships d WHERE d."contactPhone"='${contactPhone}' AND NOT EXISTS(
        SELECT 1 FROM "${n}".campaign_sms_binding b JOIN "${n}".campaign_records r ON r.table_name='dealerships' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',b.business_id) WHERE b.business_id=d.id AND b.owner_id='${contactOwner.id}')) OR
      EXISTS(SELECT 1 FROM public.otp_requests o WHERE ${pendingOtp}(o.phone='${contactPhone}' OR o.destination='${contactPhone}') AND NOT EXISTS(
        SELECT 1 FROM "${n}".campaign_sms_ledger l JOIN "${n}".campaign_records r ON r.table_name='otp_requests' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',l.request_id)
          WHERE l.request_id=o.id AND l.destination=o.destination AND o.phone=l.destination AND l.code_hash=o."codeHash" AND l.business_id=o."businessId" AND l.owner_id=o."userId" AND o.purpose='listing_contact_phone' AND o.channel='phone')))
      THEN RAISE EXCEPTION 'Campaign phone collision'; END IF;` : '';
  const admittedBusiness = bootstrapV3 ? `
        IF TG_TABLE_NAME='dealerships' AND v_row->>'id'<>'${rootId}' AND NOT coalesce(TG_OP='UPDATE' AND v_row->>'admissionMode'='synthetic' AND
          v_row->>'admittedAt' IS NULL AND char_length(v_row->>'name') BETWEEN 2 AND 120 AND (
          (prior->>'status'='recovery' AND v_row->>'status'='active' AND v_row-'status'-'updatedAt' IS NOT DISTINCT FROM prior-'status'-'updatedAt' AND
            EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."dealershipId"=v_row->>'id' AND ${ownerMember("v_row->>'id'", 'm."userId"')} AND ${redeemedInvitation("v_row->>'id'", 'm."userId"')})) OR
          (prior->>'status'='active' AND v_row->>'status'='active' AND v_row-'contactPhone'-'contactConfirmedAt'-'updatedAt' IS NOT DISTINCT FROM prior-'contactPhone'-'contactConfirmedAt'-'updatedAt' AND
            v_row->>'contactPhone'='${contactPhone}' AND v_row->>'contactConfirmedAt' IS NOT NULL AND
            EXISTS(SELECT 1 FROM "${n}".campaign_sms_binding b JOIN "${n}".campaign_sms_ledger l ON l.business_id=b.business_id AND l.owner_id=b.owner_id
              JOIN public.otp_requests o ON o.id=l.request_id JOIN "${n}".campaign_records r ON r.table_name='otp_requests' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',o.id) AND r.row_hash=md5(to_jsonb(o)::text)
              WHERE b.business_id=v_row->>'id' AND b.owner_id='${contactOwner.id}' AND o."verifiedAt" IS NOT NULL AND o."codeHash"=l.code_hash AND o.destination=b.destination AND o."businessId"=b.business_id AND o."userId"=b.owner_id) AND
            ${contactBusiness("v_row->>'id'")}) OR
          (prior->>'status'='active' AND v_row->>'status'='active' AND v_row-'name'-'cityId'-'updatedAt' IS NOT DISTINCT FROM prior-'name'-'cityId'-'updatedAt' AND
            EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."dealershipId"=v_row->>'id' AND ${ownerMember("v_row->>'id'", 'm."userId"')}))),false)
          THEN RAISE EXCEPTION 'Unsupported campaign business'; END IF;` : '';
  const ownerAudit = bootstrapV3 ? ` AND NOT coalesce(TG_OP='INSERT' AND v_row->>'targetType'='Dealership' AND v_row->>'targetId'<>'${rootId}' AND
          EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name='dealerships' AND NOT deleted AND row_key=jsonb_build_object('id',v_row->>'targetId')) AND
          ${ownerMember("v_row->>'targetId'", "v_row->>'actorId'")} AND ${redeemedInvitation("v_row->>'targetId'", "v_row->>'actorId'")} AND
          EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'targetId' AND d.status='active') AND (
          (v_row->>'action'='BUSINESS_INVITATION_REDEEMED' AND v_row->'details'=jsonb_build_object('invitationId',(
            SELECT i.id FROM public.dealership_invitations i WHERE i."dealershipId"=v_row->>'targetId' AND i."recipientUserId"=v_row->>'actorId' AND i.role='owner'),'role','owner') AND
            (SELECT count(*) FROM public.audit_logs a WHERE a."targetType"='Dealership' AND a."targetId"=v_row->>'targetId' AND a.action='BUSINESS_INVITATION_REDEEMED' AND a.details->>'role'='owner')=1) OR
          (v_row->>'action'='BUSINESS_SETTINGS_CHANGED' AND v_row->'details' IN ('{"fields":["name"]}'::jsonb,'{"fields":["name","cityId"]}'::jsonb))),false)` : '';
  // Exact sales audit details identify one journal-owned row. Replacement revokes the old invitation
  // without its own audit; only an explicit revoke emits BUSINESS_INVITATION_REVOKED.
  const salesAudit = bootstrapV3 ? ` AND NOT coalesce(TG_OP='INSERT' AND v_row->>'targetType'='Dealership' AND v_row->>'targetId'<>'${rootId}' AND
          EXISTS(SELECT 1 FROM public.dealerships d JOIN "${n}".campaign_records r ON r.table_name='dealerships' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',d.id)
            WHERE d.id=v_row->>'targetId' AND d.status='active' AND d."admissionMode"='synthetic') AND (
          (v_row->>'action' IN ('BUSINESS_INVITATION_CREATED','BUSINESS_INVITATION_REVOKED','BUSINESS_INVITATION_REDEEMED') AND
            EXISTS(SELECT 1 FROM public.dealership_invitations i JOIN "${n}".campaign_records r ON r.table_name='dealership_invitations' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',i.id)
              WHERE i.id=v_row->'details'->>'invitationId' AND i."dealershipId"=v_row->>'targetId' AND i.role='sales' AND
              (SELECT count(*) FROM public.audit_logs a WHERE a."targetType"='Dealership' AND a."targetId"=i."dealershipId" AND a.action=v_row->>'action' AND a.details->>'invitationId'=i.id)=1 AND (
              (v_row->>'action'='BUSINESS_INVITATION_CREATED' AND r.version=1 AND i."revokedAt" IS NULL AND i."redeemedAt" IS NULL AND
                ${ownerMember('i."dealershipId"', "v_row->>'actorId'")} AND ${redeemedInvitation("v_row->>'targetId'", "v_row->>'actorId'")} AND
                v_row->'details'=jsonb_build_object('invitationId',i.id,'role','sales')) OR
              (v_row->>'action'='BUSINESS_INVITATION_REVOKED' AND r.version=2 AND i."revokedAt" IS NOT NULL AND i."redeemedAt" IS NULL AND
                ${ownerMember('i."dealershipId"', "v_row->>'actorId'")} AND ${redeemedInvitation("v_row->>'targetId'", "v_row->>'actorId'")} AND
                v_row->'details'=jsonb_build_object('invitationId',i.id)) OR
              (v_row->>'action'='BUSINESS_INVITATION_REDEEMED' AND r.version=2 AND i."redeemedAt" IS NOT NULL AND i."revokedAt" IS NULL AND
                i."recipientUserId"=v_row->>'actorId' AND v_row->'details'=jsonb_build_object('invitationId',i.id,'role','sales') AND
                EXISTS(SELECT 1 FROM public.dealership_members m JOIN "${n}".campaign_records mr ON mr.table_name='dealership_members' AND NOT mr.deleted AND mr.version=1 AND mr.row_key=jsonb_build_object('id',m.id)
                  WHERE m."dealershipId"=i."dealershipId" AND m."userId"=i."recipientUserId" AND m.role='sales' AND m.status='active'))))) OR
          (v_row->>'action'='BUSINESS_MEMBERSHIP_CHANGED' AND ${ownerMember("v_row->>'targetId'", "v_row->>'actorId'")} AND ${redeemedInvitation("v_row->>'targetId'", "v_row->>'actorId'")} AND
            EXISTS(SELECT 1 FROM public.dealership_members m JOIN "${n}".campaign_records r ON r.table_name='dealership_members' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',m.id)
              WHERE m."dealershipId"=v_row->>'targetId' AND m."userId"=v_row->'details'->>'targetUserId' AND m.role='sales' AND
                v_row->'details'=jsonb_build_object('targetUserId',m."userId",'action',CASE m.status WHEN 'active' THEN 'restore' WHEN 'suspended' THEN 'suspend' END) AND
                r.version=1+(SELECT count(*) FROM public.audit_logs a WHERE a."targetType"='Dealership' AND a."targetId"=m."dealershipId" AND a.action='BUSINESS_MEMBERSHIP_CHANGED' AND a.details->>'targetUserId'=m."userId")))),false)` : '';
  // The audit follows the adopted Dealership and owner invitation. Its actor is a different, currently elevated
  // roster holder of founder.admission; details are exactly the contract-bounded synthetic shape, never a token.
  const admittedAudit = bootstrapV3 ? ` AND NOT coalesce(TG_OP='INSERT' AND v_row->>'action'='BUSINESS_ADMITTED' AND v_row->>'targetType'='Dealership' AND v_row->>'targetId'<>'${rootId}' AND
          EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name='dealerships' AND NOT deleted AND row_key=jsonb_build_object('id',v_row->>'targetId')) AND
          EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'actorId') AND jsonb_typeof(v_row->'details')='object' AND
          (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_row->'details') k)=ARRAY['evidence','mode','reason','verifiedScope'] AND
          v_row->'details'->>'mode'='synthetic' AND v_row->'details'->>'verifiedScope'='Synthetic fixture; no real business verified' AND
          jsonb_typeof(v_row->'details'->'evidence')='string' AND jsonb_typeof(v_row->'details'->'reason')='string' AND char_length(v_row->'details'->>'reason') BETWEEN 3 AND 1000 AND
          EXISTS(SELECT 1 FROM public.dealerships d WHERE d.id=v_row->>'targetId' AND d."checkedEvidence"=v_row->'details'->>'evidence') AND
          EXISTS(SELECT 1 FROM public.dealership_invitations i JOIN "${n}".campaign_records r ON r.table_name='dealership_invitations' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',i.id)
            WHERE i."dealershipId"=v_row->>'targetId' AND i.role='owner' AND i."recipientUserId"<>v_row->>'actorId') AND
          (SELECT count(*) FROM public.audit_logs a WHERE a."targetType"='Dealership' AND a."targetId"=v_row->>'targetId' AND a.action='BUSINESS_ADMITTED')=1 AND
          EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=v_row->>'actorId' AND g.capability='founder.admission' AND g."revokedAt" IS NULL) AND
          EXISTS(SELECT 1 FROM public.sessions s JOIN "${n}".campaign_records r ON r.table_name='sessions' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',s.id)
            WHERE s."userId"=v_row->>'actorId' AND s."expiresAt">(now() AT TIME ZONE 'UTC') AND s."adminTotpExpiresAt">(now() AT TIME ZONE 'UTC')),false)` : '';
  const deliveryInventory = (pendingOtp = '') => bootstrapV3 ? `
    IF (SELECT delivery_hash FROM "${n}".campaign_manifest) IS DISTINCT FROM
      (SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY request_id),'[]'::jsonb)::text) FROM "${n}".campaign_delivery_ledger d) OR
      EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger d WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities e WHERE e.email=d.email) OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',d.request_id) AND (NOT r.deleted OR (SELECT state FROM "${n}".campaign_manifest)<>'identities'))) OR
      EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND ((r.deleted AND (SELECT state FROM "${n}".campaign_manifest)='identities') OR (NOT EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger d WHERE r.row_key=jsonb_build_object('id',d.request_id)) AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_sms_ledger d WHERE r.row_key=jsonb_build_object('id',d.request_id))))) OR
      EXISTS(SELECT 1 FROM "${n}".campaign_delivery_sink s WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger d WHERE d.request_id=s.request_id AND d.email=s.email))
      THEN RAISE EXCEPTION 'Campaign delivery journal changed'; END IF;${smsInventory(pendingOtp)}` : '';
  const salesInventory = bootstrapV3 ? `
    IF (SELECT state FROM "${n}".campaign_manifest)='identities' AND (
      EXISTS(SELECT 1 FROM public.dealership_invitations i JOIN "${n}".campaign_records r ON r.table_name='dealership_invitations' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',i.id)
        WHERE i.role='sales' AND i."dealershipId"<>'${rootId}' AND (
          r.version<>(CASE WHEN i."revokedAt" IS NULL AND i."redeemedAt" IS NULL THEN 1 ELSE 2 END) OR (i."revokedAt" IS NOT NULL AND i."redeemedAt" IS NOT NULL) OR
          (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records ar ON ar.table_name='audit_logs' AND NOT ar.deleted AND ar.version=1 AND ar.row_key=jsonb_build_object('id',a.id)
            WHERE a."targetType"='Dealership' AND a."targetId"=i."dealershipId" AND a.action='BUSINESS_INVITATION_CREATED' AND a.details=jsonb_build_object('invitationId',i.id,'role','sales'))<>1 OR
          (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records ar ON ar.table_name='audit_logs' AND NOT ar.deleted AND ar.version=1 AND ar.row_key=jsonb_build_object('id',a.id)
            WHERE a."targetType"='Dealership' AND a."targetId"=i."dealershipId" AND a.action='BUSINESS_INVITATION_REDEEMED' AND a."actorId"=i."recipientUserId" AND a.details=jsonb_build_object('invitationId',i.id,'role','sales'))<>(CASE WHEN i."redeemedAt" IS NULL THEN 0 ELSE 1 END) OR
          (i."revokedAt" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.audit_logs a JOIN "${n}".campaign_records ar ON ar.table_name='audit_logs' AND NOT ar.deleted AND ar.version=1 AND ar.row_key=jsonb_build_object('id',a.id)
            WHERE a."targetType"='Dealership' AND a."targetId"=i."dealershipId" AND a.action='BUSINESS_INVITATION_REVOKED' AND a.details=jsonb_build_object('invitationId',i.id)) AND
            NOT EXISTS(SELECT 1 FROM public.dealership_invitations successor JOIN "${n}".campaign_records sr ON sr.table_name='dealership_invitations' AND NOT sr.deleted AND sr.row_key=jsonb_build_object('id',successor.id)
              WHERE successor."dealershipId"=i."dealershipId" AND successor."recipientUserId"=i."recipientUserId" AND successor.role='sales' AND
                (SELECT min(sequence) FROM "${n}".campaign_events WHERE table_name='dealership_invitations' AND row_key=sr.row_key AND mutation='INSERT')>
                (SELECT max(sequence) FROM "${n}".campaign_events WHERE table_name='dealership_invitations' AND row_key=r.row_key AND mutation='UPDATE'))))) OR
      EXISTS(SELECT 1 FROM public.dealership_members m JOIN "${n}".campaign_records r ON r.table_name='dealership_members' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',m.id)
        WHERE m.role='sales' AND m."dealershipId"<>'${rootId}' AND (NOT ${redeemedSalesInvitation('m."dealershipId"', 'm."userId"')} OR
          r.version<>1+(SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records ar ON ar.table_name='audit_logs' AND NOT ar.deleted AND ar.version=1 AND ar.row_key=jsonb_build_object('id',a.id)
            WHERE a."targetType"='Dealership' AND a."targetId"=m."dealershipId" AND a.action='BUSINESS_MEMBERSHIP_CHANGED' AND a.details->>'targetUserId'=m."userId"))))
      THEN RAISE EXCEPTION 'Campaign sales audit mismatch'; END IF;` : '';
  const authInventory = bootstrapV3 ? `
    IF EXISTS(SELECT 1 FROM public.otp_requests o JOIN "${n}".campaign_entities e ON (o.destination=e.email OR o."userId"=e.user_id) WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',o.id) AND NOT r.deleted))
    THEN RAISE EXCEPTION 'Campaign authentication slice unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM public.totp_enrollments t JOIN "${n}".campaign_entities e ON t."userId"=e.user_id WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='totp_enrollments' AND r.row_key=jsonb_build_object('id',t.id) AND NOT r.deleted)) OR
      EXISTS(SELECT 1 FROM public.totp_backup_codes b JOIN public.totp_enrollments t ON b."totpEnrollmentId"=t.id JOIN "${n}".campaign_entities e ON t."userId"=e.user_id WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='totp_backup_codes' AND r.row_key=jsonb_build_object('id',b.id) AND NOT r.deleted))
    THEN RAISE EXCEPTION 'Untracked campaign TOTP'; END IF;
    IF EXISTS(SELECT 1 FROM public.sessions s JOIN "${n}".campaign_entities e ON s."userId"=e.user_id WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='sessions' AND r.row_key=jsonb_build_object('id',s.id) AND NOT r.deleted))
    THEN RAISE EXCEPTION 'Untracked campaign session'; END IF;
    IF (SELECT state FROM "${n}".campaign_manifest)='identities' AND EXISTS(SELECT 1 FROM "${n}".campaign_records g WHERE g.table_name='staff_grants' AND NOT g.deleted AND
      g.version IS DISTINCT FROM (CASE WHEN ${bootstrapGrant('g.row_key')} THEN 1 ELSE (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',a.id)
        WHERE a.action IN ('STAFF_CAPABILITY_GRANTED','STAFF_CAPABILITY_REVOKED') AND a."targetId"=g.row_key->>'userId' AND a.details->>'capability'=g.row_key->>'capability') END))
    THEN RAISE EXCEPTION 'Campaign grant audit mismatch'; END IF;
    IF (SELECT state FROM "${n}".campaign_manifest)='identities' AND EXISTS(SELECT 1 FROM "${n}".campaign_records d WHERE d.table_name='dealerships' AND NOT d.deleted AND d.row_key<>jsonb_build_object('id','${rootId}') AND (d.version<>1+(SELECT count(*) FROM "${n}".campaign_events ce WHERE ce.table_name='dealerships' AND ce.row_key=d.row_key AND ce.contact_phone)+(SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND NOT r.deleted AND r.version=1 AND r.row_key=jsonb_build_object('id',a.id) WHERE a."targetType"='Dealership' AND a."targetId"=d.row_key->>'id' AND (a.action='BUSINESS_SETTINGS_CHANGED' OR (a.action='BUSINESS_INVITATION_REDEEMED' AND a.details->>'role'='owner'))) OR
      (SELECT count(*) FROM public.dealership_invitations i JOIN "${n}".campaign_records r ON r.table_name='dealership_invitations' AND NOT r.deleted AND r.version=CASE WHEN i."redeemedAt" IS NULL THEN 1 ELSE 2 END AND r.row_key=jsonb_build_object('id',i.id) WHERE i."dealershipId"=d.row_key->>'id' AND i.role='owner' AND i."revokedAt" IS NULL AND
        ((i."redeemedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM public.dealership_members m WHERE m."dealershipId"=i."dealershipId")) OR
         (i."redeemedAt" IS NOT NULL AND ${ownerMember('i."dealershipId"', 'i."recipientUserId"')} AND
          (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records ar ON ar.table_name='audit_logs' AND NOT ar.deleted AND ar.version=1 AND ar.row_key=jsonb_build_object('id',a.id) WHERE a."targetType"='Dealership' AND a."targetId"=i."dealershipId" AND a.action='BUSINESS_INVITATION_REDEEMED' AND a.details->>'role'='owner')=1)))<>1 OR
      (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',a.id) WHERE a."targetType"='Dealership' AND a."targetId"=d.row_key->>'id' AND a.action='BUSINESS_ADMITTED')<>1))
    THEN RAISE EXCEPTION 'Campaign admission audit mismatch'; END IF;${salesInventory}` : '';
  // Only these columns convey graph ownership. Catalog references never do.
  const parents = { businessId: 'dealerships', dealershipId: 'dealerships', sellerId: 'users', userId: 'users', buyerId: 'users', recipientUserId: 'users', senderId: 'users', blockerId: 'users', blockedId: 'users', conversationId: 'conversations', listingId: 'listings', reporterUserId: 'users', reviewedById: 'users', actorId: 'users', assigneeId: 'users', previousAssigneeId: 'users', lastEditedById: 'users', suspendedById: 'users', lastMessageId: 'messages', firstBuyerMessageId: 'messages', firstSellerReplyId: 'messages' };
  if (bootstrapV3) parents.totpEnrollmentId = 'totp_enrollments';
  // V3 verification binds a consumed destination-only code once to its roster User.
  // The OTP guard requires that User to own the destination.
  const otpBinding = bootstrapV3 ? ` AND NOT (TG_TABLE_NAME='otp_requests' AND e.key='userId' AND prior->>'userId' IS NULL AND prior->>'verifiedAt' IS NOT NULL)` : '';
  // The ordinary command updates role before inserting its audit. Check their
  // final pairing at commit, without manufacturing a receipt or another event.
  const promotionAuditShape = row => `${row}->>'action'='ADMIN_BOOTSTRAP_PROMOTE' AND ${row}->>'targetType'='user' AND
          ${row}->>'targetId'='${coordinator.id}' AND ${row}->>'actorId' IS NULL AND
          jsonb_typeof(${row}->'details'->'reason')='string' AND char_length(${row}->'details'->>'reason') BETWEEN 1 AND 1000 AND
          ${row}->'details'=jsonb_build_object('reason',${row}->'details'->>'reason','before',jsonb_build_object('role','buyer'),'after',jsonb_build_object('role','admin'))`;
  const promotionInventory = bootstrapV3 ? `
    IF (SELECT state FROM "${n}".campaign_manifest)='identities' AND (
      EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON e.user_id=u.id
        WHERE u.role<>'buyer' AND (u.id<>'${coordinator.id}' OR u.role<>'admin')) OR
      (SELECT count(*) FROM public.users WHERE id='${coordinator.id}' AND role='admin')<>
      (SELECT count(*) FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND NOT r.deleted AND r.version=1 AND r.row_key=jsonb_build_object('id',a.id)
        WHERE ${promotionAuditShape('to_jsonb(a)')})) THEN RAISE EXCEPTION 'Campaign promotion audit required'; END IF;` : '';
  const promotionAudit = bootstrapV3 ? ` AND NOT coalesce(TG_OP='INSERT' AND ${promotionAuditShape('v_row')} AND
          current_setting('autotm.admin_promote_candidate',true)='${input.candidate}' AND
          EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_records r ON r.table_name='users' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',u.id) AND r.row_hash=md5(to_jsonb(u)::text) WHERE u.id='${coordinator.id}' AND u.role='admin') AND
          (SELECT count(*) FROM public.audit_logs a WHERE a.action='ADMIN_BOOTSTRAP_PROMOTE' AND a."targetId"='${coordinator.id}')=1,false)` : '';
  const promotionRole = bootstrapV3 ? `
        IF TG_TABLE_NAME='users' AND TG_OP='UPDATE' AND v_row->'role' IS DISTINCT FROM prior->'role' AND NOT coalesce(
          v_row->>'id'='${coordinator.id}' AND prior->>'role'='buyer' AND v_row->>'role'='admin' AND
          current_setting('autotm.admin_promote_candidate',true)='${input.candidate}' AND
          v_row-'role'-'updatedAt' IS NOT DISTINCT FROM prior-'role'-'updatedAt' AND
          NOT EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.action='ADMIN_BOOTSTRAP_PROMOTE' AND a."targetId"='${coordinator.id}'),false)
          THEN RAISE EXCEPTION 'Unsupported campaign promotion'; END IF;` : '';
  const immutable = ['id', 'userId', 'sellerId', 'buyerId', 'recipientUserId', 'senderId', 'blockerId', 'blockedId', 'conversationId', 'listingId', 'businessId', 'dealershipId', 'reporterUserId', 'capability', 'targetId', 'targetType', 'phone', 'tokenHash'];
  const identityValues = identities.map(identity => `('${identity.alias}','${identity.id}','${identity.email}')`).join(',');
  const tableNames = tables.map(t => `'${t}'`).join(',');
  const relationIds = tables.map(t => `'public.${t}'::regclass`).join(',');
  // Ordinary writes first acquire their implicit table lock, then the fence in
  // the trigger. Reset uses this same order, never fence-before-table.
  const lock = `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s';
    LOCK TABLE ${tables.map(t => `public.${t}`).sort().join(',')} IN SHARE ROW EXCLUSIVE MODE;
    DO $locks$ DECLARE source record; BEGIN
      FOR source IN SELECT DISTINCT ns.nspname,cl.relname FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE c.contype='f' AND c.confrelid IN (${relationIds}) ORDER BY ns.nspname,cl.relname LOOP
        EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',source.nspname,source.relname);
      END LOOP;
    END $locks$;
    SELECT pg_advisory_xact_lock(hashtextextended('${n}',0));`;
  // Setup DDL alone adds this lock, after the existing table locks and before the namespace fence.
  // Concurrent application writes can deadlock here; PostgreSQL rolls back, with no retry.
  const setupLock = bootstrapV3 ? lock.replace('SELECT pg_advisory_xact_lock', 'LOCK TABLE public.measurement_state IN SHARE ROW EXCLUSIVE MODE;\n    SELECT pg_advisory_xact_lock') : lock;
  const key = (row, table) => table === 'staff_grants' ? `jsonb_build_object('userId',${row}->>'userId','capability',${row}->>'capability')` : `jsonb_build_object('id',${row}->>'id')`;
  const schemaHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum)::text,'')) FROM
    (SELECT attrelid,attnum,attname,atttypid,attnotnull,attgenerated FROM pg_attribute WHERE attrelid IN (${relationIds}) AND attnum>0 AND NOT attisdropped) a)`;
  const journalHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(journal_row) ORDER BY table_name,row_key),'[]'::jsonb)::text) FROM "${n}".campaign_records journal_row)`;
  const eventHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(event_row) ORDER BY sequence),'[]'::jsonb)::text) FROM "${n}".campaign_events event_row)`;
  const binding = `DO $guard$ BEGIN
    IF (SELECT count(*) FROM "${n}".campaign_manifest) <> 1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}' AND delivery_version=${version}) THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_entities) <> 15 OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN (${identityValues})) THEN RAISE EXCEPTION 'Campaign roster changed'; END IF;
  END $guard$;`;
  const integrity = `${binding} DO $guard$ DECLARE entry record; actual jsonb; BEGIN
    IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE schema_hash=${schemaHash} AND journal_hash=${journalHash} AND event_hash=${eventHash}
      AND tracking_hash=md5(pg_get_functiondef('"${n}".track_business()'::regprocedure))) THEN RAISE EXCEPTION 'Campaign journal or schema changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_records)>128 OR (SELECT count(*) FROM "${n}".campaign_events)>2048 THEN RAISE EXCEPTION 'Campaign journal limit'; END IF;
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE t.tgname='${n}_business' AND t.tgenabled='O' AND t.tgtype=29 AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''::int2vector AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tgisinternal AND ns.nspname='${n}' AND p.proname='track_business' AND t.tgrelid IN (${relationIds}))<>${tables.length}
      THEN RAISE EXCEPTION 'Missing campaign tracking'; END IF;${bootstrapV3 ? `
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE t.tgname='${n}_baseline' AND t.tgrelid='public.measurement_state'::regclass AND t.tgenabled='O' AND t.tgtype=9 AND t.tgqual IS NOT NULL AND
        t.tgnargs=0 AND t.tgattr=''::int2vector AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tgisinternal AND ns.nspname='${n}' AND p.proname='track_business' AND
        md5(pg_get_triggerdef(t.oid))=(SELECT baseline_trigger_hash FROM "${n}".campaign_manifest))<>1 THEN RAISE EXCEPTION 'Campaign baseline tracking changed'; END IF;` : ''}
${bootstrapV3 ? `    IF (SELECT count(*) FROM pg_trigger t WHERE t.tgname='${n}_promotion' AND t.tgrelid IN ('public.users'::regclass,'public.audit_logs'::regclass) AND
      t.tgfoid='"${n}".track_business()'::regprocedure AND t.tgenabled='O' AND t.tgtype=CASE WHEN t.tgrelid='public.users'::regclass THEN 17 ELSE 29 END AND t.tgqual IS NULL AND t.tgnargs=1 AND
      t.tgargs=decode('70726f6d6f74696f6e00','hex') AND t.tgattr=''::int2vector AND t.tgconstraint<>0 AND t.tgdeferrable AND t.tginitdeferred AND NOT t.tgisinternal)<>2
      THEN RAISE EXCEPTION 'Campaign promotion tracking changed'; END IF;${promotionInventory}
` : ''}    FOR entry IN SELECT * FROM "${n}".campaign_records LOOP
      IF entry.table_name NOT IN (${tableNames}) OR entry.row_key IS DISTINCT FROM (CASE WHEN entry.table_name='staff_grants' THEN jsonb_build_object('userId',entry.row_key->>'userId','capability',entry.row_key->>'capability') ELSE jsonb_build_object('id',entry.row_key->>'id') END) OR
        EXISTS(SELECT 1 FROM jsonb_each(entry.row_key) e WHERE e.value='null'::jsonb) THEN RAISE EXCEPTION 'Unknown campaign row key'; END IF;
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE to_jsonb(t) @> $1',entry.table_name) INTO actual USING entry.row_key;
      IF (entry.deleted AND actual IS NOT NULL) OR (NOT entry.deleted AND (actual IS NULL OR md5(actual::text) IS DISTINCT FROM entry.row_hash)) THEN RAISE EXCEPTION 'Untracked campaign mutation'; END IF;
      IF entry.version<>(SELECT count(*) FROM "${n}".campaign_events e WHERE e.table_name=entry.table_name AND e.row_key=entry.row_key) OR NOT EXISTS(
        SELECT 1 FROM (SELECT * FROM "${n}".campaign_events e WHERE e.table_name=entry.table_name AND e.row_key=entry.row_key ORDER BY sequence DESC LIMIT 1) e
        WHERE e.row_hash=entry.row_hash AND (e.mutation='DELETE')=entry.deleted) THEN RAISE EXCEPTION 'Campaign event authority changed'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM "${n}".campaign_events e WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name=e.table_name AND r.row_key=e.row_key)) THEN RAISE EXCEPTION 'Orphan campaign event'; END IF;
    IF EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id OR u.email=e.email WHERE NOT EXISTS(
      SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='users' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',u.id))) OR
      EXISTS(SELECT 1 FROM public.dealerships d WHERE (id='${rootId}' OR slug='${rootSlug}' OR "contactPhone"='${rootContact}') AND NOT EXISTS(
      SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='dealerships' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',d.id))) THEN RAISE EXCEPTION 'Untracked campaign root'; END IF;${authInventory}${deliveryInventory()}
  END $guard$;`;
  // Inventory every incoming FK using OIDs and catalog column names, including
  // non-public sources and composite/non-ID targets. No cascade grants ownership.
  const preflight = `DO $guard$ DECLARE entry record; fk record; foreign_rows bigint; condition text; BEGIN
    IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN ('r','p','f') AND ns.nspname NOT IN ('public','information_schema') AND ns.nspname NOT LIKE 'pg_%' AND ns.nspname !~ '^cf_[a-f0-9]{32}$') THEN RAISE EXCEPTION 'Unknown application schema'; END IF;
    -- Budget cleanup events before the first deletion. A cap cannot interrupt
    -- disposal after a prefix of rows has already been removed.
    IF (SELECT state FROM "${n}".campaign_manifest)<>'disposed' AND (SELECT count(*) FROM "${n}".campaign_events)+(SELECT count(*) FROM "${n}".campaign_records WHERE NOT deleted${bootstrapV3 ? '' : " AND table_name<>'audit_logs'"})${bootstrapV3 ? '' : '+2'}>2048 THEN RAISE EXCEPTION 'Campaign cleanup event budget'; END IF;
    FOR entry IN SELECT * FROM "${n}".campaign_records WHERE NOT deleted LOOP
      FOR fk IN SELECT c.*,ns.nspname source_schema,cl.relname source_table FROM pg_constraint c
        JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE c.contype='f' AND c.confrelid=format('public.%I',entry.table_name)::regclass LOOP
        IF cardinality(fk.conkey)<>1 OR cardinality(fk.confkey)<>1 OR
          (SELECT attname FROM pg_attribute WHERE attrelid=fk.confrelid AND attnum=fk.confkey[1])<>'id' THEN RAISE EXCEPTION 'Unsupported composite or non-ID campaign reference'; END IF;
        SELECT string_agg(format('to_jsonb(child)->%L=to_jsonb(parent)->%L',sa.attname,ta.attname),' AND ' ORDER BY u.ordinality) INTO condition
          FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY u(source_num,target_num,ordinality)
          JOIN pg_attribute sa ON sa.attrelid=fk.conrelid AND sa.attnum=u.source_num
          JOIN pg_attribute ta ON ta.attrelid=fk.confrelid AND ta.attnum=u.target_num;
        EXECUTE format('SELECT count(*) FROM %I.%I child JOIN public.%I parent ON %s WHERE to_jsonb(parent) @> $1 AND NOT EXISTS(
          SELECT 1 FROM "${n}".campaign_records owned WHERE $2=''public'' AND owned.table_name=$3 AND NOT owned.deleted AND
          owned.row_key=CASE WHEN $3=''staff_grants'' THEN jsonb_build_object(''userId'',to_jsonb(child)->>''userId'',''capability'',to_jsonb(child)->>''capability'') ELSE jsonb_build_object(''id'',to_jsonb(child)->>''id'') END)',fk.source_schema,fk.source_table,entry.table_name,condition)
          INTO foreign_rows USING entry.row_key,fk.source_schema,fk.source_table;
        IF foreign_rows<>0 THEN RAISE EXCEPTION 'Foreign campaign reference'; END IF;
      END LOOP;
    END LOOP;
    -- Scalar, polymorphic and JSON references have no FK. Inspect all relations
    -- under table locks, refusing unsupported storage edges even after unlinking.
    ${['content_reports', 'audit_logs'].map(t => `IF EXISTS(SELECT 1 FROM public.${t} x JOIN "${n}".campaign_records r ON x."targetId"=r.row_key->>'id' WHERE NOT EXISTS(SELECT 1 FROM "${n}".campaign_records owned WHERE owned.table_name='${t}' AND NOT owned.deleted AND owned.row_key=jsonb_build_object('id',x.id))) THEN RAISE EXCEPTION 'Foreign polymorphic reference'; END IF;`).join('\n')}
    ${['listing_drafts', 'messages', 'content_reports', 'notification_preferences'].map(t => `IF EXISTS(SELECT 1 FROM public.${t} x CROSS JOIN "${n}".campaign_records parent WHERE parent.row_key ? 'id' AND
      ${({'listing_drafts':`x.payload`, 'messages':`x.metadata`, 'content_reports':`x."messageContext"`, 'notification_preferences':`x."optOuts"`})[t]}::text LIKE '%'||(parent.row_key->>'id')||'%' AND NOT EXISTS(
      SELECT 1 FROM "${n}".campaign_records owned WHERE owned.table_name='${t}' AND NOT owned.deleted AND owned.row_key=jsonb_build_object('id',x.id))) THEN RAISE EXCEPTION 'Foreign JSON graph reference'; END IF;`).join('\n')}
  END $guard$;`;
  const setup = `CREATE SCHEMA "${n}";
    CREATE TABLE "${n}".campaign_manifest(reservation_id text PRIMARY KEY,candidate text NOT NULL,profile text NOT NULL,state text NOT NULL CHECK(state IN ('identities','cleaning','disposed')),delivery_version integer NOT NULL DEFAULT ${version},${bootstrapV3 ? "sms_hash text,sms_schema_hash text,sms_contract_hash text,delivery_hash text NOT NULL DEFAULT md5('[]'),baseline_trigger_hash text," : ''}schema_hash text NOT NULL,journal_hash text NOT NULL DEFAULT md5('[]'),event_hash text NOT NULL DEFAULT md5('[]'),tracking_hash text);
    INSERT INTO "${n}".campaign_manifest(reservation_id,candidate,profile,state,delivery_version,schema_hash) VALUES('${input.id}','${input.candidate}','${profile}','identities',${version},${schemaHash});
    CREATE TABLE "${n}".campaign_entities(alias text PRIMARY KEY,user_id text UNIQUE NOT NULL,email text UNIQUE NOT NULL);
    INSERT INTO "${n}".campaign_entities VALUES ${identityValues};
    CREATE TABLE "${n}".campaign_records(table_name text NOT NULL,row_key jsonb NOT NULL,row_hash text NOT NULL,version bigint NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(table_name,row_key));
    CREATE TABLE "${n}".campaign_events(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,table_name text NOT NULL,row_key jsonb NOT NULL,mutation text NOT NULL CHECK(mutation IN ('INSERT','UPDATE','DELETE')),row_hash text NOT NULL${bootstrapV3 ? ',contact_phone boolean NOT NULL DEFAULT false' : ''});
    ${bootstrapV3 ? `CREATE TABLE "${n}".campaign_delivery_ledger(request_id text PRIMARY KEY,email text NOT NULL,UNIQUE(request_id,email));
    CREATE TABLE "${n}".campaign_delivery_sink(request_id text PRIMARY KEY,email text NOT NULL,message jsonb NOT NULL,
      FOREIGN KEY(request_id,email) REFERENCES "${n}".campaign_delivery_ledger(request_id,email));
    CREATE TABLE "${n}".campaign_sms_binding(reservation_id text PRIMARY KEY,candidate text NOT NULL,destination text NOT NULL,business_id text,owner_id text);
    INSERT INTO "${n}".campaign_sms_binding VALUES('${input.id}','${input.candidate}','${contactPhone}',NULL,NULL);
    CREATE TABLE "${n}".campaign_sms_ledger(request_id text PRIMARY KEY,reservation_id text NOT NULL REFERENCES "${n}".campaign_sms_binding(reservation_id),candidate text NOT NULL,destination text NOT NULL,business_id text NOT NULL,owner_id text NOT NULL,purpose text NOT NULL,code_hash text NOT NULL,issue_row_hash text NOT NULL);
    CREATE TABLE "${n}".campaign_sms_sink(request_id text PRIMARY KEY REFERENCES "${n}".campaign_sms_ledger(request_id),message text NOT NULL);
    CREATE FUNCTION "${n}".campaign_sms_authority(request text,destination text,code_hash text,candidate text) RETURNS boolean LANGUAGE sql AS $sms$
      SELECT count(*)=1 FROM "${n}".campaign_manifest m
      JOIN "${n}".campaign_sms_binding b ON b.reservation_id=m.reservation_id AND b.candidate=m.candidate
      JOIN "${n}".campaign_sms_ledger l ON l.reservation_id=b.reservation_id AND l.candidate=b.candidate AND l.destination=b.destination AND l.business_id=b.business_id AND l.owner_id=b.owner_id
      JOIN public.otp_requests o ON o.id=l.request_id AND o.destination=l.destination AND o.phone=l.destination AND o."codeHash"=l.code_hash AND o."userId"=l.owner_id AND o."businessId"=l.business_id AND o.purpose='listing_contact_phone' AND o.channel='phone'
      JOIN "${n}".campaign_records r ON r.table_name='otp_requests' AND r.row_key=jsonb_build_object('id',o.id) AND NOT r.deleted AND r.row_hash=md5(to_jsonb(o)::text)
      JOIN "${n}".campaign_events e ON e.table_name='otp_requests' AND e.row_key=r.row_key AND e.mutation='INSERT' AND e.row_hash=l.issue_row_hash
      JOIN public.users u ON u.id=b.owner_id AND u.phone IS NULL AND u."suspendedAt" IS NULL AND u."deletionScheduledAt" IS NULL
      JOIN "${n}".campaign_records ur ON ur.table_name='users' AND ur.row_key=jsonb_build_object('id',u.id) AND NOT ur.deleted AND ur.row_hash=md5(to_jsonb(u)::text)
      WHERE (SELECT count(*) FROM "${n}".campaign_manifest)=1 AND (SELECT count(*) FROM "${n}".campaign_sms_binding)=1 AND
        (SELECT count(*) FROM "${n}".campaign_entities)=15 AND EXISTS(SELECT 1 FROM "${n}".campaign_entities ce WHERE ce.alias='buyer-a' AND ce.user_id=b.owner_id AND ce.email='${contactOwner.email}') AND
        m.state='identities' AND m.profile='campaign897-full-v3' AND m.delivery_version=3 AND m.reservation_id='${input.id}' AND m.candidate='${input.candidate}' AND m.candidate=$4 AND
        b.destination='${contactPhone}' AND b.owner_id='${contactOwner.id}' AND l.request_id=$1 AND l.destination=$2 AND l.code_hash=$3 AND l.purpose='listing_contact_phone' AND
        o."verifiedAt" IS NULL AND o."expiresAt">(now() AT TIME ZONE 'UTC') AND o.attempts<5 AND ${contactBusiness('b.business_id')} AND
        EXISTS(SELECT 1 FROM public.dealerships d JOIN "${n}".campaign_records dr ON dr.table_name='dealerships' AND NOT dr.deleted AND dr.row_key=jsonb_build_object('id',d.id) AND dr.row_hash=md5(to_jsonb(d)::text) WHERE d.id=b.business_id) AND
        NOT EXISTS(SELECT 1 FROM public.dealership_members cm JOIN "${n}".campaign_records cr ON cr.table_name='dealership_members' AND cr.row_key=jsonb_build_object('id',cm.id) WHERE cm."dealershipId"=b.business_id AND cm."userId"=b.owner_id AND (cr.deleted OR cr.row_hash<>md5(to_jsonb(cm)::text))) AND
        m.sms_hash=${smsHash} AND m.sms_schema_hash=${smsSchemaHash} AND m.journal_hash=${journalHash} AND m.event_hash=${eventHash} AND
        m.tracking_hash=md5(pg_get_functiondef(to_regprocedure('"${n}".track_business()'))) AND
        m.sms_contract_hash=md5(pg_get_functiondef(to_regprocedure('"${n}".campaign_sms_authority(text,text,text,text)')))
    $sms$;
    UPDATE "${n}".campaign_manifest SET sms_hash=${smsHash},sms_schema_hash=${smsSchemaHash},sms_contract_hash=md5(pg_get_functiondef('"${n}".campaign_sms_authority(text,text,text,text)'::regprocedure));
    ` : ''}CREATE FUNCTION "${n}".track_business() RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE v_row jsonb; prior jsonb; rowkey jsonb; oldkey jsonb; edge record; parent_table text; lifecycle text; owned boolean; fingerprint text;${bootstrapV3 ? ' adopted jsonb; admitting boolean := false;' : ''}
    BEGIN${bootstrapV3 ? `
      IF TG_NARGS=1 AND TG_ARGV[0]='promotion' THEN
        ${promotionInventory}
        RETURN NULL;
      END IF;
      IF TG_TABLE_NAME='measurement_state' THEN
        IF EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted AND objsubid=1 AND
          ((classid::bigint<<32)|objid::bigint)=hashtextextended('${n}',0)) THEN RAISE EXCEPTION 'Campaign shared baseline preserved'; END IF;
        RETURN NULL;
      END IF;` : ''}
      v_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      prior := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
      rowkey := CASE WHEN TG_TABLE_NAME='staff_grants' THEN ${key('v_row','staff_grants')} ELSE ${key('v_row','users')} END;
      oldkey := CASE WHEN TG_TABLE_NAME='staff_grants' THEN ${key('prior','staff_grants')} ELSE ${key('prior','users')} END;
      SELECT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key IN (rowkey,oldkey)) INTO owned;
      IF TG_TABLE_NAME='users' THEN
        owned := owned OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id IN (v_row->>'id',prior->>'id') OR email IN (v_row->>'email',prior->>'email'));
      ELSIF TG_TABLE_NAME='dealerships' THEN
        owned := owned OR v_row->>'id'='${rootId}' OR prior->>'id'='${rootId}' OR v_row->>'slug'='${rootSlug}' OR prior->>'slug'='${rootSlug}' OR v_row->>'contactPhone'='${rootContact}' OR prior->>'contactPhone'='${rootContact}';
      ${bootstrapV3 ? `ELSIF TG_TABLE_NAME='otp_requests' THEN
        owned := owned OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE email IN (v_row->>'destination',prior->>'destination') OR user_id IN (v_row->>'userId',prior->>'userId'));
      ` : ''}ELSE
        FOR edge IN SELECT * FROM jsonb_each_text('${JSON.stringify(parents)}'::jsonb) LOOP
          -- Foreign reporters targeting an owned listing remain foreign. Reset
          -- detects and refuses them before touching the owned graph.
          IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=edge.value AND row_key->>'id' IN (v_row->>edge.key,prior->>edge.key)) THEN owned := true; END IF;
        END LOOP;
        IF TG_TABLE_NAME='audit_logs' AND v_row->>'targetType'${bootstrapV3 ? " IN ('User','user')" : "='User'"} AND EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'targetId') THEN owned := true; END IF;
      END IF;${phoneGuard}${admissionSlot}
      IF NOT coalesce(owned,false) THEN RETURN NULL; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('${n}',0));
      SELECT state INTO lifecycle FROM "${n}".campaign_manifest;${bootstrapV3 ? `
      IF (SELECT count(*) FROM "${n}".campaign_manifest)<>1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}' AND delivery_version=3) OR (SELECT count(*) FROM "${n}".campaign_entities)<>15 OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN (${identityValues})) THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
      -- Normal pending enrollment, one first verification and its ten single-use backup codes only.
      -- Secret rows leave only by locked disposal; reset and re-enrollment stay unsupported.
      IF TG_TABLE_NAME IN ('totp_enrollments','totp_backup_codes') AND ((TG_OP='DELETE' AND lifecycle='identities') OR
        (TG_TABLE_NAME='totp_enrollments' AND TG_OP<>'DELETE' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'userId') OR (TG_OP='INSERT' AND v_row->>'verifiedAt' IS NOT NULL) OR
          (TG_OP='UPDATE' AND (prior->>'verifiedAt' IS NOT NULL OR v_row->>'verifiedAt' IS NULL OR v_row-'verifiedAt'-'updatedAt' IS DISTINCT FROM prior-'verifiedAt'-'updatedAt')))) OR
        (TG_TABLE_NAME='totp_backup_codes' AND TG_OP<>'DELETE' AND (NOT EXISTS(SELECT 1 FROM public.totp_enrollments t JOIN "${n}".campaign_entities e ON e.user_id=t."userId" WHERE t.id=v_row->>'totpEnrollmentId' AND t."verifiedAt" IS NOT NULL) OR
          (SELECT count(*) FROM public.totp_backup_codes WHERE "totpEnrollmentId"=v_row->>'totpEnrollmentId')>10 OR (TG_OP='INSERT' AND v_row->>'usedAt' IS NOT NULL) OR
          (TG_OP='UPDATE' AND (prior->>'usedAt' IS NOT NULL OR v_row->>'usedAt' IS NULL OR v_row-'usedAt' IS DISTINCT FROM prior-'usedAt'))))) THEN RAISE EXCEPTION 'Unsupported campaign TOTP'; END IF;
      IF TG_TABLE_NAME='otp_requests' AND NOT coalesce((lifecycle='identities' AND TG_OP<>'DELETE' AND ${contactOtp('v_row')}) OR (lifecycle='cleaning' AND TG_OP='DELETE' AND EXISTS(SELECT 1 FROM "${n}".campaign_sms_ledger WHERE request_id=v_row->>'id' AND destination=v_row->>'destination' AND code_hash=v_row->>'codeHash')),false) AND ((TG_OP='DELETE' AND lifecycle='identities') OR v_row->>'businessId' IS NOT NULL OR v_row->>'phone' IS NOT NULL OR v_row->>'purpose'<>'sign_in' OR v_row->>'channel'<>'email' OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE email=v_row->>'destination') OR (v_row->>'userId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'userId' AND email=v_row->>'destination')) OR (TG_OP='UPDATE' AND v_row->>'destination' IS DISTINCT FROM prior->>'destination')) THEN RAISE EXCEPTION 'Unsupported campaign OTP'; END IF;
      IF lifecycle='identities' AND TG_TABLE_NAME='otp_requests' AND v_row->>'channel'='phone' AND (
        (TG_OP='INSERT' AND (v_row->>'verifiedAt' IS NOT NULL OR (v_row->>'attempts')::int<>0)) OR
        (TG_OP='UPDATE' AND NOT coalesce(v_row-'attempts'-'verifiedAt'-'updatedAt' IS NOT DISTINCT FROM prior-'attempts'-'verifiedAt'-'updatedAt' AND prior->>'verifiedAt' IS NULL AND
          (((v_row->>'attempts')::int=(prior->>'attempts')::int+1 AND (v_row->>'attempts')::int<=5 AND v_row->>'verifiedAt' IS NULL) OR
           (v_row->>'attempts'=prior->>'attempts' AND v_row->>'verifiedAt' IS NOT NULL)),false))) THEN RAISE EXCEPTION 'Unsupported campaign contact OTP mutation'; END IF;
      -- No Session is created elevated. Elevation changes only a live roster Session whose User holds an active
      -- grant and an owned verified enrollment. The database-clock bound allows five minutes of skew
      -- beyond the application's twelve-hour TTL (UTC timestamp(3) columns).
      IF TG_TABLE_NAME='sessions' AND TG_OP<>'DELETE' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'userId') OR
        (v_row->>'adminTotpExpiresAt' IS NOT NULL AND (TG_OP='INSERT' OR (v_row->'adminTotpExpiresAt' IS DISTINCT FROM prior->'adminTotpExpiresAt' AND NOT (
          (v_row->>'expiresAt')::timestamp>(now() AT TIME ZONE 'UTC') AND (v_row->>'adminTotpExpiresAt')::timestamp<=(now() AT TIME ZONE 'UTC')+interval '12 hours 5 minutes' AND
          EXISTS(SELECT 1 FROM public.staff_grants g WHERE g."userId"=v_row->>'userId' AND g."revokedAt" IS NULL) AND
          EXISTS(SELECT 1 FROM public.totp_enrollments t JOIN "${n}".campaign_records r ON r.table_name='totp_enrollments' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',t.id) WHERE t."userId"=v_row->>'userId' AND t."verifiedAt" IS NOT NULL))))))
        THEN RAISE EXCEPTION 'Unsupported campaign session'; END IF;
      ${deliveryInventory("NOT (TG_TABLE_NAME='otp_requests' AND TG_OP='INSERT' AND o.id=v_row->>'id') AND ")}` : ''}
      IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE journal_hash=${journalHash} AND event_hash=${eventHash}) THEN RAISE EXCEPTION 'Campaign journal changed'; END IF;
      IF TG_OP<>'INSERT' AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=oldkey AND NOT deleted AND row_hash=md5(prior::text)) THEN RAISE EXCEPTION 'Untracked campaign mutation'; END IF;
      IF lifecycle='identities' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=rowkey) THEN RAISE EXCEPTION 'Campaign key reuse'; END IF;
      IF lifecycle='identities' AND TG_OP='DELETE' AND (TG_TABLE_NAME IN ('users','dealerships') OR (TG_TABLE_NAME='dealership_members' AND v_row->>'userId'='${owner.id}')) THEN RAISE EXCEPTION 'Campaign roots retained until disposal'; END IF;
      ${bootstrapV3 ? `IF lifecycle='identities' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('dealership_invitations','dealership_members') AND v_row->>'dealershipId'<>'${rootId}' THEN RAISE EXCEPTION 'Unsupported campaign business'; END IF;
      ` : ''}IF lifecycle='disposed' THEN RAISE EXCEPTION 'Campaign graph disposed'; END IF;
      IF lifecycle='cleaning' AND NOT ((TG_OP='DELETE' OR (TG_TABLE_NAME='audit_logs' AND TG_OP='UPDATE' AND v_row->>'actorId' IS NULL AND
        v_row->>'targetType'='SyntheticCampaign' AND v_row->>'targetId'='${input.id}' AND v_row->'details'=jsonb_build_object('profile','${profile}','disposition','redacted-synthetic-audit'))) AND
        (SELECT count(DISTINCT relation) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='relation' AND mode='ShareRowExclusiveLock' AND granted AND relation IN (${relationIds}))=${tables.length})
        THEN RAISE EXCEPTION 'Campaign graph cleaning'; END IF;
      IF lifecycle='identities' AND TG_OP='UPDATE' AND (rowkey IS DISTINCT FROM oldkey OR EXISTS(SELECT 1 FROM jsonb_each_text(v_row) e WHERE e.key IN (${immutable.map(x => `'${x}'`).join(',')}) AND v_row->e.key IS DISTINCT FROM prior->e.key${otpBinding})) THEN RAISE EXCEPTION 'Campaign parent or key transfer'; END IF;
      ${admissionAdoption}IF lifecycle='identities' AND TG_OP<>'DELETE' THEN
        FOR edge IN SELECT * FROM jsonb_each_text(v_row) LOOP
          parent_table := '${JSON.stringify(parents)}'::jsonb->>edge.key;
          IF parent_table IS NOT NULL AND edge.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=parent_table AND row_key=jsonb_build_object('id',edge.value) AND NOT deleted) THEN RAISE EXCEPTION 'Foreign campaign graph reference'; END IF;
        END LOOP;${admissionClosed}${admittedBusiness}${promotionRole}
        IF TG_TABLE_NAME='users' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'id' AND email=v_row->>'email') OR
          ${bootstrapV3 ? `(v_row->>'role'<>'buyer' AND NOT (v_row->>'id'='${coordinator.id}' AND v_row->>'role'='admin' AND TG_OP='UPDATE'))` : "v_row->>'role'<>'buyer'"} OR v_row->>'emailVerifiedAt' IS NULL OR v_row->>'phone' IS NOT NULL OR v_row->>'avatarKey' IS NOT NULL OR v_row->>'avatarUploadId' IS NOT NULL OR v_row->>'avatarUrl' IS NOT NULL OR v_row->>'suspendedAt' IS NOT NULL OR v_row->>'suspendedById' IS NOT NULL OR v_row->>'deletionScheduledAt' IS NOT NULL) THEN RAISE EXCEPTION 'Synthetic identity changed'; END IF;
        IF TG_TABLE_NAME='dealerships'${bootstrapV3 ? ` AND v_row->>'id'='${rootId}'` : ''} AND (v_row->>'id'<>'${rootId}' OR v_row->>'slug'<>'${rootSlug}' OR v_row->>'contactPhone' IS DISTINCT FROM '${rootContact}' OR v_row->>'status'<>'recovery' OR v_row->>'admissionMode'<>'synthetic' OR v_row->>'admittedAt' IS NOT NULL OR v_row->>'checkedEvidence' IS NOT NULL OR v_row->>'contactConfirmedAt' IS NOT NULL OR v_row->>'logoUrl' IS NOT NULL) THEN RAISE EXCEPTION 'Synthetic root identity changed'; END IF;
        IF TG_TABLE_NAME IN ('listings','listing_drafts','conversations') AND v_row->>'businessId' IS DISTINCT FROM '${rootId}' THEN RAISE EXCEPTION 'Campaign business required'; END IF;
        IF TG_TABLE_NAME='dealership_members' AND v_row->>'userId'='${owner.id}' AND v_row->>'role'<>'owner' THEN RAISE EXCEPTION 'Synthetic owner changed'; END IF;
        IF TG_TABLE_NAME='conversations' AND NOT EXISTS(SELECT 1 FROM public.listings l WHERE l.id=v_row->>'listingId' AND l."sellerId"=v_row->>'sellerId' AND l."businessId"=v_row->>'businessId') THEN RAISE EXCEPTION 'Campaign conversation parents disagree'; END IF;
        IF TG_TABLE_NAME IN ('messages','conversation_participants') AND NOT EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=v_row->>'conversationId' AND coalesce(v_row->>'senderId',v_row->>'userId') IN (c."buyerId",c."sellerId")) THEN RAISE EXCEPTION 'Campaign participant mismatch'; END IF;
        IF TG_TABLE_NAME='conversations' AND EXISTS(SELECT 1 FROM jsonb_each_text(v_row) e WHERE e.key IN ('lastMessageId','firstBuyerMessageId','firstSellerReplyId') AND e.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.id=e.value AND m."conversationId"=v_row->>'id')) THEN RAISE EXCEPTION 'Campaign message pointer mismatch'; END IF;
        IF TG_TABLE_NAME='verified_contact_phones' AND (v_row->>'phone' IS DISTINCT FROM '${rootContact}' OR EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone=v_row->>'phone' AND id<>v_row->>'id')) THEN RAISE EXCEPTION 'Campaign contact proof collision'; END IF;
        ${grantGuard}
        IF TG_TABLE_NAME='audit_logs' AND (v_row->>'targetType'<>'User' OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'targetId') OR v_row->>'action'<>'STAFF_CAPABILITY_BOOTSTRAP' OR v_row->>'targetId'<>'${coordinator.id}' OR v_row->>'actorId' IS NOT NULL OR NOT (
          ${['staff.manage','founder.control'].map(c => `(v_row->>'id'='${uuid(`campaign897-business:${input.id}:audit:${c}`)}' AND v_row->'details'=jsonb_build_object('capability','${c}','reason','Synthetic storage-only reservation ${input.id}'))`).join(' OR ')}))${grantAudit}${admittedAudit}${ownerAudit}${salesAudit}${promotionAudit} THEN RAISE EXCEPTION 'Unsupported campaign audit'; END IF;
        IF TG_TABLE_NAME='content_reports' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=CASE v_row->>'targetType' WHEN 'listing' THEN 'listings' WHEN 'user' THEN 'users' WHEN 'message' THEN 'messages' ELSE '' END AND NOT deleted AND row_key=jsonb_build_object('id',v_row->>'targetId')) OR v_row->>'messageContext' IS NOT NULL) THEN RAISE EXCEPTION 'Unsupported report target'; END IF;
        IF TG_TABLE_NAME='messages' AND (v_row->>'kind'<>'text' OR coalesce(v_row->'metadata','null'::jsonb) NOT IN ('null'::jsonb,'{}'::jsonb)) THEN RAISE EXCEPTION 'Unsupported message media'; END IF;
        IF TG_TABLE_NAME='listing_drafts' AND (jsonb_typeof(v_row->'payload')<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(v_row->'payload') e WHERE e.key NOT IN ('description','media') OR (e.key='description' AND jsonb_typeof(e.value)<>'string') OR (e.key='media' AND e.value<>'[]'::jsonb))) THEN RAISE EXCEPTION 'Unsupported draft payload'; END IF;
        IF TG_TABLE_NAME='notification_preferences' AND (jsonb_typeof(v_row->'optOuts')<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(v_row->'optOuts') e WHERE jsonb_typeof(e.value)<>'boolean')) THEN RAISE EXCEPTION 'Unsupported notification preferences'; END IF;
        IF TG_TABLE_NAME='listings' AND (v_row->>'pendingVideoGenerationId' IS NOT NULL OR v_row->>'activeVideoGenerationId' IS NOT NULL) THEN RAISE EXCEPTION 'Unsupported listing video'; END IF;
      END IF;
      IF ((SELECT count(*) FROM "${n}".campaign_records)>=128 AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=rowkey)) OR (SELECT count(*) FROM "${n}".campaign_events)>=2048 OR (lifecycle='identities' AND
        (SELECT count(*) FROM "${n}".campaign_events)+(SELECT count(*) FROM "${n}".campaign_records WHERE NOT deleted)+4>=2048) THEN RAISE EXCEPTION 'Campaign graph limit'; END IF;
      ${bootstrapV3 ? `IF TG_TABLE_NAME='otp_requests' AND TG_OP='INSERT' AND v_row->>'channel'='phone' THEN
        IF coalesce(current_setting('carberk.campaign_sms_binding',true),'')<>'' THEN RAISE EXCEPTION 'Campaign SMS marker conflict'; END IF;
        UPDATE "${n}".campaign_sms_binding SET business_id=v_row->>'businessId',owner_id=v_row->>'userId' WHERE business_id IS NULL AND owner_id IS NULL;
        INSERT INTO "${n}".campaign_sms_ledger(request_id,reservation_id,candidate,destination,business_id,owner_id,purpose,code_hash,issue_row_hash)
          VALUES(v_row->>'id','${input.id}','${input.candidate}','${contactPhone}',v_row->>'businessId',v_row->>'userId',v_row->>'purpose',v_row->>'codeHash',md5(v_row::text));
        PERFORM set_config('carberk.campaign_sms_binding',jsonb_build_object('kind','campaign','namespace','${n}','reservationId','${input.id}','candidate','${input.candidate}','requestId',v_row->>'id')::text,true);
      END IF;
      IF TG_TABLE_NAME='otp_requests' AND TG_OP='INSERT' AND v_row->>'channel'='email' THEN
        INSERT INTO "${n}".campaign_delivery_ledger(request_id,email) VALUES(v_row->>'id',v_row->>'destination') ON CONFLICT DO NOTHING;
        IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_delivery_ledger WHERE request_id=v_row->>'id' AND email=v_row->>'destination') THEN RAISE EXCEPTION 'Campaign delivery collision'; END IF;
      END IF;
      ` : ''}fingerprint := md5(v_row::text);
      INSERT INTO "${n}".campaign_records(table_name,row_key,row_hash,deleted) VALUES(TG_TABLE_NAME,rowkey,fingerprint,TG_OP='DELETE') ON CONFLICT(table_name,row_key) DO UPDATE SET row_hash=excluded.row_hash,version="${n}".campaign_records.version+1,deleted=excluded.deleted;
      INSERT INTO "${n}".campaign_events(table_name,row_key,mutation,row_hash${bootstrapV3 ? ',contact_phone' : ''}) VALUES(TG_TABLE_NAME,rowkey,TG_OP,fingerprint${bootstrapV3 ? ",coalesce(TG_TABLE_NAME='dealerships' AND TG_OP='UPDATE' AND (v_row->'contactPhone' IS DISTINCT FROM prior->'contactPhone' OR v_row->'contactConfirmedAt' IS DISTINCT FROM prior->'contactConfirmedAt'),false)" : ''});
      UPDATE "${n}".campaign_manifest SET journal_hash=${journalHash},event_hash=${eventHash}${bootstrapV3 ? `,sms_hash=${smsHash},delivery_hash=(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY request_id),'[]'::jsonb)::text) FROM "${n}".campaign_delivery_ledger d)` : ''};
      RETURN NULL;
    END $fn$;
    UPDATE "${n}".campaign_manifest SET tracking_hash=md5(pg_get_functiondef('"${n}".track_business()'::regprocedure));
    ${tables.map(table => `CREATE TRIGGER "${n}_business" AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION "${n}".track_business();`).join('\n')}${bootstrapV3 ? `
    CREATE CONSTRAINT TRIGGER "${n}_promotion" AFTER UPDATE ON public.users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${n}".track_business('promotion');
    CREATE CONSTRAINT TRIGGER "${n}_promotion" AFTER INSERT OR UPDATE OR DELETE ON public.audit_logs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${n}".track_business('promotion');
    CREATE TRIGGER "${n}_baseline" AFTER DELETE ON public.measurement_state FOR EACH ROW WHEN (OLD.key LIKE 'inventory_baseline:%') EXECUTE FUNCTION "${n}".track_business();
    UPDATE "${n}".campaign_manifest SET baseline_trigger_hash=(SELECT md5(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgname='${n}_baseline' AND tgrelid='public.measurement_state'::regclass);` : ''}`;
  const collision = `DO $guard$ BEGIN
    IF EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone='${rootContact}') OR EXISTS(SELECT 1 FROM public.users WHERE phone='${rootContact}') OR EXISTS(SELECT 1 FROM public.dealerships WHERE id='${rootId}' OR slug='${rootSlug}' OR "contactPhone"='${rootContact}') OR
      EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id OR u.email=e.email) OR
      EXISTS(SELECT 1 FROM public.dealership_members WHERE id='${uuid(`campaign897-business:${input.id}:membership:owner`)}') OR
      EXISTS(SELECT 1 FROM public.audit_logs WHERE id IN (${['staff.manage','founder.control'].map(c => `'${uuid(`campaign897-business:${input.id}:audit:${c}`)}'`).join(',')})) THEN RAISE EXCEPTION 'Campaign identity collision'; END IF;${bootstrapV3 ? `
    IF EXISTS(SELECT 1 FROM public.users WHERE phone='${contactPhone}') OR EXISTS(SELECT 1 FROM public.otp_requests WHERE phone='${contactPhone}' OR destination='${contactPhone}') OR EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone='${contactPhone}') OR EXISTS(SELECT 1 FROM public.dealerships WHERE "contactPhone"='${contactPhone}') OR EXISTS(SELECT 1 FROM public.listings WHERE "contactPhone"='${contactPhone}') THEN RAISE EXCEPTION 'Campaign phone collision'; END IF;` : ''}${authInventory}
  END $guard$;`;
  const audit = `INSERT INTO public.users(id,email,"emailVerifiedAt","displayName",role,"updatedAt") VALUES ${identities.map(identity => `('${identity.id}','${identity.email}',now(),'Campaign ${identity.alias}','buyer',now())`).join(',')};
    INSERT INTO public.dealerships(id,slug,name,status,"admissionMode","contactPhone","updatedAt") VALUES('${rootId}','${rootSlug}','Campaign 897 synthetic business','recovery','synthetic','${rootContact}',now());
    INSERT INTO public.dealership_members(id,"dealershipId","userId",role) VALUES('${uuid(`campaign897-business:${input.id}:membership:owner`)}','${rootId}','${owner.id}','owner');
    ${['staff.manage','founder.control'].map(c => `INSERT INTO public.staff_grants("userId",capability) VALUES('${coordinator.id}','${c}');
      INSERT INTO public.audit_logs(id,"actorId",action,"targetType","targetId",details) VALUES('${uuid(`campaign897-business:${input.id}:audit:${c}`)}',NULL,'STAFF_CAPABILITY_BOOTSTRAP','User','${coordinator.id}','{"capability":"${c}","reason":"Synthetic storage-only reservation ${input.id}"}');`).join('\n')}`;
  if (!['fixture', 'reset', 'probe'].includes(input.kind)) throw new Error();
  // Losing a namespace also loses descendant authority. Never infer disposal
  // from missing metadata, even when deterministic roots happen to be absent.
  if (!exists && input.kind !== 'fixture') throw new Error('Campaign journal unavailable');
  if (!exists) {
    sql(`BEGIN; ${setupLock} ${setup} ${collision} ${audit} ${integrity} COMMIT;`);
  } else {
    sql(`BEGIN; ${lock} ${integrity} COMMIT;`);
  }
  let state = sql(`SELECT state FROM "${n}".campaign_manifest;`);
  if (input.kind === 'fixture' && state !== 'identities') throw new Error('Campaign fixture is terminal');
  if (input.kind === 'reset' && state !== 'disposed') {
    sql(`BEGIN; ${lock} ${integrity} ${preflight} UPDATE "${n}".campaign_manifest SET state='cleaning'; COMMIT;`);
    // V3 commits this fence before touching Redis, as v1 does. Enqueue, mock send and
    // owned auth writes then refuse, so the exact ledger read below cannot grow.
    // Refused or interrupted queue disposal leaves the namespace retryably cleaning.
    if (bootstrapV3) disposeDeliveries(JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('requestId',request_id,'email',email) ORDER BY request_id),'[]') FROM "${n}".campaign_delivery_ledger;`)), false);
    // Explicit child-first deletion. AFTER triggers verify the lock-held cleaning
    // transition and record each deletion. Never mark unexamined rows disposed.
    const order = ['content_reports', 'staff_grants', 'favorites', 'business_enquiry_audits', 'conversation_participants', 'messages', 'conversations', 'listing_drafts', 'listings', 'dealership_invitations', 'dealership_members', 'verified_contact_phones', 'owned_vehicles', 'blocked_users', 'notification_preferences', 'dealerships', ...(bootstrapV3 ? ['totp_backup_codes', 'totp_enrollments', 'sessions', 'otp_requests'] : []), 'users'];
    const deletes = order.map(table => `DELETE FROM public.${table} t USING "${n}".campaign_records r WHERE r.table_name='${table}' AND NOT r.deleted AND ${key('to_jsonb(t)',table)}=r.row_key;`).join('\n');
    sql(`BEGIN; ${lock} ${integrity} ${preflight}${bootstrapV3 ? `
      DELETE FROM "${n}".campaign_sms_sink;
      DELETE FROM "${n}".campaign_delivery_sink;` : ''}
      UPDATE public.audit_logs a SET "actorId"=NULL,"targetType"='SyntheticCampaign',"targetId"='${input.id}',details='{"profile":"${profile}","disposition":"redacted-synthetic-audit"}' FROM "${n}".campaign_records r WHERE r.table_name='audit_logs' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',a.id);
      ${deletes}
      ${integrity} DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs') THEN RAISE EXCEPTION 'Campaign disposal incomplete'; END IF; END $guard$;
      UPDATE "${n}".campaign_manifest SET state='disposed'; COMMIT;`);
    state = 'disposed';
  }
  if (state === 'disposed') sql(`BEGIN; ${lock} ${integrity} ${preflight}
    DO $guard$ BEGIN
      IF EXISTS(SELECT 1 FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND r.row_key=jsonb_build_object('id',a.id) WHERE a."actorId" IS NOT NULL OR a."targetType"<>'SyntheticCampaign' OR a."targetId"<>'${input.id}' OR a.details IS DISTINCT FROM '{"profile":"${profile}","disposition":"redacted-synthetic-audit"}'::jsonb) THEN RAISE EXCEPTION 'Campaign audit disposition changed'; END IF;
      IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs') THEN RAISE EXCEPTION 'Campaign terminal rows present'; END IF;${bootstrapV3 ? `
      IF EXISTS(SELECT 1 FROM "${n}".campaign_sms_sink) OR EXISTS(SELECT 1 FROM "${n}".campaign_delivery_sink) THEN RAISE EXCEPTION 'Campaign delivery sink retained'; END IF;` : ''} END $guard$; COMMIT;`);
  // A terminal v3 receipt, including a lost-response retry, observes exact job absence
  // and permanent tombstones for the retained ledger. It never recreates missing proof.
  if (bootstrapV3 && state === 'disposed') disposeDeliveries(JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('requestId',request_id,'email',email) ORDER BY request_id),'[]') FROM "${n}".campaign_delivery_ledger;`)), true);
  const receipt = { profile, candidate: input.candidate, namespace: n, reservationId: input.id, protectedReceipt: `${n}.campaign_entities`, state,
    identities: state === 'disposed' ? 0 : identities.length, fixtures: state === 'disposed' ? 'absent' : 'present', tombstone: state === 'disposed',
    ...(bootstrapV3 && state === 'disposed' ? { queueJobs: 0, sinkRecords: 0 } : {}) };
  if (observation) {
    Object.assign(receipt, observation);
    if (state === 'disposed') {
      // Integrity and terminal preflight have verified exact journal rows,
      // absence of disposed data and redaction of the retained bootstrap audits.
      const retainedAudits = Number(sql(`SELECT count(*) FROM "${n}".campaign_records WHERE table_name='audit_logs' AND NOT deleted;`));
      if (retainedAudits !== 2) throw new Error('Campaign retained audit authority changed');
      Object.assign(receipt, { storageDisposal: { version: 1, scope: 'business-v2-storage', state: 'disposed',
        rows: 'absent', retainedAudits, auditDisposition: 'redacted-synthetic-audit', tombstone: 'retained' } });
    }
  }
  console.log(JSON.stringify(receipt));
}

export async function campaignQueueMain(deliveries, observeOnly = false, binding) {
  let queue;
  try {
    const { Queue } = require('bullmq');
    const { AuthSchemas } = require('@auto-tm/contracts');
    if (!Array.isArray(deliveries) || deliveries.length > 128) throw new Error();
    if (!binding || !/^[a-f0-9]{32}$/.test(binding.reservationId ?? '') ||
        binding.namespace !== `cf_${binding.reservationId}` || !/^[a-f0-9]{40}$/.test(binding.candidate ?? '') ||
        !['campaign897-identities-v1', 'campaign897-full-v3'].includes(binding.profile) || typeof observeOnly !== 'boolean') throw new Error();
    const aliases = binding.profile === 'campaign897-full-v3'
      ? 'buyer-a|buyer-b|owner|sales-a|sales-b|coordinator|support|history-fulfiller|payment-verifier|reception-steward|technician|independent-reviewer|private-reviewer|aggregate-viewer|investigator'
      : 'buyer-a|owner|sales-a|coordinator';
    const keys = [], argumentsByKey = [], seen = new Set();
    for (const delivery of deliveries) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(delivery.requestId ?? '') || seen.has(delivery.requestId) ||
          typeof delivery.email !== 'string' ||
          !new RegExp(`^(${aliases})\\.${binding.reservationId}\\.${binding.candidate.slice(0,12)}@campaign897\\.invalid$`).test(delivery.email)) throw new Error();
      seen.add(delivery.requestId);
      keys.push(`de:campaign-${binding.namespace}-${delivery.requestId}`);
      argumentsByKey.push(delivery.requestId, `disposed:${binding.namespace}:${binding.candidate}:${delivery.requestId}`);
    }
    const redis = new URL(process.env.REDIS_URL);
    if (!['redis:', 'rediss:'].includes(redis.protocol) || redis.search || redis.hash || !/^\/\d*$/.test(redis.pathname || '/')) throw new Error();
    queue = new Queue(AuthSchemas.EMAIL_CODE_QUEUE, { connection: {
      host: redis.hostname, port: Number(redis.port || 6379), db: Number(redis.pathname.slice(1) || 0),
      username: redis.username ? decodeURIComponent(redis.username) : undefined,
      password: redis.password ? decodeURIComponent(redis.password) : undefined,
      ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
      maxRetriesPerRequest: 1, retryStrategy: () => null, connectTimeout: 8000, commandTimeout: 8000,
    }});
    queue.on('error', () => {});
    await queue.waitUntilReady();
    const inspect = async delivery => {
      const job = await queue.getJob(delivery.requestId);
      if (!job) return;
      const parsed = AuthSchemas.EmailCodeJobSchema.safeParse(job.data);
      if (observeOnly || job.name !== AuthSchemas.EMAIL_CODE_JOB_NAME || !parsed.success || parsed.data.to !== delivery.email ||
          parsed.data.purpose !== 'sign-in' || job.opts.parent || job.parentKey || job.repeatJobKey || job.opts.repeat ||
          !['active','waiting','delayed','completed','failed','paused','prioritized'].includes(await job.getState())) throw new Error();
      const counts = await job.getDependenciesCount();
      if (Object.values(counts).some(count => count !== 0)) throw new Error();
      return job;
    };
    // Refuse foreign job payloads before changing any dedup key. Reinspect after
    // fencing: a previously admitted producer can arrive between these reads.
    for (const delivery of deliveries) await inspect(delivery);
    const client = await queue.client;
    const exactKeys = keys.map(key => queue.toKey(key));
    if (exactKeys.length) {
      // All comparisons precede all writes. No TTL: the retained SQL delivery
      // ledger is the permanent ownership journal for these bounded exact keys.
      const fenced = await client.eval(`
        for i,key in ipairs(KEYS) do
          local value = redis.call('GET',key)
          local request = ARGV[i*2-1]
          local tombstone = ARGV[i*2]
          if value and value ~= request and value ~= tombstone then return 0 end
          if value == tombstone and redis.call('PTTL',key) ~= -1 then return 0 end
          if ARGV[#KEYS*2+1] == 'observe' and value ~= tombstone then return 0 end
        end
        if ARGV[#KEYS*2+1] ~= 'observe' then
          for i,key in ipairs(KEYS) do redis.call('SET',key,ARGV[i*2]) end
        end
        return 1`, exactKeys.length, ...exactKeys, ...argumentsByKey, observeOnly ? 'observe' : 'fence');
      if (fenced !== 1) throw new Error();
    }
    const owned = [];
    for (const delivery of deliveries) {
      const job = await inspect(delivery);
      if (job) {
        if (await job.getState() === 'active') throw new Error();
        owned.push(job);
      }
    }
    // Validate the complete bounded inventory before removing any job. BullMQ also
    // refuses a job that becomes locked between getState and removal.
    for (const job of owned) await job.remove({ removeChildren: false });
    for (const delivery of deliveries) if (await queue.getJob(delivery.requestId)) throw new Error();
    // Removal/finalization in pinned BullMQ5.76.8 deletes dedup keys only when
    // their value equals the job ID. Require the retained tombstone afterward.
    for (let i = 0; i < exactKeys.length; i += 1) {
      if (await client.get(exactKeys[i]) !== argumentsByKey[i*2+1] || await client.pttl(exactKeys[i]) !== -1) throw new Error();
    }
    console.log(JSON.stringify({ queueJobs: 0 }));
  } catch {
    process.exitCode = 1;
  } finally {
    if (queue) await queue.close().catch(() => { process.exitCode = 1; });
  }
}
