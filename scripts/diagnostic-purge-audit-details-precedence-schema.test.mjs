import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = "20261026013000_diagnostic_purge_audit_details_precedence";
const checksum = "a4473bed2ff325a5b7a1a1c58220d5ef754592373545bc99d508606e4869442d";
const prior = "0cb43cc014e46819c6859fefdd2fe23359cddad2fc95be77bd316ad9472b8621";
const current = "a36ddd1c544eb4c507e706d2737b663a93f4aa5e91837f0f53471bc6fffab702";

test('purge audit correction changes only the extraction grouping in the historical function', async () => {
 const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
 assert.equal(createHash('sha256').update(migration).digest('hex'), checksum);
 assert.equal(migration, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
 const historical = await readFile('packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql', 'utf8');
 const start = historical.indexOf('CREATE FUNCTION public.diagnostic_account_purge_effects(c jsonb)');
 const body = historical.slice(start, historical.indexOf('END $$;', start) + 'END $$;'.length);
 const expected = body.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace("patch:=jsonb_build_object('details',r->'details'-'reason');", "patch:=jsonb_build_object('details',(r->'details')-'reason');");
 assert.equal(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION')).trim(), expected);
 assert.doesNotMatch(migration, /ALTER TABLE|ENABLE TRIGGER|DISABLE TRIGGER|DROP /i);
});
test('purge audit snapshot preserves120 inventory and refuses missing map, missing130 and checksum drift', async () => {
 const schema = await readFile('packages/db/prisma/schema.prisma');
 assert.equal(createHash('sha256').update(schema).digest('hex'), current);
 assert.deepEqual(retainedSchemaProfile.additions.find(x => x.name === name), { name, checksum });
 const priorNames = retainedSchemaProfile.schemaMigrations[prior];
 assert.equal(priorNames.at(-1), '20261026012000_diagnostic_disposal_selector_precedence');
 assert.deepEqual(retainedSchemaProfile.schemaMigrations[current], [...priorNames, name]);
 const main = inventoryForSchema(prior, []), candidate = inventoryForSchema(current, []);
 const args = { baseline: [], main, candidate, mainSchema: prior, candidateSchema: current };
 assert.equal(evaluateSchemaPlan(args).disposition, 'retained-additive');
 const profile = structuredClone(retainedSchemaProfile); delete profile.schemaMigrations[current];
 assert.throws(() => evaluateSchemaPlan({ ...args, profile }), /inventory mismatch/);
 assert.throws(() => evaluateSchemaPlan({ ...args, candidate: candidate.filter(x => x.name !== name) }), /inventory mismatch/);
 assert.throws(() => evaluateSchemaPlan({ ...args, candidate: candidate.map(x => x.name === name ? { ...x, checksum: '0'.repeat(64) } : x) }), /checksum drift/);
});
