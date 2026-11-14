import { useEffect, useMemo, useRef, useState } from "react";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { VehicleHistorySchemas } from "@auto-tm/contracts";

import { queryKeys } from "../api/queryKeys";
import { ApiError } from "../api/client";
import { historyTranscript } from "../api/vehicle-history/messages";

import { historySessionCurrent, type HistoryViewer } from "./session";

function messageKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

type Intent = { clientMessageId: string; text: string };
type Outgoing = Intent & { state: "pending" | "uncertain" | "failed" | "sent";
  message?: VehicleHistorySchemas.HistoryMessage; error?: unknown; draftRevision?: number };

/** Mounted exact-text intents; durable account drafts belong to the aggregate. */
export function useHistoryReply(viewer: HistoryViewer, request: VehicleHistorySchemas.HistoryRequest, ready: boolean, active: boolean, messages: VehicleHistorySchemas.HistoryMessage[], reconcile: () => Promise<unknown>) {
  const client = useQueryClient();
  const { userId, sessionId } = viewer;
  const requestId = request.id;
  const [draft, setDraft] = useState("");
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
  const current = () => {
    const key = queryKeys.vehicleHistory.detail(userId, sessionId, requestId);
    const metadata = client.getQueryData<VehicleHistorySchemas.HistoryRequest>(key);
    const state = client.getQueryState(key);
    return alive.current && !refused.current && readiness.current && historySessionCurrent(viewer) && !state?.error
      && state?.fetchStatus === "idle" && metadata?.assignmentVersion === request.assignmentVersion
      && metadata?.assignedOperator?.id === request.assignedOperator?.id;
  };
  const edit = (text: string) => { revision.current++; setDraft(text); };
  useEffect(() => {
    const confirmed = outgoing.filter((intent) => intent.state !== "sent" && messages.some((message) =>
      message.clientMessageId === intent.clientMessageId && message.text === intent.text
      && message.author.kind === "requester" && message.author.id === userId));
    if (confirmed.length === 0) return;
    if (confirmed.some((intent) => intent.draftRevision === revision.current)) {
      revision.current++;
      setDraft("");
    }
    setOutgoing((items) => items.map((intent) => confirmed.includes(intent) ? { ...intent, state: "sent", error: undefined } : intent));
  }, [messages, outgoing, userId]);
  async function submit(intent: Intent, draftRevision?: number) {
    if (busy.current || !current()) return;
    const generation = visibility.current.generation;
    const ownsSend = () => generation === visibility.current.generation && current();
    busy.current = true;
    setPending(true);
    const replace = (value: Outgoing) => setOutgoing((items) => [...items.filter((item) => item.clientMessageId !== intent.clientMessageId), value]);
    replace({ ...intent, draftRevision, state: "pending" });
    try {
      const message = await stream.send(intent, ownsSend);
      if (!ownsSend()) throw new ApiError("HISTORY_READER_CHANGED", 409);
      replace({ ...intent, state: "sent", message });
      if (draftRevision !== undefined && revision.current === draftRevision) edit("");
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
      if (alive.current) setPending(false);
    }
  }
  const valid = VehicleHistorySchemas.SendHistoryTextSchema.shape.text.safeParse(draft).success;
  return { draft, edit, outgoing, pending, valid, blocked,
    resume: () => { refused.current = false; setBlocked(false); },
    send: () => valid ? submit({ clientMessageId: messageKey(), text: draft }, revision.current) : undefined,
    retry: (intent: Intent) => submit({ clientMessageId: intent.clientMessageId, text: intent.text }, draft === intent.text ? revision.current : undefined),
  };
}
