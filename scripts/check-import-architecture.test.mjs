import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkRepository } from "./check-import-architecture.mjs";

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "carberk-imports-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
  };
  put("package.json", { private: true, workspaces: ["apps/*", "packages/*"] });
  put("apps/api/package.json", { name: "@auto-tm/api", dependencies: { "@nestjs/common": "*" } });
  put("apps/api/tsconfig.json", { compilerOptions: { module: "CommonJS", moduleResolution: "Bundler", paths: { "@/*": ["./src/*"] } } });
  for (const [path, value] of Object.entries(files)) put(path, value);
  return { root, put, check: (allowances = []) => checkRepository(root, { allowances }) };
}

test("domain rejects framework imports through effective aliases and type-only barrels", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/domain/Rule.ts": 'import type { Nest } from "@/bridge";',
    "apps/api/src/bridge.ts": 'export type { Nest } from "@nestjs/common";',
  });
  assert.ok(f.check().errors.some(e => e.rule === "domain-purity" && e.importer.endsWith("Rule.ts")));
});

for (const [label, declaration] of [
  ["alias", 'import { Adapter } from "@/modules/catalog/infrastructure/Adapter";'],
  ["relative", 'import { Adapter } from "../infrastructure/Adapter";'],
  ["type-only", 'import type { Adapter } from "../infrastructure/Adapter";'],
  ["re-export", 'export { Adapter } from "../infrastructure/Adapter";'],
  ["type re-export", 'export type { Adapter } from "../infrastructure/Adapter";'],
  ["dynamic", 'const adapter = import("../infrastructure/Adapter");'],
  ["require", 'const adapter = require("../infrastructure/Adapter");'],
  ["import equals", 'import adapter = require("../infrastructure/Adapter");'],
  ["import type expression", 'type Adapter = import("../infrastructure/Adapter").Adapter;'],
  ["barrel", 'import { Adapter } from "../../../bridge";'],
  ["createRequire", 'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); const adapter = load("../infrastructure/Adapter");'],
]) {
  test(`application rejects concrete adapters via ${label}`, t => {
    const f = fixture(t, {
      "apps/api/src/modules/catalog/application/Create.ts": declaration,
      "apps/api/src/modules/catalog/infrastructure/Adapter.ts": "export class Adapter {}",
      "apps/api/src/bridge.ts": 'export { Adapter } from "./modules/catalog/infrastructure/Adapter";',
    });
    assert.ok(f.check().errors.some(e => e.rule === "application-layer" && e.importer.endsWith("Create.ts")), JSON.stringify(f.check().errors));
  });
}

test("ports, events and Nest composition remain public while private feature imports fail", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/domain/ports/CatalogPort.ts": "export interface CatalogPort {} export const TOKEN = Symbol();",
    "apps/api/src/modules/catalog/domain/events/Changed.ts": "export interface Changed {}",
    "apps/api/src/modules/catalog/catalog.module.ts": "export class CatalogModule {}",
    "apps/api/src/modules/catalog/application/Private.ts": "export class Private {}",
    "apps/api/src/modules/listings/application/UseCatalog.ts": 'import type { CatalogPort } from "../../catalog/domain/ports/CatalogPort"; import type { Changed } from "../../catalog/domain/events/Changed"; import { Injectable } from "@nestjs/common";',
    "apps/api/src/modules/listings/listings.module.ts": 'import { CatalogModule } from "../catalog/catalog.module";',
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/api/src/modules/listings/application/Private.ts", 'import type { Private } from "../../catalog/application/Private";');
  assert.ok(f.check().errors.some(e => e.rule === "feature-public"));
});

test("public facades cannot launder infrastructure or DB exports", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/catalog.public.ts": 'export type { Adapter } from "./infrastructure/Adapter";',
    "apps/api/src/modules/catalog/infrastructure/Adapter.ts": "export class Adapter {}",
    "apps/api/src/modules/listings/application/UseCatalog.ts": 'import type { Adapter } from "../../catalog/catalog.public";',
  });
  assert.ok(f.check().errors.some(e => e.rule === "application-layer" && e.importer.endsWith("UseCatalog.ts")));
});

