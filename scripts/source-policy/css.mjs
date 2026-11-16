import postcss from "postcss";
import tokenize from "postcss/lib/tokenize";
import { commentSpan } from "./markup-spans.mjs";

export function parseCss({ path, source, fileType }) {
  if (fileType !== "css") throw new Error(`${path}: expected configured CSS file type`);
  const ast = postcss.parse(source, { from: path });
  const input = ast.source.input;
  const tokenizer = tokenize(input);
  const comments = [];
  while (!tokenizer.endOfFile()) {
    const token = tokenizer.nextToken();
    if (token?.[0] === "comment") comments.push(commentSpan(source,
      token[2] + Number(input.hasBOM), token[3] + 1 + Number(input.hasBOM)));
  }
  return { comments, deferred: [] };
}
