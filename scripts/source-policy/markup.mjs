import { parse as parseHtml } from "parse5";
import { SaxesParser } from "saxes";
import { parseCss } from "./css.mjs";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";

function language(name, attributes, html) {
  const type = (attributes.type ?? "").trim().toLowerCase();
  if (name === "style") return !type && html || type === "text/css" ? "css" : type || "undeclared-style";
  if (name !== "script" || attributes.src) return undefined;
  if (["application/json", "application/ld+json", "importmap", "speculationrules"].includes(type)) return undefined;
  if (!type && html || ["module", "text/javascript", "application/javascript"].includes(type)) return "javascript";
  return type || "undeclared-script";
}

export function parseMarkup({ path, source, fileType, adapters = {} }) {
  if (!["html", "xml"].includes(fileType)) throw new Error(`${path}: expected configured HTML or XML file type`);
  const result = { comments: [], deferred: [] };
  const registry = { css: parseCss, ...adapters };
  const embed = (name, attributes, start, end) => {
    const declared = language(name, attributes, fileType === "html");
    if (!declared || start === end) return;
    const content = source.slice(start, end);
    embeddedResult({ source, content, offsets: Array.from({ length: content.length + 1 }, (_, i) => start + i),
      fileType: declared, path, adapters: registry, result });
  };
  if (fileType === "html") {
    const tree = parseHtml(source, { sourceCodeLocationInfo: true,
      onParseError: (error) => { if (error.code !== "missing-doctype") throw new Error(`${path}: HTML parse failed: ${error.code}`); } });
    const visit = (node) => {
      const loc = node.sourceCodeLocation;
      if (node.nodeName === "#comment") result.comments.push(commentSpan(source, loc.startOffset, loc.endOffset));
      if (["script", "style"].includes(node.tagName) && loc) {
        if (!loc.endTag) throw new Error(`${path}: unterminated embedded ${node.tagName}`);
        embed(node.tagName, Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value])), loc.startTag.endOffset, loc.endTag.startOffset);
      }
      for (const child of node.childNodes ?? []) visit(child);
      if (node.content) visit(node.content);
    };
    visit(tree);
  } else {
    const parser = new SaxesParser({ xmlns: false, position: true });
    const stack = [];
    parser.on("error", (error) => { throw new Error(`${path}: XML parse failed: ${error.message}`); });
    parser.on("comment", () => {
      const end = parser.position + 1;
      const start = source.lastIndexOf("<!--", end);
      result.comments.push(commentSpan(source, start, end));
    });
    parser.on("doctype", (value) => {
      if (value.includes("[")) result.deferred.push({ path, fileType: "dtd",
        startOffset: source.lastIndexOf("<!DOCTYPE", parser.position), endOffset: parser.position,
        reason: "XML internal subset requires DTD adapter" });
    });
    parser.on("opentag", (tag) => stack.push({ tag, start: parser.position }));
    parser.on("closetag", (tag) => {
      const entry = stack.pop();
      if (tag.isSelfClosing || !["script", "style"].includes(tag.name)) return;
      const end = source.lastIndexOf("</", parser.position - 1);
      let start = entry.start;
      let stop = end;
      const content = source.slice(start, stop);
      if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) { start += 9; stop -= 3; }
      else if (content.includes("&") || content.includes("<")) {
        const declared = language(tag.name, entry.tag.attributes, false);
        if (declared) result.deferred.push({ fileType: declared, path, startOffset: start, endOffset: stop, reason: "XML encoded or mixed embedded content" });
        return;
      }
      embed(tag.name, entry.tag.attributes, start, stop);
    });
    parser.write(source).close();
  }
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
