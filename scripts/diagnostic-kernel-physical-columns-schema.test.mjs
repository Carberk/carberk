import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan } from './staging-schema.mjs';
import { inventoryForSchema } from './testing/schema-profile-fixture.mjs';
import { retainedSchemaProfile as archivedProfile } from '../docs/evidence/issue-897/kernel-physical-columns-20261025/original/scripts/staging-schema.mjs';

import { retainedSchemaProfile } from '../docs/evidence/issue-897/r5-report-source-effects-20261025/original/scripts/staging-schema.mjs';

const revision = [
  {
    "migration": "packages/db/prisma/migrations/20261023130000_diagnostic_source_kernel/migration.sql",
    "name": "20261023130000_diagnostic_source_kernel",
    "oldSha256": "cc10000343f6257cb4b0d9cd4240ec57f46642f5a9b0735cd440680602d642b3",
    "proposedSha256": "b9b2d465c04cc34693e5774d12910a33bb29b39d8452f5a2862dc24b667f4fbf",
    "registryLine": 81
  },
  {
    "migration": "packages/db/prisma/migrations/20261024030000_diagnostic_purge_effects/migration.sql",
    "name": "20261024030000_diagnostic_purge_effects",
    "oldSha256": "ccb26627dcee74bf20c01c5e89dba2d6ade4d6644136fd55554c8246fa8f46d0",
    "proposedSha256": "23d894c79c5927d7d976c79e4cbe958af83725ccf172208b7f4d6132e0d3d4ba",
    "registryLine": 81
  }
];
const archive = '../docs/evidence/issue-897/kernel-physical-columns-20261025';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const registry = sql => JSON.parse(sql.match(/SELECT '(\[[\s\S]*?\])'::jsonb/)[1]);
const inspection = {
  table: 'inspection_interests', pk: ['id'],
  fields: ['id','listing_id','requester_user_id','side','willingness_to_pay_tmt','created_at','updated_at'],
  unique: [['listing_id','requester_user_id']],
  refs: [
    { table: 'listings', columns: ['listing_id'], target: ['id'] },
    { table: 'users', columns: ['requester_user_id'], target: ['id'] },
  ], rank: 13, namespace: 898317,
};

test('only the two unmerged InspectionInterest registry rows and exact active checksums change', () => {
  const originalProfile = JSON.parse(read(`${archive}/original-profile-inventories.json`));
  assert.deepEqual(retainedSchemaProfile.schemaHashes, originalProfile.schemaHashes);
  assert.deepEqual(retainedSchemaProfile.schemaMigrations, originalProfile.schemaMigrations);
  const originals = new Map(originalProfile.additions.map(row => [row.name, row.checksum]));
  assert.equal(retainedSchemaProfile.additions.length, originalProfile.additions.length);
  for (const row of retainedSchemaProfile.additions) {
    const revised = revision.find(item => item.name === row.name);
    assert.equal(row.checksum, revised?.proposedSha256 ?? originals.get(row.name), row.name);
  }
  for (const item of revision) {
    const file = `packages/db/prisma/migrations/${item.name}/migration.sql`;
    const before = read(`${archive}/original/${file}`);
    const after = read(`../${file}`);
    assert.equal(hash(before), item.oldSha256);
    assert.equal(hash(after), item.proposedSha256);
    assert.equal(read(`./testing/retained-schema/${item.name}.sql`), after);
    const oldRegistry = registry(before), current = registry(after);
    assert.equal(current.length, 77);
    assert.deepEqual(current.filter(row => row.table !== 'inspection_interests'), oldRegistry.filter(row => row.table !== 'inspection_interests'));
    const expected = item.name.endsWith('purge_effects') ? { ...inspection, suborder: 898317 } : inspection;
    assert.deepEqual(current.find(row => row.table === 'inspection_interests'), expected);
    const oldLine = before.split('\n').find(line => line.includes('"table":"inspection_interests","pk"'));
    const newLine = after.split('\n').find(line => line.includes('"table":"inspection_interests","pk"'));
    assert.equal(after.replace(newLine, oldLine), before, 'No other SQL bytes changed');
  }
});

