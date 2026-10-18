import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { remoteProgram } from './staging-remote.mjs';

function captureFixtureSql() {
  const id = '1'.repeat(32), candidate = 'a'.repeat(40), profile = 'campaign897-business-v2';
  const identity = { projectId: 'graph-project', environmentId: 'graph-staging', services: { api: 'graph-api' },
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example' } };
  const runtimeProcess = { exitCode: 0, env: { STAGING_CAMPAIGN_PROFILE_ENABLED: profile,
    RAILWAY_PROJECT_ID: identity.projectId, RAILWAY_ENVIRONMENT_ID: identity.environmentId, RAILWAY_SERVICE_ID: identity.services.api,
    RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: candidate,
    DATABASE_URL: identity.origins.database, MINIO_ENDPOINT: identity.origins.media, MINIO_PUBLIC_URL: identity.origins.publicMedia } };
  const queries = [], require = createRequire(import.meta.url);
  runInNewContext(remoteProgram({ kind: 'fixture', id, namespace: `cf_${id}`, candidate, target: candidate, profile, identity }), {
    process: runtimeProcess, URL, console: { log() {}, error() {} },
    require: name => name === 'node:child_process' ? { spawnSync(command, _args, { input }) {
      assert.equal(command, 'psql');
      queries.push(input);
      // Capture the real serialized SQL without executing or pretending to validate it.
      return { status: queries.length === 1 ? 0 : 1, stdout: '0\n' };
    } } : require(name),
  });
  assert.equal(queries.length, 2, 'namespace probe followed by fixture SQL');
  return queries[1];
}

test('serialized business trigger variables do not shadow JSON result columns', () => {
  const trigger = captureFixtureSql().match(/CREATE FUNCTION [\s\S]*?track_business\(\)[\s\S]*?AS \$fn\$([\s\S]*?)END \$fn\$/)?.[1];
  assert.ok(trigger, 'actual business trigger must reach the SQL boundary');
  assert.match(trigger, /jsonb_each(?:_text)?\(/);
  const declarations = trigger.match(/DECLARE([\s\S]*?)BEGIN/)[1];
  const names = declarations.split(';').map(declaration => declaration.trim().split(/\s+/)[0]).filter(Boolean);
  // Both PostgreSQL JSON functions expose key/value columns in nested queries.
  assert.deepEqual(names.filter(name => ['key', 'value'].includes(name)), [], 'JSON result names must remain unambiguous');
});


test('serialized integrity guard keeps the row-key CASE inside the IF expression', () => {
  const sql = captureFixtureSql();
  const guard = sql.match(/IF entry\.table_name NOT IN \([^;]+?Unknown campaign row key'; END IF;/)?.[0];
  assert.ok(guard, 'actual integrity guard must reach the SQL boundary');
  // PL/pgSQL reads IF up to THEN at depth zero. CASE must stay nested until END.
  assert.match(guard, /entry\.row_key IS DISTINCT FROM \(CASE WHEN entry\.table_name='staff_grants' THEN jsonb_build_object\('userId',entry\.row_key->>'userId','capability',entry\.row_key->>'capability'\) ELSE jsonb_build_object\('id',entry\.row_key->>'id'\) END\) OR/);
  assert.match(guard, /EXISTS\(SELECT 1 FROM jsonb_each\(entry\.row_key\) e WHERE e\.value='null'::jsonb\) THEN RAISE EXCEPTION 'Unknown campaign row key'/);
});
