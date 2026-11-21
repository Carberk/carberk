import { basename, extname } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { parse as parseHtml } from "parse5";
import { parseAllDocuments, isMap, isSeq, isScalar, isAlias } from "yaml";
import { validateAsset } from "./assets.mjs";
import { javascriptComments } from "./javascript.mjs";
import { parseConfig } from "./config.mjs";
import { parseMarkdown } from "./markdown.mjs";
import { parseShell, shellExecutableOption } from "./shell.mjs";
import { parseDocker } from "./docker.mjs";
import { parseMake } from "./make.mjs";
import { parsePython } from "./python.mjs";
import { parseRuby } from "./ruby.mjs";
import { parseCss } from "./css.mjs";
import { parseMarkup } from "./markup.mjs";
import { parseYaml } from "./yaml.mjs";
import { parseNative } from "./native.mjs";
import { parsePrisma } from "./prisma.mjs";
import { parseSql } from "./sql.mjs";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";

const extensions = new Map(Object.entries({
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript", cjs: "javascript", mts: "typescript", cts: "typescript",
  py: "python", css: "css", html: "html", htm: "html", xml: "xml", svg: "xml", yaml: "yaml", yml: "yaml", json: "json",
  sh: "shell", bash: "bash", zsh: "zsh", mk: "make", kt: "kotlin", swift: "swift", kts: "kotlin-gradle", gradle: "groovy-gradle",
  prisma: "prisma", sql: "sql", toml: "toml", ini: "ini", properties: "properties", env: "env", service: "systemd", socket: "systemd",
  timer: "systemd", target: "systemd", mount: "systemd", pro: "proguard", rb: "ruby", podspec: "ruby", md: "markdown", markdown: "markdown",
}));
const binary = new Set(["png", "jpg", "jpeg", "ico", "jar", "ttf", "otf", "woff2", "mp4"]);
const dataPaths = new Set(["LICENSE", "docs/prd/ui/research/reference-screens-2026-09-21-inventory.csv",
  "apps/mobile/assets/fonts/Geist-OFL.txt", "docs/prd/ops/brand/tools/Poppins-OFL.txt",
  ...["en", "ru", "tk"].map((locale) => `docs/prd/ops/play-console-submission/text/${locale}.txt`)]);

export function sourceType(path) {
  const name = basename(path);
  if (name === "Caddyfile" || name.endsWith(".caddy")) return "caddy";
  if (name === "Dockerfile" || /\.Dockerfile$/i.test(name)) return "docker";
  if (/^(?:GNUmakefile|Makefile|makefile)$/.test(name)) return "make";
  if (/^\.env(?:\.|$)/.test(name)) return "env";
  if ([".gitignore", ".dockerignore", ".git/info/exclude", "CODEOWNERS"].includes(name)) return "ignore";
  if (name === ".editorconfig") return "ini";
  if (name === ".npmrc") return "npmrc";
  if (name === ".nvmrc") return "nvmrc";
  if (path === "infra/egress/ingress.conf.template") return "nginx";
  if (/\.(?:template|tmpl|tpl|example)$/i.test(name)) {
    const nested = sourceType(path.replace(/\.[^.]+$/, ""));
    return nested.startsWith("unknown") ? "unknown-template" : nested;
  }
  if (name === "gradlew" || name === "pr-wait") return "shell";
  const extension = extname(path).slice(1).toLowerCase();
  if (binary.has(extension)) return `asset:${extension}`;
  if (name === ".gitkeep") return "empty";
  if (dataPaths.has(path)) return "data";
  return extensions.get(extension) ?? `unknown:${extension || name}`;
}

