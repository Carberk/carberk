import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { MeasurementSchemas } from "@auto-tm/contracts";

export interface MeasurementCollector {
  appendIfEligible(input: { event: MeasurementSchemas.MeasurementEvent; principalId: string; generation: string; epoch: string; environment: string; population: string }): Promise<"accepted" | "duplicate" | "revoked">;
}

/** Bounded, idempotent source-outbox delivery. Core writes never wait for this worker. */
@Injectable()
export class MeasurementOutboxDelivery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, private readonly collector: MeasurementCollector) {}

  async deliver(limit = 50): Promise<{ delivered: number; retried: number }> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
      return tx.measurementOutbox.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(limit, 100)), select: { id: true, principalId: true, generation: true, epoch: true, environment: true, population: true, event: true } });
    }, { timeout: 3000, maxWait: 1000 });
    let delivered = 0, retried = 0;
    for (const row of rows) {
      try {
        const parsed = MeasurementSchemas.MeasurementEventSchema.safeParse(row.event);
        if (!parsed.success || !/^(test|staging|production)$/.test(row.environment) || !/^(synthetic|reviewer|pilot|marketplace)$/.test(row.population)) { retried++; continue; }
        const result = await this.collector.appendIfEligible({ event: parsed.data, principalId: row.principalId, generation: row.generation, epoch: row.epoch, environment: row.environment, population: row.population });
        if (result === "accepted" || result === "duplicate" || result === "revoked") {
          await this.prisma.measurementOutbox.delete({ where: { id: row.id } }); delivered++;
        } else retried++;
      } catch { retried++; }
    }
    return { delivered, retried };
  }
}
