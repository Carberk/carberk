import { useEffect,useRef,useSyncExternalStore } from "react";
import { useIsFocused } from "expo-router";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { emitMeasurement,measurementHost,recordMeasurementForeground,type MeasurementFact } from "./nativeMeasurement";
const subscribe=(listener:()=>void)=>measurementHost.subscribe(listener);
const visit=()=>measurementHost.currentVisit();
type Screen=Extract<MeasurementSchemas.MeasurementEvent,{eventName:"visit_started"}>["payload"]["screen"];
/** Source facts wait for an admitted visit, without delaying the screen or replaying stale query results. */
export function useMeasurementScreen(screen:Screen,fact?:MeasurementFact|null,eventKey=""):void {
 const focused=useIsFocused(),visitId=useSyncExternalStore(subscribe,visit,()=>null);
 const lastForeground=useRef<string|null>(null),lastFact=useRef<string|null>(null);
 const serialized=JSON.stringify(fact??null);
 useEffect(()=>{
  if(!focused || !visitId){lastForeground.current=null;return;}
  const key=`${visitId}:${screen}`;
  if(lastForeground.current===key)return;
  lastForeground.current=key;recordMeasurementForeground(screen);
 },[screen,focused,visitId]);
 useEffect(()=>{
  if(!focused || !visitId){lastFact.current=null;return;}
  if(serialized==="null")return;
  const key=`${visitId}:${eventKey||serialized}`;
  if(lastFact.current===key)return;
  lastFact.current=key;emitMeasurement(JSON.parse(serialized) as MeasurementFact);
 },[focused,visitId,eventKey,serialized]);
}
