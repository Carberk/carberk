import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

test('Support and video restoration preserve exact SQL, schemas and historical inventories', () => {
 const current = createHash('sha256').update(readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url))).digest('hex');
 const baseline = [{ name: 'baseline', checksum: '1'.repeat(64) }];
 const candidate = inventoryForSchema(current, baseline);
 for (const name of ['20261015120000_listing_video_foundation', '20261015130000_support_operations']) {
  const entry = candidate.find(item => item.name === name); assert.ok(entry);
  const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
  assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
  assert.equal(createHash('sha256').update(sql).digest('hex'), entry.checksum);
 }
 const mainSchema = '58135481917076948582118a114469a480b1a35165078c779816bf1e1fa6414e';
 const main = inventoryForSchema(mainSchema, baseline);
 const input = { baseline, candidate, main, candidateSchema: current, mainSchema };
 assert.equal(evaluateSchemaPlan(input).disposition, 'retained-additive');
 assert.throws(() => evaluateSchemaPlan({ ...input, candidate: main }), /inventory mismatch/);
 assert.throws(() => evaluateSchemaPlan({ ...input, main: candidate }), /inventory mismatch/);
 assert.throws(() => evaluateSchemaPlan({ ...input, candidate: candidate.map(item => item.name === '20261015130000_support_operations' ? { ...item, checksum: '0'.repeat(64) } : item) }), /checksum drift/);
 assert.throws(() => evaluateSchemaPlan({ ...input, candidateSchema: 'unreviewed' }), /Unreviewed schema/);
 for (const hash of retainedSchemaProfile.schemaHashes) {
  const historical = inventoryForSchema(hash, baseline);
  assert.equal(evaluateSchemaPlan({ ...input, main: historical, mainSchema: hash }).disposition, hash === current ? 'unchanged' : 'retained-additive');
 }
});
