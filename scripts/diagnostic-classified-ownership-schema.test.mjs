import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
test('classified ownership keeps exact forward migration and schema inventory', () => {
 const name = '20261023090000_diagnostic_ownership_components';
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
});
