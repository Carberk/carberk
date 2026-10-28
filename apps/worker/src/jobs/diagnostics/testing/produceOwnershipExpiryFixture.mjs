// Run only inside the parent-reserved task-local runtime interval.
// Run from the repository root with the task's compiled DB package available:
// node apps/worker/src/jobs/diagnostics/testing/produceOwnershipExpiryFixture.mjs CONFIG.json
// CONFIG is private task-owned input; never include bearer tokens in evidence.
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const dependency = "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
const require = createRequire(resolve("apps/worker/package.json"));
const { PrismaService } = require("@auto-tm/db");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const configPath = process.argv[2];
if (!configPath) throw new Error("Explicit private producer config required");
const config = JSON.parse(await readFile(configPath, "utf8"));
const endpoint = new URL(config.apiUrl);
const database = new URL(process.env.DATABASE_URL ?? "");
if (endpoint.hostname !== "127.0.0.1" || database.hostname !== "127.0.0.1" || database.port === "5432" ||
  config.dependency !== dependency || !config.resourceIdentity?.composeProject || !config.sourceAndLoadedFiles?.length || !Array.isArray(config.listingIds) || config.listingIds.length < 102 || !Array.isArray(config.visits) || config.visits.length !== 102) {
  throw new Error("Pinned source and task-owned loopback resource identity required");
}
for (const who of ["commissioner", "reception", "technician", "reviewer"]) {
  if (!config.people?.[who]?.token || !config.people[who].userId || !config.people[who].sessionId) throw new Error(`Missing ordinary principal ${who}`);
}
// The caller's task fixture bootstrap owns users, Sessions, catalog/listing,
// center qualifications, a published brakes template, exact matched activation,
// restricted API/worker roles, and sole task-service cleanup. Reuse the accepted
// DiagnosticClassifiedOwnership visit/release/structured route composition.
// This producer never writes source rows or creates receipts using SQL.
const db = new PrismaService();
const root = config.evidenceDir;
await mkdir(root, { recursive: true });
const commands = [], orderIds = [], keys = [], dueGrantIds = [], derivedComponentIds = [], nonDueGrantIds = [], nonDueComponentIds = [];
const orderFixtures = new Map();
const started = Date.now(), deadline = started + 120_000;
let cutoff;
const persist = async name => writeFile(join(root, name), JSON.stringify({ dependency, resourceIdentity: config.resourceIdentity,
  principals: config.visits.map(visit => Object.fromEntries(Object.entries(visit.people).map(([key, p]) => [key, { userId: p.userId, sessionId: p.sessionId }]))),
  startedAt: new Date(started).toISOString(), setupDeadline: new Date(deadline).toISOString(), cutoff: cutoff?.toISOString(), commands, orderIds, keys }, null, 2), { flag: "wx" });
const request = async (fixture, who, method, path, body, status = 201, binary = false) => {
  const currentEndpoint = new URL(fixture.apiUrl);
  if (currentEndpoint.hostname !== "127.0.0.1") throw new Error("Task-loopback visit API required");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Producer native120s setup deadline exceeded");
  const input = binary ? body : body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(new URL(`/api/v1/diagnostics/${path}`, currentEndpoint), { method,
    headers: { authorization: `Bearer ${fixture.people[who].token}`, ...(input === undefined ? {} : { "content-type": binary ? "application/octet-stream" : "application/json" }),
      ...(binary ? { "x-evidence-type": "image/png" } : {}) }, body: input, signal: AbortSignal.timeout(Math.min(5000, remaining)) });
  const text = await response.text();
  commands.push({ at: new Date().toISOString(), apiUrl: currentEndpoint.toString(), who, method, path, body: binary ? { bytes: body.length, sha256: hash(body) } : body,
    status: response.status, responseSha256: hash(text), response: text });
  if (response.status !== status) throw new Error(`Ordinary route refused ${method} ${path}: ${response.status}`);
  return text ? JSON.parse(text) : undefined;
};
const commandsFor = fixture => ({
  post: (who, path, body) => request(fixture, who, "POST", path, body),
  send: (who, method, path, body, status, binary) => request(fixture, who, method, path, body, status, binary),
});
// Keep every order's command/version sequence serial. Only disjoint actor/center
// groups overlap, with deterministic index-to-result mapping and at most four
// in-flight HTTP requests. Drain active work on failure before preserving state.
const parallel = async (items, work) => {
  const results = new Array(items.length);
  let next = 0, stopped = false;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (!stopped) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await work(items[index], index); }
      catch (error) { stopped = true; throw error; }
    }
  }));
  const failed = outcomes.find(result => result.status === "rejected");
  if (failed) throw failed.reason;
  return results;
};
const rights = end => ({ category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC source permission for task-owned generated visits", provenance: "Ordinary grant and classified observation routes",
  identifiability: "personal", use: ["service"], schedule: { kind: "until", until: end.toISOString(), reason: "Declared fixture retention end" },
  supplierRestrictions: "Synthetic service only", hold: null });
