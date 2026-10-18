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
  if (input.kind === 'fixture' && input.candidate !== input.target) throw new Error('Campaign runtime candidate mismatch');
  const n = input.namespace;
  const aliases = ['buyer-a', 'buyer-b', 'owner', 'sales-a', 'sales-b', 'coordinator', 'support', 'history-fulfiller', 'payment-verifier', 'reception-steward', 'technician', 'independent-reviewer', 'private-reviewer', 'aggregate-viewer', 'investigator'];
  const identities = aliases.map(alias => ({ alias, id: uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:${alias}`), email: `${alias}.${input.id}.${input.candidate.slice(0, 12)}@campaign897.invalid` }));
  const owner = identities.find(identity => identity.alias === 'owner');
  const coordinator = identities.find(identity => identity.alias === 'coordinator');
  const rootId = uuid(`campaign897-business:${input.candidate}:${profile}:${input.id}:root`);
  const rootSlug = `campaign897-${input.id}-${input.candidate.slice(0, 12)}`;
  const rootContact = `+999${(BigInt(`0x${require('node:crypto').createHash('sha256').update(`${input.id}:${input.candidate}:business-contact`).digest('hex').slice(0, 12)}`) % 1000000000000n).toString().padStart(12, '0')}`;
  const tables = ['users', 'dealerships', 'dealership_members', 'dealership_invitations', 'listings', 'listing_drafts', 'conversations', 'conversation_participants', 'messages', 'business_enquiry_audits', 'favorites', 'verified_contact_phones', 'owned_vehicles', 'blocked_users', 'notification_preferences', 'content_reports', 'staff_grants', 'audit_logs'];
  // Only these columns convey graph ownership. Catalog references never do.
  const parents = { businessId: 'dealerships', dealershipId: 'dealerships', sellerId: 'users', userId: 'users', buyerId: 'users', recipientUserId: 'users', senderId: 'users', blockerId: 'users', blockedId: 'users', conversationId: 'conversations', listingId: 'listings', reporterUserId: 'users', reviewedById: 'users', actorId: 'users', assigneeId: 'users', previousAssigneeId: 'users', lastEditedById: 'users', suspendedById: 'users', lastMessageId: 'messages', firstBuyerMessageId: 'messages', firstSellerReplyId: 'messages' };
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
  const key = (row, table) => table === 'staff_grants' ? `jsonb_build_object('userId',${row}->>'userId','capability',${row}->>'capability')` : `jsonb_build_object('id',${row}->>'id')`;
  const schemaHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum)::text,'')) FROM
    (SELECT attrelid,attnum,attname,atttypid,attnotnull,attgenerated FROM pg_attribute WHERE attrelid IN (${relationIds}) AND attnum>0 AND NOT attisdropped) a)`;
  const journalHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(journal_row) ORDER BY table_name,row_key),'[]'::jsonb)::text) FROM "${n}".campaign_records journal_row)`;
  const eventHash = `(SELECT md5(coalesce(jsonb_agg(to_jsonb(event_row) ORDER BY sequence),'[]'::jsonb)::text) FROM "${n}".campaign_events event_row)`;
  const binding = `DO $guard$ BEGIN
    IF (SELECT count(*) FROM "${n}".campaign_manifest) <> 1 OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE reservation_id='${input.id}' AND candidate='${input.candidate}' AND profile='${profile}' AND delivery_version=2) THEN RAISE EXCEPTION 'Campaign binding changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_entities) <> 15 OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE (alias,user_id,email) NOT IN (${identityValues})) THEN RAISE EXCEPTION 'Campaign roster changed'; END IF;
  END $guard$;`;
  const integrity = `${binding} DO $guard$ DECLARE entry record; actual jsonb; BEGIN
    IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE schema_hash=${schemaHash} AND journal_hash=${journalHash} AND event_hash=${eventHash}
      AND tracking_hash=md5(pg_get_functiondef('"${n}".track_business()'::regprocedure))) THEN RAISE EXCEPTION 'Campaign journal or schema changed'; END IF;
    IF (SELECT count(*) FROM "${n}".campaign_records)>128 OR (SELECT count(*) FROM "${n}".campaign_events)>2048 THEN RAISE EXCEPTION 'Campaign journal limit'; END IF;
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE t.tgname='${n}_business' AND t.tgenabled='O' AND t.tgtype=29 AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''::int2vector AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tgisinternal AND ns.nspname='${n}' AND p.proname='track_business' AND t.tgrelid IN (${relationIds}))<>${tables.length}
      THEN RAISE EXCEPTION 'Missing campaign tracking'; END IF;
    FOR entry IN SELECT * FROM "${n}".campaign_records LOOP
      IF entry.table_name NOT IN (${tableNames}) OR entry.row_key IS DISTINCT FROM CASE WHEN entry.table_name='staff_grants' THEN jsonb_build_object('userId',entry.row_key->>'userId','capability',entry.row_key->>'capability') ELSE jsonb_build_object('id',entry.row_key->>'id') END OR
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
      SELECT 1 FROM "${n}".campaign_records r WHERE r.table_name='dealerships' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',d.id))) THEN RAISE EXCEPTION 'Untracked campaign root'; END IF;
  END $guard$;`;
  // Inventory every incoming FK using OIDs and catalog column names, including
  // non-public sources and composite/non-ID targets. No cascade grants ownership.
  const preflight = `DO $guard$ DECLARE entry record; fk record; foreign_rows bigint; condition text; BEGIN
    IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN ('r','p','f') AND ns.nspname NOT IN ('public','information_schema') AND ns.nspname NOT LIKE 'pg_%' AND ns.nspname !~ '^cf_[a-f0-9]{32}$') THEN RAISE EXCEPTION 'Unknown application schema'; END IF;
    -- Budget cleanup events before the first deletion. A cap cannot interrupt
    -- disposal after a prefix of rows has already been removed.
    IF (SELECT state FROM "${n}".campaign_manifest)<>'disposed' AND (SELECT count(*) FROM "${n}".campaign_events)+(SELECT count(*) FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs')+2>2048 THEN RAISE EXCEPTION 'Campaign cleanup event budget'; END IF;
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
    CREATE TABLE "${n}".campaign_manifest(reservation_id text PRIMARY KEY,candidate text NOT NULL,profile text NOT NULL,state text NOT NULL CHECK(state IN ('identities','cleaning','disposed')),delivery_version integer NOT NULL DEFAULT 2,schema_hash text NOT NULL,journal_hash text NOT NULL DEFAULT md5('[]'),event_hash text NOT NULL DEFAULT md5('[]'),tracking_hash text);
    INSERT INTO "${n}".campaign_manifest(reservation_id,candidate,profile,state,delivery_version,schema_hash) VALUES('${input.id}','${input.candidate}','${profile}','identities',2,${schemaHash});
    CREATE TABLE "${n}".campaign_entities(alias text PRIMARY KEY,user_id text UNIQUE NOT NULL,email text UNIQUE NOT NULL);
    INSERT INTO "${n}".campaign_entities VALUES ${identityValues};
    CREATE TABLE "${n}".campaign_records(table_name text NOT NULL,row_key jsonb NOT NULL,row_hash text NOT NULL,version bigint NOT NULL DEFAULT 1,deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(table_name,row_key));
    CREATE TABLE "${n}".campaign_events(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,table_name text NOT NULL,row_key jsonb NOT NULL,mutation text NOT NULL CHECK(mutation IN ('INSERT','UPDATE','DELETE')),row_hash text NOT NULL);
    CREATE FUNCTION "${n}".track_business() RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE v_row jsonb; prior jsonb; rowkey jsonb; oldkey jsonb; edge record; parent_table text; lifecycle text; owned boolean; fingerprint text;
    BEGIN
      v_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      prior := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
      rowkey := CASE WHEN TG_TABLE_NAME='staff_grants' THEN ${key('v_row','staff_grants')} ELSE ${key('v_row','users')} END;
      oldkey := CASE WHEN TG_TABLE_NAME='staff_grants' THEN ${key('prior','staff_grants')} ELSE ${key('prior','users')} END;
      SELECT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key IN (rowkey,oldkey)) INTO owned;
      IF TG_TABLE_NAME='users' THEN
        owned := owned OR EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id IN (v_row->>'id',prior->>'id') OR email IN (v_row->>'email',prior->>'email'));
      ELSIF TG_TABLE_NAME='dealerships' THEN
        owned := owned OR v_row->>'id'='${rootId}' OR prior->>'id'='${rootId}' OR v_row->>'slug'='${rootSlug}' OR prior->>'slug'='${rootSlug}' OR v_row->>'contactPhone'='${rootContact}' OR prior->>'contactPhone'='${rootContact}';
      ELSE
        FOR edge IN SELECT * FROM jsonb_each_text('${JSON.stringify(parents)}'::jsonb) LOOP
          -- Foreign reporters targeting an owned listing remain foreign. Reset
          -- detects and refuses them before touching the owned graph.
          IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=edge.value AND row_key->>'id' IN (v_row->>edge.key,prior->>edge.key)) THEN owned := true; END IF;
        END LOOP;
        IF TG_TABLE_NAME='audit_logs' AND v_row->>'targetType'='User' AND EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'targetId') THEN owned := true; END IF;
      END IF;
      IF NOT coalesce(owned,false) THEN RETURN NULL; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('${n}',0));
      SELECT state INTO lifecycle FROM "${n}".campaign_manifest;
      IF NOT EXISTS(SELECT 1 FROM "${n}".campaign_manifest WHERE journal_hash=${journalHash} AND event_hash=${eventHash}) THEN RAISE EXCEPTION 'Campaign journal changed'; END IF;
      IF TG_OP<>'INSERT' AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=oldkey AND NOT deleted AND row_hash=md5(prior::text)) THEN RAISE EXCEPTION 'Untracked campaign mutation'; END IF;
      IF lifecycle='identities' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=rowkey) THEN RAISE EXCEPTION 'Campaign key reuse'; END IF;
      IF lifecycle='identities' AND TG_OP='DELETE' AND (TG_TABLE_NAME IN ('users','dealerships') OR (TG_TABLE_NAME='dealership_members' AND v_row->>'userId'='${owner.id}')) THEN RAISE EXCEPTION 'Campaign roots retained until disposal'; END IF;
      IF lifecycle='disposed' THEN RAISE EXCEPTION 'Campaign graph disposed'; END IF;
      IF lifecycle='cleaning' AND NOT ((TG_OP='DELETE' OR (TG_TABLE_NAME='audit_logs' AND TG_OP='UPDATE' AND v_row->>'actorId' IS NULL AND
        v_row->>'targetType'='SyntheticCampaign' AND v_row->>'targetId'='${input.id}' AND v_row->'details'=jsonb_build_object('profile','${profile}','disposition','redacted-synthetic-audit'))) AND
        (SELECT count(DISTINCT relation) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='relation' AND mode='ShareRowExclusiveLock' AND granted AND relation IN (${relationIds}))=${tables.length})
        THEN RAISE EXCEPTION 'Campaign graph cleaning'; END IF;
      IF lifecycle='identities' AND TG_OP='UPDATE' AND (rowkey IS DISTINCT FROM oldkey OR EXISTS(SELECT 1 FROM jsonb_each_text(v_row) e WHERE e.key IN (${immutable.map(x => `'${x}'`).join(',')}) AND v_row->e.key IS DISTINCT FROM prior->e.key)) THEN RAISE EXCEPTION 'Campaign parent or key transfer'; END IF;
      IF lifecycle='identities' AND TG_OP<>'DELETE' THEN
        FOR edge IN SELECT * FROM jsonb_each_text(v_row) LOOP
          parent_table := '${JSON.stringify(parents)}'::jsonb->>edge.key;
          IF parent_table IS NOT NULL AND edge.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=parent_table AND row_key=jsonb_build_object('id',edge.value) AND NOT deleted) THEN RAISE EXCEPTION 'Foreign campaign graph reference'; END IF;
        END LOOP;
        IF TG_TABLE_NAME='users' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'id' AND email=v_row->>'email') OR
          v_row->>'role'<>'buyer' OR v_row->>'emailVerifiedAt' IS NULL OR v_row->>'phone' IS NOT NULL OR v_row->>'avatarKey' IS NOT NULL OR v_row->>'avatarUploadId' IS NOT NULL OR v_row->>'avatarUrl' IS NOT NULL OR v_row->>'suspendedAt' IS NOT NULL OR v_row->>'suspendedById' IS NOT NULL OR v_row->>'deletionScheduledAt' IS NOT NULL) THEN RAISE EXCEPTION 'Synthetic identity changed'; END IF;
        IF TG_TABLE_NAME='dealerships' AND (v_row->>'id'<>'${rootId}' OR v_row->>'slug'<>'${rootSlug}' OR v_row->>'contactPhone' IS DISTINCT FROM '${rootContact}' OR v_row->>'status'<>'recovery' OR v_row->>'admissionMode'<>'synthetic' OR v_row->>'admittedAt' IS NOT NULL OR v_row->>'checkedEvidence' IS NOT NULL OR v_row->>'contactConfirmedAt' IS NOT NULL OR v_row->>'logoUrl' IS NOT NULL) THEN RAISE EXCEPTION 'Synthetic root identity changed'; END IF;
        IF TG_TABLE_NAME IN ('listings','listing_drafts','conversations') AND v_row->>'businessId' IS DISTINCT FROM '${rootId}' THEN RAISE EXCEPTION 'Campaign business required'; END IF;
        IF TG_TABLE_NAME='dealership_members' AND v_row->>'userId'='${owner.id}' AND v_row->>'role'<>'owner' THEN RAISE EXCEPTION 'Synthetic owner changed'; END IF;
        IF TG_TABLE_NAME='conversations' AND NOT EXISTS(SELECT 1 FROM public.listings l WHERE l.id=v_row->>'listingId' AND l."sellerId"=v_row->>'sellerId' AND l."businessId"=v_row->>'businessId') THEN RAISE EXCEPTION 'Campaign conversation parents disagree'; END IF;
        IF TG_TABLE_NAME IN ('messages','conversation_participants') AND NOT EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=v_row->>'conversationId' AND coalesce(v_row->>'senderId',v_row->>'userId') IN (c."buyerId",c."sellerId")) THEN RAISE EXCEPTION 'Campaign participant mismatch'; END IF;
        IF TG_TABLE_NAME='conversations' AND EXISTS(SELECT 1 FROM jsonb_each_text(v_row) e WHERE e.key IN ('lastMessageId','firstBuyerMessageId','firstSellerReplyId') AND e.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.id=e.value AND m."conversationId"=v_row->>'id')) THEN RAISE EXCEPTION 'Campaign message pointer mismatch'; END IF;
        IF TG_TABLE_NAME='verified_contact_phones' AND (v_row->>'phone' IS DISTINCT FROM '${rootContact}' OR EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone=v_row->>'phone' AND id<>v_row->>'id')) THEN RAISE EXCEPTION 'Campaign contact proof collision'; END IF;
        IF TG_TABLE_NAME='staff_grants' AND (v_row->>'userId'<>'${coordinator.id}' OR v_row->>'capability' NOT IN ('staff.manage','founder.control')) THEN RAISE EXCEPTION 'Unsupported campaign grant'; END IF;
        IF TG_TABLE_NAME='audit_logs' AND (v_row->>'targetType'<>'User' OR NOT EXISTS(SELECT 1 FROM "${n}".campaign_entities WHERE user_id=v_row->>'targetId') OR v_row->>'action'<>'STAFF_CAPABILITY_BOOTSTRAP' OR v_row->>'targetId'<>'${coordinator.id}' OR v_row->>'actorId' IS NOT NULL OR NOT (
          ${['staff.manage','founder.control'].map(c => `(v_row->>'id'='${uuid(`campaign897-business:${input.id}:audit:${c}`)}' AND v_row->'details'=jsonb_build_object('capability','${c}','reason','Synthetic storage-only reservation ${input.id}'))`).join(' OR ')})) THEN RAISE EXCEPTION 'Unsupported campaign audit'; END IF;
        IF TG_TABLE_NAME='content_reports' AND (NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=CASE v_row->>'targetType' WHEN 'listing' THEN 'listings' WHEN 'user' THEN 'users' WHEN 'message' THEN 'messages' ELSE '' END AND NOT deleted AND row_key=jsonb_build_object('id',v_row->>'targetId')) OR v_row->>'messageContext' IS NOT NULL) THEN RAISE EXCEPTION 'Unsupported report target'; END IF;
        IF TG_TABLE_NAME='messages' AND (v_row->>'kind'<>'text' OR coalesce(v_row->'metadata','null'::jsonb) NOT IN ('null'::jsonb,'{}'::jsonb)) THEN RAISE EXCEPTION 'Unsupported message media'; END IF;
        IF TG_TABLE_NAME='listing_drafts' AND (jsonb_typeof(v_row->'payload')<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(v_row->'payload') e WHERE e.key NOT IN ('description','media') OR (e.key='description' AND jsonb_typeof(e.value)<>'string') OR (e.key='media' AND e.value<>'[]'::jsonb))) THEN RAISE EXCEPTION 'Unsupported draft payload'; END IF;
        IF TG_TABLE_NAME='notification_preferences' AND (jsonb_typeof(v_row->'optOuts')<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(v_row->'optOuts') e WHERE jsonb_typeof(e.value)<>'boolean')) THEN RAISE EXCEPTION 'Unsupported notification preferences'; END IF;
        IF TG_TABLE_NAME='listings' AND (v_row->>'pendingVideoGenerationId' IS NOT NULL OR v_row->>'activeVideoGenerationId' IS NOT NULL) THEN RAISE EXCEPTION 'Unsupported listing video'; END IF;
      END IF;
      IF ((SELECT count(*) FROM "${n}".campaign_records)>=128 AND NOT EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE table_name=TG_TABLE_NAME AND row_key=rowkey)) OR (SELECT count(*) FROM "${n}".campaign_events)>=2048 OR (lifecycle='identities' AND
        (SELECT count(*) FROM "${n}".campaign_events)+(SELECT count(*) FROM "${n}".campaign_records WHERE NOT deleted)+4>=2048) THEN RAISE EXCEPTION 'Campaign graph limit'; END IF;
      fingerprint := md5(v_row::text);
      INSERT INTO "${n}".campaign_records(table_name,row_key,row_hash,deleted) VALUES(TG_TABLE_NAME,rowkey,fingerprint,TG_OP='DELETE') ON CONFLICT(table_name,row_key) DO UPDATE SET row_hash=excluded.row_hash,version="${n}".campaign_records.version+1,deleted=excluded.deleted;
      INSERT INTO "${n}".campaign_events(table_name,row_key,mutation,row_hash) VALUES(TG_TABLE_NAME,rowkey,TG_OP,fingerprint);
      UPDATE "${n}".campaign_manifest SET journal_hash=${journalHash},event_hash=${eventHash};
      RETURN NULL;
    END $fn$;
    UPDATE "${n}".campaign_manifest SET tracking_hash=md5(pg_get_functiondef('"${n}".track_business()'::regprocedure));
    ${tables.map(table => `CREATE TRIGGER "${n}_business" AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION "${n}".track_business();`).join('\n')}`;
  const collision = `DO $guard$ BEGIN
    IF EXISTS(SELECT 1 FROM public.verified_contact_phones WHERE phone='${rootContact}') OR EXISTS(SELECT 1 FROM public.users WHERE phone='${rootContact}') OR EXISTS(SELECT 1 FROM public.dealerships WHERE id='${rootId}' OR slug='${rootSlug}' OR "contactPhone"='${rootContact}') OR
      EXISTS(SELECT 1 FROM public.users u JOIN "${n}".campaign_entities e ON u.id=e.user_id OR u.email=e.email) OR
      EXISTS(SELECT 1 FROM public.dealership_members WHERE id='${uuid(`campaign897-business:${input.id}:membership:owner`)}') OR
      EXISTS(SELECT 1 FROM public.audit_logs WHERE id IN (${['staff.manage','founder.control'].map(c => `'${uuid(`campaign897-business:${input.id}:audit:${c}`)}'`).join(',')})) THEN RAISE EXCEPTION 'Campaign identity collision'; END IF;
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
    sql(`BEGIN; ${lock} ${setup} ${collision} ${audit} ${integrity} COMMIT;`);
  } else {
    sql(`BEGIN; ${lock} ${integrity} COMMIT;`);
  }
  let state = sql(`SELECT state FROM "${n}".campaign_manifest;`);
  if (input.kind === 'fixture' && state !== 'identities') throw new Error('Campaign fixture is terminal');
  if (input.kind === 'reset' && state !== 'disposed') {
    sql(`BEGIN; ${lock} ${integrity} ${preflight} UPDATE "${n}".campaign_manifest SET state='cleaning'; COMMIT;`);
    // Explicit child-first deletion. AFTER triggers verify the lock-held cleaning
    // transition and record each deletion. Never mark unexamined rows disposed.
    const order = ['content_reports', 'staff_grants', 'favorites', 'business_enquiry_audits', 'conversation_participants', 'messages', 'conversations', 'listing_drafts', 'listings', 'dealership_invitations', 'dealership_members', 'verified_contact_phones', 'owned_vehicles', 'blocked_users', 'notification_preferences', 'dealerships', 'users'];
    const deletes = order.map(table => `DELETE FROM public.${table} t USING "${n}".campaign_records r WHERE r.table_name='${table}' AND NOT r.deleted AND ${key('to_jsonb(t)',table)}=r.row_key;`).join('\n');
    sql(`BEGIN; ${lock} ${integrity} ${preflight}
      UPDATE public.audit_logs a SET "actorId"=NULL,"targetType"='SyntheticCampaign',"targetId"='${input.id}',details='{"profile":"${profile}","disposition":"redacted-synthetic-audit"}' FROM "${n}".campaign_records r WHERE r.table_name='audit_logs' AND NOT r.deleted AND r.row_key=jsonb_build_object('id',a.id);
      ${deletes}
      ${integrity} DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs') THEN RAISE EXCEPTION 'Campaign disposal incomplete'; END IF; END $guard$;
      UPDATE "${n}".campaign_manifest SET state='disposed'; COMMIT;`);
    state = 'disposed';
  }
  if (state === 'disposed') sql(`BEGIN; ${lock} ${integrity} ${preflight}
    DO $guard$ BEGIN
      IF EXISTS(SELECT 1 FROM public.audit_logs a JOIN "${n}".campaign_records r ON r.table_name='audit_logs' AND r.row_key=jsonb_build_object('id',a.id) WHERE a."actorId" IS NOT NULL OR a."targetType"<>'SyntheticCampaign' OR a."targetId"<>'${input.id}' OR a.details IS DISTINCT FROM '{"profile":"${profile}","disposition":"redacted-synthetic-audit"}'::jsonb) THEN RAISE EXCEPTION 'Campaign audit disposition changed'; END IF;
      IF EXISTS(SELECT 1 FROM "${n}".campaign_records WHERE NOT deleted AND table_name<>'audit_logs') THEN RAISE EXCEPTION 'Campaign terminal rows present'; END IF; END $guard$; COMMIT;`);
  console.log(JSON.stringify({ profile, candidate: input.candidate, namespace: n, reservationId: input.id, protectedReceipt: `${n}.campaign_entities`, state,
    identities: state === 'disposed' ? 0 : identities.length, fixtures: state === 'disposed' ? 'absent' : 'present', tombstone: state === 'disposed' }));
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
