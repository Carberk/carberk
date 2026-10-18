import { describe, it, expect, beforeEach } from "vitest";

import type { ActivePushDevice, PushDeviceStore } from "../domain/PushDeviceStore";
import type { DirectMessagePushInput } from "../domain/DirectMessagePushInput";
import type {
  NotificationHistoryStatus,
  NotificationHistoryStore,
} from "../domain/NotificationHistoryStore";
import {
  NO_ACTIVE_PUSH_TOKENS_REASON,
  NOTIFICATION_HISTORY_STATUS,
  PUSH_RESULT_REASON,
} from "../domain/types";
import { TestPushTransport } from "../adapters/TestPushTransport";
import { FcmApnsPushTransport } from "../adapters/FcmApnsPushTransport";
import type { ApnsMessage, ApnsSender } from "../adapters/apns/ApnsSender";
import type { FcmMessage, FcmSender } from "../adapters/fcm/FcmSender";
import type { PushResult } from "../domain/PushPort";

import {
  ProcessDirectMessagePush,
  RetryablePushError,
} from "./ProcessDirectMessagePush";

class FakePushDeviceStore implements PushDeviceStore {
  devices: ActivePushDevice[] = [];
  invalidatedTokens: string[] = [];

  async listActiveForUser(_userId: string): Promise<ActivePushDevice[]> {
    return this.devices;
  }

  async invalidateToken(token: string): Promise<void> {
    this.invalidatedTokens.push(token);
  }
}

class FakeNotificationHistoryStore implements NotificationHistoryStore {
  updates: Array<{
    historyId: string;
    status: NotificationHistoryStatus;
    details?: Record<string, unknown>;
  }> = [];
  succeededTokens: string[] = [];

  async listSucceededTokens(_historyId: string): Promise<string[]> {
    return this.succeededTokens;
  }

  async updateStatus(
    historyId: string,
    status: NotificationHistoryStatus,
    details?: Record<string, unknown>,
  ): Promise<void> {
    this.updates.push({ historyId, status, ...(details ? { details } : {}) });
  }
}

function makeInput(
  overrides?: Partial<DirectMessagePushInput>,
): DirectMessagePushInput {
  return {
    historyId: "history-1",
    recipientUserId: "user-1",
    title: "Новое сообщение",
    body: "Hello",
    deepLink: "/conversations/conv-1",
    data: { conversationId: "conv-1", messageId: "msg-1" },
    ...overrides,
  };
}

