const tool =
  "(?:Claude|Codex|ChatGPT|Copilot|Cursor|Gemini|Anthropic|OpenAI|GPT(?:-[A-Za-z0-9.]+)?|AI(?: Assistant)?|LLM)";
const patterns = [
  new RegExp(`(?:Co-Authored-By|Assisted-By):[^\\n]*${tool}`, "i"),
  new RegExp(`AI[- ]Assisted-By:[^\\n]*${tool}`, "i"),
  new RegExp(`(?:Generated|Created|Written|Made)\\s+(?:with|by)\\s+(?:an?\\s+)?${tool}`, "i"),
  new RegExp(`Built\\s+by\\s+(?:an?\\s+)?${tool}`, "i"),
  /🤖/u,
];

export function containsAttribution(text) {
  return patterns.some((pattern) => pattern.test(text));
}
