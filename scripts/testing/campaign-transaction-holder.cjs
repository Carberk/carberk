// Test-only process boundary: hold only the campaign advisory transaction.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
const { Client } = createRequire(`${root}/packages/db/package.json`)("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: process.env.PGAPPNAME });
const namespace = process.env.CAMPAIGN_NAMESPACE;
let holding = false;
let unexpectedError = false;
let backendTerminated = false;
client.on("error", error => {
  if (holding && error.code === "57P01") backendTerminated = true;
  else unexpectedError = true;
});
(async () => {
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [namespace]);
    const rows = await client.query("SELECT pg_backend_pid() AS pid");
    holding = true;
    process.send?.({ backendPid: Number(rows.rows[0].pid) });
    await new Promise(resolve => process.once("message", message => message?.finish ? resolve() : undefined));
    if (!backendTerminated) await client.query("ROLLBACK");
  } catch (error) {
    if (!(holding && error.code === "57P01")) unexpectedError = true;
  } finally { await client.end().catch(() => { unexpectedError = true; }); }
})().then(() => process.exit(unexpectedError ? 1 : 0)).catch(() => process.exit(1));
