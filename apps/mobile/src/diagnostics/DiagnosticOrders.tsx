import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { localeTag } from "../i18n/resources";

import { useDiagnosticOrders } from "./api";
import { diagnosticCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { useSafeBack } from "@/src/navigation/useSafeBack";
import { Text } from "@/components/ui/text";

export function DiagnosticOrders() {
 const goBack = useSafeBack("/(tabs)/services");
 const { t: navigationText } = useTranslation("common");
 const {i18n}=useTranslation(),c=diagnosticCopy(i18n.language),orders=useDiagnosticOrders(),auth=useAuth(),[selected,setSelected]=useState<string|null>(null);
 const reports=useQuery({queryKey:["diagnostics","private",auth.userId,"order",selected],queryFn:()=>apiClient.get(`/diagnostics/orders/${selected}/reports`,z.array(D.DiagnosticReportSchema)),enabled:auth.isAuthenticated===true&&!!selected,staleTime:0,gcTime:0,retry:false});
 return <SafeScreen><StackHeader title={c.privateTitle} leading={<BackButton onPress={goBack} accessibilityLabel={navigationText("back")}/>}/><ScrollView contentContainerClassName="gap-5 p-5">{orders.authenticated!==true?<Text>{orders.authenticated===null?c.loading:c.signIn}</Text>:<>
 <Button onPress={()=>{void orders.refetch();if(selected)void reports.refetch();}}><Text>{c.refresh}</Text></Button>{orders.isError?<Text accessibilityRole="alert">{c.unavailable}</Text>:orders.isPending?<Text>{c.loading}</Text>:!orders.data?.length?<Text>{c.empty}</Text>:orders.data.map(order=><View key={order.id} className="gap-2 border-b border-border pb-4"><Text>{new Date(order.createdAt).toLocaleDateString(localeTag(i18n.language))}</Text><Text>{c.reference}: {order.id}</Text><Button onPress={()=>setSelected(order.id)}><Text>{c.title}</Text></Button>{selected===order.id?reports.isError?<Text accessibilityRole="alert">{c.unavailable}</Text>:reports.isPending?<Text>{c.loading}</Text>:!reports.data?.length?<Text>{c.empty}</Text>:reports.data.map(report=><Button key={report.id} onPress={()=>router.push({pathname:"/diagnostics/[id]",params:{id:report.id,audience:"private"}})}><Text>{new Date(report.observedAt).toLocaleDateString(localeTag(i18n.language))} / {c[report.status]}</Text></Button>):null}</View>)}
 </>}</ScrollView></SafeScreen>;
}
