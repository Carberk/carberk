import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
test('business membership and inventory restoration admit only exact reviewed SQL and schema inventories', () => {
  const names = ['20261015003500_listing_view_counts', '20261015010000_staff_capabilities', '20261015020000_business_membership', '20261015030000_business_inventory'];
  const additions = names.map(name => retainedSchemaProfile.additions.find(entry => entry.name === name));
  for (const entry of additions) {
    assert.ok(entry);
    const fixture = readFileSync(new URL(`./testing/retained-schema/${entry.name}.sql`, import.meta.url));
    assert.equal(createHash('sha256').update(fixture).digest('hex'), entry.checksum);
    assert.deepEqual(fixture, readFileSync(new URL(`../packages/db/prisma/migrations/${entry.name}/migration.sql`, import.meta.url)));
  }
  const membership = 'fcccfb5425820267e806a9ff96688b67c36c65a1bf2ae1192c10ec404b91589f';
  const current = createHash('sha256').update(readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url))).digest('hex');
  assert.ok(retainedSchemaProfile.schemaHashes.includes(current));
  const baseline = [{ name: 'baseline', checksum: '1'.repeat(64) }];
  const input = { baseline, candidate: [...baseline, ...retainedSchemaProfile.additions], main: inventoryForSchema(membership, baseline), candidateSchema: current, mainSchema: membership };
  assert.equal(evaluateSchemaPlan(input).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ ...input, candidate: input.candidate.slice(0, -1) }), /inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...input, candidateSchema: 'unreviewed' }), /Unreviewed schema/);
  assert.throws(() => evaluateSchemaPlan({ ...input, retained: [{ ...additions[3], checksum: '0'.repeat(64) }] }), /checksum drift/);
});
