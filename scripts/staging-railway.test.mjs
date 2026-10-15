import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwayPlatform } from './staging-railway.mjs';
const policy = { projectId:'project', environmentId:'stage', environmentName:'staging', services:{api:'api',worker:'worker'}, credentialScope:'project:project:stage',
  origins:{database:'postgresql://postgres.railway.internal:5432/railway',media:'http://minio.railway.internal:9000',publicMedia:'https://media.example',api:'https://api.example'} };
function boundary(overrides = {}) {
  const variables = { APP_ENV:'staging',SMS_DRIVER:'mock',EMAIL_DRIVER:'mock',PUSH_TRANSPORT:'test', DATABASE_URL:'postgresql://user:SECRET@postgres.railway.internal:5432/railway',MINIO_ENDPOINT:policy.origins.media,MINIO_PUBLIC_URL:policy.origins.publicMedia };
  return async (_url, options) => {
    const { query, variables: input } = JSON.parse(options.body);
    let data;
    if (query.includes('projectToken')) data = { projectToken:{projectId:'project',environmentId:'stage'},project:{id:'project',environments:{edges:[{node:{id:'stage',name:'staging'}}]},services:{edges:[{node:{id:'api'}},{node:{id:'worker'}}]}} };
    else if (query.includes('variables(')) data={variables:{...variables,...overrides.variables}};
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
