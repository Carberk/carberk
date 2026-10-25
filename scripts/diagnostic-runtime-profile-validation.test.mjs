import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile as profile, evaluateSchemaPlan } from './staging-schema.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test('actual runtime schema snapshots pass the retained validator with exact inventories', async () => {
  const names = (await readdir('packages/db/prisma/migrations', { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort();
  const actual = await Promise.all(names.map(async name => ({ name, checksum: hash(await readFile(`packages/db/prisma/migrations/${name}/migration.sql`)) })));
  const additions = new Set(profile.additions.map(x => x.name));
  const baseline = actual.filter(x => !additions.has(x.name));
  const mainSchema = '65fa18b9cc593e87fde12c2bf78e3013a0cc58d5d3b4755068d21479d2e6d658';
  const main = actual.filter(x => baseline.includes(x) || profile.schemaMigrations[mainSchema].includes(x.name));
  const candidateSchema = hash(await readFile('packages/db/prisma/schema.prisma'));
  const args = { baseline, main, mainSchema, candidate: actual, candidateSchema };
  assert.equal(evaluateSchemaPlan(args).disposition, 'retained-additive');
  const prior = 'f1fcdd418dad583b377b340403817863c727aea6452d5505fe3294db60094b54';
  const candidate = actual.filter(x => baseline.includes(x) || profile.schemaMigrations[prior].includes(x.name));
  assert.equal(evaluateSchemaPlan({ ...args, candidateSchema: prior, candidate }).disposition, 'retained-additive');
  const withoutMap = { ...profile, schemaMigrations: { ...profile.schemaMigrations, [prior]: undefined } };
  assert.throws(() => evaluateSchemaPlan({ ...args, candidateSchema: prior, candidate, profile: withoutMap }), /Schema snapshot and migration inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...args, candidate: actual.filter(x => !x.name.startsWith('20261025017500')) }), /Schema snapshot and migration inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...args, candidate: actual.map(x => x.name.startsWith('20261025017500') ? { ...x, checksum: 'drift' } : x) }), /Unreviewed migration or checksum drift/);
});