function parseJson({ source, path, fileType, adapters }) {
  if (fileType === "json" && !/(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/.test(path)) {
    JSON.parse(source);
    const result = { comments: [], deferred: [] };
    if (/^package\.json(?:\.(?:template|tmpl|tpl|example))?$/.test(basename(path))) {
      const file = ts.parseJsonText(path, source);
      const root = file.statements[0]?.expression;
      if (!ts.isObjectLiteralExpression(root)) throw new Error(`${path}: package manifest must be an object`);
      const declarations = root.properties.filter((property) => property.name?.text === "scripts");
      if (!declarations.length) return result;
      if (declarations.length !== 1) throw new Error(`${path}: duplicate scripts properties require one effective manifest`);
      const scripts = declarations[0].initializer;
      if (!ts.isObjectLiteralExpression(scripts)) throw new Error(`${path}: package scripts must be an object`);
      for (const property of scripts?.properties ?? []) {
        const program = property.initializer;
        if (!ts.isStringLiteral(program)) throw new Error(`${path}: package script must be a string`);
        const start = program.getStart(file), end = program.end;
        const raw = source.slice(start + 1, end - 1);
        if (raw !== program.text) result.deferred.push({ path, fileType: "shell", startOffset: start, endOffset: end,
          reason: "encoded package script requires source mapping" });
        else embeddedResult({ source, content: raw, offsets: Array.from({ length: raw.length + 1 }, (_, i) => start + 1 + i),
          fileType: "shell", path, adapters, result });
      }
    }
    return result;
  }
  const parsed = ts.parseConfigFileTextToJson(path, source);
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, " "));
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const comments = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token)) {
      comments.push(commentSpan(source, scanner.getTokenPos(), scanner.getTextPos()));
    }
  }
  return { comments, deferred: [] };
}

