import assert from "node:assert/strict";
import { test } from "node:test";

import { callerDevice, cli, signInFixture } from "./native-fixture-signin.mjs";

const NOW = Date.parse("2026-11-12T06:00:00Z");
const ID = "abcdef01-1234-4567-89ab-123456789abc";
const config = "APP_ENV=development\nNODE_ENV=development\nSMS_DRIVER=mock\nOTP_TEST_MODE=false\nOTP_TEST_CODE_RESPONSE=false\nPORT=3006";
const options = { fixture: "seller", api: "http://127.0.0.1:3006/api/v1", apiEnv: "/tmp/api.env", apiLog: "/tmp/api.log" };
function boundary({ signedIn = false, currentOtp = false, log, response, cabinetStates } = {}) {
  const actions = [];
  const inputs = [];
  const requests = [];
  const reads = [];
  const waits = [];
  let cabinetIndex = 0;
  let entered = false;
  return {
    actions, inputs, requests, reads, waits,
    now: () => NOW,
    sleep: async value => { waits.push(value); },
    readFile: async path => {
      reads.push(path);
      return path.endsWith(".env") ? config : log ?? `2026-11-12T06:00:00.000Z [mock] OTP for ***0001 (req abcdef01): 709814\n`;
    },
    fetch: async (url, init) => {
      requests.push([String(url), init]);
      if (String(url).endsWith("/healthz")) return Response.json({ service: "api", environment: "development" });
      return response ?? Response.json({ requestId: ID, resendInSeconds: 60 });
    },
    device: async (args, { input } = {}) => {
      actions.push(args);
      if (args[0] === "fill") { entered = true; inputs.push(input); }
      if (args[0] === "snapshot" && cabinetStates && !actions.some(a => a[1]?.includes("/otp?"))) {
        const state = cabinetStates[Math.min(cabinetIndex++, cabinetStates.length - 1)];
        if (state instanceof Error) throw state;
        return state;
      }
      if (args[0] === "snapshot") return { nodes: entered || signedIn
        ? [{ label: "Aýgül Amanowa" }, { label: "+993 61 XX-XX-01" }]
        : currentOtp || actions.some(a => a[1]?.includes("/otp?"))
          ? [{ label: "Enter the code" }, { label: "+993 61 XX-XX-01" }, { type: "TextField", editable: true, ref: "e7" }]
          : [{ label: "Sign in", role: "button" }] };
      return {};
    },
  };
}

test("refuses remote APIs before touching the device or spending a code", async () => {
  await assert.rejects(signInFixture({ fixture: "seller", api: "https://api.example/api/v1" }, {
    fetch: () => assert.fail("network must stay untouched"),
    device: () => assert.fail("device must stay untouched"),
  }), /loopback/);
});

test("reuses the seller already confirmed in the native app without requesting a code", async () => {
  const port = boundary({ signedIn: true });
  assert.deepEqual(await signInFixture({ ...options, reuseOnly: true }, port), { fixture: "seller", status: "reused", identityConfirmed: true });
  assert.deepEqual(port.waits, []);
  assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
  assert.deepEqual(port.reads, [options.apiEnv]);
  assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"]]);
});

for (const loading of ["Loading", "Please wait...", "Подождите...", "Garaşyň..."]) {
  test(`reuses the expected fixture when initial Cabinet loading settles (${loading}), without another invocation or code`, async () => {
    const port = boundary({ cabinetStates: [
      { nodes: [{ label: loading }] },
      { nodes: [{ label: "Aýgül Amanowa, +993 61 XX-XX-01" }] },
    ] });
    assert.deepEqual(await signInFixture({ ...options, reuseOnly: true }, port), { fixture: "seller", status: "reused", identityConfirmed: true });
    assert.deepEqual(port.waits, [500]);
    assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
    assert.deepEqual(port.reads, [options.apiEnv]);
    assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"], ["snapshot", "-i"]]);
    assert.deepEqual(port.inputs, []);
  });
}

