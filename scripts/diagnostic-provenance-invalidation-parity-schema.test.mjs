import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const name='20261026016000_diagnostic_provenance_invalidation_parity';
const checksum='87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1';
test('160 changes only provenance event parity in the invalidation helper',async()=>{const m=await readFile(`packages/db/prisma/migrations/${name}/migration.sql`,'utf8');assert.equal(createHash('sha256').update(m).digest('hex'),checksum);assert.equal(m,await readFile(`scripts/testing/retained-schema/${name}.sql`,'utf8'));assert.equal((m.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert.match(m,/diagnostic_identity_provenance.*e->>'verb'='insert'.*RETURN false/s);assert.match(m,/writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode/);assert.doesNotMatch(m,/CREATE TRIGGER|ALTER TABLE|DROP |SECURITY DEFINER/i);});

test('current160 source is admitted by the exact profile and unknown schema hashes refuse', async () => {
  const { retainedSchemaProfile, evaluateSchemaPlan } = await import('./staging-schema.mjs');
  const { inventoryForSchema } = await import('./testing/schema-profile-fixture.mjs');
  const current = createHash('sha256').update(await readFile('packages/db/prisma/schema.prisma')).digest('hex');
  const prior = 'e383b1f888a0c9003bd4a7c0fc5c362a4a934b7798e2c24513f327fe5bb26904';
  assert.equal(current, '21cdc52efb2fb1a9cabdfe0955cfe8d75e60147f9e6dd14f83f9e45bf3df4c45');
  assert.deepEqual(retainedSchemaProfile.schemaMigrations[current], [...retainedSchemaProfile.schemaMigrations[prior], name]);
  const args = { baseline: [], main: inventoryForSchema(prior, []), candidate: inventoryForSchema(current, []), mainSchema: prior, candidateSchema: current };
  assert.equal(evaluateSchemaPlan(args).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ ...args, candidateSchema: '0'.repeat(64) }), /Unreviewed schema snapshot refused/);
  assert.throws(() => evaluateSchemaPlan({ ...args, mainSchema: '0'.repeat(64) }), /Unreviewed schema snapshot refused/);
  const missing = structuredClone(retainedSchemaProfile);
  missing.schemaHashes = missing.schemaHashes.filter(hash => hash !== current);
  assert.throws(() => evaluateSchemaPlan({ ...args, profile: missing }), /Unreviewed schema snapshot refused/);
});
