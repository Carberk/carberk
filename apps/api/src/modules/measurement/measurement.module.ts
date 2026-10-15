import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import type { Env } from "../../env.schema";
import { PrismaModule } from "../../common/prisma.module";
import { AcceptMeasurement, type MeasurementActivation } from "./application/AcceptMeasurement";
import { AcceptClientMeasurementBatch } from "./application/AcceptClientMeasurementBatch";
import { syntheticMeasurementAdmission } from "./application/SyntheticMeasurementAdmission";
import { BootstrapMeasurement } from "./application/BootstrapMeasurement";
import { PrismaMeasurementStore } from "./infrastructure/PrismaMeasurementStore";
import { MeasurementController } from "./presentation/MeasurementController";

const ACTIVATION = Symbol("MeasurementActivation");
@Module({
 imports: [PrismaModule], controllers: [MeasurementController],
 providers: [
  { provide: ACTIVATION, inject: [ConfigService], useFactory: (config: ConfigService<Env, true>): MeasurementActivation => ({
   enabled: config.get("MEASUREMENT_ENABLED", { infer: true }) && ["test", "staging"].includes(config.get("APP_ENV", { infer: true })),
   environment: config.get("APP_ENV", { infer: true }) === "production" ? "production" : config.get("APP_ENV", { infer: true }) === "staging" ? "staging" : "test",
   purposes: ["product_improvement", "product_reliability"], evidenceRef: config.get("MEASUREMENT_EVIDENCE_REF", { infer: true }) ?? "",
   realCollectionApproved: false,
  }) },
  { provide: PrismaMeasurementStore, inject: [PrismaService, ConfigService, ACTIVATION], useFactory: (db: PrismaService, config: ConfigService<Env, true>, activation: MeasurementActivation) => new PrismaMeasurementStore(db, {
   ...(config.get("APP_ENV", { infer: true }) === "staging" ? { expiresAt: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ?? "invalid" } : {}),
   epoch: config.get("MEASUREMENT_COLLECTOR_EPOCH", { infer: true }) ?? "unprovisioned", environment: activation.environment, population: "synthetic",
  }) },
  { provide: AcceptMeasurement, inject: [PrismaMeasurementStore, ACTIVATION], useFactory: (store: PrismaMeasurementStore, activation: MeasurementActivation) => new AcceptMeasurement(store, () => new Date(), activation) },
  { provide: AcceptClientMeasurementBatch, inject: [PrismaMeasurementStore, AcceptMeasurement], useFactory: (store: PrismaMeasurementStore, accept: AcceptMeasurement) => new AcceptClientMeasurementBatch(store, accept, () => Date.now()) },
  { provide: BootstrapMeasurement, inject: [PrismaMeasurementStore, ACTIVATION, ConfigService], useFactory: (store: PrismaMeasurementStore, activation: MeasurementActivation, config: ConfigService<Env, true>) => new BootstrapMeasurement(store, "synthetic", activation, (proof) => syntheticMeasurementAdmission({
   environment: config.get("APP_ENV", { infer: true }),
   ...(config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_HASH", { infer: true }) ? { hash: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_HASH", { infer: true }) as string } : {}),
   ...(config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ? { expiresAt: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) as string } : {}),
  }, proof, new Date())) },
 ],
 exports: [AcceptMeasurement],
})
export class MeasurementModule {}
