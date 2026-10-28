// Run only inside the parent-reserved task-local runtime interval.
// From repo root, after sequential builds and task-owned service provisioning:
// DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL=... node .../bootstrapOwnershipExpiryFixture.mjs serve CONFIG.json
// Stop this exact process after evidence collection, then run the same command with cleanup.
// CONFIG contains evidenceDir and resourceIdentity {composeProject,ports}; no ownership rows.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve, relative } from "node:path";

const dependency = "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
const [mode, input] = process.argv.slice(2);
if (!["serve", "cleanup"].includes(mode) || !input) throw new Error("Explicit serve/cleanup and task config required");
const config = JSON.parse(await readFile(input, "utf8"));
const ownerUrl = process.env.DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL;
const address = new URL(ownerUrl ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
const minio = new URL(process.env.MINIO_ENDPOINT ?? "");
if ([address, redis, minio].some(url => url.hostname !== "127.0.0.1") ||
  [address.port, redis.port, minio.port].some(port => !port || ["5432", "6379", "9000"].includes(port)) ||
  !config.resourceIdentity?.composeProject?.startsWith("auto_tm_ci_897_r6c_") ||
  !config.evidenceDir?.startsWith("/tmp/897-r6c-") ||
  config.resourceIdentity.ports?.postgres !== Number(address.port) ||
  config.resourceIdentity.ports?.redis !== Number(redis.port) ||
  config.resourceIdentity.ports?.minio !== Number(minio.port)) throw new Error("Exact disposable resource identity required");
const root = resolve(config.evidenceDir), privatePath = join(root, "producer-config.private.json");
await mkdir(root, { recursive: true });
const apiRequire = createRequire(resolve("apps/api/package.json"));
apiRequire("reflect-metadata");
const { PrismaService } = apiRequire("@auto-tm/db");
const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = ownerUrl;
const owner = new PrismaService();
process.env.DATABASE_URL = previousUrl;
const quote = name => `"${name.replaceAll('"', '""')}"`;
const hash = value => createHash("sha256").update(value).digest("hex");
const snapshot = () => owner.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS mode,
  t.tgfoid::regprocedure::text AS function,t.tgtype::int AS type,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`);
const apps = [];
try {
  await owner.$connect();
  if (mode === "cleanup") {
    const state = JSON.parse(await readFile(join(root, "bootstrap-state.private.json"), "utf8"));
    if (state.ownerAddress !== `${address.host}${address.pathname}` || state.project !== config.resourceIdentity.composeProject) throw new Error("Cleanup identity mismatch");
    // Restoration precedes task-container destruction. Never disable a trigger
    // to make a source write pass. No source rows are deleted through this tool.
    await owner.$transaction(async tx => {
      for (const trigger of state.triggers) {
        const action = { D: "DISABLE", O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" }[trigger.mode];
        if (!action) throw new Error("Unknown trigger mode");
        await tx.$executeRawUnsafe(`ALTER TABLE public.${quote(trigger.table)} ${action} TRIGGER ${quote(trigger.name)}`);
      }
    });
    if (JSON.stringify(await snapshot()) !== JSON.stringify(state.triggers)) throw new Error("Trigger restoration mismatch");
    const receipts = await owner.$queryRawUnsafe("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
    if (receipts.some(row => row.source || row.campaign)) throw new Error("Preserve unfinished receipts and failure state");
    for (const role of state.roles) {
      const exists = await owner.$queryRawUnsafe("SELECT 1 FROM pg_roles WHERE rolname=$1", role);
      if (!exists.length) continue;
      const [active] = await owner.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1", role);
      if (active.n) throw new Error(`Close exact API/worker/readback connections before dropping ${role}`);
      await owner.$executeRawUnsafe(`DROP OWNED BY ${quote(role)}`);
      await owner.$executeRawUnsafe(`DROP ROLE ${quote(role)}`);
    }
    await writeFile(join(root, "bootstrap-restoration.json"), JSON.stringify({ dependency, receipts, triggersRestored: true,
      rolesRemoved: state.roles, resourceIdentity: config.resourceIdentity, remaining: "Destroy only recorded task Compose project with volumes after retaining evidence. Storage and fixture rows are contained there." }, null, 2), { flag: "wx" });
  } else {
    const migrations = await owner.$queryRawUnsafe("SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name");
    if (migrations.length !== 98 || !migrations.at(-1).migration_name.startsWith("20261026016000") || migrations.at(-1).checksum !== "87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1") throw new Error("Published160/98 required");
    // Empty task DB prevents global due queues or Session expiry contaminating cleanup.
    if (await owner.user.count() || await owner.inspectionOrder.count()) throw new Error("Preserve nonempty database; use a fresh task-owned database");
    const triggers = await snapshot();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const roles = ["api", "worker", "readback"].map(kind => `r6c_ownership_${kind}_${suffix}`);
    const passwords = roles.map(() => randomUUID());
    const state = { dependency, ownerAddress: `${address.host}${address.pathname}`, project: config.resourceIdentity.composeProject, roles, triggers };
    await writeFile(join(root, "bootstrap-state.private.json"), JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
    // Same restricted nonowner lane as accepted worker fixtures. DML privileges
    // grant no guard exemption; all diagnostic mutations below use production callers.
    for (let i = 0; i < roles.length; i += 1) {
      await owner.$executeRawUnsafe(`CREATE ROLE ${quote(roles[i])} LOGIN PASSWORD '${passwords[i]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${quote(roles[i])}`);
      await owner.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quote(roles[i])}`);
      if (i !== 2) {
        await owner.$executeRawUnsafe(`GRANT INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${quote(roles[i])}`);
        await owner.$executeRawUnsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quote(roles[i])}`);
      }
    }
    const urls = roles.map((role, i) => { const url = new URL(ownerUrl); url.username = role; url.password = passwords[i]; return url.toString(); });
    const end = new Date(Date.now() + 3600_000), localized = { tk: "Syntetik", ru: "Синтетический", en: "Synthetic" };
    const people = {}, visits = [];
    const brandId = randomUUID(), modelId = randomUUID(), regionId = randomUUID(), cityId = randomUUID();
    const names = { nameTk: "Synthetic", nameRu: "Synthetic", nameEn: "Synthetic" };
    await owner.brand.create({ data: { id: brandId, slug: brandId, ...names } });
    await owner.model.create({ data: { id: modelId, brandId, slug: modelId, ...names } });
    await owner.region.create({ data: { id: regionId, slug: regionId, ...names } });
    await owner.city.create({ data: { id: cityId, regionId, slug: cityId, ...names } });
    const vin = "SYN-OWNERSHIP";
    // Explicit actor roots expand their retained inventories. Isolate visits at
    // that boundary, not merely at Listing IDs. The comparison pair shares its
    // original actors and center so both current staff assignments remain real.
    // Only cross-context prerequisites are written here, never Orders or grants.
    for (let index = 0; index < 102; index += 1) {
      const group = {};
      if (index === 1) Object.assign(group, visits[0].people);
      else for (const who of ["commissioner", "reception", "technician", "reviewer"]) {
        const userId = randomUUID(), sessionId = randomUUID();
        const phone = `+9936${String(index * 4 + Object.keys(group).length).padStart(7, "0")}`;
        await owner.user.create({ data: { id: userId, phone, phoneVerifiedAt: new Date() } });
        await owner.session.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID(), expiresAt: end, adminTotpExpiresAt: end } });
        group[who] = { userId, sessionId };
      }
      const centerId = index === 1 ? visits[0].centerId : randomUUID(), listingId = randomUUID();
      await owner.listing.create({ data: { id: listingId, sellerId: group.commissioner.userId, brandId, modelId, cityId, vin,
        status: "active", priceAmount: 100000, priceTmt: 100000, priceCurrency: "TMT" } });
      if (index !== 1) {
        await owner.diagnosticCenter.create({ data: { id: centerId, code: centerId, names: localized } });
        for (const [who, capability] of [["reception", "diagnostics.reception"], ["reception", "diagnostics.templates"], ["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]]) {
          await owner.staffGrant.create({ data: { userId: group[who].userId, capability } });
          await owner.diagnosticCenterAssignment.create({ data: { centerId, userId: group[who].userId, capability, qualifiedUntil: end } });
        }
      }
      if (index === 0) Object.assign(people, group);
      visits.push({ people: group, centerId, listingId });
    }
    const allPeople = [...new Map(visits.flatMap(visit => Object.values(visit.people)).map(person => [person.userId, person])).values()];
    await owner.$transaction(async tx => {
      for (const t of triggers.filter(t => t.name.startsWith("diagnostic_source_") || t.name.startsWith("zz_diagnostic_source_") || t.name.startsWith("zzzz_campaign_preparation"))) {
        await tx.$executeRawUnsafe(`ALTER TABLE public.${quote(t.table)} ENABLE TRIGGER ${quote(t.name)}`);
      }
    });
    const [ready] = await owner.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
    if (!ready.source || !ready.campaign) throw new Error("Matched readiness required");
    process.env.DATABASE_URL = urls[0];
    const { ConfigModule, ConfigService } = apiRequire("@nestjs/config"), { Reflector } = apiRequire("@nestjs/core");
    const { EventEmitterModule } = apiRequire("@nestjs/event-emitter"), { BullModule } = apiRequire("@nestjs/bullmq");
    const { JwtModule, JwtService } = apiRequire("@nestjs/jwt"), { FastifyAdapter } = apiRequire("@nestjs/platform-fastify");
    const { Test } = apiRequire("@nestjs/testing");
    const load = path => apiRequire(resolve(`apps/api/dist/src/${path}.js`));
    const { DiagnosticsModule } = load("modules/diagnostics/diagnostics.module");
    const { JwtAuthGuard } = load("common/jwt-auth.guard"), { GlobalErrorFilter } = load("common/error.filter");
    const { S3Client, CreateBucketCommand } = apiRequire("@aws-sdk/client-s3");
    const s3 = new S3Client({ endpoint: minio.toString(), region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin", secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin" } });
    try { await s3.send(new CreateBucketCommand({ Bucket: "diagnostic-test-private" }), { abortSignal: AbortSignal.timeout(5000) }); }
    finally { s3.destroy(); }
    const { DIAGNOSTIC_RUNTIME } = load("modules/diagnostics/domain/ports/DiagnosticIntakePort");
    const environment = Object.freeze({ ...process.env });
    const instances = [], configs = [];
    for (let cohort = 0; cohort < 5; cohort += 1) {
      const members = visits.filter((_, index) => Math.floor(Math.max(0, index - 1) / 25) === cohort);
      const principals = [...new Map(members.flatMap(visit => Object.values(visit.people)).map(person => [person.userId, person])).values()];
      if (!principals.length || principals.length > 100) throw new Error("Invalid bounded API cohort");
      const userIds = Object.freeze(principals.map(person => person.userId));
      const fixed = Object.freeze({ ...environment, DIAGNOSTIC_PRIVATE_BUCKET: "diagnostic-test-private", APP_ENV: "test",
        DIAGNOSTIC_SYNTHETIC_ENABLED: true, DIAGNOSTIC_SYNTHETIC_PUBLIC_ENABLED: true, DIAGNOSTIC_SYNTHETIC_USER_IDS: userIds });
      const testing = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true,
        ignoreEnvVars: true, skipProcessEnv: true, load: [() => fixed] }), EventEmitterModule.forRoot(),
        BullModule.forRoot({ connection: { url: redis.toString() } }), DiagnosticsModule,
        JwtModule.register({ global: true, secret: randomUUID() })] }).compile();
      const app = testing.createNestApplication(new FastifyAdapter()); apps.push(app);
      const injected = app.get(ConfigService), runtime = app.get(DIAGNOSTIC_RUNTIME);
      if (configs.includes(injected) || JSON.stringify(injected.get("DIAGNOSTIC_SYNTHETIC_USER_IDS")) !== JSON.stringify(userIds) ||
        allPeople.some(person => runtime.syntheticAllowed(person) !== userIds.includes(person.userId))) throw new Error("API cohort configuration bleed");
      configs.push(injected);
      const jwt = app.get(JwtService);
      app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector), jwt)); app.useGlobalFilters(new GlobalErrorFilter());
      await app.listen(0, "127.0.0.1");
      const apiUrl = await app.getUrl();
      for (const p of principals) p.token = jwt.sign({ sub: p.userId, sid: p.sessionId, role: "buyer" }, { expiresIn: "1h" });
      for (const visit of members) visit.apiUrl = apiUrl;
      instances.push({ cohort, apiUrl, userIds, configServiceDistinct: true, ownPrincipalsAccepted: true,
        foreignPrincipalsRejected: allPeople.length - principals.length, ignoreEnvVars: true, skipProcessEnv: true });
    }
    // Check every instance again after all compositions: later modules must not
    // mutate an earlier app's injected allowlist or runtime admission snapshot.
    for (const [index, app] of apps.entries()) {
      const ids = instances[index].userIds;
      if (JSON.stringify(app.get(ConfigService).get("DIAGNOSTIC_SYNTHETIC_USER_IDS")) !== JSON.stringify(ids) ||
        allPeople.some(person => app.get(DIAGNOSTIC_RUNTIME).syntheticAllowed(person) !== ids.includes(person.userId))) throw new Error("Later API cohort changed earlier admission");
    }
    await writeFile(join(root, "api-cohorts.json"), JSON.stringify({ apiPid: process.pid, immutableEnvironmentSnapshot: true, instances,
      recheckedAfterAllCompositions: true }, null, 2), { flag: "wx" });
    const apiUrl = visits[0].apiUrl;
    const templateRoutes = [];
    for (const [index, visit] of visits.entries()) {
      if (index === 1) { visit.templateId = visits[0].templateId; continue; }
      const response = await fetch(`${visit.apiUrl}/api/v1/diagnostics/centers/${visit.centerId}/templates`, { method: "POST",
        headers: { authorization: `Bearer ${visit.people.reception.token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ expectedVersion: 0, synthetic: true, definition: { title: localized, limitations: localized, syntheticNotice: localized,
          checks: [{ id: "brakes", label: localized, required: true, evidenceRequired: false, measurement: null }], panels: [] } }) });
      const body = await response.text();
      templateRoutes.push({ index, status: response.status, body });
      await writeFile(join(root, "template-route.json"), JSON.stringify(templateRoutes, null, 2));
      if (response.status !== 201) throw new Error("Ordinary template route refused");
      visit.templateId = JSON.parse(body).id;
    }
    const { centerId, templateId } = visits[0], listingIds = visits.map(visit => visit.listingId);
    const sourceAndLoadedFiles = [];
    for (const module of ["DiagnosticOwnershipGrants", "DiagnosticOwnershipCapture", "PrismaDiagnosticIntake", "PrismaDiagnosticContinuityProofs"]) {
      for (const path of [`apps/api/src/modules/diagnostics/infrastructure/${module}.ts`, `apps/api/dist/src/modules/diagnostics/infrastructure/${module}.js`]) {
        sourceAndLoadedFiles.push({ path, sha256: hash(await readFile(path)) });
      }
    }
    // Pin every workspace artifact actually loaded by this API composition,
    // including DB/contracts; caller source pins are recorded separately above.
    const loadedFiles = [];
    for (const path of Object.keys(apiRequire.cache).sort()) {
      const local = relative(process.cwd(), path);
      if (!local.startsWith("../") && !local.includes("node_modules/") && /^(apps|packages)\//.test(local)) {
        loadedFiles.push({ path: local, sha256: hash(await readFile(path)) });
      }
    }
    const bootstrapReceipt = join(root, "bootstrap.json");
    const resourceIdentity = { ...config.resourceIdentity, apiPid: process.pid, apiUrl, apiUrls: instances.map(instance => instance.apiUrl), bootstrapReceipt };
    await writeFile(bootstrapReceipt, JSON.stringify({ dependency, migrations, resourceIdentity, roles, people: Object.fromEntries(Object.entries(people).map(([who, p]) => [who, { userId: p.userId, sessionId: p.sessionId }])),
      centerId, listingIds, templateId, vin, visits: visits.map(({ people: group, ...visit }) => ({ ...visit, people: Object.fromEntries(Object.entries(group).map(([who, person]) => [who, { userId: person.userId, sessionId: person.sessionId }])) })), sourceAndLoadedFiles, loadedFiles, readiness: ready, clocks: "real advancing wall clock", commands: "Production template route; cross-context prerequisite writes listed in bootstrap source", cleanup: "Stop this process; run cleanup mode; destroy exact recorded task Compose project with volumes" }, null, 2), { flag: "wx" });
    await writeFile(privatePath, JSON.stringify({ dependency, evidenceDir: root, resourceIdentity, apiUrl, centerId, templateId, listingIds, vin, people, visits, sourceAndLoadedFiles }, null, 2), { mode: 0o600, flag: "wx" });
    await writeFile(join(root, "caller-env.private.json"), JSON.stringify({ apiDatabaseUrl: urls[0], workerDatabaseUrl: urls[1], producerDatabaseUrl: urls[2], producerConfig: privatePath }, null, 2), { mode: 0o600, flag: "wx" });
    // No polling or fabricated delay. Parent runs producer/test in this reserved
    // interval, then sends this exact process SIGTERM for graceful closure.
    await new Promise(resolve => { process.once("SIGTERM", resolve); process.once("SIGINT", resolve); });
  }
} catch (error) {
  await writeFile(join(root, `bootstrap-first-failure-${Date.now()}.json`), JSON.stringify({ dependency, mode, message: String(error), stack: error?.stack }, null, 2), { flag: "wx" });
  throw error;
} finally {
  for (const app of apps) await app.close();
  await owner.onModuleDestroy();
}