function markup(input) {
  const result = parseMarkup(input);
  const visit = (node) => {
    for (const attribute of node.attrs ?? []) {
      const location = node.sourceCodeLocation?.attrs?.[attribute.name];
      const language = /^on[a-z]+$/i.test(attribute.name) ? "javascript-attribute" : attribute.name === "srcdoc" ? "html-attribute" :
        /^javascript:/i.test(attribute.value) && ["href", "src", "action", "formaction"].includes(attribute.name) ? "javascript-url" :
          attribute.name === "style" ? "css" : undefined;
      if (!language || !location) continue;
      const { startOffset, endOffset } = location;
      const raw = input.source.slice(startOffset, endOffset);
      const match = raw.match(/^[^=]+=[ \t]*(?:"([\s\S]*)"|'([\s\S]*)'|([^\s>]+))$/);
      const content = match && (match[1] ?? match[2] ?? match[3]);
      if (language !== "css" || content !== attribute.value) {
        result.deferred.push({ path: input.path, fileType: language, startOffset, endOffset,
          reason: "executable markup attribute requires declared grammar and source mapping" });
      } else {
        const begin = startOffset + raw.indexOf(content, raw.indexOf("=") + 1);
        embeddedResult({ source: input.source, content, offsets: Array.from({ length: content.length + 1 }, (_, i) => begin + i),
          fileType: "css", path: input.path, adapters: input.adapters, result });
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseHtml(input.source, { sourceCodeLocationInfo: true }));
  return result;
}

function executableYaml(input) {
  const embedded = [];
  const executableLimits = [];
  const walk = (node, path = []) => {
    const executionContainer = path.length === 0 || path[0] === "services" && path.length <= 2 ||
      path[0] === "jobs" && (path.length <= 2 || path[2] === "steps" && path.length <= 4) ||
      path[0] === "runs" && (path.length === 1 || path[1] === "steps" && path.length <= 3);
    const aliasLimit = () => executableLimits.push({ path: input.path,
      fileType: path[0] === "services" ? "compose-executable" : "yaml-executable", startOffset: 0, endOffset: input.source.length,
      reason: "executable configuration alias or merge requires declared source mapping" });
    if (executionContainer && isAlias(node)) aliasLimit();
    if (isMap(node)) for (const pair of node.items) {
      if (!isScalar(pair.key)) continue;
      const next = [...path, pair.key.value];
      if (executionContainer && pair.key.value === "<<") { aliasLimit(); continue; }
      const runField = pair.key.value === "run" && (path.length === 4 && path[0] === "jobs" && path[2] === "steps" && Number.isInteger(path[3]) ||
        path.length === 3 && path[0] === "runs" && path[1] === "steps" && Number.isInteger(path[2]));
      if (path.length === 2 && path[0] === "services" && ["command", "entrypoint"].includes(pair.key.value)) {
        const fields = ["entrypoint", "command"].map((key) => node.get(key, true)).filter((value) => value != null);
        const values = fields.map((value) => isScalar(value) && typeof value.value === "string" ?
          value.value.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [] : isSeq(value) && value.items.every((item) => isScalar(item) && typeof item.value === "string") ?
            value.items.map((item) => item.value) : undefined);
        const argv = values.flat().map((value) => typeof value === "string" ? value.replace(/^(["'])([\s\S]*)\1$/, "$2") : value);
        const command = argv[0] && basename(argv[0]);
        const interpreter = /^(?:(?:ba|da|k|mk)?sh|python[23]?|node|ruby|perl)$/.test(command ?? "");
        if (values.includes(undefined) || ["env", "tini", "dumb-init"].includes(command) ||
          interpreter && argv.slice(1).some((value) => shellExecutableOption(value))) {
          if (!executableLimits.some((item) => item.fileType === "compose-executable")) executableLimits.push({ path: input.path,
            fileType: "compose-executable", startOffset: 0, endOffset: input.source.length,
            reason: "Compose interpreter argv or alias requires declared grammar and source mapping" });
        }
        continue;
      }
      if (isScalar(pair.value) && typeof pair.value.value === "string" &&
        runField) {
        const shell = node.get("shell") ?? "bash";
        embedded.push({ path: next, document: documentIndex, fileType: /^(?:ba)?sh(?:\s|$)/.test(shell) ? "bash" : shell });
      } else if (runField && pair.value?.range) {
        executableLimits.push({ path: input.path, fileType: "workflow-run", startOffset: pair.value.range[0], endOffset: pair.value.range[1],
          reason: "workflow executable alias requires declared source mapping" });
      } else walk(pair.value, next);
    }
    if (isSeq(node)) node.items.forEach((item, i) => walk(item, [...path, i]));
  };
  let documentIndex = 0;
  for (const document of parseAllDocuments(input.source)) { walk(document.contents); documentIndex++; }
  const documents = parseAllDocuments(input.source, { keepSourceTokens: true });
  const blocks = [];
  const result = { comments: [], deferred: [] };
  for (const declaration of embedded) {
    const scalar = documents[declaration.document].getIn(declaration.path, true);
    if (scalar.type === "BLOCK_LITERAL") { blocks.push(declaration); continue; }
    const start = scalar.range[0];
    const raw = input.source.slice(start, scalar.range[1]);
    const quote = ["'", '"'].includes(raw[0]) ? raw[0] : undefined;
    let content = "";
    const offsets = [];
    const limit = raw.length - Number(Boolean(quote));
    for (let index = Number(Boolean(quote)); index < limit; index++) {
      let char = raw[index];
      const begin = index;
      if (quote === "'" && char === "'" && raw[index + 1] === "'") index++;
      else if (quote === '"' && char === "\\") {
        const match = raw.slice(index).match(/^\\(?:[0abtnvfre "/\\N_LP]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/);
        if (!match) break;
        const value = parseAllDocuments(`value: "${match[0]}"`)[0].get("value");
        if (typeof value !== "string") break;
        char = value; index += match[0].length - 1;
      }
      for (const unit of char.split("")) { content += unit; offsets.push(start + begin); }
    }
    if (content !== scalar.value) {
      result.deferred.push({ path: input.path, fileType: declaration.fileType, startOffset: start, endOffset: scalar.range[1],
        reason: "folded executable scalar requires source mapping" });
      continue;
    }
    offsets.push(start + limit);
    embeddedResult({ source: input.source, content, offsets, fileType: declaration.fileType, path: input.path, adapters: input.adapters, result });
  }
  const host = parseYaml({ ...input, fileType: "yaml", embedded: blocks });
  return { comments: [...host.comments, ...result.comments].sort((a, b) => a.startOffset - b.startOffset),
    deferred: [...host.deferred, ...result.deferred, ...executableLimits] };
}

const adapters = {};
for (const [names, adapter] of [
  [["javascript", "js", "jsx", "typescript", "ts", "tsx"], (input) => {
    const suffix = { javascript: "js", typescript: "ts" }[input.fileType] ?? input.fileType;
    const comments = javascriptComments(`embedded.${suffix}`, input.source).map((item) => ({ ...item,
      startOffset: input.source.split("\n").slice(0, item.start.line - 1).join("\n").length + Number(item.start.line > 1) + item.start.column,
      endOffset: input.source.split("\n").slice(0, item.end.line - 1).join("\n").length + Number(item.end.line > 1) + item.end.column }));
    return { comments, deferred: [] };
  }],
  [["python", "py", "python3"], (input) => parsePython({ ...input, fileType: "python", executable: true })],
  [["ruby"], parseRuby],
  [["shell", "sh", "bash"], (input) => parseShell({ ...input, fileType: "shell", dialect: input.fileType === "sh" ? "posix" : "bash", executable: true })],
  [["css"], parseCss], [["html", "xml"], markup], [["yaml", "yml"], executableYaml],
  [["docker", "dockerfile"], (input) => parseDocker({ ...input, fileType: "docker" })], [["make", "makefile"], (input) => parseMake({ ...input, fileType: "make" })],
  [["kotlin", "kt", "swift"], (input) => parseNative({ ...input, fileType: input.fileType === "kt" ? "kotlin" : input.fileType })],
  [["kotlin-gradle", "groovy-gradle"], (input) => parseNative({ ...input, fileType: "gradle", dialect: input.fileType.split("-")[0] })],
  [["prisma"], parsePrisma], [["sql", "postgresql"], (input) => parseSql({ ...input, fileType: "sql" })],
  [["toml", "ini", "properties", "env", "systemd", "proguard", "caddy", "nginx", "ignore", "npmrc", "nvmrc"], parseConfig],
  [["json", "jsonc"], parseJson], [["markdown", "md"], parseMarkdown],
]) for (const name of names) adapters[name] = adapter;

export function inspectSource(path, source, notices = []) {
  const fileType = sourceType(path);
  if (fileType === "data" || fileType === "empty" && source === "") return { comments: [], deferred: [], fileType };
  if (fileType.startsWith("asset:")) {
    if (!(path === "packages/db/scripts/ui-fixtures/synthetic-video/v1/invalid.mp4" && source.toString() === "Carberk synthetic SOURCE_INVALID UI input v1: deliberately not MP4.\n")) {
      validateAsset(path, source, fileType.slice(6));
    }
    return { comments: [], deferred: [], fileType };
  }
  let result;
  if (/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(path)) {
    result = { comments: javascriptComments(path, source, notices), deferred: [] };
  } else if (adapters[fileType]) {
    try { result = adapters[fileType]({ path, source, fileType, adapters }); }
    catch (error) { result = { comments: [], deferred: [{ path, fileType, startOffset: 0, endOffset: source.length, reason: error.message }] }; }
  } else result = { comments: [], deferred: [{ path, fileType, startOffset: 0, endOffset: source.length, reason: `unsupported source grammar ${fileType}` }] };
  for (const comment of result.comments) {
    comment.exception ||= notices.some((notice) => notice.path === path && notice.origin &&
      notice.tokenSha256 === createHash("sha256").update(comment.raw).digest("hex"));
    comment.identity ??= createHash("sha256").update(JSON.stringify([comment.raw, comment.language ?? fileType,
      source.slice(comment.endOffset).trimStart().split("\n")[0]])).digest("hex");
  }
  return { ...result, fileType };
}
