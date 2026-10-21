// S2A remote program for the prelaunch clean reset (#901). It validates the
// fixed command and in-container identity, then inventories PostgreSQL and,
// for `rows`, truncates the S1 plan's exact disposable tables in one
// transaction. `redis-inventoried` is a separate read-only Redis observation
// before any PostgreSQL access; the `redis` deletion phase always refuses until
// a durable completion receipt exists. It makes no object or platform call.
// The operator CLI remains default closed.
import { readFileSync } from 'node:fs';

import { QUEUES } from './staging-clean-reset.mjs';

const text = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const manifest = JSON.parse(text('./staging-clean-reset.tables.json'));
// The actual S1 planner, embedded verbatim: the module is pure and import-free,
// so only its `export` keywords are removed. No table list is mirrored here.
const s1 = text('./staging-clean-reset.mjs');
const planner = s1.replace(/^export (?=(?:const|function) )/gm, '');
if (/\bimport\b|\brequire\s*\(/.test(s1) || /^export\b/m.test(planner) || !/^function planTables\(/m.test(planner))
  throw new Error('Clean reset planner source must stay pure');
const plannerProgram = `(() => { 'use strict';\n${planner}\nreturn planTables; })()`;
// The operator CLI's pinned staging target (scripts/staging.mjs). Redis phases compare
// the caller's claims with it; a claimed worker ID alone is no attestation.
const STAGING = { projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2',
  services: { api: '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0', worker: '24aa02e0-25a9-4e80-9cc2-c1795ef82091' }, redis: 'redis://redis.railway.internal:6379/0' };

/** Serialized into one fixed remote Node process. There is no arbitrary shell/SQL input. */
export function cleanResetProgram(payload) {
  return `(${cleanResetMain.toString()})(${JSON.stringify(payload)}, ${JSON.stringify(manifest)}, ${plannerProgram}, ` +
    `${cleanResetRedis.toString()}, ${JSON.stringify({ ...STAGING, queues: QUEUES })})`;
}

function cleanResetMain(input, manifest, planTables, cleanResetRedis, staging) {
  const report = error => {
    const message = typeof error?.message === 'string' && /^Clean reset (refused: .+|executor not implemented)$/.test(error.message)
      ? error.message : 'Clean reset refused or incomplete; diagnostics suppressed';
    console.error(message);
    process.exitCode = 1;
  };
  try {
    const refuse = () => { throw new Error('Clean reset refused: target'); };
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const exact = (value, keys) => record(value) && Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join(',') === [...keys].sort().join(',');
    // Strict strings only: arrays and numbers must never coerce into an identity.
    const text = pattern => value => typeof value === 'string' && pattern.test(value);
    const id = text(/^[a-zA-Z0-9-]{1,80}$/); const hex32 = text(/^[a-f0-9]{32}$/); const hex64 = text(/^[a-f0-9]{64}$/); const sha = text(/^[a-f0-9]{40}$/);
    const base = ['operation', 'phase', 'operationId', 'reservationId', 'candidate', 'identity'];
    // `redis-inventoried` is a remote transport selector, not an S1 ledger phase.
    const keys = { inventoried: base, rows: [...base, 'expectedInventory'], 'redis-inventoried': base, redis: [...base, 'expectedInventory'] };
    if (!record(input) || typeof input.phase !== 'string' || !Object.hasOwn(keys, input.phase) || !exact(input, keys[input.phase]) ||
        input.operation !== 'clean-reset' || !hex32(input.operationId) || !hex32(input.reservationId) || !sha(input.candidate)) refuse();
    const redisPhase = input.phase === 'redis-inventoried' || input.phase === 'redis';
    // The digest binds schema definitions (tables, triggers, FKs), retained contents and disposable contents.
    if (input.phase === 'rows' && (!exact(input.expectedInventory, ['schema', 'retained', 'disposable']) ||
        !['schema', 'retained', 'disposable'].every(part => hex64(input.expectedInventory[part])))) refuse();
    if (input.phase === 'redis' && (!exact(input.expectedInventory, ['digest']) || !hex64(input.expectedInventory.digest))) refuse();
    const p = input.identity;
    if (!exact(p, ['projectId', 'environmentId', 'services', 'origins']) || !exact(p.services, ['api', 'worker']) ||
        !exact(p.origins, redisPhase ? ['database', 'redis'] : ['database']) ||
        ![p.projectId, p.environmentId, p.services.api, p.services.worker].every(id) ||
        typeof p.origins.database !== 'string') refuse();
    const e = process.env;
    if (e.RAILWAY_PROJECT_ID !== p.projectId || e.RAILWAY_ENVIRONMENT_ID !== p.environmentId || e.RAILWAY_SERVICE_ID !== p.services.api ||
        e.RAILWAY_ENVIRONMENT_NAME !== 'staging' || e.APP_ENV !== 'staging' || e.AUTOTM_COMMIT_SHA !== input.candidate) refuse();
    let db;
    try { db = new URL(e.DATABASE_URL); } catch { refuse(); }
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'postgres.railway.internal' || db.search || db.hash) refuse();
    db.username = ''; db.password = '';
    if (db.toString().replace(/\/$/, '') !== p.origins.database) refuse();
    // Redis phases never open PostgreSQL or start a subprocess.
    if (redisPhase) return cleanResetRedis(input, staging, refuse).catch(report);

    const refused = message => { throw new Error(`Clean reset refused: ${message}`); };
    const parts = ['schema', 'retained', 'disposable'];
    const digestOf = value => exact(value, parts) && parts.every(part => hex64(value[part])) ? value : refused('Invalid inventory digest');
    const sameDigest = (a, b) => parts.every(part => a[part] === b[part]);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // Every interpolated value is a validated identity, digest or manifest table name, never caller SQL.
    const literal = value => text(/^[a-zA-Z0-9_.-]{1,80}$/)(value) ? `'${value}'` : refused('Unsafe SQL literal');
    const table = name => text(/^public\.[a-z_][a-z0-9_]{0,62}$/)(name) ? name : refused('Unsafe table name');

    // Credentials reach psql only through its child environment, never argv or output.
    const url = new URL(e.DATABASE_URL);
    const pg = Object.fromEntries(Object.entries({ PATH: e.PATH, PGHOST: url.hostname, PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGAPPNAME: `clean-reset-${input.operationId}`, PGCONNECT_TIMEOUT: '10' }).filter(([, value]) => typeof value === 'string'));
    const { spawnSync } = require('node:child_process');
    const marker = 'clean-reset:';
    const sql = query => {
      const result = spawnSync('psql', ['-X', '--no-psqlrc', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], {
        input: query, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024, env: pg });
      // psql stderr can name the connection; it is never forwarded.
      const lines = typeof result.stdout === 'string' ? result.stdout.split('\n').filter(line => line.startsWith(marker)) : [];
      if (result.error || result.status !== 0 || lines.length !== 1) refused('database operation failed');
      return JSON.parse(lines[0].slice(marker.length));
    };

    // One fixed operator receipt store for lost-response recovery of the current operation only.
    const OPERATOR = 'staging_clean_reset';
    const operatorDefinition = ['nsp true true', 'rel receipts r p false true true', 'rel receipts_pkey i p false true true',
      ...['operation_id text', 'reservation_id text', 'candidate text', 'project_id text', 'environment_id text', 'phase text',
        'expected jsonb', 'result jsonb', 'committed_at timestamp with time zone'].map((column, index) => `col receipts ${index + 1} ${column} true false false`),
      'con receipts receipts_pkey p PRIMARY KEY (operation_id)', 'type receipts c', 'type _receipts b', 'other 0'].sort();
    const operatorDefinitionSql = `'${JSON.stringify(operatorDefinition)}'::jsonb`;
    const operatorSql = `(SELECT coalesce(jsonb_agg(d ORDER BY d COLLATE "C"), '[]') FROM (WITH o AS (SELECT oid, nspowner, nspacl FROM pg_namespace WHERE nspname = '${OPERATOR}')
      SELECT format('nsp %s %s', (pg_get_userbyid(o.nspowner) = current_user)::text, (o.nspacl IS NULL)::text) AS d FROM o
      UNION ALL SELECT format('rel %s %s %s %s %s %s', c.relname, c.relkind, c.relpersistence, c.relrowsecurity::text, (c.relacl IS NULL)::text, (c.relowner = o.nspowner)::text)
        FROM pg_class c JOIN o ON o.oid = c.relnamespace
      UNION ALL SELECT format('col %s %s %s %s %s %s %s', c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text, a.atthasdef::text,
          (a.attidentity <> '' OR a.attgenerated <> '')::text)
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN o ON o.oid = c.relnamespace WHERE c.relkind <> 'i' AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL SELECT format('con %s %s %s %s', c.relname, k.conname, k.contype, pg_get_constraintdef(k.oid))
        FROM pg_constraint k JOIN o ON o.oid = k.connamespace LEFT JOIN pg_class c ON c.oid = k.conrelid WHERE k.contype <> 'n'
      UNION ALL SELECT format('type %s %s', t.typname, t.typtype) FROM pg_type t JOIN o ON o.oid = t.typnamespace
      UNION ALL SELECT format('other %s', (SELECT count(*) FROM pg_proc WHERE pronamespace = o.oid) + (SELECT count(*) FROM pg_operator WHERE oprnamespace = o.oid)
        + (SELECT count(*) FROM pg_collation WHERE collnamespace = o.oid) + (SELECT count(*) FROM pg_conversion WHERE connamespace = o.oid)
        + (SELECT count(*) FROM pg_opclass WHERE opcnamespace = o.oid) + (SELECT count(*) FROM pg_opfamily WHERE opfnamespace = o.oid)
        + (SELECT count(*) FROM pg_ts_config WHERE cfgnamespace = o.oid) + (SELECT count(*) FROM pg_ts_dict WHERE dictnamespace = o.oid)
        + (SELECT count(*) FROM pg_ts_parser WHERE prsnamespace = o.oid) + (SELECT count(*) FROM pg_ts_template WHERE tmplnamespace = o.oid)
        + (SELECT count(*) FROM pg_extension WHERE extnamespace = o.oid) + (SELECT count(*) FROM pg_statistic_ext WHERE stxnamespace = o.oid)
        + (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = o.oid AND NOT t.tgisinternal)
        + (SELECT count(*) FROM pg_policy y JOIN pg_class c ON c.oid = y.polrelid WHERE c.relnamespace = o.oid)
        + (SELECT count(*) FROM pg_rewrite w JOIN pg_class c ON c.oid = w.ev_class WHERE c.relnamespace = o.oid)) FROM o) s)`;

    // Retained names come from the manifest the planner reads and are checked against its plan below.
    const retain = Object.entries(manifest.tables).filter(([, disposition]) => disposition.startsWith('retain')).map(([name]) => table(`public.${name}`)).sort();
    const retainSql = `ARRAY[${retain.map(literal).join(', ')}]::text[]`;
    const sha256 = rows => `encode(sha256(convert_to(coalesce(${rows}, ''), 'UTF8')), 'hex')`;
    // Read-only catalog and content inventory. `schema` hashes every definition outside the
    // operator schema; `retained` and `disposable` hash exact public table contents.
    const inventorySql = `(WITH ns AS (SELECT oid, nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'),
      dn AS (SELECT oid, nspname FROM ns WHERE nspname <> '${OPERATOR}'),
      rel AS (SELECT c.oid, n.nspname, c.relname, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN dn n ON n.oid = c.relnamespace),
      content AS (SELECT r.relname, 'public.' || r.relname AS name, x.h, x.c FROM rel r CROSS JOIN LATERAL (
          SELECT (xpath('/row/h/text()', q))[1]::text AS h, (xpath('/row/c/text()', q))[1]::text::bigint AS c FROM query_to_xml(format(
            'SELECT encode(sha256(convert_to(coalesce(string_agg(v, chr(10) ORDER BY v COLLATE "C"), ''''), ''UTF8'')), ''hex'') AS h, count(*) AS c FROM (SELECT to_jsonb(t)::text AS v FROM %I.%I t) s',
            r.nspname, r.relname), false, true, '') AS q) x
        WHERE r.nspname = 'public' AND r.relkind = 'r'),
      defs AS (SELECT 'ns ' || quote_ident(nspname) AS d FROM dn
        UNION ALL SELECT format('rel %I.%I %s %s %s %s', nspname, relname, relkind, relpersistence, relrowsecurity::text, relforcerowsecurity::text) FROM rel
        UNION ALL SELECT format('col %I.%I %s %I %s %s %s %s', r.nspname, r.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
            coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attidentity::text || a.attgenerated::text)
          FROM pg_attribute a JOIN rel r ON r.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attnum > 0 AND NOT a.attisdropped
        UNION ALL SELECT format('con %s %s %I %s %s', k.conrelid::regclass, k.contypid::regtype, k.conname, k.contype, pg_get_constraintdef(k.oid))
          FROM pg_constraint k WHERE k.connamespace IN (SELECT oid FROM dn)
        UNION ALL SELECT 'idx ' || pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN rel r ON r.oid = i.indrelid
        UNION ALL SELECT format('trg %s %s', t.tgenabled, pg_get_triggerdef(t.oid)) FROM pg_trigger t JOIN rel r ON r.oid = t.tgrelid WHERE NOT t.tgisinternal
        UNION ALL SELECT format('fn %s %s %s %s', p.oid::regprocedure, p.prokind, p.prosecdef::text, CASE WHEN p.prokind IN ('f', 'p') THEN pg_get_functiondef(p.oid) ELSE '' END)
          FROM pg_proc p WHERE p.pronamespace IN (SELECT oid FROM dn)
        UNION ALL SELECT format('type %s %s', t.oid::regtype, t.typtype) FROM pg_type t WHERE t.typnamespace IN (SELECT oid FROM dn)
        UNION ALL SELECT format('enum %s %s %s', m.enumtypid::regtype, m.enumsortorder, m.enumlabel) FROM pg_enum m JOIN pg_type t ON t.oid = m.enumtypid
          WHERE t.typnamespace IN (SELECT oid FROM dn)
        UNION ALL SELECT 'rule ' || pg_get_ruledef(w.oid) FROM pg_rewrite w JOIN rel r ON r.oid = w.ev_class
        UNION ALL SELECT format('pol %s %I %s %s %s %s', y.polrelid::regclass, y.polname, y.polcmd, y.polpermissive::text, coalesce(pg_get_expr(y.polqual, y.polrelid), ''),
            coalesce(pg_get_expr(y.polwithcheck, y.polrelid), '')) FROM pg_policy y JOIN rel r ON r.oid = y.polrelid
        UNION ALL SELECT format('evt %I %s %s %s', evtname, evtevent, evtenabled, evtfoid::regprocedure) FROM pg_event_trigger
        UNION ALL SELECT format('ext %I %s %s', x.extname, x.extversion, x.extnamespace::regnamespace) FROM pg_extension x),
      fks AS (SELECT k.conname, fn.nspname || '.' || fc.relname AS f, tn.nspname || '.' || tc.relname AS t FROM pg_constraint k
          JOIN pg_class fc ON fc.oid = k.conrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace JOIN pg_class tc ON tc.oid = k.confrelid JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE k.contype = 'f' AND (fn.oid IN (SELECT oid FROM dn) OR tn.oid IN (SELECT oid FROM dn))),
      trg AS (SELECT CASE WHEN r.nspname = 'public' THEN r.relname::text ELSE r.nspname || '.' || r.relname END AS tbl, t.tgname, pn.nspname AS fs, (t.tgtype::int & 32) <> 0 AS tr
        FROM pg_trigger t JOIN rel r ON r.oid = t.tgrelid JOIN pg_proc fp ON fp.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = fp.pronamespace WHERE NOT t.tgisinternal)
      SELECT jsonb_build_object(
        'backends', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'),
        'eventTriggers', (SELECT count(*) FROM pg_event_trigger),
        'schemas', (SELECT coalesce(jsonb_agg(nspname::text ORDER BY nspname), '[]') FROM ns),
        'operator', ${operatorSql},
        'relations', (SELECT coalesce(jsonb_agg(relname::text ORDER BY relname), '[]') FROM rel WHERE nspname = 'public' AND relkind NOT IN ('r', 'i', 'S')),
        'tables', (SELECT coalesce(jsonb_object_agg(relname, c), '{}') FROM content),
        'foreignKeys', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', conname, 'from', f, 'to', t) ORDER BY conname, f), '[]') FROM fks),
        'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', tbl, 'name', tgname, 'functionSchema', fs, 'truncate', tr) ORDER BY tbl, tgname), '[]') FROM trg),
        'approvedDiagnosticCenters', CASE WHEN to_regclass('public.diagnostic_centers') IS NULL THEN 0 ELSE (xpath('/row/c/text()', query_to_xml(
          'SELECT count(*) AS c FROM public.diagnostic_centers WHERE "operationalApproval" IS NOT NULL', false, true, '')))[1]::text::bigint END,
        'digest', jsonb_build_object(
          'schema', ${sha256(`(SELECT string_agg(d, chr(10) ORDER BY d COLLATE "C") FROM defs)`)},
          'retained', ${sha256(`(SELECT string_agg(format('%s %s %s', name, c, h), chr(10) ORDER BY name COLLATE "C") FROM content WHERE name = ANY (${retainSql}))`)},
          'disposable', ${sha256(`(SELECT string_agg(format('%s %s %s', name, c, h), chr(10) ORDER BY name COLLATE "C") FROM content WHERE NOT (name = ANY (${retainSql})))`)})))`;
    const settings = `SET LOCAL search_path TO pg_catalog, pg_temp; SET LOCAL TimeZone TO 'UTC'; SET LOCAL lock_timeout TO '10s'; SET LOCAL statement_timeout TO '240s';`;
    const operationSql = literal(input.operationId);

    // Read-only observation. The receipt is read in the same snapshot, as data, only when its table exists.
    const observed = sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${settings}
      DO $observe$ DECLARE held jsonb; BEGIN
        IF to_regclass('${OPERATOR}.receipts') IS NOT NULL THEN
          SELECT coalesce(jsonb_agg(to_jsonb(x) - 'committed_at'), '[]') INTO held FROM ${OPERATOR}.receipts x WHERE to_jsonb(x)->>'operation_id' = ${operationSql};
        END IF;
        PERFORM set_config('${OPERATOR}.receipts', coalesce(held, '[]'::jsonb)::text, true);
      END $observe$;
      SELECT '${marker}' || jsonb_build_object('inventory', ${inventorySql}, 'receipts', current_setting('${OPERATOR}.receipts')::jsonb)::text;
      COMMIT;`);
    if (!exact(observed, ['inventory', 'receipts']) || !Array.isArray(observed.receipts)) refused('Invalid inventory');
    const inventory = observed.inventory;
    if (!exact(inventory, ['backends', 'eventTriggers', 'schemas', 'operator', 'relations', 'tables', 'foreignKeys', 'triggers', 'approvedDiagnosticCenters', 'digest']) ||
        ![inventory.schemas, inventory.operator, inventory.relations].every(list => Array.isArray(list) && list.every(item => typeof item === 'string')) ||
        !record(inventory.tables)) refused('Invalid inventory');
    if (inventory.backends !== 0) refused('other database backends present');
    if (inventory.eventTriggers !== 0) refused('Unknown event trigger present');
    const schemas = inventory.schemas.filter(name => name !== OPERATOR);
    if (!same([...inventory.operator].sort(), schemas.length === inventory.schemas.length ? [] : operatorDefinition)) refused(`Invalid operator schema ${OPERATOR}`);
    const cf = schemas.find(name => name.startsWith('cf_'));
    if (cf !== undefined) refused(`cf namespace ${cf} requires separate control disposition`);
    if (inventory.relations.length) refused(`Unknown live relation public.${inventory.relations[0]}`);
    let plan;
    try {
      plan = planTables(manifest, { schemas, tables: Object.entries(inventory.tables).map(([name, rows]) => ({ schema: 'public', name, rows })),
        foreignKeys: inventory.foreignKeys, triggers: inventory.triggers, cfNamespaces: [], approvedDiagnosticCenters: inventory.approvedDiagnosticCenters });
    } catch (error) { refused(typeof error?.message === 'string' ? error.message : 'planner refused'); }
    const live = Object.keys(inventory.tables).map(name => `public.${name}`);
    if (plan.mode !== 'RESTRICT' || !same(plan.retain, retain) || !same(plan.truncate, live.filter(name => !retain.includes(name)).sort()) ||
        plan.detachTriggers.length || plan.retainedNamespaces.length || plan.restartBlockers.length || !plan.truncate.length) refused('Plan does not match inventory');
    const digest = digestOf(inventory.digest);
    const bound = { operation: 'clean-reset', operationId: input.operationId, reservationId: input.reservationId, candidate: input.candidate, environmentId: p.environmentId };

    if (input.phase === 'inventoried') {
      console.log(JSON.stringify({ ...bound, phase: 'inventoried', state: 'observed', digest,
        rows: Object.fromEntries(Object.entries(inventory.tables).map(([name, rows]) => [`public.${name}`, rows]).sort(([a], [b]) => a < b ? -1 : 1)),
        plan: { mode: plan.mode, retain: plan.retain, truncate: plan.truncate } }));
      return;
    }

    const expected = input.expectedInventory;
    // Lost-response replay: only the exact recorded operation whose post-state still matches observes completion.
    if (observed.receipts.length > 1) refused('Invalid operator receipt');
    const [receipt] = observed.receipts;
    if (receipt !== undefined) {
      if (!exact(receipt, ['operation_id', 'reservation_id', 'candidate', 'project_id', 'environment_id', 'phase', 'expected', 'result']) ||
          receipt.operation_id !== input.operationId || receipt.reservation_id !== input.reservationId || receipt.candidate !== input.candidate ||
          receipt.project_id !== p.projectId || receipt.environment_id !== p.environmentId || receipt.phase !== 'rows' ||
          !sameDigest(digestOf(receipt.expected), expected)) refused('Clean-reset operation identity changed');
      if (!sameDigest(digestOf(receipt.result), digest)) refused('Inventory changed since observation');
      console.log(JSON.stringify({ ...bound, phase: 'rows', state: 'observed', digest }));
      return;
    }
    if (!sameDigest(digest, expected)) refused('Inventory changed since observation');

    // One transaction: lock every public table, re-observe under the locks, then truncate exactly the
    // planned disposable tables RESTRICT and record the receipt. Any deviation commits nothing.
    const expectedSql = `'${JSON.stringify({ schema: expected.schema, retained: expected.retained, disposable: expected.disposable })}'::jsonb`;
    const outcome = sql(`BEGIN ISOLATION LEVEL READ COMMITTED; ${settings}
      LOCK TABLE ${live.map(table).join(', ')} IN ACCESS EXCLUSIVE MODE;
      DO $reset$ DECLARE seen jsonb; after_reset jsonb; verdict text := 'completed'; BEGIN
        -- The just-closed observation backend may linger briefly; any other backend still refuses.
        FOR attempt IN 1..50 LOOP
          PERFORM pg_stat_clear_snapshot();
          EXIT WHEN NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend');
          PERFORM pg_sleep(0.1);
        END LOOP;
        PERFORM pg_stat_clear_snapshot();
        seen := ${inventorySql};
        IF (seen->>'backends')::bigint <> 0 THEN verdict := 'backends';
        ELSIF seen->'digest' <> ${expectedSql} OR (seen->>'eventTriggers')::bigint <> 0 OR seen->'relations' <> '[]'::jsonb THEN verdict := 'changed';
        ELSE
          IF to_regnamespace('${OPERATOR}') IS NULL THEN
            CREATE SCHEMA ${OPERATOR};
            CREATE TABLE ${OPERATOR}.receipts (operation_id text NOT NULL, reservation_id text NOT NULL, candidate text NOT NULL, project_id text NOT NULL,
              environment_id text NOT NULL, phase text NOT NULL, expected jsonb NOT NULL, result jsonb NOT NULL, committed_at timestamp with time zone NOT NULL,
              CONSTRAINT receipts_pkey PRIMARY KEY (operation_id));
          END IF;
          IF ${operatorSql} <> ${operatorDefinitionSql} THEN RAISE EXCEPTION 'Clean reset operator schema invalid'; END IF;
          IF EXISTS (SELECT 1 FROM ${OPERATOR}.receipts WHERE operation_id = ${operationSql}) THEN verdict := 'changed';
          ELSE
            TRUNCATE TABLE ${plan.truncate.map(table).join(', ')} RESTRICT;
            after_reset := ${inventorySql};
            IF after_reset->'digest'->'schema' <> seen->'digest'->'schema' OR after_reset->'digest'->'retained' <> seen->'digest'->'retained' OR
               EXISTS (SELECT 1 FROM jsonb_each(after_reset->'tables') e WHERE NOT ('public.' || e.key = ANY (${retainSql})) AND e.value <> '0'::jsonb)
            THEN RAISE EXCEPTION 'Clean reset post-state invalid'; END IF;
            INSERT INTO ${OPERATOR}.receipts (operation_id, reservation_id, candidate, project_id, environment_id, phase, expected, result, committed_at)
              VALUES (${operationSql}, ${literal(input.reservationId)}, ${literal(input.candidate)}, ${literal(p.projectId)}, ${literal(p.environmentId)}, 'rows',
                ${expectedSql}, after_reset->'digest', now());
          END IF;
        END IF;
        PERFORM set_config('${OPERATOR}.outcome', jsonb_build_object('verdict', verdict, 'digest', after_reset->'digest')::text, true);
      END $reset$;
      SELECT '${marker}' || current_setting('${OPERATOR}.outcome');
      COMMIT;`);
    if (!exact(outcome, ['verdict', 'digest'])) refused('database operation failed');
    if (outcome.verdict === 'backends') refused('other database backends present');
    if (outcome.verdict !== 'completed') refused('Inventory changed since observation');
    const after = digestOf(outcome.digest);
    if (after.schema !== expected.schema || after.retained !== expected.retained) refused('database operation failed');
    console.log(JSON.stringify({ ...bound, phase: 'rows', state: 'completed', digest: after }));
  } catch (error) { report(error); }
}

/**
 * `redis-inventoried`: a redacted observation receipt, never a producer-closure attestation.
 * `redis`: refused, because no durable completion receipt can bind a Redis deletion yet.
 * Recognized state is derived from the application's Redis producers and the pinned
 * BullMQ 5.76.8 key layout (QueueKeys, obliterate and removeJobKeys). Anything else in an
 * application namespace refuses; keys outside those namespaces are foreign and untouched.
 */
async function cleanResetRedis(input, staging, refuse) {
  const refused = message => { throw new Error(`Clean reset refused: ${message}`); };
  const p = input.identity, e = process.env;
  if (p.projectId !== staging.projectId || p.environmentId !== staging.environmentId || p.services.api !== staging.services.api ||
      p.services.worker !== staging.services.worker || p.origins.redis !== staging.redis) refuse();
  let url;
  try { url = new URL(e.REDIS_URL); } catch { refuse(); }
  const database = ['', '/'].includes(url.pathname) ? '0' : url.pathname.slice(1);
  if (url.protocol !== 'redis:' || url.search || url.hash || `redis://${url.hostname}:${url.port || '6379'}/${database}` !== p.origins.redis) refuse();
  if (input.phase === 'redis') refused('Redis completion receipt authority unavailable');

  // Read-only, one-atomic-script Redis observation. The script is flagged no-writes, so Redis
  // itself rejects any write; time is frozen inside it, so the snapshot is coherent. It walks
  // every key but reads only the application namespaces; foreign keys are never read.
  const script = `#!lua flags=no-writes
local maxKeys, maxBytes, maxMembers, owned = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
if redis.call('DBSIZE') > maxKeys then return {'limit'} end
local sizes = { hash = 'HLEN', list = 'LLEN', set = 'SCARD', zset = 'ZCARD', stream = 'XLEN' }
local bytes, members, entries, indexes = 0, 0, {}, {}
for _, key in ipairs(redis.call('KEYS', '*')) do
  for i = 5, 4 + owned do
    if string.sub(key, 1, #ARGV[i]) == ARGV[i] then
      local kind = redis.call('TYPE', key)['ok']
      local count = -1
      if kind == 'string' then count = 1 elseif sizes[kind] then count = redis.call(sizes[kind], key) end
      local dump = redis.call('DUMP', key)
      bytes = bytes + #key + #dump
      if bytes > maxBytes then return {'limit'} end
      entries[#entries + 1] = { key, kind, count, redis.call('PEXPIRETIME', key), dump }
      break
    end
  end
end
for i = 5 + owned, #ARGV do
  local kind, items = redis.call('TYPE', ARGV[i])['ok'], {}
  if kind == 'list' or kind == 'zset' then
    members = members + redis.call(sizes[kind], ARGV[i])
    if members > maxMembers then return {'limit'} end
    if kind == 'list' then items = redis.call('LRANGE', ARGV[i], 0, -1) else items = redis.call('ZRANGE', ARGV[i], 0, -1) end
    for _, item in ipairs(items) do bytes = bytes + #item end
    if bytes > maxBytes then return {'limit'} end
  end
  indexes[#indexes + 1] = items
end
return { 'ok', entries, indexes }`;

  const queues = staging.queues;
  const owned = ['bull:', 'identity:', 'email:', 'measurement:', 'operations:'];
  const indexes = { wait: 'list', active: 'list', paused: 'list', delayed: 'zset', prioritized: 'zset', completed: 'zset', failed: 'zset',
    'waiting-children': 'zset', repeat: 'zset' };
  const fixed = { ...indexes, meta: 'hash', id: 'string', events: 'stream', marker: 'zset', stalled: 'set', 'stalled-check': 'string', limiter: 'string',
    pc: 'string', 'metrics:completed': 'hash', 'metrics:failed': 'hash', 'metrics:completed:data': 'list', 'metrics:failed:data': 'list' };
  const jobParts = { logs: 'list', lock: 'string', dependencies: 'set', processed: 'hash', failed: 'hash', unsuccessful: 'zset' };
  const monitoring = ['snapshot', 'technical', 'incident', 'alert-receipt', 'smtp-alert-receipt'];
  const indexKeys = queues.flatMap(queue => Object.keys(indexes).map(index => `bull:${queue}:${index}`));

  const ioredis = require('ioredis');
  const Redis = ioredis.Redis ?? ioredis;
  const redis = new Redis(e.REDIS_URL, { lazyConnect: true, db: 0, connectTimeout: 10000, commandTimeout: 30000, maxRetriesPerRequest: 0,
    enableOfflineQueue: false, retryStrategy: () => null, reconnectOnError: () => false });
  // Client errors can name the endpoint; they are never forwarded.
  redis.on('error', () => undefined);
  let reply;
  try {
    await redis.connect();
    reply = await redis.evalBuffer(script, 0, 50000, 64 * 1024 * 1024, 100000, owned.length, ...owned, ...indexKeys);
  } catch { refused('Redis observation failed'); } finally { redis.disconnect(); }
  if (!Array.isArray(reply) || String(reply[0]) !== 'ok') refused(String(reply?.[0]) === 'limit' ? 'Redis inventory bounds exceeded' : 'Redis observation failed');
  const [, observed, lists] = reply;
  if (!Array.isArray(observed) || !Array.isArray(lists) || lists.length !== indexKeys.length || !lists.every(Array.isArray)) refused('Redis observation failed');
  const members = new Map(indexKeys.map((key, index) => [key, lists[index].map(String)]));
  const jobs = new Map(queues.map(queue => [queue,
    new Set(Object.keys(indexes).filter(index => index !== 'repeat').flatMap(index => members.get(`bull:${queue}:${index}`)))]));

  const classify = (key, type) => {
    const operations = /^operations:[a-z0-9-]{1,48}:([a-z-]+)$/.exec(key);
    if (operations) return operations[1] === 'worker' ? 'producer' : monitoring.includes(operations[1]) && type === 'string' ? 'monitoring' : 'unknown';
    const own = (pattern, expected) => pattern.test(key) && type === expected;
    if (own(/^identity:reserved-phone-attempt:[a-f0-9]{64}$/, 'string') || own(/^email:daily-sends:\d{4}-\d{2}-\d{2}$/, 'set') ||
        own(/^measurement:cap:v1:\d{1,16}:[A-Za-z0-9_-]{1,128}$/, 'string')) return 'entry';
    const [, queue, suffix] = /^bull:([^:]+):(.+)$/s.exec(key) ?? [];
    if (!queues.includes(queue)) return 'unknown';
    // Campaign deduplication tombstones are retained only against a verified SQL ledger.
    if (suffix.startsWith('de:')) return queue === 'email-code' && suffix.startsWith('de:campaign-') ? 'control' : 'unknown';
    if (Object.hasOwn(fixed, suffix)) return fixed[suffix] === type ? 'entry' : 'unknown';
    const ids = jobs.get(queue);
    if (ids.has(suffix)) return type === 'hash' ? 'entry' : 'unknown';
    const cut = suffix.lastIndexOf(':'), part = suffix.slice(cut + 1);
    if (cut > 0 && ids.has(suffix.slice(0, cut)) && Object.hasOwn(jobParts, part)) return jobParts[part] === type ? 'entry' : 'unknown';
    if (suffix.startsWith('repeat:') && members.get(`bull:${queue}:repeat`).includes(suffix.slice('repeat:'.length))) return type === 'hash' ? 'entry' : 'unknown';
    return 'unknown';
  };

  const { createHash } = require('node:crypto');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const found = new Set(), entries = [];
  for (const item of observed) {
    const [raw, type, count, expiresAt, dump] = Array.isArray(item) ? item : [];
    if (!Buffer.isBuffer(raw) || !Buffer.isBuffer(dump) || !Number.isSafeInteger(count) || !Number.isSafeInteger(expiresAt) || expiresAt < -1)
      refused('Redis observation failed');
    const key = raw.toString('utf8');
    const kind = Buffer.from(key, 'utf8').equals(raw) ? classify(key, String(type)) : 'unknown';
    found.add(kind);
    if (kind === 'entry') entries.push({ keyDigest: hash(raw), type: String(type), count, contentDigest: hash(dump), expiresAt });
  }
  if (found.has('unknown')) refused('unknown Redis application state');
  if (found.has('control')) refused('Redis control disposition unavailable');
  const size = (queue, index) => members.get(`bull:${queue}:${index}`).length;
  if (found.has('producer') || queues.some(queue => size(queue, 'active') > 0)) refused('Redis producer or active job present');

  entries.sort((a, b) => a.keyDigest < b.keyDigest ? -1 : 1);
  console.log(JSON.stringify({ operation: 'clean-reset', phase: 'redis-inventoried', operationId: input.operationId, reservationId: input.reservationId,
    candidate: input.candidate, identity: p, state: 'observed', digest: hash(JSON.stringify(entries)),
    queues: queues.map(name => ({ name, counts: { waiting: size(name, 'wait'), delayed: size(name, 'delayed'), completed: size(name, 'completed'),
      failed: size(name, 'failed'), active: size(name, 'active'), paused: size(name, 'paused'), prioritized: size(name, 'prioritized'),
      waitingChildren: size(name, 'waiting-children') }, repeatRecords: size(name, 'repeat') })),
    entries }));
}
