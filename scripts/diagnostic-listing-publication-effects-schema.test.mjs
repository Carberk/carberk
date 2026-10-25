import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retainedSchemaProfile } from './staging-schema.mjs';

test('R7b publication migration is registered and its retained mirror is byte-identical', async () => {
  const name = '20261025020000_diagnostic_listing_publication_effects';
  const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  const mirror = await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8');
  assert.equal(migration, mirror);
  assert.deepEqual(retainedSchemaProfile.additions.find(entry => entry.name === name), {
    name, checksum: '108eb593ad6292cf96ec0106e1fdd5e2eb45c38ea9a4a4fe2e04e96b6a6d87c8',
  });
  assert.match(migration, /listing_publication_intent_missing/);
  assert.match(migration, /jsonb_object_length\(publication->'measurement'->'expiresAt'\)/);
});
