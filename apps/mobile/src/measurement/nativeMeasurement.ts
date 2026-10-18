import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { MeasurementSchemas } from "@auto-tm/contracts";
import { AppState, Platform } from "react-native";

import { localeStore } from "../locale/localeStore";
import { loadAuthSession, subscribeAuthSession } from "../auth/session";
import { peekAuthSession } from "../auth/sessionSnapshot";

import { MeasurementHost } from "./MeasurementHost";

const IDENTITY = "carberk_measurement_identity_v1";
const QUEUE = "carberk_measurement_queue_v1";
const OPERATOR_PROOF = "carberk_measurement_synthetic_proof_v1";
const enabled = process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"] === "true";
export const measurementHost = new MeasurementHost(process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3006/api/v1", {
 newId: () => Crypto.randomUUID(), now: () => Date.now(), random: () => Math.random(),
 identity: async () => { const session = peekAuthSession() ?? await loadAuthSession(); return { actorKey: session?.user.id ?? "guest", authorization: session ? `Bearer ${session.accessToken}` : null }; },
 readIdentity: () => SecureStore.getItemAsync(IDENTITY),
 writeIdentity: (value) => value ? SecureStore.setItemAsync(IDENTITY, value) : SecureStore.deleteItemAsync(IDENTITY),
 readQueue: async () => { const raw = await AsyncStorage.getItem(QUEUE); if (!raw || raw.length > MeasurementSchemas.MEASUREMENT_LIMITS.queueBytes) return null; try { return JSON.parse(raw) as unknown; } catch { return null; } },
 writeQueue: (value) => value ? AsyncStorage.setItem(QUEUE, JSON.stringify(value)) : AsyncStorage.removeItem(QUEUE),
 syntheticProof: () => SecureStore.getItemAsync(OPERATOR_PROOF),
}, enabled);

/** Mount outside navigation. Session notifications fence pending facts synchronously. */
export function startNativeMeasurement(): () => void {
 if (!enabled) return () => undefined;
 let actor = peekAuthSession()?.user.id ?? "guest";
 const foreground = () => { if (AppState.currentState === "active") void measurementHost.foreground(); };
 const unsubscribe = subscribeAuthSession(() => {
  const next = peekAuthSession()?.user.id ?? "guest";
  if (next !== actor) { measurementHost.invalidate(); actor = next; foreground(); }
 });
 const appState = AppState.addEventListener("change", (state) => { if (state === "active") foreground(); else measurementHost.flush(); });
 const timer = setInterval(() => { foreground(); }, 60_000);
 foreground();
 return () => { clearInterval(timer); unsubscribe(); appState.remove(); measurementHost.invalidate(); };
}

export type MeasurementFact = { [K in MeasurementSchemas.MeasurementEventName]: Omit<Extract<MeasurementSchemas.MeasurementEvent, { eventName: K }>, "version" | "eventId" | "occurredAt" | "visitId" | "context"> }[MeasurementSchemas.MeasurementEventName];
/** Synchronous best-effort enqueue only; source UI never awaits bootstrap or transport. */
function enqueue(fact:MeasurementFact,eventId?:string): void {
 const visitId = measurementHost.currentVisit();
 if (!visitId) return;
 try {
  measurementHost.emit({ ...fact, version: 1, eventId:eventId??Crypto.randomUUID(), occurredAt: new Date().toISOString(), visitId,
   context: { platform: Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web", release: Constants.expoConfig?.version ?? "unknown", build: Constants.nativeBuildVersion ?? "unknown", locale: localeStore.getState().locale ?? "ru" },
  } as MeasurementSchemas.MeasurementEvent);
 } catch { /* Metrics cannot prevent the requested core action. */ }
}

export function emitMeasurement(fact:MeasurementFact):void {enqueue(fact);}
/** The visit UUID is also its start fact ID, so resumed sessions cannot create a second visit start. */
export function recordMeasurementForeground(screen:Extract<MeasurementSchemas.MeasurementEvent,{eventName:"visit_started"}>["payload"]["screen"]):void {
 const visitId=measurementHost.currentVisit();if(!visitId)return;
 enqueue({eventName:"visit_started",purpose:"product_improvement",payload:{screen}},visitId);
 enqueue({eventName:"foreground_activity",purpose:"product_improvement",payload:{screen,action:"open"}});
}

/** No bootstrap/storage wait is allowed on the authentication path. */
export function beginSignInMeasurement(method:"email"|"phone"):{headers:Record<string,string>;transportFailure:()=>void} {
 const fallback={headers:{},transportFailure:()=>undefined};
 try {
  const guest=measurementHost.currentGuestCapability();if(!guest)return fallback;
  const attemptId=Crypto.randomUUID(),started=Date.now(),visitId=measurementHost.currentVisit();
  emitMeasurement({eventName:"sign_in_started",purpose:"product_reliability",payload:{attemptId,method}});
  return {headers:{"X-Measurement-Attempt":attemptId,"X-Measurement-Guest":guest},transportFailure:()=>{
   if(measurementHost.currentVisit()!==visitId)return;
   emitMeasurement({eventName:"sign_in_transport_result",purpose:"product_reliability",payload:{attemptId,result:"unconfirmed_failure",category:"network",durationMs:Math.min(86400000,Math.max(0,Date.now()-started))}});
  }};
 }catch{return fallback;}
}

export function recordWizardStepResult(draftId:string,step:Extract<MeasurementSchemas.MeasurementEvent,{eventName:"wizard_step_result"}>["payload"]["step"],result:"success"|"expected_rejection"):void {
 try {emitMeasurement({eventName:"wizard_step_result",purpose:"product_improvement",payload:{draftId,step,attemptId:Crypto.randomUUID(),result,durationMs:0,...(result==="expected_rejection"?{category:"validation" as const}:{})}});}catch{/* Validation never waits for telemetry. */}
}
