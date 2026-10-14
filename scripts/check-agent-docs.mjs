#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoints = ["AGENTS.md", "CLAUDE.md", "CONTEXT-MAP.md"];

function prose(text) {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
}

// Current docs use inline links. Support encoded/angle-wrapped paths and one
// balanced parenthesis pair, including Next.js route-group directory names.
function links(text) {
  return [...prose(text).matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|(?:[^\s()]|\([^()]*\))+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, ""));
}

function anchors(text) {
  const result = new Set();
  const seen = new Map();
  for (const match of prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = match[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    result.add(count ? `${slug}-${count}` : slug);
    seen.set(slug, count + 1);
  }
  for (const match of text.matchAll(/(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}

export function checkAgentDocs(root, files) {
  const errors = [];
  const current = files.filter((file) => entryPoints.includes(file) || file === "README.md" ||
    file.startsWith("docs/agents/") && file.endsWith(".md") ||
    file.startsWith(".claude/skills/") && file.endsWith(".md") ||
    file.startsWith(".claude/agents/") && file.endsWith(".md") ||
    /^(apps|packages)\/.+\/CONTEXT\.md$/.test(file));
  for (const file of entryPoints) if (!existsSync(resolve(root, file))) errors.push(`missing entry point: ${file}`);
  for (const file of current) {
    const source = resolve(root, file);
    if (!existsSync(source)) continue;
    for (const link of links(readFileSync(source, "utf8"))) {
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) continue;
      const [path, fragment] = link.split("#");
      let target;
      try { target = path ? resolve(dirname(source), decodeURIComponent(path)) : source; }
      catch { errors.push(`${file}: invalid URL encoding: ${link}`); continue; }
      if (!existsSync(target)) { errors.push(`${file}: missing link target: ${link}`); continue; }
      if (fragment && target.endsWith(".md") && statSync(target).isFile()) {
        let decoded;
        try { decoded = decodeURIComponent(fragment); }
        catch { errors.push(`${file}: invalid fragment encoding: ${link}`); continue; }
        if (!anchors(readFileSync(target, "utf8")).has(decoded)) errors.push(`${file}: missing heading: ${link}`);
      }
    }
  }
  const loader = resolve(root, "CLAUDE.md");
  if (existsSync(loader)) {
    const text = readFileSync(loader, "utf8");
    if (!/^@AGENTS\.md\s*$/m.test(text) || !links(text).includes("AGENTS.md")) {
      errors.push("CLAUDE.md must import and link the canonical AGENTS.md policy");
    }
  }
  const map = resolve(root, "CONTEXT-MAP.md");
  if (existsSync(map)) {
    const targets = new Set(links(readFileSync(map, "utf8")).map((link) => {
      try { return relative(root, resolve(dirname(map), decodeURIComponent(link.split("#")[0]))); }
      catch { return link; }
    }));
    for (const context of files.filter((file) => /^(apps|packages)\/.+\/CONTEXT\.md$/.test(file))) {
      if (!targets.has(context)) errors.push(`CONTEXT-MAP.md omits ${context}`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: defaultRoot, encoding: "utf8" }).split("\0").filter(Boolean);
  const errors = checkAgentDocs(defaultRoot, [...new Set(files)]);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Agent documentation: local links, headings, context map, and shared-policy route pass");
}
