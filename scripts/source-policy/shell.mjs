import sh from "mvdan-sh";
import { basename } from "node:path";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";

const { syntax } = sh;
const interpreters = new Map([["sh", "posix"], ["dash", "posix"], ["bash", "bash"], ["ksh", "mksh"], ["mksh", "mksh"]]);
const languages = new Map([["posix", syntax.LangPOSIX], ["bash", syntax.LangBash], ["mksh", syntax.LangMirBSDKorn]]);

export function shellInterpreter(command) {
  return interpreters.get(basename(command));
}

export function parseShell({ path, source, fileType, executable = false, dialect = "posix", adapters = {} }) {
  if (fileType !== "shell") throw new Error(`${path}: expected configured shell file type`);
  const result = { comments: [], deferred: [] };
  const shebang = source.match(/^#!([^\r\n]+)(?:\n|$)/);
  let acceptedShebang = false;
  if (shebang && executable) {
    const declaration = shebang[1].match(/^(?:\/usr\/bin\/env (?:-S )?)?((?:\/[\w.-]+\/)*[\w.-]+)(?: ([\w -]+))?$/);
    const selected = declaration && shellInterpreter(declaration[1]);
    if (!selected || declaration[2] && !/^(?:-[euxnvf]+|-[euxnvf]*o (?:errexit|nounset|pipefail))(?: (?:-[euxnvf]+|-[euxnvf]*o (?:errexit|nounset|pipefail)))*$/.test(declaration[2])) throw new Error(`${path}: unsupported shell shebang`);
    dialect = selected;
    acceptedShebang = true;
  }
  if (!languages.has(dialect)) throw new Error(`${path}: unsupported shell grammar ${dialect}`);
  const bytes = Buffer.from(source);
  const offset = (position) => bytes.subarray(0, position.Offset()).toString("utf8").length;
  let tree;
  try {
    tree = syntax.NewParser(syntax.KeepComments(true), syntax.Variant(languages.get(dialect))).Parse(source, path);
  } catch (error) {
    throw new Error(`${path}: shell parse failed (${dialect}): ${error.Error?.() ?? error.message ?? String(error)}`);
  }
  const defer = (node, reason) => result.deferred.push({ path, fileType: "shell", startOffset: offset(node.Pos()), endOffset: offset(node.End()), reason });
  const literal = (word) => {
    if (word?.Parts.length !== 1) return undefined;
    const part = word.Parts[0];
    const type = syntax.NodeType(part);
    if (type === "Lit" && !/[\\]/.test(part.Value)) return { value: part.Value, start: offset(part.Pos()) };
    if (type === "SglQuoted" && !part.Dollar) return { value: part.Value, start: offset(part.Pos()) + 1 };
    if (type === "DblQuoted" && part.Parts.length === 1 && syntax.NodeType(part.Parts[0]) === "Lit" && !/[\\]/.test(part.Parts[0].Value)) {
      return { value: part.Parts[0].Value, start: offset(part.Parts[0].Pos()) };
    }
    return undefined;
  };
  const embedded = (content, start, grammar, nestedDialect) => {
    const offsets = Array.from({ length: content.length + 1 }, (_, index) => start + index);
    embeddedResult({ source, content, offsets, path, fileType: grammar, result,
      adapters: { ...adapters, shell: (input) => parseShell({ ...input, dialect: nestedDialect ?? dialect }) } });
  };
  syntax.Walk(tree, (node) => {
    if (!node) return true;
    const type = syntax.NodeType(node);
    if (type === "Comment") {
      const start = offset(node.Pos());
      result.comments.push(commentSpan(source, start, offset(node.End()), start === 0 && acceptedShebang));
    }
    if (type === "CallExpr") {
      const command = literal(node.Args[0]);
      const name = command && basename(command.value);
      const selected = name && shellInterpreter(name);
      const grammar = selected ? "shell" : /^python[23]?$/.test(name ?? "") ? "python" : undefined;
      if (["eval", "source", "."].includes(name) || ["node", "ruby", "perl", "env"].includes(name) && node.Args.slice(1).some((word) => /^-(?:[^-]*[ce]|-command)$/.test(literal(word)?.value ?? ""))) {
        defer(node, "executable indirection requires declared grammar and source mapping");
      }
      if (grammar) {
        const flagIndex = node.Args.findIndex((word, index) => index > 0 && literal(word)?.value === "-c");
        if (flagIndex >= 0) {
          const body = literal(node.Args[flagIndex + 1]);
          if (body && flagIndex === 1) embedded(body.value, body.start, grammar, selected);
          else if (flagIndex > 1) defer(node, "interpreter options require declared grammar and source mapping");
          else defer(node, "dynamic interpreter command requires declared source mapping");
        } else if (node.Args.slice(1).some((word) => /^-[^-]*c/.test(literal(word)?.value ?? ""))) {
          defer(node, "combined interpreter options require declared source mapping");
        }
      }
    }
    if (type === "Stmt" && node.Cmd && syntax.NodeType(node.Cmd) === "CallExpr") {
      const command = literal(node.Cmd.Args[0]);
      const name = command && basename(command.value);
      const selected = name && shellInterpreter(name);
      const grammar = selected ? "shell" : /^python[23]?$/.test(name ?? "") ? "python" : undefined;
      for (const redirect of node.Redirs ?? []) {
        if (!redirect.Hdoc || !grammar) continue;
        const start = offset(redirect.Hdoc.Pos());
        const body = redirect.Hdoc.Parts.length === 1 && syntax.NodeType(redirect.Hdoc.Parts[0]) === "Lit" ? redirect.Hdoc.Parts[0].Value : undefined;
        const content = body;
        const delimiter = source.slice(offset(redirect.Word.Pos()), offset(redirect.Word.End()));
        if (content === undefined || !source.startsWith(content, start) || !/^'[^'\n]+'$/.test(delimiter)) defer(redirect, "expanded interpreter heredoc requires declared source mapping");
        else embedded(content, start, grammar, selected);
      }
    }
    return true;
  });
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
