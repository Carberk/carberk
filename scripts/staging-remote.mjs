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
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'postgres.railway.internal' || db.search || db.hash || media.search || media.hash ||
        publicMedia.search || publicMedia.hash) throw new Error();
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
    if (input.kind === 'fixture') {
      const create = exists ? '' : `CREATE SCHEMA "${namespace}"; CREATE TABLE "${namespace}".manifest(reservation_id text PRIMARY KEY); INSERT INTO "${namespace}".manifest VALUES ('${input.id}'); CREATE TABLE "${namespace}".records(id text PRIMARY KEY, payload jsonb NOT NULL);`;
      sql(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${namespace}',0)); ${create} INSERT INTO "${namespace}".records VALUES ('service-case','{"synthetic":true,"kind":"vehicle-history","vin":"SYNTHETIC","amountTmt":100}') ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload; COMMIT;`);
      if (sql(`SELECT count(*) FROM "${namespace}".records WHERE id='service-case' AND payload->>'synthetic'='true';`) !== '1') throw new Error();
      console.log(JSON.stringify({ fixtures: 'present', namespace }));
    } else if (input.kind === 'reset') {
      if (exists) sql(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${namespace}',0)); DROP TABLE "${namespace}".records; DROP TABLE "${namespace}".manifest; DROP SCHEMA "${namespace}"; COMMIT;`);
      if (sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${namespace}';`) !== '0') throw new Error();
      console.log(JSON.stringify({ fixtures: 'absent', namespace }));
    } else {
      const migrations = sql('SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;').split('\n').filter(Boolean);
      if (JSON.stringify(migrations) !== JSON.stringify(input.expectedMigrations)) throw new Error();
      console.log(JSON.stringify({ fixtures: exists ? 'present' : 'absent', schema: 'unchanged', sha: e.AUTOTM_COMMIT_SHA }));
    }
  } catch {
    console.error('Reserved staging remote operation refused or incomplete; diagnostics suppressed');
    process.exitCode = 1;
  }
}
