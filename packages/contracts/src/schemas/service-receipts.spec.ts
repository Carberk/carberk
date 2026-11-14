import { describe, expect, it } from "vitest";

import { AcknowledgeServiceMessagesSchema, ServiceReceiptSchema } from "./service-messages";
import { AcknowledgeHistoryMessagesSchema, AcknowledgeOperatorHistoryMessagesSchema, ReadOperatorHistoryReceiptsSchema } from "./vehicle-history";

const id = "00000000-0000-4000-8000-000000000001";
describe("Explicit service receipt contracts", () => {
  it("accepts exact message cursors and participant/session/version input only inside the trusted port", () => {
    const publicInput = { cursor: id, kind: "received" };
    expect(AcknowledgeHistoryMessagesSchema.parse(publicInput)).toEqual(publicInput);
    expect(AcknowledgeOperatorHistoryMessagesSchema.safeParse(publicInput).success).toBe(false);
    expect(ReadOperatorHistoryReceiptsSchema.parse({ expectedAssignmentVersion: "1" })).toEqual({ expectedAssignmentVersion: 1 });
    for (const extra of [{ participantId: id }, { sessionId: id }, { purpose: "vehicle_history" }, { objectId: id }, { receivedOrder: "2" }]) {
      expect(AcknowledgeHistoryMessagesSchema.safeParse({ ...publicInput, ...extra }).success).toBe(false);
    }
    const input = { purpose: "vehicle_history", objectId: id, ...publicInput,
      participant: { participantId: id, sessionId: id, assignmentVersion: 1 } };
    expect(AcknowledgeServiceMessagesSchema.parse(input)).toEqual(input);
    for (const changed of [{ cursor: "future" }, { kind: "sent" }, { cursor: "9007199254740993" }]) {
      expect(AcknowledgeServiceMessagesSchema.safeParse({ ...input, ...changed }).success).toBe(false);
    }
  });
  it("preserves bigint positions and refuses Read above Received", () => {
    const fact = { participantId: id, assignmentVersion: 2, receivedOrder: "9007199254740993", readOrder: "9007199254740992" };
    expect(ServiceReceiptSchema.parse(fact)).toEqual(fact);
    for (const changed of [{ readOrder: "9007199254740994" }, { receivedOrder: "-1" }, { assignmentVersion: -1 }, { readOrder: "01" }]) {
      expect(ServiceReceiptSchema.safeParse({ ...fact, ...changed }).success).toBe(false);
    }
  });
});
