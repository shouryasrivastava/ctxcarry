import fs from "node:fs";
import path from "node:path";
import { redactText } from "./redact.js";
import { routeContent } from "./content-router.js";

export interface ArchivedArtifact {
  artifactId: string;
  path: string;
  kind: string;
  summary: string;
}

export function archiveSessionArtifact(sessionDir: string, name: string, content: string): ArchivedArtifact {
  const rawDir = path.join(sessionDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const artifactId = name.replace(/[^a-z0-9_.-]/gi, "-").toLowerCase();
  const artifactPath = path.join(rawDir, artifactId);
  const redacted = redactText(content);
  fs.writeFileSync(artifactPath, redacted.endsWith("\n") ? redacted : `${redacted}\n`);
  const routed = routeContent(name, redacted);
  return {
    artifactId,
    path: artifactPath,
    kind: routed.kind,
    summary: routed.summary
  };
}
