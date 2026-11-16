import assert from "node:assert/strict";
import test from "node:test";
import { parseYaml } from "./yaml.mjs";

test("YAML host tokens preserve quoted hashes and report executable shell coverage separately", () => {
  const source = 'name: "# literal" # host\nsteps:\n  - run: |\n      echo "# data"\n      # shell\n';
  const result = parseYaml({ path: "docs/task", fileType: "yaml", source,
    embedded: [{ path: ["steps", 0, "run"], fileType: "shell" }] });
  assert.deepEqual(result.comments.map((item) => item.raw), ["# host"]);
  assert.equal(result.deferred[0].fileType, "shell");
  assert.equal(result.deferred[0].reason, "adapter unavailable");
});

test("YAML parses flow comments, block headers, directives and multiple documents without scanning payloads", () => {
  const source = '%YAML 1.2\n---\nvalue: ["# quoted", plain#data] # flow\nbody: | # header\n  # data\n---\nvalue: \'# single\' # second\n';
  const result = parseYaml({ path: "docs/data", fileType: "yaml", source });
  assert.deepEqual(result.comments.map((item) => item.raw), ["# flow", "# header", "# second"]);
  assert.deepEqual(result.deferred, []);
});

test("declared YAML CSS is delegated and spans map to host lines", () => {
  const source = 'style: |\n  a{content:"# literal"}\n  /* actual */\n';
  const result = parseYaml({ path: "docs/style", fileType: "yaml", source,
    embedded: [{ path: ["style"], fileType: "css" }] });
  assert.equal(result.comments[0].raw, "/* actual */");
  assert.deepEqual(result.comments[0].start, { line: 3, column: 2 });
  assert.deepEqual(result.deferred, []);
});

test("multiline embedded comments retain host indentation in their source spans", () => {
  const source = 'style: |-\n  /* first\n     second */\n  a{}\n';
  const result = parseYaml({ path: "style", fileType: "yaml", source,
    embedded: [{ path: ["style"], fileType: "css" }] });
  assert.equal(result.comments[0].raw, "/* first\n     second */");
});

test("encoded executable scalars expose a coverage limit and quoted ordinary payloads remain data", () => {
  for (const source of ['run: >\n  echo ok\n  # shell\n', 'run: "echo ok # shell"\n']) {
    const result = parseYaml({ path: "task", fileType: "yaml", source, embedded: [{ path: ["run"], fileType: "shell" }] });
    assert.equal(result.deferred[0].reason, "encoded or folded executable scalar requires source mapping");
  }
  assert.deepEqual(parseYaml({ path: "data", fileType: "yaml", source: 'value: "# quoted"' }).comments, []);
});

test("malformed YAML and invalid executable declarations fail closed", () => {
  for (const source of ['x: [unfinished', 'x: "unfinished', 'x: 1\nx: 2', 'x:\n bad: value\n  other: bad']) {
    assert.throws(() => parseYaml({ path: "docs/broken", fileType: "yaml", source }), /YAML parse failed/);
  }
  assert.throws(() => parseYaml({ path: "task", fileType: "yaml", source: "run: 42", embedded: [{ path: ["run"], fileType: "shell" }] }), /string scalar/);
});

test("declared YAML JavaScript composes with the existing Babel grammar", async () => {
  const { parse } = await import("@babel/parser");
  const { commentSpan } = await import("./markup-spans.mjs");
  const source = 'script: |\n  const value = "<div><!--data--></div>"; // actual\n';
  const result = parseYaml({ path: "docs/script", fileType: "yaml", source,
    embedded: [{ path: ["script"], fileType: "javascript" }],
    adapters: { javascript: ({ source: program }) => ({ comments: parse(program).comments.map((item) =>
      commentSpan(program, item.start, item.end)), deferred: [] }) } });
  assert.deepEqual(result.comments.map((item) => item.raw), ["// actual"]);
  assert.deepEqual(result.comments[0].start, { line: 2, column: 42 });
});

test("explicit YAML indentation, CRLF and chomping preserve the declared program", () => {
  const source = 'style: |2-\r\n    a {\r\n    /* actual */\r\n    }\r\n';
  const result = parseYaml({ path: "docs/style", fileType: "yaml", source,
    embedded: [{ path: ["style"], fileType: "css" }] });
  assert.equal(result.comments[0].raw, "/* actual */");
  assert.deepEqual(result.comments[0].start, { line: 3, column: 4 });
});
