import assert from "node:assert/strict";
import test from "node:test";
import { parseSql } from "./source-policy/sql.mjs";

test("PostgreSQL comments exclude nested string forms and executable metadata", () => {
  const source = `SELECT 'it''s -- data', E'escaped\\' /* data */', $$-- data$$, $tag$/* data */$tag$, "-- name";
/* outer /* inner */ done */
COMMENT ON TABLE "-- name" IS '/* metadata */'; -- explanation`;
  const result = parseSql({ path: "query", fileType: "sql", source });
  assert.deepEqual(result.comments.map((item) => [item.raw, item.exception]), [
    ["/* outer /* inner */ done */", false], ["-- explanation", false],
  ]);
  assert.deepEqual(result.deferred, []);
});

test("SQL executable bodies and session-dependent quoting expose coverage deferrals", () => {
  for (const source of ["DO $$ BEGIN /* executable */ END $$;",
    "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'SELECT 1 /* executable */';",
    "SET standard_conforming_strings = off;",
    'SET "STANDARD_CONFORMING_STRINGS" = off;',
    "SELECT pg_catalog.set_config('standard_conforming_strings', 'off', false);",
    "SELECT set_config(name, 'off', false);"]) {
    const result = parseSql({ path: "body", source, fileType: "sql" });
    assert.deepEqual(result.comments, []);
    assert.equal(result.deferred.length, 1);
    assert.match(result.deferred[0].reason, /embedded grammar/);
  }
  assert.deepEqual(parseSql({ path: "body", source: "SELECT set_config('other', 'on', false);", fileType: "sql" }).deferred, []);
});

test("PostgreSQL byte offsets become exact UTF-16 comment spans", () => {
  const result = parseSql({ path: "unicode", fileType: "sql", source: "SELECT '🚗';\r\n/* ä */SELECT 1; -- end\r\n" });
  assert.deepEqual(result.comments, [
    { startOffset: 14, endOffset: 21, start: { line: 2, column: 0 }, end: { line: 2, column: 7 }, raw: "/* ä */", exception: false },
    { startOffset: 31, endOffset: 37, start: { line: 2, column: 17 }, end: { line: 2, column: 23 }, raw: "-- end", exception: false },
  ]);
});

test("PostgreSQL malformed syntax and truncated tokens fail closed", () => {
  for (const source of ["SELECT (", "SELECT 'unterminated", "SELECT E'unterminated\\'", "SELECT $tag$unfinished",
    "/* outer /* inner */", "SELECT 1; /*", "*/", "SELECT 1;\0-- hidden"]) {
    assert.throws(() => parseSql({ path: "broken", fileType: "sql", source }), /broken: PostgreSQL parse failed/);
  }
  assert.throws(() => parseSql({ path: "query", source: "SELECT 1", fileType: "mysql" }), /configured PostgreSQL/);
});
