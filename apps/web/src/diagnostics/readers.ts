import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { z } from "zod";

const uuid=z.string().uuid();
function origin() {
 const value=process.env["API_BASE_URL"]??process.env["NEXT_PUBLIC_API_URL"];
 if(!value)throw new Error("Public report API origin is not configured");
 return `${value.replace(/\/$/,"")}/api/v1/public-diagnostics`;
}
async function read<T>(path:string,schema:{parse(input:unknown):T}):Promise<T|null> {
 const response=await fetch(`${origin()}${path}`,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10_000)});
 if(response.status===404||response.status===400)return null;
 if(!response.ok)throw new Error("Report unavailable");
 return schema.parse(await response.json());
}
export const readPublicDiagnostic=(id:string)=>uuid.safeParse(id).success?read(`/reports/${id}`,D.PublicDiagnosticReportSchema):Promise.resolve(null);
export const readDiagnosticDocuments=(id:string)=>uuid.safeParse(id).success?read(`/reports/${id}/documents`,z.array(D.DiagnosticDocumentSchema)):Promise.resolve(null);
export async function readPublicDiagnosticAvailability(id:string) {
 if(!uuid.safeParse(id).success)return null;
 try{return await read(`/listings/${id}`,D.PublicDiagnosticAvailabilitySchema);}catch{return null;}
}
/** Same-origin proxy checks the current public audience on every binary read. */
export async function publicDiagnosticBytes(id:string,kind:"documents"|"evidence",key:string):Promise<Response> {
 if(!uuid.safeParse(id).success||!(kind==="documents"?z.enum(["tk","ru","en"]):uuid).safeParse(key).success)return new Response(null,{status:404,headers:{"Cache-Control":"no-store, private"}});
 try{
  const upstream=await fetch(`${origin()}/reports/${id}/${kind}/${key}`,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000)});
  const mime=upstream.headers.get("Content-Type")?.split(";")[0];
  if(!upstream.ok||!(kind==="documents"?mime==="application/pdf":["image/webp","image/png","image/jpeg"].includes(mime??"")))return new Response(null,{status:upstream.status===409?409:upstream.status===503?503:404,headers:{"Cache-Control":"no-store, private"}});
  if(Number(upstream.headers.get("Content-Length"))>20*1024*1024)throw new Error("Invalid document");
  const bytes=await upstream.arrayBuffer();if(bytes.byteLength===0||bytes.byteLength>20*1024*1024)throw new Error("Invalid document");
  return new Response(bytes,{headers:{"Content-Type":mime??"application/octet-stream","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff",...(kind==="documents"?{"Content-Disposition":"attachment; filename=inspection-report.pdf"}:{})}});
 }catch{return new Response(null,{status:503,headers:{"Cache-Control":"no-store, private"}});}
}
