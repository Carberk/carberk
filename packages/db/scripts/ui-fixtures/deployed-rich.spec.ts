import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { deployedRichTarget } from "./deployed-rich";

// The authorized seams are the new deployed entrypoint and its genuine DB/storage
// execution (covered beside the existing disposable rich scenario suite).
describe("deployed rich target boundary", () => {
  it("refuses local, mixed and incomplete target declarations without exposing config", () => {
    for (const input of [{}, { target: "local" }, { target: "production", databaseUrl: "postgres://private:secret@private/db" }]) {
      expect(() => deployedRichTarget(input, {}, {})).toThrow("Deployed rich target refused");
      try { deployedRichTarget(input, {}, {}); } catch (error) {
        expect(String(error)).not.toMatch(/secret|postgres:|private\/db/);
      }
    }
  });
  it("rejects URL overrides at the CLI without echoing private arguments or ambient configuration", () => {
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/deployed-rich-scenarios.ts", "--database-url", "postgres://private:secret@private/db"],
        { env: { ...process.env, DATABASE_URL: "postgres://private:ambient-secret@private/db" }, stdio: "pipe" });
      throw new Error("Unexpected CLI success");
    } catch (error) {
      const result = error as { status: number; stdout: Buffer; stderr: Buffer };
      expect(result.status).toBe(1);
      const output = String(result.stdout) + String(result.stderr);
      expect(output).toContain("Deployed rich target refused");
      expect(output).not.toMatch(/private:|secret|postgres:/);
    }
  });
});
