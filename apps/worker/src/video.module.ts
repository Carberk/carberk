import { randomUUID } from "node:crypto";

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";

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
    { provide: PrismaVideoProcessingLedger, inject: [PrismaService, ConfigService], useFactory: (db: PrismaService, config: ConfigService<Env, true>) => new PrismaVideoProcessingLedger(db, { isEligible: userId => config.get("VIDEO_ROLLOUT_ENABLED", { infer: true }) && config.get("VIDEO_TESTER_USER_IDS", { infer: true }).includes(userId) }) },
    { provide: PrismaVideoCleanupLedger, inject: [PrismaService], useFactory: (db: PrismaService) => new PrismaVideoCleanupLedger(db) },
    { provide: ProcessPreparedVideo, inject: [PrismaVideoProcessingLedger, VIDEO_S3, ConfigService], useFactory: (ledger: PrismaVideoProcessingLedger, client: S3Client, config: ConfigService<Env, true>) => new ProcessPreparedVideo(ledger, new S3VideoProcessingObjects(client, config.get("VIDEO_PRIVATE_BUCKET", { infer: true })), new FFmpegVideoProcessor(), () => new Date(), randomUUID) },
    { provide: CleanVideo, inject: [PrismaVideoCleanupLedger, VIDEO_S3, ConfigService], useFactory: (ledger: PrismaVideoCleanupLedger, client: S3Client, config: ConfigService<Env, true>) => new CleanVideo(ledger, new S3VideoCleanupObjects(client, config.get("VIDEO_PRIVATE_BUCKET", { infer: true })), () => new Date(), randomUUID) },
  ],
})
export class VideoModule {}
