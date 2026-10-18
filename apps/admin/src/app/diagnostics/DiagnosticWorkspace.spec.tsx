// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { DiagnosticWorkspace } from "./DiagnosticWorkspace";
import { diagnosticCopy } from "./copy";

import { AdminLanguageSwitch, AdminLocaleProvider } from "@/lib/i18n";

const framework = vi.hoisted(() => ({ rejectHeaders: false }));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"synthetic-access"})}),headers:async()=>{if(framework.rejectHeaders)throw new TypeError("request context unavailable");return new Headers();}}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(path);},unstable_rethrow:()=>{}}));
const actor="11111111-1111-4111-8111-111111111111",orderId="22222222-2222-4222-8222-222222222222",templateId="33333333-3333-4333-8333-333333333333",centerId="44444444-4444-4444-8444-444444444444",reportId="55555555-5555-4555-8555-555555555555";
const text={en:"Synthetic brake check",ru:"Синтетическая проверка тормозов",tk:"Emeli tormoz barlagy"};
const definition={title:text,limitations:text,syntheticNotice:text,checks:[{id:"brakes",label:text,required:true,evidenceRequired:false,measurement:null}],panels:[]};
let context:D.DiagnosticWorkspace,report:D.DiagnosticReportRecord,denied=false,conflict=false,uploadFailures=0;
let savedRequests:D.DiagnosticFindingSave[],uploads:string[],transitions:D.DiagnosticReportTransition[];
const reportFixture=():D.DiagnosticReportRecord=>({id:reportId,orderId,audience:"buyer_private",status:"draft",templateVersionId:templateId,observedAt:"2026-10-17T05:00:00.000Z",mileageKm:123000,findings:[],authorId:actor,reviewerId:null,successorOf:null,supersededBy:null,correctionReason:null,returnReason:null,finalizedAt:null,withdrawnAt:null,withdrawalReason:null,version:0,template:definition,synthetic:true});
function setup(locale:"en"|"ru"|"tk"="en"){return render(<AdminLocaleProvider initialLocale={locale}><AdminLanguageSwitch/><DiagnosticWorkspace/></AdminLocaleProvider>);}
async function open(view:ReturnType<typeof setup>,locale:"en"|"ru"|"tk"="en"){fireEvent.click(await view.findByRole("button",{name:diagnosticCopy[locale].open}));await view.findByText(text[locale],{selector:"h4"});}
beforeEach(()=>{
 framework.rejectHeaders=false;denied=false;conflict=false;uploadFailures=0;savedRequests=[];uploads=[];transitions=[];report=reportFixture();
 context={actorId:actor,order:{id:orderId,centerId,templateVersionId:templateId,audience:"buyer_private",listingId:null,status:"arrived",version:7,synthetic:true,createdAt:"2026-10-17T00:00:00.000Z",physicalAuthorized:true,publicationAuthorized:false,vehicleMatched:false,physicalAuthorization:{authorityReference:"Synthetic authorization",recordedBy:actor,recordedAt:"2026-10-17T00:00:00.000Z"},publicationAuthorization:null,observedVehicle:{observedAt:report.observedAt,mileageKm:report.mileageKm,method:"manual",vin:null,manualReference:"Synthetic manual match"},events:[]},template:{id:templateId,centerId,version:1,definition,synthetic:true,publishedAt:"2026-10-17T00:00:00.000Z"},capabilities:["diagnostics.technician"],assignments:[{userId:actor,capability:"diagnostics.technician"}],staffChoices:[]};
 vi.stubGlobal("fetch",async(url:string,init?:RequestInit)=>{
  const path=new URL(String(url),"http://localhost").pathname;
  if(denied)return Response.json({code:"DIAGNOSTIC_NO_ACCESS"},{status:403});
  if(init?.method==="PUT") {uploads.push(String(url));if(uploadFailures-->0)return Response.json({code:"FAIL"},{status:503});return Response.json({id:path.split("/").at(-1)});}
  if(path.endsWith("/assigned"))return Response.json([context.order]);
  if(path.endsWith("/workspace"))return Response.json(context);
  if(path.endsWith("/reports"))return Response.json([report]);
  if(path.endsWith("/findings")){
   const input=JSON.parse(String(init?.body)) as D.DiagnosticFindingSave;savedRequests.push(input);
   if(conflict){conflict=false;report={...report,version:1,findings:[{...input.finding,explanation:"Other technician saved note"}]};return Response.json({code:"DIAGNOSTIC_STALE_VERSION"},{status:409});}
   report={...report,version:report.version+1,findings:[input.finding]};return Response.json(report);
  }
  if(path.endsWith("/transition")){const input=JSON.parse(String(init?.body)) as D.DiagnosticReportTransition;transitions.push(input);report={...report,status:input.action==="submit"?"submitted":input.action==="return"?"returned":"finalized",version:report.version+1};return Response.json(report);}
  return Response.json(null);
 });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("actual diagnostic staff workspace and server actions",()=>{
 it.each(["en","ru","tk"] as const)("shows explicit unassessed state and saves an intentional result in %s",async locale=>{
  const c=diagnosticCopy[locale],view=setup(locale);expect(view.getByRole("status").textContent).toBe(c.loading);await open(view,locale);
  expect(view.getByText(c.unchecked)).toBeTruthy();fireEvent.click(view.getByRole("button",{name:c.finding}));
  const select=view.getByRole("combobox",{name:c.finding}) as HTMLSelectElement;expect(select.value).toBe("");
  expect((view.getByRole("button",{name:c.save}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(select,{target:{value:"normal"}});fireEvent.click(view.getByRole("button",{name:c.save}));
  await waitFor(()=>expect(savedRequests).toHaveLength(1));expect(savedRequests[0]?.finding.assessment).toBe("normal");
  await waitFor(()=>expect(view.queryByText(c.local,{exact:false})).toBeNull());
 });
 it("retains the local explanation through conflict, locale switch and explicit current-version comparison",async()=>{
  conflict=true;const view=setup();await open(view);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.finding}));
  fireEvent.change(view.getByRole("combobox",{name:diagnosticCopy.en.finding}),{target:{value:"not_checked"}});
  fireEvent.change(view.getByLabelText(diagnosticCopy.en.explanation),{target:{value:"My long retained explanation"}});
  fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.save}));await view.findByText(diagnosticCopy.en.conflict);
  expect((view.getByRole("button",{name:diagnosticCopy.en.save}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByRole("combobox",{name:"Language"}),{target:{value:"tk"}});
  expect((view.getByLabelText(diagnosticCopy.tk.explanation) as HTMLTextAreaElement).value).toBe("My long retained explanation");
  fireEvent.click(view.getAllByRole("button",{name:diagnosticCopy.tk.refresh})[0] as HTMLElement);
  await waitFor(()=>expect((view.getByRole("button",{name:diagnosticCopy.tk.save}) as HTMLButtonElement).disabled).toBe(false));
  expect(view.getAllByText(/Other technician saved note/)).toHaveLength(2);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.tk.save}));
  await waitFor(()=>expect(savedRequests).toHaveLength(2));expect(savedRequests[1]?.expectedVersion).toBe(1);expect(savedRequests[1]?.finding.id).toBe(savedRequests[0]?.finding.id);expect(savedRequests[1]?.finding.explanation).toBe("My long retained explanation");
 });
 it("retries the exact evidence identity and cannot save while the image is unresolved",async()=>{
  uploadFailures=1;const view=setup();await open(view);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.finding}));
  fireEvent.change(view.getByRole("combobox",{name:diagnosticCopy.en.finding}),{target:{value:"fault"}});
  fireEvent.change(view.getByLabelText(diagnosticCopy.en.explanation),{target:{value:"Observed damage"}});
  const file=new File([new Uint8Array([1,2,3])],"owned-synthetic.jpg",{type:"image/jpeg"});
  fireEvent.change(view.getByLabelText(diagnosticCopy.en.addEvidence),{target:{files:[file]}});
  await view.findByRole("button",{name:diagnosticCopy.en.uploadRetry});expect((view.getByRole("button",{name:diagnosticCopy.en.save}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.uploadRetry}));await waitFor(()=>expect(uploads).toHaveLength(2));
  await waitFor(()=>expect((view.getByRole("button",{name:diagnosticCopy.en.save}) as HTMLButtonElement).disabled).toBe(false));
  expect(uploads[0]).toBe(uploads[1]);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.save}));await waitFor(()=>expect(savedRequests).toHaveLength(1));expect(savedRequests[0]?.finding.evidenceIds).toHaveLength(1);
 });
 it("hides protected local work after current assignment denial through a real server read",async()=>{
  const view=setup();await open(view);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.finding}));fireEvent.change(view.getByLabelText(diagnosticCopy.en.explanation),{target:{value:"Private retained note"}});
  denied=true;fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.refresh}));await view.findByText(diagnosticCopy.en.denied);
  expect(view.queryByDisplayValue("Private retained note")).toBeNull();expect(view.queryByText(text.en)).toBeNull();
 });
 it("blocks public self-finalization and requires explicit authorized private self-review",async()=>{
  report.status="submitted";report.audience="listing_public";context.capabilities.push("diagnostics.reviewer");const view=setup();await open(view);
  expect((view.getByRole("button",{name:diagnosticCopy.en.finalize}) as HTMLButtonElement).disabled).toBe(true);expect(view.queryByLabelText(diagnosticCopy.en.selfReview)).toBeNull();cleanup();
  report.audience="buyer_private";const privateView=setup();await open(privateView);
  fireEvent.change(privateView.getByLabelText(diagnosticCopy.en.reason),{target:{value:"Explicit synthetic founder-authorized private self-review"}});
  fireEvent.click(privateView.getByLabelText(diagnosticCopy.en.selfReview));fireEvent.click(privateView.getByRole("button",{name:diagnosticCopy.en.finalize}));
  await waitFor(()=>expect(transitions).toHaveLength(1));expect(transitions[0]?.privateSelfReview).toBe(true);expect(transitions[0]?.reason).toContain("authorized");
 });
 it.each(["en","ru","tk"] as const)("renders returned review reasons and protected denial in %s",async locale=>{
  report.status="returned";report.returnReason="Synthetic reviewer requests complete observations";
  const view=setup(locale);await open(view,locale);expect(view.getByText(`${diagnosticCopy[locale].return}: ${report.returnReason}`)).toBeTruthy();
  denied=true;fireEvent.click(view.getByRole("button",{name:diagnosticCopy[locale].refresh}));await view.findByText(diagnosticCopy[locale].denied);expect(view.queryByText(report.returnReason,{exact:false})).toBeNull();
 });
 it("keeps all five body views equivalent to explicitly assessed and unassessed panel text",async()=>{
  report.template={...definition,panels:[{id:"left_door",label:{en:"Left door",ru:"Левая дверь",tk:"Çep gapy"},views:["left"],evidenceRequired:false},{id:"right_door",label:{en:"Right door",ru:"Правая дверь",tk:"Sag gapy"},views:["right"],evidenceRequired:false}]};
  report.findings=[{id:"66666666-6666-4666-8666-666666666666",checkId:"left_door",assessment:"normal",explanation:"Explicit panel assessment retained",evidenceIds:[],kind:null,source:null,measurement:null,location:null}];
  const view=setup();await open(view);expect(view.getAllByRole("img")).toHaveLength(5);expect(view.getByText(diagnosticCopy.en.zero)).toBeTruthy();expect(view.getByText("Explicit panel assessment retained")).toBeTruthy();
  const unassessed=view.getByText("Right door").closest("li");expect(unassessed).toBeTruthy();expect(within(unassessed as HTMLElement).getByText(diagnosticCopy.en.unassessed)).toBeTruthy();
 });
 it("never invents a zero measurement when only method and uncertainty were entered",async()=>{
  report.template={...definition,checks:[{...definition.checks[0] as D.DiagnosticTemplateDefinition["checks"][number],measurement:{unit:"mm",method:text}}]};
  const view=setup();await open(view);fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.finding}));fireEvent.change(view.getByRole("combobox",{name:diagnosticCopy.en.finding}),{target:{value:"normal"}});
  fireEvent.change(view.getByLabelText(diagnosticCopy.en.measurementMethod),{target:{value:"Calibrated instrument"}});fireEvent.change(view.getByLabelText(diagnosticCopy.en.uncertainty),{target:{value:"±0.2 mm"}});
  expect((view.getByLabelText(diagnosticCopy.en.value) as HTMLInputElement).value).toBe("");expect((view.getByRole("button",{name:diagnosticCopy.en.save}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText(diagnosticCopy.en.value),{target:{value:"4.5"}});fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.save}));await waitFor(()=>expect(savedRequests).toHaveLength(1));expect(savedRequests[0]?.finding.measurement?.value).toBe(4.5);
 });

});

