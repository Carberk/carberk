import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePattern = /\.[cm]?[jt]sx?$/;
const assetPattern = /\.(?:json|css|scss|svg|png|jpe?g|webp|gif|ttf|otf|woff2?|mp4)$/;
const ignored = new Set(["node_modules", ".git", ".turbo", ".next", ".expo", "dist", "build", "coverage", "generated", ".gradle", "Pods"]);
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const packageName = name => name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
const isTest = path => /(?:^|\/)(?:test|tests|__tests__|testing)\/|\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path);
const isComposition = path => /\.module\.[cm]?[jt]s$/.test(path);
const feature = path => /^apps\/api\/src\/modules\/([^/]+)\/(.*)$/.exec(path);
const bundledSource = path => !/^(?:apps|packages)\/[^/]+\/(?:scripts\/|[^/]+\.config\.[cm]?[jt]s$)/.test(path);
const frontend = workspace => ["@auto-tm/mobile", "@auto-tm/ui"].includes(workspace?.name);
const persistence = name => /^(?:@auto-tm\/db|@prisma\/|prisma$|pg$|mysql|typeorm|drizzle|kysely|mongoose|ioredis|redis$)/.test(name);
const framework = name => /^(?:@nestjs\/|nestjs-|fastify|express$|socket.io$|react$|react-native$|next(?:\/|$))/.test(name);
const publicFeature = path => /^(?:[^/]+\.public\.[cm]?[jt]s|domain\/(?:ports|events)\/[^/]+\.[cm]?[jt]s|application\/ports\/[^/]+\.[cm]?[jt]s)$/.test(path);
const key = entry => JSON.stringify([entry.importer, entry.target, entry.rule]);
const json = path => JSON.parse(readFileSync(path, "utf8"));

function sources(root) {
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (sourcePattern.test(entry.name) && entry.isFile()) files.push(path);
      else if (sourcePattern.test(entry.name) && entry.isSymbolicLink()) throw new Error(`unsupported source symlink: ${path}`);
    }
  };
  walk(root);
  return files;
}

function declarations(file, text) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw new Error(ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, " "));
  const edges = [];
  const loaders = new Set(["require", "module.require"]);
  const creators = new Set(["createRequire"]);
  for (const statement of ast.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
    for (const element of statement.importClause.namedBindings.elements) if ((element.propertyName ?? element.name).text === "createRequire") creators.add(element.name.text);
  }
  const createsLoader = node => node && ts.isCallExpression(node) && (creators.has(node.expression.getText(ast)) || /\.createRequire$/.test(node.expression.getText(ast)));
  const discover = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && (createsLoader(node.initializer) || node.initializer && loaders.has(node.initializer.getText(ast)))) loaders.add(node.name.text);
    ts.forEachChild(node, discover);
  };
  discover(ast);
  const localExports = new Set();
  for (const statement of ast.statements) if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    for (const element of statement.exportClause.elements) localExports.add((element.propertyName ?? element.name).text);
  }
  const add = (node, argument, kind, typeOnly = false) => edges.push({
    specifier: argument && (ts.isStringLiteralLike(argument) ? argument.text : undefined),
    expression: argument?.getText(ast), kind, typeOnly,
    line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
    column: ast.getLineAndCharacterOfPosition(node.getStart(ast)).character + 1,
  });
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      add(node, node.moduleSpecifier, "import", Boolean(clause?.isTypeOnly || !clause?.name && named && ts.isNamedImports(named) && named.elements.length && named.elements.every(e => e.isTypeOnly)));
      const imported = [clause?.name?.text, ...(named && ts.isNamedImports(named) ? named.elements.map(e => e.name.text) : named ? [named.name.text] : [])];
      edges.at(-1).reexport = imported.some(name => localExports.has(name));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node, node.moduleSpecifier, "export", node.isTypeOnly || Boolean(node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length && node.exportClause.elements.every(e => e.isTypeOnly)));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression, "require", node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal, "import-type", true);
    } else if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, node.arguments[0], "dynamic");
      else if (loaders.has(name) || createsLoader(node.expression)) add(node, node.arguments[0], "require");
      else if (name === "import.meta.resolve" || [...loaders].some(loader => name === `${loader}.resolve`)) add(node, node.arguments[0], "resolve", true);
      else if (/^(?:require\.context|import\.meta\.glob)$/.test(name)) add(node, undefined, "unsupported-loader");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  edges.directives = [];
  for (const statement of ast.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    edges.directives.push(statement.expression.text);
  }
  return edges;
}

