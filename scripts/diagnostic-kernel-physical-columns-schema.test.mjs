import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retainedSchemaProfile } from './staging-schema.mjs';

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
