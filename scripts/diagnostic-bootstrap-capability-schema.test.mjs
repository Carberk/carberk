import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261026011000_diagnostic_bootstrap_capability_qualification';
const prior = '260c1eb802c863127dc35159740f3662c0c0283ff138438e9b4def032dec8b6b';
const checksum = 'd7265b92ba944af1a62055a6ffd6ce9316f1203b75384929a89c3da86f8ccc3d';

test('bootstrap qualification retains exact assembler bytes and changes only the ambiguous staff selection', async () => {
  const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  assert.equal(createHash('sha256').update(migration).digest('hex'), checksum);
  assert.equal(migration, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
  const historical = await readFile('packages/db/prisma/migrations/20261025015000_diagnostic_runtime_transport_corrections/migration.sql', 'utf8');
  const declaration = 'CREATE OR REPLACE FUNCTION public.diagnostic_source_parse_before_moderation(c jsonb)';
  const functionSql = sql => sql.slice(sql.indexOf(declaration), sql.indexOf('END $function$;', sql.indexOf(declaration)) + 'END $function$;'.length);
  const oldSelection = `FROM public.staff_grants WHERE "userId"=c->'intent'->>'userId' AND capability=c->'intent'->>'capability' AND "revokedAt" IS NULL`;
  assert.ok(functionSql(historical).includes(oldSelection));
  assert.equal(functionSql(migration), functionSql(historical).replace(oldSelection, `FROM public.staff_grants g WHERE g."userId"=c->'intent'->>'userId' AND g.capability=c->'intent'->>'capability' AND g."revokedAt" IS NULL`));
  assert.doesNotMatch(migration, /ALTER TABLE|ENABLE TRIGGER|DISABLE TRIGGER|DROP /i);
});

test('current profile adds bootstrap qualification after R8 without changing prior snapshot inventories', async () => {
  const schema = await readFile('packages/db/prisma/schema.prisma');
  const current = 'e68eadbde1292dec7ed0b33ed014528ecea483a7977793d1ef01e79b56d3675b';
  assert.ok(retainedSchemaProfile.schemaHashes.includes(createHash('sha256').update(schema).digest('hex')));
  assert.deepEqual(retainedSchemaProfile.additions.find(entry => entry.name === name), { name, checksum });
  const priorNames = retainedSchemaProfile.schemaMigrations[prior];
  assert.equal(priorNames.at(-1), '20261026010000_diagnostic_automatic_public_continuity');
  assert.equal(priorNames.includes(name), false);
  assert.deepEqual(retainedSchemaProfile.schemaMigrations[current], [...priorNames, name]);
  const main = inventoryForSchema(prior, []);
  const candidate = inventoryForSchema(current, []);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: current, mainSchema: prior }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: candidate.filter(entry => entry.name !== name), main, candidateSchema: current, mainSchema: prior }), /inventory mismatch/);
});
