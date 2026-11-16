import { lint } from "@prisma/prisma-schema-wasm";
import { commentSpan } from "./markup-spans.mjs";

export function parsePrisma({ path, source, fileType }) {
  if (fileType !== "prisma") throw new Error(`${path}: expected configured Prisma file type`);
  if (/\r(?!\n)/.test(source)) throw new Error(`${path}: Prisma parse failed: standalone CR requires source mapping`);
  const diagnostics = JSON.parse(lint(JSON.stringify([[path, source]]))).filter((item) => !item.is_warning);
  if (diagnostics.length) throw new Error(`${path}: Prisma parse failed: ${diagnostics.map((item) => item.text).join("; ")}`);
  const result = { comments: [], deferred: [] };
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '"') {
      while (++index < source.length && source[index] !== '"') if (source[index] === "\\") index++;
      if (index >= source.length) throw new Error(`${path}: Prisma parse failed: unterminated string`);
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) throw new Error(`${path}: Prisma parse failed: unterminated comment`);
      result.comments.push(commentSpan(source, index, end + 2));
      index = end + 1;
    } else if (source.startsWith("//", index)) {
      const start = index;
      while (index < source.length && !/[\r\n]/.test(source[index])) index++;
      result.comments.push(commentSpan(source, start, index));
      if (source.startsWith("///", start)) result.deferred.push({ path, fileType, startOffset: start, endOffset: index,
        reason: "Prisma documentation affects generated client metadata and types" });
      index--;
    }
  }
  return result;
}
