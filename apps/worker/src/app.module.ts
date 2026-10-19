import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { LoggerModule } from "nestjs-pino";
import { S3Client } from "@aws-sdk/client-s3";
import { AuthSchemas } from "@auto-tm/contracts";

import { PrismaModule } from "./common/prisma.module";
import { parseEnv, type Env } from "./env.schema";
import { CleanRetiredUploads } from "./jobs/CleanRetiredUploads";
import { PrismaRetiredUploadLedger } from "./jobs/PrismaRetiredUploadLedger";
import { S3RetiredObjectStore } from "./jobs/S3RetiredObjectStore";
import { RETIRED_OBJECT_STORE, RETIRED_UPLOAD_LEDGER } from "./jobs/retiredUploadCleanup";
import {
  RETIRED_UPLOAD_CLEANUP_QUEUE,
  RetiredUploadCleanupProcessor,
} from "./queues/retired-upload-cleanup.processor";
import { RetiredUploadCleanupScheduler } from "./queues/retired-upload-cleanup.scheduler";
import { PushModule } from "./push/push.module";
import { EmailModule } from "./email/email.module";
import { VideoTranscodeProcessor } from "./queues/video-transcode.processor";
import { NotificationFanoutProcessor } from "./queues/notification-fanout.processor";
import { EmailCodeProcessor } from "./queues/email-code.processor";
import { OrphanCleanupProcessor } from "./queues/orphan-cleanup.processor";
import { AccountPurgeProcessor } from "./queues/account-purge.processor";
import { AccountPurgeScheduler } from "./queues/account-purge.scheduler";
import { PurgeExpiredAccounts } from "./jobs/PurgeExpiredAccounts";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env["LOG_LEVEL"] ?? "info",
      },
    }),
    PrismaModule,
    PushModule,
    EmailModule,
    BullModule.forRoot({
      connection: {
        url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
      },
    }),
    BullModule.registerQueue(
      { name: "video-transcode" },
      { name: "notification-fanout" },
      { name: "orphan-cleanup" },
      { name: "account-purge" },
      { name: RETIRED_UPLOAD_CLEANUP_QUEUE },
      { name: AuthSchemas.EMAIL_CODE_QUEUE },
    ),
  ],
  providers: [
    CleanRetiredUploads,
    RetiredUploadCleanupProcessor,
    RetiredUploadCleanupScheduler,
    { provide: RETIRED_UPLOAD_LEDGER, useClass: PrismaRetiredUploadLedger },
    {
      // The existing media storage, reached with the worker's existing MinIO settings.
      provide: RETIRED_OBJECT_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new S3RetiredObjectStore(new S3Client({
          endpoint: config.get("MINIO_ENDPOINT", { infer: true }),
          region: config.get("MINIO_REGION", { infer: true }),
          credentials: {
            accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }),
            secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }),
          },
          forcePathStyle: true,
        })),
    },
    VideoTranscodeProcessor,
    NotificationFanoutProcessor,
    EmailCodeProcessor,
    OrphanCleanupProcessor,
    AccountPurgeProcessor,
    AccountPurgeScheduler,
    PurgeExpiredAccounts,
  ],
})
export class AppModule {}
