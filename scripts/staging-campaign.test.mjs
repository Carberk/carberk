import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { remoteProgram } from './staging-remote.mjs';

test('serialized business trigger variables do not shadow JSON result columns', () => {
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
  const trigger = queries[1].match(/CREATE FUNCTION [\s\S]*?track_business\(\)[\s\S]*?AS \$fn\$([\s\S]*?)END \$fn\$/)?.[1];
  assert.ok(trigger, 'actual business trigger must reach the SQL boundary');
  assert.match(trigger, /jsonb_each(?:_text)?\(/);
  const declarations = trigger.match(/DECLARE([\s\S]*?)BEGIN/)[1];
  const names = declarations.split(';').map(declaration => declaration.trim().split(/\s+/)[0]).filter(Boolean);
  // Both PostgreSQL JSON functions expose key/value columns in nested queries.
  assert.deepEqual(names.filter(name => ['key', 'value'].includes(name)), [], 'JSON result names must remain unambiguous');
});
