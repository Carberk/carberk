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
let connectionEnded = false;
const phase = value => process.send?.({ holderPhase: value });
client.on("end", () => { connectionEnded = true; phase("connection-ended"); });
client.on("error", error => {
  if (holding && error.code === "57P01") {
    backendTerminated = true; phase("backend-57P01");
  } else if (backendTerminated && error.name === "Error" && error.code === undefined && error.message === "Connection terminated unexpectedly") {
    phase("socket-end-after-57P01");
  } else { unexpectedError = true; phase("unexpected-client-error"); }
});
(async () => {
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [namespace]);
    const rows = await client.query("SELECT pg_backend_pid() AS pid");
    holding = true;
    phase("advisory-held");
    process.send?.({ backendPid: Number(rows.rows[0].pid) });
    await new Promise(resolve => process.once("message", message => message?.finish ? resolve() : undefined));
    if (!backendTerminated) { unexpectedError = true; phase("missing-57P01"); }
    if (!backendTerminated) await client.query("ROLLBACK");
  } catch (error) {
    if (!(holding && error.code === "57P01")) { unexpectedError = true; phase("unexpected-operation-error"); }
    else { backendTerminated = true; phase("backend-57P01"); }
  } finally { await client.end().catch(() => { unexpectedError = true; phase("unexpected-end-error"); }); }
  if (!connectionEnded) unexpectedError = true;
  // Forced exit can discard queued IPC. Drain the terminal send before exiting;
  // a failed send rejects and must take the nonzero exit path below.
  await new Promise((resolve, reject) => {
    process.send({ holderPhase: !unexpectedError && backendTerminated ? "terminated-cleanly" : "holder-failed" },
      error => error ? reject(error) : resolve());
  });
})().then(() => process.exit(unexpectedError ? 1 : 0)).catch(() => process.exit(1));
