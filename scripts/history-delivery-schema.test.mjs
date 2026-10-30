import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('History delivery keeps original artifact identity and exact retained restoration SQL', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const sql = readFileSync(new URL('../packages/db/prisma/migrations/20261015180000_history_delivery/migration.sql', import.meta.url));
 const inventory = inventoryForSchema(hash(schema), []);
 assert.equal(inventory.find(row => row.name === '20261015180000_history_delivery')?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL('./testing/retained-schema/20261015180000_history_delivery.sql', import.meta.url)));
 for (const invariant of ['history_artifact_original_immutable', 'history_delivery_exact_order', 'history_artifact_valid', 'history_booking_valid']) assert.ok(sql.includes(invariant), invariant);
});
