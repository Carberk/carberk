/** Serialized into one fixed remote Node process. There is no arbitrary shell/SQL input. */
export function remoteProgram(payload) {
  return `(${remoteMain.toString()})(${JSON.stringify(payload)})`;
}
function remoteMain(input) {
  try {
    const { spawnSync } = require('node:child_process');
    const p = input.identity; const e = process.env;
    if (!['fixture', 'reset', 'probe'].includes(input.kind) || !/^[a-f0-9]{32}$/.test(input.id) ||
        input.namespace !== `cf_${input.id}` || !/^[a-f0-9]{40}$/.test(input.target)) throw new Error();
    if (e.RAILWAY_PROJECT_ID !== p.projectId || e.RAILWAY_ENVIRONMENT_ID !== p.environmentId || e.RAILWAY_SERVICE_ID !== p.services.api ||
        e.RAILWAY_ENVIRONMENT_NAME !== 'staging' || e.APP_ENV !== 'staging' || e.SMS_DRIVER !== 'mock' || e.AUTOTM_COMMIT_SHA !== input.target) throw new Error();
    const db = new URL(e.DATABASE_URL); const media = new URL(e.MINIO_ENDPOINT); const publicMedia = new URL(e.MINIO_PUBLIC_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'postgres.railway.internal' || db.search || db.hash || media.username || media.password || media.search || media.hash ||
        publicMedia.username || publicMedia.password || publicMedia.search || publicMedia.hash) throw new Error();
    db.username = ''; db.password = '';
    if (db.toString().replace(/\/$/, '') !== p.origins.database || media.origin !== p.origins.media || publicMedia.origin !== p.origins.publicMedia) throw new Error();
    const sql = (query) => {
      const result = spawnSync('psql', ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At'], {
        input: query, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
        env: { ...e, PGDATABASE: e.DATABASE_URL, PGAPPNAME: `staging-control-${input.id}` },
      });
      if (result.status !== 0 || result.error) throw new Error();
      return result.stdout.trim();
    };
    const namespace = input.namespace; // Exact prefix plus hex ID, never caller SQL.
    const exists = sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${namespace}';`) === '1';
    if (exists && sql(`SELECT reservation_id FROM "${namespace}".manifest;`) !== input.id) throw new Error();
    const { createHash } = require('node:crypto');
    const uuid = (label) => {
      const hex = createHash('sha256').update(`${input.id}:${label}`).digest('hex').slice(0,32);
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
    };
    const user = uuid('seller'); const listing = uuid('listing');
    const unchanged = `DO $guard$ BEGIN
      IF (SELECT count(*) FROM "${namespace}".records) <> 2 OR
         NOT EXISTS(SELECT 1 FROM "${namespace}".records WHERE table_name='users' AND row_id='${user}') OR
         NOT EXISTS(SELECT 1 FROM "${namespace}".records WHERE table_name='listings' AND row_id='${listing}')
      THEN RAISE EXCEPTION 'Owned fixture manifest incomplete'; END IF;
      IF EXISTS(SELECT 1 FROM "${namespace}".records r WHERE
        (r.table_name='users' AND r.original IS DISTINCT FROM (SELECT to_jsonb(u) FROM public.users u WHERE u.id=r.row_id)) OR
        (r.table_name='listings' AND r.original IS DISTINCT FROM (SELECT to_jsonb(l) FROM public.listings l WHERE l.id=r.row_id)))
      THEN RAISE EXCEPTION 'Owned fixture changed; explicit disposition required'; END IF;
      END $guard$;`;
    if (input.kind === 'fixture') {
      if (exists) sql(`BEGIN; SELECT id FROM public.users WHERE id='${user}' FOR UPDATE; SELECT id FROM public.listings WHERE id='${listing}' FOR UPDATE; ${unchanged} COMMIT;`);
      else sql(`BEGIN;
        SELECT pg_advisory_xact_lock(hashtextextended('${namespace}',0));
        CREATE SCHEMA "${namespace}";
        CREATE TABLE "${namespace}".manifest(reservation_id text PRIMARY KEY);
        INSERT INTO "${namespace}".manifest VALUES ('${input.id}');
        CREATE TABLE "${namespace}".records(table_name text PRIMARY KEY CHECK(table_name IN ('users','listings')), row_id text UNIQUE NOT NULL, original jsonb NOT NULL);
        DO $guard$ BEGIN
          IF EXISTS(SELECT 1 FROM public.users WHERE id='${user}') OR EXISTS(SELECT 1 FROM public.listings WHERE id='${listing}')
          THEN RAISE EXCEPTION 'Fixture ID collision'; END IF;
          IF NOT EXISTS(SELECT 1 FROM public.models) OR NOT EXISTS(SELECT 1 FROM public.cities)
          THEN RAISE EXCEPTION 'Catalog prerequisite missing'; END IF;
        END $guard$;
        INSERT INTO public.users(id,"displayName",locale,role,"updatedAt") VALUES ('${user}','Carberk synthetic reservation seller','ru','seller',now());
        INSERT INTO public.listings(id,"sellerId",status,"brandId","modelId","cityId",year,"mileageKm","priceAmount","priceTmt",description,"publishedAt","updatedAt",damaged)
          SELECT '${listing}','${user}','active',m."brandId",m.id,c.id,2020,1,100,100,'Synthetic reserved staging fixture. No real vehicle or seller.',now(),now(),false
          FROM (SELECT id,"brandId" FROM public.models ORDER BY id LIMIT 1) m CROSS JOIN (SELECT id FROM public.cities ORDER BY id LIMIT 1) c;
        INSERT INTO "${namespace}".records SELECT 'users',id,to_jsonb(u) FROM public.users u WHERE id='${user}';
        INSERT INTO "${namespace}".records SELECT 'listings',id,to_jsonb(l) FROM public.listings l WHERE id='${listing}';
        COMMIT;`);
      if (sql(`SELECT count(*) FROM public.listings WHERE id='${listing}' AND "sellerId"='${user}' AND status='active';`) !== '1') throw new Error();
      console.log(JSON.stringify({ fixtures: 'present', namespace, listingId: listing, sellerId: user }));
    } else if (input.kind === 'reset') {
      if (exists) sql(`BEGIN;
        SELECT pg_advisory_xact_lock(hashtextextended('${namespace}',0));
        SELECT id FROM public.users WHERE id='${user}' FOR UPDATE;
        SELECT id FROM public.listings WHERE id='${listing}' FOR UPDATE;
        ${unchanged}
        DO $guard$ DECLARE fk record; found bigint; BEGIN
          FOR fk IN SELECT conrelid::regclass AS source, a.attname AS column_name, confrelid::regclass AS target,
            cardinality(conkey) AS columns FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE contype='f' AND confrelid IN ('public.users'::regclass,'public.listings'::regclass)
          LOOP
            IF fk.columns <> 1 THEN RAISE EXCEPTION 'Composite reference requires disposition'; END IF;
            EXECUTE format('SELECT count(*) FROM %s WHERE %I=$1',fk.source,fk.column_name)
              INTO found USING CASE WHEN fk.target='public.users'::regclass THEN '${user}' ELSE '${listing}' END;
            IF fk.source='public.listings'::regclass AND fk.column_name='sellerId' THEN
              IF found <> 1 THEN RAISE EXCEPTION 'Unexpected seller references'; END IF;
            ELSIF found <> 0 THEN RAISE EXCEPTION 'Related application data requires explicit disposition'; END IF;
          END LOOP;
        END $guard$;
        DELETE FROM public.listings WHERE id='${listing}';
        DELETE FROM public.users WHERE id='${user}';
        DROP TABLE "${namespace}".records; DROP TABLE "${namespace}".manifest; DROP SCHEMA "${namespace}";
        COMMIT;`);
      if (sql(`SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='${namespace}')+(SELECT count(*) FROM public.users WHERE id='${user}')+(SELECT count(*) FROM public.listings WHERE id='${listing}');`) !== '0') throw new Error();
      console.log(JSON.stringify({ fixtures: 'absent', namespace }));
    } else {
      if (sql('SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;') !== '0') throw new Error();
      const migrations = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`));
      if (JSON.stringify(migrations) !== JSON.stringify(input.expectedMigrations) ||
          !['unchanged', 'retained-additive'].includes(input.schemaDisposition)) throw new Error();
      if (exists) sql(`BEGIN; SELECT id FROM public.users WHERE id='${user}' FOR SHARE; SELECT id FROM public.listings WHERE id='${listing}' FOR SHARE; ${unchanged} COMMIT;`);
      else if (sql(`SELECT (SELECT count(*) FROM public.users WHERE id='${user}')+(SELECT count(*) FROM public.listings WHERE id='${listing}');`) !== '0') throw new Error();
      console.log(JSON.stringify({ fixtures: exists ? 'present' : 'absent', schema: input.schemaDisposition, migrations,
        sha: e.AUTOTM_COMMIT_SHA, listingId: exists ? listing : null, sellerId: exists ? user : null }));
    }
  } catch {
    console.error('Reserved staging remote operation refused or incomplete; diagnostics suppressed');
    process.exitCode = 1;
  }
}
