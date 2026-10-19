/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/env.ts
 * PURPOSE : Read the .env.api file (KEY=value lines) into the environment.
 *           Values already set in the real environment win, so the server can
 *           use secrets without a file.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Reader for the .env file
 * ============================================================================ */

/**
 * Reads KEY=value lines from a file into process.env. A value that is already set in the real environment wins,
 * so a server can set its secrets without any file. The file is git-ignored (see .env.api.example).
 */
import { existsSync, readFileSync } from "node:fs";

// ===== PART 1: Reader for the .env file =====
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
  }
}
