import { describe, expect, it } from "vitest";
import { HistoryWaiting, type HistoryWaitTransition } from "./HistoryWaiting";

describe("History waiting policy", () => {
  it("uses exactly 86,400,000 elapsed milliseconds, including a UTC date boundary", () => {
    let now = new Date("2026-11-14T23:59:59.123Z");
    const policy = new HistoryWaiting({ now: () => now });
    const waiting = policy.transition(policy.initial(), {
      sourceId: "quote-1", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice",
    });
    expect(waiting).toMatchObject({ reason: "quote_choice", since: new Date("2026-11-14T23:59:59.123Z"), version: 1 });
    now = new Date("2026-11-15T23:59:58.123Z");
    expect(policy.ineligible(waiting)).toBe("too_early");
    now = new Date("2026-11-15T23:59:59.122Z");
    expect(policy.ineligible(waiting)).toBe("too_early");
    now = new Date("2026-11-15T23:59:59.123Z");
    expect(policy.ineligible(waiting)).toBeNull();
    now = new Date("2026-11-15T23:59:59.124Z");
    expect(policy.ineligible(waiting)).toBeNull();
  });

  it("replays a stable source without reclocking and rejects old sources after newer waits", () => {
    let now = new Date("2026-11-14T08:00:00.000Z");
    const policy = new HistoryWaiting({ now: () => now });
    const begin: HistoryWaitTransition = {
      sourceId: "quote-a", sourceVersion: 1, expectedVersion: 0, action: "begin", reason: "quote_choice",
    };
    const first = policy.transition(policy.initial(), begin);
    now = new Date("2026-11-14T09:00:00.000Z");
    expect(policy.transition(first, begin)).toEqual(first);
    const ended = policy.transition(first, { sourceId: "quote-ended", sourceVersion: 2, expectedVersion: 1, action: "end" });
    expect(ended).toMatchObject({ reason: null, since: null, version: 2, sourceVersion: 2 });
    const next = policy.transition(ended, { ...begin, sourceId: "quote-b", sourceVersion: 3, expectedVersion: 2 });
    expect(next).toMatchObject({ since: new Date("2026-11-14T09:00:00.000Z"), version: 3, sourceId: "quote-b" });
    for (const stale of [begin, { ...begin, expectedVersion: 3 },
      { ...begin, sourceId: "quote-c", sourceVersion: 4, expectedVersion: 2 }]) {
      expect(() => policy.transition(next, stale)).toThrow("HISTORY_WAITING_CONFLICT");
    }
    for (const sourceVersion of [0, -1, 0.5, 2147483648]) {
      expect(() => policy.transition(policy.initial(), { ...begin, sourceVersion })).toThrow("HISTORY_WAITING_CONFLICT");
    }
  });

  it.each(["decline", "stop"] as const)("keeps %s permanent across legitimate new waits", (action) => {
    const policy = new HistoryWaiting({ now: () => new Date("2026-11-14T00:00:00.000Z") });
    const suppressed = policy.transition(policy.initial(), { sourceId: "suppression", sourceVersion: 1, expectedVersion: 0, action });
    const renewed = policy.transition(suppressed, {
      sourceId: "new-wait", sourceVersion: 2, expectedVersion: 1, action: "begin", reason: "customer_answer",
    });
    expect(renewed).toMatchObject({ version: 2, declined: action === "decline", stopped: action === "stop" });
    expect(policy.ineligible(renewed)).toBe(action === "decline" ? "declined" : "stopped");
  });

  it("reduces committed messages once using their original time, while reminders only advance the checkpoint", () => {
    const policy = new HistoryWaiting({ now: () => new Date("2026-11-20T00:00:00.000Z") });
    expect(policy.initial()).toEqual({ reason: null, since: null, version: 0, publicMessageId: null, publicMessageOrder: 0n,
      used: false, outcome: null, declined: false, stopped: false, sourceId: null, sourceVersion: 0 });
    expect(policy.ineligible(policy.initial())).toBe("not_waiting");
    const message = { id: "reply", order: 1n, sentAt: new Date("2026-11-14T08:09:10.123Z"), author: "operator", reminder: false } as const;
    const first = policy.reduceMessage(policy.initial(), message);
    expect(first).toMatchObject({ since: new Date("2026-11-14T08:09:10.123Z"), reason: "customer_answer",
      publicMessageId: "reply", publicMessageOrder: 1n, version: 1 });
    expect(policy.reduceMessage(first, message)).toEqual(first);
    const renewed = policy.reduceMessage(first, { ...message, id: "fresh", order: 2n, sentAt: new Date("2026-11-14T09:00:00.456Z") });
    const reminded = policy.reduceMessage(renewed, { ...message, id: "notice", order: 3n, reminder: true });
    expect(reminded).toMatchObject({ since: new Date("2026-11-14T09:00:00.456Z"), version: 3, publicMessageId: "notice", publicMessageOrder: 3n });
    expect(policy.reduceMessage(reminded, message)).toEqual(reminded);
    const answered = policy.reduceMessage(reminded, { ...message, id: "answer", order: 4n, author: "requester" });
    expect(answered).toMatchObject({ since: null, reason: null, version: 4, publicMessageId: "answer", publicMessageOrder: 4n });
  });

  it("keeps the original outcome and lifetime used fact through replies, new waits and permanent suppression", () => {
    const policy = new HistoryWaiting({ now: () => new Date("2026-11-16T00:00:00.000Z") });
    const original = { messageId: "reminder", senderId: "original-staff", clientMessageId: "original-intent",
      text: "  Original\nnotice  ", order: 7n, sentAt: new Date("2026-11-15T10:11:12.345Z") };
    const used = policy.recordOutcome(policy.initial(), original);
    expect(used).toMatchObject({ used: true, version: 1, outcome: original });
    expect(policy.ineligible(used)).toBe("used");
    expect(policy.recordOutcome(used, { ...original, messageId: "different", text: "changed" })).toEqual(used);
    const stopped = policy.transition(used, { sourceId: "stop", sourceVersion: 1, expectedVersion: 1, action: "stop" });
    const renewed = policy.reduceMessage(stopped, { id: "new-reply", order: 8n, sentAt: new Date("2026-11-16T00:00:00.000Z"),
      author: "operator", reminder: false });
    expect(renewed).toMatchObject({ used: true, outcome: original, stopped: true, version: 3, reason: "customer_answer" });
    expect(policy.ineligible(renewed)).toBe("stopped");
  });
});
