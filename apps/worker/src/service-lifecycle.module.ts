import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "@auto-tm/db";

import { PrismaModule } from "./common/prisma.module";
import { AdvanceHistoryOrders } from "./jobs/AdvanceHistoryOrders";
import { ExpireServiceContent } from "./jobs/ExpireServiceContent";
import { S3RetiredObjectStore } from "./jobs/S3RetiredObjectStore";
import { SERVICE_LIFECYCLE_QUEUE, ServiceLifecycleProcessor, ServiceLifecycleScheduler } from "./queues/service-lifecycle";

@Module({
 imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: SERVICE_LIFECYCLE_QUEUE })],
 providers: [ServiceLifecycleScheduler, ServiceLifecycleProcessor,
  { provide: AdvanceHistoryOrders, inject: [PrismaService], useFactory: (db: PrismaService) => new AdvanceHistoryOrders(db) },
  { provide: ExpireServiceContent, inject: [PrismaService, ConfigService], useFactory: (db: PrismaService, config: ConfigService) => new ExpireServiceContent(db, new S3RetiredObjectStore(new S3Client({ endpoint: config.get<string>("MINIO_ENDPOINT", "http://localhost:9000"), region: config.get<string>("MINIO_REGION", "us-east-1"), forcePathStyle: true, credentials: { accessKeyId: config.get<string>("MINIO_ACCESS_KEY", "minioadmin"), secretAccessKey: config.get<string>("MINIO_SECRET_KEY", "minioadmin") } }), "service-private")) }],
})
export class ServiceLifecycleModule {}
