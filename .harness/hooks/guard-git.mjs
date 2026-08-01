import { execFileSync } from "node:child_process";
import process from "node:process";
import { evaluateHook, parseHookInput } from "./guard-policy.mjs";

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

let rawInput = "";
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  rawInput = Buffer.concat(chunks).toString("utf8");
} catch {
  deny("The safety hook could not parse the tool request, so the operation is denied.");
  process.exit(0);
}
const parsed = parseHookInput(rawInput);
if (parsed.reason) {
  deny(parsed.reason);
  process.exit(0);
}
const input = parsed.input;

const command = input.tool_input?.command ?? input.arguments?.command ?? "";
let currentBranch = "";
if (/\bgit(?:\.exe)?\b[\s\S]*?\bpush\b/i.test(command)) {
  try {
    currentBranch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  } catch {
    currentBranch = "";
  }
}

const reason = evaluateHook(input, currentBranch);
if (reason) deny(reason);
