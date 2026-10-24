import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024070000_diagnostic_user_eligibility';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

test('finite User moderation is an exact additive retained migration, preserving the prior profile', () => {
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  const schema = hash(read('../packages/db/prisma/schema.prisma'));
  const prior = '35b500eac8a9c55c8b369783b6dfe4a1a552676294809cbddb7f4b452e91759d';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: schema, mainSchema: prior }), /inventory mismatch/);
});
