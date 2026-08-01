import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { evaluateCommitBranch } from "./guard-policy.mjs";

function git(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `git ${args.join(" ")} failed\n`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

const branch = git(["branch", "--show-current"]).trim();
const branchReason = evaluateCommitBranch(branch);
if (branchReason) {
  console.error(`[pre-commit] ${branchReason}`);
  process.exit(1);
}

const staged = git(["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean);
if (process.platform === "win32") {
  const stagedHooks = [".githooks/pre-commit", ".githooks/commit-msg"].filter(
    (filePath) => staged.includes(filePath) && existsSync(filePath),
  );
  if (stagedHooks.length > 0) git(["update-index", "--chmod=+x", "--", ...stagedHooks]);
}
const secretPath = staged.find((filePath) => {
  const normalized = filePath.replaceAll("\\", "/");
  const name = normalized.split("/").at(-1).toLowerCase();
  if ([".env.example", ".env.sample", ".env.template"].includes(name)) return false;
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    /^(?:id_rsa|id_ed25519)/i.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name)
  );
});
if (secretPath) {
  console.error(`[pre-commit] Secret-bearing path cannot be committed: ${secretPath}`);
  process.exit(1);
}

const gitleaks = spawnSync("gitleaks", ["git", "--pre-commit", "--staged", "--redact", "-v"], { stdio: "inherit" });
if (gitleaks.error?.code === "ENOENT") {
  console.error("[pre-commit] gitleaks is required; the hook fails closed when it is unavailable.");
  process.exit(1);
}
if (gitleaks.status !== 0) process.exit(gitleaks.status ?? 1);
