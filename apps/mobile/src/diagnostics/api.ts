import { useQuery } from "@tanstack/react-query";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/useAuth";

export type Audience = "public" | "private";
export const reportPath = (id: string, audience: Audience) => `/${audience === "public" ? "public-diagnostics" : "diagnostics"}/reports/${encodeURIComponent(id)}`;
export function useDiagnosticReport(id: string, audience: Audience) {
 const auth=useAuth(), enabled=audience==="public" || auth.isAuthenticated===true;
 const key=["diagnostics",audience,audience==="public"?null:auth.userId,id];
 const policy={enabled,staleTime:0,gcTime:0,retry:false,refetchOnMount:"always" as const,refetchInterval:30_000};
 const report=useQuery({queryKey:[...key,"report"],queryFn:()=>apiClient.get(reportPath(id,audience),audience==="public"?D.PublicDiagnosticReportSchema:D.DiagnosticReportSchema,{auth:audience!=="public"}),...policy});
 const documents=useQuery({queryKey:[...key,"documents"],queryFn:()=>apiClient.get(`${reportPath(id,audience)}/documents`,z.array(D.DiagnosticDocumentSchema),{auth:audience!=="public"}),...policy});
 return {report,documents,authenticated:auth.isAuthenticated};
}
export function useDiagnosticOrders() {
 const auth=useAuth();
 const orders=useQuery({queryKey:["diagnostics","private",auth.userId,"orders"],queryFn:()=>apiClient.get("/diagnostics/orders",z.array(D.DiagnosticOrderSchema)),enabled:auth.isAuthenticated===true,staleTime:0,gcTime:0,retry:false});
 return {...orders,authenticated:auth.isAuthenticated};
}
