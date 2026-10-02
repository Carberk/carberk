import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { describe, expect, it, vi } from "vitest";

import { AppModule } from "./app.module";
import { AccountDeletionPendingGuard } from "./common/account-deletion-pending.guard";
import { JwtAuthGuard } from "./common/jwt-auth.guard";

// ConfigModule.forRoot validates the environment when AppModule is imported.
// This test reads decorator metadata only, so it must not need a real one.
vi.mock("./env.schema", () => ({
  parseEnv: (config: Record<string, unknown>) => config,
}));

interface ProviderEntry {
  provide?: unknown;
  useClass?: unknown;
}

describe("AppModule global guards", () => {
  it("runs JwtAuthGuard, then ThrottlerGuard, then AccountDeletionPendingGuard", () => {
    const providers: ProviderEntry[] =
      Reflect.getMetadata("providers", AppModule) ?? [];

    const guards = providers
      .filter((provider) => provider.provide === APP_GUARD)
      .map((provider) => provider.useClass);

    // Guards run in registration order. The pending-deletion check needs the
    // signed-in User, and a throttled request should not cost a database read.
    expect(guards).toEqual([
      JwtAuthGuard,
      ThrottlerGuard,
      AccountDeletionPendingGuard,
    ]);
  });
});
