import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

const schema = z.object({
  version: z.literal(1),
  asset: z.object({ uri: z.string().min(1).max(2048).refine(value => /^(?:file|content|ph|assets-library):\/\//.test(value)), duration: z.number().nonnegative().max(86400000).nullable(), width: z.number().nonnegative().max(32768), height: z.number().nonnegative().max(32768) }).strict(),
  interval: z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), posterMs: z.number().int().nonnegative(), explicit: z.boolean() }).strict().refine(value => value.endMs > value.startMs && value.posterMs >= value.startMs && value.posterMs < value.endMs).nullable(),
}).strict();
export type RetainedVideoSelection = z.infer<typeof schema>;
/** Keeps only local source metadata, never source bytes or signed authority. */
export class VideoSelectionJournal {
  private readonly key: string;
  private writes = Promise.resolve();
  constructor(ownerId: string, target: { kind: "draft" | "listing"; id: string }, businessId?: string) {
    for (const id of [ownerId, target.id, ...(businessId ? [businessId] : [])]) z.string().uuid().parse(id);
    this.key = `listing-video-selection:v1:${ownerId}:${target.kind}:${target.id}:${businessId ?? "personal"}`;
  }
  async load(): Promise<RetainedVideoSelection | null> {
    await this.writes;
    const raw = await AsyncStorage.getItem(this.key);
    if (!raw) return null;
    try { if (raw.length > 4096) return null; return schema.parse(JSON.parse(raw)); } catch { return null; }
  }
  save(value: RetainedVideoSelection | null): Promise<void> {
    const raw = value ? JSON.stringify(schema.parse(value)) : null;
    const write = this.writes.then(() => raw === null ? AsyncStorage.removeItem(this.key) : AsyncStorage.setItem(this.key, raw));
    this.writes = write.catch(() => {});
    return write;
  }
}
