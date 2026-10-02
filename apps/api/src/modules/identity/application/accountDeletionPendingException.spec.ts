import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { accountDeletionPendingException } from "./accountDeletionPendingException";

describe("accountDeletionPendingException", () => {
  it("answers 403 FORBIDDEN with the ACCOUNT_DELETION_PENDING reason", () => {
    const error = accountDeletionPendingException();

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toEqual({
      code: "FORBIDDEN",
      message:
        "Your account is scheduled for deletion. Restore it to make changes.",
      details: { reason: "ACCOUNT_DELETION_PENDING" },
    });
  });
});
