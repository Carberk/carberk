import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { b5ObservationPlugin } from "./b5-observation-plugin.mjs";
import { begin, close, emitFrozen, observeCase, observeOuter, step } from "./b5-observation-runtime.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pluginSource = readFileSync(new URL("./b5-observation-plugin.mjs", import.meta.url), "utf8");
const declarations = JSON.parse(pluginSource.slice(pluginSource.indexOf("const modules = [") + "const modules = ".length, pluginSource.indexOf("].map(entry") + 1));
const runtimeId = fileURLToPath(new URL("./b5-observation-runtime.mjs", import.meta.url));
const runtimeImport = `import { observeCase as __b5ObserveCase, observeOuter as __b5ObserveOuter, emitFrozen as __b5EmitFrozen, begin as __b5Begin, step as __b5Step, close as __b5Close } from ${JSON.stringify(runtimeId)};\n`;

test("the actual transform retains every original byte and refuses changed source or alternate identities", () => {
  const plugin = b5ObservationPlugin();
  for (const entry of declarations) {
    const id = fileURLToPath(new URL(entry.file, import.meta.url));
    const original = readFileSync(id);
    assert.equal(digest(original), entry.sha256);
    const transformed = Buffer.from(plugin.transform(original.toString("utf8"), id).code);
    const insertions = [...entry.insertions].sort((a, b) => a.offset - b.offset);
    let added = 0;
    const spans = insertions.map(insertion => {
      const bytes = Buffer.from(insertion.text ?? runtimeImport);
      const offset = insertion.offset + added;
      added += bytes.length;
      assert.deepEqual(transformed.subarray(offset, offset + bytes.length), bytes);
      return { offset, bytes };
    });
    let reconstructed = transformed;
    for (const span of spans.reverse()) reconstructed = Buffer.concat([reconstructed.subarray(0, span.offset), reconstructed.subarray(span.offset + span.bytes.length)]);
    assert.deepEqual(reconstructed, original);
    assert.throws(() => plugin.transform(original + "\n", id), /B5_OBSERVATION_SOURCE_ANCHOR_OR_ID_MISMATCH/);
    for (const alternate of [id + "?query", id + "#hash", "file://" + id, "/@fs/" + id, id.replace(/\.ts$/, ".js"), entry.file]) {
      assert.throws(() => plugin.transform(original.toString("utf8"), alternate), /B5_OBSERVATION_SOURCE_ANCHOR_OR_ID_MISMATCH/);
    }
    process.stdout.write(`${JSON.stringify({ file: entry.file, original: entry.sha256, transformed: digest(transformed), reconstructed: digest(reconstructed), insertions: insertions.length })}\n`);
  }
  const config = readFileSync(new URL("../vitest.config.mts", import.meta.url), "utf8");
  const originalConfig = config.replace('\nimport { b5ObservationPlugin } from "./test/b5-observation-plugin.mjs";\n', "").replace('  plugins: [b5ObservationPlugin()],\n', "");
  assert.equal(digest(originalConfig), "3a2a5df706d50b5d4c8be9853448577778458cedd68f23e9a4dbba1eaed6d6f8");
});

test("failure freezes active work once, preserves the rejection, and ignores late completion", async () => {
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = value => { writes.push(value); return true; };
  const reason = new Error("original failure");
  let state, frame;
  try {
    await assert.rejects(observeCase("tk", async observation => {
      state = observation;
      observeOuter("ordinary-drain");
      frame = begin("render-layout");
      step(frame, "render-save");
      emitFrozen(state, "failure");
      close(frame, false);
      observeOuter("maintenance");
      emitFrozen(state, "failure");
      throw reason;
    }), error => error === reason);
  } finally { process.stderr.write = originalWrite; }
  assert.equal(writes.length, 1);
  const record = JSON.parse(writes[0].slice("[b5-hosted-observation] ".length));
  assert.equal(record.outcome, "failure");
  assert.equal(record.invalid, false);
  assert.equal(record.outerActiveName, "ordinary-drain");
  assert.equal(record.inner["render-layout"].completed, 1);
  assert.equal(record.inner["render-save"].started, 1);
  assert.equal(record.inner["render-save"].completed, 0);
  assert.equal(record.inner["render-save"].completedMs, 0);
  assert.deepEqual(record.active.map(item => item.name), ["render-save"]);
  assert.equal(state.inner["render-save"].completed, 0);
});

test("success records all fresh work and incomplete success is invalid evidence", async () => {
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = value => { writes.push(value); return true; };
  try {
    const result = await observeCase("ru", async () => {
      for (let index = 0; index < 10; index++) {
        const frame = begin("render-create");
        for (const name of ["render-fonts", "render-layout", "render-save"]) step(frame, name);
        close(frame, false);
      }
      for (let index = 0; index < 4; index++) {
        const frame = begin("parse-load");
        for (let page = 0; page < 3; page++) {
          step(frame, "parse-font-maps");
          step(frame, "parse-content");
        }
        close(frame, false);
      }
      observeOuter("ordinary-drain");
      return 42;
    });
    assert.equal(result, 42);
    await observeCase("en", async () => observeOuter("ordinary-drain"));
  } finally { process.stderr.write = originalWrite; }
  assert.equal(writes.length, 2);
  const [success, incomplete] = writes.map(value => JSON.parse(value.slice("[b5-hosted-observation] ".length)));
  assert.equal(success.invalid, false);
  assert.equal(success.outerActiveName, null);
  assert.deepEqual(success.active, []);
  assert.equal(success.inner["render-save"].completed, 10);
  assert.equal(success.inner["parse-load"].completed, 4);
  assert.equal(success.inner["parse-content"].completed, 12);
  assert.equal(incomplete.invalid, true);
});
