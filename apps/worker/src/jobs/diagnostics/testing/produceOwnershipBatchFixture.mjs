// Coordinator-owned runtime only, from the repository root:
// DATABASE_URL=<restricted readback URL> node .../produceOwnershipBatchFixture.mjs CONFIG.json
// CONFIG extends the accepted ordinary bootstrap's private producer config with
// case, workerUrl and ownerUrl. Runtime materialization is separate from offline audit.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const dependency = "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab";
const privateRoot = "/tmp/897-r6c-a02r2-20261030";
const migrationSha256 = "dce7ff20c196e9d9f04aec10b342f38fa3c40c1e20a9a7de2e5c8cc5a82b05dc";
const acceptedPinsPath = "docs/evidence/issue-897/a-02-worker-restricted-20261030/fresh-ordinary-fixtures/source-pins.json";
const cases = ["later-failure", "shared-multiple", "oldest-capacity", "overlimit", "worker-first-second-worker", "second-worker-first-worker",
  "worker-first-capture", "capture-first-worker", "worker-first-proof-use", "proof-use-first-worker"];
// These are dependencies of the unchanged assertions, not alternative fixtures.
// Refuse BEFORE creating a DB client, issuing HTTP or writing an output file.
const blocked = {
  overlimit: "ordinary observation_append expands all raw rows of its order and refuses source scope >1000; cannot produce the required >1000 raw rows on one order",
  "worker-first-capture": "expired classified capture returns HTTP400 (or HTTP403 without classification), while the unchanged suite requires HTTP409",
  "worker-first-proof-use": "expired/missing proof and stale source-plan refusal return HTTP403, while the unchanged suite requires HTTP409",
};
const started = Date.now(), deadline = started + 120_000;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const address = value => {
  try { return new URL(value); } catch { throw new Error("Explicit valid task URL required"); }
};
const inside = (base, path) => { const part = relative(base, path); return part !== "" && part !== ".." && !part.startsWith(`..${sep}`) && !part.startsWith(sep); };
const configPath = process.argv[2];
if (!configPath) throw new Error("Explicit private batch producer config required");
const config = JSON.parse(await readFile(configPath, "utf8"));
const name = config.case;
if (!cases.includes(name)) throw new Error("Unknown ownership batch selector");
if (blocked[name]) throw new Error(`A02_BATCH_DEPENDENCY_OPEN [${name}]: ${blocked[name]}`);
const root = resolve(config.evidenceDir ?? "");
const dbUrl = address(process.env.DATABASE_URL), workerUrl = address(config.workerUrl), ownerUrl = address(config.ownerUrl);
const redis = address(process.env.REDIS_URL), minio = address(process.env.MINIO_ENDPOINT);
const apis = config.resourceIdentity?.apiUrls?.map(address) ?? [];
if (config.dependency !== dependency || config.resourceIdentity?.composeProject !== "auto_tm_ci_897_r6c_a02r2_20261030" ||
  config.resourceIdentity.ports?.postgres !== 61149 || config.resourceIdentity.ports?.redis !== 61148 || config.resourceIdentity.ports?.minio !== 61150 ||
  !inside(privateRoot, root) || !inside(privateRoot, resolve(configPath)) || !inside(privateRoot, resolve(config.resourceIdentity.bootstrapReceipt ?? "/")) ||
  [dbUrl, workerUrl, ownerUrl].some(url => url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
  [dbUrl, workerUrl, ownerUrl].some(url => url.hostname !== "127.0.0.1" || url.port !== "61149" || url.pathname !== `/r6c_batch_a02r2_${name.replaceAll("-", "_")}`) ||
  new Set([dbUrl.username, workerUrl.username, ownerUrl.username]).size !== 3 ||
  redis.protocol !== "redis:" || redis.hostname !== "127.0.0.1" || redis.port !== "61148" || !["", "/", "/0"].includes(redis.pathname) ||
  minio.protocol !== "http:" || minio.hostname !== "127.0.0.1" || minio.port !== "61150" ||
  apis.length !== 5 || new Set(apis.map(url => url.origin)).size !== 5 ||
  apis.some(url => url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["65379", "61149", "61148", "61150"].includes(url.port) || url.username || url.password || url.search || url.hash) ||
  !Array.isArray(config.visits) || config.visits.length !== 102) throw new Error("Exact private task resource and five-cohort identity required");
const canonicalRoot = await realpath(privateRoot);
if (![await realpath(root), await realpath(configPath), await realpath(config.resourceIdentity.bootstrapReceipt)].every(path => inside(canonicalRoot, path))) {
  throw new Error("Private path escaped through a symlink");
}
const bootstrap = JSON.parse(await readFile(config.resourceIdentity.bootstrapReceipt, "utf8"));
const bootstrapState = JSON.parse(await readFile(join(dirname(config.resourceIdentity.bootstrapReceipt), "bootstrap-state.private.json"), "utf8"));
const cohorts = JSON.parse(await readFile(join(dirname(config.resourceIdentity.bootstrapReceipt), "api-cohorts.json"), "utf8"));
if (bootstrap.dependency !== dependency || !same(bootstrap.resourceIdentity, config.resourceIdentity) ||
  !bootstrap.loadedFiles?.length || !same(bootstrap.sourceAndLoadedFiles, config.sourceAndLoadedFiles) ||
  !same(bootstrap.migrationPin, config.migrationPin) || !cohorts.immutableEnvironmentSnapshot || !cohorts.recheckedAfterAllCompositions ||
  cohorts.apiPid !== config.resourceIdentity.apiPid || cohorts.instances?.length !== 5) throw new Error("Accepted immutable bootstrap receipt required");
if (bootstrap.roles?.length !== 3 || !same(bootstrap.roles, bootstrapState.roles) ||
  decodeURIComponent(workerUrl.username) !== bootstrap.roles[1] || decodeURIComponent(dbUrl.username) !== bootstrap.roles[2] ||
  bootstrapState.ownerAddress !== `${ownerUrl.host}${ownerUrl.pathname}` || bootstrapState.project !== config.resourceIdentity.composeProject) {
  throw new Error("Exact bootstrap owner, worker and readback role bindings required");
}
const principalNames = ["commissioner", "reception", "technician", "reviewer"];
for (const [index, visit] of config.visits.entries()) {
  const recorded = bootstrap.visits?.[index], cohort = Math.floor(Math.max(0, index - 1) / 25), instance = cohorts.instances[cohort];
  if (!recorded || !instance || instance.cohort !== cohort || instance.apiUrl !== visit.apiUrl || apis[cohort].origin !== address(visit.apiUrl).origin ||
    !instance.configServiceDistinct || !instance.ownPrincipalsAccepted || !instance.ignoreEnvVars || !instance.skipProcessEnv || instance.userIds.length > 100 ||
    instance.foreignPrincipalsRejected !== 404 - instance.userIds.length || new Set(instance.userIds).size !== instance.userIds.length ||
    ["centerId", "templateId", "listingId", "apiUrl"].some(key => visit[key] !== recorded[key])) throw new Error("Ordinary visit/cohort binding mismatch");
  for (const who of principalNames) {
    const person = visit.people?.[who], prior = recorded.people?.[who];
    if (!person?.token || !person.userId || !person.sessionId || !same(prior, { userId: person.userId, sessionId: person.sessionId }) ||
      !instance.userIds.includes(person.userId)) throw new Error("Ordinary principal binding mismatch");
  }
}
if (principalNames.some(who => !same(config.visits[0].people[who], config.visits[1].people[who])) ||
  config.visits[0].centerId !== config.visits[1].centerId || config.vin !== bootstrap.vin) throw new Error("Shared comparison pair must retain its original staff/center binding");
const principals = [...new Map(config.visits.flatMap(visit => Object.values(visit.people)).map(person => [person.userId, person])).values()];
if (principals.length !== 404 || new Set(cohorts.instances.flatMap(instance => instance.userIds)).size !== 404) throw new Error("Exact 404-principal admission required");
const accepted = JSON.parse(await readFile(acceptedPinsPath, "utf8"));
const files = [...config.sourceAndLoadedFiles, ...bootstrap.loadedFiles];
const callerModules = ["DiagnosticOwnershipGrants", "DiagnosticOwnershipCapture", "PrismaDiagnosticIntake", "PrismaDiagnosticContinuityProofs"];
for (const module of callerModules) for (const path of [`apps/api/src/modules/diagnostics/infrastructure/${module}.ts`, `apps/api/dist/src/modules/diagnostics/infrastructure/${module}.js`]) {
  if (!files.some(file => file.path === path && /^[a-f0-9]{64}$/.test(file.sha256))) throw new Error("Source and loaded caller pins required");
}
const checkFiles = async () => {
  for (const [path, sha256] of Object.entries(accepted.hashes)) if (hash(await readFile(path)) !== sha256) throw new Error("Accepted dependency bytes changed");
  for (const { path, sha256 } of files) if (hash(await readFile(path)) !== sha256) throw new Error("Pinned source/compiled loaded bytes changed");
};
await checkFiles();
const pin = config.migrationPin;
if (pin?.manifestSha256 !== migrationSha256 || !pin.manifestPath) throw new Error("Exact current 102-migration manifest required");
const manifestBytes = await readFile(pin.manifestPath);
if (hash(manifestBytes) !== migrationSha256) throw new Error("Migration manifest pin mismatch");
const migrations = JSON.parse(manifestBytes).migrations, disk = [];
const byName = (a, b) => a.migration_name < b.migration_name ? -1 : a.migration_name > b.migration_name ? 1 : 0;
for (const entry of (await readdir("packages/db/prisma/migrations", { withFileTypes: true })).filter(item => item.isDirectory())) {
  disk.push({ migration_name: entry.name, checksum: hash(await readFile(join("packages/db/prisma/migrations", entry.name, "migration.sql"))) });
}
if (migrations.length !== 102 || !same(disk.sort(byName), migrations)) throw new Error("Current disk migration chain differs from the accepted pin");

// Composition stays at this executable boundary. The readback client never uses
// ownerUrl or workerUrl and makes no protected writes, including on failure.
const require = createRequire(resolve("apps/worker/package.json"));
const { PrismaService } = require("@auto-tm/db");
const db = new PrismaService();
const commands = [], orderIds = [], keys = [], consumedRetries = [];
let cutoff;
const checkDeadline = () => { if (Date.now() >= deadline) throw new Error("Producer native120s setup deadline exceeded"); };
const writeJson = (file, value) => writeFile(join(root, file), JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
const rights = end => ({ category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC source permission for task-owned generated visits", provenance: "Ordinary grant and classified observation routes",
  identifiability: "personal", use: ["service"], schedule: { kind: "until", until: end.toISOString(), reason: "Declared fixture retention end" },
  supplierRestrictions: "Synthetic service only", hold: null });
const request = async (visit, who, method, path, body, status = 201, binary = false) => {
  checkDeadline();
  if (cutoff && Date.now() >= cutoff.getTime() - 100) throw new Error("Declared ownership rights ended before route construction finished");
  const api = address(visit.apiUrl);
  if (!apis.some(url => url.origin === api.origin)) throw new Error("Ordinary API escaped its task cohort");
  const commandStarted = Date.now();
  const log = { startedAt: new Date(commandStarted).toISOString(), apiUrl: api.origin, who, method, path,
    body: binary ? { bytes: body.length, sha256: hash(body) } : body };
  commands.push(log);
  try {
    const response = await fetch(new URL(`/api/v1/diagnostics/${path}`, api), { method,
      headers: { authorization: `Bearer ${visit.people[who].token}`, "content-type": binary ? "application/octet-stream" : "application/json", ...(binary ? { "x-evidence-type": "image/png" } : {}) },
      body: binary ? body : JSON.stringify(body), signal: AbortSignal.timeout(Math.min(5000, deadline - commandStarted)) });
    const text = await response.text();
    Object.assign(log, { status: response.status, responseSha256: hash(text), response: text });
    if (response.status !== status) throw new Error(`Ordinary route refused: ${method} ${path}, HTTP${response.status}`);
    return text ? JSON.parse(text) : undefined;
  } finally { log.endedAt = new Date().toISOString(); log.durationMs = Date.now() - commandStarted; }
};
const parallel = async (items, work) => {
  const results = new Array(items.length); let next = 0, stopped = false;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(5, items.length) }, async () => {
    while (!stopped) {
      const index = next++; if (index >= items.length) return;
      try { results[index] = await work(items[index], index); } catch (error) { stopped = true; throw error; }
    }
  }));
  const failed = outcomes.find(result => result.status === "rejected"); if (failed) throw failed.reason;
  return results;
};
const visitOrder = async visit => {
  let order = await request(visit, "commissioner", "POST", "orders", { requestKey: randomUUID(), centerId: visit.centerId,
    templateVersionId: visit.templateId, audience: "listing_public", listingId: visit.listingId, synthetic: true });
  orderIds.push(order.id);
  for (const [who, capability] of [["technician", "diagnostics.technician"], ["reviewer", "diagnostics.reviewer"]]) order = await request(visit, "reception", "POST", `orders/${order.id}/assignments`, {
    expectedVersion: order.version, userId: visit.people[who].userId, capability, active: true });
  for (const kind of ["physical", "publication"]) order = await request(visit, "reception", "POST", `orders/${order.id}/authorization`, {
    expectedVersion: order.version, kind, authorityReference: `SYNTHETIC ${kind} permission` });
  for (const state of ["confirmed", "arrived"]) order = await request(visit, "reception", "POST", `orders/${order.id}/appointment`, { expectedVersion: order.version, state });
  return { visit, order };
};
const observation = material => ({ expectedVersion: material.order.version, method: "vin", vin: config.vin, manualReference: null,
  observedAt: new Date().toISOString(), mileageKm: 123000, ownershipGrantId: material.grant.id, ownershipClassification: { rights: material.componentRights } });
