import { useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";

import { apiClient } from "../api/client";

import { reportPath, type Audience } from "./api";
import { diagnosticCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function DiagnosticEvidence({reportId,id,audience,locale}:{reportId:string;id:string;audience:Audience;locale:string}) {
 const c=diagnosticCopy(locale),[image,setImage]=useState<string|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),epoch=useRef(0);
 useEffect(()=>()=>{epoch.current++;},[]);
 async function open() {
  if(busy)return;const version=epoch.current;setBusy(true);setFailed(false);
  try{const bytes=await apiClient.getBytes(`${reportPath(reportId,audience)}/evidence/${id}`,10*1024*1024,{auth:audience!=="public"});if(version!==epoch.current)return;let binary="";for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));setImage(`data:image/webp;base64,${btoa(binary)}`);}catch{if(version===epoch.current)setFailed(true);}finally{if(version===epoch.current)setBusy(false);}
 }
 return <View className="gap-2"><Text>{c.evidence}: {id}</Text><Button accessibilityLabel={image?c.close:c.photo} disabled={busy} onPress={()=>{if(image)setImage(null);else void open();}}><Text>{image?c.close:c.photo}</Text></Button>{failed?<Text accessibilityRole="alert">{c.photoError}</Text>:null}{image?<Image accessibilityLabel={`${c.evidence}: ${id}`} source={{uri:image}} className="h-64 w-full" resizeMode="contain"/>:null}</View>;
}
