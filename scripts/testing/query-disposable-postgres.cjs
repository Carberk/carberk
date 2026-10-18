// Test-only psql boundary substitute. Credentials arrive only in the child environment.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const localRequire = createRequire(process.env.STAGING_TEST_DB_PACKAGE);
const { Client, types } = localRequire('pg');
(async () => {
  const client = new Client({ connectionString: process.env.STAGING_CONTROL_TEST_DATABASE_URL,
    types: { getTypeParser(oid, format) {
      if ((format === undefined || format === 'text') && (oid === 114 || oid === 3802)) return value => value;
      return types.getTypeParser(oid, format);
    } },
  });
  await client.connect();
  try {
    const result = await client.query(readFileSync(0, 'utf8'));
    const results = Array.isArray(result) ? result : [result];
    for (const item of results) for (const row of item.rows) console.log(Object.values(row).join('|'));
  } finally { await client.end(); }
})().catch(error => {
  console.error('Disposable database query refused');
  if (process.env.STAGING_TEST_SQL_DIAGNOSTICS === '1' &&
      typeof error?.code === 'string' && error.code.length === 5 && /^[A-Z0-9]{5}$/.test(error.code)) {
    let diagnostic = `Disposable database SQL diagnostic: SQLSTATE=${error.code}`;
    for (const field of ['position', 'internalPosition']) {
      const value = error[field];
      if (typeof value === 'string' && value.length <= 10 && !/[^0-9]/.test(value) && Number(value) > 0) {
        diagnostic += ` ${field}=${Number(value)}`;
      }
    }
    console.error(diagnostic);
  }
  process.exitCode = 1;
});
