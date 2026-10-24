import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024020000_campaign_preparation';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const sql = read(`../packages/db/prisma/migrations/${name}/migration.sql`);

test('campaign preparation adds an exact retained migration to a new schema snapshot', () => {
  assert.equal(sql, read(`./testing/retained-schema/${name}.sql`));
  // This test owns the campaign snapshot; purge-effects owns the next snapshot.
  const schema = '6e059c956df99e8e7feeb8dca70b7a27051a8851fde8edf2c5296a5eb6e5819b';
  const prior = '4ae34bfb8ae50fb5a8bd83b04fa1eb819cbb63abf5e427f007dfc508ae15b546';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});
