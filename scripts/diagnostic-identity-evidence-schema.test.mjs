import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('diagnostic identity evidence retains exact reviewed forward SQL with persisted ownership and immutability', () => {
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 const name = '20261021130000_diagnostic_identity_evidence';
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 assert.equal(inventoryForSchema(hash(schema), []).find(row => row.name === name)?.checksum, hash(sql));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 const text = sql.toString('utf8');
 // One root per raw record and at most one successor per record.
 assert.ok(text.includes('CREATE UNIQUE INDEX diagnostic_identity_evidence_root ON diagnostic_identity_evidence("identityRecordId") WHERE "supersedesId" IS NULL'));
 assert.ok(text.includes('CREATE UNIQUE INDEX "diagnostic_identity_evidence_supersedesId_key"'));
 // Report evidence and identity provenance never share an object owner id.
 assert.ok(text.includes("pg_advisory_xact_lock(hashtext('diagnostic-object-owner:' || NEW.id))"));
 assert.ok(text.includes('BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_provenance'));
 assert.ok(text.includes('BEFORE INSERT OR UPDATE OR DELETE ON diagnostic_identity_evidence'));
 assert.ok(text.includes('BEFORE INSERT OR UPDATE ON diagnostic_reports'));
 assert.ok(text.includes('BEFORE UPDATE OF "identityEvidenceGeneration" ON inspection_orders'));
 // Forward-only: no backfill or rewrite of existing rows.
 assert.ok(!/INSERT INTO|UPDATE (inspection_orders|diagnostic_\w+) SET|DELETE FROM/.test(text));
});
