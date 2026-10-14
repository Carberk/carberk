#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root" || !args[1])) {
  const unknownArgument = args[0] !== "--root" ? args[0] : (args[2] ?? args[1] ?? "--root");
  console.error(`- unknown argument "${unknownArgument}"; expected --root <path>`);
  process.exit(1);
}
const repoRoot = args.length === 0 ? defaultRoot : resolve(args[1]);
const glossaryPath = resolve(repoRoot, "docs/domain/GLOSSARY.md");
const maxDefinitionLength = 240;
const allowedHeadings = new Set([
  "Cross-context", "Identity", "Catalog", "Listings", "Subscriptions",
  "Conversations", "Notifications", "Content", "Reports", "Admin",
]);
const forbiddenHeadings = new Set([
  "Future work", "Implementation status", "Roadmap", "Translations",
]);

if (!existsSync(glossaryPath)) {
  console.error("- missing required file docs/domain/GLOSSARY.md");
  process.exit(1);
}

const lines = readFileSync(glossaryPath, "utf8").split(/\r?\n/);
const errors = [];
const canonicalTerms = new Map();
const avoidedTerms = [];
let currentHeading;
let termCount = 0;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const heading = /^## (.+)$/.exec(line);
  if (heading) {
    currentHeading = heading[1];
    if (forbiddenHeadings.has(currentHeading)) {
      errors.push(`line ${index + 1}: forbidden glossary section "${currentHeading}"`);
    } else if (!allowedHeadings.has(currentHeading)) {
      errors.push(`line ${index + 1}: unknown glossary heading "${currentHeading}"`);
    }
    continue;
  }

  const term = /^\*\*(.+)\*\*:?$/.exec(line);
  if (!term) {
    if (line.startsWith("**")) errors.push(`line ${index + 1}: malformed term entry`);
    continue;
  }

  termCount += 1;
  const normalizedTerm = term[1].trim().toLocaleLowerCase("en-US");
  if (canonicalTerms.has(normalizedTerm)) {
    errors.push(`line ${index + 1}: duplicate canonical term "${term[1]}" (first defined on line ${canonicalTerms.get(normalizedTerm)})`);
  } else {
    canonicalTerms.set(normalizedTerm, index + 1);
  }
  if (!currentHeading) errors.push(`line ${index + 1}: term "${term[1]}" is not under a known heading`);

  const followingLines = lines.slice(index + 1);
  const definitionOffset = followingLines.findIndex((candidate) => candidate.trim() !== "");
  const definition = definitionOffset === -1 ? undefined : followingLines[definitionOffset];
  if (!definition || definition.startsWith("_Avoid_:") || definition.startsWith("## ") || definition.startsWith("**")) {
    errors.push(`line ${index + 1}: term "${term[1]}" needs a definition`);
    continue;
  }

  const sentenceCount = definition.match(/[.!?](?:\s|$)/g)?.length ?? 0;
  if (sentenceCount < 1 || sentenceCount > 2) {
    errors.push(`line ${index + 1}: definition for "${term[1]}" must contain one or two sentences`);
  }
  if (definition.length > maxDefinitionLength) {
    errors.push(`line ${index + 1}: definition for "${term[1]}" must be ${maxDefinitionLength} characters or fewer`);
  }

  const avoidLine = followingLines.slice(definitionOffset + 1).find((candidate) => candidate.trim() !== "");
  if (avoidLine?.startsWith("_Avoid_:")) {
    for (const synonym of avoidLine.slice("_Avoid_:".length).split(",")) {
      const trimmed = synonym.trim();
      if (trimmed) avoidedTerms.push({ line: index + definitionOffset + 3, normalized: trimmed.toLocaleLowerCase("en-US"), synonym: trimmed });
    }
  }
}

if (termCount === 0) errors.push("glossary must define at least one canonical term");
for (const avoided of avoidedTerms) {
  const canonicalLine = canonicalTerms.get(avoided.normalized);
  if (canonicalLine) {
    const canonicalName = lines[canonicalLine - 1].replace(/^\*\*|\*\*:?$/g, "");
    errors.push(`line ${avoided.line}: avoided synonym "${avoided.synonym}" collides with canonical term "${canonicalName}"`);
  }
}

function requireReference(relativePath, requiredText, diagnostic) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path) || !readFileSync(path, "utf8").includes(requiredText)) errors.push(diagnostic);
}

function requireMarkdownLink(relativePath, requiredTarget, diagnostic) {
  const sourcePath = resolve(repoRoot, relativePath);
  if (!existsSync(sourcePath)) {
    errors.push(diagnostic);
    return;
  }

  const targets = [...readFileSync(sourcePath, "utf8").matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1]);
  const targetPath = resolve(dirname(sourcePath), requiredTarget);
  if (!targets.includes(requiredTarget) || !existsSync(targetPath)) errors.push(diagnostic);
}

