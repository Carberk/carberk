import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('diagnostic reinspection lineage retains exact reviewed forward SQL for the current schema', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const name = '20261021100000_diagnostic_reinspection_lineage';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 const text = sql.toString('utf8');
 assert.ok(text.includes('NEW."predecessorId",NEW.reinspection) IS DISTINCT FROM ROW(OLD.id,OLD."orderId",OLD."templateVersionId",OLD.audience,OLD."predecessorId",OLD.reinspection)'));
 assert.ok(text.includes("IF TG_OP='INSERT' AND NOT EXISTS ("));
 assert.ok(text.includes('WHERE "predecessorId" IS NULL OR reinspection'));
 assert.ok(!/DELETE|UPDATE diagnostic_reports|"predecessorId"=NULL/.test(text));
});
