import { commentSpan, embeddedResult } from "./markup-spans.mjs";
import { parseShell, shellInterpreter } from "./shell.mjs";

export function parseMake({ path, source, fileType, adapters = {} }) {
  if (fileType !== "make") throw new Error(`${path}: expected configured Make file type`);
  const result = { comments: [], deferred: [] };
  const lines = [...source.matchAll(/[^\n]*\n|[^\n]+$/g)].map((match) => ({ text: match[0], start: match.index }));
  const unsupported = /^\s*(?:(?:override\s+|export\s+|private\s+)?define\b|endef\b|ifn?def\b|ifn?eq\b|else\b|endif\b|-?include\b|sinclude\b|\.RECIPEPREFIX\s*[:?+!]?=|\.ONESHELL\s*:)/m;
  if (unsupported.test(source)) {
    result.deferred.push({ path, fileType, startOffset: 0, endOffset: source.length, reason: "Make control, include, define or recipe mode requires expansion-aware parsing" });
    return result;
  }
  let dialect = "posix";
  let recipeContext = false;
  const defer = (start, end, reason) => result.deferred.push({ path, fileType, startOffset: start, endOffset: end, reason });
  const recipe = (parts) => {
    let content = "";
    const offsets = [];
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      let strip = part.text.startsWith("\t") ? 1 : 0;
      if (partIndex === 0) while (/[+@-]/.test(part.text[strip] ?? "") && strip < part.text.length) strip++;
      for (let index = strip; index < part.text.length; index++) {
        content += part.text[index]; offsets.push(part.start + index);
      }
    }
    offsets.push(parts.at(-1).start + parts.at(-1).text.length);
    let expanded = "";
    const mapped = [];
    for (let index = 0; index < content.length; index++) {
      if (content[index] === "$" && content[index + 1] !== "$") {
        defer(offsets[0], offsets.at(-1), "Make recipe expansion requires declared source mapping");
        return;
      }
      expanded += content[index]; mapped.push(offsets[index]);
      if (content[index] === "$") index++;
    }
    mapped.push(offsets.at(-1));
    if (!dialect) { defer(offsets[0], offsets.at(-1), "unsupported Make SHELL grammar"); return; }
    embeddedResult({ source, content: expanded, offsets: mapped, path, fileType: "shell", result,
      adapters: { ...adapters, shell: (input) => parseShell({ ...input, dialect }) } });
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.text.startsWith("\t")) {
      if (!recipeContext) throw new Error(`${path}:${index + 1}: Make recipe without a rule`);
      const parts = [line];
      while (/\\\r?\n$/.test(parts.at(-1).text)) {
        if (++index >= lines.length) throw new Error(`${path}: unterminated Make recipe continuation`);
        parts.push(lines[index]);
      }
      recipe(parts);
      continue;
    }
    let text = line.text;
    while (/\\\r?\n$/.test(text)) {
      if (++index >= lines.length) throw new Error(`${path}: unterminated Make continuation`);
      text += lines[index].text;
    }
    if (!text.trim()) continue;
    let hash = -1;
    for (let cursor = 0; cursor < text.length; cursor++) {
      if (text[cursor] !== "#") continue;
      let backslashes = 0;
      for (let before = cursor - 1; before >= 0 && text[before] === "\\"; before--) backslashes++;
      if (backslashes % 2 === 0) { hash = cursor; break; }
    }
    const semicolon = text.indexOf(";");
    const colon = text.indexOf(":");
    const assignment = text.match(/^\s*(?:export\s+|override\s+|private\s+)?([\w.-]+)\s*(:::=|::=|:=|\?=|\+=|!=|=)/);
    if (!assignment && /:\s*(?:(?:export|override|private)\s+)?[\w.-]+\s*(?::=|\?=|\+=|!=|=)/.test(text)) {
      defer(line.start, line.start + text.length, "Make target-specific assignment requires expansion-aware parsing");
      recipeContext = true;
      dialect = undefined;
      continue;
    }
    const inlineRecipe = !assignment && colon >= 0 && semicolon > colon && (hash < 0 || semicolon < hash);
    if (/\$/.test(inlineRecipe ? text.slice(0, semicolon) : text.slice(0, hash < 0 ? text.length : hash))) {
      defer(line.start, line.start + text.length, "Make expansion requires expansion-aware parsing");
      recipeContext = !assignment && colon >= 0;
      if (assignment && ["SHELL", ".SHELLFLAGS"].includes(assignment[1])) dialect = undefined;
      continue;
    }
    if (hash >= 0 && !inlineRecipe) {
      const end = text.replace(/\r?\n$/, "").length;
      result.comments.push(commentSpan(source, line.start + hash, line.start + end));
      text = text.slice(0, hash);
    }
    if (!text.trim()) continue;
    if (assignment) {
      recipeContext = false;
      const value = text.slice(assignment[0].length).trim();
      if (assignment[1] === "SHELL") dialect = ["=", ":="].includes(assignment[2]) ? shellInterpreter(value) : undefined;
      if (["SHELL", ".SHELLFLAGS"].includes(assignment[1]) && !["=", ":="].includes(assignment[2])) {
        dialect = undefined;
        defer(line.start, line.start + text.length, "Make interpreter assignment operator requires expansion-aware parsing");
      }
      if (assignment[1] === ".SHELLFLAGS" && !/^(?:[-\w]+\s+)*-[a-zA-Z]*c$/.test(value)) {
        dialect = undefined;
        defer(line.start, line.start + text.length, "unsupported Make interpreter flags");
      }
      if (assignment[2] === "!=") defer(line.start, line.start + text.length, "Make shell assignment requires declared source mapping");
      continue;
    }
    if (colon < 1 || /[\r\n]/.test(text.trimEnd())) throw new Error(`${path}:${index + 1}: malformed or unsupported Make statement`);
    recipeContext = true;
    if (inlineRecipe) recipe([{ text: text.slice(semicolon + 1).replace(/^ */, ""), start: line.start + semicolon + 1 + (text.slice(semicolon + 1).match(/^ */)[0].length) }]);
  }
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