// Source-only audit of scalar columns. Relation properties are deliberately excluded.
const prisma = read('../packages/db/prisma/schema.prisma');
const modelNames = new Set([...prisma.matchAll(/^model (\w+) \{/gm)].map(match => match[1]));
const models = new Map([...prisma.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
  const fields = [...body.matchAll(/^[ \t]*(\w+)[ \t]+(\w+)[?\[\]]*[ \t]*([^\n]*)/gm)]
    .filter(([, , type]) => !modelNames.has(type));
  const mapped = new Map(fields.map(([, field, , attrs]) => [field, attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? field]));
  const tuple = text => text.split(',').map(field => mapped.get(field.trim()));
  const composite = body.match(/@@id\(\[([^\]]+)\]/);
  const pk = composite ? tuple(composite[1]) : fields.filter(([, , , attrs]) => /@id\b/.test(attrs)).map(([, field]) => mapped.get(field));
  const unique = [...fields.filter(([, , , attrs]) => /@unique\b/.test(attrs)).map(([, field]) => [mapped.get(field)]),
    ...[...body.matchAll(/@@unique\(\[([^\]]+)\]/g)].map(match => tuple(match[1]))];
  return [body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name, { columns: new Set(mapped.values()), pk, unique }];
}));

function assertPhysicalColumns(sql) {
  const rows = registry(sql);
  assert.equal(rows.length, 77);
  assert.equal(new Set(rows.map(row => row.table)).size, 77);
  for (const row of rows) {
    const model = models.get(row.table);
    assert.ok(model, row.table);
    assert.deepEqual(row.pk, model.pk, `${row.table} mapped primary key`);
    for (const [position, columns] of [['pk', row.pk], ['fields', row.fields],
      ...row.unique.map((columns, i) => [`unique[${i}]`, columns]),
      ...row.refs.map((ref, i) => [`refs[${i}].columns`, ref.columns])]) {
      for (const column of columns) assert.ok(model.columns.has(column), `${row.table}.${position}: ${column} is not a physical column`);
    }
    for (const columns of row.unique) assert.ok(model.unique.some(tuple => JSON.stringify(tuple) === JSON.stringify(columns)), `${row.table} mapped unique ${columns}`);
    for (const ref of row.refs) {
      const target = models.get(ref.table);
      assert.ok(target, `${row.table} -> ${ref.table}`);
      assert.equal(ref.columns.length, ref.target.length);
      for (const column of ref.target) assert.ok(target.columns.has(column), `${row.table} -> ${ref.table}.${column} is not a physical column`);
    }
  }
}

for (const item of revision) {
  test(`${item.name}: all registered keys, fields, unique tuples and both reference ends use physical columns`, () => {
    assertPhysicalColumns(read(`../${item.migration}`));
  });
}

