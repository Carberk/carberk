import { z } from "zod";

const hex64 = z.string().regex(/^(0|[1-9a-f][0-9a-f]{0,15})$/);
const buildId = z.string().regex(/^[0-9a-f]{8,128}$/);
const alias = z.string().regex(/^[A-Za-z0-9._/-]{1,96}$/);
const eventId = z.string().regex(/^[a-f0-9]{32}$/);
const release = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const dist = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const manifestId = z.string().regex(/^[a-f0-9]{64}$/);
const abi = z.enum(["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]);
const moduleRef = z.object({ alias, build_id: buildId }).strict();
const frame = z.object({ module: alias, rel_pc: hex64 }).strict();
const signal = z.object({ number: z.number().int().min(1).max(64), code: z.number().int().min(-2_147_483_648).max(2_147_483_647) }).strict();
export const MinimizedNativeDiagnosticSchema = z.object({
 schema_version: z.literal(1), platform: z.literal("android_native"), event_id: eventId,
 timestamp: z.string().datetime(), environment: z.literal("synthetic"), release, dist, manifest_id: manifestId, abi,
 signal, crashing_tid: z.number().int().positive().max(4_294_967_295), modules: z.array(moduleRef).min(1).max(16), frames: z.array(frame).min(1).max(50),
}).strict();
export type MinimizedNativeDiagnostic = z.infer<typeof MinimizedNativeDiagnosticSchema>;
export const NativeModuleManifestSchema = z.object({ release, dist, environment: z.literal("synthetic"), manifest_id: manifestId, abi, modules: z.array(z.object({ alias, build_id: buildId, app_owned: z.literal(true) }).strict()).min(1).max(16) }).strict();
export type NativeModuleManifest = z.infer<typeof NativeModuleManifestSchema>;

/** Validate a fully minimized event against the actual protected build manifest. */
export function validateNativeDiagnostic(value: unknown, manifestValue: unknown, nowMs: number): MinimizedNativeDiagnostic | null {
 const parsed = MinimizedNativeDiagnosticSchema.safeParse(value), manifest = NativeModuleManifestSchema.safeParse(manifestValue);
 if (!parsed.success || !manifest.success || !Number.isFinite(nowMs)) return null;
 const event = parsed.data, proof = manifest.data;
 if (event.release !== proof.release || event.dist !== proof.dist || event.environment !== proof.environment || event.manifest_id !== proof.manifest_id || event.abi !== proof.abi) return null;
 const age = nowMs - Date.parse(event.timestamp);
 if (!Number.isFinite(age) || age < -5_000 || age > 300_000) return null;
 const byAlias = new Map<string, NativeModuleManifest["modules"][number]>();
 for (const module of proof.modules) { if (byAlias.has(module.alias)) return null; byAlias.set(module.alias, module); }
 const eventModules = new Map<string, MinimizedNativeDiagnostic["modules"][number]>();
 for (const module of event.modules) {
  if (eventModules.has(module.alias)) return null;
  const actual = byAlias.get(module.alias);
  if (!actual || actual.build_id !== module.build_id) return null;
  eventModules.set(module.alias, module);
 }
 const used = new Set<string>();
 for (const frame of event.frames) {
  if (!eventModules.has(frame.module)) return null;
  used.add(frame.module);
 }
 if (used.size === 0 || eventModules.size !== used.size) return null;
 return event;
}
