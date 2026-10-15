import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const endpoint = 'https://backboard.railway.com/graphql/v2';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function origin(value, database = false) {
  let url; try { url = new URL(value); } catch { throw new Error('Railway origin unavailable'); }
  if (url.search || url.hash) throw new Error('Railway origin overrides refused');
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
  async attest(policy) {
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
            (role === 'api' && (vars.SMS_DRIVER !== 'mock' || origin(vars.MINIO_PUBLIC_URL) !== policy.origins.publicMedia)) ||
            (role === 'worker' && (vars.EMAIL_DRIVER !== 'mock' || vars.PUSH_TRANSPORT !== 'test'))) throw new Error('Railway data/media origins or mock delivery refused');
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
}
