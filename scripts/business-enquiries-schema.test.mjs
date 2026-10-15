import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';

test('business enquiry restoration preserves exact ownership and versioned audit schema bytes', () => {
 const name = '20261015060000_business_enquiries';
 const entry = retainedSchemaProfile.additions.find(item => item.name === name);
 assert.ok(entry);
 const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 assert.deepEqual(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url)));
 assert.equal(createHash('sha256').update(sql).digest('hex'), entry.checksum);
 const current = createHash('sha256').update(readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url))).digest('hex');
 const baseline = [{ name: 'baseline', checksum: '1'.repeat(64) }];
 const candidate = [...baseline, ...retainedSchemaProfile.additions];
 const main = candidate.filter(item => ![name, '20261015070000_diagnostic_intake'].includes(item.name));
 const input = { baseline, candidate, main, candidateSchema: current, mainSchema: '699490ac60c0eb724acd04af5d1f88853ef9d79ca5448f01b6b0236e662fcff4' };
 assert.equal(evaluateSchemaPlan(input).disposition, 'retained-additive');
 assert.throws(() => evaluateSchemaPlan({ ...input, candidate: main }), /inventory mismatch/);
 assert.throws(() => evaluateSchemaPlan({ ...input, retained: [{ ...entry, checksum: '0'.repeat(64) }] }), /checksum drift/);
});
