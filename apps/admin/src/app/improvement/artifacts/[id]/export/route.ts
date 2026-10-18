import { ImprovementSchemas } from "@auto-tm/contracts";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { improvementCopy } from "../../../copy";

import { apiFetch,ApiError } from "@/lib/api-client";
import { normalizeAdminLocale } from "@/lib/messages";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/.test(id)) return new NextResponse(null,{status:400});
 try {
  const timeline=ImprovementSchemas.ImprovementTimelineSchema.parse(await apiFetch(`/improvement/artifacts/${id}`));
  const locale=normalizeAdminLocale(new URL(request.url).searchParams.get("locale")),copy=improvementCopy[locale];
  const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
  const rows=[[copy.date,copy.subject,copy.event,copy.platform,copy.release,copy.result],...timeline.events.map(event=>[event.at,event.subject,event.eventName,event.platform,event.release,event.result??""])];
  return new NextResponse("\uFEFF"+rows.map(row=>row.map(quote).join(",")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="carberk-improvement-${locale}.csv"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 } catch(error) {
  unstable_rethrow(error);
  return new NextResponse(null,{status:error instanceof ApiError && error.status===403?403:503,headers:{"Cache-Control":"no-store"}});
 }
}
