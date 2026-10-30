import { describe, it, expect } from "vitest";

import { parseDirectMessageConversationId, parseServiceConversationId } from "./deepLinks";

describe("parseDirectMessageConversationId", () => {
  it("returns the conversation id from a data.conversationId payload", () => {
    expect(
      parseDirectMessageConversationId({
        conversationId: "conv-123",
        messageId: "msg-1",
        sentAt: "2026-07-16T00:00:00.000Z",
      }),
    ).toBe("conv-123");
  });

  it("parses the conversation id from a data.deepLink payload", () => {
    expect(
      parseDirectMessageConversationId({
        deepLink: "/conversations/conv-456",
      }),
    ).toBe("conv-456");
  });

  it("prefers conversationId over deepLink when both are present", () => {
    expect(
      parseDirectMessageConversationId({
        conversationId: "conv-primary",
        deepLink: "/conversations/conv-fallback",
      }),
    ).toBe("conv-primary");
  });

  it("parses the id from deep links carrying query strings or fragments", () => {
    expect(
      parseDirectMessageConversationId({
        deepLink: "/conversations/conv-789?from=push",
      }),
    ).toBe("conv-789");
    expect(
      parseDirectMessageConversationId({
        deepLink: "/conversations/conv-abc#top",
      }),
    ).toBe("conv-abc");
  });

  it("returns null for unrelated deep links", () => {
    expect(
      parseDirectMessageConversationId({ deepLink: "/listings/123" }),
    ).toBeNull();
    expect(
      parseDirectMessageConversationId({ deepLink: "/conversations" }),
    ).toBeNull();
    expect(
      parseDirectMessageConversationId({ deepLink: "/conversations/" }),
    ).toBeNull();
  });

  it("returns null for non-direct-message payloads", () => {
    expect(parseDirectMessageConversationId({ url: "/listings/1" })).toBeNull();
    expect(parseDirectMessageConversationId({ conversationId: 42 })).toBeNull();
    expect(parseDirectMessageConversationId({ conversationId: "" })).toBeNull();
    expect(parseDirectMessageConversationId({ deepLink: 7 })).toBeNull();
  });

  it("returns null for null, undefined, and non-object payloads", () => {
    expect(parseDirectMessageConversationId(null)).toBeNull();
    expect(parseDirectMessageConversationId(undefined)).toBeNull();
    expect(parseDirectMessageConversationId("conv-1")).toBeNull();
    expect(parseDirectMessageConversationId([])).toBeNull();
  });
});

it("keeps service updates out of the marketplace conversation route", () => {
 expect(parseDirectMessageConversationId({ kind: "service_update", conversationId: "11111111-1111-4111-8111-111111111111" })).toBeNull();
});

it("requires an exact service payload and UUID conversation for service routing", () => {
 const id = "11111111-1111-4111-8111-111111111111";
 expect(parseServiceConversationId({ kind: "service_update", conversationId: id })).toBe(id);
 for (const input of [{ conversationId: id }, { kind: "service_update", conversationId: "../private" }, { kind: "service_update", deepLink: "https://other.invalid" }]) expect(parseServiceConversationId(input)).toBeNull();
});