describe("ProcessDirectMessagePush", () => {
  let pushPort: TestPushTransport;
  let deviceStore: FakePushDeviceStore;
  let historyStore: FakeNotificationHistoryStore;
  let useCase: ProcessDirectMessagePush;

  beforeEach(() => {
    pushPort = new TestPushTransport();
    deviceStore = new FakePushDeviceStore();
    historyStore = new FakeNotificationHistoryStore();
    useCase = new ProcessDirectMessagePush(
      pushPort,
      deviceStore,
      historyStore,
    );
  });

  it("does not deliver queued business content after current membership is revoked", async () => {
    deviceStore.devices = [{ token: "token-a", platform: "android" }];
    const guarded = new ProcessDirectMessagePush(pushPort, deviceStore, historyStore, { mayDeliver: async () => false });
    await guarded.execute(makeInput());
    expect(pushPort.deliveries).toEqual([]);
    expect(historyStore.updates[0]).toMatchObject({ status: NOTIFICATION_HISTORY_STATUS.Failed, details: { results: [{ token: "token-a", success: false, error: "CURRENT_BUSINESS_ACCESS_DENIED" }] } });
  });

  it("rechecks authority before each device and stops exposing content if access changes during fanout", async () => {
    deviceStore.devices = [{ token: "token-a", platform: "android" }, { token: "token-b", platform: "ios" }];
    let eligible = true;
    const delivered: string[] = [];
    const guarded = new ProcessDirectMessagePush({ send: async payload => { delivered.push(payload.deviceToken); eligible = false; return { ok: true }; } }, deviceStore, historyStore, { mayDeliver: async () => eligible });
    await guarded.execute(makeInput());
    expect(delivered).toEqual(["token-a"]);
    expect(historyStore.updates[0]?.details?.["results"]).toEqual([{ token: "token-a", success: true }, { token: "token-b", success: false, error: "CURRENT_BUSINESS_ACCESS_DENIED" }]);
  });

  it("delivers to every active device and records delivered status", async () => {
    deviceStore.devices = [
      { token: "token-a", platform: "ios" },
      { token: "token-b", platform: "android" },
    ];

    await useCase.execute(makeInput());

    expect(pushPort.deliveries).toHaveLength(2);

    const [first, second] = pushPort.deliveries;
    expect(first?.payload.deviceToken).toBe("token-a");
    expect(second?.payload.deviceToken).toBe("token-b");

    expect(historyStore.updates).toHaveLength(1);
    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Delivered);
    expect(update?.details?.["results"]).toEqual([
      { token: "token-a", success: true },
      { token: "token-b", success: true },
    ]);
  });

  it("passes the expected payload to PushPort", async () => {
    deviceStore.devices = [{ token: "token-a", platform: "ios" }];

    await useCase.execute(makeInput());

    const [recorded] = pushPort.deliveries;
    expect(recorded?.payload).toEqual({
      deviceToken: "token-a",
      platform: "ios",
      title: "Новое сообщение",
      body: "Hello",
      deepLink: "/conversations/conv-1",
      data: { conversationId: "conv-1", messageId: "msg-1" },
    });
  });

  it("records failed status and invalidates the token on permanent token failure", async () => {
    deviceStore.devices = [{ token: "bad-token", platform: "ios" }];
    pushPort.setResult("bad-token", {
      ok: false,
      reason: PUSH_RESULT_REASON.InvalidToken,
    });

    await useCase.execute(makeInput());

    expect(deviceStore.invalidatedTokens).toEqual(["bad-token"]);

    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Failed);
    expect(update?.details?.["results"]).toEqual([
      { token: "bad-token", success: false, error: PUSH_RESULT_REASON.InvalidToken },
    ]);
  });

  it("records failed status for a permanent non-token failure", async () => {
    deviceStore.devices = [{ token: "token-a", platform: "ios" }];
    pushPort.setResult("token-a", {
      ok: false,
      reason: PUSH_RESULT_REASON.Permanent,
      cause: "bad configuration",
    });

    await useCase.execute(makeInput());

    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Failed);
    expect(update?.details?.["results"]).toEqual([
      { token: "token-a", success: false, error: PUSH_RESULT_REASON.Permanent },
    ]);
  });

  it("throws RetryablePushError and leaves history pending on retryable failure", async () => {
    deviceStore.devices = [{ token: "token-a", platform: "ios" }];
    pushPort.setResult("token-a", {
      ok: false,
      reason: PUSH_RESULT_REASON.Retryable,
      cause: "network timeout",
    });

    await expect(useCase.execute(makeInput())).rejects.toBeInstanceOf(
      RetryablePushError,
    );

    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Pending);
    expect(update?.details?.["results"]).toEqual([
      { token: "token-a", success: false, error: PUSH_RESULT_REASON.Retryable },
    ]);
  });

  it("records failed status when the recipient has no active tokens", async () => {
    await useCase.execute(makeInput());

    expect(pushPort.deliveries).toHaveLength(0);
    expect(historyStore.updates).toHaveLength(1);

    const [update] = historyStore.updates;
    expect(update).toEqual({
      historyId: "history-1",
      status: NOTIFICATION_HISTORY_STATUS.Failed,
      details: { reason: NO_ACTIVE_PUSH_TOKENS_REASON },
    });
  });

  it("records delivered when at least one device succeeds even if another is invalid", async () => {
    deviceStore.devices = [
      { token: "good-token", platform: "ios" },
      { token: "bad-token", platform: "android" },
    ];
    pushPort.setResult("bad-token", {
      ok: false,
      reason: PUSH_RESULT_REASON.InvalidToken,
    });

    await useCase.execute(makeInput());

    expect(deviceStore.invalidatedTokens).toEqual(["bad-token"]);

    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Delivered);
  });

  it("leaves history pending and retries when one device succeeds but another is retryable", async () => {
    deviceStore.devices = [
      { token: "good-token", platform: "ios" },
      { token: "flaky-token", platform: "android" },
    ];
    pushPort.setResult("flaky-token", {
      ok: false,
      reason: PUSH_RESULT_REASON.Retryable,
      cause: "network timeout",
    });

    await expect(useCase.execute(makeInput())).rejects.toBeInstanceOf(
      RetryablePushError,
    );

    const [update] = historyStore.updates;
    expect(update?.status).toBe(NOTIFICATION_HISTORY_STATUS.Pending);
  });
});

