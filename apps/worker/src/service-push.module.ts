import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { PrismaService } from "@auto-tm/db";

import { PrismaModule } from "./common/prisma.module";
import { TestPushTransport } from "./push/adapters/TestPushTransport";
import { DeliverServicePush } from "./jobs/DeliverServicePush";
import { servicePushRuntime } from "./jobs/servicePushRuntime";
import { SERVICE_PUSH_QUEUE, ServicePushProcessor, ServicePushScheduler } from "./queues/service-push";

@Module({ imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: SERVICE_PUSH_QUEUE })], providers: [ServicePushScheduler, ServicePushProcessor, { provide: DeliverServicePush, inject: [PrismaService, ConfigService], useFactory: (db: PrismaService, config: ConfigService) => new DeliverServicePush(db, new TestPushTransport(), servicePushRuntime(Object.fromEntries(["APP_ENV", "NODE_ENV", "PUSH_TRANSPORT", "SERVICE_SYNTHETIC_ENABLED", "SERVICE_SYNTHETIC_USER_IDS"].map(key => [key, config.get(key)])))) }] })
export class ServicePushModule {}
