import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024040000_diagnostic_intake_effects';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');

test('intake closure adds exactly its retained migration to the prior profile', () => {
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  const schema = hash(read('../packages/db/prisma/schema.prisma'));
  const prior = '89ee14e1d4a2c77154b91615f99b5e281e71957539139e2df6f99d56c8cce71a';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});
