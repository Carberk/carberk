import { useEffect, useState } from "react";

import { ApiError } from "../api/client";
import { loadAuthSession, subscribeAuthSession, type StoredAuthSession } from "../auth/session";
import { peekAuthSession } from "../auth/sessionSnapshot";

export interface HistoryViewer {
  userId: string;
  sessionId: string;
}

// This claim partitions local reads; only the API establishes authority.
function viewerOf(session: StoredAuthSession | null | undefined): HistoryViewer | null {
  if (!session) return null;
  try {
    const payload = session.accessToken.split(".")[1] ?? "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4))) as { sid?: unknown; sub?: unknown };
    return typeof claims.sid === "string" && claims.sid.length > 0 && claims.sub === session.user.id
      ? { userId: session.user.id, sessionId: claims.sid } : null;
  } catch {
    return null;
  }
}

export function historySessionCurrent(viewer: HistoryViewer) {
  const current = viewerOf(peekAuthSession());
  return current?.userId === viewer.userId && current.sessionId === viewer.sessionId;
}

export const currentHistoryViewer = () => viewerOf(peekAuthSession());

export async function assertHistorySession(viewer: HistoryViewer, signal?: AbortSignal) {
  if (signal?.aborted || !historySessionCurrent(viewer)) throw new ApiError("HISTORY_SESSION_CHANGED", 401);
  const current = viewerOf(await loadAuthSession());
  if (signal?.aborted || !historySessionCurrent(viewer) || current?.userId !== viewer.userId || current.sessionId !== viewer.sessionId) {
    throw new ApiError("HISTORY_SESSION_CHANGED", 401);
  }
}

/** Every mounted private reader resolves storage before it can expose any cache. */
export function useHistoryViewer() {
  const [viewer, setViewer] = useState<HistoryViewer | null>();
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const unsubscribe = subscribeAuthSession(() => {
      revision++;
      setViewer(viewerOf(peekAuthSession()));
    });
    const initialRevision = revision;
    void loadAuthSession().then((session) => {
      if (!disposed && revision === initialRevision) setViewer(viewerOf(session));
    }).catch(() => {
      if (!disposed && revision === initialRevision) setViewer(null);
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return viewer && !historySessionCurrent(viewer) ? undefined : viewer;
}
