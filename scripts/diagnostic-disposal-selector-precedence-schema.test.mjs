import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = "20261026012000_diagnostic_disposal_selector_precedence";
const checksum = "ac9e5b810a7cc7fd2d8ff6e8f4bc60b76d48368e0e7330ce766a449586e6aaef";
const prior = "e68eadbde1292dec7ed0b33ed014528ecea483a7977793d1ef01e79b56d3675b";
const current = "0cb43cc014e46819c6859fefdd2fe23359cddad2fc95be77bd316ad9472b8621";

test('disposal correction preserves the historical body except the two JSON extraction parentheses', async () => {
  const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  assert.equal(createHash('sha256').update(migration).digest('hex'), checksum);
  assert.equal(migration, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
  const historical = await readFile('packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql', 'utf8');
  const declaration = 'CREATE FUNCTION public.diagnostic_source_disposal_effects(c jsonb)';
  const start = historical.indexOf(declaration);
  const old = historical.slice(start, historical.indexOf('END $$;', start) + 'END $$;'.length);
  const expected = old.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace("components:=components||d->'c'; grants:=grants||d->'g';", "components:=components||(d->'c'); grants:=grants||(d->'g');");
  assert.equal(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION')).trim(), expected);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
  assert.doesNotMatch(migration, /ALTER TABLE|ENABLE TRIGGER|DISABLE TRIGGER|COALESCE\(d->|DROP /i);
});

test('disposal snapshot adds only120 after registered100 and110 and refuses missing map, missing migration and checksum drift', async () => {
  const schema = await readFile('packages/db/prisma/schema.prisma');
  assert.equal(createHash('sha256').update(schema.toString().replace('\n// Snapshot: 20261026014000_diagnostic_source_registry_evaluation.\n', '').replace('\n// Snapshot: 20261026013000_diagnostic_purge_audit_details_precedence.\n', '')).digest('hex'), current);
  assert.deepEqual(retainedSchemaProfile.additions.find(entry => entry.name === name), { name, checksum });
  const priorNames = retainedSchemaProfile.schemaMigrations[prior];
  assert.equal(priorNames.at(-2), '20261026010000_diagnostic_automatic_public_continuity');
  assert.equal(priorNames.at(-1), '20261026011000_diagnostic_bootstrap_capability_qualification');
  assert.deepEqual(retainedSchemaProfile.schemaMigrations[current], [...priorNames, name]);
  const main = inventoryForSchema(prior, []), candidate = inventoryForSchema(current, []);
  const args = { baseline: [], candidate, main, candidateSchema: current, mainSchema: prior };
  assert.equal(evaluateSchemaPlan(args).disposition, 'retained-additive');
  const profile = structuredClone(retainedSchemaProfile);
  delete profile.schemaMigrations[current];
  assert.throws(() => evaluateSchemaPlan({ ...args, profile }), /inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...args, candidate: candidate.filter(entry => entry.name !== name) }), /inventory mismatch/);
  assert.throws(() => evaluateSchemaPlan({ ...args, candidate: candidate.map(entry => entry.name === name ? { ...entry, checksum: '0'.repeat(64) } : entry) }), /checksum drift/);
});
