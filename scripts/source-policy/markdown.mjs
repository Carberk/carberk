import { fromMarkdown } from "mdast-util-from-markdown";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";

export function parseMarkdown({ path, source, fileType, adapters = {} }) {
  const result = { comments: [], deferred: [] };
  const deferred = (node, language, reason) => result.deferred.push({ path, fileType: language,
    startOffset: node.position.start.offset, endOffset: node.position.end.offset, reason });
  const tree = fromMarkdown(source);
  const visit = (node) => {
    if (node.type === "code") {
      const language = (node.lang ?? "").toLowerCase();
      if (["text", "plaintext", "txt", "console", "output"].includes(language) || !language && !node.value.trim()) return;
      if (!language) { deferred(node, "undeclared-code", "code block requires a declared language"); return; }
      const raw = source.slice(node.position.start.offset, node.position.end.offset);
      const lines = [...raw.matchAll(/[^\n]*\n|[^\n]+$/g)];
      const fenced = /^(?:`{3,}|~{3,})/.test(raw);
      let content = "";
      const offsets = [];
      const values = node.value.replace(/\r\n/g, "\n").split("\n");
      let lineIndex = fenced ? 1 : 0;
      for (let index = 0; index < values.length; index++, lineIndex++) {
        const line = lines[lineIndex];
        const value = values[index];
        const text = line?.[0].replace(/\r?\n$/, "") ?? "";
        if (!line || !text.endsWith(value)) { deferred(node, language, "code block indentation requires source mapping"); return; }
        const begin = node.position.start.offset + line.index + text.length - value.length;
        for (let column = 0; column < value.length; column++) { content += value[column]; offsets.push(begin + column); }
        if (index < values.length - 1) { content += "\n"; offsets.push(begin + value.length + Number(line[0].endsWith("\r\n"))); }
      }
      offsets.push(offsets.length ? offsets.at(-1) + 1 : node.position.end.offset);
      try {
        const firstComment = result.comments.length;
        embeddedResult({ source, content, offsets, fileType: language, path, result, adapters });
        for (const comment of result.comments.slice(firstComment)) comment.language = language;
      } catch (error) { deferred(node, language, `code block parse failed: ${error.message}`); }
      return;
    }
    if (node.type === "html") {
      const raw = source.slice(node.position.start.offset, node.position.end.offset);
      if (/^<!--[\s\S]*-->$/.test(raw.trim())) {
        const begin = node.position.start.offset + raw.indexOf("<!--");
        result.comments.push(commentSpan(source, begin, begin + raw.trim().length));
      } else {
        const start = node.position.start.offset;
        try {
          embeddedResult({ source, content: raw, offsets: Array.from({ length: raw.length + 1 }, (_, i) => start + i),
            fileType: "html", path, result, adapters });
        } catch (error) { deferred(node, "html", `HTML block parse failed: ${error.message}`); }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
