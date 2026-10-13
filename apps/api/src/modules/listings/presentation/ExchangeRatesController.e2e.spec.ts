import { EventEmitterModule } from "@nestjs/event-emitter";
import "reflect-metadata";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { PrismaService } from "@auto-tm/db";

import { ListingsModule } from "../listings.module";
import { IdentityModule } from "../../identity/identity.module";
import { EnvSchema } from "../../../env.schema";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { LISTING_EVENT_PUBLISHER } from "../domain/ports/ListingEventPublisher";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";

describe("ExchangeRatesController e2e", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        bullTestRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (cfg) => EnvSchema.parse(cfg),
        }),
        ListingsModule,
        IdentityModule,
        JwtModule.register({
          global: true,
          secret: process.env["JWT_ACCESS_SECRET"] ?? "dev-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }),
      ],
    })
      .overrideProvider(LISTING_EVENT_PUBLISHER)
      .useValue({ emit: async () => {} })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    const reflector = app.get(Reflector);
    const jwtService = app.get(JwtService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwtService));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.exchangeRate.deleteMany();
  });

  it("returns empty rates when none exist", async () => {
    const res = await request
      .get("/api/v1/exchange-rates")
      .expect(200);

    expect(res.body.rates).toHaveLength(0);
  });

  it("returns seeded exchange rates", async () => {
    await prisma.exchangeRate.create({
      data: { fromCurrency: "USD", toCurrency: "TMT", rate: 3.5 },
    });
    await prisma.exchangeRate.create({
      data: { fromCurrency: "AED", toCurrency: "TMT", rate: 0.95 },
    });

    const res = await request
      .get("/api/v1/exchange-rates")
      .expect(200);

    expect(res.body.rates).toHaveLength(2);
    expect(res.body.rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromCurrency: "USD", toCurrency: "TMT", rate: 3.5 }),
        expect.objectContaining({ fromCurrency: "AED", toCurrency: "TMT", rate: 0.95 }),
      ]),
    );
  });
});
