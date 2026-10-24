import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const name = '20261024100000_diagnostic_signin_intake_object_owners';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
test('Sign-in Method/intake/object ownership corrections are one exact forward retained addition', () => {
  const sql = read('../packages/db/prisma/migrations/' + name + '/migration.sql');
  assert.equal(sql, read('./testing/retained-schema/' + name + '.sql'));
  const schema = 'f13288a0ca5dbe78b5f30c4e713b0b8f5aa5af4f38535b38131c86d4412b3fda'; // Historical Sign-in Method/intake/object snapshot.
  const prior = 'b1f6bb7a299221f0a0b4a70d172af7732f2c8ad8c78b9b549523a1f1ce3e2fc9';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: schema, mainSchema: prior }), /inventory mismatch/);
});