const packagePath = resolve(repoRoot, "package.json");
let packageJson;
if (existsSync(packagePath)) {
  try { packageJson = JSON.parse(readFileSync(packagePath, "utf8")); }
  catch { errors.push("package.json is not valid JSON"); }
}
if (packageJson?.scripts?.["check:glossary"] !== "node scripts/check-domain-glossary.mjs") {
  errors.push("package.json is missing the check:glossary script");
}
// The root gate may add checks or change their order. Require these steps as
// standalone &&-chained commands so each failure still stops the test gate.
const testScript = typeof packageJson?.scripts?.test === "string" ? packageJson.scripts.test : "";
const testSteps = testScript.split(/\s*&&\s*/).map((step) => step.trim());
const hasOtherShellOperator = /[;|\r\n]/.test(testScript) || testScript.replaceAll("&&", "").includes("&");
if (hasOtherShellOperator || !["pnpm test:agent-docs", "pnpm test:glossary", "turbo run test"].every((step) => testSteps.includes(step))) {
  errors.push("package.json root test gate must run agent-docs, glossary, and workspace tests");
}
requireMarkdownLink("docs/domain/GLOSSARY.md", "../adr/0042-domain-glossary-authority-and-mutability.md", "docs/domain/GLOSSARY.md is missing its ADR-0042 link");
requireMarkdownLink("docs/adr/0042-domain-glossary-authority-and-mutability.md", "../domain/GLOSSARY.md", "ADR-0042 is missing or has a broken docs/domain/GLOSSARY.md link");
requireMarkdownLink("docs/adr/README.md", "0042-domain-glossary-authority-and-mutability.md", "docs/adr/README.md is missing the ADR-0042 link");
for (const [number, target] of [
  ["0019", "0019-context-md-describes-current-state.md"],
  ["0020", "0020-document-hierarchy-and-mutability.md"],
  ["0040", "0040-repo-canonical-workflow-skills.md"],
]) {
  requireMarkdownLink("docs/adr/0042-domain-glossary-authority-and-mutability.md", target, `ADR-0042 has a broken ADR-${number} link`);
}
for (const workflow of ["ci.yml", "pr-checks.yml"]) {
  requireReference(`.github/workflows/${workflow}`, "pnpm check:glossary", `.github/workflows/${workflow} is missing pnpm check:glossary`);
}

for (const [source, target, diagnostic] of [
  [".claude/skills/shape-with-docs/SKILL.md", "../../../docs/domain/GLOSSARY.md", "shape-with-docs is missing its glossary link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../../../docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md", "shape-with-docs is missing its ADR-0060 link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../../../docs/adr/0020-document-hierarchy-and-mutability.md", "shape-with-docs is missing its ADR-0020 link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../../../docs/adr/0042-domain-glossary-authority-and-mutability.md", "shape-with-docs is missing its ADR-0042 link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../../../docs/agents/coding-workflow.md", "shape-with-docs is missing its workflow-router link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../new-adr/SKILL.md", "shape-with-docs is missing its new-adr link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../create-sprint-issues/SKILL.md", "shape-with-docs is missing its create-sprint-issues link"],
  [".claude/skills/shape-with-docs/SKILL.md", "../run-issue/SKILL.md", "shape-with-docs is missing its run-issue link"],
  ["docs/agents/coding-workflow.md", "../domain/GLOSSARY.md", "coding workflow is missing its glossary link"],
  ["docs/agents/coding-workflow.md", "../../.claude/skills/shape-with-docs/SKILL.md", "coding workflow is missing its shaping-skill link"],
  ["docs/agents/coding-workflow.md", "../../.claude/skills/create-sprint-issues/SKILL.md", "coding workflow is missing its sprint-issue-creation link"],
  ["docs/agents/coding-workflow.md", "../../.claude/skills/run-issue/SKILL.md", "coding workflow is missing its issue-execution link"],
  ["docs/agents/coding-workflow.md", "../../.claude/skills/run-queue/SKILL.md", "coding workflow is missing its Chief of Staff link"],
  [".claude/skills/run-queue/SKILL.md", "../../../docs/agents/coding-workflow.md", "Chief of Staff is missing its authoritative workflow link"],
  ["docs/agents/domain.md", "../domain/GLOSSARY.md", "domain documentation is missing its glossary link"],
  ["AGENTS.md", "docs/domain/GLOSSARY.md", "AGENTS.md is missing its glossary link"],
  ["AGENTS.md", "docs/agents/coding-workflow.md", "AGENTS.md is missing its workflow-router link"],
  ["CLAUDE.md", "AGENTS.md", "CLAUDE.md is missing its shared-policy link"],
  [".claude/skills/create-sprint-issues/SKILL.md", "../../../docs/domain/GLOSSARY.md", "create-sprint-issues is missing its glossary link"],
  ["docs/agents/issue-tracker.md", "../domain/GLOSSARY.md", "issue tracker guidance is missing its glossary link"],
  [".claude/skills/run-issue/SKILL.md", "../../../docs/domain/GLOSSARY.md", "run-issue is missing its glossary link"],
  [".claude/skills/resume-issue/SKILL.md", "../../../docs/domain/GLOSSARY.md", "resume-issue is missing its glossary link"],
  [".claude/skills/design-grill/SKILL.md", "../../../docs/domain/GLOSSARY.md", "design-grill is missing its glossary link"],
  [".claude/skills/wireframe/SKILL.md", "../../../docs/domain/GLOSSARY.md", "wireframe is missing its glossary link"],
  [".claude/skills/hifi-design/SKILL.md", "../../../docs/domain/GLOSSARY.md", "hifi-design is missing its glossary link"],
  [".claude/skills/run-issue/FINALIZATION.md", "../../../docs/domain/GLOSSARY.md", "run-issue finalization is missing its glossary link"],
  [".claude/skills/resume-issue/SKILL.md", "../run-issue/FINALIZATION.md", "resume-issue is missing its fixed-commit finalization link"],
]) {
  requireMarkdownLink(source, target, diagnostic);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Domain glossary: ok (${termCount} terms)`);
}
