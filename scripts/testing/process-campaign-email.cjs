// Test-only process boundary: real BullMQ claim, production processor and staging mock sink.
// Secrets arrive on stdin and are never printed.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const workspaceRequire = createRequire(`${root}/package.json`);
process.env.TSX_TSCONFIG_PATH = `${root}/apps/worker/tsconfig.json`;
workspaceRequire('tsx/cjs');
const workerRequire = createRequire(`${root}/apps/worker/package.json`);
const { ConfigService } = workerRequire('@nestjs/config');
const { PrismaService } = workerRequire('@auto-tm/db');
const { Worker } = workerRequire('bullmq');
const { Redis } = workerRequire('ioredis');
const { AuthSchemas } = workerRequire('@auto-tm/contracts');
const { createEmailSender } = require(`${root}/apps/worker/src/email/email.module.ts`);
const { EmailCodeProcessor } = require(`${root}/apps/worker/src/queues/email-code.processor.ts`);
const { SendSignInCodeEmail } = require(`${root}/apps/worker/src/email/application/SendSignInCodeEmail.ts`);
const { RedisDailySendCap } = require(`${root}/apps/worker/src/email/infrastructure/RedisDailySendCap.ts`);
const { renderSignInCodeEmail } = require(`${root}/apps/worker/src/email/domain/renderSignInCodeEmail.ts`);
(async () => {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const db = new PrismaService();
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  let worker;
  let claimed;
  let token;
  let completed = false;
  try {
    const sender = await createEmailSender(new ConfigService({ EMAIL_DRIVER: 'mock', APP_ENV: 'staging' }), db);
    if (input.lateDelivery) {
      await sender.send(renderSignInCodeEmail(input.lateDelivery), { idempotencyKey: input.requestId });
      return;
    }
    const processor = new EmailCodeProcessor(new SendSignInCodeEmail(sender, new RedisDailySendCap(redis, 1000)));
    worker = new Worker(AuthSchemas.EMAIL_CODE_QUEUE, job => processor.process(job), { connection: redis, autorun: false });
    token = `test-claim-${input.requestId}`;
    const job = await worker.getNextJob(token, { block: false });
    claimed = job;
    if (!job || job.id !== input.requestId) throw new Error('Exact disposable queue claim unavailable');
    await processor.process(job);
    await job.moveToCompleted({}, token, false);
    completed = true;
  } finally {
    try { if (claimed && !completed) await claimed.moveToWait(token); }
    finally { await worker?.close(); await redis.quit(); }
    await db.onModuleDestroy();
  }
})().catch(() => { process.exitCode = 1; });
