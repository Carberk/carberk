import { randomUUID } from "node:crypto";

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService, PrismaMeasurementCommit } from "@auto-tm/db";

import type { Env } from "./env.schema";
import { PrismaModule } from "./common/prisma.module";
import { PrismaVideoProcessingLedger } from "./jobs/video/PrismaVideoProcessingLedger";
import { PrismaVideoCleanupLedger } from "./jobs/video/PrismaVideoCleanupLedger";
import { S3VideoProcessingObjects } from "./jobs/video/S3VideoProcessingObjects";
import { S3VideoCleanupObjects } from "./jobs/video/S3VideoCleanupObjects";
import { FFmpegVideoProcessor } from "./jobs/video/FFmpegVideoProcessor";
import { ProcessPreparedVideo } from "./jobs/video/ProcessPreparedVideo";
import { CleanVideo } from "./jobs/video/CleanVideo";
import { VideoTranscodeProcessor, VideoWorkScheduler } from "./queues/video-transcode.processor";
const VIDEO_S3 = Symbol("VideoS3Client");
@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: "video-transcode" })],
  providers: [
    VideoTranscodeProcessor, VideoWorkScheduler,
    { provide: VIDEO_S3, inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => new S3Client({ endpoint: config.get("MINIO_ENDPOINT", { infer: true }), region: config.get("MINIO_REGION", { infer: true }), credentials: { accessKeyId: config.get("MINIO_ACCESS_KEY", { infer: true }), secretAccessKey: config.get("MINIO_SECRET_KEY", { infer: true }) }, forcePathStyle: true }) },
    { provide: PrismaVideoProcessingLedger, inject: [PrismaService, ConfigService], useFactory: (db: PrismaService, config: ConfigService<Env, true>) => {
      const appEnv = config.get("APP_ENV", { infer: true });
      const capture = new PrismaMeasurementCommit({ enabled: config.get("MEASUREMENT_ENABLED", { infer: true }) && ["test", "staging"].includes(appEnv), environment: appEnv === "staging" ? "staging" : appEnv === "production" ? "production" : "test", purposes: ["product_reliability"], evidenceRef: config.get("MEASUREMENT_EVIDENCE_REF", { infer: true }) ?? "", realCollectionApproved: false }, config.get("MEASUREMENT_COLLECTOR_EPOCH", { infer: true }) ?? "", () => new Date(), appEnv === "staging" ? config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ?? "invalid" : undefined);
      return new PrismaVideoProcessingLedger(db, { isEligible: userId => config.get("VIDEO_ROLLOUT_ENABLED", { infer: true }) && config.get("VIDEO_TESTER_USER_IDS", { infer: true }).includes(userId) }, { context: { platform: "server", release: "worker", build: config.get("AUTOTM_COMMIT_SHA", { infer: true }).slice(0, 64).replace(/[^0-9A-Za-z._-]/g, "_"), locale: "en" }, capture: (tx, userId, event) => capture.capture(tx, userId, event) });
    } },
    { provide: PrismaVideoCleanupLedger, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaVideoCleanupLedger(db) },
    { provide: ProcessPreparedVideo, inject: [PrismaVideoProcessingLedger, VIDEO_S3, ConfigService], useFactory: (ledger: PrismaVideoProcessingLedger, client: S3Client, config: ConfigService<Env, true>) => new ProcessPreparedVideo(ledger, new S3VideoProcessingObjects(client, config.get("VIDEO_PRIVATE_BUCKET", { infer: true })), new FFmpegVideoProcessor(), () => new Date(), randomUUID) },
    { provide: CleanVideo, inject: [PrismaVideoCleanupLedger, VIDEO_S3, ConfigService], useFactory: (ledger: PrismaVideoCleanupLedger, client: S3Client, config: ConfigService<Env, true>) => new CleanVideo(ledger, new S3VideoCleanupObjects(client, config.get("VIDEO_PRIVATE_BUCKET", { infer: true })), () => new Date(), randomUUID) },
  ],
})
export class VideoModule {}
