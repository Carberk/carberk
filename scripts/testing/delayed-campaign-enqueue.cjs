// Test-only Redis producer boundary. It has no PostgreSQL client: admission is
// held at IPC, then the real BullMQ add runs after reset.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
const apiRequire = createRequire(`${root}/apps/api/package.json`);
const { Queue } = apiRequire("bullmq");
const input = { requestId: process.env.CAMPAIGN_REQUEST_ID, email: process.env.CAMPAIGN_EMAIL };
const redis = new URL(process.env.REDIS_URL);
const queue = new Queue("email-code", { connection: { host: redis.hostname, port: Number(redis.port), maxRetriesPerRequest: 1 } });
(async () => {
  try {
    process.send?.({ admitted: true });
    await new Promise(resolve => process.once("message", message => message?.continue ? resolve() : undefined));
    await queue.add("sign-in-code", { to: input.email, code: "123456", locale: "en", purpose: "sign-in" }, {
      jobId: input.requestId, delay: 3600000,
      deduplication: { id: `campaign-${process.env.CAMPAIGN_NAMESPACE}-${input.requestId}` },
    });
  } finally { await queue.close(); }
})().then(() => process.exit(0)).catch(() => process.exit(1));
