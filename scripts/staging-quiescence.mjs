import { randomBytes } from 'node:crypto';
import { QUEUES } from './staging-clean-reset.mjs';
import { quiescenceProgram } from './staging-quiescence-remote.mjs';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const id = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(value);
const hash = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const fail = message => { throw new Error(`Quiescence refused: ${message}`); };
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pauseLine = 'Worker paused for photo conversion maintenance; no queue consumers started';

function validateRequest(request) {
  if (!exact(request, ['operationId', 'candidate', 'identity']) || !hash(request.operationId, 32) || !hash(request.candidate, 40)) fail('exact quiescence request required');
  const p = request.identity;
  if (!exact(p, ['projectId', 'environmentId', 'environmentName', 'services', 'credentialScope', 'origins']) ||
      !id(p.projectId) || !id(p.environmentId) || p.environmentName !== 'staging' || p.credentialScope !== `project:${p.projectId}:${p.environmentId}` ||
      !exact(p.services, ['api', 'worker']) || !id(p.services.api) || !id(p.services.worker) || p.services.api === p.services.worker ||
      !exact(p.origins, ['api', 'database', 'media', 'publicMedia'])) fail('exact scoped staging identity required');
  for (const [kind, raw] of Object.entries(p.origins)) {
    let url; try { url = new URL(raw); } catch { fail('target origins unavailable'); }
    if (url.username || url.password || url.search || url.hash ||
        (kind === 'database' && (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres.railway.internal')) ||
        (kind === 'media' && (url.protocol !== 'http:' || url.hostname !== 'minio.railway.internal')) ||
        (['api', 'publicMedia'].includes(kind) && (url.protocol !== 'https:' || url.origin !== raw))) fail('target origin overrides refused');
  }
}

// Field provenance: Railway's public CLI schema b62467ef1b5303e3e340283ed96425dcf9612993.
// ServiceInstance.activeDeployments explicitly means all deployed/running deployments.
async function readDeployments(platform, identity, candidate) {
  const result = {};
  for (const [role, serviceId] of Object.entries(identity.services)) {
    const { serviceInstance: instance } = await platform.query(`query quiescenceDeployments($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        serviceId environmentId
        latestDeployment { id status meta projectId environmentId serviceId createdAt instances { id status } }
        activeDeployments { id status meta projectId environmentId serviceId createdAt instances { id status } }
      }
    }`, { serviceId, environmentId: identity.environmentId });
    if (!exact(instance, ['serviceId', 'environmentId', 'latestDeployment', 'activeDeployments']) || instance.serviceId !== serviceId || instance.environmentId !== identity.environmentId ||
        !Array.isArray(instance.activeDeployments) || instance.activeDeployments.length !== 1) fail('sole active deployment inventory unavailable');
    const deployment = instance.activeDeployments[0];
    if (!exact(deployment, ['id', 'status', 'meta', 'projectId', 'environmentId', 'serviceId', 'createdAt', 'instances']) ||
        !id(deployment.id) || deployment.status !== 'SUCCESS' || deployment.meta?.commitHash !== candidate ||
        deployment.projectId !== identity.projectId || deployment.environmentId !== identity.environmentId || deployment.serviceId !== serviceId || !timestamp(deployment.createdAt) ||
        !Array.isArray(deployment.instances) || deployment.instances.length !== 1 || !exact(deployment.instances[0], ['id', 'status']) ||
        !id(deployment.instances[0].id) || deployment.instances[0].status !== 'RUNNING' || !equal(instance.latestDeployment, deployment)) fail('candidate deployment, instance or latest identity changed');
    result[role] = deployment;
  }
  return result;
}

// The public Query.deployments connection supports includeDeleted, first/after
// and pageInfo. Exhaust it rather than treating a latest deployment as history.
async function readHistory(platform, identity, deployments) {
  const histories = {};
  const statuses = ['BUILDING', 'CRASHED', 'DEPLOYING', 'FAILED', 'INITIALIZING', 'NEEDS_APPROVAL', 'QUEUED', 'REMOVED', 'REMOVING', 'SKIPPED', 'SLEEPING', 'SUCCESS', 'WAITING'];
  const instanceStatuses = ['CRASHED', 'CREATED', 'EXITED', 'INITIALIZING', 'REMOVED', 'REMOVING', 'RESTARTING', 'RUNNING', 'SKIPPED', 'STOPPED'];
  for (const [role, serviceId] of Object.entries(identity.services)) {
    const records = [], ids = new Set(), cursors = new Set();
    let after = null;
    // Resource bound is a refusal, never a successful truncated inventory.
    for (let page = 0; ; page++) {
      if (page >= 1000) fail('deployment history pagination bound exceeded');
      const { deployments: connection } = await platform.query(`query quiescenceHistory($input: DeploymentListInput!, $first: Int!, $after: String) {
        deployments(input: $input, first: $first, after: $after) {
          edges { cursor node { id status meta projectId environmentId serviceId createdAt updatedAt statusUpdatedAt deploymentStopped instances { id status } } }
          pageInfo { endCursor hasNextPage }
        }
      }`, { input: { projectId: identity.projectId, environmentId: identity.environmentId, serviceId, includeDeleted: true }, first: 100, after });
      if (!exact(connection, ['edges', 'pageInfo']) || !Array.isArray(connection.edges) || connection.edges.length > 100 ||
          !exact(connection.pageInfo, ['endCursor', 'hasNextPage']) || typeof connection.pageInfo.hasNextPage !== 'boolean') fail('deployment history pagination unavailable');
      for (const edge of connection.edges) {
        if (!exact(edge, ['cursor', 'node']) || typeof edge.cursor !== 'string' || !edge.cursor || cursors.has(edge.cursor)) fail('deployment history cursor ambiguous');
        cursors.add(edge.cursor);
        const d = edge.node;
        if (!exact(d, ['id', 'status', 'meta', 'projectId', 'environmentId', 'serviceId', 'createdAt', 'updatedAt', 'statusUpdatedAt', 'deploymentStopped', 'instances']) ||
            !id(d.id) || ids.has(d.id) || !statuses.includes(d.status) || !hash(d.meta?.commitHash, 40) ||
            d.projectId !== identity.projectId || d.environmentId !== identity.environmentId || d.serviceId !== serviceId ||
            !timestamp(d.createdAt) || !timestamp(d.updatedAt) || (d.statusUpdatedAt !== null && !timestamp(d.statusUpdatedAt)) ||
            typeof d.deploymentStopped !== 'boolean' || !Array.isArray(d.instances) || d.instances.some(i => !exact(i, ['id', 'status']) || !id(i.id) || !instanceStatuses.includes(i.status)) ||
            new Set(d.instances.map(i => i.id)).size !== d.instances.length) fail('deployment history identity or commit binding unavailable');
        ids.add(d.id);
        // Every API record is a possible issuer, including an older deployment of
        // the same SHA. These flags are observations, not restart/lifetime proof.
        if (d.id !== deployments[role].id && (!['CRASHED', 'FAILED', 'REMOVED', 'SKIPPED'].includes(d.status) || d.deploymentStopped !== true ||
            d.instances.some(i => !['CRASHED', 'EXITED', 'REMOVED', 'SKIPPED', 'STOPPED'].includes(i.status)))) fail('prior deployment stop state ambiguous');
        records.push(d);
      }
      const { endCursor, hasNextPage } = connection.pageInfo;
      if (connection.edges.length === 0 ? endCursor !== null || hasNextPage : endCursor !== connection.edges.at(-1).cursor) fail('deployment history continuation incomplete');
      if (!hasNextPage) break;
      after = endCursor;
    }
    const current = records.find(d => d.id === deployments[role].id);
    if (!current || current.deploymentStopped || !equal(Object.fromEntries(Object.keys(deployments[role]).map(key => [key, current[key]])), deployments[role])) fail('deployment history current candidate binding unavailable');
    histories[role] = records;
  }
  return histories;
}

async function readVariables(platform, identity, role) {
  const { variables } = await platform.query(`query quiescenceVariables($projectId: String!, $environmentId: String!, $serviceId: String!) {
    variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
  }`, { projectId: identity.projectId, environmentId: identity.environmentId, serviceId: identity.services[role] });
  if (!variables || variables.APP_ENV !== 'staging' || variables.PHOTO_CONVERSION_MAINTENANCE !== 'true') fail('maintenance configuration unavailable');
  let redis; try { redis = new URL(variables.REDIS_URL); } catch { fail('Redis scope unavailable'); }
  if (!['redis:', 'rediss:'].includes(redis.protocol) || redis.hostname !== 'redis.railway.internal' || redis.search || redis.hash || !/^\/\d*$/.test(redis.pathname)) fail('Redis scope unavailable');
  redis.username = ''; redis.password = '';
  const scope = role === 'worker' ? variables.OPERATIONS_SCOPE ?? 'development' : null;
  if (role === 'worker' && (typeof scope !== 'string' || !/^[a-z0-9-]{1,48}$/.test(scope))) fail('worker heartbeat scope unavailable');
  return { redisOrigin: redis.toString(), operationsScope: scope };
}

async function readRemote(platform, request, deployment, role, configuration) {
  const p = request.identity;
  const input = { operationId: request.operationId, candidate: request.candidate, projectId: p.projectId, environmentId: p.environmentId,
    serviceId: p.services[role], deploymentId: deployment.id, role, nonce: randomBytes(16).toString('hex'),
    redisOrigin: configuration.redisOrigin, databaseOrigin: p.origins.database, operationsScope: configuration.operationsScope };
  const encoded = Buffer.from(quiescenceProgram(input)).toString('base64');
  let output;
  try {
    output = await platform.command('railway', ['ssh', '--project', p.projectId, '--environment', p.environmentId, '--service', p.services[role],
      '--', 'node', '-e', `"eval(Buffer.from('${encoded}','base64').toString())"`]);
  } catch { fail('remote observation failed; diagnostics suppressed'); }
  // No banners or extra structured outputs are accepted as evidence.
  let receipt; try { receipt = JSON.parse(output.trim()); } catch { fail('exact remote observation unavailable'); }
  const common = ['operationId', 'candidate', 'nonce', 'role', 'projectId', 'environmentId', 'serviceId', 'deploymentId'];
  const fields = role === 'worker' ? ['queueWorkers', 'activeJobs', 'heartbeat', 'heartbeatKey'] : ['readyz', 'healthz', 'observedAt', 'otherBackends'];
  if (!exact(receipt, [...common, ...fields]) || common.some(key => receipt[key] !== input[key])) fail('remote observation is stale or has ambiguous identity');
  if (role === 'worker') {
    if (!exact(receipt.activeJobs, QUEUES) || QUEUES.some(queue => receipt.activeJobs[queue] !== 0)) fail('active queue jobs present or unknown');
    if (!exact(receipt.queueWorkers, QUEUES) || QUEUES.some(queue => receipt.queueWorkers[queue] !== 0) || receipt.heartbeat !== 'absent' ||
        receipt.heartbeatKey !== `operations:${configuration.operationsScope}:worker`) fail('queue workers or scoped heartbeat present or unknown');
  } else {
    verifyIngress(receipt, request.candidate);
    if (!timestamp(receipt.observedAt) || new Date(receipt.observedAt).toISOString() !== receipt.observedAt || receipt.otherBackends !== 0) fail('database time or other client backends unavailable');
  }
  return receipt;
}

function verifyIngress(value, candidate) {
  if (!exact(value.readyz, ['status', 'service', 'maintenance', 'businessReady']) || value.readyz.status !== 'maintenance' || value.readyz.service !== 'api' || value.readyz.maintenance !== 'photo-conversion' || value.readyz.businessReady !== false ||
      !exact(value.healthz, ['status', 'service', 'maintenance', 'commitSha']) || value.healthz.status !== 'ok' || value.healthz.service !== 'api' || value.healthz.maintenance !== 'photo-conversion' || value.healthz.commitSha !== candidate) fail('maintenance readyz/healthz identity unavailable');
}

/**
 * Fresh read-only Railway/HTTP/process observations, never caller proof JSON.
 * Deliberately cannot emit an evaluateQuiescence/evaluateWindow proof until the
 * prior issuer lifetimes, continuous closure and complete history have authority.
 * No executor, controller or ledger capability is used here.
 */
export async function observeQuiescence(platform, request) {
  validateRequest(request);
  // Own the input across awaits; a caller cannot change the target mid-read.
  const target = structuredClone(request), identity = target.identity;
  await platform.attest(identity);
  const deployments = await readDeployments(platform, identity, target.candidate);
  const history = await readHistory(platform, identity, deployments);
  const apiConfig = await readVariables(platform, identity, 'api');
  const workerConfig = await readVariables(platform, identity, 'worker');
  if (apiConfig.redisOrigin !== workerConfig.redisOrigin || apiConfig.redisOrigin !== platform.redisOrigin) fail('API and worker Redis scopes differ');

  const { deploymentLogs: logs } = await platform.query(`query quiescenceLogs($deploymentId: String!, $limit: Int) {
    deploymentLogs(deploymentId: $deploymentId, limit: $limit) { message timestamp tags { projectId environmentId serviceId deploymentId deploymentInstanceId } }
  }`, { deploymentId: deployments.worker.id, limit: 5000 });
  if (!Array.isArray(logs) || logs.length === 0 || logs.length >= 5000) fail('worker log read missing or truncated');
  for (const log of logs) {
    if (!exact(log, ['message', 'timestamp', 'tags']) || typeof log.message !== 'string' || !timestamp(log.timestamp) ||
        Date.parse(log.timestamp) < Date.parse(deployments.worker.createdAt) || !exact(log.tags, ['projectId', 'environmentId', 'serviceId', 'deploymentId', 'deploymentInstanceId']) ||
        log.tags.projectId !== identity.projectId || log.tags.environmentId !== identity.environmentId || log.tags.serviceId !== identity.services.worker ||
        log.tags.deploymentId !== deployments.worker.id || log.tags.deploymentInstanceId !== deployments.worker.instances[0].id) fail('worker log identity or timestamp unavailable');
    if (log.message.includes('Worker started (BullMQ consumer)')) fail('worker consumer startup observed');
  }
  if (!logs.some(log => log.message === pauseLine)) fail('worker maintenance pause log unavailable');

  await readRemote(platform, target, deployments.worker, 'worker', workerConfig);
  const api = await readRemote(platform, target, deployments.api, 'api', apiConfig);
  const ingress = {};
  for (const path of ['readyz', 'healthz']) {
    try {
      const response = await platform.fetch(`${identity.origins.api}/${path}`, { redirect: 'error', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
      if (response.status !== 200) fail('public maintenance ingress read unavailable');
      ingress[path] = await response.json();
    } catch { fail('public maintenance ingress read unavailable; diagnostics suppressed'); }
  }
  verifyIngress(ingress, target.candidate);
  if (!equal(api.readyz, ingress.readyz) || !equal(api.healthz, ingress.healthz)) fail('public ingress and exact deployment responses differ');
  // Bracket the runtime reads with a fresh inventory to refuse a deployment race.
  const after = await readDeployments(platform, identity, target.candidate);
  if (!equal(deployments, after)) fail('deployment identity changed during observation');
  const historyAfter = await readHistory(platform, identity, after);
  if (!equal(history, historyAfter)) fail('deployment history changed during observation');
  if (logs.some(log => Date.parse(log.timestamp) > Date.parse(api.observedAt))) fail('worker log is newer than database observation');
  // History binds possible prior issuers to commits, but cannot establish their
  // actual issued-grant TTLs, uninterrupted closure, non-resumability or retained
  // deleted-history completeness. Bounded logs also lack a completeness receipt.
  const error = new Error('Quiescence refused: prior issuer lifetime and continuous window authority unavailable; deployment terminal/restart authority unavailable; deleted-history retention authority unavailable; worker log retention/completeness authority unavailable');
  error.code = 'QUIESCENCE_EVIDENCE_GAP';
  error.gaps = Object.freeze(['prior-issuer-lifetime-and-window', 'deployment-terminal-restart-semantics', 'deleted-history-retention', 'worker-log-completeness']);
  // No observation/closure is returned, including when all other reads passed.
  throw error;
}
