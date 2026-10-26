import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261026010000_diagnostic_automatic_public_continuity';
const migrationPath = `packages/db/prisma/migrations/${name}/migration.sql`;

test('automatic public continuity retains an exact additive migration mirror and current profile entry', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  const mirror = await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8');
  assert.equal(migration, mirror);
  assert.deepEqual(retainedSchemaProfile.additions.find(entry => entry.name === name), {
    name, checksum: createHash('sha256').update(migration).digest('hex'),
  });
  assert.equal(retainedSchemaProfile.schemaMigrations['260c1eb802c863127dc35159740f3662c0c0283ff138438e9b4def032dec8b6b'].at(-1), name);
  assert.equal(retainedSchemaProfile.schemaMigrations['ab369beff6cda4e67243ec90a8f6b1c8c35692bab6c053500f4977a822f09c9d'].includes(name), false);
});

test('automatic SQL requires both persisted anchors, all raw ownership rows and current publisher binding', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const token of [
    'diagnostic_public_automatic_ownership_bound',
    'diagnostic_source_anchors',
    'diagnostic_identity_records',
    'diagnostic_ownership_components',
    'diagnostic_ownership_grants',
    "a.state='unchanged'",
    "proof.content->>'method'='automatic_normalized_vin'",
    'diagnostic_public_continuity_bound(proof,ao,b)',
    'proof.bindings->\'ownership\'',
    'clock_timestamp()',
  ]) assert.ok(sql.includes(token), token);
  assert.match(sql, /ORDER BY r\."orderVersion" DESC,r\.id DESC LIMIT 1/);
  assert.match(sql, /fa\.grant_listing=fb\.grant_listing/);
  assert.match(sql, /public\.diagnostic_source_guards_ready\(\)/);
  assert.match(sql, /'records'=\(/);
  assert.match(sql, /earlier\."orderVersion"<x\."orderVersion"/);
  assert.doesNotMatch(sql, /MIN\s*\(\s*createdAt/i);
  assert.doesNotMatch(sql, /COUNT\s*\(\s*\*\s*\).*first/i);
});

test('profile planning sees the migration as a forward-only addition', () => {
  const current = '260c1eb802c863127dc35159740f3662c0c0283ff138438e9b4def032dec8b6b';
  const priorSchema = 'ab369beff6cda4e67243ec90a8f6b1c8c35692bab6c053500f4977a822f09c9d';
  const prior = inventoryForSchema(priorSchema, []);
  const candidate = inventoryForSchema(current, []);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main: prior, candidateSchema: current, mainSchema: priorSchema }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: candidate.filter(entry => entry.name !== name), main: prior, candidateSchema: current, mainSchema: priorSchema }), /inventory mismatch/);
});
