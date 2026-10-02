import { create } from "zustand";

/** What Profile says after a Sign-in Method was added or changed. */
export interface SignInMethodNotice {
  kind: "added" | "changed";
  /** The new value, masked as Profile shows it. */
  value: string;
}

interface SignInMethodNoticeStore {
  notice: SignInMethodNotice | null;
  show(notice: SignInMethodNotice): void;
  clear(): void;
}

/**
 * Hands the result of the code screen to Profile, which shows it in the page
 * for a few seconds. Kept outside the route so it survives the dismissal.
 */
export const signInMethodNoticeStore = create<SignInMethodNoticeStore>()((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  clear: () => set({ notice: null }),
}));
