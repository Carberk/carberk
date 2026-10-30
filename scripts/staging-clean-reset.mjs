// Pure S1 guards for the prelaunch clean reset (#901). No I/O, no executor.
// Observations are future authoritative adapter input; caller JSON only names
// the target and claim and can never assert state.

/** Committed trusted switch. Production stays disabled until a reviewed change supplies independently sourced identity. */
export const PRODUCTION_RESET = Object.freeze({ open: false, environmentId: null });
export const PHASES = Object.freeze(['attested', 'quiesced', 'window', 'inventoried', 'cf-detached', 'rows', 'redis', 'objects', 'reseeded', 'reopened']);
export const QUEUES = Object.freeze(['video-transcode', 'notification-fanout', 'orphan-cleanup', 'account-purge', 'retired-upload-cleanup',
  'listing-view-retention', 'measurement-retention', 'measurement-outbox', 'service-lifecycle', 'service-push', 'diagnostic-artifacts', 'email-code']);

const presigner = '@aws-sdk/s3-request-presigner';
const caller = /\.presignUpload\(/;
/**
 * Exact lifetime definitions of every presigned PUT issuer. Signers whose
 * lifetime is a parameter are bounded by their pinned callers.
 */
export const GRANT_ISSUERS = Object.freeze([
  { role: 'signer', file: 'apps/api/src/modules/listings/infrastructure/MinioMediaStorageAdapter.ts', definition: 'expiresIn: data.expirySeconds ?? 600,', seconds: 600 },
  { role: 'signer', file: 'apps/api/src/modules/catalog/infrastructure/MinioBrandLogoStorage.ts', definition: 'expiresIn: expirySeconds,', seconds: null },
  { role: 'signer', file: 'apps/api/src/modules/listings/infrastructure/S3VideoObjectStorage.ts', definition: 'const expiresIn = Math.min(900, Math.floor((session.expiresAt.getTime() - issuedAt) / 1000));', seconds: 900 },
  { role: 'caller', file: 'apps/api/src/modules/listings/application/PresignUpload.ts', definition: 'expirySeconds: 600,', seconds: 600 },
  { role: 'caller', file: 'apps/api/src/modules/conversations/application/PresignChatAttachmentUpload.ts', definition: 'presignExpirySeconds: 600,', seconds: 600 },
  { role: 'caller', file: 'apps/api/src/modules/catalog/application/PresignBrandLogoUpload.ts', definition: 'const UPLOAD_EXPIRY_SECONDS = 600;', seconds: 600 },
].map(Object.freeze));
export const GRANT_WINDOW_SECONDS = 900;

// RegExp#test coerces its argument; identities must be actual strings.
const pattern = re => Object.freeze({ test: value => typeof value === 'string' && re.test(value) });
const id = pattern(/^[a-zA-Z0-9-]{1,80}$/);
const hex32 = pattern(/^[a-f0-9]{32}$/);
const sha = pattern(/^[a-f0-9]{40}$/);
const cf = pattern(/^cf_[a-f0-9]{32}$/);
const login = pattern(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const count = value => Number.isSafeInteger(value) && value >= 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = message => { throw new Error(message); };

/**
 * Plan only from an adapter's exhausted object inventory. This pure input is
 * neither caller authorization nor proof of pagination, byte hashes or closure.
 * The adapter must bind approved reference bytes separately before execution.
 */
export function planObjects(inventory, approvedCatalog) {
  const refused = () => fail('Object inventory refused');
  const buckets = ['listing-photos', 'listing-videos', 'chat-attachments', 'catalog-assets', 'service-private', 'listing-video-private'];
  const string = value => typeof value === 'string' && value.length > 0 && !/[\u0000-\u001f]/.test(value);
  const version = row => exact(row, ['key', 'versionId', 'size', 'etag']) && string(row.key) &&
    string(row.versionId) && count(row.size) && string(row.etag);
  const identity = row => JSON.stringify([row.key, row.versionId]);
  if (!exact(inventory, buckets) || !Array.isArray(approvedCatalog) || approvedCatalog.some(row => !version(row) || !row.key.startsWith('brands/'))) refused();
  const approved = new Map(approvedCatalog.map(row => [identity(row), row]));
  if (approved.size !== approvedCatalog.length) refused();
  const result = { preserve: [], versions: [], deleteMarkers: [], multipart: [] };
  for (const bucket of [...buckets].sort()) {
    const snapshot = inventory[bucket];
    if (!exact(snapshot, ['complete', 'versions', 'deleteMarkers', 'multipart']) || snapshot.complete !== true ||
        !['versions', 'deleteMarkers', 'multipart'].every(kind => Array.isArray(snapshot[kind]))) refused();
    const seen = new Set();
    for (const kind of ['versions', 'deleteMarkers', 'multipart']) {
      for (const row of snapshot[kind]) {
        if (kind === 'versions' ? !version(row) : !exact(row, ['key', kind === 'multipart' ? 'uploadId' : 'versionId']) ||
            !string(row.key) || !string(row[kind === 'multipart' ? 'uploadId' : 'versionId'])) refused();
        // Versions and delete markers share an S3 version identity. Multipart
        // uploads have a separate identity even when they use the same key.
        const unique = JSON.stringify([kind === 'multipart' ? 'upload' : 'version', row.key, row.versionId ?? row.uploadId]);
        if (seen.has(unique)) refused();
        seen.add(unique);
        if (bucket === 'catalog-assets' && row.key.startsWith('brands/')) {
          const reference = approved.get(identity(row));
          if (kind !== 'versions' || !reference || row.size !== reference.size || row.etag !== reference.etag) refused();
          approved.delete(identity(row));
          result.preserve.push({ bucket, ...row });
        } else result[kind].push({ bucket, ...row });
      }
    }
  }
  if (approved.size) refused();
  for (const rows of Object.values(result)) rows.sort((a, b) => {
    const left = JSON.stringify([a.bucket, a.key, a.versionId ?? a.uploadId]);
    const right = JSON.stringify([b.bucket, b.key, b.versionId ?? b.uploadId]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return result;
}

function services(value) { return exact(value, ['api', 'worker']) && id.test(value.api) && id.test(value.worker); }

/** Validates caller JSON. Only target identity and reservation claim are accepted. */
export function parseRequest(policy, claim) {
  if (!exact(policy, ['target', 'projectId', 'environmentId', 'services']) || !['staging', 'production'].includes(policy.target) ||
      !id.test(policy.projectId) || !id.test(policy.environmentId) || !services(policy.services)) fail('Exact clean-reset policy required');
  if (!exact(claim, ['id', 'candidate']) || !hex32.test(claim.id) || !sha.test(claim.candidate)) fail('Exact clean-reset claim required');
  return { policy: structuredClone(policy), claim: structuredClone(claim) };
}

/** Binds the named target to an authoritative attestation and exclusive credential before any application read. */
export function guardTarget({ request, attestation, credentials, authorization, trusted = PRODUCTION_RESET, ...unknown }) {
  if (Object.keys(unknown).length) fail('Unknown guard input');
  const { policy, claim } = parseRequest(request?.policy, request?.claim);
  const production = policy.target === 'production';
  if (production) {
    if (!exact(trusted, ['open', 'environmentId']) || trusted.open !== true) fail('Production clean reset disabled');
    if (typeof trusted.environmentId !== 'string' || !id.test(trusted.environmentId)) fail('Production clean reset requires independently sourced production identity');
  }
  if (!exact(credentials, ['staging', 'production']) || typeof credentials.staging !== 'boolean' || typeof credentials.production !== 'boolean')
    fail('Strict credential presence required');
  if (credentials.staging === production || credentials.production !== production) fail('Exactly one target credential must be present');
  if (!exact(attestation, ['projectId', 'environmentId', 'environmentName', 'services', 'appEnv']) || !services(attestation.services) ||
      !exact(attestation.appEnv, ['api', 'worker'])) fail('Exact authoritative attestation required');
  if (attestation.projectId !== policy.projectId || attestation.environmentId !== policy.environmentId ||
      attestation.environmentName !== policy.target || !same(attestation.services, policy.services) ||
      attestation.appEnv.api !== policy.target || attestation.appEnv.worker !== policy.target ||
      (production && attestation.environmentId !== trusted.environmentId)) fail('Authoritative target identity mismatch');
  if (production) fail('Production executor not implemented');
  if (authorization !== `${claim.id}:${claim.candidate}`) fail('Exact reservation authorization required');
  return { target: 'staging', claim, identity: policy };
}

/** Largest presigned PUT lifetime in the given production sources; any unpinned issuer or definition refuses. */
export function grantWindowSeconds(sources) {
  if (!record(sources)) fail('Grant lifetime unknown: sources required');
  const files = Object.entries(sources);
  const pinned = role => GRANT_ISSUERS.filter(x => x.role === role).map(x => x.file).sort();
  const signers = files.filter(([, text]) => text.includes(presigner)).map(([file]) => file).sort();
  const callers = files.filter(([, text]) => caller.test(text)).map(([file]) => file).sort();
  for (const [found, role] of [[signers, 'signer'], [callers, 'caller']])
    if (found.some(file => !pinned(role).includes(file))) fail('Unknown presigned grant issuer');
  let max = 0;
  for (const issuer of GRANT_ISSUERS) {
    const text = sources[issuer.file];
    if (typeof text !== 'string' || text.split(issuer.definition).length !== 2) fail(`Grant lifetime unknown: ${issuer.file}`);
    if (issuer.seconds !== null) {
      if (!Number.isSafeInteger(issuer.seconds) || issuer.seconds < 1) fail('Grant lifetime unknown');
      max = Math.max(max, issuer.seconds);
    }
  }
  return max;
}

function timestamp(value) {
  if (typeof value !== 'string') return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}

function deployment(list, candidate) {
  return Array.isArray(list) && list.length === 1 && exact(list[0], ['id', 'status', 'sha']) && id.test(list[0].id) &&
    list[0].status === 'SUCCESS' && list[0].sha === candidate;
}

/** Fresh observation of closed ingress and absent producers, consumers, replicas and backends. Returns the closure record. */
export function evaluateQuiescence(observation, context) {
  if (!exact(context, ['operationId', 'candidate']) || !hex32.test(context.operationId) || !sha.test(context.candidate)) fail('Exact operation identity required');
  const o = observation;
  if (!exact(o, ['operationId', 'candidate', 'observedAt', 'issuerSha', 'readyz', 'deployments', 'workerLog', 'queueWorkers', 'heartbeat', 'otherBackends']))
    fail('Exact quiescence observation required');
  if (o.operationId !== context.operationId || o.candidate !== context.candidate) fail('Quiescence observation operation identity changed');
  if (!Number.isFinite(timestamp(o.observedAt))) fail('Quiescence observation requires database time');
  if (!exact(o.readyz, ['status', 'commitSha']) || o.readyz.status !== 'maintenance' || o.readyz.commitSha !== context.candidate)
    fail('Quiescence refused: ingress open');
  if (!exact(o.deployments, ['api', 'worker']) || !deployment(o.deployments.api, context.candidate) || !deployment(o.deployments.worker, context.candidate))
    fail('Quiescence refused: stale or non-candidate deployment');
  if (!exact(o.workerLog, ['paused', 'consumerStarted']) || o.workerLog.paused !== true || o.workerLog.consumerStarted !== false)
    fail('Quiescence refused: worker consumer started');
  if (!exact(o.queueWorkers, QUEUES) || QUEUES.some(q => o.queueWorkers[q] !== 0)) fail('Quiescence refused: queue workers present or unknown');
  if (o.heartbeat !== 'absent') fail('Quiescence refused: worker heartbeat present or unknown');
  if (!count(o.otherBackends) || o.otherBackends !== 0) fail('Quiescence refused: other database backends present or unknown');
  if (o.issuerSha !== context.candidate) fail('Grant lifetime unknown for the prior ingress issuer');
  return { operationId: o.operationId, candidate: o.candidate, closedAt: o.observedAt };
}

/** Repeated quiescent observation at least GRANT_WINDOW_SECONDS of database time after the recorded closure. */
export function evaluateWindow(closure, observation) {
  if (!exact(closure, ['operationId', 'candidate', 'closedAt']) || !Number.isFinite(timestamp(closure.closedAt))) fail('Exact recorded closure required');
  evaluateQuiescence(observation, { operationId: closure.operationId, candidate: closure.candidate });
  const elapsed = (timestamp(observation.observedAt) - timestamp(closure.closedAt)) / 1000;
  if (elapsed < 0) fail('Database clock regressed since closure');
  if (elapsed < GRANT_WINDOW_SECONDS) fail('Grant window open');
  return { ...closure, observedAt: observation.observedAt, elapsedSeconds: elapsed };
}

const dispositions = ['retain-reference', 'retain-protected', 'delete', 'refuse-if-nonempty', 'refuse-if-approved'];
const cfTriggers = ['auth', 'business', 'promotion', 'baseline'];

/**
 * Exact table/trigger/namespace plan for a later S2 transaction. Never cascades, never wildcards.
 * `DELETE` mode plans the admitted operator row disposal: no TRUNCATE is issued, so a pinned
 * migration TRUNCATE guard is retained rather than refused. Every other check is identical.
 */
export function planTables(manifest, live, { mode = 'RESTRICT', ...unknownOptions } = {}) {
  if (Object.keys(unknownOptions).length || !['RESTRICT', 'DELETE'].includes(mode)) fail('Exact clean-reset plan mode required');
  if (!exact(manifest, ['version', 'tables', 'migrationTriggers']) || manifest.version !== 1 || !record(manifest.tables) ||
      Object.values(manifest.tables).some(d => !dispositions.includes(d)) || !Array.isArray(manifest.migrationTriggers))
    fail('Exact clean-reset manifest required');
  const l = live;
  if (!exact(l, ['schemas', 'tables', 'foreignKeys', 'triggers', 'cfNamespaces', 'approvedDiagnosticCenters']) || !count(l.approvedDiagnosticCenters) ||
      ![l.schemas, l.tables, l.foreignKeys, l.triggers, l.cfNamespaces].every(Array.isArray) ||
      l.schemas.some(s => typeof s !== 'string') ||
      l.tables.some(t => !exact(t, ['schema', 'name', 'rows']) || t.schema !== 'public' || typeof t.name !== 'string' || !count(t.rows)) ||
      l.foreignKeys.some(k => !exact(k, ['name', 'from', 'to']) || typeof k.from !== 'string' || typeof k.to !== 'string') ||
      l.triggers.some(t => !exact(t, ['table', 'name', 'functionSchema', 'truncate']) || typeof t.table !== 'string' || typeof t.name !== 'string' || typeof t.truncate !== 'boolean') ||
      l.cfNamespaces.some(n => !exact(n, ['name', 'state', 'campaignRecords', 'listingManifest']) || typeof n.campaignRecords !== 'boolean' || typeof n.listingManifest !== 'boolean'))
    fail('Exact live inventory required');
  for (const schema of l.schemas) if (schema !== 'public' && !cf.test(schema)) fail(`Unknown schema ${schema}`);
  const namespaces = l.cfNamespaces.map(n => n.name).sort();
  if (namespaces.some(n => !cf.test(n)) || !same(namespaces, l.schemas.filter(s => s !== 'public').sort()) || new Set(namespaces).size !== namespaces.length)
    fail('Exact cf namespace inventory required');
  const rows = new Map();
  for (const table of l.tables) {
    if (!Object.hasOwn(manifest.tables, table.name)) fail(`Unknown live table public.${table.name}`);
    if (rows.has(table.name)) fail('Exact live inventory required');
    rows.set(table.name, table.rows);
  }
  if (rows.size !== Object.keys(manifest.tables).length) fail('Live table inventory incomplete');
  const truncate = new Set();
  for (const [name, disposition] of Object.entries(manifest.tables)) {
    if (disposition === 'refuse-if-nonempty' && rows.get(name) !== 0) fail(`Refused non-empty refuse-if-nonempty table public.${name}`);
    if (disposition === 'refuse-if-approved' && l.approvedDiagnosticCenters !== 0) fail(`Approved diagnostic center present in public.${name}`);
    if (!disposition.startsWith('retain')) truncate.add(`public.${name}`);
  }
  const known = name => name.startsWith('public.') && Object.hasOwn(manifest.tables, name.slice(7));
  for (const key of l.foreignKeys) {
    if (!known(key.from) || !known(key.to)) fail(`Unknown foreign key ${key.name}`);
    if (truncate.has(key.to) && !truncate.has(key.from)) fail(`Retained table references deleted table: ${key.from} -> ${key.to}`);
  }
  const detachTriggers = [];
  for (const trigger of l.triggers) {
    if (trigger.truncate && (mode !== 'DELETE' || trigger.functionSchema !== 'public' || !manifest.migrationTriggers.includes(`${trigger.table}.${trigger.name}`)))
      fail(`TRUNCATE trigger refused: ${trigger.name}`);
    if (!Object.hasOwn(manifest.tables, trigger.table)) fail(`Unknown trigger table ${trigger.table}`);
    if (trigger.functionSchema === 'public' && manifest.migrationTriggers.includes(`${trigger.table}.${trigger.name}`)) continue;
    if (namespaces.includes(trigger.functionSchema) && cfTriggers.some(s => trigger.name === `${trigger.functionSchema}_${s}`)) {
      detachTriggers.push({ namespace: trigger.functionSchema, table: `public.${trigger.table}`, trigger: trigger.name });
      continue;
    }
    fail(`Unknown trigger ${trigger.name} on public.${trigger.table}`);
  }
  for (const namespace of l.cfNamespaces) {
    if (namespace.state !== 'disposed')
      fail(`Nonterminal cf namespace ${namespace.name}; explicit abandonment after global fencing is unresolved S2 work`);
    if (!namespace.campaignRecords || namespace.listingManifest) fail(`Incomplete cf namespace ${namespace.name}`);
  }
  const key = x => `${x.table}\u0000${x.trigger}`;
  return {
    mode,
    [mode === 'DELETE' ? 'delete' : 'truncate']: [...truncate].sort(),
    retain: Object.entries(manifest.tables).filter(([, d]) => d.startsWith('retain')).map(([n]) => `public.${n}`).sort(),
    detachTriggers: detachTriggers.sort((a, b) => key(a).localeCompare(key(b))),
    redisExclusions: namespaces.map(n => `bull:email-code:de:campaign-${n}-`),
    retainedNamespaces: namespaces,
    // Detaching public row triggers does not prove a retained namespace is
    // inert to admissions and worker scans; S2 must prove that before restart.
    restartBlockers: namespaces.length ? ['cf-namespace-inertness-unproven'] : [],
  };
}

const phaseKeys = ['operationId', 'reservationId', 'owner', 'candidate', 'phase'];
const validPhase = value => exact(value, phaseKeys) && hex32.test(value.operationId) && hex32.test(value.reservationId) &&
  login.test(value.owner) && sha.test(value.candidate) && PHASES.includes(value.phase);

/** Durable phase ordering. Completed phases replay observe-only; nothing is skipped on a claimed completion. */
export function nextPhase(current, request) {
  if (!validPhase(request)) fail('Exact phase request required');
  if (current === null) {
    if (request.phase !== PHASES[0]) fail('Phase out of order');
    return { action: 'execute', phase: request.phase };
  }
  if (!validPhase(current)) fail('Exact phase record required');
  if (phaseKeys.some(k => k !== 'phase' && current[k] !== request[k])) fail('Clean-reset operation identity changed');
  const done = PHASES.indexOf(current.phase), next = PHASES.indexOf(request.phase);
  if (next <= done) return { action: 'observe', phase: request.phase };
  if (next !== done + 1) fail('Phase out of order');
  return { action: 'execute', phase: request.phase };
}
