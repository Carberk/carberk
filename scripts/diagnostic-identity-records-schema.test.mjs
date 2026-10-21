import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('diagnostic identity records retain exact reviewed append-only forward SQL for the current schema', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const name = '20261021110000_diagnostic_identity_records';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 const text = sql.toString('utf8');
 // Binding to the resulting order version and current observation; no legacy backfill or rewrite.
 assert.ok(text.includes('o.version=NEW."orderVersion" AND o."erasedAt" IS NULL AND o."observedVehicle"=NEW.observation'));
 assert.ok(text.includes('BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_records'));
 assert.ok(text.includes('"observationHash" IS NOT NULL AND "observationHash" ~'));
 assert.ok(!/INSERT INTO|UPDATE (inspection_orders|diagnostic_identity_records)|DELETE FROM/.test(text));
});
