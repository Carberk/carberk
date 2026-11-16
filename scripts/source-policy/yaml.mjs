import { Parser, parseAllDocuments, isScalar } from "yaml";
import { parseCss } from "./css.mjs";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";

export function parseYaml({ path, source, fileType, embedded = [], adapters = {} }) {
  if (fileType !== "yaml") throw new Error(`${path}: expected configured YAML file type`);
  const documents = parseAllDocuments(source, { keepSourceTokens: true, strict: true, uniqueKeys: true });
  for (const document of documents) {
    if (document.errors.length) throw new Error(`${path}: YAML parse failed: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const result = { comments: [], deferred: [] };
  const walk = (token) => {
    if (!token || typeof token !== "object") return;
    if (token.type === "comment") result.comments.push(commentSpan(source, token.offset, token.offset + token.source.length));
    for (const value of Object.values(token)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  };
  for (const token of new Parser().parse(source)) walk(token);
  for (const declaration of embedded) {
    const document = documents[declaration.document ?? 0];
    const scalar = document?.getIn(declaration.path, true);
    if (!isScalar(scalar) || typeof scalar.value !== "string") throw new Error(`${path}: declared executable YAML path must be a string scalar`);
    const start = scalar.range[0];
    const end = scalar.range[1];
    if (scalar.type !== "BLOCK_LITERAL") {
      result.deferred.push({ path, fileType: declaration.fileType, startOffset: start, endOffset: end,
        reason: "encoded or folded executable scalar requires source mapping" });
      continue;
    }
    const bodyStart = source.indexOf("\n", start) + 1;
    const raw = source.slice(bodyStart, end);
    const nonempty = raw.split("\n").filter((line) => line.trim());
    const indicator = scalar.srcToken.props.find((token) => token.type === "block-scalar-header")?.source.match(/[1-9]/)?.[0];
    const indent = indicator ? scalar.srcToken.indent + Number(indicator) :
      Math.min(...nonempty.map((line) => line.match(/^ */)[0].length));
    let content = "";
    const offsets = [];
    let cursor = bodyStart;
    for (const line of raw.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      const strip = Math.min(indent, line.match(/^ */)[0].length);
      for (let i = strip; i < line.length; i++) {
        if (line[i] === "\r" && line[i + 1] === "\n") continue;
        offsets.push(cursor + i); content += line[i];
      }
      cursor += line.length;
    }
    if (!content.startsWith(scalar.value)) throw new Error(`${path}: executable scalar source mapping failed`);
    content = scalar.value;
    offsets.length = content.length;
    offsets.push(end);
    embeddedResult({ source, content, offsets, fileType: declaration.fileType, path,
      adapters: { css: parseCss, ...adapters }, result });
  }
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