const append = async material => {
  material.order = await request(material.visit, "technician", "POST", `orders/${material.order.id}/vehicle`, observation(material));
  material.raw = await db.diagnosticIdentityRecord.findFirstOrThrow({ where: { orderId: material.order.id }, orderBy: { orderVersion: "desc" } });
  material.component = await db.diagnosticOwnershipComponent.findUniqueOrThrow({ where: { identityRecordId: material.raw.id } });
  if (material.component.state !== "available" || material.component.grantId !== material.grant.id ||
    material.component.rightsUntil.toISOString() !== material.componentRights.schedule.until) throw new Error("Ordinary capture did not retain the exact available classification");
  return material;
};
const capture = async (prepared, grantEnd, componentEnd) => {
  const grantRights = rights(grantEnd), componentRights = rights(componentEnd);
  const grant = await request(prepared.visit, "commissioner", "POST", `orders/${prepared.order.id}/ownership-grant`, { rights: grantRights });
  return append({ ...prepared, grant, grantRights, componentRights });
};
const structured = async material => {
  const { visit, order, raw } = material, id = randomUUID(), end = new Date(cutoff.getTime() + 3_600_000);
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8AARwgWXg4ArpMP8aaUSCMAAAAASUVORK5CYII=", "base64");
  await request(visit, "technician", "POST", `orders/${order.id}/identity-provenance`, { id, expectedOrderVersion: order.version,
    contentType: "image/png", sizeBytes: image.length, rights: rights(end) });
  await request(visit, "technician", "PUT", `orders/${order.id}/identity-provenance/${id}?expectedOrderVersion=${order.version}`, image, 200, true);
  keys.push((await db.diagnosticIdentityProvenance.findUniqueOrThrow({ where: { id } })).objectKey);
  const evidence = await request(visit, "technician", "POST", `orders/${order.id}/identity-evidence`, { id: randomUUID(), expectedOrderVersion: order.version,
    identityRecordId: raw.id, rights: rights(end), correction: null,
    identifiers: [{ kind: "vin_stamp", location: "SYNTHETIC VIN stamp", value: config.vin, provenanceIds: [id] },
      { kind: "chassis_stamp", location: "SYNTHETIC chassis", value: "SYN-OWNERSHIP-CHASSIS", provenanceIds: [id] }] });
  material.order.version = evidence.orderVersion;
  return id;
};
const releasedReport = async material => {
  const { visit, order } = material, reportId = randomUUID();
  await request(visit, "technician", "POST", `orders/${order.id}/reports`, { reportId, expectedOrderVersion: order.version });
  await request(visit, "technician", "POST", `reports/${reportId}/findings`, { expectedVersion: 0, finding: { id: randomUUID(), checkId: "brakes", assessment: "normal",
    explanation: null, evidenceIds: [], kind: null, source: null, measurement: null, location: null } });
  await request(visit, "technician", "POST", `reports/${reportId}/transition`, { expectedVersion: 1, action: "submit" });
  await request(visit, "reviewer", "POST", `reports/${reportId}/transition`, { expectedVersion: 2, action: "finalize" });
  keys.push(...(await db.diagnosticPdfArtifact.findMany({ where: { reportId } })).map(row => row.objectKey));
  return reportId;
};
const privateRequest = (visit, who, path, body) => ({ url: new URL(`/api/v1/diagnostics/${path}`, visit.apiUrl).toString(), token: visit.people[who].token, body });
const sharedProof = async (a, b) => {
  const pa = await structured(a), pb = await structured(b), predecessorId = await releasedReport(a);
  const issued = await request(b.visit, "reviewer", "POST", `orders/${b.order.id}/continuity-requests`, { kind: "issue" });
  const proof = await request(b.visit, "reviewer", "POST", `orders/${b.order.id}/continuity-requests/${issued.requestId}/execute`, { kind: "issue", command: {
    predecessorId, expectedPredecessorVersion: 3, expectedOrderVersion: b.order.version, predecessorIdentityRecordId: a.raw.id,
    candidateIdentityRecordId: b.raw.id, linkingTechnicianId: b.visit.people.technician.userId, method: "comparative_attestation",
    rationale: "SYNTHETIC independent source-specific identity comparison", provenanceRecordIds: [pa, pb] } });
  if (!proof.proofId) throw new Error("Ordinary issue request did not return a proof binding");
  const prepared = await request(b.visit, "technician", "POST", `orders/${b.order.id}/continuity-requests`, { kind: "consume" });
  const command = { reportId: randomUUID(), expectedOrderVersion: b.order.version, reason: "SYNTHETIC frozen exact consumption", proofId: proof.proofId };
  const path = `orders/${b.order.id}/continuity-requests/${prepared.requestId}/execute`;
  return { proofId: proof.proofId, requestId: prepared.requestId, command, path, request: privateRequest(b.visit, "technician", path, { kind: "consume", command }) };
};
const receipts = async () => {
  const rows = await db.$queryRawUnsafe("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
  if (!same(rows, [{ source: 0, campaign: 0 }])) throw new Error("Unfinished ordinary producer receipt");
  return rows;
};
const retained = async () => ({
  grants: await db.diagnosticOwnershipGrant.findMany({ orderBy: { id: "asc" } }),
  components: await db.diagnosticOwnershipComponent.findMany({ orderBy: { identityRecordId: "asc" } }),
  raw: await db.diagnosticIdentityRecord.findMany({ orderBy: { id: "asc" } }),
  reports: await db.diagnosticReportRecord.findMany({ orderBy: { id: "asc" } }),
  proofs: await db.diagnosticContinuityProof.findMany({ orderBy: { id: "asc" } }),
  requests: await db.diagnosticContinuityRequest.findMany({ orderBy: { id: "asc" } }),
  anchors: await db.diagnosticSourceAnchor.findMany({ orderBy: { orderId: "asc" } }),
});
try {
  await mkdir(root, { recursive: true, mode: 0o700 }); await db.$connect(); checkDeadline();
  const applied = await db.$queryRawUnsafe("SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name");
  const [unfinished] = await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL");
  if (unfinished.n || !same(applied, migrations)) throw new Error("Applied migration chain differs from the accepted current pin");
  const [actor] = await db.$queryRawUnsafe(`SELECT current_user::text AS role,current_user=session_user AS direct,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS restricted,
    (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))+
    (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))+
    (SELECT count(*)::int FROM pg_namespace WHERE nspname='public' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned
    FROM pg_roles WHERE rolname=current_user`);
  if (!actor?.direct || !actor.restricted || actor.owned || actor.role !== decodeURIComponent(dbUrl.username)) throw new Error("Restricted nonowner direct readback role required");
  const readiness = await db.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
  if (!same(readiness, [{ source: true, campaign: true }])) throw new Error("Matched source/campaign guards required");
  await receipts();
  if (await db.inspectionOrder.count() || await db.diagnosticOwnershipGrant.count()) throw new Error("Preserve nonempty fixture; fresh per-case database required");
  const sessions = await db.session.findMany({ where: { id: { in: principals.map(person => person.sessionId) } }, select: { id: true, userId: true, expiresAt: true } });
  if (sessions.length !== 404 || sessions.some(session => session.expiresAt.getTime() <= deadline + 600_000) ||
    principals.some(person => !sessions.some(session => session.id === person.sessionId && session.userId === person.userId))) throw new Error("All ordinary source/request Sessions must outlive expiry and validation");
  const orders = [await visitOrder(config.visits[0]), await visitOrder(config.visits[1]), ...await parallel(config.visits.slice(2), visitOrder)];
  let newerOrder, arrivalOrder, controlOrder;
  if (name === "oldest-capacity") {
    newerOrder = await visitOrder(config.visits[99]); arrivalOrder = await visitOrder(config.visits[101]); controlOrder = await visitOrder(config.visits[100]);
  }
  if (Date.now() + 45_000 > deadline) throw new Error("Insufficient native setup budget before immutable declaration");
  cutoff = new Date(Date.now() + 45_000);
  const later = new Date(cutoff.getTime() + 3_600_000);
  // Deterministic immutable declarations, all within the same 45s horizon.
  // Shared bootstrap orders 0/1 occupy ranks 0/10 rather than relying on UUIDs.
  const end = index => index < 100 ? new Date(cutoff.getTime() - 100 + (index === 0 ? 0 : index === 1 ? 10 : index <= 10 ? index - 1 : index)) : later;
  const captureOne = (order, index) => capture(order, end(index), index < 100 ? end(index) : index === 100 || name === "oldest-capacity" ? cutoff : later);
  const material = [await captureOne(orders[0], 0), await captureOne(orders[1], 1), ...await parallel(orders.slice(2), (order, index) => captureOne(order, index + 2))];
  await append(material[2]);
  const proof = await sharedProof(material[0], material[1]);
  const opponentFirst = name === "capture-first-worker" || name === "proof-use-first-worker";
  if (name !== "proof-use-first-worker") {
    await request(material[1].visit, "technician", "POST", proof.path, proof.request.body);
    const consumed = await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: proof.command.reportId } });
    if (consumed.continuityProofId !== proof.proofId || consumed.reinspectionOrderVersion !== proof.command.expectedOrderVersion ||
      consumed.continuityRequestId !== proof.requestId || consumed.continuityRequestSessionId !== material[1].visit.people.technician.sessionId) throw new Error("Consumed report lost its exact request/proof retry binding");
    await request(material[1].visit, "technician", "POST", proof.path, proof.request.body);
    if (!same(await db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: consumed.id } }), consumed)) throw new Error("Exact consumed retry changed its report");
    consumedRetries.push(proof.request);
  }
  const independent = material[100], extras = {};
  if (name === "oldest-capacity") {
    const newer = await capture(newerOrder, cutoff, cutoff); await capture(controlOrder, later, later);
    Object.assign(extras, { newerGrantId: newer.grant.id, nonDueGrantId: material[101].grant.id, outsideGrantComponentId: material[101].raw.id,
      arrivalRequest: privateRequest(arrivalOrder.visit, "commissioner", `orders/${arrivalOrder.order.id}/ownership-grant`, { rights: rights(later) }) });
  }
  const selected = await db.diagnosticOwnershipGrant.findMany({ where: { state: "available", rightsUntil: { lte: cutoff } }, orderBy: [{ rightsUntil: "asc" }, { id: "asc" }], take: 100 });
  if (selected.length !== 100 || selected.some(row => !material.slice(0, 100).some(item => item.grant.id === row.id)) ||
    selected[0].id !== material[0].grant.id || selected[10].id !== material[1].grant.id) throw new Error("Exact oldest100/shared cross-group ordinary selection required");
  // The first worker group must wait on a real User in that group's source
  // prefix. The same fixture supports either worker acquiring that prefix first.
  const barrierUserId = config.visits[2].people.technician.userId;
  const candidate = name === "proof-use-first-worker" ? material[1] : material[2];
  const opponent = name === "proof-use-first-worker" ? proof.request : privateRequest(candidate.visit, "technician", `orders/${candidate.order.id}/vehicle`, observation(candidate));
  const race = { barrierUserId, candidateOrderId: candidate.order.id, request: opponent,
    ...(name === "proof-use-first-worker" ? { retryRequest: JSON.parse(JSON.stringify(opponent)) } : {}) };
  const state = await retained();
  if (state.grants.length !== (name === "oldest-capacity" ? 104 : 102) || state.components.filter(row => row.grantId === material[2].grant.id).length !== 2 ||
    !state.proofs.some(row => row.id === proof.proofId && row.predecessorOrderId === material[0].order.id && row.candidateOrderId === material[1].order.id) ||
    !state.components.some(row => row.identityRecordId === independent.raw.id && row.state === "available" && row.rightsUntil.getTime() === cutoff.getTime())) throw new Error("Required ordinary ownership/proof graph missing");
  await checkFiles(); checkDeadline(); await receipts();
  if (Date.now() >= cutoff.getTime() - 2000) throw new Error("Ordinary setup missed immutable opponent handoff margin; retain failure state");
  const handoffAt = cutoff.getTime() - (opponentFirst ? 2000 : 0);
  await delay(Math.max(0, handoffAt - Date.now())); checkDeadline();
  const [clock] = await db.$queryRawUnsafe("SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now");
  if (opponentFirst ? clock.now >= cutoff || Date.now() >= cutoff.getTime() : clock.now < cutoff) throw new Error("Real cutoff handoff boundary missed");
  const emptyReceipts = await receipts();
  const readinessAfter = await db.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
  if (!same(readinessAfter, readiness)) throw new Error("Guard readiness changed during ordinary production");
  const fixture = { dependency, ordinaryProducerEvidence: join(root, "producer.json"), cutoff: cutoff.toISOString(), dueGrantIds: selected.map(row => row.id),
    independentComponentId: independent.raw.id, ownerUrl: config.ownerUrl, workerUrl: config.workerUrl, multiComponentGrantId: material[2].grant.id,
    orderIds, consumedRetries, race, ...extras };
  await writeJson("producer-retained.json", state);
  await writeJson("producer.json", { dependency, case: name, acceptedPinsPath, sourceAndLoadedFiles: files, migrations: applied, actor, sessions,
    resourceIdentity: config.resourceIdentity, startedAt: new Date(started).toISOString(), setupDeadline: new Date(deadline).toISOString(), cutoff: cutoff.toISOString(),
    handoff: { opponentFirst, targetAt: new Date(handoffAt).toISOString(), databaseNow: clock.now, actualAt: new Date().toISOString(), nativeSuiteStartupAndBarrierUnproved: true },
    commands, orderIds, keys, receipts: emptyReceipts, readiness: readinessAfter });
  if (opponentFirst && Date.now() >= cutoff.getTime()) throw new Error("Output serialization missed pre-cutoff handoff; fixture not emitted");
  await writeJson("fixture.json", fixture);
} catch (error) {
  await writeJson("producer-first-failure.json", { dependency, case: name, startedAt: new Date(started).toISOString(), failedAt: new Date().toISOString(),
    message: String(error), commands, orderIds, keys });
  throw error;
} finally {
  // Keep failure state. Coordinator owns the unchanged bootstrap cleanup, exact
  // trigger restoration, private object inventory and task Compose destruction.
  await db.onModuleDestroy();
}
