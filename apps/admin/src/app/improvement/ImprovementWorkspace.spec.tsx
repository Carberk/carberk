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
