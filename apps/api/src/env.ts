/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/env.ts
 * TUJUAN  : Membaca file .env.api (baris KEY=nilai) ke environment. Nilai
 *           yang sudah diset di environment asli menang, jadi server bisa
 *           memakai secret tanpa file.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pembaca file .env
 * ============================================================================ */

/**
 * Reads KEY=value lines from a file into process.env. A value that is already set in the real environment wins,
 * so a server can set its secrets without any file. The file is git-ignored (see .env.api.example).
 */
import { existsSync, readFileSync } from "node:fs";

// ===== BAGIAN 1: Pembaca file .env =====
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
