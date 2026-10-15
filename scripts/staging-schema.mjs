/** Closed reviewed profile. New SQL/schema hashes require code review and compatibility evidence. */
export const retainedSchemaProfile = {
  baseline: '7af49d4c1474b2c3d841b14736c4ef59ce155a4e',
  schemaHashes: [
    'afc0aceaa8ddbb9cd42bbbb8a9e84d270965a7aefe47917e464ff934ab0f4a05',
    'fcccfb5425820267e806a9ff96688b67c36c65a1bf2ae1192c10ec404b91589f',
    '7f12fa5b73b7d975d821cbf6eb2dadb16ac9ca674826afa0875e0c5f24751abc',
    '3cf9a92dc50367112d7e41cfadaf9e3199e0000ef75a7181861c09ebe9d7e51d',
    '6156fef81231e244f52c85b3cabaf2c18597a6d9c7699782144b2a85e324a42b',
    'c02cefa47ade5650ea02f79dd07ba7c42fbb4524e938a6fd08bbbfca161a7735',
  ],
  schemaMigrations: {
    'afc0aceaa8ddbb9cd42bbbb8a9e84d270965a7aefe47917e464ff934ab0f4a05': ['20261015003500_listing_view_counts', '20261015010000_staff_capabilities', '20261015020000_business_membership', '20261015030000_business_inventory', '20261015040000_first_party_measurement'],
    'fcccfb5425820267e806a9ff96688b67c36c65a1bf2ae1192c10ec404b91589f': ['20261015003500_listing_view_counts', '20261015010000_staff_capabilities', '20261015020000_business_membership'],
    '7f12fa5b73b7d975d821cbf6eb2dadb16ac9ca674826afa0875e0c5f24751abc': ['20261015003500_listing_view_counts', '20261015010000_staff_capabilities', '20261015020000_business_membership', '20261015030000_business_inventory'],
    '3cf9a92dc50367112d7e41cfadaf9e3199e0000ef75a7181861c09ebe9d7e51d': [],
    '6156fef81231e244f52c85b3cabaf2c18597a6d9c7699782144b2a85e324a42b': ['20261015003500_listing_view_counts'],
    'c02cefa47ade5650ea02f79dd07ba7c42fbb4524e938a6fd08bbbfca161a7735': ['20261015003500_listing_view_counts', '20261015010000_staff_capabilities'],
  },
  additions: [
    { name: '20261015040000_first_party_measurement', checksum: '5da46ac7211e658eb1b1e96374c8be796ffad03c5ecb789a7692c4fc0dca384c' },
    { name: '20261015030000_business_inventory', checksum: '49143ea7a21fe5c6031a966794aedba44d69e3a3f9d6b6195dfbe57915ee93e8' },
    { name: '20261015020000_business_membership', checksum: '7a60b7b21b212c9bf38a14522eb937eb9762044039d05e6e16b7e76d1093c00a' },
    { name: '20261015003500_listing_view_counts', checksum: 'bdb25bde750cd12de85ca3a4bf4201ac927681539f1b1b70105a633f4dc26d5d' },
    { name: '20261015010000_staff_capabilities', checksum: '88f7b84d80a31ee2918ea4a8e2ce9c578f8de766ca2d1317fe1f2713d6fd0c43' },
  ],
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function evaluateSchemaPlan({ baseline, candidate, main, candidateSchema, mainSchema, retained = [], profile = retainedSchemaProfile }) {
  if (same(candidate, main) && candidateSchema === mainSchema && !retained.length) return { disposition: 'unchanged', migrations: candidate };
  if (![candidateSchema, mainSchema].every(hash => profile.schemaHashes.includes(hash))) throw new Error('Unreviewed schema snapshot refused');
  for (const [schema, inventory] of [[candidateSchema, candidate], [mainSchema, main]]) {
    const expected = profile.schemaMigrations[schema];
    if (!expected || expected.some(name => !inventory.some(entry => entry.name === name)) ||
        inventory.some(entry => !baseline.some(x => x.name === entry.name) && !expected.includes(entry.name))) throw new Error('Schema snapshot and migration inventory mismatch');
  }
  const approved = new Map([...baseline, ...profile.additions].map(entry => [entry.name, entry.checksum]));
  for (const inventory of [candidate, main, retained]) {
    if (!Array.isArray(inventory) || new Set(inventory.map(x => x.name)).size !== inventory.length ||
        inventory.some(entry => approved.get(entry.name) !== entry.checksum)) throw new Error('Unreviewed migration or checksum drift refused');
  }
  for (const inventory of [candidate, main]) {
    if (baseline.some(entry => !inventory.some(x => same(x, entry)))) throw new Error('Historical migration removal refused');
  }
  const merged = new Map([...candidate, ...main, ...retained].map(entry => [entry.name, entry]));
  const migrations = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { disposition: migrations.some(entry => !baseline.some(x => same(x, entry))) ? 'retained-additive' : 'unchanged', migrations };
}
