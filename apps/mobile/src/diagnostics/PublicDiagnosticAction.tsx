import { useCallback } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../api/client";

import { diagnosticCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const uuid=z.string().uuid();
/** Dedicated public projection, batched independently of listing rank/counts. */
export function usePublicDiagnosticAvailability(listingIds:string[]) {
 const ids=[...new Set(listingIds.filter(id=>uuid.safeParse(id).success))].sort(),chunks:string[][]=[];
 for(let start=0;start<ids.length;start+=50)chunks.push(ids.slice(start,start+50));
 const client=useQueryClient();
 useFocusEffect(useCallback(()=>{void client.invalidateQueries({queryKey:["diagnostics","availability"]});},[client]));
 const results=useQueries({queries:chunks.map(chunk=>({queryKey:["diagnostics","availability",chunk],queryFn:()=>apiClient.get(`/public-diagnostics/listings?ids=${chunk.join(",")}`,z.array(D.PublicDiagnosticAvailabilitySchema),{auth:false}),staleTime:0,gcTime:0,retry:false,refetchInterval:30_000}))});
 return new Map(results.flatMap(result=>result.isError?[]:result.data??[]).map(value=>[value.listingId,value]));
}
export function DiagnosticAvailabilityAction({value}:{value:D.PublicDiagnosticAvailability|null|undefined}) {
 const {i18n}=useTranslation(),c=diagnosticCopy(i18n.language);
 if(!value)return null;
 return <Button variant="outline" accessibilityLabel={c.available} onPress={()=>router.push({pathname:"/diagnostics/[id]",params:{id:value.reportId,audience:"public"}})}><Text>{c.available}</Text></Button>;
}
export function PublicDiagnosticAction({listingId}:{listingId:string}) {
 const values=usePublicDiagnosticAvailability([listingId]);
 return <DiagnosticAvailabilityAction value={values.get(listingId)}/>;
}