const visit = async (fixture, index) => {
  const { post } = commandsFor(fixture);
  let order = await post("commissioner", "orders", { requestKey: randomUUID(), centerId: fixture.centerId,
    templateVersionId: fixture.templateId, audience: "listing_public", listingId: fixture.listingId, synthetic: true });
  orderIds[index] = order.id; orderFixtures.set(order.id, fixture);
  for (const [who, capability] of [["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]]) {
    order = await post("reception", `orders/${order.id}/assignments`, { expectedVersion: order.version,
      userId: fixture.people[who].userId, capability, active: true });
  }
  for (const kind of ["physical", "publication"]) order = await post("reception", `orders/${order.id}/authorization`, {
    expectedVersion: order.version, kind, authorityReference: `SYNTHETIC ${kind} permission` });
  for (const state of ["confirmed", "arrived"]) order = await post("reception", `orders/${order.id}/appointment`, { expectedVersion: order.version, state });
  return order;
};
const capture = async (order, grantEnd, componentEnd) => {
  const fixture = orderFixtures.get(order.id);
  const { post } = commandsFor(fixture);
  const grant = await post("commissioner", `orders/${order.id}/ownership-grant`, { rights: rights(grantEnd) });
  order = await post("technician", `orders/${order.id}/vehicle`, { expectedVersion: order.version, method: "vin", vin: config.vin,
    manualReference: null, observedAt: new Date().toISOString(), mileageKm: 123000, ownershipGrantId: grant.id,
    ownershipClassification: { rights: rights(componentEnd) } });
  const raw = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { orderVersion: "desc" } });
  const component = await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: raw.id } });
  if (component.state !== "available" || component.grantId !== grant.id || component.rightsUntil.getTime() !== componentEnd.getTime()) throw new Error("Ordinary capture did not bind exact declared rights");
  return { order, grant, raw, component };
};
const structured = async captured => {
  const fixture = orderFixtures.get(captured.order.id);
  const { post, send } = commandsFor(fixture);
  const id = randomUUID();
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
  const end = new Date(cutoff.getTime() + 3600_000);
  await post("technician", `orders/${captured.order.id}/identity-provenance`, { id, expectedOrderVersion: captured.order.version,
    contentType: "image/png", sizeBytes: image.length, rights: rights(end) });
  await send("technician", "PUT", `orders/${captured.order.id}/identity-provenance/${id}?expectedOrderVersion=${captured.order.version}`, image, 200, true);
  const p = await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } });
  keys.push(p.objectKey);
  const evidence = await post("technician", `orders/${captured.order.id}/identity-evidence`, { id: randomUUID(), expectedOrderVersion: captured.order.version,
    identityRecordId: captured.raw.id, rights: rights(end), correction: null,
    identifiers: [{ kind: "vin_stamp", location: "SYNTHETIC VIN stamp", value: config.vin, provenanceIds: [id] },
      { kind: "chassis_stamp", location: "SYNTHETIC chassis", value: "SYN-OWNERSHIP-CHASSIS", provenanceIds: [id] }] });
  captured.order.version = evidence.orderVersion;
  return id;
};
try {
  await db.$connect();
  const migrations = await db.$queryRawUnsafe("SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name");
  if (migrations.length !== 98 || !migrations.at(-1).migration_name.startsWith("20261026016000") || migrations.at(-1).checksum !== "87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1") throw new Error("Exact accepted160 required");
  const files = {};
  const required = ["apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.ts",
    "apps/api/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.ts",
    "apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts",
    "apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.ts",
    "apps/api/dist/src/modules/diagnostics/infrastructure/DiagnosticOwnershipGrants.js",
    "apps/api/dist/src/modules/diagnostics/infrastructure/DiagnosticOwnershipCapture.js",
    "apps/api/dist/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.js",
    "apps/api/dist/src/modules/diagnostics/infrastructure/PrismaDiagnosticContinuityProofs.js"];
  if (required.some(path => !config.sourceAndLoadedFiles.some(file => file.path === path))) throw new Error("Exact production caller source and compiled artifact pins required");
  for (const { path, sha256 } of config.sourceAndLoadedFiles) {
    files[path] = hash(await readFile(path));
    if (files[path] !== sha256) throw new Error(`Pinned loaded/source hash mismatch ${path}`);
  }
  const [actor] = await db.$queryRawUnsafe("SELECT current_user::text AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND relnamespace='public'::regnamespace) AS owns FROM pg_roles WHERE rolname=current_user");
  if (!actor || actor.rolsuper || actor.rolbypassrls || actor.owns) throw new Error("Restricted nonowner producer readback role required");
  await writeFile(join(root, "loaded-bytes.json"), JSON.stringify({ dependency, files, migrations, actor, resourceIdentity: config.resourceIdentity }, null, 2), { flag: "wx" });
  const principals = [...new Map(config.visits.flatMap(visit => Object.values(visit.people)).map(person => [person.userId, person])).values()];
  if (principals.length !== 404) throw new Error("Expected shared comparison pair and 100 independent principal groups");
  const sessions = await db.session.findMany({ where: { id: { in: principals.map(p => p.sessionId) } }, select: { id: true, userId: true, expiresAt: true } });
  if (sessions.length !== 404 || sessions.some(row => row.expiresAt.getTime() <= deadline + 600_000)) throw new Error("All source/request Sessions must outlive expiry and validation");
  for (const principal of principals) {
    if (!sessions.some(row => row.id === principal.sessionId && row.userId === principal.userId)) throw new Error("Session principal mismatch");
  }
  const readiness = await db.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
  if (!readiness[0]?.source || !readiness[0]?.campaign) throw new Error("Matched guards required throughout ordinary production");
  // Prepare visit authority first. No ownership is created until E is declared.
  const visits = [await visit(config.visits[0], 0), await visit(config.visits[1], 1),
    ...await parallel(config.visits.slice(2), (fixture, index) => visit(fixture, index + 2))];
  // E is an actual immutable declaration, not a test clock jump. Abort rather
  // than extending E if route construction cannot finish before it.
  const horizon = 45_000;
  if (Date.now() + horizon > deadline) throw new Error("Insufficient native setup budget before declaration");
  cutoff = new Date(Date.now() + horizon);
  const later = new Date(cutoff.getTime() + 3600_000);
  const captureOne = (order, index) => {
    if (Date.now() >= cutoff.getTime()) throw new Error("Declared rights ended before producer finished");
    return capture(order, index < 100 ? cutoff : later, index < 101 ? cutoff : later);
  };
  const material = [await captureOne(visits[0], 0), await captureOne(visits[1], 1),
    ...await parallel(visits.slice(2), (order, index) => captureOne(order, index + 2))];
  const captured = material.slice(0, 100), independent = material[100], control = material[101];
  dueGrantIds.push(...captured.map(item => item.grant.id)); derivedComponentIds.push(...captured.map(item => item.raw.id));
  nonDueGrantIds.push(independent.grant.id, control.grant.id); nonDueComponentIds.push(control.raw.id);
  const pa = await structured(captured[0]), pb = await structured(captured[1]);
  const reportId = randomUUID(), a = captured[0], b = captured[1];
  const { post } = commandsFor(config.visits[0]);
  await post("technician", `orders/${a.order.id}/reports`, { reportId, expectedOrderVersion: a.order.version });
  await post("technician", `reports/${reportId}/findings`, { expectedVersion: 0, finding: { id: randomUUID(), checkId: "brakes", assessment: "normal",
    explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } });
  await post("technician", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" });
  await post("reviewer", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
  keys.push(...(await db.diagnosticPdfArtifact.findMany({ where: { reportId } })).map(row => row.objectKey));
  const prepared = await post("reviewer", `orders/${b.order.id}/continuity-requests`, { kind: "issue" });
  await post("reviewer", `orders/${b.order.id}/continuity-requests/${prepared.requestId}/execute`, { kind: "issue", command: {
    predecessorId: reportId, expectedPredecessorVersion: 3, expectedOrderVersion: b.order.version, predecessorIdentityRecordId: a.raw.id,
    candidateIdentityRecordId: b.raw.id, linkingTechnicianId: config.people.technician.userId, method: "comparative_attestation",
    rationale: "SYNTHETIC independent source-specific identity comparison", provenanceRecordIds: [pa, pb] } });
  if (Date.now() >= cutoff.getTime()) throw new Error("Proof routes did not finish before declared expiry");
  // Readiness at E only. This bounded wait follows the declared rights; it does
  // not run inside a native test or increase its5000ms timeout.
  await delay(cutoff.getTime() - Date.now());
  const [clock] = await db.$queryRawUnsafe("SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now");
  if (clock.now < cutoff) throw new Error("Database has not reached declared rights end");
  const receipts = await db.$queryRawUnsafe("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
  if (receipts[0]?.source !== 0 || receipts[0]?.campaign !== 0) throw new Error("Unfinished producer receipt");
  await writeFile(join(root, "producer-retained.json"), JSON.stringify({ receipts, sessions,
    grants: await db.diagnosticOwnershipGrant.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: "asc" } }),
    components: await db.diagnosticOwnershipComponent.findMany({ where: { orderId: { in: orderIds } }, orderBy: { identityRecordId: "asc" } }),
    raw: await db.diagnosticIdentityRecord.findMany({ where: { orderId: { in: orderIds } }, orderBy: { id: "asc" } }),
    proofs: await db.diagnosticContinuityProof.findMany({ where: { candidateOrderId: { in: orderIds } } }),
    requests: await db.diagnosticContinuityRequest.findMany({ where: { orderId: { in: orderIds } } }),
    anchors: await db.diagnosticSourceAnchor.findMany({ where: { orderId: { in: orderIds } } }),
  }, null, 2), { flag: "wx" });
  await persist("producer.json");
  await writeFile(join(root, "fixture.json"), JSON.stringify({ dependency, ordinaryProducerEvidence: join(root, "producer.json"), cutoff: cutoff.toISOString(),
    dueGrantIds, derivedComponentIds, independentComponentId: independent.raw.id, nonDueGrantIds, nonDueComponentIds, orderIds }, null, 2), { flag: "wx" });
} catch (error) {
  await persist("producer-first-failure.json");
  throw error;
} finally {
  // No teardown of live fixture rows here. The explicit task runner must consume
  // the manifest, retain failure state, restore the trigger snapshot, remove
  // exact keys and task roles, and destroy only its owned Compose project.
  await db.onModuleDestroy();
}
