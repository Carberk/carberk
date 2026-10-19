import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";

/**
 * Recent: the last brand/model choices a buyer confirmed, brand-only ones
 * included. It lives on this device only. It is not a saved search: nothing
 * is sent to the API, synced to the User, or used for alerts.
 */

export const RECENT_LIMIT = 10;
export const RECENT_STORAGE_KEY = "@auto-tm/recent-brand-model";

const BrandModelChoiceSchema = z.object({
  brandId: z.string(),
  brandName: z.string(),
  modelIds: z.array(z.string()),
  modelNames: z.array(z.string()),
});

/**
 * One brand and zero or more of its models. No models means every model of
 * the brand. Names are kept so Recent can be shown before the catalog loads.
 */
export type BrandModelChoice = z.infer<typeof BrandModelChoiceSchema>;

function sameModels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function isSameChoice(a: BrandModelChoice, b: BrandModelChoice): boolean {
  return a.brandId === b.brandId && sameModels(a.modelIds, b.modelIds);
}

/** Puts `choice` first, removes an earlier equal choice, and keeps the newest ten. */
export function addRecentChoice(
  list: readonly BrandModelChoice[],
  choice: BrandModelChoice,
): BrandModelChoice[] {
  return [choice, ...list.filter((c) => !isSameChoice(c, choice))].slice(0, RECENT_LIMIT);
}

export async function loadRecentChoices(): Promise<BrandModelChoice[]> {
  const raw = await AsyncStorage.getItem(RECENT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = z.array(BrandModelChoiceSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

interface RecentChoicesState {
  items: BrandModelChoice[];
  hydrated: boolean;
  /** Reads Recent from the device once; later calls reuse the first read. */
  hydrate(): Promise<void>;
  /** Saves a confirmed choice at the top of Recent. */
  record(choice: BrandModelChoice): Promise<void>;
  /** Removes every Recent choice from the device. */
  clear(): Promise<void>;
  resetForTests(): void;
}

let hydration: Promise<void> | null = null;

/**
 * Recent is a convenience, so a failed device write must not break the
 * navigation that triggered it. The in-memory list stays correct for this
 * session; only the next launch would miss the change.
 */
async function persist(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.warn("[recentSearches] could not save Recent on this device", error);
  }
}

export const useRecentChoicesStore = create<RecentChoicesState>()((set, get) => ({
  items: [],
  hydrated: false,

  hydrate() {
    hydration ??= loadRecentChoices()
      // `record` and `clear` wait for this read, so nothing is lost or
      // resurrected by a write that races it.
      .then((stored) => set({ items: stored, hydrated: true }))
      .catch(() => set({ hydrated: true }));
    return hydration;
  },

  async record(choice) {
    await get().hydrate();
    const items = addRecentChoice(get().items, choice);
    set({ items });
    await persist(() => AsyncStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items)));
  },

  async clear() {
    await get().hydrate();
    set({ items: [] });
    await persist(() => AsyncStorage.removeItem(RECENT_STORAGE_KEY));
  },

  resetForTests() {
    hydration = null;
    set({ items: [], hydrated: false });
  },
}));
