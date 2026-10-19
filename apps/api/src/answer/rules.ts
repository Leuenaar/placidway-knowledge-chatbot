/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/rules.ts
 * TUJUAN  : Membaca lima file aturan (apps/api/rules/*.md) saat server start
 *           lalu menggabungkannya ke system prompt. File hilang, kosong, atau
 *           terlalu panjang menghentikan server, jadi bot tidak pernah jalan
 *           dengan aturan yang kurang.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Daftar lima file aturan dan batas panjang
 *    2. Pembaca aturan dengan pemeriksaan
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah atau menamai ulang file aturan (BAGIAN 1)
 *    - Batas panjang tiap file aturan (6000 karakter) (BAGIAN 1)
 * ============================================================================ */

/**
 * The answer rules live in five plain text files in apps/api/rules/, one per stage of the conversation. They are read
 * once when the server starts and joined into the system prompt, so a reviewer can read or change the rules without
 * touching any code. Anything the program depends on (the JSON shape the server parses) stays in code, not in these files.
 *
 * A missing, empty or oversized file stops the server at startup: a bot must never run with part of its rules missing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AnswerError } from "./config";

// ===== BAGIAN 1: Daftar lima file aturan dan batas panjang =====
export const RULE_GROUPS = [
  { key: "conversation", file: "1-conversation.md" },
  { key: "scope", file: "2-scope.md" },
  { key: "grounding", file: "3-grounding.md" },
  { key: "answer", file: "4-answer.md" },
  { key: "claims", file: "5-claims.md" },
] as const;

export type RuleKey = (typeof RULE_GROUPS)[number]["key"];
export type Rules = Record<RuleKey, string>;

const MAX_RULE_CHARS = 6000;

export const DEFAULT_RULES_DIR = fileURLToPath(new URL("../../rules/", import.meta.url));

// ===== BAGIAN 2: Pembaca aturan dengan pemeriksaan =====
export function loadRules(dir: string = DEFAULT_RULES_DIR, read: (path: string) => string = (p) => readFileSync(p, "utf8")): Rules {
  const rules = {} as Rules;
  for (const { key, file } of RULE_GROUPS) {
    let text: string;
    try {
      text = read(join(dir, file)).trim();
    } catch {
      throw new AnswerError(`The rule file ${file} could not be read (looked in ${dir})`);
    }
    if (text.length === 0) throw new AnswerError(`The rule file ${file} is empty`);
    if (text.length > MAX_RULE_CHARS) throw new AnswerError(`The rule file ${file} is too long (${text.length} characters, the limit is ${MAX_RULE_CHARS})`);
    rules[key] = text;
  }
  return rules;
}
