import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';
test('optional public showroom fields have an exact additive restoration migration', () => {
 const name = '20261015160000_showroom_public_fields';
 const current = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');
 assert.match(current, /address\s+String\?/);
 const migration = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url));
 const fixture = readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url));
 assert.deepEqual(migration, fixture);
 assert.equal(retainedSchemaProfile.additions.find(entry => entry.name === name)?.checksum, createHash('sha256').update(migration).digest('hex'));
 const schema = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url));
 assert.ok(retainedSchemaProfile.schemaHashes.includes(createHash('sha256').update(schema).digest('hex')));
 for (const field of ['address', 'description', 'hours', 'services']) assert.match(migration.toString(), new RegExp(`ADD COLUMN "${field}" TEXT`));
 assert.doesNotMatch(migration.toString(), /DEFAULT|UPDATE|DELETE|DROP/);
});
