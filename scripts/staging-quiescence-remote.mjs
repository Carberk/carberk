/** Fixed observation program. No caller SQL, shell, queue action or application bootstrap. */
export function quiescenceProgram(input) {
  return `(${readQuiescenceRemote.toString()})(${JSON.stringify(input)})`;
}

async function readQuiescenceRemote(input) {
  const e = process.env;
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  const fail = () => { throw new Error('Remote quiescence observation unavailable'); };
  const origin = (raw, database) => {
    const url = new URL(raw);
    if (url.search || url.hash || (database ? !['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres.railway.internal'
      : !['redis:', 'rediss:'].includes(url.protocol) || url.hostname !== 'redis.railway.internal' || !/^\/\d*$/.test(url.pathname))) fail();
    url.username = ''; url.password = '';
    return database ? url.toString().replace(/\/$/, '') : url.toString();
  };
  try {
    if (!exact(input, ['operationId', 'candidate', 'projectId', 'environmentId', 'serviceId', 'deploymentId', 'role', 'nonce', 'redisOrigin', 'databaseOrigin', 'operationsScope']) ||
        typeof input.operationId !== 'string' || !/^[a-f0-9]{32}$/.test(input.operationId) || typeof input.candidate !== 'string' || !/^[a-f0-9]{40}$/.test(input.candidate) ||
        typeof input.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(input.nonce) || !['api', 'worker'].includes(input.role) ||
        ['projectId', 'environmentId', 'serviceId', 'deploymentId'].some(key => typeof input[key] !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(input[key]))) fail();
    if (e.RAILWAY_PROJECT_ID !== input.projectId || e.RAILWAY_ENVIRONMENT_ID !== input.environmentId || e.RAILWAY_SERVICE_ID !== input.serviceId ||
        e.RAILWAY_DEPLOYMENT_ID !== input.deploymentId || e.RAILWAY_ENVIRONMENT_NAME !== 'staging' || e.APP_ENV !== 'staging' ||
        e.AUTOTM_COMMIT_SHA !== input.candidate || e.PHOTO_CONVERSION_MAINTENANCE !== 'true' ||
        origin(e.DATABASE_URL, true) !== input.databaseOrigin || origin(e.REDIS_URL, false) !== input.redisOrigin) fail();
    const receipt = { operationId: input.operationId, candidate: input.candidate, nonce: input.nonce, role: input.role,
      projectId: input.projectId, environmentId: input.environmentId, serviceId: input.serviceId, deploymentId: input.deploymentId };
    if (input.role === 'worker') {
      const scope = e.OPERATIONS_SCOPE ?? 'development'; // OperationsConfig default, not a staging-name assumption.
      if (!/^[a-z0-9-]{1,48}$/.test(scope) || scope !== input.operationsScope) fail();
      // Queue's constructor otherwise writes the meta hash. Pin the audited behavior.
      if (require('bullmq/package.json').version !== '5.76.8') fail();
      const { Queue } = require('bullmq');
      const queues = ['video-transcode', 'notification-fanout', 'orphan-cleanup', 'account-purge', 'retired-upload-cleanup',
        'listing-view-retention', 'measurement-retention', 'measurement-outbox', 'service-lifecycle', 'service-push', 'diagnostic-artifacts', 'email-code'];
      const workers = {};
      // Sequential reads, one bounded non-cluster connection per queue. No Worker is constructed.
      for (const name of queues) {
        const queue = new Queue(name, { skipMetasUpdate: true, connection: { url: e.REDIS_URL,
          maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 8000, commandTimeout: 8000 } });
        queue.on('error', () => {});
        try {
          const result = await queue.getWorkers();
          if (!Array.isArray(result)) fail();
          workers[name] = result.length;
          if (result.length !== 0) fail(); // Includes BullMQ's unsupported CLIENT LIST sentinel.
          if (name === 'email-code') {
            const client = await queue.client;
            const heartbeat = await client.get(`operations:${scope}:worker`);
            if (heartbeat !== null) fail();
          }
        } finally { await queue.close(); }
      }
      Object.assign(receipt, { queueWorkers: workers, heartbeat: 'absent', heartbeatKey: `operations:${scope}:worker` });
    } else {
      if (input.operationsScope !== null || !/^\d{1,5}$/.test(e.PORT ?? '3006') || Number(e.PORT ?? '3006') < 1 || Number(e.PORT ?? '3006') > 65535) fail();
      const endpoint = `http://127.0.0.1:${e.PORT ?? '3006'}`;
      const get = async path => {
        const response = await fetch(`${endpoint}${path}`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response.status !== 200) fail();
        return response.json();
      };
      const readyz = await get('/readyz'), healthz = await get('/healthz');
      if (!exact(readyz, ['status', 'service', 'maintenance', 'businessReady']) || readyz.status !== 'maintenance' || readyz.service !== 'api' || readyz.maintenance !== 'photo-conversion' || readyz.businessReady !== false ||
          !exact(healthz, ['status', 'service', 'maintenance', 'commitSha']) || healthz.status !== 'ok' || healthz.service !== 'api' || healthz.maintenance !== 'photo-conversion' || healthz.commitSha !== input.candidate) fail();
      const { spawnSync } = require('node:child_process');
      // A new read-only transaction gives PostgreSQL now(), not host or caller time.
      // Require complete activity visibility before interpreting zero other clients.
      const sql = `BEGIN READ ONLY;
SELECT json_build_object('observedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'otherBackends', (SELECT count(*) FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_type='client backend' AND pid<>pg_backend_pid()),
 'completeVisibility', pg_has_role(current_user, 'pg_read_all_stats', 'USAGE'), 'trackActivities', current_setting('track_activities'));
COMMIT;`;
      const result = spawnSync('psql', ['-X', '--no-psqlrc', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
        input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 4096,
        env: { PATH: e.PATH, PGDATABASE: e.DATABASE_URL, PGAPPNAME: `quiescence-${input.operationId}`, PGCONNECT_TIMEOUT: '8', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=15000' },
      });
      if (result.status !== 0 || result.error || typeof result.stdout !== 'string') fail();
      const database = JSON.parse(result.stdout.trim());
      if (!exact(database, ['observedAt', 'otherBackends', 'completeVisibility', 'trackActivities']) || database.completeVisibility !== true || database.trackActivities !== 'on' ||
          database.otherBackends !== 0 || typeof database.observedAt !== 'string' || !Number.isFinite(Date.parse(database.observedAt)) || new Date(database.observedAt).toISOString() !== database.observedAt) fail();
      Object.assign(receipt, { readyz, healthz, observedAt: database.observedAt, otherBackends: database.otherBackends });
    }
    console.log(JSON.stringify(receipt));
  } catch {
    process.exitCode = 1;
    console.error('Remote quiescence observation unavailable');
  }
}
