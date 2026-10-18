import { expect, it } from "vitest";

import { operationsConfig } from "./OperationsConfig";

const env = { OPERATIONS_ALERTS_ENABLED: "true", OPERATIONS_ALERT_TRANSPORT: "smtp",
  OPERATIONS_SMTP_USER: "tkmdevelopers@gmail.com", OPERATIONS_SMTP_APP_PASSWORD: "synthetic-password-only",
  OPERATIONS_SMTP_FROM: "tkmdevelopers@gmail.com", OPERATIONS_SMTP_TO: "bagtyyarkowusow.dev@gmail.com" };
it("defaults closed and validates the single authorized SMTP route without exposing input", () => {
  expect(operationsConfig({ ...env, OPERATIONS_ALERTS_ENABLED: "false" }).smtp).toBeUndefined();
  expect(operationsConfig({}).smtp).toBeUndefined();
  expect(operationsConfig(env).smtp).toBeDefined();
  for (const invalid of [{ OPERATIONS_SMTP_TO: "victim@example.com" }, { OPERATIONS_SMTP_TO: "bagtyyarkowusow.dev@gmail.com\r\nBcc:x@example.com" },
    { OPERATIONS_SMTP_FROM: "other@gmail.com" }, { OPERATIONS_SMTP_USER: "other@gmail.com" }, { OPERATIONS_SMTP_APP_PASSWORD: "" },
    { OPERATIONS_SMTP_HOST: "attacker.example" }, { OPERATIONS_SMTP_PORT: "25" }]) {
    expect(() => operationsConfig({ ...env, ...invalid })).toThrow("Operational SMTP configuration invalid");
  }
});

