import path from "node:path";

export const CTXCARRY_DIR = ".ctxcarry";

export function rootPath(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

export function ctxcarryPath(...parts: string[]): string {
  return rootPath(CTXCARRY_DIR, ...parts);
}
