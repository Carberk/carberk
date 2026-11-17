import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { env } from "node:process";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkMobileSpecs, mobileSpecFiles, type LegacyEntry } from "./mobile-spec-policy";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
const manifest = relative(repo, resolve(root, "test/policy/legacy.json")).replaceAll("\\", "/");
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const environment: Record<string, string | undefined> = env;
let base = git("merge-base", "HEAD", "origin/main");
if (environment.GITHUB_ACTIONS === "true") {
  const event = JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH ?? "", "utf8"));
  const trusted = environment.GITHUB_EVENT_NAME === "pull_request" ? event.pull_request?.base?.sha : environment.GITHUB_EVENT_NAME === "push" ? event.before : undefined;
  if (!/^[a-f0-9]{40}$/.test(trusted ?? "") || /^0+$/.test(trusted)) throw new Error("missing trusted mobile spec policy base");
  base = git("rev-parse", "--verify", `${trusted}^{commit}`);
}
const legacy: LegacyEntry[] = JSON.parse(readFileSync(resolve(repo, manifest), "utf8"));
const previous: LegacyEntry[] | undefined = git("ls-tree", "--name-only", base, "--", manifest)
  ? JSON.parse(git("show", `${base}:${manifest}`)) : undefined;
const messages = checkMobileSpecs(root, legacy, previous);
if (messages.length) {
  throw new Error(messages.join("\n"));
} else {
  console.log(`Mobile spec policy: ${mobileSpecFiles(root).length} specs; ${legacy.length} legacy files, ${legacy.reduce((count, entry) => count + entry.rules.length, 0)} exact file/rule allowances; no new violations or stale entries.`);
}
