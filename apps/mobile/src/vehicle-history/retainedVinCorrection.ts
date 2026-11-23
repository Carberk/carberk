import AsyncStorage from "@react-native-async-storage/async-storage";
import { HistoryOrderSchemas as H } from "@auto-tm/contracts";

const writes = new Map<string, Promise<unknown>>();
export function retainedVinCorrection(key: string) {
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    writes.set(key, next);
    void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
    return next;
  }
  return {
    load: () => serialize(async () => {
      const raw = await AsyncStorage.getItem(key);
      return raw ? H.HistoryCorrectionMutationSchema.parse(JSON.parse(raw)) : null;
    }),
    save: (input: H.HistoryCorrectionMutation) => serialize(() => AsyncStorage.setItem(key, JSON.stringify(input))),
    remove: (input: H.HistoryCorrectionMutation) => serialize(async () => {
      if (await AsyncStorage.getItem(key) === JSON.stringify(input)) await AsyncStorage.removeItem(key);
    }),
  };
}
