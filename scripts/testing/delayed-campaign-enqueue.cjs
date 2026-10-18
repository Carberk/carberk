// Test-only process boundary for the PG transaction-loss/enqueue race.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
process.env.TSX_TSCONFIG_PATH = `${root}/apps/api/tsconfig.json`;
createRequire(`${root}/package.json`)("tsx/cjs");
const apiRequire = createRequire(`${root}/apps/api/package.json`);
const { Queue } = apiRequire("bullmq");
const { PrismaService, withCampaignEmailDelivery } = apiRequire("@auto-tm/db");

const input = {
  requestId: process.env.CAMPAIGN_REQUEST_ID,
  email: process.env.CAMPAIGN_EMAIL,
};
const db = new PrismaService();
const redis = new URL(process.env.REDIS_URL);
const actualQueue = new Queue("email-code", { connection: { host: redis.hostname, port: Number(redis.port), maxRetriesPerRequest: 1 } });
let admitted = false;
const queue = {
  add: async (name, data, options) => {
    const backend = await db.$queryRawUnsafe("SELECT pg_backend_pid() AS pid");
    admitted = true;
    process.send?.({ backendPid: Number(backend[0].pid) });
    await new Promise((resolve) => process.once("message", message => message && message.continue ? resolve() : undefined));
    return actualQueue.add(name, data, options);
  },
};

(async () => {
  try {
    await withCampaignEmailDelivery(db, input.requestId, input.email, async () => {
      await queue.add("sign-in-code", { to: input.email, code: "123456", locale: "en", purpose: "sign-in" }, {
        jobId: input.requestId,
        delay: 3600000,
      });
    });
  } catch (error) {
    // A terminated transaction is expected in this regression. The queue call
    // still completed after the barrier and the parent asserts its disposition.
    if (!admitted) throw error;
  } finally {
    await actualQueue.close();
    await db.onModuleDestroy();
  }
})().then(() => process.exit(0)).catch(() => process.exit(1));
