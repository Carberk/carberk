import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { apiClient } from "../api/client";
import { PrivateDocumentAction } from "../documents/PrivateDocumentAction";
import { localeTag } from "../i18n/resources";

import { reportPath, useDiagnosticReport, type Audience } from "./api";
import { diagnosticCopy, diagnosticLocale } from "./copy";
import { DiagnosticBodyMap } from "./DiagnosticBodyMap";
import { DiagnosticEvidence } from "./DiagnosticEvidence";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function DiagnosticReader({id,audience}:{id:string;audience:Audience}) {
 const {i18n}=useTranslation(),locale=diagnosticLocale(i18n.language),c=diagnosticCopy(locale),query=useDiagnosticReport(id,audience);
 const report=query.report.isError?undefined:query.report.data;
 if(audience==="private"&&query.authenticated!==true)return <Text className="p-5">{query.authenticated===null?c.loading:c.signIn}</Text>;
 const refresh=()=>{void query.report.refetch();void query.documents.refetch();};
 const link=(target:string,label:string)=><Button accessibilityLabel={label} onPress={()=>router.push({pathname:"/diagnostics/[id]",params:{id:target,audience}})}><Text>{label}</Text></Button>;
 const document=query.documents.isError?undefined:query.documents.data?.find(item=>item.locale===locale);
 return <ScrollView contentContainerClassName="gap-5 p-5 pb-12"><Text accessibilityRole="header" className="font-heading text-title-2 font-bold">{report?.template.title[locale]??c.title}</Text><Button accessibilityLabel={c.refresh} onPress={refresh}><Text>{c.refresh}</Text></Button>
 {query.report.isError?<Text accessibilityRole="alert">{c.unavailable}</Text>:!report?<Text>{c.loading}</Text>:<View className="gap-6">
  {report.synthetic?<Text>{report.template.syntheticNotice[locale]}</Text>:null}
  <View className="gap-2"><Text>{c.date}: {new Date(report.observedAt).toLocaleString(localeTag(locale))}</Text><Text>{c.mileage}: {report.mileageKm.toLocaleString(localeTag(locale))} km</Text><Text>{c.status}: {c[report.status]}</Text>{report.withdrawalReason?<Text>{report.withdrawalReason}</Text>:null}{report.supersededBy?link(report.supersededBy,c.correction):null}{report.successorOf?link(report.successorOf,c.previous):null}{report.correctionReason?<Text>{c.correctionReason}: {report.correctionReason}</Text>:null}<Text>{c.reference}: {report.id}</Text><Text>{c.revision}: {report.version}</Text></View>
  <View className="gap-2"><Text accessibilityRole="header" className="font-semibold">{c.limits}</Text><Text>{report.template.limitations[locale]}</Text><Text>{c.copies}</Text></View>
  <DiagnosticBodyMap findings={report.findings} locale={locale}/>
  <View className="gap-4"><Text accessibilityRole="header" className="font-semibold">{c.findings}</Text>{[...report.template.checks,...report.template.panels].map(check=><View key={check.id} className="gap-1 border-b border-border pb-3"><Text className="font-semibold">{check.label[locale]}</Text>{!report.findings.some(f=>f.checkId===check.id||f.location?.panelId===check.id)?<Text>{c.not_checked}</Text>:null}</View>)}
  {report.findings.map((finding,index)=>{const check=[...report.template.checks,...report.template.panels].find(item=>item.id===finding.checkId);return <View key={finding.id} className="gap-2 border-b border-border pb-5"><Text className="font-semibold">{index+1}. {check?.label[locale]??finding.checkId} / {c[finding.assessment]}</Text>{finding.explanation?<Text>{finding.explanation}</Text>:null}{finding.kind?<Text>{c[finding.kind]}</Text>:null}{finding.source?<Text>{c.source}: {finding.source}</Text>:null}{finding.measurement?<><Text>{finding.measurement.value} {finding.measurement.unit}</Text><Text>{c.method}: {finding.measurement.method}</Text><Text>{c.uncertainty}: {finding.measurement.uncertainty}</Text></>:null}{finding.location?<Text>{c.panel}: {[...report.template.checks,...report.template.panels].find(item=>item.id===finding.location?.panelId)?.label[locale] ?? c.not_checked} / {c[finding.location.view]} / {c.point}: {Math.round(finding.location.x*100)}%, {Math.round(finding.location.y*100)}%</Text>:null}{finding.evidenceIds.map(evidenceId=><DiagnosticEvidence key={evidenceId} reportId={id} id={evidenceId} audience={audience} locale={locale}/>)}</View>;})}</View>
  {query.documents.isError||document?.state==="failed"||document?.state==="unavailable"?<Text accessibilityRole="alert">{c.pdfFailed}</Text>:document?.state==="ready"?<PrivateDocumentAction key={`${id}-${locale}-${document.id}`} download={()=>apiClient.getBytes(`${reportPath(id,audience)}/documents/${locale}`,20*1024*1024,{auth:audience!=="public"})} label={c.open} busyLabel={c.opening} errorLabel={c.retry}/>:<Text>{c.pending}</Text>}
 </View>}
 </ScrollView>;
}
