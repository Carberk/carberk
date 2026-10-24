import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024030000_diagnostic_purge_effects';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');

test('purge effects add a byte-identical retained migration and preserve the prior inventory', () => {
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  const schema = hash(read('../packages/db/prisma/schema.prisma'));
  const prior = '6e059c956df99e8e7feeb8dca70b7a27051a8851fde8edf2c5296a5eb6e5819b';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});

test('the finite table registry pins physical primary keys and a unique total suborder', () => {
  const registry = JSON.parse(sql.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);
  assert.equal(registry.length, 77);
  assert.equal(new Set(registry.map(row => row.suborder)).size, 77);
  for (const row of registry) assert.equal(row.suborder, row.namespace);
  const tables = Object.fromEntries(registry.map(row => [row.table, row.pk]));
  assert.deepEqual(tables.staff_grants, ['userId', 'capability']);
  assert.deepEqual(tables.service_read_states, ['conversationId', 'userId']);
  assert.deepEqual(tables.video_process_work, ['generationId']);
  assert.deepEqual(tables.measurement_state, ['key']);
  assert.deepEqual(tables.diagnostic_ownership_components, ['identityRecordId']);
});
