import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiagnosticReader } from "@/diagnostics/Reader";
import { diagnosticCopy,diagnosticLocale } from "@/diagnostics/copy";
import { readPublicDiagnostic,readDiagnosticDocuments } from "@/diagnostics/readers";
import { ReaderShell } from "@/marketplace/Reader";
export const dynamic="force-dynamic";
type Props={params:Promise<{locale:string;id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {locale}=await params;return {title:diagnosticCopy(locale).title,robots:{index:false,follow:false}};}
export default async function PublicDiagnosticPage({params}:Props) {
 const {locale:raw,id}=await params,locale=diagnosticLocale(raw),report=await readPublicDiagnostic(id);
 if(!report)notFound();
 const documents=await readDiagnosticDocuments(id).catch(()=>null);
 return <ReaderShell locale={locale} path={`/diagnostics/${id}`}><DiagnosticReader report={report} documents={documents} locale={locale}/></ReaderShell>;
}
