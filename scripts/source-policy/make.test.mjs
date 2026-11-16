import assert from "node:assert/strict";
import test from "node:test";
import { parseMake } from "./make.mjs";

test("Make comments and separate recipe shells retain boundaries and source positions", () => {
  const source = 'VALUE = data\\#hash # make\nSHELL := /bin/bash\n.SHELLFLAGS := -eo pipefail -c\nall: ; @echo "# inline" # inline comment\n\t@for item in one; do \\\n\t echo "$$item # data"; \\\n\tdone # loop\n# between\n\t@echo ok # recipe\n';
  const result = parseMake({ path: "Makefile", source, fileType: "make" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# make", "# inline comment", "# loop", "# between", "# recipe"]);
  assert.deepEqual(result.deferred, []);
  for (const item of result.comments) assert.equal(source.slice(item.startOffset, item.endOffset), item.raw);
});

test("Make shell boundaries reject a block split across distinct recipe invocations", () => {
  assert.throws(() => parseMake({ path: "Makefile", source: "all:\n\tif true; then\n\techo ok; fi\n", fileType: "make" }), /shell parse failed/);
  assert.deepEqual(parseMake({ path: "Makefile", source: "all:\n\tprintf '%s' \"$$(echo ok)\" # nested\n", fileType: "make" }).deferred.length, 0);
});

test("Make expansion, include and recipe modes cannot become a silent pass", () => {
  for (const source of [
    "all:\n\techo $(VALUE)\n", "VALUE := $(shell touch /tmp/never-executed)\n", "include other.mk\n",
    "define SCRIPT\n# payload\nendef\n", ".ONESHELL:\nall:\n\techo ok\n", ".RECIPEPREFIX := >\nall:\n>echo ok\n",
    "SHELL := /bin/fish\nall:\n\techo ok\n", ".SHELLFLAGS := -n\nall:\n\techo ok\n",
  ]) assert.ok(parseMake({ path: "Makefile", source, fileType: "make" }).deferred.length, source);
  for (const source of ["\techo ok\n", "not a Make statement\n", "all:\n\techo ok \\\n"]) {
    assert.throws(() => parseMake({ path: "Makefile", source, fileType: "make" }), /Make/, source);
  }
});

test("Make quotes do not hide Make comments and escaped hashes remain values", () => {
  const result = parseMake({ path: "Makefile", source: 'VALUE = "data # comment"\nESCAPED = data\\#hash\n# continued \\\nmore comment\nall:\n\techo "# data"\n', fileType: "make" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ['# comment"', '# continued \\\nmore comment']);
  assert.deepEqual(result.deferred, []);
});
