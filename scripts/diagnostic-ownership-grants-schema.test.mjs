import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
import { evaluateSchemaPlan } from './staging-schema.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
test('source grants retain exact additive migration and prior closed-admission inventory', () => {
 const name = '20261023120000_diagnostic_ownership_grants';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const schema = hash(readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url)));
 const prior = 'a95ed6f93a3b7c417e4a72efb0b854d8f1a9558a8d5ab9e933a252b294c865cd';
 const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.equal(candidate.find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(candidate.filter(row => row.name !== name), main);
 assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});
