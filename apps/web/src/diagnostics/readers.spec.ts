import { afterEach,beforeEach,expect,it,vi } from "vitest";

import { publicDiagnosticBytes,readPublicDiagnostic,readPublicDiagnosticAvailability } from "./readers";
const id="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{vi.stubEnv("API_BASE_URL","https://api.example.test");});
afterEach(()=>vi.unstubAllGlobals());
it("checks public authority on every binary read and returns only no-store exact bytes",async()=>{
 const reads:string[]=[];vi.stubGlobal("fetch",async(url:string,options:RequestInit)=>{reads.push(url);expect(options.cache).toBe("no-store");expect(options.redirect).toBe("error");expect(options.headers).toBeUndefined();return new Response(new Uint8Array([37,80,68,70]),{headers:{"Content-Type":"application/pdf"}});});
 const response=await publicDiagnosticBytes(id,"documents","tk");expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37,80,68,70]));expect(response.headers.get("Cache-Control")).toContain("no-store");expect(response.headers.get("Content-Disposition")).toBe("attachment; filename=inspection-report.pdf");expect(reads).toEqual([`https://api.example.test/api/v1/public-diagnostics/reports/${id}/documents/tk`]);
});
it.each([404,403,409,503])("keeps denied and unavailable artifact content neutral for status %s",async(status)=>{
 vi.stubGlobal("fetch",async()=>new Response("private storage details",{status}));const response=await publicDiagnosticBytes(id,"documents","ru");expect(response.status).toBe(status===403?404:status);expect(await response.text()).toBe("");expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("refuses invalid known URLs locally and does not discover private report content",async()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect(await readPublicDiagnostic("invalid")).toBeNull();expect((await publicDiagnosticBytes(id,"documents","invalid")).status).toBe(404);expect(fetch).not.toHaveBeenCalled();
 vi.stubGlobal("fetch",async()=>new Response("",{status:404}));expect(await readPublicDiagnostic(id)).toBeNull();expect(await readPublicDiagnosticAvailability(id)).toBeNull();
});
it("refuses redirected, empty and wrong-kind objects without forwarding storage locations",async()=>{
 vi.stubGlobal("fetch",async()=>{throw new Error("redirect rejected with private location");});expect((await publicDiagnosticBytes(id,"documents","en")).status).toBe(503);
 vi.stubGlobal("fetch",async()=>new Response("<html>private details</html>",{headers:{"Content-Type":"text/html"}}));const response=await publicDiagnosticBytes(id,"evidence",id);expect(response.status).toBe(404);expect(await response.text()).toBe("");
});
