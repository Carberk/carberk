import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwayPlatform } from './staging-railway.mjs';
import { StagingControl } from './staging-control.mjs';
import { GitLedger } from './staging-ledger.mjs';
import { retainedSchemaProfile } from './staging-schema.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const policy = { projectId:'project', environmentId:'stage', environmentName:'staging', services:{api:'api',worker:'worker'}, credentialScope:'project:project:stage',
  origins:{database:'postgresql://postgres.railway.internal:5432/railway',media:'http://minio.railway.internal:9000',publicMedia:'https://media.example',api:'https://api.example'} };
function boundary(overrides = {}) {
  const variables = { APP_ENV:'staging',SMS_DRIVER:'mock',EMAIL_DRIVER:'mock',PUSH_TRANSPORT:'test', REDIS_URL:'redis://u:SECRET@redis.railway.internal:6379/0', DATABASE_URL:'postgresql://user:SECRET@postgres.railway.internal:5432/railway',MINIO_ENDPOINT:policy.origins.media,MINIO_PUBLIC_URL:policy.origins.publicMedia };
  return async (_url, options) => {
    const { query, variables: input } = JSON.parse(options.body);
    let data;
    if (query.includes('projectToken')) data = { projectToken:{projectId:'project',environmentId:'stage'},project:{id:'project',environments:{edges:[{node:{id:'stage',name:'staging'}}]},services:{edges:[{node:{id:'api'}},{node:{id:'worker'}}]}} };
    else if (query.includes('variables(')) data={variables:{...variables,...overrides.variables,...(input.serviceId==='worker'?overrides.workerVariables:{})}};
    else if (query.includes('domains(')) data={domains:{serviceDomains:[{domain:'api.example'}],customDomains:[]}};
    else if (query.includes('serviceInstance(')) data={serviceInstance:{preDeployCommand:['pnpm --filter @auto-tm/db migrate:deploy']}};
    else throw new Error('Unexpected network request');
    if (overrides.scope && data.projectToken) data.projectToken = overrides.scope;
    if (overrides.production && data.project) data.project.environments.edges[0].node.name='production';
    return {ok:true,json:async()=>({data})};
  };
}
test('Railway attestation reads fresh scoped API identity and origins without returning credentials',async()=>{
  const platform=new RailwayPlatform({token:'SECRET',fetch:boundary()});
  const result=await platform.attest(policy); assert.deepEqual(result,policy); assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('production, scope mismatch and database host overrides are refused by the actual Railway adapter',async()=>{
  for(const changes of [{production:true},{scope:{projectId:'project',environmentId:'production'}},{variables:{DATABASE_URL:'postgresql://u:SECRET@postgres.railway.internal/db?host=prod'}},{variables:{SMS_DRIVER:'gateway'}}]){
    const platform=new RailwayPlatform({token:'SECRET',fetch:boundary(changes)});
    await assert.rejects(platform.attest(policy),e=> !e.message.includes('SECRET'));
  }
});

test('mutations require explicit reservation authorization before any deployment request',async()=>{
  const platform=new RailwayPlatform({token:'SECRET',fetch:boundary()});
  await assert.rejects(platform.authorize({id:'1'.repeat(32),candidate:'a'.repeat(40)}),/authorization/);
});
test('remote fixture commands reject public namespace and credential-bearing media before touching SQL',async()=>{
  const {remoteProgram}=await import('./staging-remote.mjs');
  const {runInNewContext}=await import('node:vm');
  const env={RAILWAY_PROJECT_ID:'project',RAILWAY_ENVIRONMENT_ID:'stage',RAILWAY_SERVICE_ID:'api',RAILWAY_ENVIRONMENT_NAME:'staging',APP_ENV:'staging',SMS_DRIVER:'mock',AUTOTM_COMMIT_SHA:'a'.repeat(40),DATABASE_URL:'postgresql://u:SECRET@postgres.railway.internal:5432/railway',MINIO_ENDPOINT:'http://SECRET@minio.railway.internal:9000',MINIO_PUBLIC_URL:policy.origins.publicMedia};
  const payload={kind:'fixture',id:'1'.repeat(32),namespace:`cf_${'1'.repeat(32)}`,target:'a'.repeat(40),identity:policy};
  for(const input of [{...payload,namespace:'public'},payload]){
    let calls=0;const process={env,exitCode:0};let message='';
    runInNewContext(remoteProgram(input),{process,URL,require:()=>({spawnSync:()=>{calls++;return {status:0,stdout:'0'};}}),console:{log:()=>{},error:(value)=>{message=value;}}});
    assert.equal(process.exitCode,1);assert.equal(calls,0,'refused identity must not reach SQL');assert.equal(message.includes('SECRET'),false);
  }
});

test('a real application fixture succeeds only after the deployed API can read its owned listing',async()=>{
  const id='1'.repeat(32),listingId='fixture-listing',sellerId='fixture-seller';
  const lease={id,candidate:'a'.repeat(40),namespace:`cf_${id}`,identity:policy};
  let visible=false;
  const api=boundary();
  const fetch=async(url,options)=>{
    if(url===`${policy.origins.api}/api/v1/listings/${listingId}`)return{ok:true,json:async()=>({id:visible?listingId:'unrelated',sellerId,status:'active'})};
    return api(url,options);
  };
  const platform=new RailwayPlatform({token:'SECRET',authorization:`${id}:${lease.candidate}`,fetch,command:async()=>JSON.stringify({fixtures:'present',namespace:lease.namespace,listingId,sellerId})});
  await assert.rejects(platform.execute('fixture',lease,lease.candidate),/application fixture/);
  visible=true;
  assert.equal((await platform.execute('fixture',lease,lease.candidate)).listingId,listingId);
});

test('safe identity can reserve before mock preparation while all application mutations refuse real delivery',async()=>{
  const platform=new RailwayPlatform({token:'SECRET',fetch:boundary({variables:{EMAIL_DRIVER:'resend',PUSH_TRANSPORT:'fcm'}})});
  assert.deepEqual(await platform.attest(policy,{requireMock:false}),policy);
  await assert.rejects(platform.attest(policy),/mock delivery/);
});

test('actual deployment proof rejects stale active deployment, wrong SHA and a non-successful active instance',async()=>{
  const target='a'.repeat(40);const lease={id:'1'.repeat(32),candidate:target,namespace:`cf_${'1'.repeat(32)}`,identity:policy,expectedMigrations:[]};
  for(const fault of ['none','stale-active','wrong-sha','active-building']){
    const base=boundary();
    const fetch=async(url,options)=>{
      if(url===`${policy.origins.api}/readyz`)return{ok:true,json:async()=>({status:'ready',environment:'staging',commitSha:target,checks:{postgres:'ok',redis:'ok',minio:'ok'}})};
      const {query,variables}=JSON.parse(options.body);let data;
      if(query.includes('deployment(id:'))data={deployment:{id:variables.id,status:'SUCCESS',meta:{commitHash:fault==='wrong-sha'?'b'.repeat(40):target}}};
      else if(query.includes('latestDeployment'))data={serviceInstance:{latestDeployment:{id:fault==='stale-active'?'old-deployment':`deployment-${variables.serviceId}`,status:fault==='active-building'?'BUILDING':'SUCCESS'}}};
      else if(query.includes('deploymentLogs'))data={deploymentLogs:[{message:'Worker started (BullMQ consumer)'}]};
      else return base(url,options);
      return{ok:true,json:async()=>({data})};
    };
    const platform=new RailwayPlatform({token:'SECRET',fetch,command:async()=>JSON.stringify({sha:target,fixtures:'absent',schema:'unchanged',migrations:[]})});
    const verify=()=>platform.verify(lease,target,{deployments:{api:'deployment-api',worker:'deployment-worker'}});
    if(fault==='none')assert.equal((await verify()).sha,target);
    else await assert.rejects(verify(),/deployed candidate mismatch/);
  }
});

test('the actual remote probe proves exact migration checksums and rejects unfinished migrations and orphan fixtures',async()=>{
  const {remoteProgram}=await import('./staging-remote.mjs');const {runInNewContext}=await import('node:vm');const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
  const id='1'.repeat(32),target='a'.repeat(40),migration={name:'20261015_additive',checksum:'1'.repeat(64)};
  const payload={kind:'probe',id,namespace:`cf_${id}`,target,identity:policy,expectedMigrations:[migration],schemaDisposition:'retained-additive'};
  for(const fault of ['none','checksum','unfinished','orphan']){
    let receipt;const process={exitCode:0,env:{RAILWAY_PROJECT_ID:'project',RAILWAY_ENVIRONMENT_ID:'stage',RAILWAY_SERVICE_ID:'api',RAILWAY_ENVIRONMENT_NAME:'staging',APP_ENV:'staging',SMS_DRIVER:'mock',AUTOTM_COMMIT_SHA:target,DATABASE_URL:'postgresql://u:secret@postgres.railway.internal:5432/railway',MINIO_ENDPOINT:policy.origins.media,MINIO_PUBLIC_URL:policy.origins.publicMedia}};
    runInNewContext(remoteProgram(payload),{process,URL,require:name=>name==='node:child_process'?{spawnSync:(_program,_args,{input})=>({status:0,stdout:input.includes('json_agg')?JSON.stringify([{...migration,checksum:fault==='checksum'?'2'.repeat(64):migration.checksum}]):input.includes('finished_at IS NULL')?(fault==='unfinished'?'1':'0'):input.includes('public.users')?(fault==='orphan'?'1':'0'):'0'})}:require(name),console:{log:value=>{receipt=JSON.parse(value);},error:()=>{}}});
    if(fault==='none'){assert.equal(process.exitCode,0);assert.deepEqual(receipt.migrations,[migration]);assert.equal(receipt.schema,'retained-additive');}
    else{assert.equal(process.exitCode,1);assert.equal(receipt,undefined);}
  }
});

// This fake is the psql/process boundary only. PostgreSQL guard semantics are
// exercised by the hosted business-graph suite, never inferred from this fake.
async function businessProbe(overrides = {}, fault = 'none') {
  const { remoteProgram } = await import('./staging-remote.mjs');
  const { runInNewContext } = await import('node:vm');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const id = '9'.repeat(32), candidate = 'c'.repeat(40), target = 'd'.repeat(40);
  const migration = { name: '20261015_additive', checksum: '1'.repeat(64) };
  const payload = { kind: 'probe', id, namespace: `cf_${id}`, profile: 'campaign897-business-v2', candidate, target,
    identity: policy, expectedMigrations: [migration], schemaDisposition: 'retained-additive', ...overrides };
  const process = { exitCode: 0, env: { RAILWAY_PROJECT_ID: 'project', RAILWAY_ENVIRONMENT_ID: 'stage', RAILWAY_SERVICE_ID: 'api',
    RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: target,
    DATABASE_URL: 'postgresql://u:secret@postgres.railway.internal:5432/railway', MINIO_ENDPOINT: policy.origins.media, MINIO_PUBLIC_URL: policy.origins.publicMedia } };
  let receipt;
  const queries = [];
  runInNewContext(remoteProgram(payload), { URL, process, require: name => name === 'node:child_process' ? {
    spawnSync: (command, _args, { input }) => {
      assert.equal(command, 'psql', 'probe must not invoke delivery processes');
      queries.push(input);
      // Mutating statements embedded inside DO guards are not executed by this
      // fake. Reject top-level mutation, bootstrap and lifecycle transitions.
      assert.doesNotMatch(input, /CREATE (?:SCHEMA|TABLE|TRIGGER|FUNCTION)|UPDATE public\.|DELETE FROM public\.|SET state='(?:cleaning|disposed)'/);
      const stdout = input.includes('pg_namespace WHERE') ? (fault === 'missing-namespace' ? '0' : '1')
        : input.startsWith('SELECT state FROM') ? 'disposed'
        : input.includes('finished_at IS NULL') ? (fault === 'unfinished' ? '1' : '0')
        : input.includes('json_agg') && input.includes('_prisma_migrations') ? JSON.stringify(
          fault === 'missing-migration' ? [] : fault === 'extra-migration' ? [migration, { name: '20261016_extra', checksum: '2'.repeat(64) }]
            : [{ ...migration, checksum: fault === 'checksum' ? '2'.repeat(64) : migration.checksum }])
        : input.startsWith('SELECT count(*)') && input.includes("table_name='audit_logs'") ? '2' : '0';
      return { status: 0, stdout };
    },
  } : require(name), console: { log: value => { receipt = JSON.parse(value); }, error() {} } });
  return { code: process.exitCode, receipt, queries, migration, payload };
}

test('business v2 disposed probe observes candidate C under runtime M with exact inventory and schema', async () => {
  const { code, receipt, migration, payload, queries } = await businessProbe();
  assert.equal(code, 0);
  assert.ok(receipt, 'existing disposed graph emits a receipt');
  assert.ok(queries.some(query => query.startsWith('SELECT state FROM')), 'disposed state was observed');
  assert.equal(receipt.sha, payload.target, 'receipt SHA is the observed runtime M');
  assert.equal(receipt.candidate, payload.candidate);
  assert.deepEqual(receipt.migrations, [migration]);
  assert.equal(receipt.schema, 'retained-additive');
  assert.equal(receipt.profile, 'campaign897-business-v2');
  assert.equal(receipt.namespace, payload.namespace);
  assert.equal(receipt.reservationId, payload.id);
});

test('business v2 probe emits versioned storage disposal with retained redacted audits and tombstone', async () => {
  const { code, receipt } = await businessProbe();
  assert.equal(code, 0);
  assert.deepEqual(receipt.storageDisposal, { version: 1, scope: 'business-v2-storage', state: 'disposed',
    rows: 'absent', retainedAudits: 2, auditDisposition: 'redacted-synthetic-audit', tombstone: 'retained' });
  assert.equal(receipt.tombstone, true);
  assert.equal(receipt.fixtures, 'absent');
  for (const field of ['queueJobs', 'sinkRecords', 'authenticated', 'admission', 'entities', 'emails']) assert.equal(Object.hasOwn(receipt, field), false);
});

for (const fault of ['unfinished', 'missing-migration', 'extra-migration', 'checksum', 'missing-namespace', 'invalid-schema', 'missing-inventory', 'stale-namespace', 'stale-profile']) {
  test(`business v2 probe refuses ${fault} without a success receipt`, async () => {
    const changes = fault === 'invalid-schema' ? { schemaDisposition: 'discarded' }
      : fault === 'missing-inventory' ? { expectedMigrations: undefined }
      : fault === 'stale-namespace' ? { namespace: `cf_${'8'.repeat(32)}` }
      : fault === 'stale-profile' ? { profile: 'campaign897-arbitrary' } : {};
    const result = await businessProbe(changes, fault);
    assert.equal(result.code, 1, `${fault} must refuse`);
    assert.equal(result.receipt, undefined);
  });
}

test('unknown remote campaign profile is refused before SQL', async () => {
  const { remoteProgram } = await import('./staging-remote.mjs');
  const { runInNewContext } = await import('node:vm');
  let sqlReached = false;
  const process = { exitCode: 0, env: { RAILWAY_PROJECT_ID: 'project', RAILWAY_ENVIRONMENT_ID: 'stage', RAILWAY_SERVICE_ID: 'api', RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: 'a'.repeat(40), DATABASE_URL: 'postgresql://u:secret@postgres.railway.internal:5432/railway', MINIO_ENDPOINT: policy.origins.media, MINIO_PUBLIC_URL: policy.origins.publicMedia } };
  runInNewContext(remoteProgram({ kind: 'fixture', id: '1'.repeat(32), namespace: `cf_${'1'.repeat(32)}`, candidate: 'a'.repeat(40), target: 'a'.repeat(40), identity: policy, profile: 'campaign897-arbitrary' }), {
    URL, process, require: () => ({ spawnSync: () => { sqlReached = true; return { status: 0, stdout: '0' }; } }), console: { log() {}, error() {} },
  });
  assert.equal(process.exitCode, 1); assert.equal(sqlReached, false);
});

test('campaign receipts bind profile and candidate and never masquerade as public listing proof', async () => {
  const id = '1'.repeat(32), candidate = 'a'.repeat(40);
  const lease = { id, candidate, namespace: `cf_${id}`, identity: policy, fixtureProfile: 'campaign897-identities-v1', deployments: { api: 'deployment-api', worker: 'deployment-worker' }, expectedMigrations: [] };
  const good = { fixtures: 'present', namespace: lease.namespace, profile: lease.fixtureProfile, candidate, state: 'identities', identities: 4, protectedReceipt: `${lease.namespace}.campaign_entities` };
  for (const fault of ['none', 'candidate', 'profile', 'count']) {
    const receipt = { ...good, ...(fault === 'candidate' ? { candidate: 'b'.repeat(40) } : {}), ...(fault === 'profile' ? { profile: 'listing-v1' } : {}), ...(fault === 'count' ? { identities: 20 } : {}) };
    const base = boundary();
    const fetch = async (url, options) => {
      if (url === `${policy.origins.api}/readyz`) return { ok: true, json: async () => ({ status: 'ready', commitSha: candidate, environment: 'staging', checks: { postgres: 'ok', redis: 'ok', minio: 'ok' } }) };
      const { query, variables } = JSON.parse(options.body);
      if (query.includes('deployment(id:')) return { ok: true, json: async () => ({ data: { deployment: { id: variables.id, status: 'SUCCESS', meta: { commitHash: candidate } } } }) };
      if (query.includes('latestDeployment')) return { ok: true, json: async () => ({ data: { serviceInstance: { latestDeployment: { id: `deployment-${variables.serviceId}`, status: 'SUCCESS' } } } }) };
      if (query.includes('deploymentLogs')) return { ok: true, json: async () => ({ data: { deploymentLogs: [{ message: 'Worker started (BullMQ consumer)' }] } }) };
      return base(url, options);
    };
    const platform = new RailwayPlatform({ token: 'SECRET', authorization: `${id}:${candidate}`, fetch, command: async () => JSON.stringify({ ...receipt, sha: candidate, migrations: [], schema: 'unchanged' }) });
    if (fault === 'none') assert.equal((await platform.execute('fixture', lease, candidate)).state, 'identities');
    else await assert.rejects(platform.execute('fixture', lease, candidate), /campaign/);
  }
});

test('campaign fixture refuses mutation without the complete active deployment journal', async () => {
  const id = '1'.repeat(32), candidate = 'a'.repeat(40);
  const lease = { id, candidate, namespace: `cf_${id}`, identity: policy, fixtureProfile: 'campaign897-identities-v1' };
  let remoteMutated = false;
  const platform = new RailwayPlatform({ token: 'SECRET', authorization: `${id}:${candidate}`, fetch: boundary(), command: async () => {
    remoteMutated = true;
    return JSON.stringify({ fixtures: 'present', namespace: lease.namespace, profile: lease.fixtureProfile, candidate, state: 'identities', identities: 4, protectedReceipt: `${lease.namespace}.campaign_entities` });
  } });
  await assert.rejects(platform.execute('fixture', lease, candidate), /deployment/);
  assert.equal(remoteMutated, false);
});

test('campaign profile is disabled by default before the remote SQL boundary', async () => {
  const { remoteProgram } = await import('./staging-remote.mjs');
  const { runInNewContext } = await import('node:vm');
  let sqlReached = false;
  const process = { exitCode: 0, env: { RAILWAY_PROJECT_ID: 'project', RAILWAY_ENVIRONMENT_ID: 'stage', RAILWAY_SERVICE_ID: 'api', RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: 'a'.repeat(40), DATABASE_URL: 'postgresql://u:secret@postgres.railway.internal:5432/railway', MINIO_ENDPOINT: policy.origins.media, MINIO_PUBLIC_URL: policy.origins.publicMedia } };
  runInNewContext(remoteProgram({ kind: 'fixture', id: '1'.repeat(32), namespace: `cf_${'1'.repeat(32)}`, candidate: 'a'.repeat(40), target: 'a'.repeat(40), identity: policy, profile: 'campaign897-identities-v1' }), {
    URL, process, require: () => ({ spawnSync: () => { sqlReached = true; return { status: 0, stdout: '0' }; } }), console: { log() {}, error() {} },
  });
  assert.equal(process.exitCode, 1); assert.equal(sqlReached, false);
});

test('queue disposal requires the same authoritative internal Redis database in API and worker', async () => {
  for (const changes of [
    { workerVariables: { REDIS_URL: 'redis://u:SECRET@redis.railway.internal:6379/1' } },
    { workerVariables: { REDIS_URL: undefined } },
    { variables: { REDIS_URL: 'redis://u:SECRET@foreign.example:6379/0' } },
  ]) {
    const platform = new RailwayPlatform({ token: 'SECRET', fetch: boundary(changes) });
    await assert.rejects(platform.attest(policy), error => /Redis|delivery|origin/.test(error.message) && !error.message.includes('SECRET'));
  }
});

test('post-main campaign restoration observes established disposal and cannot start cleanup of an active graph', async () => {
  const candidate = 'a'.repeat(40), target = 'c'.repeat(40), id = '1'.repeat(32);
  const remoteKinds = [];
  const ordinary = boundary();
  const fetch = async (url, options) => {
    const { query, variables } = JSON.parse(options.body);
    if (query.includes('mutation deploy')) return { ok: true, json: async () => ({ data: { serviceInstanceDeployV2: `deployment-${variables.serviceId}` } }) };
    if (query.includes('query deployment')) return { ok: true, json: async () => ({ data: { deployment: { id: variables.id, status: 'SUCCESS', meta: { commitHash: target } } } }) };
    return ordinary(url, options);
  };
  const platform = new RailwayPlatform({ token: 'SECRET', authorization: `${id}:${candidate}`, fetch,
    command: async (_program, args) => {
      const encoded = args.at(-1).match(/Buffer\.from\('([^']+)'/)[1];
      const program = Buffer.from(encoded, 'base64').toString();
      remoteKinds.push(program.match(/"kind":"([^"]+)"/)[1]);
      return JSON.stringify({ fixtures: 'present', namespace: `cf_${id}`, profile: 'campaign897-identities-v1',
        candidate, state: 'identities', identities: 4, protectedReceipt: `cf_${id}.campaign_entities` });
    },
  });
  const lease = { id, candidate, namespace: `cf_${id}`, identity: policy, fixtureProfile: 'campaign897-identities-v1' };
  await assert.rejects(platform.execute('restore', lease, target, async () => {}), /dispos|cleanup/i);
  assert.deepEqual(remoteKinds, ['probe']);
});

test('business storage fixture refuses missing or wrong preparation enables before SQL', async () => {
  const { remoteProgram } = await import('./staging-remote.mjs');
  const { runInNewContext } = await import('node:vm');
  for (const enabled of [undefined, 'campaign897-identities-v1']) {
    let calls = 0;
    const process = { exitCode: 0, env: { STAGING_CAMPAIGN_PROFILE_ENABLED: enabled } };
    runInNewContext(remoteProgram({ kind: 'fixture', profile: 'campaign897-business-v2' }), {
      process, require: () => ({ spawnSync: () => { calls++; } }), console: { log() {}, error() {} },
    });
    assert.equal(process.exitCode, 1);
    assert.equal(calls, 0);
  }
});

test('business adapter requires reviewed authorization before provider effects', async () => {
  let touched = false;
  const platform = new RailwayPlatform({ token: 'SECRET', fetch: async () => { touched = true; throw new Error(); } });
  await assert.rejects(platform.execute('reset', { fixtureProfile: 'campaign897-business-v2' }, 'a'.repeat(40)), /authorization/);
  assert.equal(touched, false);
});

// Real controller, Railway adapter and Git CAS ledger. Only Railway HTTP/SSH,
// clock and IDs are faked. Git objects/remotes are isolated temporary storage.
async function businessLifecycle(t) {
  const root = await mkdtemp(join(tmpdir(), 'business-lifecycle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'shared.git');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  const ledger = new GitLedger({ directory: join(root, 'objects'), remote });
  await ledger.initialize();
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // A shallow CI checkout cannot supply the baseline or the candidate's
  // complete parents for the fixture push. Fetch both exact objects directly
  // into scratch storage from its configured origin instead.
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true';
  const source = shallow ? execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim() : process.cwd();
  for (const ref of [candidate, retainedSchemaProfile.baseline]) await ledger.git(['fetch', '--no-tags', source, ref]);
  const tree = await ledger.git(['rev-parse', `${candidate}^{tree}`]);
  let main = await ledger.git(['commit-tree', tree, '-p', candidate, '-m', 'Test main runtime']);
  await ledger.git(['push', remote, `${main}:refs/heads/main`, `${candidate}:refs/heads/candidate`, `${retainedSchemaProfile.baseline}:refs/heads/baseline`]);
  const migrations = await ledger.migrationsAt(candidate);
  const network = { runtime: candidate, state: 'identities', fault: null, remoteKinds: [], deploys: [], probes: [], lostReset: false };
  let seq = 0, tick = 0;
  const base = boundary();
  const fetch = async (url, options) => {
    if (url === `${policy.origins.api}/readyz` && network.onReadiness) { const run = network.onReadiness; network.onReadiness = null; await run(); }
    if (url === `${policy.origins.api}/readyz`) return { ok: true, json: async () => ({ status: network.fault === 'readiness' ? 'starting' : 'ready', environment: 'staging', commitSha: network.runtime, checks: { postgres: 'ok', redis: 'ok', minio: 'ok' } }) };
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes('mutation deploy')) {
      network.deploys.push(variables.commitSha); network.runtime = variables.commitSha;
      if (network.postMainState) network.state = network.postMainState;
      data = { serviceInstanceDeployV2: `deployment-${variables.serviceId}` };
    } else if (query.includes('deployment(id:')) data = { deployment: { id: variables.id, status: 'SUCCESS', meta: { commitHash: network.fault === 'deployment' ? 'b'.repeat(40) : network.runtime } } };
    else if (query.includes('latestDeployment')) data = { serviceInstance: { latestDeployment: { id: network.fault === 'active' ? 'old' : `deployment-${variables.serviceId}`, status: 'SUCCESS' } } };
    else if (query.includes('deploymentLogs')) data = { deploymentLogs: [{ message: 'Worker started (BullMQ consumer)' }] };
    else {
      if (network.onAttestation && query.includes('projectToken')) { const run = network.onAttestation; network.onAttestation = null; await run(); }
      return base(url, options);
    }
    return { ok: true, json: async () => ({ data }) };
  };
  let claim;
  const command = async (_program, args) => {
    const program = Buffer.from(args.at(-1).match(/Buffer\.from\('([^']+)'/)[1], 'base64').toString();
    // The serialized input is the final argument of remoteMain, after its body.
    const payload = JSON.parse(program.match(/\)\((\{"kind":.*?\}), function campaignMain/s)[1]);
    network.remoteKinds.push(payload.kind);
    if (payload.kind === 'fixture') network.state = 'identities';
    if (payload.kind === 'reset') {
      network.state = 'disposed';
      if (network.lostReset) { network.lostReset = false; throw new Error('Lost SSH reset response'); }
    }
    const disposed = network.state === 'disposed';
    const receipt = { profile: 'campaign897-business-v2', candidate, reservationId: claim.id, namespace: `cf_${claim.id}`,
      protectedReceipt: `cf_${claim.id}.campaign_entities`, state: network.state, identities: disposed ? 0 : 15,
      fixtures: disposed ? 'absent' : 'present', tombstone: disposed };
    if (payload.kind === 'probe') {
      network.probes.push(payload);
      if (network.failMainProbe && payload.target !== candidate) { network.failMainProbe = false; throw new Error('Lost main probe response'); }
      Object.assign(receipt, { sha: network.runtime, migrations, schema: payload.schemaDisposition });
      if (disposed) receipt.storageDisposal = { version: 1, scope: 'business-v2-storage', state: 'disposed', rows: 'absent', retainedAudits: 2, auditDisposition: 'redacted-synthetic-audit', tombstone: 'retained' };
      const fault = network.fault;
      if (fault === 'missing') delete receipt.storageDisposal;
      if (fault === 'partial' && disposed) receipt.storageDisposal.rows = 'unknown';
      if (fault === 'version' && disposed) receipt.storageDisposal.version = 2;
      if (fault === 'audits' && disposed) receipt.storageDisposal.retainedAudits = 1;
      if (fault === 'mixed') receipt.queueJobs = 0;
      if (fault === 'candidate') receipt.candidate = main;
      if (fault === 'reservation') receipt.reservationId = 'f'.repeat(32);
      if (fault === 'namespace') receipt.namespace = `cf_${'f'.repeat(32)}`;
      if (fault === 'profile') receipt.profile = 'campaign897-identities-v1';
      if (fault === 'protected') receipt.protectedReceipt = 'public.campaign_entities';
      if (fault === 'sha') receipt.sha = 'b'.repeat(40);
      if (fault === 'inventory') receipt.migrations = [];
      if (fault === 'schema') receipt.schema = 'discarded';
    }
    return JSON.stringify(receipt);
  };
  const platform = new RailwayPlatform({ token: 'SECRET', fetch, command });
  const dependencies = { ledger, platform, policy, actor: 'alice', now: () => new Date(Date.UTC(2026, 9, 19, 0, 0, tick++)).toISOString(), id: () => (++seq).toString(16).padStart(32, '0') };
  const restart = () => new StagingControl(dependencies);
  const control = restart();
  const id = await control.enqueue({ parent: 897, pr: 904, candidate, priority: 1, priorityEvidence: 'https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897' });
  claim = { id, candidate }; await control.acquire(id);
  platform.authorization = `${id}:${candidate}`;
  const edit = async change => { const snapshot = await ledger.read(); change(snapshot.state.reservation); assert.equal(await ledger.compareAndSwap(snapshot.revision, snapshot.state), true); };
  // Input is an already-reserved v2 storage fixture on a proven candidate.
  await edit(lease => Object.assign(lease, { fixtureProfile: 'campaign897-business-v2', deployments: { api: 'deployment-api', worker: 'deployment-worker' }, expectedMigrations: migrations, schemaDisposition: 'unchanged' }));
  const moveMain = async () => {
    main = await ledger.git(['commit-tree', tree, '-p', main, '-m', 'Moved test main']);
    await ledger.git(['push', remote, `${main}:refs/heads/main`]);
    return main;
  };
  const refuseCompletion = async () => {
    const hook = join(remote, 'hooks', 'pre-receive');
    await writeFile(hook, `#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
let input = ''; process.stdin.on('data', value => input += value); process.stdin.on('end', () => {
  const revision = input.trim().split(/\\s+/)[1];
  const state = JSON.parse(execFileSync('git', ['show', revision + ':reservation.json'], { encoding: 'utf8' }));
  if (state.reservation && !state.reservation.operation && state.reservation.evidence.some(e => e.storageDisposal)) process.exitCode = 1;
});
`, { mode: 0o755 });
    return () => rm(hook);
  };
  return { control, restart, ledger, platform, claim, network, edit, moveMain, main, migrations, refuseCompletion };
}

test('business reset persists independently probed storage disposal before restoration and release', async t => {
  const { control, claim, network, main } = await businessLifecycle(t);
  const result = await control.operate(claim, 'reset');
  assert.equal(result.storageDisposal.scope, 'business-v2-storage');
  const lease = (await control.inspect()).reservation;
  const evidence = lease.evidence.at(-1);
  assert.equal(lease.operation, null);
  assert.equal(evidence.operationId, result.operation);
  assert.equal(evidence.owner, 'alice');
  assert.ok(Date.parse(evidence.observedAt) >= Date.parse(evidence.startedAt));
  assert.deepEqual(evidence.storageDisposal, { version: 1, scope: 'business-v2-storage', state: 'disposed', rows: 'absent', retainedAudits: 2, auditDisposition: 'redacted-synthetic-audit', tombstone: 'retained' });
  for (const key of ['queueJobs', 'sinkRecords', 'deliveryCleanup', 'authenticated', 'admission']) assert.equal(Object.hasOwn(evidence, key), false);
  const afterReset = network.remoteKinds.length;
  await control.restore(claim);
  assert.equal((await control.inspect()).reservation.restoration.restoredSha, main);
  assert.ok(network.remoteKinds.slice(afterReset).every(kind => kind === 'probe'));
  assert.ok(network.probes.some(p => p.target === main && p.candidate === claim.candidate));
  await control.release(claim);
  const state = await control.inspect();
  assert.equal(state.reservation, null);
  assert.deepEqual(state.history.at(-1).storageDisposal, evidence.storageDisposal);
});

for (const fault of ['missing', 'partial', 'version', 'audits', 'mixed', 'candidate', 'reservation', 'namespace', 'profile', 'protected', 'sha', 'inventory', 'schema']) {
  test(`business reset refuses ${fault} probe and retains the exact operation`, async t => {
    const { control, claim, network } = await businessLifecycle(t);
    network.state = 'disposed'; network.fault = fault;
    await assert.rejects(control.operate(claim, 'reset'), /blocked/);
    const lease = (await control.inspect()).reservation;
    assert.equal(lease.operation.kind, 'reset');
    assert.equal(lease.owner, 'alice');
    assert.equal(lease.evidence.length, 0);
    assert.ok(lease.recovery.action);
    assert.deepEqual(network.deploys, []);
  });
}

for (const fault of ['missing', 'owner', 'binding', 'stale', 'latest-fixture', 'latest-reset', 'deployment', 'schema', 'inventory', 'operation']) {
  test(`business restoration refuses ${fault} durable disposal before any main deployment`, async t => {
    const { control, claim, network, edit } = await businessLifecycle(t);
    await control.operate(claim, 'reset');
    await edit(lease => {
      const e = lease.evidence.at(-1);
      if (fault === 'missing') delete e.storageDisposal;
      if (fault === 'owner') e.owner = 'bob';
      if (fault === 'binding') e.reservationId = 'f'.repeat(32);
      if (fault === 'stale') e.observedAt = '2020-01-01T00:00:00.000Z';
      if (fault === 'latest-fixture' || fault === 'latest-reset') lease.evidence.push({ kind: fault.slice(7), observedAt: '2026-10-19T00:10:00.000Z' });
      if (fault === 'deployment') lease.deployments.api = 'replacement-api';
      if (fault === 'schema') lease.schemaDisposition = 'retained-additive';
      if (fault === 'inventory') lease.expectedMigrations = [];
      if (fault === 'operation') e.operationId = 'unknown';
    });
    await assert.rejects(control.restore(claim), /storage disposal/i);
    assert.deepEqual(network.deploys, []);
    assert.equal((await control.inspect()).reservation.owner, 'alice');
  });
}

test('business same reset survives restart and lost response with its original journal ID; recover only observes', async t => {
  const { control, restart, claim, network } = await businessLifecycle(t);
  network.lostReset = true;
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  const operation = (await control.inspect()).reservation.operation;
  network.state = 'cleaning';
  const before = network.remoteKinds.length;
  await assert.rejects(restart().recover(claim));
  assert.ok(network.remoteKinds.slice(before).every(kind => kind === 'probe'));
  assert.equal((await control.inspect()).reservation.operation.id, operation.id);
  const result = await restart().operate(claim, 'reset');
  assert.equal(result.operation, operation.id);
  assert.equal((await control.inspect()).reservation.evidence.at(-1).operationId, operation.id);
  assert.deepEqual(network.deploys, []);
});

for (const fault of ['owner', 'id', 'reservationId', 'namespace', 'candidate', 'profile', 'target', 'deploy', 'restore', 'readiness', 'deployment', 'active']) {
  test(`business continuation refuses changed ${fault} without reset or deploy replay`, async t => {
    const { control, restart, claim, network, edit } = await businessLifecycle(t);
    network.lostReset = true;
    await assert.rejects(control.operate(claim, 'reset'), /blocked/);
    await edit(lease => {
      const op = lease.operation;
      if (fault === 'owner') op.owner = 'bob';
      if (fault === 'id') op.id = 'unknown';
      if (fault === 'reservationId') op.reservationId = 'f'.repeat(32);
      if (fault === 'namespace') op.namespace = 'public';
      if (fault === 'candidate' || fault === 'target') op[fault] = 'b'.repeat(40);
      if (fault === 'profile') op.profile = 'campaign897-identities-v1';
      if (fault === 'deploy' || fault === 'restore') op.kind = fault;
    });
    if (['readiness', 'deployment', 'active'].includes(fault)) network.fault = fault;
    const resets = network.remoteKinds.filter(k => k === 'reset').length;
    await assert.rejects(restart().operate(claim, 'reset'));
    assert.equal(network.remoteKinds.filter(k => k === 'reset').length, resets);
    assert.deepEqual(network.deploys, []);
    assert.ok((await control.inspect()).reservation.operation);
  });
}

test('business recovery observes disposed reset then restoration; release refuses moved main and stale runtime', async t => {
  const { control, claim, network, moveMain } = await businessLifecycle(t);
  network.lostReset = true;
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  const before = network.remoteKinds.length;
  await control.recover(claim);
  assert.ok(network.remoteKinds.slice(before).every(k => k === 'probe'));
  await control.restore(claim);
  network.fault = 'readiness';
  await assert.rejects(control.release(claim));
  network.fault = null;
  await moveMain();
  await assert.rejects(control.release(claim), /main changed/i);
  assert.ok((await control.inspect()).reservation);
  await control.restore(claim);
  await control.release(claim);
});

for (const fault of ['active', 'readiness', 'inventory', 'partial']) {
  test(`business restoration freshly refuses ${fault} before first main deployment`, async t => {
    const { control, claim, network } = await businessLifecycle(t);
    await control.operate(claim, 'reset');
    network.fault = fault;
    await assert.rejects(control.restore(claim), /blocked/);
    assert.deepEqual(network.deploys, []);
    assert.equal((await control.inspect()).reservation.operation.kind, 'restore');
  });
}

test('business post-main active namespace is only probed and cannot be reset or released', async t => {
  const { control, claim, network } = await businessLifecycle(t);
  await control.operate(claim, 'reset');
  const before = network.remoteKinds.length;
  network.postMainState = 'identities';
  await assert.rejects(control.restore(claim), /blocked/);
  await assert.rejects(control.recover(claim));
  await assert.rejects(control.release(claim));
  assert.ok(network.remoteKinds.slice(before).every(k => k === 'probe'));
  assert.equal((await control.inspect()).reservation.owner, 'alice');
});

test('business interrupted restoration recovers by observation with complete journal; moved main refuses recovery', async t => {
  for (const moved of [false, true]) await t.test(String(moved), async t => {
    const { control, restart, claim, network, moveMain } = await businessLifecycle(t);
    await control.operate(claim, 'reset');
    network.failMainProbe = true;
    await assert.rejects(control.restore(claim), /blocked/);
    const operation = (await control.inspect()).reservation.operation;
    assert.deepEqual(Object.keys(operation.deployments).sort(), ['api', 'worker']);
    const deploys = network.deploys.length, before = network.remoteKinds.length;
    if (moved) {
      await moveMain();
      await assert.rejects(restart().recover(claim), /main moved/i);
      assert.equal((await control.inspect()).reservation.operation.id, operation.id);
    } else {
      await restart().recover(claim);
      await restart().release(claim);
      assert.equal((await control.inspect()).reservation, null);
    }
    assert.equal(network.deploys.length, deploys);
    assert.ok(network.remoteKinds.slice(before).every(k => k === 'probe'));
  });
});

test('business release retains the exact reset audit binding and terminal storage disposition', async t => {
  const { control, claim } = await businessLifecycle(t);
  const reset = await control.operate(claim, 'reset');
  await control.restore(claim);
  await control.release(claim);
  const audit = (await control.inspect()).history.at(-1).disposalEvidence;
  assert.equal(audit.operationId, reset.operation);
  assert.equal(audit.candidate, claim.candidate);
  assert.equal(audit.reservationId, claim.id);
  assert.equal(audit.owner, 'alice');
  assert.equal(audit.storageDisposal.tombstone, 'retained');
  assert.ok(Date.parse(audit.observedAt) >= Date.parse(audit.startedAt));
});

test('business reset CAS refusal never clears intent or invents durable disposal; explicit retry keeps ID', async t => {
  const { control, restart, claim, network, refuseCompletion } = await businessLifecycle(t);
  const allowCompletion = await refuseCompletion();
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  const lease = (await control.inspect()).reservation;
  assert.equal(network.state, 'disposed');
  assert.equal(lease.operation.kind, 'reset');
  assert.equal(lease.evidence.length, 0);
  await allowCompletion();
  const result = await restart().operate(claim, 'reset');
  assert.equal(result.operation, lease.operation.id);
  assert.equal((await control.inspect()).reservation.evidence.at(-1).operationId, lease.operation.id);
});

test('business same reset refuses a CAS change during fresh attestation', async t => {
  const { control, restart, claim, network, edit } = await businessLifecycle(t);
  network.lostReset = true;
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  network.onAttestation = () => edit(lease => { lease.operation.id = 'f'.repeat(32); });
  const before = network.remoteKinds.length;
  await assert.rejects(restart().operate(claim, 'reset'), /changed during attestation/);
  assert.equal(network.remoteKinds.length, before);
  assert.ok((await control.inspect()).reservation.operation);
});

test('business fixture uses storage proof and cannot switch an existing profile', async t => {
  const { control, claim, edit, network } = await businessLifecycle(t);
  await edit(lease => { delete lease.fixtureProfile; });
  const fixture = await control.operate(claim, 'fixture', 'campaign897-business-v2');
  assert.equal(fixture.identities, 15);
  assert.equal(fixture.state, 'identities');
  assert.equal(fixture.storageDisposal, undefined);
  await assert.rejects(control.operate(claim, 'fixture', 'campaign897-identities-v1'), /profile/);
  await assert.rejects(control.restore(claim), /storage disposal/i);
  assert.deepEqual(network.deploys, []);
});


test('business initial reset refuses operation binding changed during final attestation before remote mutation', async t => {
  const { control, claim, network, ledger, edit } = await businessLifecycle(t);
  const changeAfterIntent = async () => {
    if (!(await ledger.read()).state.reservation.operation) { network.onAttestation = changeAfterIntent; return; }
    await edit(lease => { lease.operation.namespace = 'public'; });
  };
  network.onAttestation = changeAfterIntent;
  await assert.rejects(control.operate(claim, 'reset'), /blocked/);
  assert.deepEqual(network.remoteKinds, []);
  assert.equal((await control.inspect()).reservation.operation.namespace, 'public');
});


for (const path of ['continuation', 'reset', 'fixture', 'restore', 'deploy']) {
  for (const change of ['owner', 'namespace']) {
    test(`business ${path} refuses changed ${change} during provider preflight before mutation`, async t => {
      const { control, restart, claim, network, edit, ledger } = await businessLifecycle(t);
      if (path === 'continuation') {
        network.lostReset = true;
        await assert.rejects(control.operate(claim, 'reset'), /blocked/);
      }
      if (path === 'restore') await control.operate(claim, 'reset');
      const originalOperation = (await control.inspect()).reservation.operation?.id;
      const mutate = () => edit(lease => {
        if (change === 'owner') lease.owner = 'bob';
        else lease.operation.namespace = 'public';
      });
      // Controller checks finish first. Change the remote ledger from inside
      // the adapter's actual provider attestation, after durable intent exists.
      const duringProvider = async () => {
        const operation = (await ledger.read()).state.reservation.operation;
        if (!operation || (path !== 'continuation' && !network.controllerAttested)) {
          if (operation) network.controllerAttested = true;
          network.onAttestation = duringProvider;
          return;
        }
        // Continuation also has one controller attestation before the adapter.
        if (path === 'continuation' && !network.controllerAttested) {
          network.controllerAttested = true; network.onAttestation = duringProvider; return;
        }
        await mutate();
      };
      network.onAttestation = duringProvider;
      const resets = network.remoteKinds.filter(kind => kind === 'reset').length;
      const fixtures = network.remoteKinds.filter(kind => kind === 'fixture').length;
      const deployments = network.deploys.length;
      const invoke = () => path === 'restore' ? restart().restore(claim)
        : restart().operate(claim, path === 'continuation' ? 'reset' : path);
      await assert.rejects(invoke());
      assert.equal(network.remoteKinds.filter(kind => kind === 'reset').length, resets, 'no stale reset');
      assert.equal(network.remoteKinds.filter(kind => kind === 'fixture').length, fixtures, 'no stale fixture');
      assert.equal(network.deploys.length, deployments, 'no stale deployment');
      const lease = (await control.inspect()).reservation;
      assert.ok(lease.operation, 'durable intent retained');
      if (originalOperation) assert.equal(lease.operation.id, originalOperation, 'original reset ID retained');
      assert.equal(change === 'owner' ? lease.owner : lease.operation.namespace, change === 'owner' ? 'bob' : 'public');
    });
  }
}

test('business reset refuses owner changed during final runtime readiness before remote mutation', async t => {
  const { control, claim, network, edit } = await businessLifecycle(t);
  network.onReadiness = () => edit(lease => { lease.owner = 'bob'; });
  await assert.rejects(control.operate(claim, 'reset'));
  assert.equal(network.remoteKinds.filter(kind => kind === 'reset').length, 0);
});
