import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PrismaService, type Prisma } from "@auto-tm/db";
import type { MeasurementSchemas } from "@auto-tm/contracts";

export function retentionSignal() {
 let release!: () => void;
 const promise = new Promise<void>(done => { release = done; });
 return { promise, release };
}

interface Store {
 rotateRestoreEpoch(epoch: string): Promise<void>;
 bootstrap(input: { authenticatedUserId?: string; guestCapability?: string; visitId?: string }): Promise<{ visitId: string; generation: string; guestCapability?: string } | null>;
 eraseGuest(capability: string): Promise<void>;
}

/** Loads the actual API store only in the authored PostgreSQL suites. The
 * worker has no production dependency on API internals. */
export async function retentionStore(db: PrismaService, epoch: string, now: Date): Promise<Store> {
 const path = resolve(__dirname, "../../../../../api/src/modules/measurement/infrastructure/PrismaMeasurementStore.ts");
 const module = await import(/* @vite-ignore */ path) as { PrismaMeasurementStore: new (db: PrismaService, config: object, now: () => Date) => Store };
 return new module.PrismaMeasurementStore(db, { epoch, environment: "test", population: "synthetic" }, () => now);
}

/** Fixture-only database instrumentation: every statement still executes on
 * real PostgreSQL. A barrier can pause AFTER the actual production lock/write.
 * No source command, lock result, completion result or SQL effect is replaced. */
