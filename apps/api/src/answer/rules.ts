/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/rules.ts
 * PURPOSE : Read the five rules files (apps/api/rules/*.md) at server
 *           start and merge them into the system prompt. A missing,
 *           empty or too long file stops the server, so the bot never
 *           runs with missing rules.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. List of the five rules files and their length limits
 *    2. Rules reader with checks
 * IF ASKED TO CHANGE:
 *    - Add or rename a rules file (PART 1)
 *    - Length limit of each rules file (6000 characters) (PART 1)
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

// ===== PART 1: List of the five rules files and their length limits =====
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

// ===== PART 2: Rules reader with checks =====
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
