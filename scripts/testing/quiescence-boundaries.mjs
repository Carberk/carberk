import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { RailwayPlatform } from '../staging-railway.mjs';

export const target = {
  operationId: '1'.repeat(32), candidate: 'a'.repeat(40),
  identity: { projectId: 'project', environmentId: 'stage', environmentName: 'staging',
    services: { api: 'api', worker: 'worker' }, credentialScope: 'project:project:stage',
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example', api: 'https://api.example' } },
};
const names = ['video-transcode', 'notification-fanout', 'orphan-cleanup', 'account-purge', 'retired-upload-cleanup',
  'listing-view-retention', 'measurement-retention', 'measurement-outbox', 'service-lifecycle', 'service-push', 'diagnostic-artifacts', 'email-code'];

/** Transparent network/process/Redis/PostgreSQL boundary fakes. No real services. */
export function quiescenceBoundary() {
  const state = {
    effects: [], mutations: [], executorCalls: 0, remoteErrors: [], receipts: [], queueNames: [], heartbeatKeys: [], sql: [],
    scope: { projectId: 'project', environmentId: 'stage' },
    variables: {}, instances: {}, histories: {}, historyRequests: [], activeReads: [], env: {}, workers: Object.fromEntries(names.map(name => [name, []])), activeJobs: Object.fromEntries(names.map(name => [name, []])), heartbeat: null,
    database: { observedAt: '2026-10-21T12:00:00.000Z', otherBackends: 0, completeVisibility: true, trackActivities: 'on' },
    readyz: { status: 'maintenance', service: 'api', maintenance: 'photo-conversion', businessReady: false },
    healthz: { status: 'ok', service: 'api', maintenance: 'photo-conversion', commitSha: target.candidate },
    logs: [{ message: 'Worker paused for photo conversion maintenance; no queue consumers started', timestamp: '2026-10-21T11:59:30.000Z',
      tags: { projectId: 'project', environmentId: 'stage', serviceId: 'worker', deploymentId: 'deployment-worker', deploymentInstanceId: 'instance-worker' } }],
  };
  for (const role of ['api', 'worker']) {
    state.variables[role] = { APP_ENV: 'staging', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', PUSH_TRANSPORT: 'test', PHOTO_CONVERSION_MAINTENANCE: 'true', OPERATIONS_SCOPE: 'stage-ops',
      DATABASE_URL: 'postgresql://user:SECRET@postgres.railway.internal:5432/railway', REDIS_URL: 'redis://user:SECRET@redis.railway.internal:6379/0',
      MINIO_ENDPOINT: target.identity.origins.media, MINIO_PUBLIC_URL: target.identity.origins.publicMedia };
    state.env[role] = { ...state.variables[role], RAILWAY_PROJECT_ID: 'project', RAILWAY_ENVIRONMENT_ID: 'stage', RAILWAY_ENVIRONMENT_NAME: 'staging',
      RAILWAY_SERVICE_ID: role, RAILWAY_DEPLOYMENT_ID: `deployment-${role}`, AUTOTM_COMMIT_SHA: target.candidate };
    const deployment = { id: `deployment-${role}`, status: 'SUCCESS', meta: { commitHash: target.candidate }, projectId: 'project', environmentId: 'stage', serviceId: role,
      createdAt: '2026-10-21T11:59:00.000Z', instances: [{ id: `instance-${role}`, status: 'RUNNING' }] };
    state.instances[role] = { serviceId: role, environmentId: 'stage', latestDeployment: deployment, activeDeployments: [deployment] };
    state.histories[role] = [{ ...structuredClone(deployment), updatedAt: deployment.createdAt, statusUpdatedAt: deployment.createdAt, deploymentStopped: false }];
  }
  const fetch = async (url, options) => {
    if (url.startsWith(target.identity.origins.api) || url.startsWith('http://127.0.0.1:3006')) {
      state.effects.push(url);
      if (state.publicHttpError && url.startsWith('https:')) throw new Error('SECRET provider failure');
      const key = url.endsWith('/readyz') ? 'readyz' : 'healthz';
      const value = state[url.startsWith('http:') ? `local${key}` : `public${key}`] ?? state[key];
      return { status: state.httpStatus ?? 200, json: async () => structuredClone(value) };
    }
    assert.equal(url, 'https://backboard.railway.com/graphql/v2');
    assert.equal(options.headers['Project-Access-Token'], 'scoped-boundary-token');
    const { query, variables } = JSON.parse(options.body);
    state.effects.push(query);
    if (/\bmutation\b/.test(query)) { state.mutations.push(query); throw new Error('Mutation forbidden'); }
    let data;
    if (query.includes('projectToken')) data = { projectToken: state.scope, project: { id: 'project', environments: { edges: [{ node: { id: 'stage', name: state.environmentName ?? 'staging' } }] }, services: { edges: [{ node: { id: 'api' } }, { node: { id: 'worker' } }] } } };
    else if (query.includes('deployments(input:')) {
      assert.deepEqual(variables.input, { projectId: 'project', environmentId: 'stage', serviceId: variables.input.serviceId, includeDeleted: true });
      assert.equal(variables.first, 100);
      assert.ok(['api', 'worker'].includes(variables.input.serviceId));
      state.historyRequests.push(structuredClone(variables));
      const history = state.histories[variables.input.serviceId];
      const start = variables.after === null ? 0 : Number(variables.after.slice(7)) + 1;
      const edges = history.slice(start, start + (state.historyPageSize ?? 100)).map((node, index) => ({ cursor: `cursor-${start + index}`, node }));
      let connection = { edges, pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage: start + edges.length < history.length } };
      if (state.transformHistory) connection = state.transformHistory(structuredClone(connection), variables, state.historyRequests.length);
      data = { deployments: connection };
    } else if (query.includes('activeDeployments')) {
      state.inventoryReads = (state.inventoryReads ?? 0) + 1;
      if (state.changeInventory) state.changeInventory(variables.serviceId, state.inventoryReads);
      data = { serviceInstance: state.instances[variables.serviceId] };
    } else if (query.includes('variables(')) data = { variables: state.variables[variables.serviceId] };
    else if (query.includes('domains(')) data = { domains: { serviceDomains: [{ domain: 'api.example' }], customDomains: [] } };
    else if (query.includes('preDeployCommand')) data = { serviceInstance: { preDeployCommand: ['pnpm --filter @auto-tm/db migrate:deploy'] } };
    else if (query.includes('deploymentLogs')) { assert.equal(variables.deploymentId, 'deployment-worker'); data = { deploymentLogs: state.logs }; }
    else throw new Error('Unexpected network query');
    return { ok: true, json: async () => ({ data: structuredClone(data) }) };
  };
  const command = async (program, args) => {
    assert.equal(program, 'railway');
    assert.deepEqual(args.slice(0, 6), ['ssh', '--project', 'project', '--environment', 'stage', '--service']);
    assert.deepEqual(args.slice(7, 10), ['--', 'node', '-e']);
    const role = args[6];
    assert.ok(['api', 'worker'].includes(role));
    state.effects.push(`remote:${role}`);
    const match = args.at(-1).match(/Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)/);
    assert.ok(match);
    const source = Buffer.from(match[1], 'base64').toString();
    const process = { env: structuredClone(state.env[role]), exitCode: 0 };
    const output = [];
    const require = module => {
      if (module === 'bullmq/package.json') return { version: state.bullmqVersion ?? '5.76.8' };
      if (module === 'bullmq') return { Queue: class {
        constructor(name, options) {
          if (options.skipMetasUpdate !== true) { state.mutations.push('queue meta write'); throw new Error('meta mutation'); }
          assert.equal(options.connection.url, state.env.worker.REDIS_URL);
          this.name = name; state.queueNames.push(name);
          this.toKey = suffix => `bull:${name}:${suffix}`;
          this.client = Promise.resolve({
            get: async key => { state.heartbeatKeys.push(key); return state.heartbeat; },
            llen: async key => {
              assert.equal(key, `bull:${name}:active`);
              state.activeReads.push(key);
              if (state.activeReadError) throw new Error('SECRET Redis failure');
              return Object.hasOwn(state.activeReplies ?? {}, name) ? state.activeReplies[name] : state.activeJobs[name].length;
            },
          });
        }
        on() {}
        async getWorkers() { if (state.queueError) throw new Error('SECRET queue failure'); return state.workers[this.name]; }
        async close() {}
      } };
      if (module === 'node:child_process') return { spawnSync: (cmd, args, options) => {
        assert.equal(cmd, 'psql');
        assert.deepEqual(Array.from(args), ['-X', '--no-psqlrc', '-qAt', '-v', 'ON_ERROR_STOP=1']);
        assert.equal(options.env.PGHOSTADDR, undefined);
        assert.equal(options.env.PGSERVICE, undefined);
        assert.equal(options.env.PGOPTIONS, '-c default_transaction_read_only=on -c statement_timeout=15000');
        if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(options.input)) state.mutations.push(options.input);
        assert.ok(options.input.includes("pg_has_role(current_user, 'pg_read_all_stats', 'USAGE')"));
        state.sql.push(options.input);
        return state.sqlResult ?? { status: 0, stdout: JSON.stringify(state.database) };
      } };
      throw new Error(`Unexpected module ${module}`);
    };
    await runInNewContext(source, { process, require, URL, AbortSignal, fetch, console: { log: value => output.push(value), error: value => state.remoteErrors.push(value) } });
    if (process.exitCode !== 0) throw new Error('remote failure SECRET');
    let receipt = JSON.parse(output.join('\n'));
    if (state.transformReceipt) receipt = state.transformReceipt(receipt);
    state.receipts.push(receipt);
    return state.remoteOutput ?? JSON.stringify(receipt);
  };
  const platform = new RailwayPlatform({ token: 'scoped-boundary-token', fetch, command });
  // Explicit refusal invariant: an executor is a forbidden capability at this seam.
  platform.execute = async () => { state.executorCalls++; throw new Error('Forbidden executor activation'); };
  return { state, platform };
}
