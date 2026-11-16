import assert from "node:assert/strict";
import test from "node:test";
import { get_dmmf } from "@prisma/prisma-schema-wasm";
import { parsePrisma } from "./source-policy/prisma.mjs";

test("Prisma fields and annotations preserve string data while exposing docs", () => {
  const source = `/// User docs
model User {
  /// @deprecated use title
  id Int @id
  title String @default("// data") @map("/* column */") // explanation
  @@map("users")
}`;
  const result = parsePrisma({ path: "schema", fileType: "prisma", source });
  assert.deepEqual(result.comments.map((item) => [item.raw, item.exception]), [
    ["/// User docs", false], ["/// @deprecated use title", false], ["// explanation", false],
  ]);
  assert.deepEqual(result.deferred, [
    { path: "schema", fileType: "prisma", startOffset: 0, endOffset: 13, reason: "Prisma documentation affects generated client metadata and types" },
    { path: "schema", fileType: "prisma", startOffset: 29, endOffset: 54, reason: "Prisma documentation affects generated client metadata and types" },
  ]);
});

test("Prisma compiler metadata proves removing docs changes client generation inputs", () => {
  const source = `datasource db {
  provider = "postgresql"
}
/// User documentation
model User {
  /// @deprecated old identifier
  id Int @id
}`;
  const metadata = (text) => JSON.parse(get_dmmf(JSON.stringify({ prismaSchema: text, noColor: true }))).datamodel.models[0];
  const before = metadata(source);
  assert.equal(before.documentation, "User documentation");
  assert.equal(before.fields[0].documentation, "@deprecated old identifier");
  const after = metadata(source.replaceAll(/ *\/\/\/[^\n]*\n/g, ""));
  assert.equal(after.documentation, undefined);
  assert.equal(after.fields[0].documentation, undefined);
  assert.deepEqual(after.fields.map((field) => [field.name, field.type, field.isId]), [["id", "Int", true]]);
});

test("Prisma string escapes, Unicode and CRLF retain exact comment boundaries", () => {
  const source = 'model User {\r\n id Int @id\r\n text String @default("🚗 \\\" // text") // ä\r\n}\r\n';
  const result = parsePrisma({ path: "schema", fileType: "prisma", source });
  assert.deepEqual(result.comments, [{ startOffset: 66, endOffset: 70, start: { line: 3, column: 39 },
    end: { line: 3, column: 43 }, raw: "// ä", exception: false }]);
});

test("Prisma rejects invalid fields, attributes and strings instead of skipping them", () => {
  for (const source of ['model User {', 'model User {\n id @id\n}', 'model User {\n id Int @madeUp\n}',
    'model User {\n id Int @id\n text String @default("unfinished)\n}', '/* unfinished',
    'model User {\n id Int @id\n}\n\0// hidden']) {
    assert.throws(() => parsePrisma({ path: "broken", fileType: "prisma", source }), /broken: Prisma parse failed/);
  }
  assert.throws(() => parsePrisma({ path: "schema", source: "", fileType: "text" }), /configured Prisma/);
});

test("Prisma block comments use the engine's non-nesting grammar", () => {
  const result = parsePrisma({ path: "schema", fileType: "prisma", source: '/* outer /* inner */\nmodel User {\n id Int @id\n}' });
  assert.deepEqual(result.comments.map((item) => item.raw), ["/* outer /* inner */"]);
  assert.deepEqual(result.deferred, []);
  assert.throws(() => parsePrisma({ path: "schema", fileType: "prisma", source: "/* outer /* inner */ done */" }), /Prisma parse failed/);
});
