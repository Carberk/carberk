import assert from "node:assert/strict";
import test from "node:test";
import { checkSources } from "../check-source-policy.mjs";
import { inspectSource } from "./index.mjs";

const path = "apps/mobile/modules/example/ios/Example.podspec";

test("a valid podspec passes source policy without running Ruby source", () => {
  const source = [
    'abort "must not run"',
    "Pod::Spec.new do |s|",
    '  s.summary = "🚙 # example #{s.name}"',
    "  s.description = <<~TEXT",
    "    # Example document heading",
    "  TEXT",
    "end",
    "",
  ].join("\n");
  assert.deepEqual(checkSources({ current: new Map([[path, source]]), legacy: new Map(), trusted: new Map() }), []);
});

test("podspec checks retain exact line and block comments with Unicode and CRLF", () => {
  const source = [
    'name = "🚙 # label" # explanation',
    "=begin",
    "Block explanation",
    "=end",
    "",
  ].join("\r\n");
  const result = inspectSource(path, source);
  assert.deepEqual(result.deferred, []);
  assert.deepEqual(result.comments.map(({ raw, start, exception }) => ({ raw, start, exception })), [
    { raw: "# explanation", start: { line: 1, column: 20 }, exception: false },
    { raw: "=begin\r\nBlock explanation\r\n=end", start: { line: 2, column: 0 }, exception: false },
  ]);
  const errors = checkSources({ current: new Map([[path, source]]), legacy: new Map(), trusted: new Map() });
  assert.equal(errors.length, 2);
  assert.ok(errors.every((message) => message.includes("new or moved explanatory comment")));
});

test("incomplete Ruby is refused by source policy", () => {
  const errors = checkSources({ current: new Map([[path, "Pod::Spec.new do |s|\n"]]), legacy: new Map(), trusted: new Map() });
  assert.match(errors[0], /Ruby parse failed/);
});

test("only a first-line Ruby script interpreter is exempt", () => {
  const shebang = "#!/usr/bin/env ruby";
  assert.equal(inspectSource("script.rb", `${shebang}\nputs 1\n`).comments[0].exception, true);
  assert.equal(inspectSource("script.rb", `\n${shebang}\nputs 1\n`).comments[0].exception, false);
  assert.equal(inspectSource(path, `${shebang}\n`).comments[0].exception, false);
});
