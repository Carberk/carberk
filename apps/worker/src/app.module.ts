import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { LoggerModule } from "nestjs-pino";
import { S3Client } from "@aws-sdk/client-s3";
import { AuthSchemas } from "@auto-tm/contracts";
import { PrismaService } from "@auto-tm/db";

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
import { ListingVideoProcessor } from "./video/ListingVideoProcessor";
import { S3VideoProcessingStorage, VIDEO_PROCESSING_STORAGE } from "./video/VideoProcessingStorage";
import { VideoProcessingScheduler } from "./video/VideoProcessingScheduler";
import { NotificationFanoutProcessor } from "./queues/notification-fanout.processor";
import { EmailCodeProcessor } from "./queues/email-code.processor";
import { OrphanCleanupProcessor } from "./queues/orphan-cleanup.processor";
import { AccountPurgeProcessor } from "./queues/account-purge.processor";
import { AccountPurgeScheduler } from "./queues/account-purge.scheduler";
import { PurgeExpiredAccounts } from "./jobs/PurgeExpiredAccounts";
import {
  createWorkerHealthDependencies,
  WORKER_HEALTH_DEPENDENCIES,
  WorkerHealthServer,
} from "./health/worker-health-server";

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
    ListingVideoProcessor,
    VideoProcessingScheduler,
    {
      provide: VIDEO_PROCESSING_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const endpoint = config.get("LISTING_VIDEO_BUCKET_ENDPOINT", { infer: true }) || config.get("MINIO_ENDPOINT", { infer: true });
        const bucket = config.get("LISTING_VIDEO_BUCKET_NAME", { infer: true }) || "listing-videos";
        const accessKeyId = config.get("LISTING_VIDEO_BUCKET_ACCESS_KEY_ID", { infer: true }) || config.get("MINIO_ACCESS_KEY", { infer: true });
        const secretAccessKey = config.get("LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY", { infer: true }) || config.get("MINIO_SECRET_KEY", { infer: true });
        return new S3VideoProcessingStorage(new S3Client({ endpoint, region: config.get("LISTING_VIDEO_BUCKET_REGION", { infer: true }) || config.get("MINIO_REGION", { infer: true }), credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true }), bucket);
      },
    },
    NotificationFanoutProcessor,
    EmailCodeProcessor,
    OrphanCleanupProcessor,
    AccountPurgeProcessor,
    AccountPurgeScheduler,
    PurgeExpiredAccounts,
    WorkerHealthServer,
    {
      provide: WORKER_HEALTH_DEPENDENCIES,
      inject: [ConfigService, PrismaService],
      useFactory: createWorkerHealthDependencies,
    },
  ],
})
export class AppModule {}
