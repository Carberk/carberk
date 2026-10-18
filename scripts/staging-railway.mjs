import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { remoteProgram } from './staging-remote.mjs';

const run = promisify(execFile);
const endpoint = 'https://backboard.railway.com/graphql/v2';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function origin(value, database = false) {
  let url; try { url = new URL(value); } catch { throw new Error('Railway origin unavailable'); }
  if (url.search || url.hash) throw new Error('Railway origin overrides refused');
  if (!database && (url.username || url.password)) throw new Error('Credential-bearing media origin refused');
  url.username = ''; url.password = '';
  return database ? url.toString().replace(/\/$/, '') : url.origin;
}

/** Railway network and remote-process boundary. No raw variables, logs or stderr leave it. */
export class RailwayPlatform {
  constructor({ token, fetch = globalThis.fetch, command, authorization }) {
    Object.assign(this, { token, fetch, authorization });
    this.command = command ?? (async (program, args) => {
      try { return (await run(program, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, RAILWAY_TOKEN: this.token, RAILWAY_CALLER: 'skill:use-railway@1.1.3', RAILWAY_AGENT_SESSION: 'staging-control-901' } })).stdout; }
      catch { throw new Error('Railway process failed; diagnostics suppressed'); }
    });
  }
  async authorize(claim) {
    if (this.authorization !== `${claim.id}:${claim.candidate}`) throw new Error('Explicit reviewed reservation mutation authorization required');
  }
  async query(query, variables = {}) {
    if (!this.token) throw new Error('Scoped Railway project token required');
    try {
      const response = await this.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Project-Access-Token': this.token },
        body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
      const value = await response.json();
      if (!response.ok || value.errors || !value.data) throw new Error();
      return value.data;
    } catch { throw new Error('Railway authoritative request failed; diagnostics suppressed'); }
  }
  async attest(policy, { requireMock = true } = {}) {
    if (policy.environmentName !== 'staging') throw new Error('Production or ambiguous identity refused');
    const data = await this.query(`query identity($id: String!) { projectToken { projectId environmentId }
      project(id: $id) { id environments { edges { node { id name } } } services { edges { node { id } } } } }`, { id: policy.projectId });
    if (data.projectToken.projectId !== policy.projectId || data.projectToken.environmentId !== policy.environmentId || data.project.id !== policy.projectId) throw new Error('Railway credential scope mismatch');
    const environments = data.project.environments.edges.map(x => x.node);
    if (environments.filter(x => x.id === policy.environmentId && x.name === 'staging').length !== 1) throw new Error('Authoritative staging identity refused');
    for (const id of Object.values(policy.services)) {
      if (!data.project.services.edges.some(x => x.node.id === id)) throw new Error('Wrong Railway service');
    }
    for (const [role, serviceId] of Object.entries(policy.services)) {
      const scope = { projectId: policy.projectId, environmentId: policy.environmentId, serviceId };
      const { variables: vars } = await this.query(`query vars($projectId: String!, $environmentId: String!, $serviceId: String!) {
        variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`, scope);
      if (['api', 'worker'].includes(role)) {
        if (vars.APP_ENV !== 'staging' || origin(vars.DATABASE_URL, true) !== policy.origins.database || origin(vars.MINIO_ENDPOINT) !== policy.origins.media ||
            (role === 'api' && ((requireMock && vars.SMS_DRIVER !== 'mock') || origin(vars.MINIO_PUBLIC_URL) !== policy.origins.publicMedia)) ||
            (requireMock && role === 'worker' && (vars.EMAIL_DRIVER !== 'mock' || vars.PUSH_TRANSPORT !== 'test'))) throw new Error('Railway data/media origins or mock delivery refused');
      }
      if (role === 'api') {
        const { domains } = await this.query(`query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
          domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) { serviceDomains { domain } customDomains { domain } } }`, scope);
        if (![...domains.serviceDomains, ...domains.customDomains].some(x => `https://${x.domain}` === policy.origins.api)) throw new Error('API origin is not authoritative staging domain');
        const { serviceInstance } = await this.query(`query config($serviceId: String!, $environmentId: String!) {
          serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { preDeployCommand } }`, scope);
        const commands = serviceInstance.preDeployCommand;
        if (!equal(Array.isArray(commands) ? commands : [commands], ['pnpm --filter @auto-tm/db migrate:deploy'])) throw new Error('API predeploy migration ownership changed');
      }
    }
    return structuredClone(policy);
  }
  async remote(kind, lease, target) {
    const payload = { kind, candidate: lease.candidate, profile: lease.fixtureProfile, id: lease.id, namespace: lease.namespace, target, identity: lease.identity,
      expectedMigrations: lease.operation?.expectedMigrations ?? lease.expectedMigrations,
      schemaDisposition: lease.operation?.schemaDisposition ?? lease.schemaDisposition ?? 'unchanged' };
    const encoded = Buffer.from(remoteProgram(payload)).toString('base64');
    const output = await this.command('railway', ['ssh', '--project', lease.identity.projectId,
      '--environment', lease.identity.environmentId, '--service', lease.identity.services.api,
      '--', 'node', '-e', `"eval(Buffer.from('${encoded}','base64').toString())"`]);
    // Ignore SSH banners; accept only one structured receipt, never print the remote stream.
    const lines = output.trim().split('\n').filter(x => x.startsWith('{'));
    if (lines.length !== 1) throw new Error('Remote operation receipt unavailable');
    let result; try { result = JSON.parse(lines[0]); } catch { throw new Error('Remote receipt invalid'); }
    if (!['present', 'absent'].includes(result.fixtures) || (kind !== 'probe' && result.namespace !== lease.namespace)) throw new Error('Remote namespace proof unavailable');
    if (lease.fixtureProfile === 'campaign897-identities-v1') this.campaignReceipt(lease, result);
    return result;
  }
  campaignReceipt(lease, result) {
    if (result.profile !== lease.fixtureProfile || result.candidate !== lease.candidate || result.namespace !== lease.namespace ||
        result.protectedReceipt !== `${lease.namespace}.campaign_entities` ||
        !['identities', 'disposed'].includes(result.state) || result.identities !== (result.state === 'identities' ? 4 : 0) ||
        result.fixtures !== (result.state === 'identities' ? 'present' : 'absent')) throw new Error('Reserved campaign proof incomplete');
  }
  async deployment(id) {
    const { deployment } = await this.query(`query deployment($id: String!) { deployment(id: $id) { id status meta } }`, { id });
    return deployment;
  }
  async execute(kind, lease, target, recordDeployment) {
    await this.authorize(lease);
    await this.attest(lease.identity);
    if (['fixture', 'reset'].includes(kind)) {
      if (lease.fixtureProfile === 'campaign897-identities-v1') await this.verify(lease, target, { deployments: lease.deployments });
      const receipt = await this.remote(kind, lease, target);
      if (kind === 'fixture' && lease.fixtureProfile !== 'campaign897-identities-v1') {
        await this.fixtureVisible(lease, receipt);
      }
      return receipt;
    }
    if (!['deploy', 'restore'].includes(kind)) throw new Error('Unsupported Railway operation');
    const deployments = {};
    for (const [role, serviceId] of Object.entries(lease.identity.services)) {
      const data = await this.query(`mutation deploy($serviceId: String!, $environmentId: String!, $commitSha: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha) }`,
      { serviceId, environmentId: lease.identity.environmentId, commitSha: target });
      const id = data.serviceInstanceDeployV2;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Deployment ID unavailable; inspect recovery state');
      if (!recordDeployment) throw new Error('Durable deployment journal required');
      await recordDeployment(role, id);
      deployments[role] = id;
    }
    const deadline = Date.now() + 20 * 60 * 1000;
    for (const id of Object.values(deployments)) {
      while (true) {
        const current = await this.deployment(id);
        if (current.status === 'SUCCESS') break;
        if (['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(current.status) || Date.now() >= deadline) throw new Error('Deployment incomplete; retain reservation');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (kind === 'restore') await this.remote('reset', lease, target);
    return { deployments };
  }
  async fixtureVisible(lease, receipt) {
    if (typeof receipt.listingId !== 'string' || typeof receipt.sellerId !== 'string') throw new Error('Owned application fixture receipt required');
    const response = await this.fetch(`${lease.identity.origins.api}/api/v1/listings/${encodeURIComponent(receipt.listingId)}`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const listing = await response.json();
    if (!response.ok || listing.id !== receipt.listingId || listing.sellerId !== receipt.sellerId || listing.status !== 'active') throw new Error('Deployed application fixture read failed');
  }
  async recover(lease, target, result) {
    const receipt = await this.verify(lease, target, result);
    if (lease.operation.kind === 'fixture' && lease.fixtureProfile !== 'campaign897-identities-v1') await this.fixtureVisible(lease, receipt);
    return receipt;
  }
  async verify(lease, target, result) {
    await this.attest(lease.identity);
    if (!result?.deployments || Object.keys(result.deployments).length !== Object.keys(lease.identity.services).length) throw new Error('Exact deployment IDs required');
    for (const [role, serviceId] of Object.entries(lease.identity.services)) {
      const id = result.deployments[role]; const current = await this.deployment(id);
      const instance = await this.query(`query active($serviceId: String!, $environmentId: String!) {
        serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { latestDeployment { id status } } }`,
      { serviceId, environmentId: lease.identity.environmentId });
      if (current.id !== id || current.status !== 'SUCCESS' || current.meta?.commitHash !== target || instance.serviceInstance.latestDeployment?.id !== id || instance.serviceInstance.latestDeployment?.status !== 'SUCCESS') throw new Error('Actual deployed candidate mismatch');
    }
    const response = await this.fetch(`${lease.identity.origins.api}/readyz`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const ready = await response.json();
    if (!response.ok || ready.status !== 'ready' || ready.commitSha !== target || ready.environment !== 'staging' || ['postgres', 'redis', 'minio'].some(x => ready.checks?.[x] !== 'ok')) throw new Error('Backend readiness or SHA mismatch');
    const { deploymentLogs } = await this.query(`query logs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) { message } }`, { deploymentId: result.deployments.worker, limit: 500 });
    if (!deploymentLogs.some(x => x.message.includes('Worker started (BullMQ consumer)'))) throw new Error('Current worker boot evidence unavailable');
    const probe = await this.remote('probe', lease, target);
    if (probe.sha !== target || probe.schema !== (lease.operation?.schemaDisposition ?? lease.schemaDisposition ?? 'unchanged') ||
        !equal(probe.migrations, lease.operation?.expectedMigrations ?? lease.expectedMigrations)) throw new Error('Runtime schema proof unavailable');
    return { ...(lease.fixtureProfile === 'campaign897-identities-v1' ? { profile: probe.profile, candidate: probe.candidate, namespace: probe.namespace, state: probe.state, identities: probe.identities, protectedReceipt: probe.protectedReceipt, retainedAudits: probe.retainedAudits, tombstone: probe.tombstone } : {}), sha: target, readyz: true, worker: true, media: true, mock: true, fixtures: probe.fixtures, schema: probe.schema, migrations: probe.migrations, listingId: probe.listingId, sellerId: probe.sellerId };
  }

}
