import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { MeasurementSchemas } from "@auto-tm/contracts";

export interface MeasurementCollector {
  appendIfEligible(input: { event: MeasurementSchemas.MeasurementEvent; principalId: string; generation: string; epoch: string; environment: string; population: string; conversionEligible: boolean }): Promise<"accepted" | "duplicate" | "revoked" | "unavailable">;
}
export const MEASUREMENT_COLLECTOR = Symbol("MeasurementCollector");

/** Adapter that applies the same generation/epoch fence as ingress, without importing API code. */
@Injectable()
export class PrismaMeasurementCollector implements MeasurementCollector {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async appendIfEligible(input: Parameters<MeasurementCollector["appendIfEligible"]>[0]): Promise<"accepted" | "duplicate" | "revoked"> {
    return this.prisma.$transaction(async (tx) => {
      const state = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR SHARE`;
      if (state[0]?.epoch !== input.epoch) return "revoked";
      const principals = await tx.$queryRaw<{ id: string; generation: string; epoch: string; kind: string; expiresAt: Date | null }[]>`SELECT "id", "generation", "epoch", "kind", "expiresAt" FROM "measurement_principals" WHERE "id" = ${input.principalId} FOR UPDATE`;
      const principal = principals[0];
      if (!principal || principal.epoch !== input.epoch || principal.generation !== input.generation || (principal.expiresAt && principal.expiresAt <= new Date())) return "revoked";
      const inserted = await tx.measurementRecord.createMany({ data: [{ id: input.event.eventId, principalId: principal.id, visitId: null, event: JSON.parse(JSON.stringify(input.event)), origin: "server", environment: input.environment, population: input.population, conversionEligible:input.conversionEligible, occurredAt: new Date(input.event.occurredAt), receivedAt: new Date(), expiresAt: new Date(Date.parse(input.event.occurredAt) + 90 * 86400000) }], skipDuplicates: true });
      return inserted.count ? "accepted" : "duplicate";
    }, { maxWait: 250, timeout: 1000 });
  }
}

/** Bounded, idempotent source-outbox delivery. Core writes never wait for this worker. */
@Injectable()
export class MeasurementOutboxDelivery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(MEASUREMENT_COLLECTOR) private readonly collector: MeasurementCollector) {}

  async deliver(limit = 50): Promise<{ delivered: number; retried: number }> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
      return tx.measurementOutbox.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(limit, 100)), select: { id: true, principalId: true, generation: true, epoch: true, environment: true, population: true, conversionEligible:true, event: true } });
    }, { timeout: 3000, maxWait: 1000 });
    let delivered = 0, retried = 0;
    for (const row of rows) {
      try {
        const parsed = MeasurementSchemas.MeasurementEventSchema.safeParse(row.event);
        if (!parsed.success || !/^(test|staging|production)$/.test(row.environment) || !/^(synthetic|reviewer|pilot|marketplace)$/.test(row.population)) { retried++; continue; }
        const result = await this.collector.appendIfEligible({ event: parsed.data, principalId: row.principalId, generation: row.generation, epoch: row.epoch, environment: row.environment, population: row.population, conversionEligible:row.conversionEligible });
        if (result === "accepted" || result === "duplicate" || result === "revoked") {
          await this.prisma.measurementOutbox.delete({ where: { id: row.id } }); delivered++;
        } else retried++;
      } catch { retried++; }
    }
    return { delivered, retried };
  }
}
