import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('History source facts retain exact bounded immutable SQL and schema inventory', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const name = '20261015240000_history_source_facts';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.ok(sql.includes('history_artifact_source_facts_bounded'));
 assert.ok(sql.includes('history_artifact_source_facts_immutable'));
});
