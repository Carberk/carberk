import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFixtureTarget, assertNativePrSeedEnvironment } from '../packages/db/scripts/native-pr-seed-guard.cjs';
import * as entry from './native-pr-seed.mjs';

const { nativePrSeedSteps, parseNativePrSeedArguments } = entry;
const root = fileURLToPath(new URL('..', import.meta.url));
const entryPath = path.join(root, 'scripts/native-pr-seed.mjs');
const fixtureScript = 'packages/db/scripts/ui-fixture.ts';
// Traces guard calls and client module loads to stderr; see the probe for the line format.
const loadProbe = path.join(root, 'scripts/native-pr-seed-load-probe.cjs');

// Every value is fake. No test here builds a database, MinIO or Railway client, and the spawned
// processes below only run inputs that must be refused before any client exists.
const SECRET = 'sk-FAKE-SECRET-must-never-be-printed';
const valid = {
  RAILWAY_ENVIRONMENT_NAME: 'auto.tm-rewrite-pr-481',
  RAILWAY_ENVIRONMENT_ID: 'pr-id',
  RAILWAY_PROJECT_ID: '176ddec0-dd65-4087-b82c-798599fc2ebe',
  SMS_DRIVER: 'mock',
  APP_ENV: 'staging',
  DATABASE_URL: `postgresql://demo:${SECRET}@postgres.railway.internal:5432/demo`,
  MINIO_ENDPOINT: 'http://minio.railway.internal:9000',
  MINIO_PUBLIC_URL: 'https://minio-autotm-rewrite-pr-481.up.railway.app',
  MINIO_ACCESS_KEY: 'demo',
  MINIO_SECRET_KEY: SECRET,
};
const NAME_REFUSAL = 'Native seed requires an auto.tm-rewrite-pr-<number> PR environment';
const badNames = ['production', 'staging', undefined, 'production-pr-481', 'auto.tm-rewrite-pr-481-production', 'auto.tm-rewrite-pr-0'];
const foreignMediaHosts = ['https://minio-staging-5795.up.railway.app', 'https://minio-autotm-rewrite-pr-480.up.railway.app'];

