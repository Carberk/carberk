import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import supertest from "supertest";
import { JwtAuthGuard } from "../../src/common/jwt-auth.guard";
import { AccountDeletionPendingGuard } from "../../src/common/account-deletion-pending.guard";
import { GlobalErrorFilter } from "../../src/common/error.filter";
import { IDENTITY_CHECK_PORT } from "../../src/modules/identity/identity.public";
import { VehicleHistoryModule } from "../../src/modules/vehicle-history/vehicle-history.module";
import { bullTestRoot } from "./bullTestRoot";

/** Listening test-only HTTP/auth target; never provisions a browser/device session. */
export async function historyFixture() {
  const module = await Test.createTestingModule({ imports: [bullTestRoot(), VehicleHistoryModule,
    JwtModule.register({ global: true, secret: "synthetic-history-assignment-test-secret" }),
  ] }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)),
    new AccountDeletionPendingGuard(app.get(Reflector), app.get(IDENTITY_CHECK_PORT)));
  app.useGlobalFilters(new GlobalErrorFilter());
  let barrier: { remaining: number; ready: Promise<void>; release: () => void } | undefined;
  app.getHttpAdapter().getInstance().addHook("preHandler", async (incoming) => {
    if (!incoming.headers["x-history-concurrency"] || !barrier) return;
    const current = barrier;
    if (--current.remaining === 0) { barrier = undefined; current.release(); }
    await current.ready;
  });
  await app.listen(0, "127.0.0.1");
  const prisma = app.get(PrismaService), config = app.get(ConfigService);
  const request = supertest(app.getHttpServer());
  const users: string[] = [];
  return { app, prisma, config, request,
    concurrent(count: number) {
      let release!: () => void;
      barrier = { remaining: count, ready: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
    },
    async actor(purpose: "vehicle_history" | "vehicle_history_payment_evidence" | "vehicle_history_staff_management" | null = "vehicle_history", role: "buyer" | "seller" | "admin" = "buyer") {
      const user = await prisma.user.create({ data: { role, email: `history-${randomUUID()}@example.invalid`,
        emailVerifiedAt: new Date(), displayName: "Ayna", nameNumber: 1213,
        ...(purpose ? { staffGrants: { create: { purpose } } } : {}),
      } });
      users.push(user.id);
      const session = await prisma.session.create({ data: { userId: user.id, refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600_000), adminTotpExpiresAt: new Date(Date.now() + 600_000) } });
      config.set("APP_ENV", "test"); config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
      config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", users.join(","));
      const token = app.get(JwtService).sign({ sub: user.id, sid: session.id, role });
      return { user: { id: user.id }, session: { id: session.id }, token };
    },
    async close() {
      try {
        const requests = await prisma.vehicleHistoryRequest.findMany({ where: { requesterId: { in: users } }, select: { id: true } });
        const conversations = await prisma.serviceConversation.findMany({ where: {
          purpose: "vehicle_history", objectId: { in: requests.map((request) => request.id) },
        }, select: { id: true } });
        const scope = { conversationId: { in: conversations.map((conversation) => conversation.id) } };
        await prisma.serviceMessageOffer.deleteMany({ where: scope });
        await prisma.serviceReceipt.deleteMany({ where: scope });
        await prisma.serviceMessage.deleteMany({ where: scope });
        await prisma.serviceConversation.deleteMany({ where: { id: scope.conversationId } });
        await prisma.vehicleHistoryRequest.deleteMany({ where: { requesterId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        await prisma.dealership.deleteMany({ where: { slug: { in: users } } });
      } finally { await app.close(); }
    },
  };
}
