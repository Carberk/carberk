import { beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { renderMobile, fireEvent, act, routerMock } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession, clearAuthSession } from "../auth/session";

import { DiagnosticReader } from "./DiagnosticReader";
vi.mock("expo-secure-store", () => { const store = new Map<string,string>(); return { getItemAsync: async (key:string) => store.get(key)??null, setItemAsync: async(key:string,value:string)=>{store.set(key,value);},deleteItemAsync:async(key:string)=>{store.delete(key);} }; });
vi.mock("expo-sharing",()=>({isAvailableAsync:async()=>true,shareAsync:async()=>{}}));
vi.mock("expo-file-system",()=>({Paths:{cache:"file:///cache"},File:class {uri="file:///cache/report.pdf";create(){}write(){}delete(){}}}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"synthetic"}));
const id="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222",next="33333333-3333-4333-8333-333333333333";
const label={en:"Brake response",ru:"Работа тормозов",tk:"Tormozlaryň işleýşi"}, scope={en:"Only accessible surfaces were checked",ru:"Проверены только доступные поверхности",tk:"Diňe elýeterli üstler barlandy"};
let denied=false,ready=false,downloads=0;
const report: D.DiagnosticReportRecord={id,orderId:id,audience:"buyer_private",status:"withdrawn",templateVersionId:id,observedAt:"2026-10-17T10:00:00.000Z",mileageKm:123000,findings:[{id,checkId:"brakes",assessment:"fault",explanation:"Synthetic observed fault",evidenceIds:[],kind:"observed_damage",source:null,measurement:{value:125,unit:"µm",method:"Gauge",uncertainty:"±5 µm"},location:{panelId:"hood",view:"top",x:.5,y:.5}}],authorId:null,reviewerId:null,successorOf:null,supersededBy:next,correctionReason:null,returnReason:null,finalizedAt:"2026-10-17T10:00:00.000Z",withdrawnAt:"2026-10-18T10:00:00.000Z",withdrawalReason:"Synthetic association dispute",version:4,template:{title:{en:"Inspection report",ru:"Отчёт об осмотре",tk:"Barlag hasabaty"},limitations:scope,syntheticNotice:{en:"Synthetic demonstration",ru:"Синтетический пример",tk:"Emeli nusga"},checks:[{id:"brakes",label,required:true,evidenceRequired:false,measurement:null},{id:"engine",label:{en:"Engine",ru:"Двигатель",tk:"Hereketlendiriji"},required:true,evidenceRequired:false,measurement:null}],panels:[{id:"hood",label:{en:"Hood",ru:"Капот",tk:"Kapot"},views:["top"],evidenceRequired:false}]},synthetic:true};
beforeEach(async()=>{
 await clearAuthSession(); await storeAuthSession({accessToken:"synthetic",refreshToken:"refresh",user:{id:user,phone:null,email:null,displayName:null,role:"buyer"}});denied=false;ready=false;downloads=0;
 server.use(http.get("*/diagnostics/reports/:id",()=>denied?HttpResponse.json({code:"DIAGNOSTIC_NO_ACCESS"},{status:403}):HttpResponse.json(report)),http.get("*/diagnostics/reports/:id/documents",()=>HttpResponse.json([{id,locale:"en",state:ready?"ready":"pending",generation:1,rendererVersion:"v1",generatedAt:ready?"2026-10-18T10:00:00.000Z":null,retryAt:null}])),http.get("*/diagnostics/reports/:id/documents/en",({request})=>{expect(request.headers.get("Authorization")).toBe("Bearer synthetic");downloads++;return new HttpResponse(new Uint8Array([37,80,68,70]),{headers:{"Content-Type":"application/pdf"}});}));
});
it.each([["en","Brake response"],["ru","Работа тормозов"],["tk","Tormozlaryň işleýşi"]])("shows complete released findings with localized checks in %s",async(locale,label)=>{
 const view=await renderMobile(<DiagnosticReader id={id} audience="private"/>,{locale});expect(await view.findByText(label??"")).toBeTruthy();expect(view.getByText("Synthetic observed fault")).toBeTruthy();expect(view.getByText(/125 µm/)).toBeTruthy();expect(view.getByText(/±5 µm/)).toBeTruthy();expect(view.getByText(/123.?000/)).toBeTruthy();
});
it("shows unchecked scope, withdrawal, correction navigation and keeps PDF pending honest",async()=>{
 const view=await renderMobile(<DiagnosticReader id={id} audience="private"/>);await view.findByText("Brake response");expect(view.getAllByText("Not checked").length).toBeGreaterThan(0);expect(view.getByText(scope.en)).toBeTruthy();expect(view.getByText("Synthetic association dispute")).toBeTruthy();expect(await view.findByText("PDF is being prepared. The findings can be read now.")).toBeTruthy();expect(view.queryByRole("button",{name:"Open or save PDF"})).toBeNull();
 await fireEvent.press(view.getByRole("button",{name:"Open correction"}));expect(routerMock.push).toHaveBeenCalledWith({pathname:"/diagnostics/[id]",params:{id:next,audience:"private"}});
});
it("opens only a ready explicit-locale PDF through the authenticated native document boundary",async()=>{
 ready=true;const view=await renderMobile(<DiagnosticReader id={id} audience="private"/>);await fireEvent.press(await view.findByRole("button",{name:"Open or save PDF"}));await view.findByRole("button",{name:"Open or save PDF"});expect(downloads).toBe(1);
});
it("hides cached private findings after failed revalidation and sign-out",async()=>{
 const view=await renderMobile(<DiagnosticReader id={id} audience="private"/>);await view.findByText("Synthetic observed fault");denied=true;await fireEvent.press(view.getByRole("button",{name:"Refresh report"}));await view.findByText("This report is unavailable. Refresh or check your access.");expect(view.queryByText("Synthetic observed fault")).toBeNull();await act(async()=>{await clearAuthSession();});expect(await view.findByText("Sign in to read your private reports")).toBeTruthy();
});
it("reads anonymous public findings without attaching a private session",async()=>{
 let auth:string|null="unused";server.use(http.get("*/public-diagnostics/reports/:id",({request})=>{auth=request.headers.get("Authorization");return HttpResponse.json({...report,audience:"listing_public",status:"finalized",withdrawnAt:null});}),http.get("*/public-diagnostics/reports/:id/documents",()=>HttpResponse.json([])));
 const view=await renderMobile(<DiagnosticReader id={id} audience="public"/>);await view.findByText("Synthetic observed fault");expect(auth).toBeNull();
});