it("disables report decisions and selection while current workspace evidence is refreshing", async () => {
 const view=setup();await open(view);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const request=fetch;
 vi.stubGlobal("fetch",async(...args:Parameters<typeof fetch>)=>{if(String(args[0]).endsWith("/workspace"))await gate;return request(...args);});
 try {
  fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.refresh}));
  await view.findByText(diagnosticCopy.en.loading);
  expect((view.getByRole("button",{name:diagnosticCopy.en.submit}) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole("combobox",{name:diagnosticCopy.en.selectReport}) as HTMLSelectElement).disabled).toBe(true);
 }finally{release();await waitFor(()=>expect(view.queryByText(diagnosticCopy.en.loading)).toBeNull());}
});

it("hides protected decisions when a real action rejects while reading the framework request context", async () => {
 const view=setup();await open(view);
 expect(view.getByRole("button",{name:diagnosticCopy.en.submit})).toBeTruthy();
 framework.rejectHeaders=true;
 fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.refresh}));
 await view.findByText(diagnosticCopy.en.error);
 expect(view.queryByRole("button",{name:diagnosticCopy.en.submit})).toBeNull();
 expect(view.queryByRole("combobox",{name:diagnosticCopy.en.selectReport})).toBeNull();
 framework.rejectHeaders=false;
 fireEvent.click(view.getByRole("button",{name:diagnosticCopy.en.retry}));
 expect(await view.findByRole("button",{name:diagnosticCopy.en.open})).toBeTruthy();
});