for (const method of ["+993 62 XX-XX-42", "s•••@example.test"]) {
  test(`refuses a settled wrong identity (${method}) immediately even while another Cabinet row is loading`, async () => {
    const port = boundary({ cabinetStates: [
      { nodes: [{ label: `Other seller, ${method}` }, { label: "Please wait..." }] },
      { nodes: [{ label: "Aýgül Amanowa, +993 61 XX-XX-01" }] },
    ] });
    await assert.rejects(signInFixture(options, port), /without switching/);
    assert.deepEqual(port.waits, []);
    assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
    assert.deepEqual(port.reads, [options.apiEnv]);
    assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"]]);
  });
}

test("reuse-only refuses a settled signed-out Cabinet immediately even while another row is loading", async () => {
  const port = boundary({ cabinetStates: [{ nodes: [{ label: "Войти, Сохраните избранное и общайтесь" }, { label: "Подождите..." }] }] });
  await assert.rejects(signInFixture({ ...options, reuseOnly: true }, port), /reuse-only/);
  assert.deepEqual(port.waits, []);
  assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
  assert.deepEqual(port.reads, [options.apiEnv]);
  assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"]]);
});

for (const error of ["Something went wrong", "Что-то пошло не так", "Bir zat ýalňyş boldy"]) {
  test(`refuses a settled Cabinet error (${error}) immediately instead of waiting on another loading row`, async () => {
    const port = boundary({ cabinetStates: [{ nodes: [{ label: error }, { label: "Garaşyň..." }] }] });
    await assert.rejects(signInFixture(options, port), /without switching/);
    assert.deepEqual(port.waits, []);
    assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
    assert.deepEqual(port.reads, [options.apiEnv]);
    assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"]]);
  });
}

for (const reuseOnly of [false, true]) {
  test(`persistent initial Cabinet loading times out without any auth action (reuse-only: ${reuseOnly})`, async () => {
    const port = boundary({ cabinetStates: [{ nodes: [{ label: "Garaşyň..." }, { label: "private-value" }] }] });
    await assert.rejects(signInFixture({ ...options, reuseOnly }, port), error => {
      assert.match(error.message, /Cabinet identity loading timed out/);
      assert.doesNotMatch(error.message, /private-value/);
      return true;
    });
    assert.deepEqual(port.waits, [500, 500, 500, 500, 500, 500, 500, 500, 500]);
    assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
    assert.deepEqual(port.reads, [options.apiEnv]);
    assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ...Array.from({ length: 10 }, () => ["snapshot", "-i"])]);
  });
}

test("stops and redacts a device error during initial Cabinet loading without another snapshot or code", async () => {
  const port = boundary({ cabinetStates: [
    { nodes: [{ label: "Please wait..." }] },
    new Error("709814 token=private-value +99361000001"),
    { nodes: [{ label: "Aýgül Amanowa, +993 61 XX-XX-01" }] },
  ] });
  await assert.rejects(signInFixture({ ...options, reuseOnly: true }, port), error => {
    assert.match(error.message, /raw diagnostics suppressed/);
    assert.doesNotMatch(error.message, /709814|private-value|99361000001/);
    return true;
  });
  assert.deepEqual(port.waits, [500]);
  assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
  assert.deepEqual(port.reads, [options.apiEnv]);
  assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"], ["snapshot", "-i"]]);
});

test("refuses an unreadable settled Cabinet without retrying or requesting a code", async () => {
  const port = boundary({ cabinetStates: [{ nodes: [] }] });
  await assert.rejects(signInFixture(options, port), /without switching/);
  assert.deepEqual(port.waits, []);
  assert.deepEqual(port.actions, [["open", "tm.auto.app"], ["open", "autotm:///services"], ["snapshot", "-i"]]);
  assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
});

