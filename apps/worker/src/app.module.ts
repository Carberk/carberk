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
import { MeasurementRetentionModule } from "./measurement-retention.module";
import { DiagnosticArtifactsModule } from "./diagnostic-artifacts.module";
import { ServiceLifecycleModule } from "./service-lifecycle.module";
import { MeasurementOutboxModule } from "./jobs/measurement-outbox.module";
import { ServicePushModule } from "./service-push.module";
import { VideoModule } from "./video.module";
import { NotificationFanoutProcessor } from "./queues/notification-fanout.processor";
import { EmailCodeProcessor } from "./queues/email-code.processor";
import { OrphanCleanupProcessor } from "./queues/orphan-cleanup.processor";
import { AccountPurgeProcessor } from "./queues/account-purge.processor";
import { AccountPurgeScheduler } from "./queues/account-purge.scheduler";
import { PurgeExpiredAccounts } from "./jobs/PurgeExpiredAccounts";
import { ExpireListingViewFingerprints } from "./jobs/ExpireListingViewFingerprints";
import { PrismaListingViewRetentionLedger } from "./jobs/PrismaListingViewRetentionLedger";
import { ListingViewRetentionProcessor } from "./queues/listing-view-retention.processor";
import { LISTING_VIEW_RETENTION_QUEUE, ListingViewRetentionScheduler } from "./queues/listing-view-retention.scheduler";

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
      { name: "notification-fanout" },
      { name: "orphan-cleanup" },
      { name: "account-purge" },
      { name: RETIRED_UPLOAD_CLEANUP_QUEUE },
      { name: LISTING_VIEW_RETENTION_QUEUE },
      { name: AuthSchemas.EMAIL_CODE_QUEUE },
    ),
    MeasurementRetentionModule,
    ServiceLifecycleModule,
    MeasurementOutboxModule,
    ServicePushModule,
    DiagnosticArtifactsModule,
    VideoModule,
  ],
  providers: [
    PrismaListingViewRetentionLedger,
    { provide: ExpireListingViewFingerprints, inject: [PrismaListingViewRetentionLedger],
      useFactory: (ledger: PrismaListingViewRetentionLedger) => new ExpireListingViewFingerprints(ledger) },
    ListingViewRetentionProcessor,
    ListingViewRetentionScheduler,
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
    NotificationFanoutProcessor,
    EmailCodeProcessor,
    OrphanCleanupProcessor,
    AccountPurgeProcessor,
    AccountPurgeScheduler,
    PurgeExpiredAccounts,
  ],
})
export class AppModule {}
