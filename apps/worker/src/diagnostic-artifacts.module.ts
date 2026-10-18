import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { S3Client } from "@aws-sdk/client-s3";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";

import { PrismaModule } from "./common/prisma.module";
import { DiagnosticArtifactWorker } from "./jobs/diagnostics/DiagnosticArtifactWorker";
import { S3DiagnosticArtifactObjects } from "./jobs/diagnostics/S3DiagnosticArtifactObjects";
import { DIAGNOSTIC_ARTIFACT_QUEUE, DiagnosticArtifactProcessor, DiagnosticArtifactScheduler } from "./queues/diagnostic-artifacts";

@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: DIAGNOSTIC_ARTIFACT_QUEUE })],
  providers: [DiagnosticArtifactScheduler, DiagnosticArtifactProcessor,
    { provide: S3DiagnosticArtifactObjects, inject: [ConfigService], useFactory: (config: ConfigService) => new S3DiagnosticArtifactObjects(new S3Client({
      endpoint: config.get<string>("MINIO_ENDPOINT", "http://localhost:9000"), region: config.get<string>("MINIO_REGION", "us-east-1"), forcePathStyle: true,
      credentials: { accessKeyId: config.get<string>("MINIO_ACCESS_KEY", "minioadmin"), secretAccessKey: config.get<string>("MINIO_SECRET_KEY", "minioadmin") },
    }), config.get<string>("DIAGNOSTIC_PRIVATE_BUCKET", "diagnostic-private")) },
    { provide: DiagnosticArtifactWorker, inject: [PrismaService, S3DiagnosticArtifactObjects, ConfigService], useFactory: async (db: PrismaService, objects: S3DiagnosticArtifactObjects, config: ConfigService) => {
      const [regular, bold] = await Promise.all([readFile(join(__dirname, "../assets/fonts/NotoSans-Regular.ttf")), readFile(join(__dirname, "../assets/fonts/NotoSans-Bold.ttf"))]);
      const enabled = config.get<unknown>("DIAGNOSTIC_SYNTHETIC_ENABLED", false);
      return new DiagnosticArtifactWorker(db, objects, { regular, bold }, { now: () => new Date(), id: randomUUID,
        enabled: () => [true, "true"].includes(enabled as boolean | string) && ["test", "staging"].includes(config.get<string>("APP_ENV", "development")) });
    } },
  ],
})
export class DiagnosticArtifactsModule {}
