import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

// Windows tools installed through npm arrive as generated .cmd shims, which Node
// refuses to execute directly. Resolve the shim to the JavaScript entry point it
// wraps so arguments never need to pass through a shell.
const shimEntry = /^.*?"%(?:~dp0|dp0%)([^"\r\n]*?node_modules\\[^"\r\n]+\.(?:[cm]?js))"\s+%\*\s*$/gim;

function resolveWindowsShim(shim) {
  let contents;
  try {
    contents = fs.readFileSync(shim, "utf8");
  } catch {
    return null;
  }
  const entries = [...contents.matchAll(shimEntry)];
  if (entries.length !== 1) return null;

  const relative = entries[0][1].replaceAll("\\", path.sep).replace(/^[/\\]+/, "");
  const requested = path.resolve(path.dirname(shim), relative);
  let script;
  try {
    script = fs.realpathSync(requested);
    if (!fs.statSync(script).isFile()) return null;
  } catch {
    return null;
  }

  const segments = path
    .normalize(script)
    .split(path.sep)
    .map((segment) => segment.toLowerCase());
  if (!segments.includes("node_modules") || !/\.(?:[cm]?js)$/i.test(script)) return null;
  return { command: process.execPath, prefix: [script] };
}

export function resolveWindowsCandidates(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    const lower = candidate.toLowerCase();
    if (lower.endsWith(".exe") || lower.endsWith(".com")) return { command: candidate, prefix: [] };
    if (lower.endsWith(".cmd")) return resolveWindowsShim(candidate);
    if (lower.endsWith(".bat")) return null;
  }
  return null;
}

export function resolveWindowsCli(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9@._+-]+$/.test(name)) return null;
  const lookup = spawnSync("where.exe", [name], { encoding: "utf8" });
  if (lookup.error || lookup.status !== 0) return null;
  const candidates = lookup.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return resolveWindowsCandidates(candidates);
}

export function runTool(command, args, options = {}) {
  if (process.platform === "win32") {
    const resolved = resolveWindowsCli(command);
    if (resolved) {
      return spawnSync(resolved.command, [...resolved.prefix, ...args], { encoding: "utf8", ...options });
    }
  }
  return spawnSync(command, args, { encoding: "utf8", ...options });
}
