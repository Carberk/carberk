import "reflect-metadata";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "@auto-tm/db";
import { Enums } from "@auto-tm/contracts";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GlobalErrorFilter } from "../../../common/error.filter";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { bullTestRoot } from "../../../../test/helpers/bullTestRoot";
import type { ContactPhoneCodePort } from "../domain/ports/ContactPhoneCodePort";
import { EMAIL_CODE_SENDER_PORT, type EmailCodeSenderPort } from "../domain/ports/EmailCodeSenderPort";
import type { OtpSenderPort, OtpSms } from "../domain/ports/OtpSenderPort";
import { SignInCodeRateLimitedError } from "../domain/SignInCodeRateLimitedError";
import type { SignInCodeChannel } from "../domain/types";
import { IdentityModule } from "../identity.module";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { HttpOtpSenderAdapter } from "../infrastructure/HttpOtpSenderAdapter";
import { PrismaOtpRequestRepository } from "../infrastructure/PrismaOtpRequestRepository";
import { toCodePurpose } from "../infrastructure/codePurpose";

const HOUR = 3_600_000;
const PHONE = "+99363123456";
const EMAIL = "admission@example.com";
const FLOWS = ["sign-in", "method-change", "deletion", "contact-phone"] as const;
const PURPOSES = [Enums.SignInCodePurpose.SignIn, Enums.SignInCodePurpose.SignInMethod,
  Enums.SignInCodePurpose.AccountDeletion, Enums.SignInCodePurpose.ListingContactPhone] as const;
type Flow = typeof FLOWS[number];
type Attempt = { flow: Flow; channel: SignInCodeChannel; destination: string; ip: string };
type Outcome = { status: number; body: { requestId?: string; resendInSeconds?: number; testCode?: string; code?: string; details?: { reason: string; retryInSeconds: number } } };

