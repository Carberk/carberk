// @vitest-environment happy-dom
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,waitFor } from "@testing-library/react";

import { MarketResearchPanel } from "./MarketResearchPanel";
import { improvementCopy } from "./copy";

import { AdminLanguageSwitch,AdminLocaleProvider } from "@/lib/i18n";
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"synthetic-access"})}),headers:async()=>new Headers()}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(path);},unstable_rethrow:()=>{}}));
let response:unknown=[],denied=false;
const dataset={state:"qualified",commercialDisclosure:false,retention:"qualified_source_policy",dataset:{id:"synthetic-cars",version:1,derivationVersion:"fixed-cells-v1",retentionClass:"qualified_indefinite",expiresAt:null,sources:[{id:"synthetic-source",version:1,provenance:"Independent synthetic market fixture",retentionBasis:"Reviewed synthetic research"}],cells:[{market:"TM",period:"2026-10",vehicleClass:"passenger",observations:12,priceBand:"5000_14999",ageBand:"unknown",residence:"unknown",demographicSource:"unknown"}]}};
beforeEach(()=>{response=[dataset];denied=false;vi.stubGlobal("fetch",async(url:string)=>{
 if(denied)return Response.json({}, {status:403});
 if(String(url).endsWith("/exports"))return Response.json({id:"11111111-1111-4111-8111-111111111111",expiresAt:"2099-10-18T00:00:00.000Z"});
 return Response.json(response);
});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(["en","ru","tk"] as const)("shows qualified synthetic cells and unknown demographics in %s",async locale=>{
 const copy=improvementCopy[locale],view=render(<AdminLocaleProvider initialLocale={locale}><MarketResearchPanel canInvestigate={false}/></AdminLocaleProvider>);
 await waitFor(()=>expect(view.getByText("12")).toBeTruthy());
 expect(view.getByText("Independent synthetic market fixture")).toBeTruthy();
 expect(view.getByText(copy.qualified_indefinite)).toBeTruthy();
 expect(view.getByText(copy.noDisclosure)).toBeTruthy();expect(view.getAllByText(copy.unknown)).toHaveLength(2);
 expect(view.queryByRole("textbox")).toBeNull();
});
it("keeps source invalidation, quarantine and unavailable separate from qualified cells",async()=>{
 response=[{state:"invalidated",reason:"source"},{state:"quarantined",reason:"rights"},{state:"unavailable"}];
 const view=render(<AdminLocaleProvider initialLocale="en"><MarketResearchPanel canInvestigate/></AdminLocaleProvider>);
 await waitFor(()=>expect(view.getByText(improvementCopy.en.invalidated)).toBeTruthy());
 expect(view.getByText(improvementCopy.en.quarantined)).toBeTruthy();expect(view.getByText(improvementCopy.en.researchUnavailable)).toBeTruthy();expect(view.queryByRole("table")).toBeNull();
});
it("preserves an unfinished audit reason across language change and prepares a real expiring export",async()=>{
 const view=render(<AdminLocaleProvider initialLocale="en"><AdminLanguageSwitch/><MarketResearchPanel canInvestigate/></AdminLocaleProvider>);
 await waitFor(()=>expect(view.getByRole("textbox")).toBeTruthy());
 fireEvent.change(view.getByRole("textbox"),{target:{value:"Review synthetic market sample"}});
 fireEvent.change(view.getByRole("combobox",{name:"Language"}),{target:{value:"tk"}});
 expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Review synthetic market sample");
 fireEvent.click(view.getByRole("button",{name:improvementCopy.tk.prepareExport}));
 await waitFor(()=>expect(view.getByRole("link",{name:improvementCopy.tk.export}).getAttribute("href")).toBe("/improvement/research-artifacts/11111111-1111-4111-8111-111111111111/export?locale=tk"));
});
it("hides cells when current authority is denied",async()=>{
 denied=true;const view=render(<AdminLocaleProvider initialLocale="en"><MarketResearchPanel canInvestigate/></AdminLocaleProvider>);
 await waitFor(()=>expect(view.getByRole("alert").textContent).toContain(improvementCopy.en.denied));
 expect(view.queryByRole("table")).toBeNull();
});
it("removes a prepared research export link exactly when its receipt expires",async()=>{
 const expiresAt=new Date(Date.now()+600).toISOString();
 vi.stubGlobal("fetch",async(url:string)=>String(url).endsWith("/exports")?Response.json({id:"11111111-1111-4111-8111-111111111111",expiresAt}):Response.json([dataset]));
 const view=render(<AdminLocaleProvider initialLocale="en"><MarketResearchPanel canInvestigate/></AdminLocaleProvider>);
 await waitFor(()=>expect(view.getByRole("textbox")).toBeTruthy());fireEvent.change(view.getByRole("textbox"),{target:{value:"Review synthetic expiry verification"}});fireEvent.click(view.getByRole("button",{name:improvementCopy.en.prepareExport}));await waitFor(()=>expect(view.getByRole("link",{name:improvementCopy.en.export})).toBeTruthy());await waitFor(()=>expect(view.queryByRole("link",{name:improvementCopy.en.export})).toBeNull(),{timeout:1500});
});
