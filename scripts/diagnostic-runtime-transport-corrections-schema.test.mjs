import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';

test('runtime correction preserves the historical parser and campaign bodies except grouping and aliases', async () => {
 const name = '20261025015000_diagnostic_runtime_transport_corrections';
 const sql = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
 assert.equal(sql, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
 assert.equal(retainedSchemaProfile.additions.find(x => x.name === name)?.checksum, createHash('sha256').update(sql).digest('hex'));
 const historical = await readFile('packages/db/prisma/migrations/20261024020000_campaign_preparation/migration.sql', 'utf8');
 const body = historical.match(/CREATE FUNCTION public\.campaign_preparation_scope\(mutations jsonb\)[\s\S]*?END \$\$;/)[0];
 assert.ok(sql.includes(body.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replaceAll('jsonb_agg(t ORDER BY t COLLATE "C")', 'jsonb_agg(s.t ORDER BY s.t COLLATE "C")')));
 assert.match(sql, /\(r->'expected'\)-'source'/);
 assert.doesNotMatch(sql, /r->'expected'-'source'/);
 for (const file of ['packages/db/src/campaign-preparation.ts', 'packages/db/src/diagnostic-source-command.ts', 'apps/api/src/modules/listings/infrastructure/PrismaUploadClaims.ts']) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/SELECT (?:public\.)?(?:campaign_finish|diagnostic_finish_source|diagnostic_assert_source|diagnostic_seal_first_observation|pg_advisory_xact_lock)\([^`]*`/g)) assert.match(match[0], /::text`$/);
 }
});
