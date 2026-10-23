import { ListingMeasurementModule } from "../listings/listing-measurement.module";
import { MEASUREMENT_CONVERSION_PORT, MEASUREMENT_COMMIT_PORT, MEASUREMENT_SIGN_IN_OUTCOME_PORT, type MeasurementConversionPort } from "./measurement.public";
import { RecordSignInMeasurement } from "./application/RecordSignInMeasurement";
import { PrismaMeasurementCommit } from "./infrastructure/PrismaMeasurementCommit";
import { Module } from "@nestjs/common";
import { ConfigModule,ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import type { Env } from "../../env.schema";
import { PrismaModule } from "../../common/prisma.module";
import { AcceptMeasurement, type MeasurementActivation } from "./application/AcceptMeasurement";
import { AcceptClientMeasurementBatch } from "./application/AcceptClientMeasurementBatch";
import { syntheticMeasurementAdmission } from "./application/SyntheticMeasurementAdmission";
import { BootstrapMeasurement } from "./application/BootstrapMeasurement";
import { PrismaMeasurementStore } from "./infrastructure/PrismaMeasurementStore";
import { MeasurementController } from "./presentation/MeasurementController";
import { MEASUREMENT_RATE_LIMITER, RedisMeasurementRateLimiter } from "./infrastructure/RedisMeasurementRateLimiter";

const ACTIVATION = Symbol("MeasurementActivation");
@Module({
 imports: [ConfigModule,PrismaModule,ListingMeasurementModule], controllers: [MeasurementController],
 providers: [
  {provide:MEASUREMENT_SIGN_IN_OUTCOME_PORT,inject:[PrismaMeasurementStore,AcceptMeasurement],useFactory:(store:PrismaMeasurementStore,emitter:AcceptMeasurement)=>new RecordSignInMeasurement(store,emitter,()=>new Date())},
  { provide: MEASUREMENT_COMMIT_PORT, inject: [ACTIVATION, ConfigService], useFactory: (activation: MeasurementActivation, config: ConfigService<Env, true>) => new PrismaMeasurementCommit(activation,
   config.get("MEASUREMENT_COLLECTOR_EPOCH", { infer: true }) ?? "", () => new Date(),
   config.get("APP_ENV", { infer: true }) === "staging" ? config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ?? "invalid" : undefined,
  ) },
  { provide: ACTIVATION, inject: [ConfigService], useFactory: (config: ConfigService<Env, true>): MeasurementActivation => ({
   enabled: [true,"true"].includes(config.get("MEASUREMENT_ENABLED", { infer: true })) && ["test", "staging"].includes(config.get("APP_ENV", { infer: true })),
   environment: config.get("APP_ENV", { infer: true }) === "production" ? "production" : config.get("APP_ENV", { infer: true }) === "staging" ? "staging" : "test",
   purposes: ["product_improvement", "product_reliability"], evidenceRef: config.get("MEASUREMENT_EVIDENCE_REF", { infer: true }) ?? "",
   realCollectionApproved: false,
  }) },
  { provide: PrismaMeasurementStore, inject: [PrismaService, ConfigService, ACTIVATION,MEASUREMENT_CONVERSION_PORT], useFactory: (db: PrismaService, config: ConfigService<Env, true>, activation: MeasurementActivation,conversion:MeasurementConversionPort) => new PrismaMeasurementStore(db, {
   ...(config.get("APP_ENV", { infer: true }) === "staging" ? { expiresAt: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ?? "invalid" } : {}),
   epoch: config.get("MEASUREMENT_COLLECTOR_EPOCH", { infer: true }) ?? "unprovisioned", environment: activation.environment, population: "synthetic",
  },()=>new Date(),conversion) },
  { provide: AcceptMeasurement, inject: [PrismaMeasurementStore, ACTIVATION], useFactory: (store: PrismaMeasurementStore, activation: MeasurementActivation) => new AcceptMeasurement(store, () => new Date(), activation) },
  RedisMeasurementRateLimiter,
  { provide: MEASUREMENT_RATE_LIMITER, useExisting: RedisMeasurementRateLimiter },
  { provide: AcceptClientMeasurementBatch, inject: [PrismaMeasurementStore, AcceptMeasurement, MEASUREMENT_RATE_LIMITER], useFactory: (store: PrismaMeasurementStore, accept: AcceptMeasurement, limiter: RedisMeasurementRateLimiter) => new AcceptClientMeasurementBatch(store, accept, () => Date.now(), limiter) },
  { provide: BootstrapMeasurement, inject: [PrismaMeasurementStore, ACTIVATION, ConfigService], useFactory: (store: PrismaMeasurementStore, activation: MeasurementActivation, config: ConfigService<Env, true>) => new BootstrapMeasurement(store, "synthetic", activation, (proof) => syntheticMeasurementAdmission({
   environment: config.get("APP_ENV", { infer: true }),
   ...(config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_HASH", { infer: true }) ? { hash: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_HASH", { infer: true }) as string } : {}),
   ...(config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) ? { expiresAt: config.get("MEASUREMENT_SYNTHETIC_CAPABILITY_EXPIRES_AT", { infer: true }) as string } : {}),
  }, proof, new Date())) },
 ],
 exports: [AcceptMeasurement, MEASUREMENT_COMMIT_PORT,MEASUREMENT_SIGN_IN_OUTCOME_PORT],
})
export class MeasurementModule {}
