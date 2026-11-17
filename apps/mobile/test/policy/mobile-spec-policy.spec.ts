import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { checkMobileSpecs } from "./mobile-spec-policy";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "mobile-spec-policy-"));
  roots.push(root);
  for (const [path, source] of Object.entries({
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
    "src/api/client.ts": "export const apiClient = {};",
    "src/api/listings/useListing.ts": "export function useListing() {}",
    "components/Card.tsx": "export const Card = () => <Text>Ready</Text>;",
    ...files,
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

it("rejects source text used as proof of rendered behavior", () => {
  const root = fixture({ "test/new.spec.ts": `
    import { readFileSync as read } from 'node:fs';
    import { resolve } from 'node:path';
    const target = resolve(__dirname, '../components/Card.tsx');
    const source = read(target, 'utf8');
    expect(source.includes('Ready')).toBe(true);
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("test/new.spec.ts: source-text-assertion")]);
});

it.each([
  "vi.mock('@/src/api/listings/useListing', () => ({}));",
  "vi.doMock('../src/api/client.ts', () => ({}));",
  "vi.mock(import('../src/api/listings/useListing'), () => ({}));",
  "import * as client from '../src/api/client'; vi.spyOn(client, 'apiClient');",
  "import { vi as testDouble } from 'vitest'; testDouble.mock('@/src/api/client', () => ({}));",
])("rejects own API replacements: %s", code => {
  const root = fixture({ "test/new.spec.ts": code });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("test/new.spec.ts: own-api-mock")]);
});

it("keeps transport, native, network, storage and structural/configuration checks legitimate", () => {
  const root = fixture({
    "src/api/client.spec.ts": `vi.mock('./client', () => ({})); vi.stubGlobal('fetch', vi.fn());`,
    "test/new.spec.ts": `
      import { readFileSync, readdirSync } from 'node:fs';
      import { resolve } from 'node:path';
      vi.mock('expo-secure-store', () => ({}));
      vi.mock('react-native', () => ({}));
      vi.mock('@react-native-async-storage/async-storage', () => ({}));
      vi.mock('socket.io-client', () => ({}));
      expect(readdirSync(resolve(__dirname, '../app')).filter(file => file.includes('.spec.'))).toEqual([]);
      expect(readFileSync(resolve(__dirname, '../eas.json'), 'utf8')).toContain('production');
    `,
  });
  expect(checkMobileSpecs(root, [])).toEqual([]);
});

it("does not extend the transport exception to other files or own API hooks", () => {
  const root = fixture({ "src/api/client.spec.ts": `vi.mock('./listings/useListing', () => ({}));` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("src/api/client.spec.ts: own-api-mock")]);
});

it("ignores comments and strings that mention a mock", () => {
  const root = fixture({ "test/new.spec.ts": `const example = "vi.mock('@/src/api/client')"; expect(example).toContain('mock');` });
  expect(checkMobileSpecs(root, [])).toEqual([]);
});

it.each([
  `import * as fs from 'node:fs'; expect(fs.readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8')).toContain('Ready');`,
  `import { readFileSync } from 'fs'; import { join } from 'path'; const read = (name: string) => readFileSync(join(__dirname, '../components', name), 'utf8'); expect(read('Card.tsx')).toMatch(/Ready/);`,
  `import { readFile as load } from 'node:fs/promises'; const text = await load(new URL('../src/api/listings/useListing.ts', import.meta.url), 'utf8'); expect(/useListing/.test(text)).toBe(true);`,
])("follows source reads through URL, helpers and asynchronous fs: %s", code => {
  const root = fixture({ "test/new.spec.ts": code });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("source-text-assertion")]);
});

it("requires exact legacy files and rules and rejects stale or deleted entries", () => {
  const root = fixture({ "test/old.spec.ts": "vi.mock('@/src/api/client', () => ({}));" });
  const legacy = [{ file: "test/old.spec.ts", rules: ["own-api-mock"] }];
  expect(checkMobileSpecs(root, legacy)).toEqual([]);
  writeFileSync(join(root, "test/old.spec.ts"), "expect(true).toBe(true);");
  expect(checkMobileSpecs(root, legacy)).toEqual([expect.stringContaining("stale legacy-allowlist own-api-mock")]);
  rmSync(join(root, "test/old.spec.ts"));
  expect(checkMobileSpecs(root, legacy)).toEqual([expect.stringContaining("stale legacy-allowlist")]);
});

it("does not allow a second violation in a legacy file", () => {
  const root = fixture({ "test/old.spec.ts": `import { readFileSync } from 'node:fs'; vi.mock('@/src/api/client', () => ({})); expect(readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8')).toContain('Ready');` });
  expect(checkMobileSpecs(root, [{ file: "test/old.spec.ts", rules: ["own-api-mock"] }])).toEqual([expect.stringContaining("source-text-assertion")]);
});

it("rejects growth while allowing removal of a repaired legacy entry", () => {
  const root = fixture({ "test/old.spec.ts": "vi.mock('@/src/api/client', () => ({}));" });
  const entry = { file: "test/old.spec.ts", rules: ["own-api-mock"] };
  expect(checkMobileSpecs(root, [entry], [])).toEqual([expect.stringContaining("may only shrink")]);
  writeFileSync(join(root, "test/old.spec.ts"), "expect(true).toBe(true);");
  expect(checkMobileSpecs(root, [], [entry])).toEqual([]);
});

it("keeps source-text detection correct when nested tests reuse a variable name", () => {
  const root = fixture({ "test/new.spec.ts": `
    import { readFileSync } from 'node:fs';
    it('broken', () => { const source = readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8'); expect(source).toContain('Ready'); });
    it('unrelated', () => { const source = 'hello'; expect(source).toBe('hello'); });
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("source-text-assertion")]);
});

it("allows architecture checks on parsed syntax rather than component text", () => {
  const root = fixture({ "test/new.spec.ts": `
    import ts from 'typescript';
    import { readFileSync } from 'node:fs';
    const ast = ts.createSourceFile('Card.tsx', readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest);
    expect(ast.statements.length).toBe(1);
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([]);
});

it("resolves configured aliases and barrels exporting API hooks", () => {
  const root = fixture({
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "api/*": ["./src/api/*"] } } }),
    "src/api/requests.ts": "export const useRequests = () => [];",
    "src/api/index.ts": "export * from './requests';",
    "test/new.spec.ts": "vi.mock('api/index', () => ({}));",
  });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("own-api-mock")]);
});

