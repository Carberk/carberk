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

type Fact = { [K in MeasurementSchemas.MeasurementEventName]: Omit<Extract<MeasurementSchemas.MeasurementEvent, { eventName: K }>, "version" | "eventId" | "occurredAt" | "visitId" | "context"> }[MeasurementSchemas.MeasurementEventName];
/** Synchronous best-effort enqueue only; source UI never awaits bootstrap or transport. */
export function emitMeasurement(fact: Fact): void {
 const visitId = measurementHost.currentVisit();
 if (!visitId) return;
 try {
  measurementHost.emit({ ...fact, version: 1, eventId: Crypto.randomUUID(), occurredAt: new Date().toISOString(), visitId,
   context: { platform: Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web", release: Constants.expoConfig?.version ?? "unknown", build: Constants.nativeBuildVersion ?? "unknown", locale: localeStore.getState().locale ?? "ru" },
  } as MeasurementSchemas.MeasurementEvent);
 } catch { /* Metrics cannot prevent the requested core action. */ }
}
