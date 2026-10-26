import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile as profile } from './staging-schema.mjs';

const name = '20261025019000_diagnostic_user_insert_error_transport';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('User INSERT transport changes only the refusal SQLSTATE in the historical fence', async () => {
  const historical = await readFile('packages/db/prisma/migrations/20261024110000_diagnostic_user_insert_fence/migration.sql', 'utf8');
  const original = historical.match(/CREATE FUNCTION public\.diagnostic_user_insert_fence\(\)[\s\S]*?END \$\$;/)[0];
  const sql = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  const expected = original.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace("ERRCODE='40001'", "ERRCODE='55P03'");
  assert.equal(sql, '-- Forward-only error transport correction; contention remains nonblocking.\n' +
    '-- 55P03 preserves the precise refusal through the Prisma PostgreSQL adapter.\n' + expected + '\n');
  assert.equal(sql, await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8'));
  assert.equal(profile.additions.filter(row => row.name === name).length, 1);
  assert.equal(profile.additions.find(row => row.name === name)?.checksum, hash(sql));
  assert.equal(profile.additions.find(row => row.name === '20261024110000_diagnostic_user_insert_fence')?.checksum, hash(historical));
});

test('new snapshot adds only error transport to the exact prior migration mapping', async () => {
  const prior = '1ceb4d0f3cf7deca417721eb2fa2bbc3e36c18adb1b9f2ed8404fc7fa78930c8';
  const current = await readFile('packages/db/prisma/schema.prisma', 'utf8');
  const later = '\n// Snapshot: 20261025020000_diagnostic_listing_publication_effects.\n';
  assert.equal(current.split(later).length, 2);
  // The exact transport snapshot precedes the publication marker. Subsequent
  // registered snapshots must not become part of its historical hash.
  const schema = current.slice(0, current.indexOf(later));
  const marker = `\n// User INSERT refusal error transport: ${name}.\n`;
  assert.ok(schema.endsWith(marker));
  assert.equal(hash(schema.slice(0, -marker.length)), prior);
  assert.equal(hash(schema), 'add89ebf10b233e9d85ef5369e9fd426dbe885001bd3efe4bc4ddd6f1c38405d');
  assert.ok(profile.schemaHashes.includes(hash(schema)));
  assert.deepEqual(profile.schemaMigrations[hash(schema)], [...profile.schemaMigrations[prior], name]);
  assert.ok(!profile.schemaMigrations[prior].includes(name));
});
