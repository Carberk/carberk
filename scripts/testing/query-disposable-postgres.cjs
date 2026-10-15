// Test-only psql boundary substitute. Credentials arrive only in the child environment.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const localRequire = createRequire(process.env.STAGING_TEST_DB_PACKAGE);
const { Client } = localRequire('pg');
(async () => {
  const client = new Client({ connectionString: process.env.STAGING_CONTROL_TEST_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(readFileSync(0, 'utf8'));
    const results = Array.isArray(result) ? result : [result];
    for (const item of results) for (const row of item.rows) console.log(Object.values(row).join('|'));
  } finally { await client.end(); }
})().catch(() => { console.error('Disposable database query refused'); process.exitCode = 1; });
