import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import ts from "typescript";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function compilerComments(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const accepted = new Set();
  const tags = new Set(["type", "param", "returns", "return", "typedef", "template", "satisfies", "this"]);
  const visit = (node) => {
    for (const doc of node.jsDoc ?? []) {
      const parsed = ts.parseIsolatedJSDocComment(source.slice(doc.pos, doc.end));
      if (parsed.diagnostics.length || doc.comment || !doc.tags?.length) continue;
      if (!doc.tags.every((tag) => tags.has(tag.tagName.text) && !tag.comment &&
        (tag.typeExpression || tag.tagName.text === "template" && tag.typeParameters?.length))) continue;
      const target = ts.isVariableStatement(node) && node.declarationList.declarations.length === 1 ?
        node.declarationList.declarations[0].initializer : node;
      const signature = target && ts.isFunctionLike(target) ? target : undefined;
      if (!doc.tags.every((tag) => {
        const name = tag.tagName.text;
        if (name === "typedef") return Boolean(tag.fullName);
        if (name === "template") return Boolean(signature || doc.tags.some((entry) => entry.tagName.text === "typedef"));
        if (name === "param") return signature?.parameters.some((parameter) =>
          parameter.name.getText(file) === tag.name?.getText(file).split(".")[0]);
        if (name === "this") return Boolean(signature && !ts.isArrowFunction(signature));
        if (["returns", "return"].includes(name)) return Boolean(signature);
        if (["type", "satisfies"].includes(name)) return ts.isParenthesizedExpression(node) ||
          ts.isVariableStatement(node) && node.declarationList.declarations.length === 1 &&
          (name === "type" || Boolean(node.declarationList.declarations[0].initializer));
        return false;
      })) continue;
      accepted.add(`${doc.pos}:${doc.end}`);
    }
    ts.forEachChild(node, visit);
  };
  if (/\.[cm]?jsx?$/i.test(path)) visit(file);
  return { file, accepted };
}

export function javascriptComments(path, source, notices = []) {
  const typescript = /\.[cm]?tsx?$/i.test(path);
  const ast = parse(source, {
    sourceType: "unambiguous", tokens: true, attachComment: false,
    plugins: [...(typescript ? [["typescript", { dts: /\.d\.[cm]?ts$/i.test(path) }]] : []),
      ...(/\.[jt]sx$/i.test(path) ? ["jsx"] : []), "decorators-legacy"],
  });
  const tokens = ast.tokens.filter((token) => typeof token.type !== "string" && token.type.label !== "eof");
  let compiler;
  const list = [...ast.comments];
  if (ast.program.interpreter) list.unshift(ast.program.interpreter);
  return list.map((comment) => {
    const raw = source.slice(comment.start, comment.end);
    const next = tokens.findIndex((token) => token.start >= comment.end);
    const index = next < 0 ? tokens.length : next;
    const ownLine = !source.slice(source.lastIndexOf("\n", comment.start - 1) + 1, comment.start).trim();
    const anchor = tokens.slice(ownLine ? index : Math.max(0, index - 5), index + 5)
      .map((token) => source.slice(token.start, token.end));
    let exception = comment.type === "InterpreterDirective" && comment.start === 0 &&
      /^#!(?:\/usr\/bin\/env (?:node|tsx)|\/usr\/bin\/node)$/.test(raw);
    if (notices.some((notice) => notice.path === path && notice.tokenSha256 === digest(raw) && notice.origin)) exception = true;
    if (/^\/\/\/ <reference (?:types|path)="[^"<>\r\n]+" \/>$/.test(raw) &&
      source.slice(0, comment.start).replace(/^\/\/\/ <reference (?:types|path)="[^"<>\r\n]+" \/>\r?\n/gm, "").trim() === "") {
      compiler ??= compilerComments(path, source);
      const references = [...compiler.file.typeReferenceDirectives, ...compiler.file.referencedFiles];
      exception ||= typescript && references.some((reference) => reference.pos >= comment.start && reference.end <= comment.end);
    }
    if (raw.startsWith("/**")) {
      compiler ??= compilerComments(path, source);
      exception ||= compiler.accepted.has(`${comment.start}:${comment.end}`);
    }
    if (raw === "// @ts-check" && /\.[cm]?jsx?$/i.test(path) && !source.slice(0, comment.start).trim()) exception = true;
    return {
      start: comment.loc.start, end: comment.loc.end, raw, exception,
      identity: digest(JSON.stringify([raw, anchor])),
    };
  });
}

