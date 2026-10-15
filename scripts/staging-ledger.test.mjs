import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
