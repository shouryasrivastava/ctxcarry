import path from "node:path";

export const HANDOFF_DIR = ".handoff";

export function rootPath(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

export function handoffPath(...parts: string[]): string {
  return rootPath(HANDOFF_DIR, ...parts);
}
