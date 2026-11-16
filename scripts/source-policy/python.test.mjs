import assert from "node:assert/strict";
import test from "node:test";
import { parsePython } from "./python.mjs";

test("configured Python under docs preserves literals and docstrings and returns exact comments", () => {
  const source = '"""# runtime documentation"""\r\nvalue = "🚙 # literal" # explanation\r\n';
  const result = parsePython({ path: "docs/tool", fileType: "python", source });
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].raw, "# explanation");
  assert.deepEqual(result.comments[0].start, { line: 2, column: 23 });
  assert.equal(result.comments[0].exception, false);
  assert.deepEqual(result.deferred, []);
});

test("only executable configured Python accepts a first-position interpreter", () => {
  for (const [source, executable, accepted] of [
    ["#!/usr/bin/env python3\nprint(1)\n", true, true],
    ["#!/usr/bin/env python3\nprint(1)\n", false, false],
    ["\n#!/usr/bin/env python3\nprint(1)\n", true, false],
    ["#!/usr/bin/env python3 explanation\nprint(1)\n", true, false],
    ["#!/usr/bin/env python3\r\nprint(1)\r\n", true, false],
  ]) assert.equal(parsePython({ path: "docs/tool", fileType: "python", source, executable }).comments[0].exception, accepted);
  assert.throws(() => parsePython({ path: "tool.py", fileType: "text", source: "pass" }), /configured Python/);
});

test("encoding declarations and compiler-consumed type comments retain their semantics", () => {
  for (const source of [
    "# coding: utf-8\nvalue = 1\n",
    "#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\nvalue = 1\n",
    "value = [] # type: list[int]\n",
    "def identity(value):\n    # type: (int) -> int\n    return value\n",
    "value = unknown # type: ignore[name-defined]\n",
  ]) assert.ok(parsePython({ path: "tool", fileType: "python", executable: true, source }).comments.every((item) => item.exception), source);
  for (const source of [
    "value = 1\n# coding: utf-8\n",
    "# coding: utf-8 explanation\nvalue = 1\n",
    "# type: ignore explanation\nvalue = 1\n",
    "value = 1 # noqa: explanation\n",
    "value = 1 # type: int explanation\n",
  ]) assert.ok(parsePython({ path: "tool", fileType: "python", source }).comments.some((item) => !item.exception), source);
});

test("Python syntax and tokenizer failures reject incomplete and malformed input", () => {
  for (const source of ['value = "unfinished', "def broken(:\n pass", "value = (", "value = $", '"""unfinished']) {
    assert.throws(() => parsePython({ path: "docs/broken", fileType: "python", source }), /Python parse failed/);
  }
});

test("Python string line separators do not change tokenizer line offsets", () => {
  const result = parsePython({ path: "docs/tool", fileType: "python", source: 'value = "a\u2028b\u0085c" # explanation\n' });
  assert.equal(result.comments[0].raw, "# explanation");
  assert.deepEqual(result.comments[0].start, { line: 1, column: 16 });
});