test("requests once, enters the correlated code in the genuine OTP UI, and confirms identity", async () => {
  const port = boundary({ cabinetStates: [{ nodes: [{ label: "Please wait..." }] }, { nodes: [{ label: "Sign in" }] }] });
  assert.deepEqual(await signInFixture(options, port), { fixture: "seller", status: "signed-in", identityConfirmed: true });
  assert.deepEqual(port.waits, [500]);
  const requests = port.requests.filter(([url]) => url.endsWith("/otp/request"));
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0][1].body), { phone: "+99361000001" });
  assert.equal(requests[0][1].redirect, "error");
  assert.deepEqual(port.actions.find(([action]) => action === "fill"), ["fill", "@e7", "--text-stdin"]);
  assert.equal(port.requests.some(([url]) => url.endsWith("/verify")), false);
  assert.deepEqual(port.inputs, ["709814"]);
});

test("uses an existing exact request without spending another code", async () => {
  const port = boundary({ currentOtp: true });
  assert.deepEqual(await signInFixture({ ...options, requestId: ID, requestedAt: "2026-11-12T06:00:00Z" }, port),
    { fixture: "seller", status: "verified", identityConfirmed: false });
  assert.equal(port.requests.some(([url]) => url.endsWith("/otp/request")), false);
  assert.deepEqual(port.actions.slice(0, 2), [["snapshot", "-i"], ["fill", "@e7", "--text-stdin"]]);
  assert.deepEqual(port.actions.filter(([action]) => action === "open"), []);
});

test("exact-request delivery refuses a different Code destination without leaving or typing", async () => {
  const port = boundary();
  port.device = async args => {
    port.actions.push(args);
    return { nodes: [{ label: "Enter the code" }, { label: "+993 61 XX-XX-09" }, { type: "TextField", editable: true, ref: "e7" }] };
  };
  await assert.rejects(signInFixture({ ...options, requestId: ID, requestedAt: new Date(NOW).toISOString() }, port), /did not become ready/);
  assert.equal(port.actions.some(([action]) => action !== "snapshot"), false);
  assert.deepEqual(port.requests.map(([url]) => new URL(url).pathname), ["/healthz"]);
});

test("reads the running API's structured Pino timestamp", async () => {
  const port = boundary({ log: '{"level":30,"time":1794463200000,"msg":"[mock] OTP for ***0001 (req abcdef01): 709814"}\n' });
  assert.equal((await signInFixture(options, port)).status, "signed-in");
});

for (const [name, log] of [
  ["another request with the same last four digits", "2026-11-12T06:00:00Z [mock] OTP for ***0001 (req 12345678): 709814\n"],
  ["another fixture", "2026-11-12T06:00:00Z [mock] OTP for ***0009 (req abcdef01): 709814\n"],
  ["a stale code", "2026-11-12T05:54:00Z [mock] OTP for ***0001 (req abcdef01): 709814\n"],
  ["an undated code", "[mock] OTP for ***0001 (req abcdef01): 709814\n"],
  ["an ambiguous tag", "2026-11-12T06:00:00Z [mock] OTP for ***0001 (req abcdef01): 709814\n2026-11-12T06:00:00Z [mock] OTP for ***0001 (req abcdef01): 709814\n"],
  ["a superseded code", "2026-11-12T06:00:00Z [mock] OTP for ***0001 (req abcdef01): 709814\n2026-11-12T06:00:01Z [mock] OTP for ***0001 (req 12345678): 123456\n"],
]) {
  test(`refuses ${name} without resending or entering a code`, async () => {
    const port = boundary({ log });
    await assert.rejects(signInFixture(options, port), /stop without resending/);
    assert.equal(port.requests.filter(([url]) => url.endsWith("/otp/request")).length, 1);
    assert.equal(port.actions.some(([action]) => action === "fill"), false);
  });
}

