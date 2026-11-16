#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoints = ["AGENTS.md", "CLAUDE.md", "CONTEXT-MAP.md"];

function prose(text) {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
}

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

const markdown = (path) => /\.(?:md|mdx|markdown|mdown|mkdn|mkd|mdwn|mdtxt|mdtext|rmd|qmd)$/i.test(path);
const preserved = (path) => /(?:^|\/)docs\/adr\/\d[^/]*\.md$/i.test(path) ||
  /(?:^|\/)(?:LICENSE|COPYING|(?:THIRD-PARTY-)?NOTICES?)(?:\.[^/]*)?$/i.test(path);
const cacheDirectory = (path) => /(?:^|\/)(?:node_modules|\.pnpm-store|\.git|\.turbo|\.gradle)$/.test(path) ||
  /^(?:apps|packages)\/[^/]+\/(?:dist|build|coverage|\.next|\.expo)$/.test(path) ||
  /^(?:apps\/mobile\/(?:ios|android)|packages\/db\/generated)$/.test(path);

function localPath(root, path) {
  const parts = relative(root, path).split(sep);
  if (parts[0] === ".." || parts[0] === "") return parts[0] === "";
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try { if (lstatSync(current).isSymbolicLink()) return false; }
    catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return false; throw error; }
  }
  return true;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function policyBase(root) {
  let ref = "refs/remotes/origin/main";
  if (process.env.GITHUB_ACTIONS === "true") {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    ref = process.env.GITHUB_EVENT_NAME === "pull_request" ? event.pull_request?.base?.sha :
      process.env.GITHUB_EVENT_NAME === "push" ? event.before : undefined;
    if (!/^[a-f0-9]{40}$/.test(ref ?? "") || /^0+$/.test(ref)) throw new Error("missing trusted documentation policy base");
  }
  return git(root, "rev-parse", "--verify", `${ref}^{commit}`).trim();
}

function checkDocumentPolicy(root) {
  const base = policyBase(root);
  const entries = new Map(git(root, "ls-tree", "-rz", base).split("\0").filter(Boolean).map((entry) => {
    const metadata = entry.slice(0, entry.indexOf("\t"));
    const path = entry.slice(entry.indexOf("\t") + 1);
    return [path, metadata.split(" ")];
  }));
  const indexed = new Map(git(root, "ls-files", "--stage", "-z").split("\0").filter(Boolean).map((entry) => {
    const metadata = entry.slice(0, entry.indexOf("\t"));
    const path = entry.slice(entry.indexOf("\t") + 1);
    return [path, metadata.split(" ")];
  }));
  const files = new Set(indexed.keys());
  const errors = [];
  const skills = indexed.get(".agents/skills");
  if (skills?.[0] !== "120000" || git(root, "cat-file", "blob", skills[1]) !== "../.claude/skills") {
    errors.push(".agents/skills must stage the canonical Codex skills symlink");
  }
  const walk = (directory = "") => {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (cacheDirectory(path)) continue;
      if (entry.isDirectory()) walk(path);
      else {
        files.add(path);
        if (entry.isSymbolicLink() && path !== ".agents/skills") errors.push(`first-party symlink is not allowed: ${path}`);
      }
    }
  };
  walk();
  for (const path of files) {
    if (markdown(path) && !entries.has(path)) errors.push(`unauthorized Markdown path: ${path}`);
    if (markdown(path) && indexed.get(path)?.[0] === "120000") errors.push(`Markdown symlink is not allowed: ${path}`);
  }
  for (const [path, [mode, , oid]] of entries) {
    if (!preserved(path)) continue;
    const source = resolve(root, path);
    const staged = indexed.get(path);
    if (!staged || staged[0] !== mode || staged[1] !== oid || !localPath(root, source) ||
      !lstatSync(source).isFile() || !readFileSync(source).equals(execFileSync("git", ["cat-file", "blob", oid], { cwd: root }))) {
      errors.push(`immutable ADR or required notice changed or removed: ${path}`);
    }
  }
  return { errors, files: [...files].filter((path) => localPath(root, resolve(root, path))) };
}

export function checkAgentDocs(root, files) {
  const errors = [];
  const skills = resolve(root, ".agents/skills");
  let skillsLink;
  try { if (localPath(root, dirname(skills)) && lstatSync(skills).isSymbolicLink()) skillsLink = readlinkSync(skills); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (skillsLink !== "../.claude/skills" || !localPath(root, resolve(root, ".claude/skills"))) {
    errors.push(".agents/skills must symlink to ../.claude/skills for Codex discovery");
  }
  const current = files.filter((file) => entryPoints.includes(file) || file === "README.md" ||
    file.startsWith("docs/agents/") && file.endsWith(".md") ||
    file.startsWith(".claude/skills/") && file.endsWith(".md") ||
    file.startsWith(".claude/agents/") && file.endsWith(".md") ||
    /^(apps|packages)\/.+\/CONTEXT\.md$/.test(file));
  for (const file of entryPoints) if (!localPath(root, resolve(root, file))) errors.push(`missing entry point: ${file}`);
  for (const file of current) {
    const source = resolve(root, file);
    if (!localPath(root, source)) continue;
    const text = readFileSync(source, "utf8");
    if (/^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(file) &&
      /^---\n[\s\S]*?^description:\s*(?:[>|][-+]?\s*\n\s*)?["']?deprecated\b/im.test(text)) {
      errors.push(`${file}: deprecated skill still loads its description; delete the skill`);
    }
    for (const link of links(text)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) continue;
      const [path, fragment] = link.split("#");
      let target;
      try { target = path ? resolve(dirname(source), decodeURIComponent(path)) : source; }
      catch { errors.push(`${file}: invalid URL encoding: ${link}`); continue; }
      if (!localPath(root, target)) { errors.push(`${file}: missing link target: ${link}`); continue; }
      if (fragment && target.endsWith(".md") && statSync(target).isFile()) {
        let decoded;
        try { decoded = decodeURIComponent(fragment); }
        catch { errors.push(`${file}: invalid fragment encoding: ${link}`); continue; }
        if (!anchors(readFileSync(target, "utf8")).has(decoded)) errors.push(`${file}: missing heading: ${link}`);
      }
    }
  }
  const loader = resolve(root, "CLAUDE.md");
  if (localPath(root, loader)) {
    const text = readFileSync(loader, "utf8");
    if (!/^@AGENTS\.md\s*$/m.test(text) || !links(text).includes("AGENTS.md")) {
      errors.push("CLAUDE.md must import and link the canonical AGENTS.md policy");
    }
  }
  const map = resolve(root, "CONTEXT-MAP.md");
  if (localPath(root, map)) {
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
  console.log("Documentation visibility: local tracked, staged, untracked and ignored first-party paths; recognized dependency/tool caches pruned. CI sees its checkout, not uncommitted work on other machines or arbitrary external /tmp files; external symlinks are not followed.");
  try {
    const { errors, files } = checkDocumentPolicy(defaultRoot);
    errors.push(...checkAgentDocs(defaultRoot, files));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log("Agent documentation: trusted-base paths, immutable ADRs, required notices, local links, headings, context map, and shared-policy routes pass");
  } catch (error) {
    console.error(`Documentation policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}
