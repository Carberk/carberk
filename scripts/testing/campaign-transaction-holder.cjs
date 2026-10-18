// Test-only process boundary: hold only the campaign advisory transaction.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
const { Client } = createRequire(`${root}/packages/db/package.json`)("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: process.env.PGAPPNAME });
const namespace = process.env.CAMPAIGN_NAMESPACE;
(async () => {
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [namespace]);
    const rows = await client.query("SELECT pg_backend_pid() AS pid");
    process.send?.({ backendPid: Number(rows.rows[0].pid) });
    await new Promise(resolve => process.once("message", message => message?.finish ? resolve() : undefined));
    await client.query("ROLLBACK");
  } catch {
    // Backend termination is the intended outcome; parent owns the assertion.
  } finally { await client.end().catch(() => undefined); }
})().then(() => process.exit(0)).catch(() => process.exit(1));
