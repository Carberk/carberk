import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwayPlatform } from './staging-railway.mjs';
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
