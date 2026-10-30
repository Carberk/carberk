import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = "20261026014000_diagnostic_source_registry_evaluation";
const checksum = "6d3ea989e90a1169fa7f5b46cecfc6e4d1e0a23e8fde774916e54bb1d2592756";
const prior = "a36ddd1c544eb4c507e706d2737b663a93f4aa5e91837f0f53471bc6fffab702";
const current = "84935c26f5e11609663fdb87dbc796836c60f6360de2a30832aa6177a931819d";
const historical = {
  "packages/db/prisma/migrations/20261023130000_diagnostic_source_kernel/migration.sql": "b9b2d465c04cc34693e5774d12910a33bb29b39d8452f5a2862dc24b667f4fbf",
  "packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql": "23d894c79c5927d7d976c79e4cbe958af83725ccf172208b7f4d6132e0d3d4ba",
  "packages/db/prisma/migrations/20261024050000_diagnostic_kernel_invariants/migration.sql": "6fdb70cd2364b0125080293a1602f78788c1db450d82859613c04b0020b732f8",
  "packages/db/prisma/migrations/20261024060000_diagnostic_source_correction/migration.sql": "55fa19d86c4f30d6c6abab96985dfbfb7bc30b0e6d928da1f63ba8fdbd13b7f6",
  "packages/db/prisma/migrations/20261024070000_diagnostic_user_eligibility/migration.sql": "f5fabb22e4e6e5a2dace529e5bcb4de5e56a6daf18ebbff02351e9407430893e",
  "packages/db/prisma/migrations/20261024090000_diagnostic_message_enquiry_fences/migration.sql": "19316d8fbab4d425af191477a997c49d0e518332b89dc9a39779c9a21d72995c"
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Expectations originate in pinned historical migrations, never the candidate.
function reconstruct(sources) {
 for (const [path, digest] of Object.entries(historical)) assert.equal(hash(sources[path]), digest, `Historical registry layer drift: ${path}`);
 const base = sources['packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql'];
 const literal = base.match(/AS \$registry\$\s*SELECT '([\s\S]*?)'::jsonb\s*\$registry\$/);
 assert.ok(literal);
 const entries = JSON.parse(literal[1].replaceAll("''", "'"));
 // Exact ordered transformations in500,600,700,900, all hash-pinned above.
 for (const entry of entries) {
  if (entry.table === 'listings') entry.fields.push('archivedByDeletion');
  if (entry.table === 'inspection_interests') {
   entry.fields = ['id','listing_id','requester_user_id','side','willingness_to_pay_tmt','created_at','updated_at'];
   entry.unique = [['listing_id','requester_user_id']];
   entry.refs = [{table:'listings',columns:['listing_id'],target:['id']},{table:'users',columns:['requester_user_id'],target:['id']}];
  }
  if (entry.table === 'users') entry.fields.push('suspendedById','suspensionReason');
  if (entry.table === 'conversations') entry.refs.push({table:'users',columns:['assigneeId'],target:['id']});
 }
 return entries;
}

test('evaluated registry preserves all historical ordered metadata and refuses historical or future layer drift', async () => {
 const sources = Object.fromEntries(await Promise.all(Object.keys(historical).map(async path => [path, await readFile(path, 'utf8')])));
 const expected = reconstruct(sources);
 assert.equal(expected.length,77);
 const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
 assert.equal(hash(migration),checksum);
 assert.equal(migration,await readFile(`scripts/testing/retained-schema/${name}.sql`,'utf8'));
 const precondition = migration.match(/DECLARE expected jsonb := '([\s\S]*?)'::jsonb;/);
 const value = migration.match(/AS \$registry_value\$\s*SELECT '([\s\S]*?)'::jsonb/);
 assert.ok(precondition);assert.ok(value);
 assert.deepEqual(JSON.parse(precondition[1].replaceAll("''","'")), expected);
 assert.deepEqual(JSON.parse(value[1].replaceAll("''","'")), expected);
 assert.match(migration,/IF public\.diagnostic_source_registry\(\) IS DISTINCT FROM expected THEN\s*RAISE EXCEPTION 'diagnostic_source_registry_evaluation_drift'/);
 assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length,1);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.diagnostic_source_registry\(\) RETURNS jsonb\s*LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public/);
 assert.doesNotMatch(migration,/ALTER TABLE|DROP |SECURITY DEFINER|ENABLE TRIGGER|DISABLE TRIGGER|CREATE TABLE|CREATE INDEX/i);
 const first = Object.keys(sources)[0];
 assert.throws(() => reconstruct({...sources,[first]:sources[first]+'-- drift'}), /Historical registry layer drift/);
 const declarations=[];
 for (const folder of await readdir('packages/db/prisma/migrations')) {
  if (folder==='migration_lock.toml') continue;
  const path=`packages/db/prisma/migrations/${folder}/migration.sql`;
  const text=await readFile(path,'utf8');
  if (/CREATE (?:OR REPLACE )?FUNCTION public\.diagnostic_source_registry\(\)/.test(text)) declarations.push(path);
 }
 assert.deepEqual(declarations.sort(), [...Object.keys(historical),`packages/db/prisma/migrations/${name}/migration.sql`].sort(), 'New registry layers require an explicit reviewed reconstruction update');
});

test('140 snapshot extends exact130 inventory and refuses missing map, missing140 and checksum drift', async () => {
 const schema=await readFile('packages/db/prisma/schema.prisma');assert.equal(hash(schema.toString().replace('// Snapshot: 20261026016000_diagnostic_provenance_invalidation_parity.\n', '').replace('\n// Snapshot: 20261026015000_diagnostic_component_expiry_representation.\n', '')),current);
 assert.deepEqual(retainedSchemaProfile.additions.find(x=>x.name===name),{name,checksum});
 assert.equal(retainedSchemaProfile.schemaMigrations[prior].at(-1),'20261026013000_diagnostic_purge_audit_details_precedence');
 assert.deepEqual(retainedSchemaProfile.schemaMigrations[current],[...retainedSchemaProfile.schemaMigrations[prior],name]);
 const args={baseline:[],main:inventoryForSchema(prior,[]),candidate:inventoryForSchema(current,[]),mainSchema:prior,candidateSchema:current};
 assert.equal(evaluateSchemaPlan(args).disposition,'retained-additive');
 const profile=structuredClone(retainedSchemaProfile);delete profile.schemaMigrations[current];
 assert.throws(()=>evaluateSchemaPlan({...args,profile}),/inventory mismatch/);
 assert.throws(()=>evaluateSchemaPlan({...args,candidate:args.candidate.filter(x=>x.name!==name)}),/inventory mismatch/);
 assert.throws(()=>evaluateSchemaPlan({...args,candidate:args.candidate.map(x=>x.name===name?{...x,checksum:'0'.repeat(64)}:x)}),/checksum drift/);
});
