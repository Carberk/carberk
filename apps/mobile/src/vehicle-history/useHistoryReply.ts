import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { VehicleHistorySchemas } from "@auto-tm/contracts";

import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";
import { historyTranscript } from "../api/vehicle-history/messages";

import { historySessionCurrent, type HistoryViewer } from "./session";
import { retainedHistoryDraft, UnreadableHistoryDraft, type HistoryDraft, type HistoryIntent } from "./retainedDrafts";

function messageKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

type Intent = HistoryIntent;
type Outgoing = Intent & { state: "pending" | "uncertain" | "failed" | "sent";
  message?: VehicleHistorySchemas.HistoryMessage; error?: unknown; draftRevision?: number };

export function useHistoryReply(viewer: HistoryViewer, request: VehicleHistorySchemas.HistoryRequest, ready: boolean, active: boolean, messages: VehicleHistorySchemas.HistoryMessage[], reconcile: () => Promise<unknown>) {
  const client = useQueryClient();
  const { userId, sessionId } = viewer;
  const requestId = request.id;
  const [draft, setDraft] = useState("");
  const retained = useMemo(() => retainedHistoryDraft(userId, requestId), [userId, requestId]);
  const document = useRef<HistoryDraft>({ text: "", revision: 0, intents: [] });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState<"load" | "save" | "corrupt" | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [blocked, setBlocked] = useState(false);
  const refused = useRef(false);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const readiness = useRef(ready);
  readiness.current = ready;
  const visibility = useRef({ active, generation: 0 });
  if (visibility.current.active && !active) visibility.current.generation++;
  visibility.current.active = active;
  useEffect(() => focusManager.subscribe(() => {
    if (!focusManager.isFocused()) visibility.current.generation++;
  }), []);
  const controller = useMemo(() => new AbortController(), []);
  const stream = useMemo(() => historyTranscript({ userId, sessionId }, requestId, controller.signal), [userId, sessionId, requestId, controller]);
  useEffect(() => () => { alive.current = false; controller.abort(); }, [controller]);
  const ownsDraft = useCallback(() => alive.current && historySessionCurrent({ userId, sessionId }), [userId, sessionId]);
  const restore = useCallback(async () => {
    if (!ownsDraft()) return;
    setStorageError(null);
    try {
      const value = await retained.load();
      if (!ownsDraft()) return;
      document.current = value;
      revision.current = value.revision;
      setDraft(value.text);
      setOutgoing(value.intents.map((intent) => ({ ...intent, state: "uncertain", error: new ApiError("NETWORK_ERROR", 0) })));
      setLoaded(true);
      setSaved(true);
    } catch (error) { if (ownsDraft()) setStorageError(error instanceof UnreadableHistoryDraft ? "corrupt" : "load"); }
  }, [ownsDraft, retained]);
  useEffect(() => { void restore(); }, [restore]);
  const save = useCallback(async (value: HistoryDraft) => {
    if (!ownsDraft()) return false;
    document.current = value;
    setSaved(false);
    try {
      await retained.save(value);
      if (!ownsDraft()) return false;
      if (document.current === value) { setSaved(true); setStorageError(null); }
      return true;
    } catch {
      if (ownsDraft() && document.current === value) setStorageError("save");
      return false;
    }
  }, [ownsDraft, retained]);
  const assignmentVersion = request.assignmentVersion, operatorId = request.assignedOperator?.id;
  const current = useCallback(() => {
    const key = queryKeys.vehicleHistory.detail(userId, sessionId, requestId);
    const metadata = client.getQueryData<VehicleHistorySchemas.HistoryRequest>(key);
    const state = client.getQueryState(key);
    return ownsDraft() && !refused.current && readiness.current && !state?.error
      && state?.fetchStatus === "idle" && metadata?.assignmentVersion === assignmentVersion
      && metadata?.assignedOperator?.id === operatorId;
  }, [client, userId, sessionId, requestId, ownsDraft, assignmentVersion, operatorId]);
  const edit = (text: string) => {
    if (!loaded || !ownsDraft()) return;
    revision.current++;
    setDraft(text);
    void save({ ...document.current, text, revision: revision.current });
  };
  const acknowledge = useCallback((confirmed: Intent[]) => {
    if (!ownsDraft()) return;
    const value = document.current;
    const clear = confirmed.some((intent) => intent.draftRevision === value.revision);
    if (clear) { revision.current++; setDraft(""); }
    void save({ text: clear ? "" : value.text, revision: revision.current,
      intents: value.intents.filter((intent) => !confirmed.some((item) => item.clientMessageId === intent.clientMessageId)) });
  }, [save, ownsDraft]);
  useEffect(() => {
    if (!loaded || !current()) return;
    const confirmed = outgoing.filter((intent) => intent.state !== "sent" && messages.some((message) =>
      message.clientMessageId === intent.clientMessageId && message.text === intent.text
      && message.author.kind === "requester" && message.author.id === userId));
    if (confirmed.length === 0) return;
    acknowledge(confirmed);
    setOutgoing((items) => items.map((intent) => confirmed.includes(intent) ? { ...intent, state: "sent", error: undefined } : intent));
  }, [messages, outgoing, userId, loaded, ready, current, acknowledge]);
  async function submit(intent: Intent, draftRevision?: number) {
    if (busy.current || !loaded || storageError || !current()) return;
    const generation = visibility.current.generation;
    const ownsSend = () => generation === visibility.current.generation && current();
    busy.current = true;
    setPending(true);
    const replace = (value: Outgoing) => setOutgoing((items) => [...items.filter((item) => item.clientMessageId !== intent.clientMessageId), value]);
    replace({ ...intent, draftRevision, state: "pending" });
    try {
      const value = document.current;
      if (!await save({ ...value, intents: [...value.intents.filter((item) => item.clientMessageId !== intent.clientMessageId), { ...intent, draftRevision }] })) {
        if (ownsDraft()) replace({ ...intent, draftRevision, state: "uncertain", error: new ApiError("NETWORK_ERROR", 0) });
        return;
      }
      if (!ownsSend()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      const message = await stream.send(intent, ownsSend);
      if (!ownsSend()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      replace({ ...intent, state: "sent", message });
      acknowledge([{ ...intent, draftRevision }]);
      void reconcile();
    } catch (error) {
      if (!alive.current || !historySessionCurrent(viewer)) return;
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === "HISTORY_READER_CHANGED";
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status) && !uncertain) {
        refused.current = true;
        setBlocked(true);
      }
      replace({ ...intent, draftRevision, state: uncertain ? "uncertain" : "failed", error });
    } finally {
      busy.current = false;
      if (ownsDraft()) setPending(false);
    }
  }
  const valid = VehicleHistorySchemas.SendHistoryTextSchema.shape.text.safeParse(draft).success;
  return { draft, edit, outgoing, pending, valid, blocked, loaded, saved, storageError,
    retryStorage: () => loaded ? save(document.current) : restore(),
    resetDraft: () => {
      if (!ownsDraft() || storageError !== "corrupt") return;
      revision.current = 0; setDraft(""); setOutgoing([]); setLoaded(true);
      void save({ text: "", revision: 0, intents: [] });
    },
    resume: () => { if (ownsDraft()) { refused.current = false; setBlocked(false); } },
    send: () => valid ? submit({ clientMessageId: messageKey(), text: draft }, revision.current) : undefined,
    retry: (intent: Intent) => submit({ clientMessageId: intent.clientMessageId, text: intent.text }, intent.draftRevision),
  };
}
