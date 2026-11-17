import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export type LegacyEntry = { file: string; rules: string[] };
type Value = { text?: string; source?: boolean };
const empty: Value = {};
const specPattern = /\.(spec|test)\.[cm]?[jt]sx?$/;

export function mobileSpecFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", ".git", ".expo", "dist", "android", "ios"].includes(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? mobileSpecFiles(path) : specPattern.test(entry.name) ? [path] : [];
  }).sort();
}

export function inspectMobileSpec(root: string, file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const configPath = join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, root).options;
  const bindings = new Map<ts.Node, Map<string, ts.Expression | ts.FunctionDeclaration>>();
  function bind(node: ts.Node, name: string, value: ts.Expression | ts.FunctionDeclaration) {
    let scope = node.parent;
    while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isFunctionLike(scope)) scope = scope.parent;
    const names = bindings.get(scope) ?? new Map();
    names.set(name, value);
    bindings.set(scope, names);
  }
  function definition(node: ts.Identifier): ts.Expression | ts.FunctionDeclaration | undefined {
    let scope: ts.Node | undefined = node;
    while (scope) {
      const value = bindings.get(scope)?.get(node.text);
      if (value) return value;
      scope = scope.parent;
    }
    return undefined;
  }
  const imports = new Map<string, { module: string; name: string }>();
  const calls: ts.CallExpression[] = [];
  const rules = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { module, name: "default" });
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        imports.set(clause.namedBindings.name.text, { module, name: "*" });
      } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) imports.set(item.name.text, { module, name: (item.propertyName ?? item.name).text });
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bind(node, node.name.text, node.initializer);
    }
    if (ts.isFunctionDeclaration(node) && node.name) bind(node, node.name.text, node);
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);

  function imported(node: ts.Expression): { module: string; name: string } | undefined {
    if (ts.isIdentifier(node)) return imports.get(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      const parent = imported(node.expression);
      if (parent) return { module: parent.module, name: node.name.text };
    }
    return undefined;
  }

  function componentOrHook(path: string): boolean {
    if (/\.(json|ya?ml|css|html|md)$/.test(path) || /(?:config|\.config)\.[cm]?[jt]s$/.test(path)) return false;
    if (/\.tsx$|(?:^|\/)use[^/]*\.[cm]?[jt]s$/.test(path)) return true;
    if (!existsSync(path)) return false;
    const text = readFileSync(path, "utf8");
    return /\bfunction\s+use[A-Z]|\b(?:const|let)\s+use[A-Z]/.test(text);
  }

  function evaluate(node: ts.Node | undefined, env = new Map<string, Value>(), depth = 0): Value {
    if (!node || depth > 30) return empty;
    const next = (child: ts.Node | undefined) => evaluate(child, env, depth + 1);
    if (ts.isStringLiteralLike(node)) return { text: node.text };
    if (ts.isIdentifier(node)) {
      if (node.text === "__dirname") return { text: dirname(file) };
      return env.get(node.text) ?? next(definition(node));
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (node.getText(source) === "import.meta.dirname") return { text: dirname(file) };
      if (node.getText(source) === "import.meta.url") return { text: new URL(`file://${file}`).href };
      return next(node.expression);
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = imported(node.expression);
      const args = [...(node.arguments ?? [])].map(next);
      if (name && /^(node:)?path$/.test(name.module) && ["resolve", "join", "dirname"].includes(name.name)) {
        if (args.every(arg => arg.text !== undefined)) {
          const parts = args.flatMap(arg => arg.text === undefined ? [] : [arg.text]);
          return { text: name.name === "dirname" ? dirname(parts[0] ?? "") : name.name === "join" ? join(...parts) : resolve(...parts) };
        }
      }
      if (ts.isNewExpression(node) && node.expression.getText(source) === "URL" && args[0]?.text && args[1]?.text) {
        return { text: new URL(args[0].text, args[1].text).href };
      }
      if (name && /^(node:)?url$/.test(name.module) && name.name === "fileURLToPath" && args[0]?.text) return { text: fileURLToPath(args[0].text) };
      if (name && /^(node:)?fs(?:\/promises)?$/.test(name.module) && ["readFileSync", "readFile"].includes(name.name)) {
        let target = evaluate(node.arguments?.[0], env).text;

        if (target?.startsWith("file:")) target = fileURLToPath(target);
        return { source: target === undefined || componentOrHook(resolve(dirname(file), target)) };
      }
      if (name && ["typescript", "@babel/parser"].includes(name.module) && ["createSourceFile", "parse"].includes(name.name)) return empty;
      const fn = ts.isIdentifier(node.expression) ? definition(node.expression) : undefined;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) && fn.body) {
        const bound = new Map(env);
        fn.parameters.forEach((parameter, index) => {
          if (ts.isIdentifier(parameter.name)) bound.set(parameter.name.text, args[index] ?? empty);
        });
        if (!ts.isBlock(fn.body)) return evaluate(fn.body, bound, depth + 1);
        const returned = fn.body.statements.find(ts.isReturnStatement);
        if (returned) return evaluate(returned.expression, bound, depth + 1);
      }
      return { source: args.some(arg => arg.source) || next(node.expression).source };
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = next(node.left), right = next(node.right);
      return { text: left.text !== undefined && right.text !== undefined ? left.text + right.text : undefined, source: left.source || right.source };
    }
    const values: Value[] = [];
    ts.forEachChild(node, child => { values.push(next(child)); });
    return { source: values.some(value => value.source) };
  }

  function resolveTarget(target: string): string {
    const resolved = ts.resolveModuleName(target, file, options, ts.sys).resolvedModule?.resolvedFileName;
    return relative(root, resolved ?? (target.startsWith("@/") ? join(root, target.slice(2)) : resolve(dirname(file), target))).replaceAll("\\", "/").replace(/\.[cm]?[jt]sx?$/, "");
  }

  function ownApi(path: string, seen = new Set<string>()): boolean {
    if (path === "src/api/client") return true;
    if (!path.startsWith("src/api/") || seen.has(path)) return false;
    if (/^src\/api\/(?:.*\/)?use[^/]*$/.test(path)) return true;
    seen.add(path);
    const target = [".ts", ".tsx", "/index.ts"].map(extension => join(root, path + extension)).find(existsSync);
    if (!target) return false;
    const module = ts.createSourceFile(target, readFileSync(target, "utf8"), ts.ScriptTarget.Latest, true);
    return module.statements.some(statement => {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text.match(/^use[A-Z]/)) return true;
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && /^use[A-Z]/.test(item.name.text))) return true;
      if (!ts.isExportDeclaration(statement)) return false;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some(item => /^use[A-Z]/.test(item.name.text))) return true;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
      const resolved = ts.resolveModuleName(statement.moduleSpecifier.text, target, options, ts.sys).resolvedModule?.resolvedFileName;
      return resolved ? ownApi(relative(root, resolved).replaceAll("\\", "/").replace(/\.[cm]?[jt]sx?$/, ""), seen) : false;
    });
  }

  for (const call of calls) {
    const name = imported(call.expression);
    const method = ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";
    const receiver = ts.isPropertyAccessExpression(call.expression) ? call.expression.expression.getText(source) : "";
    if (["mock", "doMock", "spyOn"].includes(method) && (["vi", "jest"].includes(receiver) || name?.module === "vitest")) {
      const argument = call.arguments[0];
      let target = evaluate(argument).text;
      if (argument && ts.isCallExpression(argument) && argument.expression.kind === ts.SyntaxKind.ImportKeyword) target = evaluate(argument.arguments[0]).text;
      if (method === "spyOn" && argument) target = imports.get(argument.getText(source))?.module;
      if (target) {
        const path = resolveTarget(target);
        if (ownApi(path) && !(relative(root, file).replaceAll("\\", "/") === "src/api/client.spec.ts" && path === "src/api/client")) {
          rules.add("own-api-mock");
        }
      }
    }
    if ((ts.isIdentifier(call.expression) && (call.expression.text === "expect" || name?.name === "expect")) && call.arguments.some(argument => evaluate(argument).source)) rules.add("source-text-assertion");
  }
  return [...rules].sort();
}

