// Test-only process boundary. Uses the API's real enqueue adapter and BullMQ queue.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
process.env.TSX_TSCONFIG_PATH = `${root}/apps/api/tsconfig.json`;
createRequire(`${root}/package.json`)('tsx/cjs');
const apiRequire = createRequire(`${root}/apps/api/package.json`);
const { Queue } = apiRequire('bullmq');
const { PrismaService } = apiRequire('@auto-tm/db');
const { BullMqEmailCodeSenderAdapter } = require(`${root}/apps/api/src/modules/identity/infrastructure/BullMqEmailCodeSenderAdapter.ts`);
(async () => {
  const db = new PrismaService();
  const redis = new URL(process.env.REDIS_URL);
  const queue = new Queue('email-code', { connection: { host: redis.hostname, port: Number(redis.port), maxRetriesPerRequest: 1 } });
  try {
    const input = JSON.parse(process.argv[2]);
    const adapter = new BullMqEmailCodeSenderAdapter(queue, db);
    await adapter.enqueue({ requestId: input.requestId, email: input.email, code: '123456', locale: 'en', purpose: 'sign-in' });
  } finally { await queue.close(); await db.onModuleDestroy(); }
})().catch(() => { process.exitCode = 1; });
