import { randomUUID } from "node:crypto";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { expect, inject } from "vitest";
import { workerUrls } from "../../../../../test/helpers/testDatabases";

/** Disposable-only lifecycle shared by the two direct claim suites. Guard state
 * is restored exactly, including DISABLE, ALWAYS and REPLICA modes. */
export function claimPostgresFixture(seed: string, prefix: string, catalog = false) {
  const admin = new PrismaService();
  let prisma: PrismaService;
  const role = `r7c_${randomUUID().replaceAll("-", "")}`;
  let roleCreated = false;
  let disposable = false;
  let guardState: { table: string; name: string; enabled: string }[] = [];
  async function guards(mode?: "DISABLE" | "ENABLE") {
    for (const row of guardState) {
      const table = row.table.replaceAll('"', '""'), name = row.name.replaceAll('"', '""');
      const action = mode ?? (row.enabled === "D" ? "DISABLE" : row.enabled === "A" ? "ENABLE ALWAYS" : row.enabled === "R" ? "ENABLE REPLICA" : "ENABLE");
      await admin.$executeRawUnsafe(`ALTER TABLE public."${table}" ${action} TRIGGER "${name}"`);
    }
  }
  return {
    async start() {
      const [database] = await admin.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      const configured = inject("apiTestDatabases");
      const worker = configured ? new URL(workerUrls(configured, Number(process.env["VITEST_POOL_ID"])).databaseUrl).pathname.slice(1) : undefined;
      if (!database || !(database.name === worker || /^r7c_[a-z0-9_]+$/.test(database.name))) throw new Error("r7c_disposable_database_required");
      disposable = true;
      guardState = await admin.$queryRaw<typeof guardState>`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate') ORDER BY c.relname,t.tgname`;
      expect(guardState.length).toBeGreaterThan(0);
      await guards("DISABLE");
      await admin.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      roleCreated = true;
      await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await admin.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await admin.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      await admin.$executeRawUnsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${role}"`);
      await admin.$executeRawUnsafe(seed);
      await guards("ENABLE");
      prisma = new Proxy(admin, { get(target, property) {
        if (property === "$transaction") return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: Parameters<PrismaService["$transaction"]>[1]) => target.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          const [actual] = await tx.$queryRaw<{ name: string; superuser: boolean; owns: boolean }[]>`SELECT current_user AS name,r.rolsuper AS superuser,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_roles r JOIN pg_class c ON c.oid='public.media_uploads'::regclass WHERE r.rolname=current_user`;
          expect(actual).toEqual({ name: role, superuser: false, owns: false });
          return work(tx);
        }, options);
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return prisma;
    },
    async stop() {
      if (!disposable) { await admin.onModuleDestroy(); return; }
      try {
        await guards("DISABLE");
        await admin.user.updateMany({ where: { id: { startsWith: prefix } }, data: { avatarKey: null, avatarUploadId: null } });
        await admin.listing.deleteMany({ where: { id: { startsWith: prefix } } });
        await admin.mediaUploadCleanup.deleteMany({ where: { uploadId: { startsWith: prefix } } });
        await admin.mediaUpload.deleteMany({ where: { id: { startsWith: prefix } } });
        await admin.user.deleteMany({ where: { id: { startsWith: prefix } } });
        if (catalog) await admin.city.deleteMany({ where: { id: "r7c-existing-city" } });
        if (catalog) await admin.region.deleteMany({ where: { id: "r7c-existing-region" } });
        if (catalog) await admin.model.deleteMany({ where: { id: "r7c-existing-model" } });
        if (catalog) await admin.brand.deleteMany({ where: { id: "r7c-existing-brand" } });
      } finally {
        try {
          await guards();
          const restored = await admin.$queryRaw<typeof guardState>`SELECT c.relname AS table,t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (t.tgname LIKE 'zz_diagnostic_source_%' OR t.tgname LIKE 'zzzz_campaign_preparation%' OR t.tgname='diagnostic_source_no_truncate') ORDER BY c.relname,t.tgname`;
          if (roleCreated) { await admin.$executeRawUnsafe(`DROP OWNED BY "${role}"`); await admin.$executeRawUnsafe(`DROP ROLE "${role}"`); }
          expect(restored).toEqual(guardState);
        } finally { await admin.onModuleDestroy(); }
      }
    },
  };
}
