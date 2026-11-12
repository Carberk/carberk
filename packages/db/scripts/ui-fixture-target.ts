/** Guard the destructive CLI before loading clients; definition imports do no I/O. */
import { join } from "node:path";

import { config } from "dotenv";

import { assertFixtureTarget } from "./native-pr-seed-guard.cjs";

const isReplacementEntrypoint = require.main?.filename === join(__dirname, "ui-fixture.ts");
if (isReplacementEntrypoint) config({ quiet: true });
const target = isReplacementEntrypoint ? assertFixtureTarget(process.env, process.argv) : undefined;

export const DATABASE_URL = target?.databaseUrl;
export const MINIO_ENDPOINT = target?.minioEndpoint;
