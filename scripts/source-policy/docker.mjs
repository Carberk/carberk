import { DockerfileParser, Keyword } from "dockerfile-ast";
import { commentSpan, embeddedResult } from "./markup-spans.mjs";
import { parseShell, shellInterpreter, shellExecutableOption } from "./shell.mjs";

export function parseDocker({ path, source, fileType, adapters = {} }) {
  if (fileType !== "docker") throw new Error(`${path}: expected configured Docker file type`);
  if (/\r(?!\n)/.test(source)) throw new Error(`${path}: unsupported Docker line delimiter`);
  const tree = DockerfileParser.parse(source);
  if (source.trimEnd().endsWith(tree.getEscapeCharacter())) throw new Error(`${path}: unterminated Docker continuation`);
  const lines = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === "\n") lines.push(index + 1);
  const offset = (position) => lines[position.line] + position.character;
  const bounds = (node) => [offset(node.getRange().start), offset(node.getRange().end)];
  const result = { comments: [], deferred: [] };
  const defer = (start, end, reason, grammar = "docker") => result.deferred.push({ path, fileType: grammar, startOffset: start, endOffset: end, reason });
  const directives = new Set();
  for (const directive of tree.getDirectives()) {
    const [start, end] = bounds(directive);
    const name = directive.getName().toLowerCase();
    const value = directive.getValue();
    if (directives.has(name)) throw new Error(`${path}: duplicate Docker parser directive ${name}`);
    directives.add(name);
    const valid = name === "syntax" ? /^[\w./:@+-]+$/.test(value) : name === "escape" && /^[\\`]$/.test(value);
    if (!valid) throw new Error(`${path}: unsupported Docker parser directive ${name}`);
    result.comments.push(commentSpan(source, start, end, true));
    if (name === "syntax" && !/^docker\/dockerfile(?::1(?:[.\w-]*)?)?$/.test(value)) defer(start, end, "unsupported Docker frontend grammar");
  }
  for (const comment of tree.getComments()) {
    const [start, end] = bounds(comment);
    result.comments.push(commentSpan(source, start, end));
  }
  let dialect = "posix";
  let seenFrom = false;
  const stages = new Map();
  let stage;
  const embedded = (content, offsets, grammar = "shell", selected = dialect) => {
    if (grammar === "shell" && /^#!(?:\/usr\/bin\/env |\/(?:usr\/)?bin\/)python[23]?(?:\r?\n|$)/.test(content)) grammar = "python";
    if (!selected && grammar === "shell") {
      defer(offsets[0], offsets.at(-1), "unsupported Docker SHELL grammar", grammar);
      return;
    }
    embeddedResult({ source, content, offsets, fileType: grammar, path, result,
      adapters: { ...adapters,
        ...(adapters.python ? { python: (input) => adapters.python({ ...input, executable: content.startsWith("#!") }) } : {}),
        shell: (input) => parseShell({ ...input, dialect: selected, executable: content.startsWith("#!") }) } });
  };
  for (const instruction of tree.getInstructions()) {
    let keyword = instruction.getKeyword();
    const [start, end] = bounds(instruction);
    let range = instruction.getArgumentsRange();
    if (!Object.values(Keyword).includes(keyword) || !range) throw new Error(`${path}: malformed or unsupported Docker instruction ${keyword}`);
    let content = "";
    let offsets = [];
    const argumentStart = offset(range.start);
    const argumentEnd = offset(range.end);
    const escape = tree.getEscapeCharacter();
    const bodies = (instruction.getHeredocs?.() ?? []).map((heredoc) => heredoc.getContentRange()).filter(Boolean)
      .map((body) => [offset(body.start), offset(body.end)]);
    for (let index = argumentStart; index < argumentEnd; index++) {
      if (!bodies.some(([begin, finish]) => index >= begin && index < finish) && source[index] === escape && /^(?:\r?\n)/.test(source.slice(index + 1))) {
        index += source[index + 1] === "\r" ? 2 : 1;
        if (index + 1 >= source.length) throw new Error(`${path}: unterminated Docker continuation`);
        continue;
      }
      const comment = result.comments.find((item) => index >= item.startOffset && index < item.endOffset);
      if (comment) {
        index = comment.endOffset;
        if (source[index] === "\r") index++;
        if (source[index] !== "\n") index--;
        continue;
      }
      content += source[index]; offsets.push(index);
    }
    offsets.push(argumentEnd);
    if (keyword === "FROM") {
      const match = content.match(/^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+([\w.-]+))?\s*$/i);
      if (!match) throw new Error(`${path}: malformed Docker FROM`);
      seenFrom = true;
      dialect = stages.has(match[1]) ? stages.get(match[1]) : "posix";
      stage = match[2];
      if (stage) stages.set(stage, dialect);
      continue;
    }
    if (!seenFrom && keyword !== "ARG") throw new Error(`${path}: Docker instruction before FROM`);
    if (keyword === "SHELL") {
      let argv;
      try { argv = JSON.parse(content); } catch { throw new Error(`${path}: malformed Docker SHELL JSON`); }
      if (!Array.isArray(argv) || !argv.length || argv.some((item) => typeof item !== "string")) throw new Error(`${path}: malformed Docker SHELL`);
      dialect = argv.at(-1) === "-c" && argv.slice(1, -1).every((item) => /^(?:-[euxnvfo]+|errexit|nounset|pipefail)$/.test(item)) ? shellInterpreter(argv[0]) : undefined;
      if (!dialect) defer(start, end, "unsupported Docker SHELL invocation");
      if (stage) stages.set(stage, dialect);
      continue;
    }
    if (keyword === "ONBUILD") {
      const match = content.match(/^(RUN|CMD|ENTRYPOINT)\s+/i);
      if (!match) { defer(start, end, "unsupported Docker ONBUILD instruction"); continue; }
      keyword = match[1].toUpperCase(); content = content.slice(match[0].length); offsets = offsets.slice(match[0].length);
    }
    if (keyword === "HEALTHCHECK") {
      if (content === "NONE") continue;
      const match = content.match(/^(?:--[\w-]+=\S+\s+)*CMD\s+/i);
      if (!match) throw new Error(`${path}: malformed Docker HEALTHCHECK`);
      content = content.slice(match[0].length); offsets = offsets.slice(match[0].length);
    } else if (!["RUN", "CMD", "ENTRYPOINT"].includes(keyword)) {
      if (["COPY", "ADD"].includes(keyword)) {
        const heredocs = instruction.getHeredocs();
        for (const heredoc of heredocs) if (!heredoc.getDelimiterRange()) throw new Error(`${path}: unterminated Docker heredoc`);
        if (content.trimStart().startsWith("[")) {
          let argv;
          try { argv = JSON.parse(content); } catch { throw new Error(`${path}: malformed Docker ${keyword} JSON`); }
          if (!Array.isArray(argv) || argv.length < 2 || argv.some((item) => typeof item !== "string" || !item)) throw new Error(`${path}: malformed Docker ${keyword} array`);
          if (!instruction.getFlags().length) continue;
        } else if (heredocs.length === 1 && /^<<-?(?:'[^']+'|"[^"]+"|\w+) +[^\s]+\s*$/.test(content.split(/\r?\n/)[0]) && !instruction.getFlags().length) continue;
      }
      defer(start, end, `Docker ${keyword} syntax requires validation`);
      continue;
    }
    if (content.startsWith("--") || keyword === "RUN" && instruction.getFlags().length) {
      defer(start, end, "Docker executable flags require source mapping");
      continue;
    }
    if (content.trimStart().startsWith("[")) {
      let argv;
      try { argv = JSON.parse(content); } catch { throw new Error(`${path}: malformed Docker executable JSON`); }
      if (!Array.isArray(argv) || !argv.length || argv.some((item) => typeof item !== "string")) throw new Error(`${path}: malformed Docker executable array`);
      const selected = shellInterpreter(argv[0]);
      const interpreter = selected || /(?:python[23]?|node|ruby|perl)$/.test(argv[0]);
      const commandIndex = interpreter ? argv.findIndex((item, index) => index > 0 && shellExecutableOption(item)) : -1;
      if (commandIndex >= 0) {
        const tokens = [...content.matchAll(/"(?:[^"\\]|\\.)*"/g)];
        const token = tokens[commandIndex + 1];
        if (selected && commandIndex === 1 && argv[1] === "-c" && token && !token[0].includes("\\")) {
          const begin = token.index + 1;
          embedded(argv[commandIndex + 1], offsets.slice(begin, begin + argv[commandIndex + 1].length + 1), "shell", selected);
        } else defer(start, end, "encoded executable array requires declared grammar and source mapping");
      }
      continue;
    }
    const heredocs = instruction.getHeredocs?.() ?? [];
    if (heredocs.length) {
      for (const heredoc of heredocs) if (!heredoc.getDelimiterRange()) throw new Error(`${path}: unterminated Docker heredoc`);
      if (heredocs.length === 1 && /^<<-?(?:'[^']+'|"[^"]+"|\w+)\s*\r?\n/.test(content)) {
        const heredoc = heredocs[0];
        const bodyRange = heredoc.getContentRange();
        if (!bodyRange) continue;
        const bodyStart = offset(bodyRange.start);
        const bodyEnd = offset(bodyRange.end);
        const body = source.slice(bodyStart, bodyEnd);
        if (content.startsWith("<<-")) defer(bodyStart, bodyEnd, "tab-stripped Docker heredoc requires source mapping");
        else embedded(body, Array.from({ length: body.length + 1 }, (_, index) => bodyStart + index));
      } else {
        embedded(content, offsets);
      }
    } else {
      if (content.trimEnd().endsWith(escape)) throw new Error(`${path}: unterminated Docker continuation`);
      embedded(content, offsets);
    }
  }
  if (!seenFrom) throw new Error(`${path}: Docker FROM is required`);
  result.comments.sort((a, b) => a.startOffset - b.startOffset);
  return result;
}
