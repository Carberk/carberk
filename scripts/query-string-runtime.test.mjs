import assert from "node:assert/strict";
import test from "node:test";

import queryString from "query-string";

test("query-string keeps encoded values compatible through its CJS dependency patch", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(queryString.parse("q=hello%20world&tag=a%2Bb"))),
    { q: "hello world", tag: "a+b" },
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(queryString.parse("q=%26%3D&empty="))),
    { empty: "", q: "&=" },
  );
});

test("query-string preserves malformed percent escapes instead of throwing", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(queryString.parse("q=%E0%A4%A"))),
    { q: "%E0%A4%A" },
  );
});
