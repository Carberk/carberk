import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { withFixtureCallerDrain } from "../../../../test/helpers/fixtureCallerDrain";
import { PrismaSessionRepository } from "./PrismaSessionRepository";
import { PrismaTotpEnrollmentRepository } from "./PrismaTotpEnrollmentRepository";
import { PrismaStaffAuthority } from "./PrismaStaffAuthority";
import { PrismaUserRepository } from "./PrismaUserRepository";
import { PrismaOtpRequestRepository } from "./PrismaOtpRequestRepository";
import { BcryptHasherAdapter } from "./BcryptHasherAdapter";
import { signInCodeDestination } from "../domain/SignInCodeDestination";

const suite = defineE2eSuite("identity-authority-prepared-r2");
const role = `r2_identity_${suite.id("role").replaceAll("-", "")}`;
const families = ["refresh", "first", "backup", "revoke", "delete", "destination", "otp", "cascade", "noop", "expired"] as const;
const cases = families.flatMap(family => ["left", "right"].map(order => `${family}-${order}`));
const at = new Date();
const end = new Date(at.getTime() + 3600_000);
const expired = new Date(at.getTime() - 3600_000);
const id = (key: string, who: string) => suite.id(`${key}-${who}`);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function pause(event: string) {
  return { event, entered: deferred<number>(), release: deferred<undefined>(), used: false };
}
type Pause = ReturnType<typeof pause>;
const outcome = async <T>(work: Promise<T>) => work.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error: String(error) }));

/** Authored only. Never imported or executed in the implementation checkout.
 * The disposable SQL lane owns setup/guard enabling and restricted-role grants.
 * Runtime observation delays a REAL query/write AFTER it completes. It does not
 * prepare a receipt for the caller, replace SQL, change isolation/timeouts, or
 * supply a transaction to a repository constructor. Every caller below opens
 * its own production transaction and uses real FK/unique/source guards.
 * Positive opposition requires pg_blocking_pids, never a timeout-as-success. */