describe("Code issuance shares atomic destination, IP and cooldown admission — PostgreSQL", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let app: NestFastifyApplication | undefined;
  let prisma: PrismaService;
  let observer: PrismaService | undefined;
  let holder: PrismaService | undefined;
  let repository: PrismaOtpRequestRepository;
  let contact: ContactPhoneCodePort;
  let request: ReturnType<typeof supertest>;
  let actorId: string;
  let holderId: string;
  let bearer: string;
  const sms: OtpSms[] = [];
  const email: Array<Parameters<EmailCodeSenderPort["enqueue"]>[0]> = [];
  const previous = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const [key, value] of Object.entries({
      OTP_TEST_MODE: "false",
      REVIEW_DEMO_ACCOUNT_ENABLED: "false",
      REVIEW_DEMO_ACCOUNTS_JSON: "[]",
      TESTER_ACCOUNTS_JSON: "[]",
      CLIENT_IP_HEADER: "x-real-ip",
    })) {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    }
    previous.set("DATABASE_URL", process.env["DATABASE_URL"]);
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const databaseUrl = new URL(container.getConnectionUri());
    // Bound failed queries and identify only this app's contender connections.
    databaseUrl.searchParams.set("options", "-c statement_timeout=10000");
    databaseUrl.searchParams.set("application_name", "issue413-observer");
    process.env["DATABASE_URL"] = databaseUrl.toString();
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: resolve(__dirname, "../../../../../../packages/db"),
      env: { ...process.env }, stdio: "pipe", timeout: 60_000,
    });
    observer = new PrismaService();
    holder = new PrismaService();
    databaseUrl.searchParams.set("application_name", "issue413-contender");
    process.env["DATABASE_URL"] = databaseUrl.toString();
    const module = await Test.createTestingModule({
      imports: [bullTestRoot(), IdentityModule, JwtModule.register({
        global: true, secret: "issue413-disposable-test-secret", signOptions: { expiresIn: "1h" },
      })],
    })
      .overrideProvider(HttpOtpSenderAdapter)
      .useValue({ send: async (input: OtpSms) => { sms.push(input); } } satisfies OtpSenderPort)
      .overrideProvider(EMAIL_CODE_SENDER_PORT)
      .useValue({ enqueue: async (input: Parameters<EmailCodeSenderPort["enqueue"]>[0]) => { email.push(input); } } satisfies EmailCodeSenderPort)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), app.get(JwtService)));
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
    prisma = app.get(PrismaService);
    repository = app.get(PrismaOtpRequestRepository);
    contact = app.get<ContactPhoneCodePort>(IDENTITY_TOKENS.ContactPhoneCodePort);
  }, 120_000);

  afterAll(async () => {
    // Each cleanup runs even if an earlier one fails or setup only partly completed.
    try { await app?.close(); } finally {
      try { await observer?.onModuleDestroy(); } finally {
        try { await holder?.onModuleDestroy(); } finally {
          try { await container?.stop(); } finally {
            for (const [key, value] of previous) {
              if (value === undefined) Reflect.deleteProperty(process.env, key);
              else process.env[key] = value;
            }
          }
        }
      }
    }
  });

  beforeEach(async () => {
    sms.length = 0;
    email.length = 0;
    // This database belongs exclusively to this disposable container.
    await prisma.otpRequest.deleteMany();
    await prisma.user.deleteMany();
    const actor = await prisma.user.create({ data: { email: "actor@example.com", emailVerifiedAt: new Date() } });
    const owner = await prisma.user.create({ data: {
      phone: PHONE, phoneVerifiedAt: new Date(), email: EMAIL, emailVerifiedAt: new Date(),
    } });
    actorId = actor.id;
    holderId = owner.id;
    bearer = `Bearer ${app!.get(JwtService).sign({ sub: actorId })}`;
  });

  async function issue(attempt: Attempt): Promise<Outcome> {
    if (attempt.flow === "contact-phone") {
      try {
        const body = await contact.requestCode({
          userId: actorId, businessId: "issue413-business", phone: attempt.destination,
          ip: attempt.ip, locale: "ru",
        });
        return { status: 201, body };
      } catch (error) {
        if (!(error instanceof SignInCodeRateLimitedError)) throw error;
        const reasons = { DESTINATION_LIMIT: "destination_limit", IP_LIMIT: "ip_limit", BACKOFF: "backoff" };
        return { status: 400, body: { code: "RATE_LIMITED", details: {
          reason: reasons[error.reason], retryInSeconds: error.retryInSeconds,
        } } };
      }
    }
    const paths = {
      "sign-in": "/api/v1/auth/otp/request",
      "method-change": "/api/v1/me/sign-in-methods/request",
      deletion: "/api/v1/account-deletion/request",
    };
    return request.post(paths[attempt.flow])
      .set("Authorization", bearer).set("x-real-ip", attempt.ip)
      .send({ [attempt.channel]: attempt.destination }).timeout(12_000);
  }

  async function seed(channel: SignInCodeChannel, destination: string, ip: string, index: number, age: number) {
    await prisma.otpRequest.create({ data: {
      purpose: toCodePurpose(PURPOSES[index % (channel === "phone" ? 4 : 3)]!),
      channel, destination, ip, codeHash: "fixture-hash",
      createdAt: new Date(Date.now() - age), expiresAt: new Date(Date.now() - 60_000),
      verifiedAt: index % 2 === 0 ? new Date() : null,
    } });
  }

  /**
   * SHARE allows the real budget reads but blocks ROW EXCLUSIVE insertion.
   * Follow pg_blocking_pids recursively: a correct admission lock lets only
   * one contender reach INSERT while its peers wait transitively behind it.
   * Never require every contender to reach INSERT after the production fix.
   */
  async function race(attempts: Attempt[]): Promise<Outcome[]> {
    let unlock!: () => void;
    let locked!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { unlock = resolve; });
    const acquired = new Promise<number>((resolve) => { locked = resolve; });
    const lockDone = holder!.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE public.otp_requests IN SHARE MODE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      locked(row!.pid);
      await released;
    }, { timeout: 15_000, maxWait: 2_000 });
    const pending: Array<Promise<Outcome>> = [];
    let results: PromiseSettledResult<Outcome>[] = [];
    try {
      const pid = await Promise.race([acquired, lockDone.then(() => { throw new Error("barrier ended before acquisition"); })]);
      for (const attempt of attempts) pending.push(issue(attempt));
      // Attach handlers immediately, including for a transport/setup rejection.
      const outcomes = Promise.allSettled(pending);
      const deadline = Date.now() + 2_500;
      let waiting = 0;
      while (Date.now() < deadline) {
        const rows = await observer!.$queryRaw<Array<{ n: bigint }>>`
          WITH RECURSIVE blocked(pid) AS (
            SELECT ${pid}::integer
            UNION
            SELECT activity.pid FROM pg_stat_activity activity
            JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
            WHERE activity.datname = current_database()
          )
          SELECT count(DISTINCT activity.pid) AS n
          FROM blocked JOIN pg_stat_activity activity USING (pid)
          WHERE activity.application_name = 'issue413-contender'
            AND EXISTS (SELECT 1 FROM pg_locks locks
                        WHERE locks.pid = activity.pid AND NOT locks.granted)`;
        waiting = Number(rows[0]?.n ?? 0);
        if (waiting === attempts.length) break;
        await delay(20);
      }
      if (waiting !== attempts.length) {
        throw new Error(`BARRIER SETUP FAILURE, not behavioral RED: ${waiting}/${attempts.length} contenders in direct/transitive PostgreSQL lock waits`);
      }
      unlock();
      await lockDone;
      results = await outcomes;
    } finally {
      unlock();
      try { await lockDone; } finally {
        // statement_timeout and HTTP deadlines bound failed-barrier cleanup.
        await Promise.allSettled(pending);
      }
    }
    return results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
  }

  async function assertOutcomes(attempts: Attempt[], outcomes: Outcome[], accepted: number, reason: string) {
    // Operational/setup failures are never accepted as rate-limit evidence.
    expect(outcomes.map((r) => r.status).every((status) => status === 201 || status === 400)).toBe(true);
    const successes = outcomes.filter((r) => r.status === 201);
    expect(successes).toHaveLength(accepted);
    expect(outcomes.filter((r) => r.status === 400)).toHaveLength(attempts.length - accepted);
    for (const outcome of outcomes.filter((r) => r.status === 400)) {
      expect(outcome.body.code).toBe("RATE_LIMITED");
      expect(outcome.body.details).toEqual({ reason,
        retryInSeconds: reason === "backoff" ? expect.any(Number) : 0,
      });
      if (reason === "backoff") {
        expect(outcome.body.details?.retryInSeconds).toBeGreaterThan(0);
        expect(outcome.body.details?.retryInSeconds).toBeLessThanOrEqual(60);
      } else expect(outcome.body.details?.retryInSeconds).toBe(0);
    }
    const sent = [...sms, ...email];
    expect(sent).toHaveLength(accepted);
    expect(sent.map((m) => m.requestId).sort()).toEqual(successes.map((r) => r.body.requestId).sort());
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status !== 201) continue;
      const attempt = attempts[index]!;
      const purpose = {
        "sign-in": Enums.SignInCodePurpose.SignIn,
        "method-change": Enums.SignInCodePurpose.SignInMethod,
        deletion: Enums.SignInCodePurpose.AccountDeletion,
        "contact-phone": Enums.SignInCodePurpose.ListingContactPhone,
      }[attempt.flow];
      const message = sent.find((m) => m.requestId === outcome.body.requestId)!;
      const record = await repository.findById(outcome.body.requestId!);
      expect(record).toMatchObject({
        purpose, channel: attempt.channel, destination: attempt.destination.toLowerCase(), ip: attempt.ip,
        userId: attempt.flow === "sign-in" ? null : attempt.flow === "deletion"
          ? [PHONE, EMAIL].includes(attempt.destination.toLowerCase()) ? holderId : null
          : actorId,
        businessId: attempt.flow === "contact-phone" ? "issue413-business" : undefined,
        codeHash: createHash("sha256").update(message.code).digest("hex"),
        verifiedAt: null, attempts: 0,
      });
      expect(message).toMatchObject({ purpose, locale: "ru" });
      expect("phone" in message ? message.phone : message.email).toBe(attempt.destination.toLowerCase());
      expect(outcome.body.testCode).toBeUndefined();
    }
  }

  it("issues the same real deletion reservation for an unheld destination without revealing an account", async () => {
    const attempt: Attempt = { flow: "deletion", channel: "email", destination: "unknown@example.com", ip: "198.51.100.31" };
    const outcome = await issue(attempt);
    await assertOutcomes([attempt], [outcome], 1, "unused");
    expect(outcome.body.resendInSeconds).toBe(60);
    expect(await repository.countByDestinationSince("email", attempt.destination, new Date(0))).toBe(1);
  });

  const channels = ["phone", "email"] as const;
  for (const channel of channels) {
    const destination = channel === "phone" ? PHONE : EMAIL;
    const flows = channel === "phone" ? FLOWS : FLOWS.slice(0, 3);
    it(`admits only the last daily ${channel} reservation across purposes`, async () => {
      for (let i = 0; i < 4; i++) await seed(channel, destination, `192.0.2.${i + 1}`, i, 2 * HOUR);
      const attempts = Array.from({ length: 6 }, (_, i): Attempt => ({
        flow: flows[i % flows.length]!, channel,
        destination: channel === "email" && i % 2 === 0 ? "Admission@Example.com" : destination,
        ip: `198.51.100.${i + 1}`,
      }));
      const outcomes = await race(attempts);
      await assertOutcomes(attempts, outcomes, 1, "destination_limit");
      expect(await repository.countByDestinationSince(channel, destination, new Date(Date.now() - 24 * HOUR))).toBe(5);
    });

    it(`admits only one fresh ${channel} reservation during the shared cooldown`, async () => {
      const attempts = Array.from({ length: 6 }, (_, i): Attempt => ({
        flow: flows[i % flows.length]!, channel, destination, ip: `198.51.100.${i + 1}`,
      }));
      const outcomes = await race(attempts);
      await assertOutcomes(attempts, outcomes, 1, "backoff");
      expect(outcomes.find((r) => r.status === 201)?.body.resendInSeconds).toBe(60);
      expect(await repository.countByDestinationSince(channel, destination, new Date(0))).toBe(1);
    });

    // Every flow must actually win and persist its own bindings; an arbitrary
    // concurrency winner cannot establish the other producers' correctness.
    for (const flow of flows) {
      it(`persists and sends a real ${channel} ${flow} reservation with its original binding`, async () => {
        const attempt: Attempt = { flow, channel, destination, ip: "198.51.100.30" };
        await assertOutcomes([attempt], [await issue(attempt)], 1, "unused");
        expect(await repository.countByDestinationSince(channel, destination, new Date(0))).toBe(1);
      });
    }
  }

  it("admits only two remaining shared-IP reservations across fresh destinations, channels and all four purposes", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 8; i++) await seed(i % 2 ? "email" : "phone", i % 2 ? `seed${i}@example.com` : `+9936320000${i}`, ip, Math.floor(i / 2), 10 * 60_000);
    const attempts: Attempt[] = [
      { flow: "sign-in", channel: "phone", destination: "+99363300001", ip },
      { flow: "method-change", channel: "phone", destination: "+99363300002", ip },
      { flow: "contact-phone", channel: "phone", destination: "+99363300003", ip },
      { flow: "deletion", channel: "email", destination: EMAIL, ip },
      { flow: "sign-in", channel: "email", destination: "fresh@example.com", ip },
      { flow: "method-change", channel: "email", destination: "change@example.com", ip },
    ];
    const outcomes = await race(attempts);
    await assertOutcomes(attempts, outcomes, 2, "ip_limit");
    expect(await repository.countByIpSince(ip, new Date(Date.now() - HOUR))).toBe(10);
    const counts = await Promise.all(attempts.map((a) => repository.countByDestinationSince(a.channel, a.destination, new Date(0))));
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});
