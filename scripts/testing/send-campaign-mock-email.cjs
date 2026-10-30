// Test-only process boundary. Executes the real worker driver factory and persisted sink.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const workspaceRequire = createRequire(`${root}/package.json`);
process.env.TSX_TSCONFIG_PATH = `${root}/apps/worker/tsconfig.json`;
workspaceRequire('tsx/cjs');
const workerRequire = createRequire(`${root}/apps/worker/package.json`);
const { ConfigService } = workerRequire('@nestjs/config');
const { PrismaService } = workerRequire('@auto-tm/db');
const { createEmailSender } = require(`${root}/apps/worker/src/email/email.module.ts`);
(async () => {
  const db = new PrismaService();
  try {
    const input = JSON.parse(process.argv[2]);
    const sender = await createEmailSender(new ConfigService({ EMAIL_DRIVER: 'mock', APP_ENV: 'staging' }), db);
    const result = await sender.send({ to: input.email, subject: 'Synthetic sign-in code', text: '123456', html: '<p>123456</p>' }, { idempotencyKey: input.requestId });
    if (!result.ok) throw new Error('Mock send refused');
  } finally { await db.onModuleDestroy(); }
})().catch(() => { process.exitCode = 1; });
