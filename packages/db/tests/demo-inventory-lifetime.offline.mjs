import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const { Pool, Client } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("tsx/cjs/api").require(
  fileURLToPath(new URL("../generated/prisma/client/client.ts", import.meta.url)),
  import.meta.url,
);
const owner = new URL("./demo-inventory.seed.test.ts", import.meta.url);
const source = readFileSync(owner, "utf8");
const ast = ts.createSourceFile(owner.pathname, source, ts.ScriptTarget.Latest, true);
let suite;
function findSuite(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "describe") suite = node.arguments[1].body;
  ts.forEachChild(node, findSuite);
}
findSuite(ast);
assert.ok(suite, "owning suite must exist");
const statements = [...suite.statements];
const hook = name => statements.find(statement => ts.isExpressionStatement(statement) &&
  ts.isCallExpression(statement.expression) && statement.expression.expression.getText(ast) === name).expression.arguments[0];
const setup = [...hook("beforeAll").body.statements];
const start = setup.findIndex(statement => statement.getText(ast).startsWith("pool = new Pool("));
const end = setup.findIndex(statement => statement.getText(ast).startsWith("db = new PrismaClient("));
assert.ok(start >= 0 && end >= start, "execute actual pool creation through actual Prisma construction");
const declarations = statements.filter(ts.isVariableStatement).map(statement => statement.getText(ast)).join("\n");
const registration = setup.slice(start, end + 1).map(statement => statement.getText(ast)).join("\n");
const imports = ast.statements.filter(ts.isImportDeclaration).filter(statement =>
  statement.moduleSpecifier.text.startsWith("./helpers/"));
const helpers = {};
for (const statement of imports) {
  const path = new URL(`${statement.moduleSpecifier.text}.ts`, owner);
  Object.assign(helpers, require("tsx/cjs/api").require(fileURLToPath(path), import.meta.url));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture({ initialize = true, initializePrisma = true, disconnectError, endError } = {}) {
  const connections = [];
  const clients = [];
  let stops = 0;
  class Transport extends EventEmitter {
    _connecting = true;
    stream = { destroy() {} };
    requested = deferred();
    connect() { queueMicrotask(() => this.emit("connect")); }
    startup() { queueMicrotask(() => this.emit("readyForQuery")); }
    end() { this.requested.resolve(); }
    finish() { this.emit("end"); }
  }
  class BoundaryClient extends Client {
    constructor(config) {
      const connection = new Transport();
      super({ ...config, connection });
      connections.push(connection);
      clients.push(this);
    }
  }
  class BoundaryPool extends Pool {
    constructor(config) { super({ ...config, Client: BoundaryClient }); }
  }
  const fixtures = {
    postgres: initialize ? {
      getConnectionUri: () => "postgresql://offline.invalid/offline",
      async stop() {
        stops++;
        assert.ok(clients.every(client => client._ended), "Postgres stop began before all observed clients ended");
      },
    } : undefined,
    minio: undefined,
    s3: undefined,
    storage: undefined,
  };
  // Run the owner's declarations, pool creation/registration and exact afterAll callback.
  // No rewritten cleanup sequence and no mock of the owning helper.
  const program = `(() => {
    ${declarations}
    ({ postgres, minio, s3, storage } = fixtures);
    ${initialize ? initializePrisma ? registration : setup.slice(start, end).map(statement => statement.getText(ast)).join("\n") : ""}
    return { pool, db, teardown: ${hook("afterAll").getText(ast)} };
  })()`;
  const js = ts.transpileModule(program, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const owned = runInNewContext(js, {
    Pool: BoundaryPool, PrismaPg, PrismaClient, fixtures, ...helpers,
  });
  if (disconnectError) owned.db.$disconnect = async () => { throw disconnectError; };
  if (endError) owned.pool.end = async () => { throw endError; };
  return { ...owned, connections, clients, stops: () => stops };
}

test("owning teardown waits for actual end of live and already idle-removed clients", async () => {
  const f = fixture();
  await f.db.$connect();
  const evicted = await f.pool.connect();
  const idle = await f.pool.connect();
  evicted.release(new Error("offline eviction"));
  idle.release();
  assert.equal(f.pool.totalCount, 1);
  assert.equal(f.clients[0]._ended, false);
  let teardownError;
  const teardown = f.teardown().catch(error => { teardownError = error; });
  try {
    await f.connections[1].requested.promise;
    // A scheduler turn, not a duration: drain current promise/nextTick work while transport end stays gated.
    await nextTurn();
    assert.equal(f.stops(), 0, "server stop must stay blocked while both client ends are gated");
    f.connections[1].finish();
    await nextTurn();
    assert.equal(f.stops(), 0, "idle-removed client must still block server stop");
  } finally {
    for (let i = 0; i < f.connections.length; i++) if (!f.clients[i]._ended) f.connections[i].finish();
    await teardown;
  }
  assert.equal(teardownError, undefined);
  assert.equal(f.stops(), 1);
});

test("owning teardown with setup absent does not wait for nonexistent clients", async () => {
  const f = fixture({ initialize: false });
  await f.teardown();
  assert.equal(f.stops(), 0);
});

test("owning teardown handles pool registration before Prisma initialization without waiting", async () => {
  const f = fixture({ initializePrisma: false });
  assert.equal(f.db, undefined);
  assert.equal(f.pool.totalCount, 0);
  await f.teardown();
  assert.equal(f.stops(), 1);
});

for (const operation of ["disconnect", "end"]) {
  test(`owning teardown preserves ${operation} failure without stopping Postgres`, async () => {
    const fault = new Error(`offline ${operation} failure`);
    const f = fixture({ [`${operation}Error`]: fault });
    await assert.rejects(f.teardown(), error => error === fault);
    assert.equal(f.stops(), 0);
  });
}
