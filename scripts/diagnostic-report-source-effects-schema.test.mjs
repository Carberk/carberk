import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const read = path => readFileSync(new URL(path, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prior = JSON.parse(read('../docs/evidence/issue-897/r5-report-source-effects-20261025/original-inventories.json'));
const name = '20261025010000_diagnostic_report_source_effects';
const sql = read(`../packages/db/prisma/migrations/${name}/migration.sql`);
const oldSchema = '7ce808a1af40f4f85c340526ca8ea3bced18e99155282d41b610aca9e85cfc72';
// This test owns the report100 snapshot, not the latest assembled snapshot.
const retainedSchema = Buffer.concat([read('../docs/evidence/issue-897/r5-report-source-effects-20261025/original/packages/db/prisma/schema.prisma'), Buffer.from('\n// Snapshot: 20261025010000_diagnostic_report_source_effects.\n')]);
const schema = '65fa18b9cc593e87fde12c2bf78e3013a0cc58d5d3b4755068d21479d2e6d658';
test('report effects add exactly the two finite table/verb pairs and delegate every old predicate', () => {
  assert.equal(sql.toString(), read(`./testing/retained-schema/${name}.sql`).toString());
  assert.equal(hash(sql), retainedSchemaProfile.additions.find(row => row.name === name)?.checksum);
  assert.match(sql.toString(), /SELECT public\.diagnostic_source_allows_before_report_effects\(op,t,v\)/);
  assert.match(sql.toString(), /op='report_change' AND \(\(t='diagnostic_evidence' AND v='update'\)\s+OR \(t='diagnostic_pdf_artifacts' AND v='insert'\)\)/);
  assert.doesNotMatch(sql.toString(), /(?:ENABLE|DISABLE).*TRIGGER|CREATE TABLE|diagnostic_prepare_source|diagnostic_source_scope|UPDATE public\.|automatic_normalized_vin/i);
});
test('all historical SQL, mirrors, 52 snapshots and exact prior additions retain their bytes and order', () => {
  for (const [path, expected] of Object.entries(prior.sha256)) assert.equal(hash(read(`../${path}`)), expected, path);
  assert.equal(hash(retainedSchema), schema);
  assert.deepEqual(retainedSchemaProfile.schemaHashes.filter(key => [schema, ...prior.profile.schemaHashes].includes(key)), [schema, ...prior.profile.schemaHashes]);
  for (const [key, inventory] of Object.entries(prior.profile.schemaMigrations)) assert.deepEqual(retainedSchemaProfile.schemaMigrations[key], inventory);
  assert.deepEqual(retainedSchemaProfile.additions.filter(row => prior.profile.additions.some(old => old.name === row.name)), prior.profile.additions);
  assert.equal(prior.profile.schemaHashes.length, 52);
  for (const file of ['staging-schema.mjs','diagnostic-intake-campaign-composition-schema.test.mjs','diagnostic-kernel-physical-columns-schema.test.mjs']) {
    assert.equal(hash(read(`../docs/evidence/issue-897/r5-report-source-effects-20261025/original/scripts/${file}`)), prior.inputs[`scripts/${file}`]);
  }
  assert.equal(hash(Buffer.from(retainedSchema.toString().replace('\n// Snapshot: 20261025010000_diagnostic_report_source_effects.\n', ''))), prior.inputs['packages/db/prisma/schema.prisma']);
});
test('the new snapshot adds just its migration and rejects missing or drifting inventories', () => {
  assert.deepEqual(retainedSchemaProfile.schemaMigrations[schema], [...prior.profile.schemaMigrations[oldSchema], name]);
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(oldSchema, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  const plan = { baseline: [], candidate, main, candidateSchema: schema, mainSchema: oldSchema };
  assert.equal(evaluateSchemaPlan(plan).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: main }), /inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: candidate.map(row => row.name === name ? { ...row, checksum: 'forged' } : row) }), /checksum drift refused/);
});
