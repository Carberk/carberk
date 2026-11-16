import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { Parser, Language } from "web-tree-sitter";
import { parseNative } from "./source-policy/native.mjs";

test("Kotlin finds complete nested comments and interpolation comments while strings stay data", () => {
  const source = 'val s = "// data ${ /* expression */ 1 }"\nval raw = """/* data */\n${ "// value" }"""\n/* outer /* inner */ done */\n// end';
  const result = parseNative({ path: "sample.kt", fileType: "kotlin", source });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* expression */", "/* outer /* inner */ done */", "// end"]);
  assert.deepEqual(result.deferred, []);
});

test("Kotlin Gradle preserves plugin declarations, annotations, characters and nested templates", () => {
  const source = '@file:Suppress("unused")\nplugins { kotlin("android") version "2.0.0" }\nval c = \'/\'\nval s = "${ run { /* first */ "${ /* second */ 2 }" } }"\n/* outer /* inner */ end */';
  const result = parseNative({ path: "build.gradle.kts", source, fileType: "gradle", dialect: "kotlin" });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* first */", "/* second */", "/* outer /* inner */ end */"]);
  assert.deepEqual(result.deferred, []);
});

test("Swift separates raw, multiline and nested string interpolation from literal comment text", () => {
  const source = 'let s = #"/* raw */ \\#( /* raw expression */ "// data" )"#\nlet m = """\n/* text */ \\( /* expression */ "/* nested text */ \\( /* nested */ 1 )" )\n"""\nlet raw = #"""\n/* raw multiline */\n"""#\n/* outer /* inner */ end */';
  const result = parseNative({ path: "sample.swift", source, fileType: "swift" });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* raw expression */", "/* expression */", "/* nested */", "/* outer /* inner */ end */"]);
  assert.deepEqual(result.deferred, []);
});

test("Swift bare and extended regex delimiters stay data alongside division and actual comments", () => {
  const source = 'let bare = /[a-z]+/\nlet extended = #/ a//b /* literal */ /#\nlet n = 6 / 2 /* real */\n// end';
  const result = parseNative({ path: "regex.swift", source, fileType: "swift" });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* real */", "// end"]);
  assert.deepEqual(result.deferred, []);
});

test("Swift compiler attributes and conditional compilation keep their meaning without exempting prose", () => {
  const source = '#if DEBUG\n@available(iOS 15, *)\n@MainActor\nfunc value() -> String { "/* data */" }\n#else\nfunc value() -> String { "// data" }\n#endif\n// @available(iOS 15, *) explanation';
  const result = parseNative({ path: "attributes.swift", source, fileType: "swift" });
  assert.deepEqual(result.comments.map((item) => [item.raw, item.exception]), [["// @available(iOS 15, *) explanation", false]]);
  assert.deepEqual(result.deferred, []);
});

test("Groovy Gradle covers six string forms, command calls and comments in GString expressions", () => {
  const source = `plugins { id 'com.android.library' }
def single = '/* single */'
def double = "// double \${ /* expression */ 1 }"
def tripleSingle = '''// multiline
/* literal */'''
def tripleDouble = """// multiline
\${ /* multiline expression */ "/* inner data */" }"""
def slashy = /a\\/b/
def dollarSlashy = $/a//b /* literal */ /$
dependencies { implementation "group:artifact:\${version}" }
/**
 * @param value documentation
 */
def f(value) { value }
// end`;
  const result = parseNative({ path: "build.gradle", source, fileType: "gradle", dialect: "groovy" });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* expression */", "/* multiline expression */", "/**\n * @param value documentation\n */", "// end"]);
  assert.deepEqual(result.deferred, []);
});

for (const [fileType, dialect, declaration] of [["kotlin", undefined, "val"], ["swift", undefined, "let"],
  ["gradle", "kotlin", "val"], ["gradle", "groovy", "def"]]) {
  test(`${fileType}/${dialect ?? "native"} reports UTF-16 spans without consuming BOM, Unicode or CRLF bytes`, () => {
    const source = `\uFEFF${declaration} s = "🚗 // data"\r\n/* ä */\r\n${declaration} n = 1 // end\r\n`;
    const result = parseNative({ path: "unicode", source, fileType, dialect });
    assert.deepEqual(result.comments, [
      { startOffset: 23, endOffset: 30, start: { line: 2, column: 0 }, end: { line: 2, column: 7 }, raw: "/* ä */", exception: false },
      { startOffset: 42, endOffset: 48, start: { line: 3, column: 10 }, end: { line: 3, column: 16 }, raw: "// end", exception: false },
    ]);
    assert.deepEqual(result.deferred, []);
    let preserved = source;
    for (const span of result.comments.toReversed()) {
      preserved = preserved.slice(0, span.startOffset) + preserved.slice(span.endOffset);
    }
    assert.equal(preserved, `\uFEFF${declaration} s = "🚗 // data"\r\n\r\n${declaration} n = 1 \r\n`);
  });

  test(`${fileType}/${dialect ?? "native"} fails closed for malformed syntax and unclosed comment delimiters`, () => {
    for (const source of ["/* unclosed", `${declaration} x = 1\n/* unclosed`, `${declaration} x =`,
      `${declaration} x = "unterminated`, ...(dialect === "groovy" ? [] : ["/* outer /* inner */"]), "*/", `${declaration} x = 1\n/*`]) {
      assert.throws(() => parseNative({ path: "broken", source, fileType, dialect }), /broken:.*parse failed/);
    }
  });
}

