export type ContentKind = "log" | "diff" | "transcript" | "command" | "summary" | "unknown";

export interface RoutedContent {
  kind: ContentKind;
  summary: string;
  signals: string[];
}

export function routeContent(label: string, content: string): RoutedContent {
  const kind = detectKind(label, content);
  if (kind === "log" || kind === "command") {
    return summarizeLog(content, kind);
  }
  if (kind === "diff") {
    return summarizeDiff(content);
  }
  if (kind === "transcript" || kind === "summary") {
    return summarizeTranscript(content, kind);
  }
  return {
    kind,
    summary: firstLines(content, 8),
    signals: []
  };
}

function detectKind(label: string, content: string): ContentKind {
  const lower = `${label}\n${content.slice(0, 2000)}`.toLowerCase();
  if (lower.includes("diff --git") || lower.includes(" files changed") || lower.includes("insertions(+)")) {
    return "diff";
  }
  if (/(\bfail\b|\berror\b|exception|stack trace|at .*:\d+:\d+)/i.test(content)) {
    return label.includes("command") ? "command" : "log";
  }
  if (/^##\s+(current task|files changed|decisions|constraints|failures|commands run|next step)/im.test(content)) {
    return "summary";
  }
  if (/\b(user|assistant|tool):/i.test(content)) {
    return "transcript";
  }
  return "unknown";
}

function summarizeLog(content: string, kind: ContentKind): RoutedContent {
  const lines = uniqueLines(content);
  const error = lines.find((line) => /(?:error:|expected|received|exception|timeout|fatal)/i.test(line));
  const failingTest = lines.find((line) => /\.(?:test|spec)\.[tj]sx?/i.test(line));
  const appFrame = lines.find((line) => /\bat .*?(?:src|app|lib|components|tests)\//.test(line));
  const command = lines.find((line) => /^(?:pnpm|npm|yarn|bun|cargo|pytest|go test|swift test)\b/.test(line));
  const signals = [error, failingTest, appFrame, command].filter((line): line is string => Boolean(line));
  return {
    kind,
    summary: signals.length > 0 ? signals.join("; ") : firstLines(lines.join("\n"), 6),
    signals
  };
}

function summarizeDiff(content: string): RoutedContent {
  const files = uniqueLines(content)
    .map((line) => {
      const git = line.match(/^diff --git a\/(.+?) b\//);
      if (git) return git[1];
      const stat = line.match(/^(.+?)\s+\|\s+\d+/);
      if (stat) return stat[1].trim();
      return "";
    })
    .filter(Boolean);
  return {
    kind: "diff",
    summary: files.length > 0 ? `Changed files: ${files.slice(0, 25).join(", ")}` : firstLines(content, 8),
    signals: files
  };
}

function summarizeTranscript(content: string, kind: ContentKind): RoutedContent {
  const lines = uniqueLines(content);
  const signals = lines.filter((line) => /(?:decision|constraint|failure|next step|current task|do not|failed|fix|todo)/i.test(line)).slice(0, 20);
  return {
    kind,
    summary: signals.length > 0 ? signals.join("\n") : firstLines(lines.join("\n"), 10),
    signals
  };
}

function firstLines(content: string, count: number): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join("\n");
}

function uniqueLines(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of content.split("\n").map((item) => item.trim()).filter(Boolean)) {
    const normalized = line.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(line);
  }
  return result;
}