function exportTarget(value, conditions, wildcard) {
  if (typeof value === "string") return value.replaceAll("*", wildcard ?? "");
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(v => exportTarget(v, conditions, wildcard)).find(Boolean);
  for (const [condition, target] of Object.entries(value)) {
    if (condition === "default" || conditions.includes(condition)) return exportTarget(target, conditions, wildcard);
  }
}

function exported(pkg, subpath, conditions) {
  const exports = pkg.exports;
  if (exports === undefined) return subpath === "." ? pkg.main : `./${subpath.slice(2)}`;
  if (typeof exports !== "object" || exports === null || Array.isArray(exports) || !Object.keys(exports).some(k => k.startsWith("."))) {
    return subpath === "." ? exportTarget(exports, conditions) : undefined;
  }
  if (Object.hasOwn(exports, subpath)) return exportTarget(exports[subpath], conditions);
  for (const pattern of Object.keys(exports).filter(k => k.includes("*")).sort((a, b) => b.length - a.length)) {
    const [before, after] = pattern.split("*");
    if (subpath.startsWith(before) && subpath.endsWith(after)) return exportTarget(exports[pattern], conditions, subpath.slice(before.length, subpath.length - after.length));
  }
}

export function checkRepository(directory, { allowances } = {}) {
  const root = realpathSync(directory);
  allowances ??= json(join(root, "scripts/import-architecture/legacy.json"));
  const pathOf = path => relative(root, path).split("\\").join("/");
  const files = sources(root);
  const fileSet = new Set(files);
  const errors = [];
  const edges = [];
  const unsupported = [];
  const configs = new Map();
  const clientFiles = new Set();
  const serverFiles = new Set();
  const workspaces = ["apps", "packages"].flatMap(parent => existsSync(join(root, parent)) ? readdirSync(join(root, parent)).flatMap(name => {
    const dir = join(root, parent, name);
    return existsSync(join(dir, "package.json")) ? [{ ...json(join(dir, "package.json")), dir }] : [];
  }) : []);
  const rootPackage = { ...json(join(root, "package.json")), dir: root };
  const owner = file => workspaces.find(w => file.startsWith(`${w.dir}/`)) ?? rootPackage;
  const manifests = new Map();
  const dependencyOwner = file => {
    let dir = dirname(file);
    while (dir.startsWith(root)) {
      const path = join(dir, "package.json");
      if (existsSync(path)) {
        if (!manifests.has(path)) manifests.set(path, json(path));
        return manifests.get(path);
      }
      if (dir === root) break;
      dir = dirname(dir);
    }
    return rootPackage;
  };
  const generatedTarget = (path, workspace, importer) => /^packages\/db\/generated\/prisma\/client\/(?:client|enums)(?:\.[jt]s)?$/.test(path) && workspace.name === "@auto-tm/db" || /^apps\/(?:web|admin)\/\.next\/types\/(?:routes|root-params)\.d\.ts$/.test(path) && /next-env\.d\.ts$/.test(importer);
  const byName = new Map(workspaces.map(w => [w.name, w]));
  const report = (edge, rule, target = edge.target ?? edge.specifier, detail) => errors.push({ importer: edge.importer, target, rule, line: edge.line, column: edge.column, detail });
  const config = (file, build = false) => {
    let dir = dirname(file);
    while (dir.startsWith(root) && !existsSync(join(dir, "tsconfig.json")) && dir !== root) dir = dirname(dir);
    const configKey = `${dir}:${build}`;
    if (!configs.has(configKey)) {
      const path = join(dir, build && existsSync(join(dir, "tsconfig.build.json")) ? "tsconfig.build.json" : "tsconfig.json");
      let options = { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
      if (existsSync(path)) {
        const read = ts.readConfigFile(path, ts.sys.readFile);
        const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, dir);
        const failures = [read.error, ...parsed.errors.filter(e => e.code !== 18003)].filter(Boolean);
        if (failures.length) throw new Error(`${pathOf(path)}: ${failures.map(e => ts.flattenDiagnosticMessageText(e.messageText, " ")).join("; ")}`);
        options = { ...parsed.options, allowJs: true };
      }
      configs.set(configKey, options);
    }
    return configs.get(configKey);
  };
  const locate = (candidate, options) => {
    const variants = [candidate, candidate.replace(/\.d\.ts$/, ".ts"), candidate.replace(/\.js$/, ".ts"), candidate.replace(/\.mjs$/, ".mts"), candidate.replace(/\.cjs$/, ".cts"), ...[".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".d.ts", "/index.ts", "/index.tsx", "/index.js"].map(ext => candidate + ext)];
    for (const variant of variants) if (fileSet.has(variant) || assetPattern.test(variant) && existsSync(variant)) return variant;
    return ts.resolveModuleName(candidate, join(root, "__resolve.ts"), options, ts.sys).resolvedModule?.resolvedFileName;
  };
  const emittedSource = (workspace, target) => {
    const options = config(join(workspace.dir, "src", "__entry.ts"), true);
    if (!options.outDir || !target.startsWith(`${options.outDir}/`)) return locate(target, options);
    const sourceRoot = options.rootDir ?? workspace.dir;
    return locate(resolve(sourceRoot, relative(options.outDir, target)), options);
  };
  for (const file of files) {
    const importer = pathOf(file);
    let list;
    try { list = declarations(file, readFileSync(file, "utf8")); }
    catch (error) { report({ importer }, "parse", importer, error.message); continue; }
    if (list.directives.includes("use client")) clientFiles.add(importer);
    if (list.directives.includes("use server")) serverFiles.add(importer);
    const variants = owner(file).name === "@auto-tm/mobile" ? list.flatMap(declaration => ["ios", "android", "web"].map(platform => ({ ...declaration, platform }))) : list;
    for (const declaration of variants) {
      const workspace = owner(file);
      const edge = { ...declaration, importer, workspace: workspace.name, test: isTest(importer), composition: isComposition(importer) };
      edges.push(edge);
      if (!edge.specifier) {
        unsupported.push(edge);
        if (workspace !== rootPackage && !edge.test && /\/(?:src|app|components)\//.test(file)) report(edge, "unsupported-loader", edge.expression ?? "<missing>");
        continue;
      }
      const specifier = edge.specifier;
      const name = packageName(specifier);
      const effective = config(file);
      const options = edge.platform ? { ...effective, moduleSuffixes: edge.platform === "web" ? [".web", ""] : [`.${edge.platform}`, ".native", ""] } : effective;
      const alias = Object.keys(options.paths ?? {}).some(pattern => {
        const [before, after] = pattern.split("*");
        return pattern.includes("*") ? specifier.startsWith(before) && specifier.endsWith(after) : specifier === pattern;
      });
      const local = specifier.startsWith(".") || isAbsolute(specifier) || alias;
      const targetWorkspace = byName.get(name);
      if (builtins.has(specifier)) { edge.category = "builtin"; edge.target = specifier; continue; }
      if (!local) {
        const manifest = dependencyOwner(file);
        const declared = { ...(edge.test ? workspace.devDependencies : {}), ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies, ...manifest.devDependencies };
        if (!Object.hasOwn(declared, name)) report(edge, "direct-dependency", name);
      }
      let target;
      const esm = /\.m[jt]s$/.test(file) || workspace.type === "module" && options.moduleResolution === ts.ModuleResolutionKind.NodeNext && !/\.c[jt]s$/.test(file);
      if (esm && specifier.startsWith(".") && !edge.typeOnly && edge.kind !== "require" && !extname(specifier)) report(edge, "esm-extension", specifier);
      if (targetWorkspace && !local) {
        const subpath = specifier === name ? "." : `.${specifier.slice(name.length)}`;
        const runtimeOptions = config(file, true);
        const requireMode = edge.kind === "require" || edge.kind !== "dynamic" && (/\.c[jt]s$/.test(file) || runtimeOptions.module === ts.ModuleKind.CommonJS || runtimeOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext && workspace.type !== "module");
        const conditions = edge.typeOnly ? ["types", requireMode ? "require" : "import", "node"] : [requireMode ? "require" : "import", ...(edge.platform === "web" ? ["browser"] : edge.platform ? ["react-native"] : workspace.name === "@auto-tm/ui" ? ["browser"] : ["node"])];
        const entry = exported(targetWorkspace, subpath, conditions);
        if (!entry || !entry.startsWith("./") || entry.includes("../")) { report(edge, "workspace-export", specifier); continue; }
        target = emittedSource(targetWorkspace, resolve(targetWorkspace.dir, entry));
        edge.package = name;
        if (["@auto-tm/db", "@auto-tm/contracts"].includes(name) && !entry.startsWith("./dist/")) report(edge, "runtime-package-source", specifier, entry);
        if (!target) report(edge, "unresolved-workspace", specifier, entry);
      } else {
        const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, undefined, undefined, edge.kind === "require" ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext).resolvedModule;
        target = resolved?.resolvedFileName;
        if (local && !alias && !edge.typeOnly && /\.d\.[cm]?ts$/.test(target ?? "")) target = locate(resolve(dirname(file), specifier), options);
        if (local && !target) {
          if (alias) {
            for (const [pattern, paths] of Object.entries(options.paths)) {
              const [before, after] = pattern.split("*");
              if (!(specifier.startsWith(before) && (after === undefined || specifier.endsWith(after)))) continue;
              const wildcard = pattern.includes("*") ? specifier.slice(before.length, specifier.length - (after?.length ?? 0)) : "";
              for (const replacement of paths) target ??= locate(resolve(options.pathsBasePath ?? dirname(file), replacement.replace("*", wildcard)), options);
            }
          } else target = locate(resolve(dirname(file), specifier), options);
        }
        if (!local) { edge.category = "external"; edge.target = specifier; continue; }
        if (!target) {
          const candidate = resolve(dirname(file), specifier);
          if (generatedTarget(pathOf(candidate), workspace, importer)) {
            edge.category = "generated"; edge.target = pathOf(candidate); continue;
          }
          report(edge, "unresolved-first-party", specifier); continue;
        }
      }
      if (!target) continue;
      target = realpathSync(target);
      edge.target = pathOf(target);
      edge.category = generatedTarget(edge.target, workspace, importer) ? "generated" : assetPattern.test(target) ? "asset" : "source";
      const targetOwner = owner(target);
      if (local && targetOwner !== workspace && workspace !== rootPackage && !edge.test && !(importer === "apps/worker/scripts/video-fixture.ts" && edge.target === "scripts/local-video-fixture.cjs")) report(edge, "workspace-bypass");
      if (target.includes("/node_modules/") && local) report(edge, "dependency-bypass");
      if (!fileSet.has(target) && edge.category === "source") report(edge, "generated-source", edge.target);
      if (!edge.test && isTest(edge.target)) report(edge, "production-test");
      if (frontend(workspace) && (targetOwner.name === "@auto-tm/db" || targetOwner.dir?.startsWith(join(root, "apps")) && targetOwner !== workspace)) report(edge, "frontend-server");
      if (["@auto-tm/api", "@auto-tm/worker", "@auto-tm/sms-gateway"].includes(workspace.name) && targetOwner.name === "@auto-tm/ui") report(edge, "server-ui");
    }
  }
  const adjacency = new Map();
  for (const edge of edges) {
    const list = adjacency.get(edge.importer) ?? [];
    list.push(edge);
    adjacency.set(edge.importer, list);
  }
  const checkBoundary = (edge, target, name, transitive = false, publicEntry = false) => {
    if (edge.test) return;
    const from = feature(edge.importer);
    const to = feature(target);
    if (from?.[2].match(/^[^/]+\.public\.ts$/) && (persistence(name) || /^(?:infrastructure|presentation)\//.test(to?.[2] ?? "")) && !(edge.importer === "apps/api/src/modules/identity/identity.public.ts" && target === "apps/api/src/modules/identity/presentation/contactPhoneCodeException.ts")) report(edge, "public-export", target);
    if (from?.[2].startsWith("domain/") && (persistence(name) || framework(name) || to && !to[2].startsWith("domain/"))) report(edge, "domain-purity", target);
    if (from?.[2].startsWith("application/") && (persistence(name) || /^(?:infrastructure|presentation)\//.test(to?.[2] ?? "") && !(publicEntry && to?.[2] === "presentation/contactPhoneCodeException.ts" && to[1] === "identity"))) report(edge, "application-layer", target);
    if ((!transitive || /^(?:infrastructure|presentation)\//.test(to?.[2] ?? "") && !(publicEntry && target === "apps/api/src/modules/identity/presentation/contactPhoneCodeException.ts")) && from && to && from[1] !== to[1] && !(publicFeature(to[2]) && (to[1] !== "identity" || to[2] === "identity.public.ts")) && !(edge.composition && isComposition(target))) report(edge, "feature-public", target);
    if (frontend(byName.get(edge.workspace)) && bundledSource(edge.importer) && (persistence(name) || framework(name) && /^(?:@nestjs\/|nestjs-|fastify|express$|socket.io$)/.test(name) || builtins.has(name))) report(edge, "frontend-server", target);
  };
  for (const edge of edges) {
    if (!edge.target) continue;
    checkBoundary(edge, edge.target, edge.package ?? edge.specifier);
    const visited = new Set();
    const follow = target => {
      if (visited.has(target)) return;
      visited.add(target);
      for (const next of adjacency.get(target) ?? []) {
        if (!next.target) continue;
        const from = feature(edge.importer);
        if (next.kind === "export" || next.reexport || from?.[2].startsWith("domain/")) {
          checkBoundary(edge, next.target, next.package ?? next.specifier, true, edge.target === "apps/api/src/modules/identity/identity.public.ts");
          follow(next.target);
        }
      }
    };
    follow(edge.target);
  }
  for (const entry of edges.filter(e => !e.test && (frontend(byName.get(e.workspace)) && bundledSource(e.importer) || clientFiles.has(e.importer)))) {
    const seen = new Set();
    const walk = edge => {
      if (!edge.target || seen.has(edge.target)) return;
      seen.add(edge.target);
      if (edge.typeOnly) {
        if (persistence(edge.package ?? edge.specifier)) report(entry, "frontend-server", edge.target);
        return;
      }
      if (builtins.has(edge.target) || persistence(edge.package ?? edge.specifier) || ["server-only", "next/headers", "next/server"].includes(edge.specifier)) report(entry, "frontend-server", edge.target);
      if (edge.category === "source") {
        if (serverFiles.has(edge.target) && !frontend(byName.get(entry.workspace))) return;
        for (const next of adjacency.get(edge.target) ?? []) walk(next);
      }
    };
    walk(entry);
  }
  const cycles = new Set();
  for (const platform of ["ios", "android", "web"]) {
    const active = new Set();
    const done = new Set();
    const stack = [];
    const visit = file => {
      if (done.has(file)) return;
      active.add(file); stack.push(file);
      for (const edge of adjacency.get(file) ?? []) {
        if (edge.platform && edge.platform !== platform) continue;
        if (edge.typeOnly || ["dynamic", "resolve"].includes(edge.kind) || edge.category !== "source") continue;
        if (active.has(edge.target)) {
          const cycle = stack.slice(stack.indexOf(edge.target));
          const identity = [...cycle].sort().join(" -> ");
          if (!cycles.has(identity)) { cycles.add(identity); report(edge, "runtime-cycle", cycle.concat(edge.target).join(" -> ")); }
        } else visit(edge.target);
      }
      stack.pop(); active.delete(file); done.add(file);
    };
    for (const file of adjacency.keys()) visit(file);
  }
  const available = new Map();
  for (const allowance of allowances) {
    if (!allowance.reason || !allowance.owner || !/^https:\/\/github.com\/Carberk\/carberk\/issues\/13(?:45|46|47|48|49|50)$/.test(allowance.issue) || !Number.isInteger(allowance.count) || allowance.count < 1 || allowance.rule === "domain-purity" || /[*]/.test(allowance.importer + allowance.target)) {
      errors.push({ ...allowance, rule: "invalid-allowance" }); continue;
    }
    if (available.has(key(allowance))) errors.push({ ...allowance, rule: "duplicate-allowance" });
    available.set(key(allowance), { ...allowance, used: 0 });
  }
  const unique = [...new Map(errors.map(e => [JSON.stringify([e.importer, e.target, e.rule, e.line, e.column]), e])).values()];
  const rejected = unique.filter(error => {
    const allowance = available.get(key(error));
    if (!allowance || allowance.used >= allowance.count) return true;
    allowance.used++; return false;
  });
  for (const allowance of available.values()) if (allowance.used !== allowance.count) rejected.push({ ...allowance, rule: "unused-allowance" });
  return { errors: rejected, edges, unsupported, allowances: [...available.values()], files: files.length, configs: [...configs.keys()].map(pathOf) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkRepository(process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url)));
    console.log(`Import architecture: ${result.files} TS/JS files, ${new Set(result.edges.map(e => `${e.importer}:${e.line}:${e.column}`)).size} declarations (${result.edges.length} platform resolutions), ${result.configs.length} effective configs; static runtime cycles exclude explicit types and dynamic/lazy imports. External internals and generated output internals are not traversed.`);
    console.log(`Categories: ${JSON.stringify(result.edges.reduce((counts, e) => { const category = e.category ?? "unsupported/unresolved"; counts[category] = (counts[category] ?? 0) + 1; return counts; }, {}))}`);
    for (const edge of result.unsupported) console.log(`Unsupported nonliteral ${edge.kind}: ${edge.importer}:${edge.line} ${edge.expression}`);
    for (const error of result.errors) console.error(`${error.importer}:${error.line ?? 0} ${error.rule}: ${error.target} ${error.detail ?? ""}`);
    console.log(`Legacy allowances: ${result.allowances.reduce((sum, a) => sum + a.used, 0)} used; ${result.errors.length} errors`);
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
