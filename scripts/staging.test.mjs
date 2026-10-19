import test from 'node:test';
import assert from 'node:assert/strict';
import { runStagingCommand } from './staging.mjs';
test('operators can discover the bounded command contract without credentials', async()=>{
  const value=await runStagingCommand(['help']);assert.match(value.usage,/identity/);assert.match(value.usage,/restore/);
});
test('arbitrary command names are refused before reading credentials or creating a ledger',async()=>{
  await assert.rejects(runStagingCommand(['shell']),/Unsupported/);
});

test('campaign operation help names the exact supported profile; unknown profiles and state payloads fail before credentials', async () => {
  assert.match((await runStagingCommand(['help'])).usage, /campaign897-identities-v1/);
  for (const args of [
    ['operate', 'policy', 'claim', 'fixture', 'campaign897-full'],
    ['operate', 'policy', 'claim', 'reset', 'campaign897-identities-v1'],
    ['operate', 'policy', 'claim', 'fixture', 'campaign897-identities-v1', 'historical-cohort'],
  ]) await assert.rejects(runStagingCommand(args), /Unsupported command or arguments/);
});

test('business storage profile remains closed at the operator CLI pending its disposal receipt controller', async () => {
  await assert.rejects(runStagingCommand(['operate', 'policy', 'claim', 'fixture', 'campaign897-business-v2']), /Unsupported command or arguments/);
});


// Exercise the executable CLI with a real isolated Git coordination remote.
// Only GitHub actor discovery is faked; no Railway credential is supplied.
async function operatorLease(t, profile) {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync, execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { GitLedger } = await import('./staging-ledger.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'staging-cli-lease-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const remote = join(directory, 'shared.git');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  const ledger = new GitLedger({ directory: join(directory, 'objects'), remote });
  const policy = { projectId: '176ddec0-dd65-4087-b82c-798599fc2ebe', environmentId: '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2', environmentName: 'staging',
    services: { api: '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0', worker: '24aa02e0-25a9-4e80-9cc2-c1795ef82091' },
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example', api: 'https://api.example' } };
  policy.credentialScope = `project:${policy.projectId}:${policy.environmentId}`;
  const claim = { id: '1'.repeat(32), candidate: 'a'.repeat(40) };
  const state = { version: 1, queue: [], history: [], reservation: { ...claim, owner: 'alice', namespace: `cf_${claim.id}`, identity: policy, fixtureProfile: profile, evidence: [], operation: null } };
  assert.equal(await ledger.compareAndSwap(null, state), true);
  const before = await ledger.read();
  await writeFile(join(directory, 'policy.json'), JSON.stringify(policy));
  await writeFile(join(directory, 'claim.json'), JSON.stringify(claim));
  await writeFile(join(directory, 'gh'), `#!${process.execPath}
process.stdout.write(${JSON.stringify('alice\n')});
`, { mode: 0o755 });
  const run = promisify(execFile);
  const invoke = async (command, ...args) => {
    try {
      return { code: 0, ...(await run(process.execPath, ['scripts/staging.mjs', command,
        ...(command === 'inspect' ? [] : [join(directory, 'policy.json'), join(directory, 'claim.json')]), ...args], {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, STAGING_RAILWAY_PROJECT_TOKEN: '', STAGING_MUTATIONS_AUTHORIZATION: '',
          GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://github.com/bagtyyarkovusov/auto.tm-rewrite.git' },
      })) };
    } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  return { invoke, ledger, before };
}

for (const [command, ...args] of [['operate', 'fixture'], ['operate', 'reset'], ['operate', 'deploy'], ['recover'], ['restore'], ['release'], ['operate', 'fixture', 'campaign897-identities-v1']]) {
  test(`operator CLI refuses durable business v2 lease for ${command} ${args.join(' ')} without an explicit v2 profile`, async t => {
    const { invoke, ledger, before } = await operatorLease(t, 'campaign897-business-v2');
    const result = await invoke(command, ...args);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Business storage profile remains closed at the operator CLI/);
    assert.deepEqual(await ledger.read(), before, 'CLI refusal preserves the durable lease');
  });
}

test('operator CLI can inspect a durable business v2 lease without credentials', async t => {
  const { invoke, ledger, before } = await operatorLease(t, 'campaign897-business-v2');
  const result = await invoke('inspect');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).reservation.fixtureProfile, 'campaign897-business-v2');
  assert.deepEqual(await ledger.read(), before);
});
for (const profile of ['listing-v1', 'campaign897-identities-v1']) {
  test(`operator CLI preserves existing ${profile} admission and recovery guards`, async t => {
    const { invoke, ledger, before } = await operatorLease(t, profile);
    const result = await invoke('recover');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Known durable operation required for recovery/);
    assert.deepEqual(await ledger.read(), before);
  });
}
