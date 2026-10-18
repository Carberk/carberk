import { publicDiagnosticBytes } from "@/diagnostics/readers";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string;documentLocale:string}>}) {const {id,documentLocale}=await params;return publicDiagnosticBytes(id,"documents",documentLocale);}
