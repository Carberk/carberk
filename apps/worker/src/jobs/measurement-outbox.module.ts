import { Module } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { BullModule } from "@nestjs/bullmq";

import { RecomputeImprovement } from "../measurement/RecomputeImprovement";
import { PrismaModule } from "../common/prisma.module";
import { MeasurementOutboxProcessor, MEASUREMENT_OUTBOX_QUEUE } from "../queues/measurement-outbox.processor";
import { MeasurementOutboxScheduler } from "../queues/measurement-outbox.scheduler";

import { MeasurementOutboxDelivery, PrismaMeasurementCollector, MEASUREMENT_COLLECTOR } from "./measurementOutbox";

/** Standalone composition; root worker may import this module when rollout is enabled. */
@Module({ imports: [PrismaModule, BullModule.registerQueue({ name: MEASUREMENT_OUTBOX_QUEUE })], providers: [{provide:RecomputeImprovement,inject:[PrismaService],useFactory:(prisma:PrismaService)=>new RecomputeImprovement(prisma,{epoch:process.env["APP_ENV"]==="production"?"":process.env["MEASUREMENT_COLLECTOR_EPOCH"]??"",environment:process.env["APP_ENV"]==="staging"?"staging":"test",population:"synthetic"})},PrismaMeasurementCollector, MeasurementOutboxDelivery, MeasurementOutboxProcessor, MeasurementOutboxScheduler, { provide: MEASUREMENT_COLLECTOR, useExisting: PrismaMeasurementCollector }], exports: [MeasurementOutboxDelivery, MeasurementOutboxProcessor, MeasurementOutboxScheduler] })
export class MeasurementOutboxModule {}
