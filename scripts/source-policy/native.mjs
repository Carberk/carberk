import { createRequire } from "node:module";
import { Parser, Language } from "web-tree-sitter";
import { commentSpan } from "./markup-spans.mjs";

const require = createRequire(import.meta.url);
const grammarFiles = {
  kotlin: require.resolve("@lumis-sh/wasm-kotlin/tree-sitter-kotlin.wasm"),
  swift: require.resolve("@lumis-sh/wasm-swift/tree-sitter-swift.wasm"),
  groovy: require.resolve("@lumis-sh/wasm-groovy/tree-sitter-groovy.wasm"),
};
await Parser.init();
const grammars = new Map(await Promise.all(Object.entries(grammarFiles).map(async ([name, file]) => [name,
  await Language.load(file)])));
const commentTypes = {
  kotlin: new Set(["line_comment", "multiline_comment"]),
  swift: new Set(["comment", "multiline_comment"]),
  groovy: new Set(["comment", "groovy_doc"]),
};
const literalTypes = new Set(["string_content", "character_literal", "regex_literal", "raw_str_part", "raw_str_end_part",
  "line_str_text", "multi_line_str_text", "str_escaped_char", "escape_sequence"]);

function children(node, grammar) {
  if (grammar === "swift" && ["line_string_literal", "multi_line_string_literal"].includes(node.type)) {
    let interpolation = false;
    return node.children.filter((child) => {
      if (child.type === "\\(") { interpolation = true; return false; }
      if (child.type === ")") { interpolation = false; return false; }
      return interpolation;
    });
  }
  return node.children;
}

export function parseNative({ path, source, fileType, dialect }) {
  const grammar = fileType === "gradle" ? dialect : fileType;
  if (!["kotlin", "swift", "gradle"].includes(fileType) ||
    fileType === "gradle" && !["kotlin", "groovy"].includes(dialect)) {
    throw new Error(`${path}: unsupported native/Gradle grammar ${fileType}/${dialect ?? "undeclared"}`);
  }
  const result = { comments: [], deferred: [] };
  if (/\r(?!\n)/.test(source)) {
    result.deferred.push({ path, fileType, startOffset: 0, endOffset: source.length,
      reason: "native grammar requires CRLF or LF line endings" });
    return result;
  }
  if (grammar === "groovy" && /\\u[0-9a-fA-F]{4}/.test(source)) {
    result.deferred.push({ path, fileType, startOffset: 0, endOffset: source.length,
      reason: "Groovy Unicode escape translation requires compiler source mapping" });
    return result;
  }
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(grammars.get(grammar));
    tree = parser.parse(source);
    if (!tree) throw new Error(`${path}: ${grammar} parse did not complete`);
    if (tree.rootNode.hasError) throw new Error(`${path}: ${grammar} parse failed (unsupported or invalid syntax)`);
    const pending = [tree.rootNode];
    while (pending.length) {
      const node = pending.pop();
      if (commentTypes[grammar].has(node.type)) {
        const end = node.text.startsWith("//") && source[node.endIndex - 1] === "\r" ? node.endIndex - 1 : node.endIndex;
        result.comments.push(commentSpan(source, node.startIndex, end));
      } else if (["shebang", "shebang_line"].includes(node.type)) {
        result.deferred.push({ path, fileType, startOffset: node.startIndex, endOffset: node.endIndex,
          reason: "native script interpreter requires executable provenance" });
      } else if (!literalTypes.has(node.type)) {
        if (!node.childCount && /^(?:\/\*|\*\/|\/\/)/.test(source.slice(node.startIndex, node.startIndex + 2))) {
          throw new Error(`${path}: ${grammar} parse failed (unrecognized comment delimiter at ${node.startIndex})`);
        }
        pending.push(...children(node, grammar).reverse());
      }
    }
    return result;
  } finally {
    tree?.delete();
    parser.delete();
  }
}