export function retentionConnection(db: PrismaService, name: string, after: (sql: string, tx: Prisma.TransactionClient) => Promise<void> = async () => undefined): PrismaService {
 return new Proxy(db, {
  get(target, property) {
   if (property !== "$transaction") {
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
   }
   return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout?: number; maxWait?: number }) => target.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('application_name', ${name}, true)`;
    const observed = new Proxy(tx, {
     get(transaction, key) {
      const value: unknown = Reflect.get(transaction, key);
      if (key === "$queryRaw" || key === "$executeRaw") {
       return (parts: TemplateStringsArray, ...values: unknown[]) => {
        const query = Reflect.apply(value as (...args: unknown[]) => unknown, transaction, [parts, ...values]) as Promise<unknown>;
        let executed: Promise<unknown> | undefined;
        // Preserve PrismaPromise laziness. Purge constructs its write array
        // before awaiting it; an eager async wrapper would reorder that work.
        const execute = () => executed ??= query.then(async result => { await after(parts.join("?"), tx); return result; });
        return new Proxy(query, {
         get(promise, member) {
          if (member === "then" || member === "catch" || member === "finally") {
           return (...args: unknown[]) => Reflect.apply(Reflect.get(execute(), member) as (...args: unknown[]) => unknown, execute(), args);
          }
          return Reflect.get(promise, member);
         },
        });
       };
      }
      return typeof value === "function" ? value.bind(transaction) : value;
     },
    });
    return work(observed);
   }, options);
  },
 });
}

export class MeasurementRetentionPostgresFixture {
 readonly db = new PrismaService();
 readonly epoch = randomUUID();
 readonly nextEpoch = randomUUID();
 readonly user = randomUUID();
 readonly foreignUser = randomUUID();
 readonly auditIds: string[] = [];
 readonly tasks: Promise<unknown>[] = [];
 readonly releases: (() => void)[] = [];
 private triggers: { table: string; name: string; enabled: string }[] = [];
 private disposable = false;

 async open() {
  const url = process.env["DATABASE_URL"] ?? "";
  if (process.env["AUTO_TM_TEST_DATABASES"] === "off" || process.env["GITHUB_ACTIONS"] !== "true" ||
      !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\/[^?]*_worker[a-f0-9]+_w[1-4](?:\?|$)/.test(url)) {
   throw new Error("Measurement retention scenarios require the hosted isolated disposable worker database; no skipped outline");
  }
  this.disposable = true;
  const namespaces = await this.db.$queryRaw<{ name: string }[]>`SELECT nspname AS name FROM pg_namespace WHERE nspname ~ '^cf_[a-f0-9]{32}$'`;
  if (namespaces.length) throw new Error("Retention fixture must not share a campaign namespace");
  this.triggers = await this.db.$queryRaw<typeof this.triggers>`SELECT c.relname AS table, t.tgname AS name, t.tgenabled::text AS enabled
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate')`;
  // Setup/cleanup DDL belongs only to this disposable fixture, never a runtime role.
  await this.guards(false);
  if (await this.db.measurementPrincipal.count() || await this.db.measurementInvestigationExport.count() || await this.db.measurementRollup.count()) {
   throw new Error("Retention fixture requires an empty collector graph, refusing to erase another suite's data");
  }
  await (await retentionStore(this.db, this.epoch, this.now)).rotateRestoreEpoch(this.epoch);
  await this.db.user.createMany({ data: [{ id: this.user, displayName: "Synthetic due account" }, { id: this.foreignUser, displayName: "Synthetic foreign account" }] });
 }

 constructor(readonly now: Date) {}

 async guards(enabled: boolean) {
  for (const trigger of this.triggers) {
   if (!/^[a-z0-9_]+$/.test(trigger.table) || !/^[a-z0-9_]+$/.test(trigger.name)) throw new Error("Unsafe fixture trigger identifier");
   await this.db.$executeRawUnsafe(`ALTER TABLE public."${trigger.table}" ${enabled ? "ENABLE" : "DISABLE"} TRIGGER "${trigger.name}"`);
  }
  if (enabled) {
   const [ready] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT diagnostic_source_guards_ready() AS ready`;
   if (!ready?.ready) throw new Error("Full prepared-source guards are not ready in the disposable fixture");
  }
 }

 async account(userId = this.user, at = this.now) {
  const boot = await (await retentionStore(this.db, this.epoch, at)).bootstrap({ authenticatedUserId: userId });
  if (!boot) throw new Error("Actual authenticated bootstrap refused the fixture");
  const principal = await this.db.measurementPrincipal.findUniqueOrThrow({ where: { userId } });
  return { principal, visit: boot.visitId };
 }

 async guest(at = this.now) {
  const boot = await (await retentionStore(this.db, this.epoch, at)).bootstrap({});
  if (!boot?.guestCapability) throw new Error("Actual guest bootstrap refused the fixture");
  const principal = await this.db.measurementPrincipal.findUniqueOrThrow({ where: { generation: boot.generation } });
  return { principal, visit: boot.visitId, capability: boot.guestCapability };
 }

 event(): MeasurementSchemas.MeasurementEvent {
  return { version: 1, eventId: randomUUID(), occurredAt: this.now.toISOString(), purpose: "product_improvement", eventName: "listing_published",
   context: { platform: "server", release: "server", build: "synthetic", locale: "en" }, payload: { listingId: randomUUID(), cityId: randomUUID() } };
 }

 async raw(principalId: string, visitId: string | null, expiresAt = this.now) {
  const visit = visitId ? await this.db.measurementVisit.findUniqueOrThrow({ where: { id: visitId } }) : null;
  const occurredAt = visit?.startedAt ?? new Date(expiresAt.getTime() - 90 * 86400000);
  const id = randomUUID();
  const event = visit ? { version: 1, eventId: id, visitId, occurredAt: occurredAt.toISOString(), purpose: "product_improvement", eventName: "listing_detail_opened",
   context: { platform: "android", release: "synthetic", build: "synthetic", locale: "en" }, payload: { listingId: randomUUID() } }
   : { ...this.event(), eventId: id, occurredAt: occurredAt.toISOString() };
  return this.db.measurementRecord.create({ data: { id, principalId, visitId, event, origin: visit ? "client" : "server", environment: "test", population: "synthetic",
   occurredAt, receivedAt: this.now, expiresAt } });
 }

 async outbox(principalId: string, expiresAt = this.now) {
  const principal = await this.db.measurementPrincipal.findUniqueOrThrow({ where: { id: principalId } });
  return this.db.measurementOutbox.create({ data: { id: randomUUID(), principalId, generation: principal.generation, epoch: principal.epoch,
   environment: "test", population: "synthetic", event: this.event(), expiresAt } });
 }

 start<T>(work: Promise<T>): Promise<T> {
  // Attach rejection handling immediately, including when an assertion fails before await.
  this.tasks.push(work); void work.catch(() => undefined); return work;
 }

 gate() {
  const gate = retentionSignal(); this.releases.push(gate.release); return gate;
 }

 async reached(gate: ReturnType<typeof retentionSignal>, task: Promise<unknown>) {
  await Promise.race([gate.promise, task.then(() => { throw new Error("Production caller finished before its expected lock barrier"); })]);
 }

 async blocked(waiter: string, holder: string) {
  const deadline = performance.now() + 300;
  while (performance.now() < deadline) {
   const [row] = await this.db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (
    SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(w.pid))
    WHERE w.application_name=${waiter} AND h.application_name=${holder} AND w.wait_event_type='Lock'
   ) AS blocked`;
   if (row?.blocked) return;
   await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Expected PostgreSQL lock wait ${waiter} -> ${holder}`);
 }

 async close() {
  for (const release of this.releases) release();
  await Promise.allSettled(this.tasks);
  if (!this.disposable) { await this.db.onModuleDestroy(); return; }
  try {
   await this.guards(false);
   await this.db.measurementPrincipal.deleteMany({ where: { epoch: this.epoch } });
   await this.db.measurementRollup.deleteMany({ where: { epoch: this.epoch } });
   await this.db.measurementInvestigationExport.deleteMany({ where: { epoch: this.epoch } });
   await this.db.auditLog.deleteMany({ where: { id: { in: this.auditIds } } });
   await this.db.user.deleteMany({ where: { id: { in: [this.user, this.foreignUser] } } });
   await this.db.measurementState.deleteMany({ where: { key: "collector", epoch: { in: [this.epoch, this.nextEpoch] } } });
  } finally {
   try {
    for (const trigger of this.triggers) {
     const action = trigger.enabled === "D" ? "DISABLE" : trigger.enabled === "R" ? "ENABLE REPLICA" : trigger.enabled === "A" ? "ENABLE ALWAYS" : "ENABLE";
     await this.db.$executeRawUnsafe(`ALTER TABLE public."${trigger.table}" ${action} TRIGGER "${trigger.name}"`);
    }
   } finally { await this.db.onModuleDestroy(); }
  }
 }
}
