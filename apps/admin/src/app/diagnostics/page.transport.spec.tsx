// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import DiagnosticsPage from "./page";
import { continuityCopy } from "./continuity-copy";

import { AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
const order="11111111-1111-4111-8111-111111111111",handoff="22222222-2222-4222-8222-222222222222";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("keeps the exact validated local handoff through the existing TOTP return path",async()=>{
 vi.stubGlobal("fetch",async()=>Response.json({capabilities:[],elevated:false}));
 await expect(DiagnosticsPage({searchParams:Promise.resolve({order,handoff})})).rejects.toThrow(`/login?mode=totp&returnTo=${encodeURIComponent(`/diagnostics?order=${order}&handoff=${handoff}`)}`);
});
it.each([{order:[order,order],handoff},{order,handoff:"https://foreign.invalid/proof"},{order,handoff:[handoff,handoff]},{handoff},{order:"../foreign",handoff}])("refuses malformed or duplicate navigation without attempting a mutation",async query=>{
 const writes:string[]=[];
 vi.stubGlobal("fetch",async(url:string,init?:RequestInit)=>{if(init?.method&&init.method!=="GET")writes.push(String(url));if(String(url).endsWith("/staff/capabilities"))return Response.json({capabilities:[],elevated:true});if(String(url).endsWith("/admin/authority"))return Response.json({marketplaceAdmin:false});return Response.json([]);});
 const page=await DiagnosticsPage({searchParams:Promise.resolve(query)});render(<AdminLocaleProvider initialLocale="en">{page}</AdminLocaleProvider>);
 expect(await screen.findByText(continuityCopy.en.invalid)).toBeTruthy();expect(writes).toEqual([]);
});
