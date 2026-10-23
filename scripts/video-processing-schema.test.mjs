import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';
const migration = '20261015170000_video_processing_fences';
test('video processing can fence late completions and retain independent cleanup work', async () => {
  const schema = await readFile(new URL('../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');
  for (const field of ['pendingVideoGenerationId String?', 'storageUploadId String?', 'completionFence String?', 'targetRevision Int?', 'model VideoProcessWork', 'model VideoCleanupWork', 'leaseExpiresAt DateTime?']) assert.ok(schema.includes(field), `Missing durable video boundary: ${field}`);
  const path = new URL(`../packages/db/prisma/migrations/${migration}/migration.sql`, import.meta.url);
  const exists = await access(path).then(() => true, () => false);
  assert.ok(exists, 'Reviewed additive video fence migration is retained');
  const sql = await readFile(path, 'utf8');
  assert.equal(sql, await readFile(new URL(`./testing/retained-schema/${migration}.sql`, import.meta.url), 'utf8'));
  assert.equal(retainedSchemaProfile.additions.find(x => x.name === migration)?.checksum, createHash('sha256').update(sql).digest('hex'));
  const hash = createHash('sha256').update(schema).digest('hex');
  assert.ok(retainedSchemaProfile.schemaMigrations[hash]?.includes(migration), 'Exact schema hash has the complete reviewed migration inventory');
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE "|DROP TABLE|DROP COLUMN/i);
});
