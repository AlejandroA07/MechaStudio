function containsSensitivePath(value) {
  const normalized = value.replaceAll("\\", "/");
  const envMatches = normalized.match(/(?:^|[\/\s"'])\.env(?:\.[a-zA-Z0-9_-]+)*/g) ?? [];
  for (const match of envMatches) {
    const name = match.trim().replace(/^['"]/, "").split("/").at(-1).toLowerCase();
    if (![".env.example", ".env.sample", ".env.template"].includes(name)) return true;
  }
  return (
    /(?:^|\/)(?:id_rsa[^/]*|id_ed25519[^/]*|[^/]+\.(?:pem|key|p12|pfx))(?=$|[\s"';&|<>()])/i.test(normalized) ||
    /(?:^|\/)\.(?:ssh|aws|azure|kube|gnupg|config\/gcloud)(?:\/|$)/i.test(normalized) ||
    /(?:^|\/)\.claude\/\.credentials\.json(?=$|[\s"';&|<>()])/i.test(normalized) ||
    /(?:^|\/)\.config\/gh\/hosts\.yml(?=$|[\s"';&|<>()])/i.test(normalized) ||
    /(?:^|\/)\.docker\/config\.json(?=$|[\s"';&|<>()])/i.test(normalized) ||
    /(?:^|\/)\.npmrc(?=$|[\s"';&|<>()])/i.test(normalized) ||
    /(?:^|[\/\s"'])(?:service[-_.]?account(?:[-_.]key)?|application_default_credentials)\.json(?=$|[\s"';&|<>()])/i.test(
      normalized,
    )
  );
}

function shellWords(value) {
  const words = [];
  const pattern = /"((?:\\.|[^"])*)"|'([^']*)'|([^\s]+)/g;
  for (const match of value.matchAll(pattern)) words.push(match[1] ?? match[2] ?? match[3]);
  return words;
}

function gitInvocations(command) {
  const invocations = [];
  const pattern = /\bgit(?:\.exe)?\b([^\r\n;&|<>]*)/gi;
  for (const match of command.matchAll(pattern)) {
    const words = shellWords(match[1]);
    let index = 0;
    while (index < words.length && words[index].startsWith("-")) {
      const option = words[index].toLowerCase();
      index += 1;
      if (["-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"].includes(option) && !option.includes("="))
        index += 1;
    }
    if (index < words.length)
      invocations.push({ subcommand: words[index].toLowerCase(), args: words.slice(index + 1) });
  }
  return invocations;
}

function hasFlag(args, shortName, longName) {
  return args.some(
    (arg) =>
      arg.toLowerCase() === longName ||
      (arg.startsWith("-") && !arg.startsWith("--") && arg.slice(1).toLowerCase().includes(shortName)),
  );
}

function destructiveGitReason(command) {
  for (const { subcommand, args } of gitInvocations(command)) {
    const lower = args.map((arg) => arg.toLowerCase());
    if (subcommand === "reset" && lower.some((arg) => ["--hard", "--merge", "--keep"].includes(arg)))
      return "destructive git reset mode";
    if (subcommand === "clean" && hasFlag(args, "f", "--force")) return "git clean --force";
    if (
      subcommand === "branch" &&
      (args.includes("-D") || (hasFlag(args, "d", "--delete") && hasFlag(args, "f", "--force")))
    )
      return "forced git branch deletion";
    if (subcommand === "checkout" && (hasFlag(args, "f", "--force") || lower.includes(".")))
      return "destructive whole-worktree checkout";
    if (subcommand === "restore" && lower.includes(".")) return "destructive whole-worktree restore";
    if (subcommand === "rm" && lower.includes(".") && hasFlag(args, "r", "--recursive"))
      return "recursive git removal of the whole worktree";
    if (subcommand === "stash" && lower[0] === "clear") return "git stash clear";
    if (subcommand === "worktree" && lower[0] === "remove" && hasFlag(args, "f", "--force"))
      return "forced git worktree removal";
  }
  return null;
}

function exposesCredentialMaterial(command) {
  return (
    /\bgh(?:\.exe)?\b[^\r\n;&|<>]*\bauth\s+token\b/i.test(command) ||
    /(?:^|[\s;&|<>])(printenv|export\s+-p)(?=$|[\s;&|<>])/i.test(command) ||
    /(?:^|[\s;&|<>])env\s*(?=$|[;&|<>])/i.test(command) ||
    /\b(?:Get-ChildItem|gci|dir|ls)\s+Env:\s*(?=$|[;&|<>])/i.test(command) ||
    /\bGet-Item\s+Env:\*\s*(?=$|[;&|<>])/i.test(command)
  );
}

export function parseHookInput(raw) {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return { reason: "The safety hook could not parse the tool request, so the operation is denied." };
  }
  const toolInputValid = input?.tool_input && typeof input.tool_input === "object" && !Array.isArray(input.tool_input);
  const argumentsValid = input?.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments);
  if (!input || typeof input !== "object" || (!toolInputValid && !argumentsValid)) {
    return { reason: "The safety hook received an incomplete tool request, so the operation is denied." };
  }
  return { input };
}

export function evaluateCommitBranch(branch) {
  if (!branch) return "Commits from detached HEAD are blocked. Switch to a feature/<topic> or research/<topic> branch.";
  if (!/^(?:feature|research)\/[a-zA-Z0-9._/-]+$/.test(branch)) {
    return `Branch '${branch}' is not eligible for agent commits. Use feature/<topic>, or research/<topic> for an approved Wayfinder research task.`;
  }
  return null;
}

export function evaluateHook(input, currentBranch = "") {
  const toolInput = input.tool_input ?? input.arguments ?? {};
  const command = typeof toolInput.command === "string" ? toolInput.command.trim() : "";
  const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : "";

  if (filePath && containsSensitivePath(filePath)) {
    return "Reading secret-bearing files is blocked. Use the project secret mechanism; example/template env files remain readable.";
  }
  if (!command) return null;
  if (containsSensitivePath(command)) {
    return "Commands that reference secret-bearing files are blocked. Do not read or print secrets.";
  }
  if (exposesCredentialMaterial(command))
    return "Commands that print credential or environment material are blocked. Request only a specific non-secret value when needed.";

  const destructiveReason = destructiveGitReason(command);
  if (destructiveReason)
    return `${destructiveReason} is permanently blocked for agents because it can destroy user work.`;

  if (/\bgit(?:\.exe)?\b[\s\S]*?\bpush\b/i.test(command)) {
    const allowed = command.match(
      /^git(?:\.exe)?\s+push\s+(?:(?:-u|--set-upstream)\s+)?origin\s+(research\/[a-zA-Z0-9._/-]+)$/i,
    );
    if (!allowed) {
      return "Feature pushes are blocked. The only agent-eligible form is an explicitly approved `git push origin research/<name>` with no force, tags, deletion, mirror, or extra refspecs.";
    }
    if (!currentBranch || currentBranch.toLowerCase() !== allowed[1].toLowerCase()) {
      return `The pushed research branch must be the current branch (${currentBranch || "detached HEAD"}).`;
    }
  }
  return null;
}
