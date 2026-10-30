import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const name = '20261024120000_diagnostic_account_noop_enquiry';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
test('account no-op correction preserves historical inventory and exact retained bytes', () => {
  const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  // The composition test owns the current snapshot; this test retains the account correction boundary.
  const schema = 'a313d359e8ea440c3b026f2de4c4b292b61c8bd2f60b786b85a5d9902e1d6642';
  const prior = 'dbba552039b0a52ef425912681b00deca5b97005348d6fff82fe886e1fe48fa8';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: schema, mainSchema: prior }), /inventory mismatch/);
});