it("rejects soft assertions on component source", () => {
  const root = fixture({ "test/new.spec.ts": `
    import { expect as check } from 'vitest';
    import { readFileSync } from 'node:fs';
    const source = readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8');
    check.soft(source).toContain('Ready');
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("source-text-assertion")]);
});

it("rejects a namespace client's spied transport method", () => {
  const root = fixture({ "test/new.spec.ts": `
    import * as client from '@/src/api/client';
    vi.spyOn(client.apiClient, 'get').mockResolvedValue({});
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("own-api-mock")]);
});

it("allows structural inventories that assert file ownership instead of rendered text", () => {
  const root = fixture({ "test/new.spec.ts": `
    import { readFileSync } from 'node:fs';
    const files = ['../components/Card.tsx'];
    const owners = files.filter(file => readFileSync(new URL(file, import.meta.url), 'utf8').includes('server-only'));
    expect(owners).toEqual([]);
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([]);
});

it("recognizes assertions through a Vitest namespace", () => {
  const root = fixture({ "test/new.spec.ts": `
    import * as test from 'vitest';
    import { readFileSync } from 'node:fs';
    const source = readFileSync(new URL('../components/Card.tsx', import.meta.url), 'utf8');
    test.expect.soft(source).toContain('Ready');
  ` });
  expect(checkMobileSpecs(root, [])).toEqual([expect.stringContaining("source-text-assertion")]);
});