test("stops at a rate limit without reading any code or replaying the request", async () => {
  const port = boundary({ response: Response.json({ code: "RATE_LIMITED", token: "private-value" }, { status: 429 }) });
  const read = port.readFile;
  port.readFile = path => path.endsWith(".env") ? read(path) : assert.fail("must not read OTP log");
  await assert.rejects(signInFixture(options, port), /RATE_LIMITED/);
  assert.equal(port.requests.filter(([url]) => url.endsWith("/otp/request")).length, 1);
});

test("redacts boundary failures that contain codes, credentials or response bodies", async () => {
  const port = boundary();
  port.device = async () => { throw new Error("709814 token=private-value +99361000001"); };
  await assert.rejects(signInFixture(options, port), error => {
    assert.doesNotMatch(String(error), /709814|private-value|99361000001/);
    return true;
  });
});

for (const api of ["https://127.0.0.1/api/v1", "http://127.0.0.1.evil/api/v1", "http://192.168.1.2/api/v1", "http://user:secret@localhost/api/v1", "http://localhost/api/v1?token=secret", "http://localhost/api/v1#secret"]) {
  test(`refuses unsafe API context: ${api.replace(/secret/g, "REDACTED")}`, async () => {
    await assert.rejects(signInFixture({ ...options, api }, {}), /loopback/);
  });
}

for (const change of ["SMS_DRIVER=gateway", "APP_ENV=production", "NODE_ENV=production", "OTP_TEST_MODE=true", "OTP_TEST_CODE_RESPONSE=true", "PORT=3007"]) {
  test(`refuses configuration mismatch: ${change}`, async () => {
    const port = boundary();
    const read = port.readFile;
    port.readFile = path => path.endsWith(".env") ? config.replace(new RegExp(`${change.split("=")[0]}=.*`), change) : read(path);
    await assert.rejects(signInFixture(options, port), /config/);
    assert.equal(port.requests.length, 0);
    assert.equal(port.actions.length, 0);
  });
}

test("refuses a running production API despite a development env file", async () => {
  const port = boundary();
  port.fetch = async () => Response.json({ service: "api", environment: "production" });
  await assert.rejects(signInFixture(options, port), /environment/);
  assert.equal(port.actions.length, 0);
});

test("refuses redirect escapes and never follows them", async () => {
  const port = boundary();
  port.fetch = async (_url, init) => {
    assert.equal(init.redirect, "error");
    throw new Error("redirect to https://secret.example/?token=private-value");
  };
  await assert.rejects(signInFixture(options, port), error => {
    assert.doesNotMatch(error.message, /secret|private-value/);
    return true;
  });
  assert.equal(port.actions.length, 0);
});

test("refuses another signed-in identity and never switches or requests a code", async () => {
  const port = boundary();
  port.device = async () => ({ nodes: [{ label: "Öwez Berdiýew" }, { label: "+993 61 XX-XX-09" }] });
  await assert.rejects(signInFixture(options, port), /without switching/);
  assert.equal(port.requests.some(([url]) => url.endsWith("/otp/request")), false);
});

test("reuse-only reports a signed-out app without spending a code", async () => {
  const port = boundary();
  await assert.rejects(signInFixture({ ...options, reuseOnly: true }, port), /reuse-only/);
  assert.equal(port.requests.some(([url]) => url.endsWith("/otp/request")), false);
});

const receipt = { command: ["/tmp/device/targets/owned/agent-device"], session: "owned", deviceId: "device", worktree: "/tmp/own-worktree" };
test("executes the exact caller command as argument arrays with recording disabled", async () => {
  const invocations = [];
  const device = callerDevice(receipt, { cwd: "/tmp/own-worktree", executeFile: async (exe, args, config) => {
    invocations.push({ exe, args, config });
    return { stdout: JSON.stringify({ success: true, data: { session: "owned", id: "device" } }) };
  } });
  await device(["open", "tm.auto.app"]);
  await device(["fill", "@e7", "--text-stdin"], { input: "709814" });
  assert.equal(invocations[0].exe, "/tmp/device/targets/owned/agent-device");
  assert.deepEqual(invocations[1].args, ["fill", "@e7", "--text-stdin", "--json", "--no-record"]);
  assert.equal(invocations[0].config.shell, undefined);
  assert.equal(invocations[1].config.input, "709814");
});

