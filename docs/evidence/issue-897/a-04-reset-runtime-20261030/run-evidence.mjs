import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const mode = process.argv[2];
await mkdir(directory, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const groups = {
  offline: [
    ['node', ['--test', 'scripts/staging-clean-reset.test.mjs', 'scripts/staging-clean-reset-remote.test.mjs', 'scripts/staging-clean-reset-storage.test.mjs', 'scripts/staging-quiescence.test.mjs', 'scripts/staging-campaign.test.mjs']],
    ['node', ['--test', 'scripts/staging-control.test.mjs', 'scripts/staging-ledger.test.mjs']],
    ['node', ['--test', '--test-name-pattern=business.*(reset|restor|recover|disposal|recovery)|post-main campaign restoration|queue disposal|actual remote probe', 'scripts/staging-railway.test.mjs']],
  ],
  setup: [['pnpm', ['install', '--frozen-lockfile']]],
  red: [['node', ['--test', '--test-name-pattern=the assembled application schema can restore baseline code while retaining its exact campaign migrations', 'scripts/staging-ledger.test.mjs']]],
  db: [['pnpm', ['--filter', '@auto-tm/db', 'exec', 'vitest', 'run', 'tests/operational-reset-rows.e2e.spec.ts', 'scripts/staging-clean-reset.e2e.spec.ts']]],
};
if (!groups[mode]) throw new Error('Expected offline, setup, red or db');
const migrationDirectory = resolve(root, 'packages/db/prisma/migrations');
const migrations = [];
for (const name of (await readdir(migrationDirectory)).filter(name => /^\d/.test(name)).sort()) {
  migrations.push({ name, sha256: sha256(await readFile(resolve(migrationDirectory, name, 'migration.sql'))) });
}
const manifest = { candidate: '52d901c50af1dde97ea22bda8efb1fdf21f169b1', migrations,
  inventorySha256: sha256(JSON.stringify(migrations)), files: {} };
for (const path of ['packages/db/tests/operational-reset-rows.e2e.spec.ts', 'packages/db/scripts/staging-clean-reset.e2e.spec.ts',
  'scripts/staging-campaign.mjs', 'scripts/staging-control.mjs', 'scripts/staging-clean-reset.mjs',
  'scripts/staging-clean-reset-remote.mjs', 'scripts/staging-clean-reset-storage.mjs', 'scripts/staging-railway.mjs']) {
  manifest.files[path] = sha256(await readFile(resolve(root, path)));
}
await writeFile(resolve(directory, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [index, [command, args]] of groups[mode].entries()) {
  const id = `${mode}-${index + 1}`;
  const startedAt = new Date().toISOString();
  let output = '';
  const child = spawn(command, args, { cwd: root, env: { ...process.env, TMPDIR: '/tmp' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const result = await new Promise(resolve => {
    child.on('error', error => resolve({ error: error.message }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  const metadata = { command, args, cwd: root, startedAt, endedAt: new Date().toISOString(), ...result,
    log: `${id}.log`, sha256: sha256(output) };
  await writeFile(resolve(directory, `${id}.log`), output);
  await writeFile(resolve(directory, `${id}.json`), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata));
}
