// Test-only process boundary: hold only the campaign advisory transaction.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
process.env.TSX_TSCONFIG_PATH = `${root}/apps/api/tsconfig.json`;
createRequire(`${root}/package.json`)("tsx/cjs");
const { PrismaService } = createRequire(`${root}/apps/api/package.json`)("@auto-tm/db");
const db = new PrismaService();
const namespace = process.env.CAMPAIGN_NAMESPACE;
(async () => {
  try {
    await db.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", namespace);
      const rows = await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid");
      process.send?.({ backendPid: Number(rows[0].pid) });
      await new Promise(resolve => process.once("message", message => message?.finish ? resolve() : undefined));
    });
  } catch {
    // Backend termination is the intended outcome; parent owns the assertion.
  } finally { await db.onModuleDestroy(); }
})().then(() => process.exit(0)).catch(() => process.exit(1));
