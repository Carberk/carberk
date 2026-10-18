import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { DiagnosticReader } from "./Reader";
import { diagnosticCopy } from "./copy";
const id="11111111-1111-4111-8111-111111111111",next="22222222-2222-4222-8222-222222222222";
const text={en:"Brake response",ru:"Работа тормозов",tk:"Tormozlaryň işleýşi"};
const report:D.PublicDiagnosticReport={id,audience:"listing_public",status:"finalized",templateVersionId:id,observedAt:"2026-10-17T10:00:00.000Z",mileageKm:123000,findings:[{id,checkId:"brakes",assessment:"fault",explanation:"Synthetic observed fault",evidenceIds:[id],kind:"observed_repair",source:"Synthetic source",measurement:{value:125,unit:"µm",method:"Gauge",uncertainty:"±5 µm"},location:{panelId:"hood",view:"top",x:.5,y:.5}}],authorId:null,reviewerId:null,successorOf:null,supersededBy:next,correctionReason:null,returnReason:null,finalizedAt:"2026-10-17T10:00:00.000Z",withdrawnAt:null,withdrawalReason:null,version:3,template:{title:text,limitations:text,syntheticNotice:text,checks:[{id:"brakes",label:text,required:true,evidenceRequired:false,measurement:null},{id:"engine",label:text,required:true,evidenceRequired:false,measurement:null}],panels:[{id:"hood",label:text,views:["top"],evidenceRequired:false}]},synthetic:true};
describe.each(["en","ru","tk"] as const)("public diagnostic reader in %s",locale=>{
 it("renders complete findings, text references, uncertainty and current correction without private intake",()=>{
  const html=renderToStaticMarkup(createElement(DiagnosticReader,{report,documents:[],locale}));
  for(const value of [text[locale],"Synthetic observed fault","125","µm","±5 µm","hood","engine",diagnosticCopy(locale).not_checked])expect(html).toContain(value);
  expect(html).toContain(`/${locale}/diagnostics/${next}`);expect(html).not.toMatch(/orderId|commissionerId|diagnostic-pdf\//);
  expect((html.match(/<svg /g)??[]).length).toBe(5);
 });
 it("shows preparation until the selected locale artifact is ready",()=>{
  const pending=renderToStaticMarkup(createElement(DiagnosticReader,{report,documents:[],locale}));expect(pending).toContain(diagnosticCopy(locale).pending);expect(pending).not.toContain(`/documents/${locale}`);
  const ready=renderToStaticMarkup(createElement(DiagnosticReader,{report,documents:[{id,locale,state:"ready",generation:1,rendererVersion:"v1",generatedAt:"2026-10-18T10:00:00.000Z",retryAt:null}],locale}));expect(ready).toContain(`/${locale}/diagnostics/${id}/documents/${locale}`);expect(ready).toContain(diagnosticCopy(locale).copies);
 });
});
