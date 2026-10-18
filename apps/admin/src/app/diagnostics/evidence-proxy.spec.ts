import { afterEach, expect, it, vi } from "vitest";

import { GET, PUT } from "./evidence/[id]/[file]/route";

vi.mock("@/lib/cookies",()=>({getAccessToken:async()=>"current-staff-session"}));
vi.mock("@/lib/api-config",()=>({getApiBaseUrl:()=>"https://api.example.invalid"}));
const id="11111111-1111-4111-8111-111111111111",context={params:Promise.resolve({id,file:id})};
const url=`https://admin.example.invalid/diagnostics/evidence/${id}/${id}?findingId=${id}&expectedVersion=3`;
const headers={"Content-Type":"application/octet-stream","X-Evidence-Type":"image/jpeg",Origin:"https://admin.example.invalid"};
afterEach(()=>vi.unstubAllGlobals());
it("rejects cross-origin evidence uploads before any upstream request",async()=>{
 const upstream=vi.fn();vi.stubGlobal("fetch",upstream);
 const result=await PUT(new Request(url,{method:"PUT",headers:{...headers,Origin:"https://other.example.invalid"},body:new Uint8Array([1,2])}),context);
 expect(result.status).toBe(403);expect(upstream).not.toHaveBeenCalled();
});
it("cancels oversized chunked evidence without retaining the entire stream",async()=>{
 const upstream=vi.fn(),cancel=vi.fn();vi.stubGlobal("fetch",upstream);let chunks=0;
 const body=new ReadableStream<Uint8Array>({pull(controller){chunks++;if(chunks<=8)controller.enqueue(new Uint8Array(4*1024*1024));else controller.close();},cancel},{highWaterMark:0});
 const result=await PUT(new Request(url,{method:"PUT",headers,body,duplex:"half"} as RequestInit),context);
 expect(result.status).toBe(400);expect(cancel).toHaveBeenCalledOnce();expect(chunks).toBeLessThanOrEqual(3);expect(upstream).not.toHaveBeenCalled();
});
it("forwards exact image bytes with current cookie authority and preserves direct read denial",async()=>{
 const upstream=vi.fn(async(_url:string,init:RequestInit)=>init.method==="GET"?Response.json({code:"DIAGNOSTIC_NO_ACCESS"},{status:403}):Response.json({id},{status:201}));vi.stubGlobal("fetch",upstream);
 const result=await PUT(new Request(url,{method:"PUT",headers,body:new Uint8Array([1,2,3])}),context);
 expect(result.status).toBe(201);expect(result.headers.get("Cache-Control")).toContain("no-store");
 expect(upstream).toHaveBeenCalledWith(expect.stringContaining(`?findingId=${id}&expectedVersion=3`),expect.objectContaining({method:"PUT",headers:expect.objectContaining({Authorization:"Bearer current-staff-session","X-Evidence-Type":"image/jpeg"}),body:new Uint8Array([1,2,3]),cache:"no-store"}));
 expect((await GET(new Request(url),context)).status).toBe(403);
});
