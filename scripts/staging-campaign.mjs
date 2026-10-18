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

/** Fixed media-free business graph profile. It shares the reservation manifest,
 * trigger journal and reset fence with the identity profile but has no auth path. */
export function businessMain(input, { sql, uuid, exists }) {
  const profile = 'campaign897-business-v2';
  if (input.profile !== profile || !/^[a-f0-9]{40}$/.test(input.candidate ?? '')) throw new Error();
  const n = input.namespace;
  const aliases = ['buyer-a', 'buyer-b', 'owner', 'sales-a', 'sales-b', 'coordinator', 'support', 'history-fulfiller', 'payment-verifier', 'reception-steward', 'technician', 'independent-reviewer', 'private-reviewer', 'aggregate-viewer', 'investigator'];
  const identities = aliases.map(alias => ({ alias, id: uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:${alias}`), email: `${alias}.${input.id}.${input.candidate.slice(0, 12)}@campaign897.invalid` }));
  const owner = identities.find(identity => identity.alias === 'owner');
  const coordinator = identities.find(identity => identity.alias === 'coordinator');
  const rootId = uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:root`);
  const rootSlug = `campaign897-${input.id}-${input.candidate.slice(0, 12)}`;
  const rootContact = `+999${(BigInt(`0x${require('node:crypto').createHash('sha256').update(`${input.id}:${input.candidate}:business-contact`).digest('hex').slice(0, 12)}`) % 1000000000000n).toString().padStart(12, '0')}`;
  const tables = ['users', 'dealerships', 'dealership_members', 'dealership_invitations', 'listings', 'listing_drafts', 'conversations', 'conversation_participants', 'messages', 'business_enquiry_audits', 'favorites', 'verified_contact_phones', 'owned_vehicles', 'blocked_users', 'notification_preferences', 'content_reports'];
  const identityValues = identities.map(identity => `('${identity.alias}','${identity.id}','${identity.email}')`).join(',');
  const ownedIds = identities.map(identity => `'${identity.id}'`).concat(`'${rootId}'`).join(',');
  const lock = `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(hashtextextended('${n}',0));`;
  const binding = `DO $guard$ BEGIN
    IF (SELECT count(*) FROM "${n}".campaign_manifest) <> 1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}' AND delivery_version=2) THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_entities) <> 15 OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN (${identityValues})) THEN RAISE EXCEPTION 'Campaign roster changed'; END IF;
  END $guard$;`;
  const setup = `CREATE SCHEMA "${n}";
    CREATE TABLE "${n}".campaign_manifest(reservation_id text PRIMARY KEY,candidate text NOT NULL,profile text NOT NULL,state text NOT NULL CHECK(state IN ('identities','cleaning','disposed')),delivery_version integer NOT NULL DEFAULT 2);
    INSERT INTO "${n}".campaign_manifest VALUES('${input.id}','${input.candidate}','${profile}','identities',2);
    CREATE TABLE "${n}".campaign_entities(alias text PRIMARY KEY,user_id text UNIQUE NOT NULL,email text UNIQUE NOT NULL);
    INSERT INTO "${n}".campaign_entities VALUES ${identityValues};
    CREATE TABLE "${n}".campaign_records(table_name text NOT NULL,row_key jsonb NOT NULL,row_hash text NOT NULL,version bigint NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(table_name,row_key));
    CREATE OR REPLACE FUNCTION "${n}".track_business() RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE value jsonb; k jsonb; lifecycle text; bad text;
    BEGIN
      SELECT state INTO lifecycle FROM "${n}".campaign_manifest;
      IF lifecycle='disposed' THEN RAISE EXCEPTION 'Campaign graph disposed'; END IF;
      value := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('dealerships','dealership_members') AND value->>'id' IN ('${rootId}') THEN
        IF value->>'slug' IS DISTINCT FROM '${rootSlug}' OR value->>'contactPhone' IS DISTINCT FROM '${rootContact}' THEN RAISE EXCEPTION 'Synthetic root identity changed'; END IF;
      END IF;
      IF TG_OP IN ('INSERT','UPDATE') THEN
        FOR k IN SELECT * FROM jsonb_each_text(value) LOOP
          IF k.key IN ('businessId','dealershipId','sellerId','userId','buyerId','recipientUserId','senderId','blockerId','blockedId','conversationId','listingId','reporterUserId','actorId','assigneeId') AND k.value IS NOT NULL AND k.value <> '' AND k.value NOT IN (${ownedIds}) AND NOT (TG_TABLE_NAME='content_reports' AND k.key='reporterUserId') THEN
            RAISE EXCEPTION 'Foreign campaign graph reference';
          END IF;
        END LOOP;
      END IF;
      IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=jsonb_build_object('id',(to_jsonb(OLD)->>'id')) AND NOT deleted) THEN
        IF TG_TABLE_NAME IN ('users','dealerships','dealership_members') AND (to_jsonb(OLD)->>'id') IN (${ownedIds}) AND TG_TABLE_NAME='users' AND value->>'email' IS DISTINCT FROM (to_jsonb(OLD)->>'email') THEN RAISE EXCEPTION 'Owned identity changed'; END IF;
      END IF;
      IF TG_OP='DELETE' THEN k=jsonb_build_object('id',value->>'id'); ELSE k=jsonb_build_object('id',value->>'id'); END IF;
      INSERT INTO "${n}".campaign_records(table_name,row_key,row_hash,deleted) VALUES(TG_TABLE_NAME,k,md5(value::text),TG_OP='DELETE') ON CONFLICT(table_name,row_key) DO UPDATE SET row_hash=excluded.row_hash,version="${n}".campaign_records.version+1,deleted=excluded.deleted;
      RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END $fn$;
    ${tables.map(table => `CREATE TRIGGER "${n}_${table}_business" AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION "${n}".track_business();`).join('\n')}`;
  const audit = `INSERT INTO public.users(id,email,"emailVerifiedAt","displayName",role,"updatedAt") VALUES ${identities.map(identity => `('${identity.id}','${identity.email}',now(),'Campaign ${identity.alias}','buyer',now())`).join(',')};
    INSERT INTO public.dealerships(id,slug,name,status,"admissionMode","contactPhone","updatedAt") VALUES('${rootId}','${rootSlug}','Campaign 897 synthetic business','recovery','synthetic','${rootContact}',now());
    INSERT INTO public.dealership_members(id,"dealershipId","userId",role) VALUES('${uuid(`campaign897-business:${input.id}:membership:owner`)}','${rootId}','${owner.id}','owner');
    INSERT INTO public.staff_grants("userId",capability) VALUES('${coordinator.id}','staff.manage'),('${coordinator.id}','founder.control');`;
  const live = `SELECT count(*) FROM "${n}".campaign_records WHERE NOT deleted;`;
  if (input.kind === 'fixture') {
    if (exists) {
      if (sql(`SELECT reservation_id||'|'||candidate||'|'||profile||'|'||delivery_version FROM "${n}".campaign_manifest;`) !== `${input.id}|${input.candidate}|${profile}|2`) throw new Error();
      sql(`BEGIN; ${lock} ${binding} COMMIT;`);
    } else {
      if (sql(`SELECT count(*) FROM public.dealerships WHERE id='${rootId}' OR slug='${rootSlug}' OR "contactPhone"='${rootContact}'`) !== '0' || sql(`SELECT count(*) FROM public.users WHERE email IN (${identities.map(identity => `'${identity.email}'`).join(',')})`) !== '0') throw new Error();
      sql(`BEGIN; ${lock} ${setup} ${audit} COMMIT;`);
    }
    console.log(JSON.stringify({ profile, state: 'identities', identities: identities.length, fixtures: 'present', tombstone: false }));
    return;
  }
  if (input.kind !== 'reset') throw new Error();
  if (!exists) { console.log(JSON.stringify({ profile, state: 'disposed', identities: 0, fixtures: 'absent', tombstone: true })); return; }
  const state = sql(`SELECT state FROM "${n}".campaign_manifest;`);
  if (state === 'disposed') { console.log(JSON.stringify({ profile, state, identities: 0, fixtures: 'absent', tombstone: true })); return; }
  if (state === 'identities') sql(`BEGIN; ${lock} ${binding} UPDATE "${n}".campaign_manifest SET state='cleaning'; COMMIT;`);
  const fkGuard = `DO $guard$ DECLARE fk record; found bigint; BEGIN
    ${tables.map(table => `IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.${table}'::regclass AND tgname LIKE '${n}_${table.slice(0, 12)}%' AND NOT tgenabled='O') THEN RAISE EXCEPTION 'Missing campaign tracking'; END IF;`).join('\n')}
    IF EXISTS(SELECT 1 FROM public.content_reports r WHERE r.target_id IN (SELECT row_key->>'id' FROM "${n}".campaign_records WHERE table_name='listings' AND NOT deleted) AND (r."reporterUserId" IS NULL OR r."reporterUserId" NOT IN (${ownedIds}))) THEN RAISE EXCEPTION 'Foreign polymorphic report'; END IF;
    FOR fk IN SELECT conrelid::regclass source,confrelid::regclass target FROM pg_constraint WHERE contype='f' AND confrelid::regclass::text IN ('public.dealerships','public.users','public.listings','public.conversations') LOOP
      IF fk.source::text NOT IN (${tables.map(table => `'public.${table}'`).concat("'public.staff_grants'").join(',')}) AND EXISTS(SELECT 1 FROM "${n}".campaign_records r WHERE NOT r.deleted AND r.table_name=replace(fk.target::text,'public.','s')) THEN RAISE EXCEPTION 'Unknown foreign reference'; END IF;
    END LOOP;
  END $guard$;`;
  const deletes = [...tables].reverse().map(table => `DELETE FROM public.${table} t USING "${n}".campaign_records r WHERE r.table_name='${table}' AND NOT r.deleted AND t.id=r.row_key->>'id';`).join('\n');
  sql(`BEGIN; ${lock} ${binding} ${fkGuard} ${deletes} UPDATE "${n}".campaign_records SET deleted=true; UPDATE "${n}".campaign_manifest SET state='disposed'; COMMIT;`);
  console.log(JSON.stringify({ profile, state: 'disposed', identities: 0, fixtures: 'absent', tombstone: true }));
}

export async function campaignQueueMain(deliveries, observeOnly = false, binding) {
  let queue;
  try {
    const { Queue } = require('bullmq');
    const { AuthSchemas } = require('@auto-tm/contracts');
    if (!Array.isArray(deliveries) || deliveries.length > 128) throw new Error();
    if (!binding || !/^[a-f0-9]{32}$/.test(binding.reservationId ?? '') ||
        binding.namespace !== `cf_${binding.reservationId}` || !/^[a-f0-9]{40}$/.test(binding.candidate ?? '') ||
        binding.profile !== 'campaign897-identities-v1' || typeof observeOnly !== 'boolean') throw new Error();
    const keys = [], argumentsByKey = [], seen = new Set();
    for (const delivery of deliveries) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(delivery.requestId ?? '') || seen.has(delivery.requestId) ||
          typeof delivery.email !== 'string' ||
          !new RegExp(`^(buyer-a|owner|sales-a|coordinator)\\.${binding.reservationId}\\.${binding.candidate.slice(0,12)}@campaign897\\.invalid$`).test(delivery.email)) throw new Error();
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