describe("ProcessDirectMessagePush over the production transport", () => {
  class FakeProviderSender implements FcmSender, ApnsSender {
    messages: Array<FcmMessage | ApnsMessage> = [];
    constructor(private readonly result: PushResult = { ok: true }) {}

    async send(message: FcmMessage | ApnsMessage): Promise<PushResult> {
      this.messages.push(message);
      return this.result;
    }
  }

  it("sends each device exactly once and splits traffic by platform", async () => {
    const fcm = new FakeProviderSender();
    const apns = new FakeProviderSender();
    const deviceStore = new FakePushDeviceStore();
    const historyStore = new FakeNotificationHistoryStore();
    deviceStore.devices = [
      { token: "ios-token", platform: "ios" },
      { token: "android-token", platform: "android" },
    ];

    await new ProcessDirectMessagePush(
      new FcmApnsPushTransport(fcm, apns),
      deviceStore,
      historyStore,
    ).execute(makeInput());

    expect(apns.messages.map((m) => m.token)).toEqual(["ios-token"]);
    expect(fcm.messages.map((m) => m.token)).toEqual(["android-token"]);
    expect(historyStore.updates).toHaveLength(1);
    expect(historyStore.updates[0]?.status).toBe(
      NOTIFICATION_HISTORY_STATUS.Delivered,
    );
  });

  it("deactivates a token APNS reports as unregistered without resending", async () => {
    const fcm = new FakeProviderSender();
    const apns = new FakeProviderSender({
      ok: false,
      reason: PUSH_RESULT_REASON.InvalidToken,
    });
    const deviceStore = new FakePushDeviceStore();
    const historyStore = new FakeNotificationHistoryStore();
    deviceStore.devices = [{ token: "dead-ios-token", platform: "ios" }];

    await new ProcessDirectMessagePush(
      new FcmApnsPushTransport(fcm, apns),
      deviceStore,
      historyStore,
    ).execute(makeInput());

    expect(deviceStore.invalidatedTokens).toEqual(["dead-ios-token"]);
    expect(apns.messages).toHaveLength(1);
    expect(historyStore.updates).toHaveLength(1);
    expect(historyStore.updates[0]?.status).toBe(
      NOTIFICATION_HISTORY_STATUS.Failed,
    );
  });

  it("carries the conversation deep link to both providers", async () => {
    const fcm = new FakeProviderSender();
    const apns = new FakeProviderSender();
    const deviceStore = new FakePushDeviceStore();
    deviceStore.devices = [
      { token: "ios-token", platform: "ios" },
      { token: "android-token", platform: "android" },
    ];

    await new ProcessDirectMessagePush(
      new FcmApnsPushTransport(fcm, apns),
      deviceStore,
      new FakeNotificationHistoryStore(),
    ).execute(makeInput());

    for (const sender of [fcm, apns]) {
      expect(sender.messages[0]?.data).toMatchObject({
        deepLink: "/conversations/conv-1",
        conversationId: "conv-1",
        messageId: "msg-1",
      });
    }
  });
});

describe("ProcessDirectMessagePush retry hygiene", () => {
  it("does not re-send to a device an earlier attempt already delivered to", async () => {
    const pushPort = new TestPushTransport();
    const deviceStore = new FakePushDeviceStore();
    const historyStore = new FakeNotificationHistoryStore();
    deviceStore.devices = [
      { token: "delivered-token", platform: "ios" },
      { token: "flaky-token", platform: "android" },
    ];
    historyStore.succeededTokens = ["delivered-token"];

    await useCaseFor(pushPort, deviceStore, historyStore).execute(makeInput());

    expect(pushPort.deliveries.map((d) => d.payload.deviceToken)).toEqual([
      "flaky-token",
    ]);
    expect(historyStore.updates[0]?.status).toBe(
      NOTIFICATION_HISTORY_STATUS.Delivered,
    );
  });

  it("still records a previously delivered token as successful", async () => {
    const pushPort = new TestPushTransport();
    const deviceStore = new FakePushDeviceStore();
    const historyStore = new FakeNotificationHistoryStore();
    deviceStore.devices = [{ token: "delivered-token", platform: "ios" }];
    historyStore.succeededTokens = ["delivered-token"];

    await useCaseFor(pushPort, deviceStore, historyStore).execute(makeInput());

    expect(pushPort.deliveries).toHaveLength(0);
    expect(historyStore.updates[0]?.details?.["results"]).toEqual([
      { token: "delivered-token", success: true, skipped: true },
    ]);
  });

  it("sends normally on the first attempt when nothing was delivered yet", async () => {
    const pushPort = new TestPushTransport();
    const deviceStore = new FakePushDeviceStore();
    const historyStore = new FakeNotificationHistoryStore();
    deviceStore.devices = [{ token: "token-a", platform: "android" }];

    await useCaseFor(pushPort, deviceStore, historyStore).execute(makeInput());

    expect(pushPort.deliveries).toHaveLength(1);
  });
});

function useCaseFor(
  pushPort: TestPushTransport,
  deviceStore: FakePushDeviceStore,
  historyStore: FakeNotificationHistoryStore,
): ProcessDirectMessagePush {
  return new ProcessDirectMessagePush(pushPort, deviceStore, historyStore);
}