test("legacy allowances are exact, counted, owned and removed with their imports", t => {
  const importer = "apps/api/src/modules/catalog/application/Create.ts";
  const target = "apps/api/src/modules/catalog/infrastructure/Adapter.ts";
  const f = fixture(t, { [importer]: 'import { Adapter } from "../infrastructure/Adapter";', [target]: "export class Adapter {}" });
  const allowance = { importer, target, rule: "application-layer", reason: "Inject the catalog persistence port", owner: "catalog", issue: "https://github.com/Carberk/carberk/issues/1348", count: 1 };
  assert.deepEqual(f.check([allowance]).errors, []);
  f.put(importer, 'import { Adapter } from "../infrastructure/Adapter"; import type { Adapter as Other } from "../infrastructure/Adapter";');
  assert.ok(f.check([allowance]).errors.some(e => e.rule === "application-layer"));
  f.put(importer, "export {};");
  assert.ok(f.check([allowance]).errors.some(e => e.rule === "unused-allowance"));
  f.put(importer, 'import { Adapter } from "../infrastructure/Adapter";');
  f.put(importer.replace("Create", "Update"), 'import { Adapter } from "../infrastructure/Adapter";');
  assert.ok(f.check([allowance]).errors.some(e => e.importer.endsWith("Update.ts")));
  for (const invalid of [{ owner: "" }, { reason: "" }, { importer: "*" }, { rule: "domain-purity" }]) {
    assert.ok(f.check([{ ...allowance, ...invalid }]).errors.some(e => e.rule === "invalid-allowance"));
  }
});

for (const [label, back, rejected] of [
  ["runtime", 'import { a } from "./a";', true],
  ["require", 'const a = require("./a");', true],
  ["type-only", 'import type { A } from "./a";', false],
  ["lazy", 'const a = import("./a");', false],
]) {
  test(`${label} cycle policy uses resolved targets`, t => {
    const f = fixture(t, {
      "apps/api/src/a.ts": 'import { b } from "@/b"; export const a = 1; export interface A {}',
      "apps/api/src/b.ts": `${back} export const b = 2;`,
    });
    assert.equal(f.check().errors.some(e => e.rule === "runtime-cycle"), rejected);
  });
}

function sharedPackage(f) {
  f.put("packages/contracts/package.json", { name: "@auto-tm/contracts", type: "module", exports: { ".": { types: "./dist/index.d.ts", require: "./dist/index.js", import: "./dist/index.js" }, "./schema/*": "./dist/schema/*.js" } });
  f.put("packages/contracts/tsconfig.json", { compilerOptions: { module: "CommonJS", moduleResolution: "Bundler", outDir: "dist", rootDir: "src" } });
  f.put("packages/contracts/src/index.ts", "export const Schema = 1; export interface Input {}");
  f.put("packages/contracts/src/schema/item.ts", "export const Item = 1;");
  f.put("apps/api/package.json", { name: "@auto-tm/api", dependencies: { "@auto-tm/contracts": "workspace:*" } });
}

test("workspace exports resolve clean emitted CJS/ESM/types and patterns back to source", t => {
  const f = fixture(t, { "apps/api/src/use.ts": 'import { Schema } from "@auto-tm/contracts"; import type { Input } from "@auto-tm/contracts"; const other = require("@auto-tm/contracts"); const lazy = import("@auto-tm/contracts/schema/item");' });
  sharedPackage(f);
  assert.deepEqual(f.check().errors, []);
  assert.equal(f.check().edges.find(e => e.specifier === "@auto-tm/contracts").target, "packages/contracts/src/index.ts");
  f.put("apps/api/src/private.ts", 'import { Schema } from "@auto-tm/contracts/src/index";');
  assert.ok(f.check().errors.some(e => e.rule === "workspace-export"));
});

for (const [label, specifier] of [["relative", "../../../packages/contracts/src/index"], ["alias", "@shared/index"]]) {
  test(`workspace ${label} source bypass fails despite TypeScript resolution`, t => {
    const f = fixture(t, { "apps/api/src/use.ts": `import { Schema } from "${specifier}";` });
    sharedPackage(f);
    f.put("apps/api/tsconfig.json", { compilerOptions: { module: "CommonJS", moduleResolution: "Bundler", paths: { "@shared/*": ["../../packages/contracts/src/*"] } } });
    assert.ok(f.check().errors.some(e => e.rule === "workspace-bypass"));
  });
}

