import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';

test('R7b publication migration is registered and its retained mirror is byte-identical', async () => {
  const name = '20261025020000_diagnostic_listing_publication_effects';
  const migration = await readFile(`packages/db/prisma/migrations/${name}/migration.sql`, 'utf8');
  const mirror = await readFile(`scripts/testing/retained-schema/${name}.sql`, 'utf8');
  assert.equal(migration, mirror);
  assert.deepEqual(retainedSchemaProfile.additions.find(entry => entry.name === name), {
    name, checksum: createHash('sha256').update(migration).digest('hex'),
  });
  assert.match(migration, /diagnostic_source_parse_before_listing_publication\(c-'intent'\)/);
  assert.match(migration, /diagnostic_listing_publication_graph/);
  assert.match(migration, /diagnostic_source_scope_before_listing_publication\(public.diagnostic_listing_publication_graph\(c\)\)/);
  assert.match(migration, /publicationOptional/);
  assert.match(migration, /final AND r IS NULL/);
  assert.match(migration, /m->>'namespace'/);
  assert.doesNotMatch(migration, /jsonb_object_length|897100|898107/);
  for (const table of ['listing_drafts', 'listing_media', 'media_uploads', 'video_upload_sessions', 'video_generations', 'measurement_outbox', 'audit_logs', 'media_upload_cleanups']) assert.ok(migration.includes(`'${table}'`));
  const builder = await readFile('packages/db/src/listing-source-command.ts', 'utf8');
  assert.doesNotMatch(builder, /publicationRows/);
});
