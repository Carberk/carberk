import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';
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