test("rejects mismatched worktree and session ownership before launching a process", () => {
  for (const invalid of [{ ...receipt, worktree: "/tmp/other" }, { ...receipt, session: "other" }]) {
    assert.throws(() => callerDevice(invalid, { cwd: "/tmp/own-worktree", executeFile: () => assert.fail() }), /exact device_open/);
  }
});

test("confirms the native device ID before any navigation or code request", async () => {
  const device = callerDevice({ ...receipt, deviceId: "other" }, {
    cwd: "/tmp/own-worktree", executeFile: async () => ({ stdout: '{"success":true,"data":{"session":"owned","id":"device"}}' }),
  });
  await assert.rejects(device(["open", "tm.auto.app"]), /ownership\/context mismatch/);
});

test("rejects command prefixes that override the caller's session or run another command", () => {
  for (const extra of [["--session", "other"], ["--udid", "other-device"], ["close"], ["--force"]]) {
    assert.throws(() => callerDevice({ ...receipt, command: [...receipt.command, ...extra] }, {
      cwd: "/tmp/own-worktree", executeFile: () => assert.fail("must not launch"),
    }), /exact device_open/);
  }
});

test("never leaks process argv or output on an OTP typing failure", async () => {
  const device = callerDevice(receipt, { cwd: "/tmp/own-worktree", executeFile: async () => {
    throw Object.assign(new Error("command fill 709814"), { stdout: "token=private-value", stderr: "+99361000001" });
  } });
  await assert.rejects(device(["fill", "@e7", "--text-stdin"]), error => {
    assert.doesNotMatch(String(error), /709814|private-value|99361000001/);
    return true;
  });
});

test("public CLI emits only a safe failure for malformed receipts and unknown arguments", async () => {
  for (const args of [["--api", "http://localhost/api/v1", "--private-value"], ["--fixture", "seller", "--api", options.api, "--api-env", "/tmp/api.env", "--api-log", "/tmp/api.log", "--device-command-file", "/tmp/private.json"]]) {
    const output = [];
    const code = await cli(args, { out: value => output.push(value), err: value => output.push(value), readFile: async () => "private-value 709814 not JSON" });
    assert.equal(code, 1);
    assert.doesNotMatch(output.join("\n"), /709814|private-value/);
  }
});

