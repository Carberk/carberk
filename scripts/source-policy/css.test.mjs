import assert from "node:assert/strict";
import test from "node:test";
import { parseCss } from "./css.mjs";

test("CSS parser spans preserve quoted URLs and data while finding actual comments", () => {
  const source = 'a { content: "/* literal */"; background: url("data:image/svg+xml,<svg><!--x--></svg>"); } /* explanation */';
  const result = parseCss({ path: "docs/theme", fileType: "css", source });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* explanation */"]);
  assert.equal(result.comments[0].startOffset, 91);
});

test("CSS token offsets exclude following code and include CRLF and Unicode correctly", () => {
  const source = 'a{content:"🚙"}\r\n/* one\r\ntwo */b{}';
  const [comment] = parseCss({ path: "theme", fileType: "css", source }).comments;
  assert.equal(comment.raw, "/* one\r\ntwo */");
  assert.deepEqual(comment.start, { line: 2, column: 0 });
  assert.deepEqual(comment.end, { line: 3, column: 6 });
  assert.equal(comment.exception, false);
});

test("CSS malformed inputs fail and directives do not grant prose exceptions", () => {
  for (const source of ['a{content:"unfinished}', "/* unfinished", "a{color:red", "a{broken}"]) {
    assert.throws(() => parseCss({ path: "docs/theme", fileType: "css", source }));
  }
  const result = parseCss({ path: "theme", fileType: "css", source: "/* stylelint-disable explanation */a{}" });
  assert.equal(result.comments[0].exception, false);
});

test("CSS BOM and unquoted data URL contents retain their exact parser boundaries", () => {
  const source = '\uFEFFa{background:url(data:image/png;base64,abc//def)}/* actual */b{}';
  const [comment] = parseCss({ path: "docs/theme", fileType: "css", source }).comments;
  assert.equal(comment.raw, "/* actual */");
  assert.equal(source.slice(comment.startOffset, comment.endOffset), "/* actual */");
});
