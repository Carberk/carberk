// Produce one isolated ordinary fixture for one DiagnosticWorkerOwnershipBatch
// selector. This file is deliberately a caller of the ordinary HTTP routes: it
// never inserts source rows, receipts, proofs, reports, or ownership records.
// Run only with a coordinator-owned private case config.
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";

const dependency = "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
const cases = new Set(["later-failure", "shared-multiple", "oldest-capacity", "overlimit", "worker-first-second-worker", "second-worker-first-worker", "worker-first-capture", "capture-first-worker", "worker-first-proof-use", "proof-use-first-worker"]);
const require = createRequire(resolve("apps/worker/package.json"));
const { PrismaService } = require("@auto-tm/db");
const hash = value => createHash("sha256").update(value).digest("hex");
const configPath = process.argv[2];
if (!configPath) throw new Error("Explicit private batch producer config required");
const config = JSON.parse(await readFile(configPath, "utf8"));
const name = config.case ?? config.caseName ?? config.selector;
if (!cases.has(name)) throw new Error("Unknown ownership batch selector");
const root = resolve(config.evidenceDir ?? `/tmp/897-r6c-a02r2-20261030/${name}`);
const workerUrl = config.workerUrl ?? config.workerDatabaseUrl ?? config.producerDatabaseUrl ?? config.databaseUrls?.worker ?? process.env.DATABASE_URL;
const ownerUrl = config.ownerUrl ?? config.readbackDatabaseUrl ?? config.databaseUrls?.owner ?? process.env.DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL;
const endpoint = new URL(config.apiUrl ?? "");
const dbUrl = new URL(workerUrl ?? "");
const ownerDbUrl = new URL(ownerUrl ?? "");
if (endpoint.hostname !== "127.0.0.1" || dbUrl.hostname !== "127.0.0.1" || ownerDbUrl.hostname !== "127.0.0.1" ||
  dbUrl.port === "5432" || ownerDbUrl.port === "5432" || dbUrl.port === "65379" || ownerDbUrl.port === "65379" ||
  !config.resourceIdentity?.composeProject?.startsWith("auto_tm_ci_897_r6c_") ||
  !config.sourceAndLoadedFiles?.length || !Array.isArray(config.visits) || config.visits.length < 102 ||
  config.dependency !== dependency || !config.migrationPin) throw new Error("Pinned task-local loopback config required");
