import { create } from "zustand";

/**
 * What Profile's notice line says after a Sign-in Method was added or changed,
 * or after the name editor saved a name.
 */
export type SignInMethodNotice =
  | {
      kind: "added" | "changed";
      /** The new value, masked as Profile shows it. */
      value: string;
    }
  | { kind: "nameSaved" };

interface SignInMethodNoticeStore {
  notice: SignInMethodNotice | null;
  show(notice: SignInMethodNotice): void;
  clear(): void;
}

/**
 * Hands the result of the code screen or the name editor to Profile, which
 * shows it in the page for a few seconds. Kept outside the route so it
 * survives the dismissal.
 */
export const signInMethodNoticeStore = create<SignInMethodNoticeStore>()((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  clear: () => set({ notice: null }),
}));
