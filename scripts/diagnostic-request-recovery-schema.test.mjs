import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

test('request recovery appends its exact SQL after the unchanged disposal inventory', () => {
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 const name = '20261023110000_diagnostic_continuity_requests';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const current = 'a95ed6f93a3b7c417e4a72efb0b854d8f1a9558a8d5ab9e933a252b294c865cd'; // Historical request-only snapshot; later inventories have separate tests.
 const prior = '8b7ee275cf4f8bf3c79358f5622f85b0b42571ac7a9b0d92b7e97d6d495ed492';
 const candidate = inventoryForSchema(current, []), main = inventoryForSchema(prior, []);
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.equal(candidate.find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(candidate.filter(row => row.name !== name), main);
 assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: current, mainSchema: prior }).disposition, 'retained-additive');
 assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: current, mainSchema: prior }), /inventory mismatch/);
});
