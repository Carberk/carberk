import { useState } from "react";
import { Linking, View } from "react-native";

import { apiClient } from "../api/client";
import { PrivateDocumentAction } from "../documents/PrivateDocumentAction";
import { localeTag } from "../i18n/resources";

import { useHistoryReports } from "./api";
import { sourceFactsCopy } from "./sourceFactsCopy";
import { reportCopy } from "./reportCopy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function HistoryReports({ id, locale }: { id: string; locale: string }) {
 const f = sourceFactsCopy(locale);
 const query = useHistoryReports(id), c = reportCopy(locale), [linkFailed, setLinkFailed] = useState(false);
 const reports = query.isError ? [] : query.data?.delivered ?? [];
 return <View className="gap-3 rounded-xl border border-border p-4"><Text className="font-semibold">{c.title}</Text><Text>{c.caveat}</Text>
  {query.isError || linkFailed ? <Text accessibilityRole="alert">{c.error}</Text> : null}
  <Button accessibilityRole="button" accessibilityLabel={c.refresh} onPress={() => { void query.refetch(); }}><Text>{c.refresh}</Text></Button>
  {reports.length === 0 ? <Text>{c.empty}</Text> : reports.map(report => <View key={report.id} className="gap-2"><Text>{report.provider === "carfax" ? "Carfax" : "AutoCheck"} / {report.vin}</Text><Text>{c.date}: {new Date(report.originalDate).toLocaleDateString(localeTag(locale))}</Text>
   {/* Matches the protected artifact download filename owned by the API. */}
   <Text selectable>{`${report.provider}-${report.vin}.pdf`}</Text>
   <Text>{new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(report.sizeBytes < 1024 ? report.sizeBytes : report.sizeBytes < 1024 * 1024 ? report.sizeBytes / 1024 : report.sizeBytes / (1024 * 1024))} {report.sizeBytes < 1024 ? "B" : report.sizeBytes < 1024 * 1024 ? "KiB" : "MiB"}</Text>
   {report.vehicleIdentity ? <Text>{f.identity}: {report.vehicleIdentity}</Text> : null}{report.mileage ? <Text>{f.mileage}: {report.mileage.value} {report.mileage.unit} / {new Date(report.mileage.observedAt).toLocaleDateString(localeTag(locale))}</Text> : null}{(report.sourceObservations ?? []).map((value,index) => <Text key={index}>{f.facts} / {f.page} {value.page}: {value.statement}</Text>)}
   {report.canShare ? <><PrivateDocumentAction download={() => apiClient.getBytes(`/services/conversations/${id}/history/artifacts/${report.id}`, report.sizeBytes)} label={c.open} busyLabel={c.opening} errorLabel={c.retry}/>{report.sharedLink ? <Button accessibilityRole="button" accessibilityLabel={c.link} onPress={() => { if (!report.sharedLink) return; setLinkFailed(false); void Linking.openURL(report.sharedLink).catch(() => setLinkFailed(true)); }}><Text>{c.link}</Text></Button> : null}</> : <Text>{c.restricted}</Text>}
  </View>)}
 </View>;
}