if (dbUrl.pathname !== ownerDbUrl.pathname || dbUrl.port !== ownerDbUrl.port || !dbUrl.pathname.startsWith("/r6c_batch_")) throw new Error("Separate restricted database identity required");
if (dbUrl.username === ownerDbUrl.username || config.evidenceDir && !config.evidenceDir.startsWith("/tmp/897-r6c-a02r2-20261030/")) throw new Error("Distinct restricted caller and private evidence root required");
if (config.resourceIdentity.ports?.postgres && Number(dbUrl.port) !== Number(config.resourceIdentity.ports.postgres)) throw new Error("Database resource port mismatch");
for (const who of ["commissioner", "reception", "technician", "reviewer"]) {
  if (!config.people?.[who]?.token || !config.people[who].userId || !config.people[who].sessionId) throw new Error(`Missing ordinary principal ${who}`);
}
const requiredFiles = [
  "apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.ts",
  "apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.ts",
  "apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts",
  "apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts",
  "apps/api/dist/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.js",
  "apps/api/dist/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.js",
  "apps/api/dist/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.js",
  "apps/api/dist/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.js",
];
if (requiredFiles.some(path => !config.sourceAndLoadedFiles.some(file => file.path === path))) throw new Error("Exact source and compiled caller pins required");
const pinMigrations = async db => {
  const pin = config.migrationPin;
  if (!pin.manifestPath || !/^[0-9a-f]{64}$/.test(pin.manifestSha256 ?? "")) throw new Error("Exact migration manifest pin required");
  const manifest = await readFile(pin.manifestPath);
  if (hash(manifest) !== pin.manifestSha256) throw new Error("Migration manifest pin mismatch");
  const expected = JSON.parse(manifest).migrations;
  const disk = [], directory = resolve("packages/db/prisma/migrations");
  for (const entry of (await readdir(directory, { withFileTypes: true })).filter(item => item.isDirectory())) disk.push({ migration_name: entry.name, checksum: hash(await readFile(join(directory, entry.name, "migration.sql"))) });
  const sort = rows => rows.sort((a, b) => a.migration_name.localeCompare(b.migration_name));
  const applied = await db.$queryRawUnsafe("SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name");
  const [unfinished] = await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL");
  if (unfinished.n || JSON.stringify(sort(applied)) !== JSON.stringify(sort(expected)) || JSON.stringify(sort(disk)) !== JSON.stringify(sort(expected))) throw new Error("Current migration chain differs from pinned manifest");
  return applied;
};
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = workerUrl;
const db = new PrismaService();
if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
const commands = [], orderIds = [], keys = [];
const started = Date.now(), deadline = started + 120_000;
let cutoff;
const request = async (fixture, who, method, path, body, status = 201, binary = false) => {
  if (Date.now() >= deadline) throw new Error("Producer native120s setup deadline exceeded");
  const api = new URL(fixture.apiUrl ?? config.apiUrl);
  if (api.hostname !== "127.0.0.1") throw new Error("Task-loopback visit API required");
  const payload = binary ? body : body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(new URL(`/api/v1/diagnostics/${path}`, api), { method,
    headers: { authorization: `Bearer ${fixture.people[who].token}`, ...(payload === undefined ? {} : { "content-type": binary ? "application/octet-stream" : "application/json" }), ...(binary ? { "x-evidence-type": "image/png" } : {}) },
    body: payload, signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))) });
  const text = await response.text();
  commands.push({ at: new Date().toISOString(), apiUrl: api.toString(), who, method, path, body: binary ? { bytes: body.length, sha256: hash(body) } : body, status: response.status, responseSha256: hash(text) });
  if (response.status !== status) throw new Error(`Ordinary route refused ${method} ${path}: ${response.status}`);
  return text ? JSON.parse(text) : undefined;
};
const parallel = async (items, work) => {
  const result = new Array(items.length); let next = 0, stopped = false;
  const workers = Array.from({ length: Math.min(5, items.length) }, async () => { while (!stopped) { const index = next++; if (index >= items.length) return; try { result[index] = await work(items[index], index); } catch (error) { stopped = true; throw error; } } });
  const outcomes = await Promise.allSettled(workers); const failed = outcomes.find(item => item.status === "rejected"); if (failed) throw failed.reason; return result;
};
const rights = until => ({ category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison", basis: "SYNTHETIC source permission for task-owned generated visits", provenance: "Ordinary grant and classified observation routes", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: until.toISOString(), reason: "Declared fixture retention end" }, supplierRestrictions: "Synthetic service only", hold: null });
const fixtureFor = index => config.visits[index];
const orderFixtures = new Map();
const visit = async (fixture, index) => {
  let order = await request(fixture, "commissioner", "POST", "orders", { requestKey: randomUUID(), centerId: fixture.centerId, templateVersionId: fixture.templateId, audience: "listing_public", listingId: fixture.listingId, synthetic: true });
  orderFixtures.set(order.id, fixture); orderIds[index] = order.id;
  for (const [who, capability] of [["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]]) order = await request(fixture, "reception", "POST", `orders/${order.id}/assignments`, { expectedVersion: order.version, userId: fixture.people[who].userId, capability, active: true });
  for (const kind of ["physical", "publication"]) order = await request(fixture, "reception", "POST", `orders/${order.id}/authorization`, { expectedVersion: order.version, kind, authorityReference: `SYNTHETIC ${kind} permission` });
  for (const state of ["confirmed", "arrived"]) order = await request(fixture, "reception", "POST", `orders/${order.id}/appointment`, { expectedVersion: order.version, state });
  return order;
};
const capture = async (order, grantEnd, componentEnd) => {
  const fixture = orderFixtures.get(order.id); const grant = await request(fixture, "commissioner", "POST", `orders/${order.id}/ownership-grant`, { rights: rights(grantEnd) });
  order = await request(fixture, "technician", "POST", `orders/${order.id}/vehicle`, { expectedVersion: order.version, method: "vin", vin: config.vin, manualReference: null, observedAt: new Date().toISOString(), mileageKm: 123000, ownershipGrantId: grant.id, ownershipClassification: { rights: rights(componentEnd) } });
  const raw = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { orderVersion: "desc" } });
  const component = await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: raw.id } });
  if (component.state !== "available" || component.grantId !== grant.id || component.rightsUntil.getTime() !== componentEnd.getTime()) throw new Error("Ordinary capture did not bind exact declared rights");
  return { order, grant, raw, component };
};
const captureAgain = async captured => {
  const fixture = orderFixtures.get(captured.order.id);
  const order = await request(fixture, "technician", "POST", `orders/${captured.order.id}/vehicle`, { expectedVersion: captured.order.version, method: "vin", vin: config.vin, manualReference: null, observedAt: new Date().toISOString(), mileageKm: 123001, ownershipGrantId: captured.grant.id, ownershipClassification: { rights: captured.grant.rights } });
  const raw = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { orderVersion: "desc" } });
  return { order, grant: captured.grant, raw, component: await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: raw.id } }) };
};
const structured = async captured => {
  const fixture = orderFixtures.get(captured.order.id); const id = randomUUID();
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
  const end = new Date(cutoff.getTime() + 3_600_000);
  await request(fixture, "technician", "POST", `orders/${captured.order.id}/identity-provenance`, { id, expectedOrderVersion: captured.order.version, contentType: "image/png", sizeBytes: image.length, rights: rights(end) });
  await request(fixture, "technician", "PUT", `orders/${captured.order.id}/identity-provenance/${id}?expectedOrderVersion=${captured.order.version}`, image, 200, true);
  const p = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } }); keys.push(p.objectKey);
  const evidence = await request(fixture, "technician", "POST", `orders/${captured.order.id}/identity-evidence`, { id: randomUUID(), expectedOrderVersion: captured.order.version, identityRecordId: captured.raw.id, rights: rights(end), correction: null, identifiers: [{ kind: "vin_stamp", location: "SYNTHETIC VIN stamp", value: config.vin, provenanceIds: [id] }, { kind: "chassis_stamp", location: "SYNTHETIC chassis", value: "SYN-OWNERSHIP-CHASSIS", provenanceIds: [id] }] });
  captured.order.version = evidence.orderVersion; return id;
};
const report = async captured => {
  const fixture = orderFixtures.get(captured.order.id); const reportId = randomUUID();
  await request(fixture, "technician", "POST", `orders/${captured.order.id}/reports`, { reportId, expectedOrderVersion: captured.order.version });
  await request(fixture, "technician", "POST", `reports/${reportId}/findings`, { expectedVersion: 0, finding: { id: randomUUID(), checkId: "brakes", assessment: "normal", explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } });
  await request(fixture, "technician", "POST", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" });
  await request(fixture, "reviewer", "POST", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
  return { reportId, order: { ...captured.order, version: captured.order.version }, fixture };
};
const issueProof = async (predecessor, candidate, reportId, provenanceIds) => {
  const fixture = orderFixtures.get(candidate.order.id); const prepared = await request(fixture, "reviewer", "POST", `orders/${candidate.order.id}/continuity-requests`, { kind: "issue" });
  const provenance = provenanceIds?.length ? provenanceIds : (await db.diagnosticIdentityProvenance.findMany({ where: { orderId: { in: [predecessor.order.id, candidate.order.id] } }, orderBy: { id: "asc" } })).map(row => row.id);
  if (!provenance.length) throw new Error("Ordinary provenance required for proof issue");
  const result = await request(fixture, "reviewer", "POST", `orders/${candidate.order.id}/continuity-requests/${prepared.requestId}/execute`, { kind: "issue", command: { predecessorId: reportId, expectedPredecessorVersion: 3, expectedOrderVersion: candidate.order.version, predecessorIdentityRecordId: predecessor.raw.id, candidateIdentityRecordId: candidate.raw.id, linkingTechnicianId: fixture.people.technician.userId, method: "comparative_attestation", rationale: "SYNTHETIC independent source-specific identity comparison", provenanceRecordIds: provenance } });
  return { proofId: result.proofId ?? (await db.diagnosticContinuityProof.findFirstOrThrow({ where: { candidateOrderId: candidate.order.id }, orderBy: { issuedAt: "desc" } })).id };
};
const reportAndProof = async (a, b, consume) => {
  const pa = await structured(a); const pb = await structured(b);
  const predecessor = await report(a); const proof = await issueProof(a, b, predecessor.reportId, [pa, pb]);
  if (!consume) return { predecessor, proof };
  const fixture = orderFixtures.get(b.order.id); const input = { reportId: randomUUID(), predecessorId: predecessor.reportId, expectedOrderVersion: b.order.version, reason: "SYNTHETIC continuity use", proofId: proof.proofId };
  await request(fixture, "technician", "POST", `orders/${b.order.id}/reinspections`, input);
  return { predecessor, proof, consumed: input };
};
const sourcePins = {};
const writeJson = async (name, value) => writeFile(join(root, name), JSON.stringify(value, null, 2), { flag: "wx" });
try {
  await mkdir(root, { recursive: true }); await db.$connect();
  for (const file of config.sourceAndLoadedFiles) { const bytes = await readFile(file.path); if (hash(bytes) !== file.sha256) throw new Error(`Pinned loaded/source hash mismatch ${file.path}`); sourcePins[file.path] = file.sha256; }
  const migrations = await pinMigrations(db);
  const [actor] = await db.$queryRawUnsafe("SELECT current_user::text AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND relnamespace='public'::regnamespace) AS owns FROM pg_roles WHERE rolname=current_user");
  if (!actor || actor.rolsuper || actor.rolbypassrls || actor.owns) throw new Error("Restricted nonowner producer readback role required");
  const readiness = await db.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign"); if (!readiness[0]?.source || !readiness[0]?.campaign) throw new Error("Matched guards required throughout ordinary production");
  const principals = [...new Map(config.visits.flatMap(visit => Object.values(visit.people)).map(person => [person.userId, person])).values()]; if (principals.length !== 404) throw new Error("Expected shared comparison pair and 100 independent principal groups");
  const sessions = await db.session.findMany({ where: { id: { in: principals.map(person => person.sessionId) } }, select: { id: true, userId: true, expiresAt: true } });
  if (sessions.length !== 404 || sessions.some(session => session.expiresAt.getTime() <= deadline + 600_000) || principals.some(person => !sessions.some(session => session.id === person.sessionId && session.userId === person.userId))) throw new Error("All source/request Sessions must outlive expiry and validation");
  const visits = [await visit(fixtureFor(0), 0), await visit(fixtureFor(1), 1), ...await parallel(config.visits.slice(2), (fixture, index) => visit(fixture, index + 2))];
  if (Date.now() + 45_000 > deadline) throw new Error("Insufficient native setup budget before declaration");
  cutoff = new Date(Date.now() + 45_000); const later = new Date(cutoff.getTime() + 3_600_000);
  const dueCount = name === "overlimit" ? 1 : 100;
  const material = [await capture(visits[0], 0 < dueCount ? cutoff : later, 0 < dueCount ? cutoff : later), await capture(visits[1], 1 < dueCount ? cutoff : later, 1 < dueCount ? cutoff : later), ...await parallel(visits.slice(2), (order, index) => capture(order, index + 2 < dueCount ? cutoff : later, index + 2 < dueCount ? cutoff : later))];
  const due = material.slice(0, dueCount), independent = material[100], control = material[101];
  if (name !== "overlimit") {
    // Add one second ordinary observation to a selected grant. This is the
    // multi-component graph used by the shared-proof case and remains ordinary.
    const multi = await captureAgain(material[2]); material[2].order = multi.order;
    if (name === "overlimit") throw new Error("Unreachable overlimit branch");
    // A report/proof crosses ten-grant groups; consume one proof so the worker
    // must retain the consumed report binding while erasing ownership.
    await reportAndProof(material[0], material[10], true);
  }
  let race, arrivalRequest, newerGrantId, outsideGrantComponentId, nonDueGrantId;
  const raceBase = name.includes("proof-use") ? material[20] : material[2];
  if (name.includes("proof-use")) {
    const pair = await reportAndProof(material[20], material[21], false); const input = { reportId: randomUUID(), predecessorId: pair.predecessor.reportId, expectedOrderVersion: material[21].order.version, reason: "SYNTHETIC exact consume retry", proofId: pair.proof.proofId };
    const fixture = orderFixtures.get(material[21].order.id); const prepared = await request(fixture, "technician", "POST", `orders/${material[21].order.id}/continuity-requests`, { kind: "consume" });
    race = { barrierUserId: fixture.people.technician.userId, candidateOrderId: material[21].order.id, request: { url: new URL(`/api/v1/diagnostics/orders/${material[21].order.id}/continuity-requests/${prepared.requestId}/execute`, fixture.apiUrl).toString(), token: fixture.people.technician.token, body: { kind: "consume", command: input } }, retryRequest: { url: new URL(`/api/v1/diagnostics/orders/${material[21].order.id}/continuity-requests/${prepared.requestId}/execute`, fixture.apiUrl).toString(), token: fixture.people.technician.token, body: { kind: "consume", command: input } } };
  } else {
    const base = raceBase; const fixture = orderFixtures.get(base.order.id); const body = { expectedVersion: base.order.version, method: "vin", vin: config.vin, manualReference: null, observedAt: new Date().toISOString(), mileageKm: 123002, ownershipGrantId: base.grant.id, ownershipClassification: { rights: base.grant.rights } };
    race = { barrierUserId: fixture.people.technician.userId, candidateOrderId: base.order.id, request: { url: new URL(`/api/v1/diagnostics/orders/${base.order.id}/vehicle`, fixture.apiUrl).toString(), token: fixture.people.technician.token, body } };
  }
  if (name === "oldest-capacity") {
    newerGrantId = material[100].grant.id; outsideGrantComponentId = material[101].component.identityRecordId; nonDueGrantId = material[101].grant.id;
    const arrivalFixture = fixtureFor(101);
    const arrival = await visit(arrivalFixture, 102).catch(() => null);
    if (!arrival) throw new Error("Ordinary arrival order required in bootstrap config");
    const body = { rights: rights(later) };
    arrivalRequest = { url: new URL(`/api/v1/diagnostics/orders/${arrival.id}/ownership-grant`, arrivalFixture.apiUrl).toString(), token: arrivalFixture.people.commissioner.token, body };
  }
  if (name === "overlimit") {
    let current = material[0];
    for (let index = 0; index < 1000; index += 1) current = await captureAgain(current);
  }
  const retained = await db.$queryRawUnsafe("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
  if (retained[0]?.source !== 0 || retained[0]?.campaign !== 0) throw new Error("Unfinished producer receipt");
  const orderedDue = await db.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: cutoff } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 });
  if (orderedDue.length !== dueCount) throw new Error("Ordinary due grant inventory does not match requested selector");
  const fixture = { dependency, ordinaryProducerEvidence: join(root, "producer.json"), cutoff: cutoff.toISOString(), dueGrantIds: orderedDue.map(item => item.id), independentComponentId: independent.component.identityRecordId, ownerUrl, workerUrl, multiComponentGrantId: material[2].grant.id, newerGrantId, outsideGrantComponentId, nonDueGrantId, arrivalRequest, race };
  await writeJson("producer.json", { dependency, sourcePins, migrations, actor, sessions, resourceIdentity: config.resourceIdentity, startedAt: new Date(started).toISOString(), setupDeadline: new Date(deadline).toISOString(), cutoff: cutoff.toISOString(), commands, orderIds, keys, routes: "ordinary intake, ownership, observation, report, continuity request and reinspection routes", receipts: retained });
  await writeJson("fixture.json", fixture);
} catch (error) {
  await writeJson("producer-first-failure.json", { dependency, case: name, message: String(error), stack: error?.stack, commands });
  throw error;
} finally { await db.onModuleDestroy(); }
