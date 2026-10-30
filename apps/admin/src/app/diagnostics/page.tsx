import { z } from "zod";

import { AdminNav } from "../(admin)/components/AdminNav";

import { DiagnosticWorkspace } from "./DiagnosticWorkspace";

import { currentMarketplaceAdmin, currentStaff } from "@/lib/staff-session";
export default async function DiagnosticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const query=await searchParams;
 const parsed=z.object({order:z.string().uuid(),handoff:z.string().uuid().optional()}).strict().safeParse(query);
 const hasLink=query["order"]!==undefined||query["handoff"]!==undefined;
 const initialOrder=parsed.success?parsed.data.order:undefined,handoff=parsed.success?parsed.data.handoff:undefined;
 const returnTo=initialOrder?`/diagnostics?${new URLSearchParams({order:initialOrder,...(handoff?{handoff}:{})})}`:"/diagnostics";
 const summary = await currentStaff(returnTo), marketplaceAdmin = await currentMarketplaceAdmin();
 return <><AdminNav capabilities={summary.capabilities} marketplaceAdmin={marketplaceAdmin}/><main id="main" className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8"><DiagnosticWorkspace key={`${initialOrder??"queue"}:${handoff??""}`} initialOrder={initialOrder} handoff={handoff} invalidLink={hasLink&&!parsed.success}/></main></>;
}
