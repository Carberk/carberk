import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { z } from "zod";

const SelectionSchema = P.StagePaymentProofSchema.extend({ uri: z.string() }).strict();
export type PaymentProofSelection = z.infer<typeof SelectionSchema>;
const writes = new Map<string, Promise<void>>();

export function retainedPaymentProof(userId: string, requestId: string) {
  const key = `carberk.history.payment-proof.v1:${userId}:${requestId}`;
  const directory = `${FileSystem.documentDirectory}history-private/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}/`;
  const validate = (input: unknown) => {
    const selection = SelectionSchema.parse(input);
    if (!FileSystem.documentDirectory || selection.uri !== `${directory}${selection.attemptKey}`) throw new Error("Unusable private receipt");
    return selection;
  };
  const write = (operation: () => Promise<void>) => {
    const next = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    writes.set(key, next);
    void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
    return next;
  };
  return {
    directory,
    async load() {
      await writes.get(key)?.catch(() => undefined);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const selection = validate(JSON.parse(raw));
      const info = await FileSystem.getInfoAsync(selection.uri);
      if (!info.exists || info.isDirectory || info.size !== selection.sizeBytes) throw new Error("Receipt file unavailable");
      return selection;
    },
    save(selection: PaymentProofSelection) { const valid = validate(selection); return write(() => AsyncStorage.setItem(key, JSON.stringify(valid))); },
    remove(selection: PaymentProofSelection | null) {
      return write(async () => {
        await AsyncStorage.removeItem(key);
        if (selection) await FileSystem.deleteAsync(validate(selection).uri, { idempotent: true });
      });
    },
  };
}
