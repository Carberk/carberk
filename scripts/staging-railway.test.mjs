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
