import fs from "node:fs";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { containsAttribution } from "./attribution-policy.mjs";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: node check-attribution.mjs <text-file> [...]");
  process.exit(2);
}

const texts = [];
for (let index = 0; index < paths.length; index += 1) {
  if (paths[index] === "--github-event") {
    const event = JSON.parse(fs.readFileSync(paths[++index], "utf8"));
    texts.push(event.pull_request?.title ?? "", event.pull_request?.body ?? "", event.head_commit?.message ?? "");
    for (const commit of event.commits ?? []) texts.push(commit.message ?? "");
    const base = event.pull_request?.base?.sha ?? event.before;
    const head = event.pull_request?.head?.sha ?? event.after;
    if (base && head && !/^0+$/.test(base)) {
      try {
        texts.push(execFileSync("git", ["log", "--format=%B", `${base}..${head}`], { encoding: "utf8" }));
      } catch {
        /* event metadata is still checked */
      }
    }
  } else {
    texts.push(fs.readFileSync(paths[index], "utf8"));
  }
}

let failed = false;
for (const text of texts) {
  if (containsAttribution(text)) {
    console.error("Explicit AI attribution is not allowed in Git metadata.");
    failed = true;
  }
}
if (failed) process.exit(1);
