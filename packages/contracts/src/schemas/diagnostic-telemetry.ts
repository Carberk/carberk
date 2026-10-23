import { z } from "zod";

const frame = z.object({ filename: z.string().regex(/^app:\/\/[A-Za-z0-9/_.-]{1,160}$/), lineno: z.number().int().min(1).max(10_000_000), colno: z.number().int().min(0).max(10_000_000).optional() }).strict();
export const DiagnosticCategorySchema = z.enum(["network", "timeout", "capacity", "unavailable", "unexpected"]);
export const DiagnosticActionSchema = z.enum(["sign_in", "publish", "media_prepare", "media_upload", "video_process", "video_playback", "chat_send", "service_read", "background_job", "render", "controlled_crash"]);
export const DiagnosticComponentSchema = z.enum(["mobile", "api", "worker", "admin", "web"]);
export const DiagnosticEventSchema = z.object({
 event_id: z.string().regex(/^[a-f0-9]{32}$/), timestamp: z.string().datetime(), environment: z.literal("synthetic"),
 platform: z.enum(["javascript", "other"]), release: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), dist: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
 level: z.literal("error"), tags: z.object({ component: DiagnosticComponentSchema, action: DiagnosticActionSchema, synthetic: z.literal("true") }).strict(),
 fingerprint: z.tuple([DiagnosticComponentSchema, DiagnosticActionSchema, DiagnosticCategorySchema]),
 exception: z.object({ values: z.array(z.object({ type: DiagnosticCategorySchema, value: z.literal("Controlled technical failure"), stacktrace: z.object({ frames: z.array(frame).max(50) }).strict() }).strict()).length(1) }).strict(),
}).strict();
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;
export interface DiagnosticCaptureContext {
 eventId: string; occurredAt: string; release: string; build: string;
 component: z.infer<typeof DiagnosticComponentSchema>; platform: "javascript" | "other";
 action: z.infer<typeof DiagnosticActionSchema>; category: z.infer<typeof DiagnosticCategorySchema> | "expected_rejection";
 /** Deployment-owned exact input filename -> public build-artifact name. Never request data. */
 files: Readonly<Record<string, string>>;
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Construct the complete outgoing event. Never mutate and forward an SDK event.
 * Native crash envelopes bypass JS beforeSend, so this boundary refuses them. */
export function buildSyntheticDiagnostic(sdkEvent: unknown, context: DiagnosticCaptureContext): DiagnosticEvent | null {
 if (context.category === "expected_rejection") return null;
 const incoming = record(sdkEvent);
 if (incoming["platform"] !== undefined && !["javascript", "other"].includes(String(incoming["platform"]))) return null;
 const values = record(incoming["exception"])["values"];
 const rawFrames = record(record(Array.isArray(values) ? values[0] : undefined)["stacktrace"])["frames"];
 const frames: z.infer<typeof frame>[] = [];
 if (Array.isArray(rawFrames)) for (const item of rawFrames.slice(0, 100)) {
  const raw = record(item), inputName = raw["filename"];
  if (typeof inputName !== "string" || !Object.hasOwn(context.files, inputName)) continue;
  const parsed = frame.safeParse({ filename: context.files[inputName], lineno: raw["lineno"], ...(raw["colno"] === undefined ? {} : { colno: raw["colno"] }) });
  if (parsed.success) frames.push(parsed.data);
  if (frames.length === 50) break;
 }
 const parsed = DiagnosticEventSchema.safeParse({ event_id: context.eventId, timestamp: context.occurredAt, environment: "synthetic",
  platform: context.platform, release: context.release, dist: context.build, level: "error",
  tags: { component: context.component, action: context.action, synthetic: "true" },
  fingerprint: [context.component, context.action, context.category],
  exception: { values: [{ type: context.category, value: "Controlled technical failure", stacktrace: { frames } }] },
 });
 return parsed.success ? parsed.data : null;
}
