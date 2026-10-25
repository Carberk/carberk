// Hosted-only evidence for one diagnostic. Never imports the selected suite.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = '0efe627ce6be4c97679a1b888f5a5c003f3b4f10';
const ref = 'refs/heads/agent/issue-897-r2-verification-assembly-20261025';
const suite = 'apps/api/src/modules/identity/infrastructure/IdentityAuthorityPrepared.e2e.spec.ts';
const evidence = 'diagnostic-evidence';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const record = (name, value) => writeFileSync(`${evidence}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`);

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
assert.equal(process.env.GITHUB_REPOSITORY, 'Carberk/carberk');
assert.equal(process.env.GITHUB_REF, ref);
assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'One diagnostic attempt only; no reruns');
assert.equal(process.env.APP_ENV, 'test');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.AUTO_TM_TEST_DATABASES, 'off');
assert.equal(git('rev-parse', 'HEAD'), process.env.GITHUB_SHA);
assert.equal(process.env.R2_DIAGNOSTIC_AUTHORIZED_SHA, process.env.GITHUB_SHA, 'Parent must pin a newly authorized exact candidate');
assert.equal(git('merge-base', base, 'HEAD'), base, 'Candidate must retain exact accepted R2 ancestry');
const b5Environment = Object.keys(process.env).filter(key => /B5/i.test(key));
assert.deepEqual(b5Environment, [], 'B5 instrumentation environment must be absent');
mkdirSync(evidence, { recursive: true });
const migrationRoot = 'packages/db/prisma/migrations';
const migrations = readdirSync(migrationRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, checksum: hash(`${migrationRoot}/${entry.name}/migration.sql`) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

switch (process.argv[2]) {
  case 'source': {
    const pin = JSON.parse(readFileSync('docs/evidence/issue-897/r2-verification-assembly-20261025-source.json', 'utf8'));
    for (const [path, expected] of Object.entries(pin.sourceHashes)) assert.equal(hash(path), expected, path);
    for (const path of pin.r2Paths) assert.equal(git('rev-parse', `HEAD:${path}`), git('rev-parse', `${base}:${path}`), path);
    assert.equal(git('status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(hash(suite), pin.sourceHashes[suite], 'Parent-authorized drain-only fixture revision');
    record('source', {
      purpose: 'DIAGNOSTIC ONLY; no B1 or G3 acceptance or release verdict',
      sha: process.env.GITHUB_SHA, tree: git('rev-parse', 'HEAD^{tree}'), base,
      baseTree: git('rev-parse', `${base}^{tree}`), repository: process.env.GITHUB_REPOSITORY,
      ref, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      appEnv: process.env.APP_ENV, nodeEnv: process.env.NODE_ENV,
      schema: { file: 'packages/db/prisma/schema.prisma', sha256: hash('packages/db/prisma/schema.prisma') },
      migrations, workflowSha256: hash('.github/workflows/b1-diagnostic.yml'),
      seedProvenance: { file: suite, sha256: hash(suite), namespace: 'identity-authority-prepared-r2', externalSeed: false, expectedCases: 22 },
      b5: { enabled: false, instrumentation: 'absent', environmentKeys: b5Environment },
      databaseMode: 'one fresh disposable base DB directly; AUTO_TM_TEST_DATABASES=off',
      cleanup: 'scripts/ci-services.sh down removes only this run-attempt Compose project and volumes',
    });
    break;
  }
  case 'empty':
  case 'migrated': {
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_PUBLIC_URL']) {
      const url = new URL(process.env[key]);
      assert.equal(url.hostname, '127.0.0.1', `${key} must be loopback-only`);
      assert.ok(Number(url.port) > 1, `${key} must use a freshly mapped CI port`);
    }
    const target = new URL(process.env.DATABASE_URL);
    assert.equal(target.username, 'auto_tm_ci');
    assert.equal(target.pathname, '/auto_tm_ci');
    const require = createRequire(new URL('../../packages/db/package.json', import.meta.url));
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, query_timeout: 10_000 });
    await client.connect();
    try {
      const identity = (await client.query('SELECT current_database() AS database, current_user AS "user", version() AS version, inet_server_addr()::text AS server_address, inet_server_port() AS server_port')).rows[0];
      assert.equal(identity.database, 'auto_tm_ci');
      assert.equal(identity.user, 'auto_tm_ci');
      const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
      if (process.argv[2] === 'empty') {
        record('empty-database', { identity, loopbackTarget: target.host, tables, freshEmpty: tables.length === 0 });
        assert.deepEqual(tables, [], 'Disposable database must start empty, including no migration state');
      } else {
        const state = (await client.query('SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count, logs FROM public._prisma_migrations ORDER BY migration_name')).rows;
        record('pre-execution-database', { identity, loopbackTarget: target.host, appEnv: process.env.APP_ENV, migrations: state, seed: 'none yet; selected suite beforeAll only', b5Enabled: false });
        assert.deepEqual(state.map(row => ({ name: row.migration_name, checksum: row.checksum })), migrations);
        assert.ok(state.every(row => row.finished_at && !row.rolled_back_at), 'All exact committed migrations must be complete');
      }
    } finally {
      await client.end();
    }
    break;
  }
  case 'results': {
    const result = JSON.parse(readFileSync(`${evidence}/vitest.json`, 'utf8'));
    assert.equal(result.numTotalTests, 22);
    assert.equal(result.numPassedTests, 22);
    assert.equal(result.numPendingTests, 0);
    assert.equal(result.numFailedTests, 0);
    assert.equal(result.testResults.length, 1);
    assert.ok(result.testResults[0].name.endsWith(suite));
    record('diagnostic-result', { sha: process.env.GITHUB_SHA, expectedCases: 22, passed: 22, diagnosticOnly: true, b1Acceptance: false, g3Acceptance: false });
    break;
  }
  default:
    throw new Error('Expected source, empty, migrated or results');
}
