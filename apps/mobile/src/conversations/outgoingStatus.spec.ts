import { describe, expect, it } from "vitest";

import { outgoingStatus } from "./outgoingStatus";

const sentAt = "2026-10-01T10:00:00.000Z";
const before = "2026-10-01T09:59:59.000Z";
const after = "2026-10-01T10:00:01.000Z";

describe("outgoingStatus", () => {
  it("is sent when the other participant has no watermark past the Message", () => {
    expect(outgoingStatus(sentAt)).toBe("sent");
    expect(outgoingStatus(sentAt, before, before)).toBe("sent");
  });

  it("is delivered once the delivery watermark reaches the Message", () => {
    expect(outgoingStatus(sentAt, undefined, sentAt)).toBe("delivered");
    expect(outgoingStatus(sentAt, before, after)).toBe("delivered");
  });

  it("is read once the read watermark reaches the Message, whatever the delivery watermark says", () => {
    expect(outgoingStatus(sentAt, sentAt)).toBe("read");
    expect(outgoingStatus(sentAt, after, before)).toBe("read");
  });
});
