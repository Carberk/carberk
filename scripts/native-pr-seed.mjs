#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertNativePrSeedEnvironment } from '../packages/db/scripts/native-pr-seed-guard.cjs';

const LOCAL_MODE_REMOVED =
  'Local native:seed mode was removed because it could not be bound to the PR environment database. '
  + 'Run it inside the PR API container: railway ssh --project <project> --environment <environment> '
  + '--service <api> node /app/scripts/native-pr-seed.mjs --remote';
const USAGE = 'Usage: native-pr-seed.mjs --remote';

// Every step runs on this Node binary and loads TypeScript through the tsx loader the db workspace
// ships, because the API image has no pnpm. The first path exists only in that image: its Dockerfile
// copies infra/minio/bootstrap.mjs and contract.mjs into packages/db/scripts/native-minio/ so the
// bucket step resolves its dependencies from the db workspace. In a source checkout that step fails.
export const nativePrSeedSteps = [
  { name: 'buckets', command: process.execPath, args: ['packages/db/scripts/native-minio/bootstrap.mjs'] },
  { name: 'canonical baseline', command: process.execPath, args: ['--import', 'tsx', 'packages/db/src/canonical-seed.ts'] },
  { name: 'native fixtures', command: process.execPath, args: ['--import', 'tsx', 'packages/db/scripts/ui-fixture.ts', '--railway-pr'] },
];

/** The only supported invocation is `--remote`, inside the PR API container. */
export function parseNativePrSeedArguments(args) {
  if (args.length === 1 && args[0] === '--remote') return;
  throw new Error(args.length === 0 ? LOCAL_MODE_REMOVED : USAGE);
}

/** Refuse before launching any child; the guard runs here and again inside the fixture step. */
export function runNativePrSeed(env = process.env, args = []) {
  parseNativePrSeedArguments(args);
  assertNativePrSeedEnvironment(env);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const step of nativePrSeedSteps) {
    console.log(`Native PR seed: ${step.name}`);
    const result = spawnSync(step.command, step.args, { cwd: root, env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`Native PR seed failed at ${step.name}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runNativePrSeed(process.env, process.argv.slice(2));
  } catch (error) {
    // Guard messages never contain a value; print nothing but the message so no URL or credential leaks.
    console.error(error instanceof Error ? error.message : 'Native PR seed refused');
    process.exitCode = 1;
  }
}
