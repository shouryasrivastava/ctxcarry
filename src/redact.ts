const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|JWT_SECRET)\s*=\s*[^\s"'`]+/gi, "$1=[REDACTED]"],
  [/\bDATABASE_URL\s*=\s*postgres:\/\/[^\s"'`]+/gi, "DATABASE_URL=[REDACTED]"],
  [/postgres:\/\/[^:\s"'`]+:[^@\s"'`]+@[^\s"'`]+/gi, "postgres://[REDACTED]"],
  [/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]"],
  [/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"]
];

export function redactText(value: string): string {
  let redacted = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function redactValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactValue(nested)])
    ) as T;
  }
  return value;
}
