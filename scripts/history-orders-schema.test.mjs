import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');

test('History order schema has a closed exact restoration inventory and immutable accepted facts', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const hash = digest(schema);
 const name = '20261015150000_history_orders';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const baseline = [{ name: 'baseline', checksum: '1'.repeat(64) }];
 const candidate = inventoryForSchema(hash, baseline);
 assert.equal(candidate.find(entry => entry.name === name)?.checksum, digest(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 for (const oldHash of retainedSchemaProfile.schemaHashes) {
  assert.equal(evaluateSchemaPlan({ baseline, candidate, main: inventoryForSchema(oldHash, baseline), candidateSchema: hash, mainSchema: oldHash }).disposition, hash === oldHash ? 'unchanged' : 'retained-additive');
 }
 for (const constraint of ['history_quote_facts_immutable', 'history_order_identity_immutable', 'history_quotes_valid_offer', 'history_capacity_limits', 'history_provider_allowance_limits', 'history_orders_state', 'history_payments_state', 'history_purchase_intents_state', 'history_refunds_state']) assert.ok(sql.includes(constraint), constraint);
});
