import postcss from "postcss";
import { commentSpan } from "./markup-spans.mjs";

export function parseCss({ path, source, fileType }) {
  if (fileType !== "css") throw new Error(`${path}: expected configured CSS file type`);
  const ast = postcss.parse(source, { from: path });
  const comments = [];
  ast.walkComments((node) => comments.push(commentSpan(source, node.source.start.offset + Number(node.source.input.hasBOM), node.source.end.offset + Number(node.source.input.hasBOM))));
  return { comments, deferred: [] };
}
