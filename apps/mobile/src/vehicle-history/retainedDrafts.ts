import AsyncStorage from "@react-native-async-storage/async-storage";
import { VehicleHistorySchemas } from "@auto-tm/contracts";
import { z } from "zod";

const revision = z.number().int().nonnegative();
const IntentSchema = VehicleHistorySchemas.SendHistoryTextSchema.extend({ draftRevision: revision.optional() }).strict();
const DraftSchema = z.object({ text: z.string().max(4000), revision, intents: z.array(IntentSchema) }).strict();
export type HistoryDraft = z.infer<typeof DraftSchema>;
export type HistoryIntent = HistoryDraft["intents"][number];

const writes = new Map<string, Promise<void>>();
export class UnreadableHistoryDraft extends Error {}

export function retainedHistoryDraft(userId: string, requestId: string) {
  const key = `carberk.history.customer-reply.v1:${userId}:${requestId}`;
  return {
    async load() {
      await writes.get(key)?.catch(() => {});
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return { text: "", revision: 0, intents: [] } satisfies HistoryDraft;
      try { return DraftSchema.parse(JSON.parse(raw)); }
      catch { throw new UnreadableHistoryDraft(); }
    },
    save(draft: HistoryDraft) {
      const raw = JSON.stringify(draft);
      const previous = writes.get(key);
      const write = previous
        ? previous.catch(() => {}).then(() => AsyncStorage.setItem(key, raw))
        : AsyncStorage.setItem(key, raw);
      writes.set(key, write);
      void write.finally(() => { if (writes.get(key) === write) writes.delete(key); }).catch(() => {});
      return write;
    },
  };
}
