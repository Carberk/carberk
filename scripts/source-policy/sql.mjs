import { loadModule, parseSync, scanSync } from "libpg-query";
import { commentSpan } from "./markup-spans.mjs";

await loadModule();

const changesStringMode = (node) => {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(changesStringMode);
  if (node.FuncCall?.funcname?.at(-1)?.String?.sval?.toLowerCase() === "set_config") {
    const setting = node.FuncCall.args?.[0]?.A_Const?.sval?.sval;
    if (typeof setting !== "string" || setting.toLowerCase() === "standard_conforming_strings") return true;
  }
  return Object.values(node).some(changesStringMode);
};

export function parseSql({ path, source, fileType }) {
  if (fileType !== "sql") throw new Error(`${path}: expected configured PostgreSQL file type`);
  try {
    if (/\r(?!\n)/.test(source)) throw new Error("standalone CR requires source mapping");
    const tree = parseSync(source);
    const bytes = Buffer.from(source);
    const offset = (value) => bytes.subarray(0, value).toString().length;
    const deferred = tree.stmts.filter(({ stmt }) => stmt.DoStmt || stmt.CreateFunctionStmt?.options?.some((item) => item.DefElem?.defname === "as") ||
      stmt.VariableSetStmt?.name?.toLowerCase() === "standard_conforming_strings" || changesStringMode(stmt)).map((statement) => ({ path, fileType,
      startOffset: offset(statement.stmt_location ?? 0), endOffset: statement.stmt_len ? offset((statement.stmt_location ?? 0) + statement.stmt_len) : source.length,
      reason: "SQL executable bodies or session string settings require a declared embedded grammar" }));
    return { comments: scanSync(source).tokens.filter((token) => ["SQL_COMMENT", "C_COMMENT"].includes(token.tokenName))
      .map((token) => commentSpan(source, offset(token.start), offset(token.end))), deferred };
  } catch (error) {
    throw new Error(`${path}: PostgreSQL parse failed: ${error.message}`);
  }
}