describe("Identity caller-owned preparation under PostgreSQL opposition", { concurrent: false }, () => {
  const db = new PrismaService();
  const hasher = new BcryptHasherAdapter();
  let oldHash: string;
  let roleCreated = false;
  let guardState: { table: string; name: string; enabled: string }[] = [];

  async function guards(enable: boolean) {
    for (const row of guardState) {
      // Names are catalog-derived, quoted, and limited to this kernel's guards.
      const table = row.table.replaceAll('"', '""'); const name = row.name.replaceAll('"', '""');
      await db.$executeRawUnsafe(`ALTER TABLE public."${table}" ${enable ? "ENABLE" : "DISABLE"} TRIGGER "${name}"`);
    }
  }
  function runtime(gate?: Pause, rollback = false): PrismaService {
    return new Proxy(db, {
      get(target, property) {
        if (property !== "$transaction") {
          const value: unknown = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: Parameters<PrismaService["$transaction"]>[1]) =>
          target.$transaction(async tx => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
            let prepared = false;
            async function observed(event: string) {
              if (gate && !gate.used && gate.event === event) {
                gate.used = true;
                const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
                if (!backend) throw new Error("missing backend");
                gate.entered.resolve(backend.pid);
                await gate.release.promise;
              }
            }
            const proxy = new Proxy(tx, {
              get(connection, key) {
                const value: unknown = Reflect.get(connection, key);
                if (key === "$queryRaw") return async (strings: TemplateStringsArray, ...values: unknown[]) => {
                  const sql = strings.join("?");
                  const preparation = sql.includes("diagnostic_prepare_source") || sql.includes("campaign_prepare");
                  if (!preparation && (sql.includes("FOR UPDATE") || sql.includes("pg_advisory_xact_lock")) && !prepared) throw new Error("caller locked before preparation");
                  const result: unknown = await connection.$queryRaw(strings, ...values);
                  if (preparation) prepared = true;
                  await observed(sql.includes("diagnostic_prepare_source") ? "source" : sql.includes("pg_advisory_xact_lock(41301") ? "otp-destination" : "query");
                  return result;
                };
                if (["session", "user", "totpEnrollment", "totpBackupCode", "staffGrant", "auditLog", "otpRequest"].includes(String(key))) {
                  return new Proxy(value as object, { get(delegate, method) {
                    const operation: unknown = Reflect.get(delegate, method);
                    if (typeof operation !== "function") return operation;
                    return async (...args: unknown[]) => {
                      if (["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"].includes(String(method)) && !prepared) throw new Error("caller wrote before preparation");
                      const result: unknown = await Reflect.apply(operation, delegate, args);
                      await observed(`${String(key)}.${String(method)}`);
                      return result;
                    };
                  } });
                }
                return typeof value === "function" ? value.bind(connection) : value;
              },
            });
            const result = await work(proxy);
            if (rollback) throw new Error("identity caller rollback sentinel");
            return result;
          }, options);
      },
    });
  }
  async function blockedBy(holder: number) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<{ pid: number }[]>`
        SELECT pid FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND ${holder}=ANY(pg_blocking_pids(pid))`;
      if (rows.length) return;
      await new Promise(done => setTimeout(done, 10));
    }
    throw new Error("opposing real caller did not exhibit a PostgreSQL lock wait");
  }
  async function oppose<A, B>(event: string, first: (client: PrismaService) => Promise<A>, second: (client: PrismaService) => Promise<B>) {
    const gate = pause(event);
    return withFixtureCallerDrain(() => gate.release.resolve(undefined), async start => {
      const a = start(() => outcome(first(runtime(gate))));
      const pid = await Promise.race([gate.entered.promise, a.then(result => { throw new Error(`first caller exited before barrier: ${JSON.stringify(result)}`); })]);
      const b = start(() => outcome(second(runtime())));
      await blockedBy(pid);
      // Release before awaiting outcomes: the holder is still paused here.
      gate.release.resolve(undefined);
      return Promise.all([a, b]);
    });
  }
  const sessions = (client: PrismaService) => new PrismaSessionRepository(client, hasher);
  const totp = (client: PrismaService) => new PrismaTotpEnrollmentRepository(client);
  const elevation = (key: string) => ({ userId: id(key, "staff"), enrollmentId: id(key, "enrollment"), sessionId: id(key, "session"), adminTotpExpiresAt: end });
  const manage = (key: string, grant: boolean) => ({ userId: id(key, "manager"), sessionId: id(key, "manager-session"), targetUserId: id(key, "staff"), capability: "diagnostics.technician", reason: "Synthetic authority opposition", grant });

  beforeAll(async () => {
    await db.onModuleInit();
    guardState = await db.$queryRaw<typeof guardState>`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
    expect(guardState.length).toBeGreaterThan(0);
    // Preactivation fixtures only. Automatic ownership admission remains CLOSED.
    await guards(false);
    oldHash = await hasher.hash("old-refresh");
    for (const key of cases) {
      for (const who of ["staff", "manager", "other"]) {
        expect(await db.user.findUnique({ where: { id: id(key, who) } })).toBeNull();
        await db.user.create({ data: { id: id(key, who), email: `${id(key, who)}@identity.invalid`, emailVerifiedAt: at } });
      }
      await db.staffGrant.createMany({ data: [
        { userId: id(key, "staff"), capability: "diagnostics.technician" },
        { userId: id(key, "manager"), capability: "staff.manage" },
        { userId: id(key, "manager"), capability: "founder.control" },
      ] });
      await db.session.createMany({ data: [
        { id: id(key, "session"), userId: id(key, "staff"), refreshTokenHash: oldHash, expiresAt: end },
        { id: id(key, "manager-session"), userId: id(key, "manager"), refreshTokenHash: oldHash, expiresAt: end, adminTotpExpiresAt: end },
      ] });
      await db.totpEnrollment.create({ data: { id: id(key, "enrollment"), userId: id(key, "staff"), encryptedSecret: "synthetic-encrypted", verifiedAt: key.startsWith("first-") ? null : at } });
      if (!key.startsWith("first-")) await db.totpBackupCode.create({ data: { id: id(key, "backup"), totpEnrollmentId: id(key, "enrollment"), codeHash: "one-use" } });
    }
    // Minimal relational pending-request fixtures, not issued proofs/reports.
    // Their FK deletion is exercised through the unwrapped Session caller below.
    const centerId = suite.id("request-center"); const templateId = suite.id("request-template");
    const localized = { en: "Synthetic", ru: "Synthetic", tk: "Synthetic" };
    await db.diagnosticCenter.create({ data: { id: centerId, code: suite.slugFor("request-center"), names: localized } });
    await db.diagnosticTemplateVersion.create({ data: { id: templateId, centerId, version: 1, definition: { title: localized, limitations: localized, syntheticNotice: localized, checks: [], panels: [] } } });
    const order = await db.inspectionOrder.create({ data: { id: suite.id("request-order"), centerId, templateVersionId: templateId, commissionerId: id("cascade-left", "staff"), requestKey: randomUUID(), audience: "buyer_private" } });
    await db.diagnosticContinuityRequest.createMany({ data: [
      { id: suite.id("owned-request"), orderId: order.id, actorId: id("cascade-left", "staff"), sessionId: id("cascade-left", "session"), kind: "issue" },
      { id: suite.id("foreign-request"), orderId: order.id, actorId: id("cascade-left", "manager"), sessionId: id("cascade-left", "manager-session"), kind: "issue" },
    ] });
    await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    roleCreated = true;
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${role}"`);
    await guards(true);
    const [ready] = await db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AND campaign_preparation_ready() AS ready`;
    expect(ready?.ready).toBe(true);
    await runtime().$transaction(async tx => {
      const [actual] = await tx.$queryRaw<{ name: string; superuser: boolean; owns: boolean }[]>`SELECT current_user AS name,r.rolsuper AS superuser,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_roles r JOIN pg_class c ON c.oid='public.sessions'::regclass WHERE r.rolname=current_user`;
      expect(actual).toEqual({ name: role, superuser: false, owns: false });
    });
  });
  afterAll(async () => {
    // Preserve scenario rows for inspection; restore only inherited guard state.
    for (const row of guardState) {
      const table = row.table.replaceAll('"', '""'); const name = row.name.replaceAll('"', '""');
      const mode = row.enabled === "D" ? "DISABLE" : row.enabled === "A" ? "ENABLE ALWAYS" : row.enabled === "R" ? "ENABLE REPLICA" : "ENABLE";
      await db.$executeRawUnsafe(`ALTER TABLE public."${table}" ${mode} TRIGGER "${name}"`);
    }
    if (roleCreated) {
      await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
      await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
    await db.onModuleDestroy();
  });

  it.each(["left", "right"])("refresh CAS has one winner and false loser, %s begins first", async order => {
    const key = `refresh-${order}`;
    const firstHash = `${order}-winner`;
    const results = await oppose("source", client => sessions(client).rotateRefreshToken(id(key, "session"), oldHash, firstHash, at, end),
      client => sessions(client).rotateRefreshToken(id(key, "session"), oldHash, "loser", at, end));
    expect(results).toEqual([{ ok: true, value: true }, { ok: true, value: false }]);
    expect((await db.session.findUniqueOrThrow({ where: { id: id(key, "session") } })).refreshTokenHash).toBe(firstHash);
  });
  it.each(["left", "right"])("first verification is atomic and the loser retains its pending error, %s first", async order => {
    const key = `first-${order}`;
    const input = { ...elevation(key), verifiedAt: at, codeHashes: [`${order}-one`, `${order}-two`] };
    const results = await oppose("source", client => totp(client).completeFirstVerification(input), client => totp(client).completeFirstVerification({ ...input, codeHashes: ["loser"] }));
    expect(results[0]).toEqual({ ok: true, value: undefined });
    expect(results[1]).toMatchObject({ ok: false, error: expect.stringContaining("TOTP_ENROLLMENT_NOT_PENDING") });
    expect((await db.totpBackupCode.findMany({ where: { totpEnrollmentId: input.enrollmentId } })).map(code => code.codeHash).sort()).toEqual([`${order}-one`, `${order}-two`]);
    expect((await db.session.findUniqueOrThrow({ where: { id: input.sessionId } })).adminTotpExpiresAt).toEqual(end);
  });
  it.each(["left", "right"])("backup reuse cannot burn or elevate twice, %s first", async order => {
    const key = `backup-${order}`; const input = { ...elevation(key), usedAt: at, codeHash: "one-use" };
    const results = await oppose("source", client => totp(client).consumeBackupCodeAndElevate(input), client => totp(client).consumeBackupCodeAndElevate(input));
    expect(results).toEqual([{ ok: true, value: true }, { ok: true, value: false }]);
    expect((await db.totpBackupCode.findUniqueOrThrow({ where: { id: id(key, "backup") } })).usedAt).toEqual(at);
  });
  it.each(["left", "right"])("backup elevation opposes staff revocation in both orders, %s", async order => {
    const key = `revoke-${order}`; const input = { ...elevation(key), usedAt: at, codeHash: "one-use" };
    const revoke = (client: PrismaService) => new PrismaStaffAuthority(client).change(manage(key, false), at);
    const elevate = (client: PrismaService) => totp(client).consumeBackupCodeAndElevate(input);
    const results = order === "left" ? await oppose("source", revoke, elevate) : await oppose("source", elevate, revoke);
    if (order === "left") {
      expect(results[0]).toEqual({ ok: true, value: undefined });
      expect(results[1]).toMatchObject({ ok: false, error: expect.stringContaining("SESSION_NOT_FOUND") });
      expect((await db.totpBackupCode.findUniqueOrThrow({ where: { id: id(key, "backup") } })).usedAt).toBeNull();
      expect((await db.session.findUniqueOrThrow({ where: { id: input.sessionId } })).adminTotpExpiresAt).toBeNull();
    } else {
      expect(results[0]).toEqual({ ok: true, value: true });
      // Losing stale inventory refuses rather than silently widening/retrying.
      expect(results[1].ok || (!results[1].ok && /diagnostic_source_(stale|graph_changed)/.test(results[1].error))).toBe(true);
    }
  });
  it.each(["left", "right"])("logout and Session creation never delete the incoming Session, %s", async order => {
    const key = `delete-${order}`;
    const create = (client: PrismaService) => sessions(client).create({ userId: id(key, "staff"), refreshTokenHash: "incoming", deviceLabel: null, userAgent: null, expiresAt: end });
    const remove = (client: PrismaService) => sessions(client).deleteOldestByUserId(id(key, "staff"));
    const results = order === "left" ? await oppose("source", remove, create) : await oppose("session.create", create, remove);
    const incoming = await db.session.findFirst({ where: { userId: id(key, "staff"), refreshTokenHash: "incoming" } });
    expect(incoming).not.toBeNull(); expect(results[0].ok).toBe(true);
    if (order === "left") expect(results[1].ok).toBe(true);
    else expect(results[1]).toMatchObject({ ok: false, error: expect.stringMatching(/diagnostic_source_(stale|graph_changed)/) });
  });
  it.each(["left", "right"])("User INSERT and verified replacement fence the same destination, %s", async order => {
    const key = `destination-${order}`; const email = `${id(key, "destination")}@identity.invalid`;
    const replacement = (client: PrismaService) => new PrismaUserRepository(client).replaceSignInMethod({ userId: id(key, "staff"), channel: "email", destination: email, verifiedAt: at });
    const create = (client: PrismaService) => new PrismaUserRepository(client).create({ phone: null, phoneVerifiedAt: null, email, emailVerifiedAt: at }, { nameNumber: 1234, avatarIndex: 1 });
    if (order === "left") {
      const gate = pause("source");
      await withFixtureCallerDrain(() => gate.release.resolve(undefined), async start => {
        const first = start(() => outcome(replacement(runtime(gate))));
        await Promise.race([gate.entered.promise, first.then(result => { throw new Error(JSON.stringify(result)); })]);
        // INSERT's nonblocking destination fence MUST refuse before its index/FK.
        const second = await start(() => outcome(create(runtime())));
        expect(second).toMatchObject({ ok: false, error: expect.stringContaining("diagnostic_source_user_insert_busy") });
        gate.release.resolve(undefined);
        expect((await first).ok).toBe(true);
      });
    } else {
      const results = await oppose("user.create", create, replacement);
      expect(results[0].ok).toBe(true);
      expect(results[1]).toMatchObject({ ok: false, error: expect.stringContaining("Sign-in Method is already held by another User") });
    }
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
  it.each(["left", "right"])("OTP reservation prepares before destination/IP locks, %s", async order => {
    const key = `otp-${order}`;
    const reserve = (client: PrismaService) => new PrismaOtpRequestRepository(client).reserve({ purpose: "sign-in", destination: signInCodeDestination({ phone: suite.phone(key) }), userId: id(key, "staff"), codeHash: randomUUID(), ip: `synthetic-${key}` }, { now: () => new Date() });
    const results = await oppose("otp-destination", reserve, reserve);
    expect(results[0].ok).toBe(true); expect(results[1].ok).toBe(false);
    expect(await db.otpRequest.count({ where: { channel: "phone", destination: suite.phone(key) } })).toBe(1);
  });
  it("actual logout and enrollment deletion complete their exact FK cascades", async () => {
    const key = "cascade-left";
    const foreignRequest = await db.diagnosticContinuityRequest.findUniqueOrThrow({ where: { id: suite.id("foreign-request") } });
    const manager = await db.session.findUniqueOrThrow({ where: { id: id(key, "manager-session") } });
    await sessions(runtime()).delete(id(key, "session"));
    expect(await db.diagnosticContinuityRequest.findUnique({ where: { id: suite.id("owned-request") } })).toBeNull();
    expect(await db.diagnosticContinuityRequest.findUniqueOrThrow({ where: { id: foreignRequest.id } })).toEqual(foreignRequest);
    expect(await db.session.findUniqueOrThrow({ where: { id: manager.id } })).toEqual(manager);
    await totp(runtime()).deleteByUserId(id(key, "staff"));
    expect(await db.totpEnrollment.findUnique({ where: { id: id(key, "enrollment") } })).toBeNull();
    expect(await db.totpBackupCode.findUnique({ where: { id: id(key, "backup") } })).toBeNull();
  });
  it("real staff no-ops emit no audit, while revoke and regrant each audit once", async () => {
    const key = "noop-left"; const repo = new PrismaStaffAuthority(runtime());
    await repo.change(manage(key, true), at);
    expect(await db.auditLog.count({ where: { targetId: id(key, "staff") } })).toBe(0);
    await repo.change(manage(key, false), at); await repo.change(manage(key, false), at);
    expect(await db.auditLog.count({ where: { targetId: id(key, "staff") } })).toBe(1);
    await repo.change(manage(key, true), at);
    const audits = await db.auditLog.findMany({ where: { targetId: id(key, "staff") } });
    expect(audits.map(row => row.action).sort()).toEqual(["STAFF_CAPABILITY_GRANTED", "STAFF_CAPABILITY_REVOKED"]);
    expect(await db.diagnosticSourceCommand.count()).toBe(0);
  });
  it("expired pruning rechecks the selector and retains new and foreign live Sessions", async () => {
    const key = "expired-left"; const repo = sessions(runtime());
    expect(await repo.rotateRefreshToken(id(key, "session"), oldHash, "expired", at, expired)).toBe(true);
    const live = await repo.create({ userId: id(key, "staff"), refreshTokenHash: "live", deviceLabel: null, userAgent: null, expiresAt: end });
    const foreign = await db.session.findUniqueOrThrow({ where: { id: id(key, "manager-session") } });
    expect(await repo.deleteExpiredByUserId(id(key, "staff"))).toBe(1);
    expect(await repo.findById(id(key, "session"))).toBeNull();
    expect(await repo.findById(live.id)).not.toBeNull();
    expect(await db.session.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
  });
  it("rollback after successful real caller work leaves no grant, audit, code burn or elevation", async () => {
    const key = "backup-left"; const subject = elevation(key);
    const beforeSession = await db.session.findUniqueOrThrow({ where: { id: subject.sessionId } });
    const beforeGrant = await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: subject.userId, capability: "diagnostics.technician" } } });
    const audits = await db.auditLog.count({ where: { targetId: subject.userId } });
    await expect(new PrismaStaffAuthority(runtime(undefined, true)).change(manage(key, false), at)).rejects.toThrow("identity caller rollback sentinel");
    expect(await db.staffGrant.findUniqueOrThrow({ where: { userId_capability: { userId: subject.userId, capability: "diagnostics.technician" } } })).toEqual(beforeGrant);
    expect(await db.auditLog.count({ where: { targetId: subject.userId } })).toBe(audits);
    expect(await db.session.findUniqueOrThrow({ where: { id: subject.sessionId } })).toEqual(beforeSession);
    const unusedKey = "destination-right"; const unused = elevation(unusedKey);
    await expect(totp(runtime(undefined, true)).consumeBackupCodeAndElevate({ ...unused, usedAt: at, codeHash: "one-use" })).rejects.toThrow("identity caller rollback sentinel");
    expect((await db.totpBackupCode.findUniqueOrThrow({ where: { id: id(unusedKey, "backup") } })).usedAt).toBeNull();
    expect((await db.session.findUniqueOrThrow({ where: { id: unused.sessionId } })).adminTotpExpiresAt).toBeNull();
  });
  it.each(["missing", "foreign", "expired", "inactive"])("refused %s Session does not verify enrollment or create backup codes", async kind => {
    const key = "revoke-right"; const subject = elevation(key);
    // Make a fresh lawful pending enrollment through the actual ordinary caller.
    const other = id(key, "other"); const enrollment = await totp(runtime()).createPending(other, "synthetic");
    const good = await sessions(runtime()).create({ userId: other, refreshTokenHash: "unused", deviceLabel: null, userAgent: null, expiresAt: end });
    await new PrismaStaffAuthority(runtime()).change({ ...manage(key, kind !== "inactive"), targetUserId: other }, at);
    const sessionId = kind === "missing" ? randomUUID() : kind === "foreign" ? subject.sessionId : good.id;
    if (kind === "expired") await sessions(runtime()).rotateRefreshToken(good.id, "unused", "expired", at, expired);
    await expect(totp(runtime()).completeFirstVerification({ userId: other, enrollmentId: enrollment.id, sessionId, verifiedAt: at, codeHashes: [randomUUID()], adminTotpExpiresAt: end })).rejects.toThrow("SESSION_NOT_FOUND");
    expect((await db.totpEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).verifiedAt).toBeNull();
    expect(await db.totpBackupCode.count({ where: { totpEnrollmentId: enrollment.id } })).toBe(0);
    expect((await db.session.findUniqueOrThrow({ where: { id: good.id } })).adminTotpExpiresAt).toBeNull();
  });
});