test("declaring a direct dependency removes its exact allowance and makes it stale", t => {
  const f = fixture(t, { "apps/api/src/use.ts": 'import { value } from "transitive";' });
  assert.ok(f.check().errors.some(e => e.rule === "direct-dependency"));
  f.put("apps/api/package.json", { name: "@auto-tm/api", dependencies: { transitive: "*" } });
  assert.deepEqual(f.check().errors, []);
});

test("NodeNext preserves required ESM extensions and CJS require semantics", t => {
  const f = fixture(t, {
    "apps/sms-gateway/package.json": { name: "@auto-tm/sms-gateway", type: "module" },
    "apps/sms-gateway/tsconfig.json": { compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", rootDir: "src" } },
    "apps/sms-gateway/src/value.ts": "export const value = 1;",
    "apps/sms-gateway/src/server.ts": 'import { value } from "./value.js";',
    "apps/sms-gateway/src/legacy.cts": 'const value = require("./value");',
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/sms-gateway/src/server.ts", 'import { value } from "./value";');
  assert.ok(f.check().errors.some(e => e.rule === "esm-extension"));
});

test("assets must exist and generated prerequisites have narrow known producer paths", t => {
  const f = fixture(t, {
    "apps/mobile/package.json": { name: "@auto-tm/mobile" },
    "apps/mobile/tsconfig.json": { compilerOptions: { moduleResolution: "Bundler", paths: { "@/*": ["./*"] } } },
    "apps/mobile/src/assets.ts": 'import "@/global.css"; const image = require("../assets/image.png");',
    "apps/mobile/global.css": "body {}",
    "apps/mobile/assets/image.png": "fixture-image",
    "apps/web/package.json": { name: "@auto-tm/web" },
    "apps/web/next-env.d.ts": 'import "./.next/types/routes.d.ts";',
    "packages/db/package.json": { name: "@auto-tm/db" },
    "packages/db/src/index.ts": 'export * from "../generated/prisma/client/client";',
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/mobile/src/assets.ts", 'import "@/assets/missing.svg";');
  assert.ok(f.check().errors.some(e => e.rule === "unresolved-first-party"));
  f.put("packages/db/src/index.ts", 'export * from "../generated/prisma/client/typo";');
  assert.ok(f.check().errors.some(e => e.rule === "unresolved-first-party"));
});

test("Expo client graph and Next use-client graph reject indirect server leakage", t => {
  const f = fixture(t, {
    "apps/mobile/package.json": { name: "@auto-tm/mobile" },
    "apps/mobile/src/screen.ts": 'import { secret } from "./helper";',
    "apps/mobile/src/helper.ts": 'import { readFileSync } from "node:fs"; export const secret = 1;',
    "apps/web/package.json": { name: "@auto-tm/web" },
    "apps/web/src/client.tsx": '"use client"; import { secret } from "./server";',
    "apps/web/src/server.ts": 'import { readFileSync } from "node:fs"; export const secret = 1;',
  });
  const errors = f.check().errors;
  assert.ok(errors.some(e => e.rule === "frontend-server" && e.importer.endsWith("screen.ts")));
  assert.ok(errors.some(e => e.rule === "frontend-server" && e.importer.endsWith("client.tsx")));
  assert.ok(!errors.some(e => e.rule === "frontend-server" && e.importer.endsWith("server.ts")));
});

test("unresolved and unsupported first-party loaders are explicit without executing source", t => {
  const f = fixture(t, {
    "apps/api/src/use.ts": 'throw new Error("MUST_NOT_EXECUTE"); const value = import(path); const other = require("./missing");',
  });
  const result = f.check();
  assert.ok(result.errors.some(e => e.rule === "unsupported-loader"));
  assert.ok(result.errors.some(e => e.rule === "unresolved-first-party"));
  assert.equal(result.unsupported[0].expression, "path");
});

test("configured aliases and exported conditions react to config and manifest changes without cache", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/application/Create.ts": 'import { Value } from "@value";',
    "apps/api/src/modules/catalog/domain/Value.ts": "export class Value {}",
    "apps/api/src/modules/catalog/infrastructure/Value.ts": "export class Value {}",
    "apps/api/config/base.json": { compilerOptions: { paths: { "@value": ["../src/modules/catalog/domain/Value"] } } },
    "apps/api/tsconfig.json": { extends: "./config/base.json", compilerOptions: { module: "CommonJS", moduleResolution: "Bundler" } },
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/api/config/base.json", { compilerOptions: { paths: { "@value": ["../src/modules/catalog/infrastructure/Value"] } } });
  assert.ok(f.check().errors.some(e => e.rule === "application-layer"));
});

test("installed CJS, NodeNext, Next and Expo effective configs resolve their legitimate source forms", t => {
  const repository = new URL("..", import.meta.url).pathname;
  const f = fixture(t, {});
  for (const name of ["api", "sms-gateway", "admin", "mobile"]) {
    f.put(`apps/${name}/package.json`, { name: `@auto-tm/${name}`, ...(name === "sms-gateway" ? { type: "module" } : {}) });
    f.put(`apps/${name}/tsconfig.json`, { extends: join(repository, `apps/${name}/tsconfig.json`), compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    f.put(`apps/${name}/src/value.ts`, "export const value = 1;");
    f.put(`apps/${name}/src/main.ts`, name === "sms-gateway" ? 'import { value } from "./value.js";' : 'import { value } from "@/value";');
  }
  assert.deepEqual(f.check().errors, []);
});

test("import-then-export barrels cannot launder DB types", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/application/Create.ts": 'import type { Prisma } from "../../../bridge";',
    "apps/api/src/bridge.ts": 'import type { Prisma } from "@auto-tm/db"; export type { Prisma };',
    "apps/api/package.json": { name: "@auto-tm/api", dependencies: { "@auto-tm/db": "workspace:*" } },
    "packages/db/package.json": { name: "@auto-tm/db", exports: { ".": "./src/index.ts" } },
    "packages/db/src/index.ts": "export interface Prisma {}",
  });
  assert.ok(f.check().errors.some(e => e.rule === "application-layer" && e.importer.endsWith("Create.ts")));
});

test("Expo resolves iOS, Android and web alternatives and checks each runtime graph", t => {
  const f = fixture(t, {
    "apps/mobile/package.json": { name: "@auto-tm/mobile" },
    "apps/mobile/src/screen.ts": 'import { value } from "./value";',
    "apps/mobile/src/value.native.ts": "export const value = 1;",
    "apps/mobile/src/value.web.ts": "export const value = 2;",
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/mobile/src/value.ios.ts", 'import "./screen"; export const value = 3;');
  assert.ok(f.check().errors.some(e => e.rule === "runtime-cycle"));
});

test("producer outputs give the same result before and after generation", t => {
  const f = fixture(t, {
    "packages/db/package.json": { name: "@auto-tm/db" },
    "packages/db/src/index.ts": 'export * from "../generated/prisma/client/client";',
    "apps/web/package.json": { name: "@auto-tm/web" },
    "apps/web/next-env.d.ts": 'import "./.next/types/routes.d.ts";',
  });
  assert.deepEqual(f.check().errors, []);
  f.put("packages/db/generated/prisma/client/client.ts", "export class PrismaClient {}");
  f.put("apps/web/.next/types/routes.d.ts", "export interface Routes {}");
  assert.deepEqual(f.check().errors, []);
  assert.equal(f.check().edges.filter(e => e.category === "generated").length, 2);
});

test("renamed createRequire and require aliases retain their architecture edges", t => {
  const f = fixture(t, {
    "apps/api/src/modules/catalog/application/Create.ts": 'import { createRequire as makeLoader } from "node:module"; const loader = makeLoader(import.meta.url); const alias = loader; const value = alias("../infrastructure/Adapter");',
    "apps/api/src/modules/catalog/infrastructure/Adapter.ts": "export class Adapter {}",
  });
  assert.ok(f.check().errors.some(e => e.rule === "application-layer"));
});

test("Next directives use the parsed prologue and preserve server-action imports", t => {
  const f = fixture(t, {
    "apps/web/package.json": { name: "@auto-tm/web" },
    "apps/web/src/client.tsx": '/* directive fixture */ "use client"; import { action } from "./action";',
    "apps/web/src/action.ts": '"use server"; import "node:fs"; export async function action() {}',
  });
  assert.deepEqual(f.check().errors, []);
  f.put("apps/web/src/action.ts", 'import "node:fs"; export async function action() {}');
  assert.ok(f.check().errors.some(e => e.rule === "frontend-server" && e.importer.endsWith("client.tsx")));
});
