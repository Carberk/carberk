import { inject } from "vitest";

import { withDatabase, workerDatabaseName } from "./databases";

const databases = inject("workerTestDatabases");
if (databases) {
 const worker = Number(process.env["VITEST_POOL_ID"]);
 if (!Number.isInteger(worker) || worker < 1 || worker > databases.workers) throw new Error("Worker has no isolated PostgreSQL fixture database");
 process.env["DATABASE_URL"] = withDatabase(databases.baseDatabaseUrl, workerDatabaseName(databases.prefix, worker));
}
