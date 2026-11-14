import { AuthSchemas } from "@auto-tm/contracts";
import * as SecureStore from "expo-secure-store";

import { rememberAuthSession } from "./sessionSnapshot";

const AUTH_SESSION_KEY = "auto_tm_auth_session";
const sessionListeners = new Set<() => void>();
const userChangeListeners = new Set<() => void>();
// The last User signed in on this device since the app started. Their data may
// still be in memory after their session ends, so it outlives the session.
let lastUserId: string | null = null;
let identityIntent = 0;
let storageOperations: Promise<void> = Promise.resolve();

// Keep native reads/commits ordered with sign-in and sign-out. Failed native
// operations reject their caller without poisoning subsequent storage work.
function withSessionStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageOperations.then(operation);
  storageOperations = result.then(() => undefined, () => undefined);
  return result;
}

export type StoredAuthSession = AuthSchemas.OtpVerifyResponse & {
  storedAt: string;
};

export function storeAuthSession(
  session: AuthSchemas.OtpVerifyResponse,
): Promise<void> {
  identityIntent++;
  return withSessionStorage(() => writeSession(session));
}

async function writeSession(session: AuthSchemas.OtpVerifyResponse): Promise<void> {
  const value: StoredAuthSession = {
    ...session,
    storedAt: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(value));
  rememberAuthSession(value);
  const previousUserId = lastUserId;
  lastUserId = session.user.id;
  // Before the session listeners, so no screen renders the new User as signed
  // in while the previous User's data is still held. The session is already
  // stored, so a listener that throws is logged and the sign-in still resolves.
  if (previousUserId !== null && previousUserId !== session.user.id) {
    userChangeListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("[authSession] user-change listener failed", error);
      }
    });
  }
  notifySessionChanged();
}

export function loadAuthSession(): Promise<StoredAuthSession | null> {
  return withSessionStorage(readSession);
}

async function readSession(): Promise<StoredAuthSession | null> {
  const value = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  if (!value) {
    rememberAuthSession(null);
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("storedAt" in parsed)
  ) {
    await clearSession();
    return null;
  }

  const session = AuthSchemas.OtpVerifyResponseSchema.safeParse(parsed);
  if (!session.success) {
    await clearSession();
    return null;
  }

  lastUserId = session.data.user.id;
  const stored: StoredAuthSession = {
    ...session.data,
    storedAt: String((parsed as { storedAt: unknown }).storedAt),
  };
  rememberAuthSession(stored);
  return stored;
}

/**
 * Keeps the stored session's copy of the User's Sign-in Methods in step with
 * the server after one is added or replaced. Tokens are left untouched.
 */
export function updateStoredSessionUser(
  user: Pick<AuthSchemas.OtpVerifyResponse["user"], "phone" | "email">,
): Promise<void> {
  return withSessionStorage(async () => {
    const session = await readSession();
    if (!session) return;

    const value: StoredAuthSession = {
      ...session,
      user: { ...session.user, phone: user.phone, email: user.email },
    };

    await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(value));
    rememberAuthSession(value);
    notifySessionChanged();
  });
}

export function clearAuthSession(): Promise<void> {
  identityIntent++;
  return withSessionStorage(clearSession);
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
  rememberAuthSession(null);
  notifySessionChanged();
}

/** Commit a refresh only while its stored owner and sign-in/out intent remain current. */
export function commitRefreshedAuthSession(
  owner: StoredAuthSession,
  tokens: AuthSchemas.RefreshResponse | null,
): Promise<boolean> {
  const intent = identityIntent;
  return withSessionStorage(async () => {
    if (intent !== identityIntent) return false;
    const current = await readSession();
    if (intent !== identityIntent || current?.user.id !== owner.user.id ||
        current.refreshToken !== owner.refreshToken) return false;
    if (tokens === null) await clearSession();
    else await writeSession({ ...tokens, user: current.user });
    return intent === identityIntent;
  });
}

export function subscribeAuthSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Calls the listener when a session is stored for a User other than the last
 * one signed in on this device since the app started, however that User's
 * session ended. It runs before the `subscribeAuthSession` listeners. The
 * first sign-in after the app starts signed out, the same User signing in
 * again, and a token refresh do not call it.
 */
export function subscribeAuthUserChange(listener: () => void): () => void {
  userChangeListeners.add(listener);
  return () => {
    userChangeListeners.delete(listener);
  };
}

function notifySessionChanged(): void {
  sessionListeners.forEach((listener) => listener());
}
