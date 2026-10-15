import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { MeasurementOutboxDelivery, PrismaMeasurementCollector, MEASUREMENT_COLLECTOR } from "./measurementOutbox";

/** Standalone composition; root worker may import this module when rollout is enabled. */
@Module({ imports: [PrismaModule], providers: [PrismaMeasurementCollector, MeasurementOutboxDelivery, { provide: MEASUREMENT_COLLECTOR, useExisting: PrismaMeasurementCollector }], exports: [MeasurementOutboxDelivery] })
export class MeasurementOutboxModule {}
