import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024050000_diagnostic_kernel_invariants';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');

test('finite invariant migration has its exact retained mirror and additive inventory', () => {
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  // Preserve this held profile; the correction test owns the current profile.
  const schema = 'fbc4ebcf15d6abf6dd8a3ef8d403f8b5dcf40794c356ec11c960cb462a1f5a4a';
  const prior = 'e40cc31cfa68c532d63b70b11704e2d14e4d4b59c22412438a98dc8b5a82f06a';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});
