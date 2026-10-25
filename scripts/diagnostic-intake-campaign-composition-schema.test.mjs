import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
import { retainedSchemaProfile } from '../docs/evidence/issue-897/r5-report-source-effects-20261025/original/scripts/staging-schema.mjs';
const originalPhysicalColumnChecksums = {
  "20261023130000_diagnostic_source_kernel": "cc10000343f6257cb4b0d9cd4240ec57f46642f5a9b0735cd440680602d642b3",
  "20261024030000_diagnostic_purge_effects": "ccb26627dcee74bf20c01c5e89dba2d6ade4d6644136fd55554c8246fa8f46d0"
};
const name = '20261024130000_diagnostic_intake_campaign_composition';
const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
test('finite composition is retained byte exactly without activating guards', () => {
  assert.equal(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url), 'utf8'));
  assert.equal(retainedSchemaProfile.additions.find(row => row.name === name)?.checksum, createHash('sha256').update(sql).digest('hex'));
  assert.doesNotMatch(sql, /ENABLE.*TRIGGER|DISABLE.*TRIGGER|CREATE.*TABLE|UPDATE public\.diagnostic_source_anchors/i);
});
test('the original operation owns its row and the server derives only finite bootstrap effects', () => {
  assert.match(sql, /operation.*NOT IN \('intake_create','template_publish'\)/);
  assert.match(sql, /jsonb_array_length\(c->'rows'\)<>1/);
  assert.match(sql, /diagnostic_campaign_intake\(admission\)/);
  assert.match(sql, /diagnostic_intake_effects_before_composition/);
  assert.match(sql, /diagnostic_source_scope_before_composition/);
  assert.match(sql, /campaignAdmission/);
});
test('naked receipt deletion and finish share unchanged hashed authority completion', () => {
  assert.match(sql, /BEFORE DELETE ON public\.diagnostic_source_commands/);
  assert.match(sql, /diagnostic_contract_hash.*md5\(pg_get_functiondef/s);
  assert.match(sql, /campaign_diagnostic_authority\(\$1,\$2,\$3,NULL,NULL,NULL,\$4\)/);
  assert.match(sql, /admitted IS NOT TRUE/);
});
test('composition preserves historical registrations across the explicit unmerged physical-column revision', () => {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const current = hash(readFileSync(new URL('../docs/evidence/issue-897/r5-report-source-effects-20261025/original/packages/db/prisma/schema.prisma', import.meta.url))); // Historical composition snapshot.
  const prior = 'a313d359e8ea440c3b026f2de4c4b292b61c8bd2f60b786b85a5d9902e1d6642';
  assert.equal(current, '7ce808a1af40f4f85c340526ca8ea3bced18e99155282d41b610aca9e85cfc72');
  assert.deepEqual(retainedSchemaProfile.schemaMigrations[current], [...retainedSchemaProfile.schemaMigrations[prior], name]);
  const candidate = inventoryForSchema(current, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: current, mainSchema: prior }).disposition, 'retained-additive');
  assert.throws(() => evaluateSchemaPlan({ baseline: [], candidate: main, main, candidateSchema: current, mainSchema: prior }), /inventory mismatch/);
  const schemaMigrations = { ...retainedSchemaProfile.schemaMigrations }; delete schemaMigrations[current];
  assert.equal(hash(JSON.stringify({ schemaHashes: retainedSchemaProfile.schemaHashes.filter(h => h !== current), schemaMigrations,
    additions: retainedSchemaProfile.additions.filter(row => row.name !== name).map(row => {
      const original = originalPhysicalColumnChecksums[row.name];
      return original ? { ...row, checksum: original } : row;
    }) })), '35578ff2333bd11bfd8ae77a40220ccdc46ea72f24be81ebc57b221155c6200a');
});
