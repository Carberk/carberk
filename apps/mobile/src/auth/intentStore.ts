import { useEffect, useRef } from "react";
import type { Router } from "expo-router";
import { create } from "zustand";

import type { QuickReplyIntent } from "../conversations/quickReplyIntents";
import { HOME_HREF } from "../navigation/homeHref";

/**
 * Work a User asked for while signed out. Held as serializable data rather than
 * a closure so it survives the re-renders, and the screen suspensions, that
 * happen while the authentication screens sit on top of the calling screen.
 */
export type PendingAction =
  | { kind: "history"; attemptKey: string; sourceListingId: string | null }
  | { kind: "favorite"; listingId: string }
  | { kind: "message"; listingId: string }
  | { kind: "report"; listingId: string }
  | { kind: "inspection"; listingId: string }
  /** Ask the seller: `intent` is the chosen QuickReplies key, resolved to text on replay. */
  | { kind: "ask"; listingId: string; intent: QuickReplyIntent };

export type PendingActionKind = PendingAction["kind"];

/**
 * An Expo Router typed-route href. Derived from the router itself so the store
 * cannot drift from the generated route union in `.expo/types/router.d.ts`.
 */
export type AuthHref = Parameters<Router["push"]>[0];

export interface AuthIntent {
  /** Screen the User came from, and the one authentication returns to. */
  returnTo: AuthHref;
  /** Gated work to finish on that screen once authentication succeeds. */
  action?: PendingAction;
}

/**
 * The slice of the Expo Router imperative API this flow needs. Injecting it
 * keeps the store testable without a navigation tree, and documents that the
 * flow never replaces the calling screen.
 */
export type AuthNavigator = Pick<Router, "push" | "dismissTo">;

export type SignInMethod = "phone" | "email";

const PHONE_ROUTE = "/(auth)/phone";

interface AuthIntentStore {
  /** Set while the User is inside the authentication screens. */
  intent: AuthIntent | null;
  /** Set once authentication succeeded, until the owning screen performs it. */
  replayAction: PendingAction | null;
  /** The `returnTo` of the intent that produced `replayAction`. */
  replayReturnTo: AuthHref | null;
  requireSignIn(
    navigator: AuthNavigator,
    intent: AuthIntent,
    method?: SignInMethod,
  ): void;
  completeSignIn(navigator: AuthNavigator): void;
  cancelSignIn(navigator?: Pick<AuthNavigator, "dismissTo">): void;
  clearReplayAction(): void;
}

export const useAuthIntentStore = create<AuthIntentStore>()((set, get) => ({
  intent: null,
  replayAction: null,
  replayReturnTo: null,

  requireSignIn(navigator, intent, method = "phone") {
    set({ intent, replayAction: null, replayReturnTo: null });
    navigator.push({
      pathname: method === "email" ? "/(auth)/email" : PHONE_ROUTE,
      params: { authRoot: "1" },
    });
  },

  completeSignIn(navigator) {
    const { intent } = get();
    set({
      intent: null,
      replayAction: intent?.action ?? null,
      replayReturnTo: intent?.action ? intent.returnTo : null,
    });

    // Dismiss only the authentication screens. `dismissTo` pops back to the
    // calling screen and leaves everything under it — Results and its scroll
    // position — alive, which `replace` could not do.
    navigator.dismissTo(intent?.returnTo ?? HOME_HREF);
  },

  cancelSignIn(navigator) {
    // A successful sign-in consumes the intent before the authentication
    // screens unmount, so this is a no-op then and the replay survives. Only a
    // real back-out still has an intent to drop.
    const { intent } = get();
    if (intent === null) {
      return;
    }
    set({ intent: null, replayAction: null, replayReturnTo: null });
    navigator?.dismissTo(intent.returnTo);
  },

  clearReplayAction() {
    set({ replayAction: null, replayReturnTo: null });
  },
}));

/**
 * Performs a pending action once, on the screen that asked for it, after the
 * User returns from authentication. The listing id is part of the match so a
 * stale action can never fire against a different Listing.
 */
export function useReplayAuthAction(
  kind: PendingActionKind,
  listingId: string | undefined,
  perform: (action: PendingAction) => void,
): void {
  const replayAction = useAuthIntentStore((state) => state.replayAction);
  const performRef = useRef(perform);

  // Declared first so the ref holds this render's callback before the replay
  // effect below runs in the same commit.
  useEffect(() => {
    performRef.current = perform;
  });

  useEffect(() => {
    if (
      replayAction === null ||
      replayAction.kind !== kind ||
      replayAction.kind === "history" ||
      replayAction.listingId !== listingId
    ) {
      return;
    }

    // Clear before performing so a re-render cannot run the action twice.
    useAuthIntentStore.getState().clearReplayAction();
    performRef.current(replayAction);
  }, [replayAction, kind, listingId]);
}

/**
 * Performs a pending action of `kind` once, for whichever Listing it names,
 * while `enabled`. For screens that list many Listings: the card that asked
 * may not be mounted when authentication returns (a signed-in feed refetches
 * only its first page), so the list screen finishes the action itself. Only an
 * action whose sign-in started from `returnTo` is taken, so a screen never
 * finishes work another screen left behind. Gate `enabled` on focus so the
 * screen does not act while another screen is on top of it.
 */
export function useReplayAuthActionOfKind(
  kind: PendingActionKind,
  returnTo: AuthHref,
  perform: (listingId: string) => void,
  enabled: boolean,
): void {
  const replayAction = useAuthIntentStore((state) => state.replayAction);
  const replayReturnTo = useAuthIntentStore((state) => state.replayReturnTo);
  const performRef = useRef(perform);

  useEffect(() => {
    performRef.current = perform;
  });

  useEffect(() => {
    if (
      !enabled ||
      replayAction === null ||
      replayAction.kind !== kind ||
      replayAction.kind === "history" ||
      replayReturnTo !== returnTo
    ) {
      return;
    }

    useAuthIntentStore.getState().clearReplayAction();
    performRef.current(replayAction.listingId);
  }, [replayAction, replayReturnTo, kind, returnTo, enabled]);
}
