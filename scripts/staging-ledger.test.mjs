import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GitLedger } from './staging-ledger.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
test('one remote owner survives simultaneous contenders from independent repositories and process restart', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'staging-ledger-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'shared.git'); git(root, 'init', '--bare', remote);
  const options = (name) => ({ directory: join(root, name), remote, ref: 'refs/heads/ops/staging-lease' });
  const left = new GitLedger(options('left')); const right = new GitLedger(options('right'));
  const [a, b] = await Promise.all([left.read(), right.read()]);
  const results = await Promise.all([
    left.compareAndSwap(a.revision, { owner: 'alice', candidate: 'a'.repeat(40) }),
    right.compareAndSwap(b.revision, { owner: 'bob', candidate: 'b'.repeat(40) }),
  ]);
  assert.equal(results.filter(Boolean).length, 1, 'exactly one exclusive owner must win');
  const restarted = new GitLedger(options('fresh-process'));
  const durable = await restarted.read();
  assert.equal(durable.state.owner, results[0] ? 'alice' : 'bob');
  assert.equal(await right.compareAndSwap(null, { owner: 'stale' }), false);
  assert.equal((await restarted.read()).state.owner, durable.state.owner);
  assert.equal(await restarted.compareAndSwap(durable.revision, { owner: durable.state.owner, lifecycle: 'blocked' }), true);
  assert.equal((await left.read()).state.lifecycle, 'blocked');
});

test('separate operator processes cannot both acquire the shared remote ref', async(t) => {
  const { fork } = await import('node:child_process');
  const { once } = await import('node:events');
  const root = await mkdtemp(join(tmpdir(), 'staging-processes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'shared.git'); git(root, 'init', '--bare', remote);
  const children = ['alice','bob'].map(owner => fork(new URL('./testing/staging-contender.mjs', import.meta.url), [JSON.stringify({directory:join(root,owner),remote}),owner], {stdio:['ignore','ignore','pipe','ipc']}));
  t.after(() => children.forEach(child => child.kill()));
  await Promise.all(children.map(child => once(child,'message')));
  const results=children.map(child => once(child,'message'));
  children.forEach(child=>child.send('contend'));
  assert.equal((await Promise.all(results)).filter(([value])=>value.won).length,1);
  const durable=await new GitLedger({directory:join(root,'inspector'),remote}).read();
  assert.ok(['alice','bob'].includes(durable.state.owner));
});

test('reviewed additive schema is retained with exact checksums on current-main restoration', async () => {
  const { evaluateSchemaPlan } = await import('./staging-schema.mjs');
  const baseline = [{ name: '20260101_base', checksum: '1'.repeat(64) }];
  const addition = { name: '20261015_views', checksum: '2'.repeat(64) };
  const profile = { schemaHashes: ['old', 'new'], schemaMigrations:{old:[],new:[addition.name]}, additions: [addition] };
  const plan = evaluateSchemaPlan({ baseline, candidate: [...baseline, addition], main: baseline,
    candidateSchema: 'new', mainSchema: 'old', profile });
  assert.equal(plan.disposition, 'retained-additive');
  assert.deepEqual(plan.migrations, [...baseline, addition]);
  assert.deepEqual(evaluateSchemaPlan({ baseline, candidate: baseline, main: baseline,
    candidateSchema: 'old', mainSchema: 'old', retained: plan.migrations, profile }).migrations, plan.migrations);
  for (const change of [
    { candidate: [...baseline, { ...addition, checksum: '3'.repeat(64) }] },
    { candidate: [...baseline, { name: '20261016_drop_users', checksum: '3'.repeat(64) }] },
    { candidate: [{ ...baseline[0], checksum: '4'.repeat(64) }, addition] },
    { candidateSchema: 'unknown' },
    { candidate: baseline },
  ]) assert.throws(() => evaluateSchemaPlan({ baseline, candidate: [...baseline, addition], main: baseline,
    candidateSchema: 'new', mainSchema: 'old', profile, ...change }), /schema|migration/i);
});


test('the Git migration inventory hashes exact committed SQL bytes including the final newline',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'staging-migration-bytes-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'source');await mkdir(join(source,'packages/db/prisma/migrations/20260101_base'),{recursive:true});
  const sql='CREATE TABLE test(id text);\n';await writeFile(join(source,'packages/db/prisma/migrations/20260101_base/migration.sql'),sql);
  git(source,'init');git(source,'add','.');git(source,'-c','user.name=Test','-c','user.email=test@invalid','commit','-m','schema fixture');
  const ledger=new GitLedger({directory:join(root,'objects'),remote:source});
  assert.deepEqual(await ledger.migrationsAt(git(source,'rev-parse','HEAD')),[{name:'20260101_base',checksum:createHash('sha256').update(sql).digest('hex')}]);
});