test("public CLI signs in without printing or saving the OTP or response", async () => {
  const port = boundary();
  const output = [];
  const code = await cli(["--fixture", "seller", "--api", options.api, "--api-env", options.apiEnv, "--api-log", options.apiLog, "--device-command-file", "/tmp/device.json"], {
    ...port, cwd: "/tmp/own-worktree", out: value => output.push(value), err: value => output.push(value),
    readFile: path => path.endsWith("device.json") ? JSON.stringify(receipt) : port.readFile(path),
    executeFile: async (_exe, args) => {
      const action = args.slice(0, -2);
      const data = action[0] === "open" && action[1] === "tm.auto.app"
        ? { session: "owned", id: "device" }
        : await port.device(action);
      return { stdout: JSON.stringify({ success: true, data }) };
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(output, ['{"fixture":"seller","status":"signed-in","identityConfirmed":true}']);
  assert.doesNotMatch(output.join("\n"), /709814|99361000001|abcdef01/);
});

test("supports buyer identity and its own correlated request", async () => {
  const port = boundary({ log: '2026-11-12T06:00:00Z [mock] OTP for ***0009 (req abcdef01): 709814\n' });
  const originalDevice = port.device;
  port.device = async args => {
    const result = await originalDevice(args);
    return JSON.parse(JSON.stringify(result).replaceAll("Aýgül Amanowa", "Öwez Berdiýew").replaceAll("XX-XX-01", "XX-XX-09"));
  };
  assert.deepEqual(await signInFixture({ ...options, fixture: "buyer" }, port), { fixture: "buyer", status: "signed-in", identityConfirmed: true });
  assert.equal(JSON.parse(port.requests[1][1].body).phone, "+99361000009");
});

test("recognizes Cabinet's real composite signed-out menu label", async () => {
  const port = boundary();
  const originalDevice = port.device;
  port.device = async args => {
    const result = await originalDevice(args);
    return JSON.parse(JSON.stringify(result).replace('"Sign in"', '"Войти, Сохраните избранное и общайтесь"'));
  };
  assert.equal((await signInFixture(options, port)).status, "signed-in");
});

test("waits on fresh native snapshots for verification, with no retry of code entry", async () => {
  const port = boundary();
  const originalDevice = port.device;
  let entered = false;
  let pending = 2;
  const waits = [];
  port.sleep = async value => waits.push(value);
  port.device = async args => {
    if (args[0] === "fill") entered = true;
    if (args[0] === "snapshot" && entered && pending-- > 0) return { nodes: [{ type: "TextField", ref: "e9" }] };
    return originalDevice(args);
  };
  assert.equal((await signInFixture(options, port)).identityConfirmed, true);
  assert.deepEqual(waits, [500, 500]);
  assert.equal(port.actions.filter(([action]) => action === "fill").length, 1);
});

test("bounds a rejected verification without resending or saving raw UI content", async () => {
  const port = boundary();
  const originalDevice = port.device;
  let entered = false;
  let waits = 0;
  port.sleep = async () => waits++;
  port.device = async args => {
    if (args[0] === "fill") entered = true;
    if (args[0] === "snapshot" && entered) return { nodes: [{ type: "TextField", ref: "e9", value: "709814", label: "INVALID_OTP" }] };
    return originalDevice(args);
  };
  await assert.rejects(signInFixture(options, port), /verification did not complete/);
  assert.equal(waits, 10);
  assert.equal(port.actions.filter(([action]) => action === "fill").length, 1);
  assert.equal(port.requests.filter(([url]) => url.endsWith("/otp/request")).length, 1);
});

function keyboardBoundary({ currentOtp = false, wrongReadback = false, missingKey = false, staysOnOtp = false, initialDigits = "", verifiedIdentity = false } = {}) {
  const port = boundary({ currentOtp });
  const original = port.device;
  let digits = initialDigits;
  let generation = 100;
  port.device = async args => {
    if (args[0] === "press") {
      port.actions.push(args);
      assert.match(args[1], new RegExp(`~s${generation}$`));
      digits += "709814"[digits.length];
      return {};
    }
    if (verifiedIdentity && digits.length === 6 && args[1] === "autotm:///services") return original(args);
    if (verifiedIdentity && digits.length === 6 && port.actions.at(-1)?.[1] === "autotm:///services") return { nodes: [{ label: "Aýgül Amanowa" }, { label: "+993 61 XX-XX-01" }] };
    if (args[0] === "snapshot" && (currentOtp || port.actions.some(a => a[1]?.includes("/otp?")))) {
      generation++;
      if (digits.length === 6 && !staysOnOtp) return { nodes: [{ label: "Aýgül Amanowa" }, { label: "+993 61 XX-XX-01" }] };
      return { refsGeneration: generation, nodes: [
        { label: "Enter the code" }, { label: "+993 61 XX-XX-01" }, { type: "Keyboard" },
        ...(digits ? [{ type: "Cell", label: [...(wrongReadback ? "0" : digits)].join(", ") }] : []),
        ...[..."0123456789"].filter(label => !missingKey || label !== "7").map(label => ({ type: "Key", label, ref: `e${10 + Number(label)}`, hittable: true })),
      ] };
    }
    return original(args);
  };
  return port;
}

test("uses fresh semantic native keyboard refs for the transparent OtpCells input", async () => {
  const port = keyboardBoundary();
  assert.equal((await signInFixture(options, port)).status, "signed-in");
  assert.equal(port.actions.filter(([action]) => action === "press").length, 6);
  assert.equal(port.actions.some(([action]) => action === "fill" || action === "type"), false);
});

test("resumes an exact request's matching grouped native digit prefix without retyping it", async () => {
  const port = keyboardBoundary({ currentOtp: true, initialDigits: "70" });
  assert.equal((await signInFixture({ ...options, requestId: ID, requestedAt: new Date(NOW).toISOString() }, port)).status, "verified");
  assert.equal(port.actions.filter(([action]) => action === "press").length, 4);
  assert.equal(port.requests.some(([url]) => url.endsWith("/otp/request")), false);
});

test("confirms native account identity after successful verification leaves the standalone OTP screen mounted", async () => {
  const port = keyboardBoundary({ staysOnOtp: true, verifiedIdentity: true });
  assert.equal((await signInFixture(options, port)).identityConfirmed, true);
  assert.equal(port.actions.filter(([action]) => action === "press").length, 6);
});

for (const failure of [{ wrongReadback: true }, { missingKey: true }]) {
  test(`stops on changed keyboard semantics ${JSON.stringify(failure)} without re-entry or resend`, async () => {
    const port = keyboardBoundary(failure);
    await assert.rejects(signInFixture(options, port), /selector or input readback changed/);
    assert.ok(port.actions.filter(([action]) => action === "press").length <= 1);
    assert.equal(port.requests.filter(([url]) => url.endsWith("/otp/request")).length, 1);
  });
}

test("waits for the OTP screen to leave even when it exposes no editable field", async () => {
  const port = keyboardBoundary({ staysOnOtp: true });
  let waits = 0;
  port.sleep = async () => waits++;
  await assert.rejects(signInFixture(options, port), /verification did not complete/);
  assert.equal(waits, 10);
  assert.equal(port.actions.filter(([action]) => action === "press").length, 6);
});

test("preserves only resumable safe context after a successful request and later UI boundary failure", async () => {
  const port = boundary();
  const original = port.device;
  port.device = async args => {
    if (args[0] === "open" && args[1].includes("/otp?")) throw new Error("709814 token=private-value raw response");
    return original(args);
  };
  let context;
  await assert.rejects(signInFixture(options, port), error => {
    context = error.requestContext;
    assert.deepEqual(context, { requestId: ID, requestedAt: new Date(NOW).toISOString(), fixture: "seller", destination: "+993 61 XX-XX-01" });
    assert.match(error.message, new RegExp(ID));
    assert.doesNotMatch(error.message, /709814|private-value|99361000001|raw response/);
    return true;
  });
  const resumed = boundary({ currentOtp: true });
  assert.equal((await signInFixture({ ...options, ...context }, resumed)).status, "verified");
  assert.equal(resumed.requests.some(([url]) => url.endsWith("/otp/request")), false);
});

test("bounds delayed or missing native OTP readiness without typing or resending", async () => {
  const port = boundary();
  const original = port.device;
  let waits = 0;
  port.sleep = async () => waits++;
  port.device = args => args[0] === "snapshot" && port.actions.some(a => a[1]?.includes("/otp?"))
    ? { nodes: [{ label: "Enter the code" }, { label: "+993 61 XX-XX-01" }] } : original(args);
  await assert.rejects(signInFixture(options, port), /did not become ready/);
  assert.equal(waits, 9);
  assert.equal(port.actions.some(([action]) => ["press", "fill", "type"].includes(action)), false);
  assert.equal(port.requests.filter(([url]) => url.endsWith("/otp/request")).length, 1);
});
