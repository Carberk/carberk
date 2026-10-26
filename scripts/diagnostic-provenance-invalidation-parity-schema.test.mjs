import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const name='20261026016000_diagnostic_provenance_invalidation_parity';
const checksum='87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1';
test('160 changes only provenance event parity in the invalidation helper',async()=>{const m=await readFile(`packages/db/prisma/migrations/${name}/migration.sql`,'utf8');assert.equal(createHash('sha256').update(m).digest('hex'),checksum);assert.equal(m,await readFile(`scripts/testing/retained-schema/${name}.sql`,'utf8'));assert.equal((m.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert.match(m,/diagnostic_identity_provenance.*e->>'verb'='insert'.*RETURN false/s);assert.match(m,/writeLeaseUntil','cleanupLeaseUntil','cleanupAttempts','cleanupFailureCode/);assert.doesNotMatch(m,/CREATE TRIGGER|ALTER TABLE|DROP |SECURITY DEFINER/i);});
