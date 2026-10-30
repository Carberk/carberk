import assert from 'node:assert/strict';
import { retainedSchemaProfile } from '../staging-schema.mjs';

/** Historical schemas carry their exact migration inventory. Later approved
 * additions must never leak into an older snapshot's test fixture. */
export function inventoryForSchema(hash, baseline) {
 const names = retainedSchemaProfile.schemaMigrations[hash];
 assert.ok(names, `Missing schema inventory for ${hash}`);
 return [...baseline, ...names.map(name => {
  const entry = retainedSchemaProfile.additions.find(item => item.name === name);
  assert.ok(entry, `Missing reviewed migration ${name}`);
  return entry;
 })];
}
