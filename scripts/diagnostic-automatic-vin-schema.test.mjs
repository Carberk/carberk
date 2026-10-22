import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('automatic VIN method retains reviewed forward SQL and the effective proof consumption guard', () => {
 const name = '20261021160000_diagnostic_automatic_vin_proof';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 const old = readFileSync(new URL('../packages/db/prisma/migrations/20261021150000_diagnostic_continuity_proof_consumption/migration.sql', import.meta.url), 'utf8');
 const guard = old.slice(old.indexOf('CREATE OR REPLACE FUNCTION diagnostic_continuity_proof_guard()'), old.indexOf('-- Unchanged except that a consumed proof'));
 const expected = guard.replace("NEW.content->>'method'<>'comparative_attestation'", "(NEW.content->>'method' IS NULL OR NEW.content->>'method' NOT IN ('comparative_attestation','automatic_normalized_vin'))");
 assert.equal(sql.toString().slice(sql.toString().indexOf('CREATE OR REPLACE FUNCTION')), expected);
});
