import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261024010000_diagnostic_source_guard_repair';
const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const heldName = '20261023130000_diagnostic_source_kernel';
const held = readFileSync(new URL(`../packages/db/prisma/migrations/${heldName}/migration.sql`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const specs = JSON.parse(sql.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);
const registry = JSON.parse(held.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);

test('guard repair retains its bytes against the reviewed revised kernel inventory', () => {
  assert.equal(hash(held), 'b9b2d465c04cc34693e5774d12910a33bb29b39d8452f5a2862dc24b667f4fbf');
  assert.equal(held, readFileSync(new URL(`./testing/retained-schema/${heldName}.sql`, import.meta.url), 'utf8'));
  assert.equal(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url), 'utf8'));
  const schema = '4ae34bfb8ae50fb5a8bd83b04fa1eb819cbb63abf5e427f007dfc508ae15b546', prior = 'a93532709e5b1012f5a1007d5b633c98e982a54ea73fb33b71ddf0fad48c2f7c';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
});

// Metadata consistency only. Executable PostgreSQL scenarios establish guard behavior.
test('selective guard metadata names existing fields and protects every source primary key', () => {
  const seen = new Set();
  for (const spec of specs) {
    assert.ok(!seen.has(spec.table), spec.table); seen.add(spec.table);
    const meta = registry.find(entry => entry.table === spec.table);
    assert.ok(meta, spec.table);
    assert.equal(typeof spec.insert, 'boolean');
    assert.equal(spec.delete, true);
    assert.equal(new Set(spec.update).size, spec.update.length);
    for (const field of spec.update) assert.ok(meta.fields.includes(field), `${spec.table}.${field}`);
    for (const key of meta.pk) assert.ok(spec.update.includes(key), `${spec.table}.${key}`);
  }
  assert.equal(specs.find(spec => spec.table === 'sessions').insert, false);
  assert.deepEqual(specs.find(spec => spec.table === 'sessions').update, ['id', 'userId', 'expiresAt', 'adminTotpExpiresAt']);
  for (const table of ['listing_drafts', 'listing_media', 'media_uploads', 'diagnostic_pdf_artifacts', 'measurement_state', 'service_conversations']) {
    assert.ok(!seen.has(table), table);
  }
  for (const field of ['writeLeaseUntil', 'cleanupLeaseUntil', 'cleanupAttempts', 'cleanupFailureCode']) {
    assert.ok(!specs.find(spec => spec.table === 'diagnostic_identity_provenance').update.includes(field));
  }
});
