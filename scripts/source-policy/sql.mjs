import { loadModule, parseSync, scanSync } from "libpg-query";
import { commentSpan } from "./markup-spans.mjs";

await loadModule();

export function parseSql({ path, source, fileType }) {
  if (fileType !== "sql") throw new Error(`${path}: expected configured PostgreSQL file type`);
  try {
    if (/\r(?!\n)/.test(source)) throw new Error("standalone CR requires source mapping");
    const tree = parseSync(source);
    const bytes = Buffer.from(source);
    const offset = (value) => bytes.subarray(0, value).toString().length;
    const deferred = tree.stmts.filter(({ stmt }) => stmt.DoStmt || stmt.CreateFunctionStmt?.options?.some((item) => item.DefElem?.defname === "as") ||
      stmt.VariableSetStmt?.name === "standard_conforming_strings").map((statement) => ({ path, fileType,
      startOffset: offset(statement.stmt_location ?? 0), endOffset: statement.stmt_len ? offset((statement.stmt_location ?? 0) + statement.stmt_len) : source.length,
      reason: "SQL executable bodies or session string settings require a declared embedded grammar" }));
    return { comments: scanSync(source).tokens.filter((token) => ["SQL_COMMENT", "C_COMMENT"].includes(token.tokenName))
      .map((token) => commentSpan(source, offset(token.start), offset(token.end))), deferred };
  } catch (error) {
    throw new Error(`${path}: PostgreSQL parse failed: ${error.message}`);
  }
}
