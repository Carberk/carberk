import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';

test('effect scope correction only disambiguates both derived e columns', async () => {
  const name = '20261025017500_diagnostic_effect_scope_alias_correction';
  const sql = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  assert.equal(sql, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
  assert.equal(retainedSchemaProfile.additions.find(x => x.name === name)?.checksum, createHash('sha256').update(sql).digest('hex'));
  const historical = await readFile('packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql', 'utf8');
  const original = historical.match(/CREATE FUNCTION public\.diagnostic_source_effects\(c jsonb,scope jsonb\)[\s\S]*?END \$\$;/)[0];
  const corrected = original
    .replace('CREATE FUNCTION public.diagnostic_source_effects(', 'CREATE OR REPLACE FUNCTION public.diagnostic_source_effects_before_intake(')
    .replace("jsonb_array_elements(effects) e WHERE e->>'table'='diagnostic_continuity_requests' AND e->'key'", "jsonb_array_elements(effects) item(effect) WHERE item.effect->>'table'='diagnostic_continuity_requests' AND item.effect->'key'")
    .replace("jsonb_array_elements(effects) e WHERE NOT EXISTS\n  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=e->'table' AND n->'key'=e->'key')", "jsonb_array_elements(effects) item(effect) WHERE NOT EXISTS\n  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=item.effect->'table' AND n->'key'=item.effect->'key')");
  const finite = (await readFile('packages/db/prisma/migrations/20261024050000_diagnostic_kernel_invariants/migration.sql', 'utf8'))
    .match(/CREATE FUNCTION public\.diagnostic_source_effects\(c jsonb,scope jsonb\)[\s\S]*?END \$\$;/)[0]
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace("jsonb_array_elements(effects) e WHERE NOT EXISTS\n  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=e->'table' AND n->'key'=e->'key')", "jsonb_array_elements(effects) item(effect) WHERE NOT EXISTS\n  (SELECT 1 FROM jsonb_array_elements(scope) n WHERE n->'table'=item.effect->'table' AND n->'key'=item.effect->'key')");
  const composition = (await readFile('packages/db/prisma/migrations/20261024130000_diagnostic_intake_campaign_composition/migration.sql', 'utf8'))
    .match(/CREATE FUNCTION public\.diagnostic_intake_effects\(c jsonb\)[\s\S]*?END \$\$;/)[0]
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace("jsonb_agg(e ORDER BY e::text),'[]') FROM jsonb_array_elements(effects) e", "jsonb_agg(item.effect ORDER BY item.effect::text),'[]') FROM jsonb_array_elements(effects) item(effect)");
  assert.equal(sql, `-- Forward-only correction for local e versus derived-column ambiguity.\n${corrected}\n\n-- This is the effective name before publication200 renames the wrapper.\n${finite}\n\n${composition}\n`);
  assert.doesNotMatch(sql, /jsonb_array_elements\(effects\) e\b/);
});
