import * as SecureStore from "expo-secure-store";

const STAGING_API = "https://api-staging-2861.up.railway.app/api/v1";
const GATEWAY_API = "https://tm-staging.bagtyyar.dev/api/v1";
const GATEWAY_KEY = "carberk_staging_gateway_key";
export type RouteEntry = "global" | "tm";
/** Nonsecret API-only contract. Native media/socket adapters need their own access. */
export interface RouteSnapshot {
  readonly entry: RouteEntry;
  readonly generation: number;
  readonly apiBaseUrl: string;
}
let selection: RouteEntry = "global";
let generation = 0;
const listeners = new Set<() => void>();
let photoRevision = 0;
export const photoRouteRevision = () => photoRevision;
function invalidatePhotoReaders() {
  photoRevision++;
  for (const listener of listeners) listener();
}

export function subscribePhotoRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function globalApi() {
  return (process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3006/api/v1").replace(/\/$/, "");
}

export function gatewayTesterEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ &&
    process.env["EXPO_PUBLIC_GATEWAY_TESTER"] === "true" && process.env["EXPO_PUBLIC_ENV"] === "staging" && globalApi() === STAGING_API;
}

function assertTester() {
  if (!gatewayTesterEnabled()) throw new Error("Gateway testing is unavailable in this build");
}

/** Manual, process-local override; every app launch starts on Global. No failover. */
export function selectTesterRoute(entry: RouteEntry): void {
  assertTester();
  if (entry !== "global" && entry !== "tm") throw new Error("Unknown route");
  if (selection !== entry) { selection = entry; generation++; invalidatePhotoReaders(); }
}

/** Capture synchronously before the first storage/network await. */
export function captureRouteSnapshot(): RouteSnapshot {
  const entry = gatewayTesterEnabled() ? selection : "global";
  return Object.freeze({ entry, generation, apiBaseUrl: entry === "tm" ? GATEWAY_API : globalApi() });
}

export async function gatewayConfigured(): Promise<boolean> {
  assertTester();
  return validKey(await SecureStore.getItemAsync(GATEWAY_KEY));
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}

export async function provisionGatewayKey(key: string): Promise<void> {
  assertTester();
  if (!validKey(key)) throw new Error("Invalid gateway access key");
  await SecureStore.setItemAsync(GATEWAY_KEY, key);
  invalidatePhotoReaders();
}

export async function removeGatewayKey(): Promise<void> {
  assertTester();
  await SecureStore.deleteItemAsync(GATEWAY_KEY);
  invalidatePhotoReaders();
}

/** Private API access only: never put this result in diagnostics or other adapters. */
export async function apiRouteHeaders(route: RouteSnapshot): Promise<Record<string, string>> {
  if (route.entry === "global") return {};
  assertTester();
  if (route.apiBaseUrl !== GATEWAY_API) throw new Error("Unknown gateway destination");
  const key = await SecureStore.getItemAsync(GATEWAY_KEY);
  if (!validKey(key)) throw new Error("Gateway access is not configured");
  return { "X-Carberk-Gateway-Key": key };
}

export async function photoRouteHeaders(route: RouteSnapshot, destination: string): Promise<Record<string, string>> {
  assertTester();
  if (route.entry !== "tm" || route.apiBaseUrl !== GATEWAY_API ||
    !/^https:\/\/tm-staging\.bagtyyar\.dev\/photos\/(listing-photos|chat-attachments)\//.test(destination)) {
    throw new Error("Unapproved photo destination");
  }
  const key = await SecureStore.getItemAsync(GATEWAY_KEY);
  if (!validKey(key)) throw new Error("Gateway access is not configured");
  return { "X-Carberk-Gateway-Key": key };
}
