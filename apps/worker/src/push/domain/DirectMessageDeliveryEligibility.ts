import type { DirectMessagePushInput } from "./DirectMessagePushInput";

/** Re-evaluated for each provider attempt, including queue retries. */
export interface DirectMessageDeliveryEligibility {
  mayDeliver(input: DirectMessagePushInput): Promise<boolean>;
}
export const DIRECT_MESSAGE_DELIVERY_ELIGIBILITY = Symbol("DirectMessageDeliveryEligibility");
