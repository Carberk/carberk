import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile, evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';

const name = '20261023130000_diagnostic_source_kernel';
const sql = readFileSync(new URL(`../packages/db/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const prisma = readFileSync(new URL('../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');
const keys = readFileSync(new URL('../packages/db/src/diagnostic-source-tables.ts', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const registry = JSON.parse(sql.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);

test('kernel has a byte-identical retained mirror and an additive exact schema inventory', () => {
  assert.equal(sql, readFileSync(new URL(`./testing/retained-schema/${name}.sql`, import.meta.url), 'utf8'));
  // This test owns the held kernel snapshot. The guard-repair test owns the current inventory.
  const schema = 'a93532709e5b1012f5a1007d5b633c98e982a54ea73fb33b71ddf0fad48c2f7c', prior = 'c7bcd721033f6abdd74f38abe4c94f84fc95dfba85d1e06fd5d692ba2f2964fc';
  const candidate = inventoryForSchema(schema, []), main = inventoryForSchema(prior, []);
  assert.deepEqual(candidate.filter(row => row.name !== name), main);
  assert.equal(candidate.find(row => row.name === name).checksum, hash(sql));
  assert.equal(evaluateSchemaPlan({ baseline: [], candidate, main, candidateSchema: schema, mainSchema: prior }).disposition, 'retained-additive');
  assert.equal(retainedSchemaProfile.additions.filter(row => row.name === name).length, 1);
});

test('every registered physical primary key agrees with Prisma and the exported key union', () => {
  const seen = new Set(), namespaces = new Set();
  for (const entry of registry) {
    assert.ok(!seen.has(entry.table), entry.table); seen.add(entry.table);
    assert.ok(!namespaces.has(entry.namespace), entry.table); namespaces.add(entry.namespace);
    assert.ok(entry.namespace >= 897000 + entry.rank * 100 && entry.namespace < 897000 + (entry.rank + 1) * 100);
    const body = [...prisma.matchAll(/model \w+ \{([\s\S]*?)\n\}/g)].map(match => match[1]).find(body => body.includes(`@@map("${entry.table}")`));
    assert.ok(body, entry.table);
    const composite = body.match(/@@id\(\[([^\]]+)\]/);
    const primary = composite ? composite[1].split(',').map(key => key.trim()) : [body.match(/^\s*(\w+)\s+[^\n]+@id\b/m)[1]];
    assert.deepEqual(entry.pk, primary, entry.table);
    const tsKey = keys.match(new RegExp(`"${entry.table}": \\{ ([^}]+) \\}`))[1];
    assert.deepEqual([...tsKey.matchAll(/"([^"]+)": string/g)].map(match => match[1]), primary);
    for (const field of entry.fields) assert.match(body, new RegExp(`^\\s*${field}\\s`, 'm'));
    for (const ref of entry.refs) assert.ok(registry.some(other => other.table === ref.table), `${entry.table} -> ${ref.table}`);
  }
  assert.deepEqual(registry.find(row => row.table === 'staff_grants').pk, ['userId', 'capability']);
  assert.deepEqual(registry.find(row => row.table === 'video_process_work').pk, ['generationId']);
  assert.deepEqual(registry.find(row => row.table === 'measurement_state').pk, ['key']);
  assert.deepEqual(registry.find(row => row.table === 'diagnostic_ownership_components').pk, ['identityRecordId']);
});
