import { publicDiagnosticBytes } from "@/diagnostics/readers";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string;evidenceId:string}>}) {const {id,evidenceId}=await params;return publicDiagnosticBytes(id,"evidence",evidenceId);}
