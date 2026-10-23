import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { PrismaModule } from "./common/prisma.module";
import { ExpireMeasurement } from "./jobs/ExpireMeasurement";
import { PrismaMeasurementRetentionLedger } from "./jobs/PrismaMeasurementRetentionLedger";
import { MeasurementRetentionProcessor } from "./queues/measurement-retention.processor";
import { MEASUREMENT_RETENTION_QUEUE, MeasurementRetentionScheduler } from "./queues/measurement-retention.scheduler";

@Module({ imports: [PrismaModule, BullModule.registerQueue({ name: MEASUREMENT_RETENTION_QUEUE })], providers: [PrismaMeasurementRetentionLedger,
 { provide: ExpireMeasurement, inject: [PrismaMeasurementRetentionLedger], useFactory: (ledger: PrismaMeasurementRetentionLedger) => new ExpireMeasurement(ledger) },
 MeasurementRetentionProcessor, MeasurementRetentionScheduler,
] })
export class MeasurementRetentionModule {}