test('original source, assertions, mirrors and all 52 exact inventories remain independently verifiable', () => {
  assert.equal(hash(read(`${archive}/original-profile-inventories.json`)), '6e4c5a8bfce75fc3c8c77505316df23c5a6eae9a42d42fd8fe640c01a590a6b7');
  const snapshot = JSON.parse(read(`${archive}/original-profile-inventories.json`));
  assert.equal(snapshot.sourceCommit, 'f375cb4ae6c363e5a724d92ecc7c9f4af5cc5520');
  assert.equal(hash(read('../docs/evidence/issue-897/r5-report-source-effects-20261025/original/packages/db/prisma/schema.prisma')), '7ce808a1af40f4f85c340526ca8ea3bced18e99155282d41b610aca9e85cfc72');
  const originalProfileSource = read(`${archive}/original/scripts/staging-schema.mjs`);
  assert.equal(hash(originalProfileSource), '1072783155c77779a755d59b9cb32385554b06c7f2cc1b756d742038978501ce');
  let restoredProfileSource = read('../docs/evidence/issue-897/r5-report-source-effects-20261025/original/scripts/staging-schema.mjs');
  for (const item of revision) restoredProfileSource = restoredProfileSource.replace(item.proposedSha256, item.oldSha256);
  assert.equal(restoredProfileSource, originalProfileSource, 'Only the two checksum literals change in the complete active module');
  assert.deepEqual(snapshot.additions, archivedProfile.additions);
  assert.deepEqual(snapshot.schemaHashes, archivedProfile.schemaHashes);
  assert.deepEqual(snapshot.schemaMigrations, archivedProfile.schemaMigrations);
  assert.equal(Object.keys(snapshot.exactHistoricalInventories).length, 52);
  assert.deepEqual(new Set(Object.keys(snapshot.exactHistoricalInventories)), new Set(archivedProfile.schemaHashes));
  for (const schema of archivedProfile.schemaHashes) {
    const expected = archivedProfile.schemaMigrations[schema].map(name => archivedProfile.additions.find(row => row.name === name));
    assert.deepEqual(snapshot.exactHistoricalInventories[schema], expected, schema);
    for (const row of expected) assert.equal(hash(read(`./testing/retained-schema/${row.name}.sql`)),
      revision.find(item => item.name === row.name)?.proposedSha256 ?? row.checksum, row.name);
  }
  for (const item of revision) {
    assert.equal(hash(read(`${archive}/original/scripts/testing/retained-schema/${item.name}.sql`)), item.oldSha256);
    assert.throws(() => assertPhysicalColumns(read(`${archive}/original/${item.migration}`)), /inspection_interests.fields: listingId is not a physical column/);
  }
  const assertions = {
    'diagnostic-intake-campaign-composition-schema.test.mjs': 'a8becb064c3ee754062bcf62d8d2275e7db616dcfd6ab8b524991deafb5563c0',
    'diagnostic-purge-effects-schema.test.mjs': '8b15b52e5ddcb5ed939cff7bb602e3fa5e73795533080a2212c0f3a26f72f86e',
    'diagnostic-source-guard-repair-schema.test.mjs': '45d1025b4216d43b224bbe67beb11279678931f0da17588a6be9641ae3691405',
    'diagnostic-source-kernel-schema.test.mjs': '349c861e3c8ca2c363b690552d3ed5323f51c5b1f7e9c405ec9dbff907e25076',
  };
  for (const [file, checksum] of Object.entries(assertions)) assert.equal(hash(read(`${archive}/original/scripts/${file}`)), checksum, file);
});

test('active planning accepts revised exact inventories and refuses old or mixed checksums in every affected snapshot', () => {
  const snapshot = JSON.parse(read(`${archive}/original-profile-inventories.json`));
  const emptySchema = '3cf9a92dc50367112d7e41cfadaf9e3199e0000ef75a7181861c09ebe9d7e51d';
  for (const schema of retainedSchemaProfile.schemaHashes) {
    const current = inventoryForSchema(schema, []);
    const original = snapshot.exactHistoricalInventories[schema];
    const plan = { baseline: [], candidate: current, main: [], candidateSchema: schema, mainSchema: emptySchema };
    const verdict = evaluateSchemaPlan(plan);
    assert.deepEqual(verdict.migrations, [...current].sort((a, b) => a.name.localeCompare(b.name)));
    for (const item of revision.filter(item => original.some(row => row.name === item.name))) {
      const mixed = current.map(row => row.name === item.name ? { ...row, checksum: item.oldSha256 } : row);
      assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: mixed }), /checksum drift refused/, `${schema} ${item.name} candidate`);
      assert.throws(() => evaluateSchemaPlan({ ...plan, main: mixed, mainSchema: schema }), /checksum drift refused/, `${schema} ${item.name} main`);
      assert.throws(() => evaluateSchemaPlan({ ...plan, retained: mixed }), /checksum drift refused/, `${schema} ${item.name} retained`);
    }
    if (original.some(row => revision.some(item => item.name === row.name))) {
      assert.throws(() => evaluateSchemaPlan({ ...plan, candidate: original }), /checksum drift refused/, schema);
    }
  }
});
