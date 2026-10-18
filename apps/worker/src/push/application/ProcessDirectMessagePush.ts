import { Inject, Injectable, Optional } from "@nestjs/common";

import { DIRECT_MESSAGE_DELIVERY_ELIGIBILITY, type DirectMessageDeliveryEligibility } from "../domain/DirectMessageDeliveryEligibility";
import type { DirectMessagePushInput } from "../domain/DirectMessagePushInput";
import type {
  NotificationHistoryStatus,
  NotificationHistoryStore,
} from "../domain/NotificationHistoryStore";
import { NOTIFICATION_HISTORY_STORE } from "../domain/NotificationHistoryStore";
import type { PushDeviceStore } from "../domain/PushDeviceStore";
import { PUSH_DEVICE_STORE } from "../domain/PushDeviceStore";
import type { PushPort, PushResult } from "../domain/PushPort";
import { PUSH_PORT } from "../domain/PushPort";
import {
  NO_ACTIVE_PUSH_TOKENS_REASON,
  NOTIFICATION_HISTORY_STATUS,
  PUSH_RESULT_REASON,
} from "../domain/types";

export class RetryablePushError extends Error {
  constructor(
    readonly historyId: string,
    message: string,
  ) {
    super(message);
    this.name = "RetryablePushError";
  }
}

interface TokenResult {
  token: string;
  success: boolean;
  error?: string;
  /** Set when an earlier BullMQ attempt already delivered to this token. */
  skipped?: true;
}

@Injectable()
export class ProcessDirectMessagePush {
  constructor(
    @Inject(PUSH_PORT)
    private readonly pushPort: PushPort,
    @Inject(PUSH_DEVICE_STORE)
    private readonly deviceStore: PushDeviceStore,
    @Inject(NOTIFICATION_HISTORY_STORE)
    private readonly historyStore: NotificationHistoryStore,
    @Inject(DIRECT_MESSAGE_DELIVERY_ELIGIBILITY) @Optional() private readonly eligibility?: DirectMessageDeliveryEligibility,
  ) {}

  async execute(input: DirectMessagePushInput): Promise<void> {
    const devices = await this.deviceStore.listActiveForUser(
      input.recipientUserId,
    );

    if (devices.length === 0) {
      await this.historyStore.updateStatus(
        input.historyId,
        NOTIFICATION_HISTORY_STATUS.Failed,
        {
          reason: NO_ACTIVE_PUSH_TOKENS_REASON,
        },
      );
      return;
    }

    // BullMQ retries the whole job, so a device that already received this
    // notification on an earlier attempt must not be pushed to again.
    const alreadyDelivered = new Set(
      await this.historyStore.listSucceededTokens(input.historyId),
    );

    const results: TokenResult[] = [];

    for (const device of devices) {
      if (alreadyDelivered.has(device.token)) {
        results.push({ token: device.token, success: true, skipped: true });
        continue;
      }

      if (this.eligibility && !await this.eligibility.mayDeliver(input)) {
        results.push({ token: device.token, success: false, error: "CURRENT_BUSINESS_ACCESS_DENIED" });
        continue;
      }

      const result = await this.pushPort.send({
        deviceToken: device.token,
        platform: device.platform,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink,
        data: input.data,
      });

      if (!result.ok && result.reason === PUSH_RESULT_REASON.InvalidToken) {
        await this.deviceStore.invalidateToken(device.token);
      }

      results.push(this.handleResult(device.token, result));
    }

    const hasRetryable = results.some(
      (r) => r.error === PUSH_RESULT_REASON.Retryable,
    );
    const status = this.resolveStatus(results, hasRetryable);
    await this.historyStore.updateStatus(input.historyId, status, {
      results,
    });

    if (hasRetryable) {
      throw new RetryablePushError(
        input.historyId,
        `Direct-message push ${input.historyId} has retryable failures`,
      );
    }
  }

  private handleResult(token: string, result: PushResult): TokenResult {
    if (result.ok) {
      return { token, success: true };
    }

    return { token, success: false, error: result.reason };
  }

  private resolveStatus(
    results: TokenResult[],
    hasRetryable: boolean,
  ): NotificationHistoryStatus {
    if (hasRetryable) {
      return NOTIFICATION_HISTORY_STATUS.Pending;
    }

    if (results.some((r) => r.success)) {
      return NOTIFICATION_HISTORY_STATUS.Delivered;
    }

    return NOTIFICATION_HISTORY_STATUS.Failed;
  }
}
