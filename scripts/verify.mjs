import process from "node:process";
import { runTool } from "../.harness/runtime/windows-cli.mjs";

const steps = [
  {
    name: "Restore locked dependencies",
    command: "npm",
    args: ["ci", "--ignore-scripts"],
  },
  {
    name: "Production build",
    command: "npm",
    args: ["run", "build"],
  },
  {
    name: "Type checking",
    command: "npm",
    args: ["run", "typecheck"],
  },
  {
    name: "Static analysis",
    command: "npm",
    args: ["run", "lint"],
  },
  {
    name: "Formatting",
    command: "npm",
    args: ["run", "format:check"],
  },
  {
    name: "Behavior tests",
    command: "npm",
    args: ["test"],
  },
  {
    name: "Cross-browser flows",
    command: "npm",
    args: ["run", "test:e2e"],
  },
  {
    name: "Dependency advisories",
    command: "npm",
    args: ["audit", "--audit-level=high"],
  },
  {
    name: "Gitleaks workspace scan",
    command: "gitleaks",
    args: ["dir", "--redact", "--no-banner", "."],
  },
  {
    name: "GitHub Actions security",
    command: "zizmor",
    args: ["."],
  },
];

for (const step of steps) {
  console.log(`\n==> ${step.name}`);
  const options = { cwd: new URL("..", import.meta.url), stdio: "inherit", shell: false };
  const result = runTool(step.command, step.args, options);
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nVerification passed.");
