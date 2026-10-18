import { Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { DiagnosticReader } from "../../src/diagnostics/DiagnosticReader";
import { diagnosticCopy } from "../../src/diagnostics/copy";

import { Text } from "@/components/ui/text";

export default function DiagnosticReportRoute() {
 const params=useLocalSearchParams<{id?:string;audience?:string}>(),{i18n}=useTranslation(),c=diagnosticCopy(i18n.language);
 const id=z.string().uuid().safeParse(params.id),audience=params.audience==="public"?"public":"private";
 return <><Stack.Screen options={{title:c.title}}/>{id.success?<DiagnosticReader key={`${id.data}-${audience}`} id={id.data} audience={audience}/>:<Text>{c.unavailable}</Text>}</>;
}
