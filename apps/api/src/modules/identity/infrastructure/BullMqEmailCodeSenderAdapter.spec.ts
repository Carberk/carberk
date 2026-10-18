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
});