/** Run a script in a clean environment so the parent's real variables can never reach it. */
function spawnClean(args, env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Run the fixture under the load probe, which traces the guard call and every client module load. */
function spawnFixture(argv, env) {
  return spawnClean(['--require', loadProbe, '--import', 'tsx', fixtureScript, ...argv], env);
}

/**
 * The guard must have run and no database or bucket client module may have loaded. A client cannot
 * be constructed before its module loads, so this fails if the guard moves after any client.
 */
function assertGuardBeforeAnyClient(stderr, label) {
  assert.match(stderr, /^LOAD-PROBE guard assertFixtureTarget$/m, `${label}: the probe must see the guard run`);
  assert.doesNotMatch(stderr, /^LOAD-PROBE client /m, `${label}: no client module may load before the guard refuses`);
}

function assertNoLeak(output) {
  assert.ok(!output.includes(SECRET), 'output must not contain a credential or raw connection string');
}

test('the shared guard accepts exactly this PR environment on private connections', () => {
  assert.doesNotThrow(() => assertNativePrSeedEnvironment(valid));
  assert.doesNotThrow(() => assertFixtureTarget(valid, ['--railway-pr']));
});

test('the shared guard refuses production, staging, missing and misleading names', () => {
  for (const name of badNames) {
    assert.throws(() => assertNativePrSeedEnvironment({ ...valid, RAILWAY_ENVIRONMENT_NAME: name }), { message: NAME_REFUSAL });
  }
});

test('the shared guard requires mock SMS, nonproduction APP_ENV and Railway project identity', () => {
  for (const patch of [{ SMS_DRIVER: 'http' }, { SMS_DRIVER: undefined }, { APP_ENV: 'production' }, { RAILWAY_PROJECT_ID: 'other' }, { RAILWAY_ENVIRONMENT_ID: undefined }]) {
    assert.throws(() => assertNativePrSeedEnvironment({ ...valid, ...patch }), /Native seed requires/);
  }
});

test('the shared guard rejects staging or another PR media origin even with a valid PR name', () => {
  for (const url of foreignMediaHosts) {
    assert.throws(() => assertNativePrSeedEnvironment({ ...valid, MINIO_PUBLIC_URL: url }), /this PR/);
  }
});

test('the shared guard requires this environment private Postgres and MinIO services', () => {
  for (const patch of [{ DATABASE_URL: 'postgresql://demo:demo@example.com/demo' }, { MINIO_ENDPOINT: valid.MINIO_PUBLIC_URL }]) {
    assert.throws(() => assertNativePrSeedEnvironment({ ...valid, ...patch }), /private PR Postgres and MinIO/);
  }
});

test('the shared guard checks each connection for its own protocol and names the variable', () => {
  assert.throws(() => assertNativePrSeedEnvironment({ ...valid, DATABASE_URL: 'mysql://demo:demo@postgres.railway.internal/demo' }), /DATABASE_URL to be a PostgreSQL URL/);
  assert.throws(() => assertNativePrSeedEnvironment({ ...valid, MINIO_PUBLIC_URL: 'http://minio-autotm-rewrite-pr-481.up.railway.app' }), /MINIO_PUBLIC_URL to be an HTTPS URL/);
  for (const key of ['DATABASE_URL', 'MINIO_ENDPOINT', 'MINIO_PUBLIC_URL', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']) {
    assert.throws(() => assertNativePrSeedEnvironment({ ...valid, [key]: undefined }), new RegExp(`requires ${key}`));
  }
});

test('the shared guard refuses a malformed URL without echoing it', () => {
  for (const key of ['DATABASE_URL', 'MINIO_ENDPOINT', 'MINIO_PUBLIC_URL']) {
    const raw = `not a url ${SECRET}`;
    assert.throws(
      () => assertNativePrSeedEnvironment({ ...valid, [key]: raw }),
      error => error instanceof Error && error.message.includes(key) && !error.message.includes(SECRET) && !JSON.stringify(error).includes(SECRET),
    );
  }
});

test('the fixture target refuses production, staging, non-mock SMS and a foreign media host', () => {
  const argv = ['--railway-pr'];
  for (const name of badNames) {
    assert.throws(() => assertFixtureTarget({ ...valid, RAILWAY_ENVIRONMENT_NAME: name }, argv), { message: NAME_REFUSAL });
  }
  assert.throws(() => assertFixtureTarget({ ...valid, SMS_DRIVER: 'http' }, argv), /SMS_DRIVER=mock/);
  assert.throws(() => assertFixtureTarget({ ...valid, APP_ENV: 'production' }, argv), /APP_ENV/);
  for (const url of foreignMediaHosts) {
    assert.throws(() => assertFixtureTarget({ ...valid, MINIO_PUBLIC_URL: url }, argv), /this PR/);
  }
});

test('the fixture target without --railway-pr accepts only a localhost stack and never echoes a URL', () => {
  const local = { DATABASE_URL: 'postgresql://dev:dev@localhost:5432/dev', MINIO_ENDPOINT: 'http://127.0.0.1:9000' };
  assert.doesNotThrow(() => assertFixtureTarget(local, []));
  assert.throws(() => assertFixtureTarget({ ...local, DATABASE_URL: `postgresql://dev:${SECRET}@db.example.com/dev` }, []), error => /non-local DATABASE_URL/.test(error.message) && !error.message.includes(SECRET));
  assert.throws(() => assertFixtureTarget({ ...local, MINIO_ENDPOINT: `https://minio-staging-5795.up.railway.app/${SECRET}` }, []), error => /non-local MINIO_ENDPOINT/.test(error.message) && !error.message.includes(SECRET));
  assert.throws(() => assertFixtureTarget({ ...local, DATABASE_URL: `not a url ${SECRET}` }, []), error => /DATABASE_URL/.test(error.message) && !error.message.includes(SECRET));
});

// An unencoded "/" in a password ends the authority early, so the parsed hostname is the secret
// fragment. The refusal must name the variable and nothing the input contained.
const secretAsHost = `postgresql://${SECRET}/rest@db.example.com/demo`;

test('the fixture target refuses a connection whose parsed host holds a secret fragment without printing it', () => {
  assert.ok(new URL(secretAsHost).hostname.includes(SECRET), 'the fixture input must put the fake secret in the parsed hostname');
  const local = { DATABASE_URL: 'postgresql://dev:dev@localhost:5432/dev', MINIO_ENDPOINT: 'http://127.0.0.1:9000' };
  for (const key of ['DATABASE_URL', 'MINIO_ENDPOINT']) {
    assert.throws(
      () => assertFixtureTarget({ ...local, [key]: secretAsHost }, []),
      error => error instanceof Error && error.message.includes(`non-local ${key}`) && !error.message.includes(SECRET) && !JSON.stringify(error).includes(SECRET),
    );
  }
});

test('a spawned localhost-only fixture whose parsed host holds a secret fragment prints it nowhere', () => {
  const result = spawnFixture([], { DATABASE_URL: secretAsHost, MINIO_ENDPOINT: 'http://localhost:9000' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-local DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
  assertGuardBeforeAnyClient(result.stderr, 'secret fragment host');
  assertNoLeak(result.stdout + result.stderr);
});

test('a spawned remote seed with a production environment name exits 1 with the refusal and prints no step', () => {
  const result = spawnClean([entryPath, '--remote'], { ...valid, RAILWAY_ENVIRONMENT_NAME: 'production' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), NAME_REFUSAL);
  assert.equal(result.stdout, '');
  assertNoLeak(result.stdout + result.stderr);
});

test('a spawned remote seed with a malformed DATABASE_URL is refused without printing it', () => {
  const result = spawnClean([entryPath, '--remote'], { ...valid, DATABASE_URL: `not a url ${SECRET}` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /Invalid URL/);
  assert.doesNotMatch(result.stdout, /Native PR seed:/);
  assertNoLeak(result.stdout + result.stderr);
});

test('local mode is gone: no arguments is refused with the remote command to run instead', () => {
  assert.throws(() => parseNativePrSeedArguments([]), /Local native:seed mode was removed.*--remote/s);
  assert.throws(() => parseNativePrSeedArguments(['--local']), /Usage: native-pr-seed\.mjs --remote/);
  assert.throws(() => parseNativePrSeedArguments(['--remote', '--local']), /Usage: native-pr-seed\.mjs --remote/);
  assert.doesNotThrow(() => parseNativePrSeedArguments(['--remote']));
  // An empty environment can never reach a step, so this spawn cannot start a seed.
  const result = spawnClean([entryPath], {});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Local native:seed mode was removed/);
  assert.doesNotMatch(result.stdout, /Native PR seed:/);
  assert.equal(entry.nativePrSeedStepsFor, undefined);
  assert.equal(entry.validateNativePrSeed, undefined);
});

test('the PR seed runs one ordered list of steps on Node and the shipped tsx loader, without pnpm', () => {
  assert.deepEqual(nativePrSeedSteps.map(step => step.name), ['buckets', 'catalog', 'native fixtures', 'brand logos']);
  assert.ok(nativePrSeedSteps.every(step => step.command === process.execPath));
  assert.equal(nativePrSeedSteps[0].args[0], 'packages/db/scripts/native-minio/bootstrap.mjs');
  assert.deepEqual(nativePrSeedSteps[1].args, ['--import', 'tsx', 'packages/db/src/seed.ts']);
  assert.ok(nativePrSeedSteps[2].args.includes('--railway-pr'));
});

test('a spawned fixture with production, staging, non-mock SMS or a foreign media host is refused before any client', () => {
  const cases = [
    { RAILWAY_ENVIRONMENT_NAME: 'production' },
    { RAILWAY_ENVIRONMENT_NAME: 'staging' },
    { SMS_DRIVER: 'http' },
    { MINIO_PUBLIC_URL: 'https://minio-staging-5795.up.railway.app' },
    { MINIO_PUBLIC_URL: 'https://minio-autotm-rewrite-pr-480.up.railway.app' },
  ];
  for (const patch of cases) {
    const result = spawnFixture(['--railway-pr'], { ...valid, ...patch });
    assert.notEqual(result.status, 0, JSON.stringify(patch));
    assert.match(result.stderr, /Native seed requires/, JSON.stringify(patch));
    // The refusal must come from the guard, not from a missing generated client or a dependency.
    assert.doesNotMatch(result.stderr, /Cannot find module/, JSON.stringify(patch));
    assertGuardBeforeAnyClient(result.stderr, JSON.stringify(patch));
    assertNoLeak(result.stdout + result.stderr);
  }
});

test('a spawned fixture with a malformed DATABASE_URL is refused without printing it', () => {
  // NATIVE_PR_SEED_REMOTE is the flag the retired local/remote split used to pass to the child. It is
  // ignored now, and kept here so the path that once threw a raw `Invalid URL` stays covered.
  const env = { ...valid, NATIVE_PR_SEED_REMOTE: 'true', DATABASE_URL: `not a url ${SECRET}` };
  for (const argv of [['--railway-pr'], []]) {
    const result = spawnFixture(argv, env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATABASE_URL/);
    assert.doesNotMatch(result.stderr, /Cannot find module/);
    assertGuardBeforeAnyClient(result.stderr, `malformed DATABASE_URL ${argv.join(' ')}`);
    assertNoLeak(result.stdout + result.stderr);
  }
});

test('a spawned localhost-only fixture refuses a literal staging connection without printing it', () => {
  const result = spawnFixture([], {
    DATABASE_URL: `postgresql://demo:${SECRET}@db.staging.example.com:5432/demo`,
    MINIO_ENDPOINT: 'http://localhost:9000',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-local DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
  assertGuardBeforeAnyClient(result.stderr, 'literal staging connection');
  assertNoLeak(result.stdout + result.stderr);
});

test('every bare import the seed steps load is declared by the db workspace', () => {
  const db = JSON.parse(readFileSync(path.join(root, 'packages/db/package.json'), 'utf8'));
  const declared = new Set([...Object.keys(db.dependencies ?? {}), ...Object.keys(db.devDependencies ?? {})]);
  const brandLogos = readdirSync(path.join(root, 'packages/db/scripts/brand-logos')).map(name => `packages/db/scripts/brand-logos/${name}`);
  const files = ['packages/db/src/seed.ts', 'packages/db/src/listing-prices.ts', 'packages/db/scripts/ui-fixture.ts', 'packages/db/scripts/ui-fixture-target.ts', 'packages/db/scripts/fixture-photos.ts', 'packages/db/scripts/import-brand-logos.ts', 'packages/db/scripts/native-pr-seed-guard.cjs','infra/minio/bootstrap.mjs', 'infra/minio/contract.mjs', ...brandLogos];
  const bare = /(?:from\s+|import\s+|import\(|require\()\s*["']([^./"'][^"']*)["']/g;
  const missing = new Set();
  for (const file of files) {
    for (const [, specifier] of readFileSync(path.join(root, file), 'utf8').matchAll(bare)) {
      if (specifier.startsWith('node:') || builtinModules.includes(specifier)) continue;
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (!declared.has(name)) missing.add(name);
    }
  }
  // The packaged image does not hoist undeclared packages, so each must be declared where the steps run.
  assert.deepEqual([...missing], []);
});

test('the db typecheck covers every TypeScript file the seed scripts directory holds', () => {
  const db = path.join(root, 'packages/db');
  const tsc = path.join(db, 'node_modules/@typescript/native/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json', '--listFilesOnly'], { cwd: db, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  const checked = new Set(result.stdout.split('\n').map(line => path.resolve(db, line.trim())));
  const scripts = readdirSync(path.join(db, 'scripts'), { recursive: true })
    .filter(name => /\.(ts|d\.cts)$/.test(name))
    .map(name => path.join(db, 'scripts', name));
  assert.ok(scripts.length > 0, 'the scripts directory must hold TypeScript files');
  assert.deepEqual(scripts.filter(file => !checked.has(file)), []);
});
