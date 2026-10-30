import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile as profile, evaluateSchemaPlan } from './staging-schema.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = 'add89ebf10b233e9d85ef5369e9fd426dbe885001bd3efe4bc4ddd6f1c38405d';
const publication = '1cf0742ba3d69f4d0d13ac801edba81f2dbe68f41c3a54eeff4a90c4a287904b';
const transport = '20261025019000_diagnostic_user_insert_error_transport';
const publish = '20261025020000_diagnostic_listing_publication_effects';

test('combined91 inventory reaches real validator from both retained90 snapshots', async () => {
  const names = (await readdir('packages/db/prisma/migrations', { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort();
  const all = await Promise.all(names.map(async name => ({ name, checksum: hash(await readFile(`packages/db/prisma/migrations/${name}/migration.sql`)) })));
  const schema = await readFile('packages/db/prisma/schema.prisma', 'utf8');
  const later = '\n// Snapshot: 20261026010000_diagnostic_automatic_public_continuity, activation remains gated.\n';
  assert.equal(schema.split(later).length, 2);
  const current = hash(schema.slice(0, schema.indexOf(later)));
  assert.equal(current, 'ab369beff6cda4e67243ec90a8f6b1c8c35692bab6c053500f4977a822f09c9d');
  const additions = new Set(profile.additions.map(row => row.name));
  // Verify the retained91 candidate against actual bytes, without importing
  // later additions into either immutable90/91 snapshot.
  const actual = all.filter(row => !additions.has(row.name) || profile.schemaMigrations[current].includes(row.name));
  assert.equal(actual.length, 91);
  assert.deepEqual(profile.schemaMigrations[current], [...profile.schemaMigrations[identity], publish]);
  assert.deepEqual([...profile.schemaMigrations[publication], transport].sort(), [...profile.schemaMigrations[current]].sort());
  const baseline = actual.filter(row => !additions.has(row.name));
  for (const prior of [identity, publication]) {
    const main = actual.filter(row => baseline.includes(row) || profile.schemaMigrations[prior].includes(row.name));
    assert.equal(main.length, 90);
    const plan = { baseline, main, mainSchema: prior, candidate: actual, candidateSchema: current };
    assert.equal(evaluateSchemaPlan(plan).disposition, 'retained-additive');
    for (const name of [transport, publish]) {
      assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: actual.filter(row => row.name !== name) }), /inventory mismatch/);
      assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: actual.map(row => row.name === name ? { ...row, checksum: 'drift' } : row) }), /checksum drift/);
    }
    const withoutMap = { ...profile, schemaMigrations: { ...profile.schemaMigrations, [current]: undefined } };
    assert.throws(() => evaluateSchemaPlan({ ...plan, profile: withoutMap }), /inventory mismatch/);
  }
});
