// @vitest-environment happy-dom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,waitFor } from "@testing-library/react";

import { ImprovementWorkspace } from "./ImprovementWorkspace";
import { improvementCopy } from "./copy";

import { AdminLanguageSwitch,AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"synthetic-access"})}),headers:async()=>new Headers()}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(path);},unstable_rethrow:()=>{}}));
let state="empty",denied=false,networkFailure=false;
const snapshot=(period:string)=>({state,period,windowFrom:"2026-10-01T00:00:00.000Z",windowTo:"2026-10-08T00:00:00.000Z",generatedAt:"2026-10-08T00:01:00.000Z",completeThrough:"2026-10-08T00:00:00.000Z",environment:"test",population:"synthetic",version:1,lateRecords:0,inventoryAvailable:false,scorecard:null});
beforeEach(()=>{
 state="empty";denied=false;networkFailure=false;
 vi.stubGlobal("fetch",async(url:string)=>{
  if(networkFailure)return Response.json({code:"UNAVAILABLE"},{status:503});
  if(denied) return Response.json({code:"FORBIDDEN"},{status:403});
  return Response.json(snapshot(new URL(String(url)).searchParams.get("period")??"completed_week"));
 });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("actual Improvement workspace and authorized server reads",()=>{
 it.each(["en","ru","tk"] as const)("renders actual loading and completed empty states in %s",async locale=>{
  const copy=improvementCopy[locale],view=render(<AdminLocaleProvider initialLocale={locale}><ImprovementWorkspace canInvestigate={false}/></AdminLocaleProvider>);
  expect(view.getByRole("status").textContent).toBe(copy.loading);
  await waitFor(()=>expect(view.getByRole("status").textContent).toBe(copy.empty));
  expect(view.getByRole("heading",{name:copy.title})).toBeTruthy();
  expect(view.queryByText("0")).toBeNull();
 });
 it.each(["delayed","unavailable","suppressed"] as const)("keeps %s separate from empty and valid zero",async value=>{
  state=value;const view=render(<AdminLocaleProvider initialLocale="en"><ImprovementWorkspace canInvestigate={false}/></AdminLocaleProvider>);
  await waitFor(()=>expect(view.getByRole("status").textContent).toBe(improvementCopy.en[value]));
 });
 it("denies stale pages through the real server action and hides previously loaded evidence",async()=>{
  denied=true;const view=render(<AdminLocaleProvider initialLocale="en"><ImprovementWorkspace canInvestigate/></AdminLocaleProvider>);
  await waitFor(()=>expect(view.getByRole("alert").textContent).toContain(improvementCopy.en.denied));
  expect(view.queryByText(improvementCopy.en.evidence)).toBeNull();
 });
 it("preserves observation filters and unfinished reason across locales and Escape restores focus",async()=>{
  const view=render(<AdminLocaleProvider initialLocale="en"><AdminLanguageSwitch/><ImprovementWorkspace canInvestigate/></AdminLocaleProvider>);
  await waitFor(()=>expect(view.getByRole("status").textContent).toBe(improvementCopy.en.empty));
  fireEvent.change(view.getByLabelText(improvementCopy.en.period),{target:{value:"today"}});
  await waitFor(()=>expect(view.getByRole("button",{name:improvementCopy.en.evidence})).toBeTruthy());
  const opener=view.getByRole("button",{name:improvementCopy.en.evidence});opener.focus();fireEvent.click(opener);
  fireEvent.change(view.getByLabelText(improvementCopy.en.reason),{target:{value:"Synthetic operator investigation"}});
  fireEvent.change(view.getByRole("combobox",{name:"Language"}),{target:{value:"tk"}});
  expect((view.getByLabelText(improvementCopy.tk.reason) as HTMLTextAreaElement).value).toBe("Synthetic operator investigation");
  expect((view.getByLabelText(improvementCopy.tk.period) as HTMLSelectElement).value).toBe("today");
  fireEvent.keyDown(document,{key:"Escape"});
  expect(view.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(opener);
 });
 it.each((["en","ru","tk"] as const).flatMap(locale=>(["delayed","unavailable","suppressed"] as const).map(value=>({locale,value}))))("renders $value in $locale",async({locale,value})=>{
  state=value;const view=render(<AdminLocaleProvider initialLocale={locale}><ImprovementWorkspace canInvestigate={false}/></AdminLocaleProvider>);
  await waitFor(()=>expect(view.getByRole("status").textContent).toBe(improvementCopy[locale][value]));
 });
 it.each((["en","ru","tk"] as const).flatMap(locale=>(["denied","error"] as const).map(value=>({locale,value}))))("renders $value in $locale through the real network boundary",async({locale,value})=>{
  denied=value==="denied";networkFailure=value==="error";
  const view=render(<AdminLocaleProvider initialLocale={locale}><ImprovementWorkspace canInvestigate={false}/></AdminLocaleProvider>);
  await waitFor(()=>expect(view.getByRole("alert").textContent).toContain(improvementCopy[locale][value]));
 });

});

it("shows all seven ready journey steps and separates mature retention from immature cohorts",async()=>{
 const rate={state:"ready",numerator:4,denominator:10,value:0.4,smallSample:true},immature={state:"immature",numerator:null,denominator:null,value:null,smallSample:false};
 vi.stubGlobal("fetch",async(url:string)=>Response.json({...snapshot(new URL(String(url)).searchParams.get("period")??"completed_week"),state:"ready",inventoryAvailable:true,scorecard:{version:1,state:"ready",inventory:{listingHours:240,averageActive:10,currentActive:10},contacts:{calls:4,conversations:6,total:10,perActiveListing:1},publication:rate,replies:rate,signIn:rate,upload:rate,firstBuyerMessages:6,steps:["vehicle","specs","photos","price","location","contact","review"].map(step=>({step,opened:10,completed:4})),discovery:{opens:100,searches:50,detailOpens:25},zeroSearches:rate,retention:{accounts:{d1:rate,d7:rate,d30:immature},guests:{d1:rate,d7:immature,d30:immature}}}}));
 const view=render(<AdminLocaleProvider initialLocale="en"><ImprovementWorkspace canInvestigate={false}/></AdminLocaleProvider>);await waitFor(()=>expect(view.getByRole("status").textContent).toBe(improvementCopy.en.ready));
 fireEvent.click(view.getByRole("button",{name:improvementCopy.en.journeys}));
 for(const step of ["vehicle","specs","photos","price","location","contact","review"] as const)expect(view.getByText(improvementCopy.en[step])).toBeTruthy();
 expect(view.getAllByText(improvementCopy.en.immature).length).toBeGreaterThan(0);
 expect(view.getAllByText(improvementCopy.en.small).length).toBeGreaterThan(0);
});

it("removes expired investigation evidence and its export link at the actual deadline",async()=>{
 const receipt={id:"11111111-1111-4111-8111-111111111111",expiresAt:new Date(Date.now()+250).toISOString()};
 vi.stubGlobal("fetch",async(url:string)=>String(url).includes("/artifacts/")?Response.json({generatedAt:new Date().toISOString(),expiresAt:receipt.expiresAt,reason:"Synthetic expiry verification",events:[]}):String(url).endsWith("/investigations")?Response.json(receipt):Response.json(snapshot("completed_week")));
 const view=render(<AdminLocaleProvider initialLocale="en"><ImprovementWorkspace canInvestigate/></AdminLocaleProvider>);await waitFor(()=>expect(view.getByRole("button",{name:improvementCopy.en.evidence})).toBeTruthy());fireEvent.click(view.getByRole("button",{name:improvementCopy.en.evidence}));fireEvent.change(view.getByRole("textbox"),{target:{value:"Synthetic expiry verification"}});fireEvent.click(view.getByRole("button",{name:improvementCopy.en.investigate}));await waitFor(()=>expect(view.getByRole("link",{name:improvementCopy.en.export})).toBeTruthy());await waitFor(()=>expect(view.queryByRole("link",{name:improvementCopy.en.export})).toBeNull(),{timeout:1000});
});