test("undeclared Gradle dialects and unrelated grammars visibly fail", () => {
  for (const [fileType, dialect] of [["gradle", undefined], ["gradle", "swift"], ["gradle", "java"], ["groovy", undefined], ["java", undefined]]) {
    assert.throws(() => parseNative({ path: "unknown", source: "// explanation", fileType, dialect }), /unsupported native\/Gradle grammar/);
  }
});

test("Groovy rejects nested block comments instead of inventing Kotlin semantics", () => {
  assert.throws(() => parseNative({ path: "build.gradle", source: "/* outer /* inner */ done */", fileType: "gradle", dialect: "groovy" }), /parse failed/);
});

test("Groovy Unicode translation and standalone CR expose explicit source coverage deferrals", () => {
  const unicode = parseNative({ path: "build.gradle", fileType: "gradle", dialect: "groovy", source: "\\u002f\\u002f explanation" });
  assert.deepEqual(unicode, { comments: [], deferred: [{ path: "build.gradle", fileType: "gradle", startOffset: 0, endOffset: 24,
    reason: "Groovy Unicode escape translation requires compiler source mapping" }] });
  const cr = parseNative({ path: "cr.swift", fileType: "swift", source: "// a\rlet n = 1" });
  assert.deepEqual(cr, { comments: [], deferred: [{ path: "cr.swift", fileType: "swift", startOffset: 0, endOffset: 14,
    reason: "native grammar requires CRLF or LF line endings" }] });
});

test("valid syntax outside the pinned grammars fails instead of yielding a clean inventory", () => {
  for (const [fileType, dialect, source] of [
    ["swift", undefined, 'let pattern = #/\n a // literal\n b /* literal */\n/#'],
    ["swift", undefined, 'let pattern = /a\\/b/'],
    ["gradle", "groovy", "/** single-line documentation */"],
  ]) assert.throws(() => parseNative({ path: "unsupported", source, fileType, dialect }), /unsupported:.*parse failed/);
});

test("native script interpreter declarations remain visible until executable provenance is supplied", () => {
  for (const fileType of ["kotlin", "swift"]) {
    const result = parseNative({ path: "script", fileType, source: "#!/usr/bin/env swift\n// explanation" });
    assert.deepEqual(result.comments.map((item) => item.raw), ["// explanation"]);
    assert.deepEqual(result.deferred, [{ path: "script", fileType, startOffset: 0, endOffset: 20,
      reason: "native script interpreter requires executable provenance" }]);
  }
});

test("comment spans preserve literal bytes, token boundaries and non-comment grammar when masked", async () => {
  const require = createRequire(import.meta.url);
  const files = {
    kotlin: require.resolve("@lumis-sh/wasm-kotlin/tree-sitter-kotlin.wasm"),
    swift: require.resolve("@lumis-sh/wasm-swift/tree-sitter-swift.wasm"),
    groovy: require.resolve("@lumis-sh/wasm-groovy/tree-sitter-groovy.wasm"),
  };
  for (const [fileType, dialect, source, expected] of [
    ["kotlin", undefined, 'val x = 1/* gap */+2\nval s = "// literal ${ /* expression */ 3 }"',
      'val x = 1         +2\nval s = "// literal ${                  3 }"'],
    ["swift", undefined, 'let x = 1/* gap */+2\nlet s = "// literal \\( /* expression */ 3 )"',
      'let x = 1         +2\nlet s = "// literal \\(                  3 )"'],
    ["gradle", "groovy", 'def x = 1/* gap */+2\ndef s = "// literal ${ /* expression */ 3 }"',
      'def x = 1         +2\ndef s = "// literal ${                  3 }"'],
  ]) {
    const result = parseNative({ path: "semantics", source, fileType, dialect });
    let masked = source;
    for (const span of result.comments.toReversed()) {
      masked = masked.slice(0, span.startOffset) + span.raw.replace(/[^\r\n]/g, " ") + masked.slice(span.endOffset);
    }
    assert.equal(masked, expected);
    const parser = new Parser();
    const grammar = fileType === "gradle" ? dialect : fileType;
    parser.setLanguage(await Language.load(files[grammar]));
    const before = parser.parse(source);
    const after = parser.parse(masked);
    const structure = (node) => node.isExtra ? undefined : [node.type,
      node.childCount ? node.children.map(structure).filter(Boolean) : node.text];
    try {
      assert.equal(before.rootNode.hasError, false);
      assert.equal(after.rootNode.hasError, false);
      assert.deepEqual(structure(after.rootNode), structure(before.rootNode));
    } finally {
      before.delete();
      after.delete();
      parser.delete();
    }
  }
});
