import { describe, expect, it, vi } from "vitest";
import { AuthSchemas } from "@auto-tm/contracts";
import {
  BullMqEmailCodeSenderAdapter,
  EMAIL_CODE_JOB_OPTIONS,
} from "./BullMqEmailCodeSenderAdapter";

describe("BullMqEmailCodeSenderAdapter", () => {
  it("enqueues the worker contract with the request UUID as job id", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const adapter = new BullMqEmailCodeSenderAdapter({ add } as never, {} as never);

    await adapter.enqueue({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      email: "buyer@example.com",
      code: "123456",
      locale: "ru",
      purpose: "sign-in-method",
    });

    expect(add).toHaveBeenCalledWith(
      AuthSchemas.EMAIL_CODE_JOB_NAME,
      {
        to: "buyer@example.com",
        code: "123456",
        locale: "ru",
        purpose: "sign-in-method",
      },
      {
        ...EMAIL_CODE_JOB_OPTIONS,
        jobId: "550e8400-e29b-41d4-a716-446655440000",
      },
    );
  });

  it("uses the same fixed campaign dedup identity and rejects a conflicting dedup result", async () => {
    const reservation = "b9".repeat(16), requestId = "campaign-delivery-request";
    const add = vi.fn().mockResolvedValue({ id: requestId });
    const transaction = { $queryRaw: vi.fn().mockResolvedValue([]), $queryRawUnsafe: vi.fn().mockResolvedValue([{ request_id: requestId }]) };
    const db = { $transaction: (action: (tx: typeof transaction) => Promise<void>) => action(transaction) };
    const adapter = new BullMqEmailCodeSenderAdapter({ add } as never, db as never);
    const input = { requestId, email: `buyer-a.${reservation}.${"a".repeat(12)}@campaign897.invalid`, code: "123456", locale: "en", purpose: "sign-in" } as const;
    await adapter.enqueue(input);
    expect(add).toHaveBeenLastCalledWith(AuthSchemas.EMAIL_CODE_JOB_NAME, {
      to: input.email, code: input.code, locale: input.locale, purpose: input.purpose,
    }, { ...EMAIL_CODE_JOB_OPTIONS, jobId: requestId, deduplication: { id: `campaign-cf_${reservation}-${requestId}` } });
    add.mockResolvedValueOnce({ id: `disposed:cf_${reservation}:${"a".repeat(40)}:${requestId}` });
    await expect(adapter.enqueue(input)).rejects.toThrow("fenced or has conflicting ownership");
  });
});
