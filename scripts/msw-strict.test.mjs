import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const mobileRoot = join(import.meta.dirname, "..", "apps", "mobile");

function runVitest(config) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "vitest", "run", "--config", config, "--reporter", "verbose"], {
      cwd: mobileRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("mobile MSW setup fails a caught unhandled request and permits handled responses in adjacent tests", { timeout: 20_000 }, async () => {
  // A non-spec suffix keeps the intentional failure out of the ordinary suite.
  const directory = await mkdtemp(join(mobileRoot, "test", ".msw-guard-"));
  const probe = join(directory, "probe.fixture.ts");
  const config = join(directory, "vitest.config.mts");
  await writeFile(config, `
    import base from "../../vitest.config.mts";
    export default { ...base, test: { ...base.test, include: [${JSON.stringify(probe)}] } };
  `);
  await writeFile(probe, `
    import { http, HttpResponse } from "msw";
    import { expect, it } from "vitest";
    import { server } from "../msw";

    it("handled failure response is allowed", async () => {
      server.use(http.get("http://probe.test/status", () => new HttpResponse(null, { status: 503 })));
      expect((await fetch("http://probe.test/status")).status).toBe(503);
    });

    it("caught unhandled request fails teardown after handlers reset", async () => {
      // The previous test's handler must not hide this request.
      await fetch("http://probe.test/status").catch(() => undefined);
    });

    it("handled success is allowed after the failed test", async () => {
      server.use(http.get("http://probe.test/status", () => HttpResponse.json({ ok: true })));
      expect(await (await fetch("http://probe.test/status")).json()).toEqual({ ok: true });
    });
  `);

  try {
    const result = await runVitest(config);
    const output = result.output.replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(result.code, 1, output);
    assert.match(output, /Unhandled MSW request\(s\): GET http:\/\/probe\.test\/status/);
    assert.match(output, /1 failed \| 2 passed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
