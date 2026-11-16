import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "@babel/parser";
import { parseMarkup } from "./markup.mjs";
import { parseCss } from "./css.mjs";
import { commentSpan } from "./markup-spans.mjs";

export const adapters = {
  css: parseCss,
  javascript: ({ source }) => ({ comments: parse(source, { sourceType: "unambiguous" }).comments.map((item) =>
    commentSpan(source, item.start, item.end)), deferred: [] }),
};

test("HTML host comments and declared JS/CSS use grammar spans while JSX-like strings stay data", () => {
  const source = '<!DOCTYPE html><template><!-- host --><script>const x = "<div><!--literal--></div>"; // script\n</script><style>a{content:"/*literal*/"}/*style*/</style></template>';
  const result = parseMarkup({ path: "docs/example", source, fileType: "html", adapters });
  assert.deepEqual(result.comments.map((item) => item.raw), ["<!-- host -->", "// script", "/*style*/"]);
  assert.deepEqual(result.deferred, []);
});

test("XML declarations, doctypes and processing instructions remain grammar while comments are found", () => {
  const source = '<?xml version="1.0"?><!DOCTYPE root><root><?xml-stylesheet href="theme.css"?><!-- host --><script type="text/javascript"><![CDATA[const s="<!--data-->"; /* embedded */]]></script></root>';
  const result = parseMarkup({ path: "docs/sample", fileType: "xml", source, adapters });
  assert.deepEqual(result.comments.map((item) => item.raw), ["<!-- host -->", "/* embedded */"]);
  assert.deepEqual(result.deferred, []);
});

test("HTML payloads stay data and absent adapters or unsupported declarations expose coverage gaps", () => {
  const source = '<script type="application/json">{"value":"<!--literal--> // data"}</script><script>// js\n</script><style type="text/less">/* less */</style>';
  const result = parseMarkup({ path: "docs/payload", fileType: "html", source });
  assert.deepEqual(result.comments, []);
  assert.deepEqual(result.deferred.map((item) => item.fileType), ["javascript", "text/less"]);
  assert.equal(parseMarkup({ path: "page", fileType: "html", source: '<script src="app.js"></script>' }).deferred.length, 0);
});

test("malformed HTML and XML fail before a clean comment inventory can escape", () => {
  for (const [fileType, source] of [
    ["html", "<!--unfinished"], ["html", "<script>const x = 1"],
    ["html", '<a value="unfinished'], ["xml", "<root><child></root>"],
    ["xml", "<root><!--unfinished</root>"], ["xml", "<root>&invalid;</root>"],
  ]) assert.throws(() => parseMarkup({ path: "docs/broken", fileType, source, adapters }));
});

test("nested JavaScript syntax errors remain failures and XML escaped programs stay deferred", () => {
  assert.throws(() => parseMarkup({ path: "page", fileType: "html", source: "<script>const x = ;</script>", adapters }));
  const result = parseMarkup({ path: "page", fileType: "xml", source: '<root><script type="text/javascript">const x = &quot;data&quot;;</script></root>', adapters });
  assert.equal(result.deferred[0].reason, "XML encoded or mixed embedded content");
});

test("adjacent XML host comments each retain their complete delimiters", () => {
  const result = parseMarkup({ path: "docs/sample", fileType: "xml", source: "<root><!-- first --><!-- second --></root>" });
  assert.deepEqual(result.comments.map((item) => item.raw), ["<!-- first -->", "<!-- second -->"]);
});
