import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test('same-graph disposal retains exact forward SQL and compatibility with the prior ownership snapshot', () => {
 const name = '20261023100000_diagnostic_ownership_disposal_same_graph';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 // This test owns the exact disposal-only snapshot; later additive inventories have their own test.
 const current = '8b7ee275cf4f8bf3c79358f5622f85b0b42571ac7a9b0d92b7e97d6d495ed492';
 const prior = 'ccb4ccf63789ecb4262fb14530025b46971891df895951dbb2490aa656b3a969';
 const candidate = inventoryForSchema(current, []), main = inventoryForSchema(prior, []);
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.equal(candidate.find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(candidate.filter(row => row.name !== name), main);
 assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: current, mainSchema: prior }).disposition, 'retained-additive');
 assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: current, mainSchema: prior }), /inventory mismatch/);
});
