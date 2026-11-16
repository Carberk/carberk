import { parse as parseToml } from "smol-toml";
import { commentSpan } from "./markup-spans.mjs";

export function parseConfig({ path, source, fileType, adapters = {} }) {
  const result = { comments: [], deferred: [] };
  const add = (start, end) => result.comments.push(commentSpan(source, start, end));
  const defer = (start, end, reason) => result.deferred.push({ path, fileType, startOffset: start, endOffset: end, reason });
  if (/\r(?!\n)/.test(source)) throw new Error(`${path}: ${fileType} requires LF or CRLF source mapping`);
  if (fileType === "toml") parseToml(source, { integersAsBigInt: true });
  if (["properties", "ini", "systemd", "ignore", "npmrc"].includes(fileType)) {
    let continued = false;
    for (const match of source.matchAll(/[^\n]+|\n/g)) {
      const line = match[0].replace(/\r$/, "");
      if (line === "\n") continue;
      const trimmed = line.trimStart();
      const start = match.index + line.length - trimmed.length;
      const marker = fileType === "properties" ? /^[#!]/ : fileType === "ignore" ? /^#/ : /^[#;]/;
      if ((!continued || fileType === "systemd") && marker.test(trimmed)) {
        add(start, match.index + line.length);
        continue;
      }
      if (fileType === "npmrc") {
        let quote;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === "\\") { i++; continue; }
          if (quote) { if (char === quote) quote = undefined; }
          else if ('"\''.includes(char)) quote = char;
          else if (/[#;]/.test(char)) { add(match.index + i, match.index + line.length); break; }
        }
      }
      if (fileType === "systemd" && /^Exec\w*=/.test(trimmed)) {
        const value = trimmed.slice(trimmed.indexOf("=") + 1);
        if (/(?:^|\s)(?:\S*\/)?(?:ba|da|k|mk)?sh\s+.*-[^-]*c\b/.test(value)) {
          defer(start, match.index + line.length, "systemd interpreter command requires declared grammar and source mapping");
        }
      }
      continued = fileType !== "ignore" && /\\$/.test(line) && (line.match(/\\+$/)[0].length % 2 === 1);
    }
    return result;
  }
  if (fileType === "env") {
    let offset = 0;
    while (offset < source.length) {
      const end = source.indexOf("\n", offset) < 0 ? source.length : source.indexOf("\n", offset);
      const line = source.slice(offset, end).replace(/\r$/, "");
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed) add(offset + line.length - trimmed.length, offset + line.length);
        offset = end + 1; continue;
      }
      const key = line.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*/);
      if (!key) throw new Error(`${path}: env parse failed at ${offset}`);
      let cursor = offset + key[0].length;
      if ('"\''.includes(source[cursor] ?? "\0")) {
        const quote = source[cursor++];
        while (cursor < source.length && source[cursor] !== quote) cursor++;
        if (cursor === source.length) throw new Error(`${path}: unterminated env string`);
        cursor++;
        while (/[ \t\r]/.test(source[cursor] ?? "\0")) cursor++;
        if (source[cursor] && !["#", "\n"].includes(source[cursor])) throw new Error(`${path}: invalid env string suffix`);
      } else while (cursor < source.length && !["#", "\n", "\r"].includes(source[cursor])) cursor++;
      if (source[cursor] === "#") {
        const stop = source.indexOf("\n", cursor);
        const finish = stop < 0 ? source.length : stop - Number(source[stop - 1] === "\r");
        add(cursor, finish); cursor = finish;
      }
      offset = source.indexOf("\n", cursor) < 0 ? source.length : source.indexOf("\n", cursor) + 1;
    }
    return result;
  }
  if (!["toml", "proguard", "caddy", "nginx"].includes(fileType)) throw new Error(`${path}: unsupported configuration grammar ${fileType}`);
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (fileType === "caddy" && source.startsWith("<<", index) && (index === 0 || /\s/.test(source[index - 1]))) {
      const opening = source.slice(index).match(/^<<([A-Za-z0-9_-]+)\r?\n/);
      if (!opening) { defer(index, source.length, "Caddy heredoc marker requires source mapping"); break; }
      const rest = source.slice(index + opening[0].length);
      const closing = rest.match(new RegExp(`(?:^|\\n)[ \t]*${opening[1]}(?=[ \t\r]*(?:\\n|$))`));
      if (!closing) throw new Error(`${path}: unterminated Caddy heredoc`);
      index += opening[0].length + closing.index + closing[0].length - 1;
      continue;
    }
    if (char === "#" && (fileType !== "caddy" || index === 0 || /\s/.test(source[index - 1]))) {
      const start = index;
      while (index < source.length && !/[\r\n]/.test(source[index])) index++;
      add(start, index); index--;
    } else if ((fileType === "caddy" ? '"`' : '"\'').includes(char) &&
      (fileType !== "caddy" || index === 0 || /\s/.test(source[index - 1]))) {
      const quote = fileType === "toml" && source.startsWith(char.repeat(3), index) ? char.repeat(3) : char;
      const begin = index;
      index += quote.length;
      while (index < source.length && !source.startsWith(quote, index)) {
        if (source[index] === "\\" && char !== "'" && char !== "`") index++;
        index++;
      }
      if (index >= source.length) throw new Error(`${path}: unterminated ${fileType} string at ${begin}`);
      if (quote.length === 3) while (source[index + quote.length] === char) index++;
      index += quote.length - 1;
    } else if (char === "\\" && fileType !== "toml") index++;
    else if (["caddy", "nginx"].includes(fileType)) {
      const placeholder = char === "{" && source.slice(index).match(/^\{[\w.$%-]+\}/);
      if (placeholder) { index += placeholder[0].length - 1; continue; }
      if (char === "{") depth++;
      else if (char === "}" && --depth < 0) throw new Error(`${path}: unmatched ${fileType} brace`);

    }
  }
  if (depth) throw new Error(`${path}: unclosed ${fileType} block`);
  return result;
}
