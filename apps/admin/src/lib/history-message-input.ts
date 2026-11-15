import { VehicleHistorySchemas as V } from "@auto-tm/contracts";

type Selection = { id: string; scope: string; expectedAssignmentVersion: number };
export type HistoryMessageInput = Selection & (
  { kind: "send"; body: ReturnType<typeof V.SendHistoryTextSchema.parse> } |
  { kind: "receipts" } |
  { kind: "ack"; throughOrder: string; body: ReturnType<typeof V.AcknowledgeHistoryMessagesSchema.parse> }
);

/** Reuse the strict selection and HTTP payload contracts without adding shared
 * browser commands to the API schema. Scope only correlates current authority. */
export function parseHistoryMessageInput(value: unknown): HistoryMessageInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { kind, body, throughOrder, ...selection } = value as Record<string, unknown>;
  if (kind !== "ack" && "throughOrder" in value) return null;
  const parsed = V.HistoryInboxActionSchema.safeParse({ ...selection, kind: "detail" });
  if (!parsed.success || parsed.data.kind !== "detail") return null;
  const { id, scope, expectedAssignmentVersion } = parsed.data;
  const selected = { id, scope, expectedAssignmentVersion };
  if (kind === "receipts") return "body" in value ? null : { ...selected, kind };
  if (kind === "send") {
    const payload = V.SendHistoryTextSchema.safeParse(body);
    return payload.success ? { ...selected, kind, body: payload.data } : null;
  }
  if (kind === "ack") {
    const payload = V.AcknowledgeHistoryMessagesSchema.safeParse(body);
    const order = V.HistoryMessageSchema.shape.order.safeParse(throughOrder);
    return payload.success && order.success ? { ...selected, kind, throughOrder: order.data, body: payload.data } : null;
  }
  return null;
}
