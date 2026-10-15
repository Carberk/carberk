import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type * as NextNavigation from "next/navigation";

const boundary=vi.hoisted(()=>({headers:new Headers(),cookies:new Map<string,string>()}));
vi.mock('next/headers',()=>({headers:async()=>boundary.headers,cookies:async()=>({get:(key:string)=>{const value=boundary.cookies.get(key);return value?{value}:undefined;}})}));
vi.mock('next/navigation',async(importOriginal)=>({...await importOriginal<typeof NextNavigation>(),redirect:(url:string)=>{throw new Error(`NEXT_REDIRECT:${url}`);}}));

import { currentStaff, currentMarketplaceAdmin, requireStaffCapability } from './staff-session';

let server:Server;let elevated=true;let capabilities=['founder.admission'];let admin=false;let unavailable=false;let sawBearer=false;
beforeAll(async()=>{
  server=createServer((request,response)=>{
    sawBearer=request.headers.authorization==='Bearer server-cookie-only';
    response.setHeader('Content-Type','application/json');
    if(unavailable){response.writeHead(503);response.end(JSON.stringify({code:'UNAVAILABLE',message:'secret backend diagnostics'}));return;}
    if(request.url==='/api/v1/staff/capabilities'){response.end(JSON.stringify({capabilities,elevated}));return;}
    if(request.url==='/api/v1/admin/config'){response.statusCode=admin?200:403;response.end(JSON.stringify(admin?{adminModerationActionsEnabled:true}:{code:'FORBIDDEN'}));return;}
    response.statusCode=404;response.end('{}');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No loopback address');
  vi.stubEnv('API_BASE_URL',`http://127.0.0.1:${address.port}/api/v1`);
});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));vi.unstubAllEnvs();});
beforeEach(()=>{elevated=true;capabilities=['founder.admission'];admin=false;unavailable=false;sawBearer=false;boundary.headers=new Headers();boundary.cookies.set('auto_tm_admin_access','server-cookie-only');});
it('uses actual HTTP current capabilities and cookie bearer without returning credential material',async()=>{
  expect(await requireStaffCapability('founder.admission','/business-admission')).toEqual({capabilities:['founder.admission'],elevated:true});
  expect(sawBearer).toBe(true);expect(await currentMarketplaceAdmin()).toBe(false);
  admin=true;expect(await currentMarketplaceAdmin()).toBe(true);
});
it('rechecks grants and elevation on every route read and rejects stale privilege',async()=>{
  await requireStaffCapability('founder.admission','/business-admission');capabilities=[];
  await expect(requireStaffCapability('founder.admission','/business-admission')).rejects.toMatchObject({status:403});
  elevated=false;await expect(currentStaff('/workspace?status=pending')).rejects.toThrow('NEXT_REDIRECT:/login?mode=totp&returnTo=%2Fworkspace%3Fstatus%3Dpending');
});
it('temporary failure never returns a cached grant or exposes provider diagnostics as a result',async()=>{
  await currentStaff('/workspace');unavailable=true;
  await expect(currentStaff('/workspace')).rejects.toMatchObject({status:503});
});
it('rejects a failed renewed action before the API and keeps destinations internal',async()=>{
  boundary.headers.set('x-admin-session-expired','1');
  await expect(currentStaff('https://outside.example')).rejects.toThrow('NEXT_REDIRECT:/login?reason=session-expired');
  expect(sawBearer).toBe(false);
});
