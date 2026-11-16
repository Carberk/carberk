import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { get_config } from "@prisma/prisma-schema-wasm";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const compilers = [
  ["packages/contracts", "scripts/build.cjs"], ["packages/db", "scripts/build.cjs"],
];

export function producerProvenance(directory, current, trusted) {
  const entries = [];
  const pin = (path, bytes, origin) => entries.push({ path, sha256: digest(bytes), origin });
  const generated = "packages/db/generated/prisma/client/";
  if ([...current.keys()].some((path) => path.startsWith(generated))) {
    const schemaPath = "packages/db/prisma/schema.prisma";
    const source = current.get(schemaPath);
    if (typeof source !== "string") throw new Error("Prisma producer requires the maintained schema");
    const parsed = JSON.parse(get_config(JSON.stringify({ prismaSchema: [["schema.prisma", source]], ignoreEnvVarErrors: true })));
    const generator = parsed.config?.generators?.find((item) => item.name === "client");
    if (parsed.errors?.length || generator?.provider.value !== "prisma-client" || generator.output.value !== "../generated/prisma/client") {
      throw new Error("Prisma producer requires the known built-in client and exact output path");
    }
    const temporary = mkdtempSync(join(tmpdir(), "carberk-source-producer-"));
    try {
      const schema = join(temporary, schemaPath);
      mkdirSync(dirname(schema), { recursive: true });
      writeFileSync(schema, source);
      for (const path of ["package.json", "packages/db/package.json", "packages/db/tsconfig.json", "packages/db/tsconfig.build.json"]) {
        const value = current.get(path);
        if (typeof value !== "string") throw new Error(`${path}: missing Prisma producer context`);
        writeFileSync(join(temporary, path), value);
      }
      symlinkSync(join(directory, "node_modules"), join(temporary, "node_modules"));
      symlinkSync(join(directory, "packages/db/node_modules"), join(temporary, "packages/db/node_modules"));
      const config = join(temporary, "prisma.config.mjs");
      writeFileSync(config, `export default { schema: ${JSON.stringify(schema)} };\n`);
      const require = createRequire(import.meta.url);
      const manifest = require.resolve("prisma/package.json");
      const cli = JSON.parse(readFileSync(manifest, "utf8")).bin.prisma;
      execFileSync(process.execPath, [join(dirname(manifest), cli), "generate", "--config", config, "--generator", "client"], {
        cwd: temporary, env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1", CHECKPOINT_DISABLE: "1" },
        stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      });
      const walk = (path) => {
        for (const entry of readdirSync(join(temporary, path), { withFileTypes: true })) {
          const target = `${path}/${entry.name}`;
          if (entry.isDirectory()) walk(target);
          else if (entry.isFile()) pin(target, readFileSync(join(temporary, target)), "Prisma built-in client regenerated from maintained schema");
          else throw new Error(`${target}: unsupported generated producer mode`);
        }
      };
      walk(generated.slice(0, -1));
    } catch (error) {
      throw new Error(`Prisma producer verification failed: ${error.code ?? error.name}`);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  for (const [workspace, builder] of compilers) {
    if (![...current.keys()].some((path) => path.startsWith(`${workspace}/dist/`))) continue;
    if (builder && current.get(`${workspace}/${builder}`) !== trusted.get(`${workspace}/${builder}`)) {
      throw new Error(`${workspace}: producer implementation differs from trusted main`);
    }
    const configPath = join(directory, workspace, "tsconfig.build.json");
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error) throw new Error(`${workspace}: producer configuration unavailable`);
    const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath));
    if (config.errors.length || config.options.declarationDir || config.options.outFile || config.options.tsBuildInfoFile || config.options.generateTrace ||
      resolve(config.options.outDir ?? "") !== join(directory, workspace, "dist")) {
      throw new Error(`${workspace}: unsupported producer output configuration`);
    }
    const temporary = mkdtempSync(join(tmpdir(), "carberk-typescript-producer-"));
    try {
      const require = createRequire(import.meta.url);
      const manifest = require.resolve("@typescript/native/package.json");
      const compiler = JSON.parse(readFileSync(manifest, "utf8"));
      const output = join(temporary, "dist");
      const args = [join(dirname(manifest), compiler.bin.tsc), "-p", configPath, "--outDir", output];
      if (config.options.incremental || config.options.composite) args.push("--tsBuildInfoFile", join(temporary, "build.tsbuildinfo"));
      execFileSync(process.execPath, args, { cwd: directory, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
      const walk = (parent = "") => {
        for (const entry of readdirSync(join(output, parent), { withFileTypes: true })) {
          const name = parent ? `${parent}/${entry.name}` : entry.name;
          if (entry.isDirectory()) { walk(name); continue; }
          if (!entry.isFile()) throw new Error(`${workspace}: unsupported producer output mode`);
          const path = `${workspace}/dist/${name}`;
          let bytes = readFileSync(join(output, name));
          if (name.endsWith(".map")) {
            const text = bytes.toString("utf8"), map = JSON.parse(text);
            if (map.sourceRoot) throw new Error(`${workspace}: unsupported producer sourceRoot`);
            map.sources = map.sources.map((source) => relative(dirname(join(directory, path)), resolve(dirname(join(output, name)), source)).replaceAll("\\", "/"));
            bytes = Buffer.from(JSON.stringify(map) + (text.endsWith("\n") ? "\n" : ""));
          }
          pin(path, bytes, `TypeScript ${compiler.version} output of ${workspace}/tsconfig.build.json`);
        }
      };
      walk();
    } catch (error) { throw new Error(`${workspace}: TypeScript producer verification failed: ${error.code ?? error.message}`); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
    if (workspace === "packages/contracts") pin(`${workspace}/dist/package.json`, '{"type":"commonjs"}\n', "Trusted contracts builder package boundary");
  }
  return entries;
}