export function checkMobileSpecs(root: string, legacy: LegacyEntry[], previous?: LegacyEntry[]): string[] {
  const violations = new Map(mobileSpecFiles(root).map(file => [relative(root, file).replaceAll("\\", "/"), inspectMobileSpec(root, file)]));
  const messages: string[] = [];
  const allowed = new Map(legacy.map(entry => [entry.file, entry.rules]));
  if (previous) {
    for (const entry of legacy) {
      const old = previous.find(item => item.file === entry.file);
      for (const rule of entry.rules) if (!old?.rules.includes(rule)) messages.push(`${entry.file}: legacy-allowlist may only shrink; added ${rule}`);
    }
  }
  if (allowed.size !== legacy.length) messages.push("legacy-allowlist: duplicate file");
  for (const [file, rules] of violations) {
    for (const rule of rules) if (!allowed.get(file)?.includes(rule)) messages.push(`${file}: ${rule}; use real components/hooks/client with MSW at the network boundary`);
  }
  for (const entry of legacy) {
    if (!entry.rules.length || new Set(entry.rules).size !== entry.rules.length) messages.push(`${entry.file}: invalid legacy-allowlist rules`);
    for (const rule of entry.rules) if (!violations.get(entry.file)?.includes(rule)) messages.push(`${entry.file}: stale legacy-allowlist ${rule}; remove the repaired entry`);
  }
  return messages.sort();
}
